import { Database } from "bun:sqlite";
import { type DbClient, getConfig, getDbPath, getReplicaPath } from "./db";

interface ItemRow {
  id: number;
  url: string;
  title: string | null;
  type: string;
  tags: string | null;
  notes: string | null;
  status: string;
  added_at: string;
  read_at: string | null;
}

async function createTursoClient(): Promise<DbClient> {
  const config = getConfig();
  const envUrl = process.env.TURSO_DATABASE_URL;
  const envToken = process.env.TURSO_AUTH_TOKEN;
  const url = envUrl || config.turso?.url;
  const authToken = envToken || config.turso?.authToken;

  if (!url || !authToken) {
    throw new Error("Turso credentials not found");
  }

  const { createClient } = await import("@libsql/client");
  const client = createClient({
    url: `file:${getReplicaPath()}`,
    syncUrl: url,
    authToken,
    syncInterval: 60,
  });

  const { TursoDbClient } = await getTursoWrapper();
  return new TursoDbClient(client);
}

async function getTursoWrapper() {
  class TursoDbClient implements DbClient {
    constructor(private client: import("@libsql/client").Client) {}

    async run(sql: string, ...params: any[]): Promise<void> {
      await this.client.execute({ sql, args: params });
    }

    async get<T = any>(sql: string, ...params: any[]): Promise<T | null> {
      const result = await this.client.execute({ sql, args: params });
      if (result.rows.length === 0) return null;
      const obj: any = {};
      for (let i = 0; i < result.columns.length; i++) {
        obj[result.columns[i]!] = result.rows[0]![i];
      }
      return obj as T;
    }

    async all<T = any>(sql: string, ...params: any[]): Promise<T[]> {
      const result = await this.client.execute({ sql, args: params });
      return result.rows.map((row) => {
        const obj: any = {};
        for (let i = 0; i < result.columns.length; i++) {
          obj[result.columns[i]!] = row[i];
        }
        return obj as T;
      });
    }

    close(): void {
      this.client.close();
    }
  }

  return { TursoDbClient };
}

function createLocalClient(): {
  all: <T>(sql: string) => T[];
  run: (sql: string, ...params: any[]) => void;
  close: () => void;
} {
  const db = new Database(getDbPath());
  return {
    all: <T>(sql: string) => db.query(sql).all() as T[],
    run: (sql: string, ...params: any[]) => {
      if (params.length === 0) db.run(sql);
      else db.prepare(sql).run(...params);
    },
    close: () => db.close(),
  };
}

const CREATE_ITEMS_TABLE = `
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    title TEXT,
    type TEXT NOT NULL DEFAULT 'article',
    tags TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'unread',
    added_at TEXT DEFAULT CURRENT_TIMESTAMP,
    read_at TEXT
  )
`;

export async function migrateLocalToTurso() {
  console.log("\n  Migrating local data to Turso...\n");

  const local = createLocalClient();
  const turso = await createTursoClient();

  await turso.run(CREATE_ITEMS_TABLE);

  const items = local.all<ItemRow>("SELECT * FROM items");

  console.log(`  Found: ${items.length} items`);

  for (const item of items) {
    await turso.run(
      "INSERT OR REPLACE INTO items (id, url, title, type, tags, notes, status, added_at, read_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      item.id,
      item.url,
      item.title,
      item.type,
      item.tags,
      item.notes,
      item.status,
      item.added_at,
      item.read_at,
    );
  }

  local.close();
  turso.close();

  console.log("  Migration complete!\n");
}

export async function migrateTursoToLocal() {
  console.log("\n  Migrating Turso data to local...\n");

  const turso = await createTursoClient();
  const local = createLocalClient();

  local.run(CREATE_ITEMS_TABLE);

  const items = await turso.all<ItemRow>("SELECT * FROM items");

  console.log(`  Found: ${items.length} items`);

  for (const item of items) {
    local.run(
      "INSERT OR REPLACE INTO items (id, url, title, type, tags, notes, status, added_at, read_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      item.id,
      item.url,
      item.title,
      item.type,
      item.tags,
      item.notes,
      item.status,
      item.added_at,
      item.read_at,
    );
  }

  turso.close();
  local.close();

  console.log("  Migration complete!\n");
}
