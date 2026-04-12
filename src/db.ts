import { Database } from "bun:sqlite";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const isTest = process.env.RIL_TEST === "1";

const isBunTest = process.argv.some(
  (arg) => arg.includes("bun") && arg.includes("test"),
);
if (isBunTest && !isTest) {
  console.error(
    "Warning: Running under bun test without RIL_TEST=1. Using in-memory DB for safety.",
  );
}

const useTestDb = isTest || isBunTest;
const DATA_DIR = useTestDb
  ? "/tmp/ril-test"
  : join(homedir(), ".read-it-later");
const LEGACY_DATA_DIR = join(homedir(), ".shelf");
const DB_PATH = useTestDb ? ":memory:" : join(DATA_DIR, "read-it-later.db");
const REPLICA_PATH = join(DATA_DIR, "replica.db");
const CONFIG_PATH = join(DATA_DIR, "config.json");

export interface Config {
  timezone?: string;
  backend?: "local" | "turso";
  turso?: {
    url: string;
    authToken: string;
  };
}

export function loadConfig(): Config {
  try {
    if (existsSync(CONFIG_PATH)) {
      return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch {
    // Ignore parse errors
  }
  return {};
}

export function saveConfig(config: Config): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  chmodSync(CONFIG_PATH, 0o600);
}

let _config: Config | null = null;
export function getConfig(): Config {
  if (_config === null) {
    _config = loadConfig();
  }
  return _config;
}

export function updateConfig(updates: Partial<Config>): Config {
  const config = { ...loadConfig(), ...updates };
  saveConfig(config);
  _config = config;
  return config;
}

if (DB_PATH !== ":memory:") {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }

  // Auto-migrate from legacy ~/.shelf/ to ~/.read-it-later/
  const legacyDbPath = join(LEGACY_DATA_DIR, "shelf.db");
  if (existsSync(legacyDbPath) && !existsSync(DB_PATH)) {
    copyFileSync(legacyDbPath, DB_PATH);

    const legacyConfigPath = join(LEGACY_DATA_DIR, "config.json");
    if (existsSync(legacyConfigPath) && !existsSync(CONFIG_PATH)) {
      copyFileSync(legacyConfigPath, CONFIG_PATH);
    }

    console.log(`Migrated data from ${LEGACY_DATA_DIR} to ${DATA_DIR}`);
  }
}

// --- DbClient abstraction ---

export interface DbClient {
  run(sql: string, ...params: any[]): Promise<void>;
  get<T = any>(sql: string, ...params: any[]): Promise<T | null>;
  all<T = any>(sql: string, ...params: any[]): Promise<T[]>;
  close(): void;
}

class LocalDbClient implements DbClient {
  private db: Database;

  constructor(path: string) {
    this.db = new Database(path);
  }

  async run(sql: string, ...params: any[]): Promise<void> {
    if (params.length === 0) {
      this.db.run(sql);
    } else {
      this.db.prepare(sql).run(...params);
    }
  }

  async get<T = any>(sql: string, ...params: any[]): Promise<T | null> {
    return (this.db.prepare(sql).get(...params) as T) ?? null;
  }

  async all<T = any>(sql: string, ...params: any[]): Promise<T[]> {
    return this.db.query(sql).all(...params) as T[];
  }

  close(): void {
    this.db.close();
  }
}

export class TursoDbClient implements DbClient {
  private client: import("@libsql/client").Client;

  constructor(client: import("@libsql/client").Client) {
    this.client = client;
  }

  async run(sql: string, ...params: any[]): Promise<void> {
    await this.client.execute({ sql, args: params });
  }

  async get<T = any>(sql: string, ...params: any[]): Promise<T | null> {
    const result = await this.client.execute({ sql, args: params });
    if (result.rows.length === 0) return null;
    return rowToObject<T>(result.rows[0]!, result.columns);
  }

  async all<T = any>(sql: string, ...params: any[]): Promise<T[]> {
    const result = await this.client.execute({ sql, args: params });
    return result.rows.map((row) => rowToObject<T>(row, result.columns));
  }

  close(): void {
    this.client.close();
  }
}

function rowToObject<T>(
  row: import("@libsql/client").Row,
  columns: string[],
): T {
  const obj: any = {};
  for (let i = 0; i < columns.length; i++) {
    obj[columns[i]!] = row[i];
  }
  return obj as T;
}

// --- Singleton ---

let _db: DbClient | null = null;

export function getTursoCredentials(): {
  url: string;
  authToken: string;
} | null {
  const envUrl = process.env.TURSO_DATABASE_URL;
  const envToken = process.env.TURSO_AUTH_TOKEN;
  if (envUrl && envToken) {
    return { url: envUrl, authToken: envToken };
  }

  const config = getConfig();
  if (config.turso?.url && config.turso?.authToken) {
    return config.turso;
  }

  return null;
}

export async function getDb(): Promise<DbClient> {
  if (_db) return _db;

  const config = getConfig();
  const backend = useTestDb ? "local" : config.backend || "local";

  if (backend === "turso") {
    const creds = getTursoCredentials();
    if (!creds) {
      console.error("Turso backend configured but no credentials found.");
      console.error(
        "Run `ril setup` or set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN env vars.",
      );
      process.exit(1);
    }

    const { createClient } = await import("@libsql/client");
    const client = createClient({
      url: `file:${REPLICA_PATH}`,
      syncUrl: creds.url,
      authToken: creds.authToken,
      syncInterval: 60,
    });
    _db = new TursoDbClient(client);
  } else {
    _db = new LocalDbClient(DB_PATH);
  }

  return _db;
}

export async function initDb() {
  const db = await getDb();

  await db.run(`
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
  `);

  await db.run("CREATE INDEX IF NOT EXISTS idx_items_status ON items(status)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_items_type ON items(type)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_items_added ON items(added_at)");
}

export function getDbPath(): string {
  return DB_PATH;
}

export function getReplicaPath(): string {
  return REPLICA_PATH;
}
