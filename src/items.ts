import { getDb } from "./db";

export interface Item {
  id: number;
  url: string;
  title: string | null;
  type: "video" | "article" | "bookmark";
  tags: string | null;
  notes: string | null;
  status: "unread" | "read";
  added_at: string;
  read_at: string | null;
}

const VIDEO_PATTERNS = [
  /youtube\.com/i,
  /youtu\.be/i,
  /vimeo\.com/i,
  /tiktok\.com/i,
  /instagram\.com\/reel/i,
  /instagram\.com\/p\//i,
  /netflix\.com/i,
  /twitch\.tv/i,
  /dailymotion\.com/i,
  /wistia\.com/i,
  /loom\.com/i,
];

export function detectType(url: string, isBookmark: boolean): Item["type"] {
  if (isBookmark) return "bookmark";

  for (const pattern of VIDEO_PATTERNS) {
    if (pattern.test(url)) return "video";
  }

  return "article";
}

export async function fetchTitle(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; shelf-cli/1.0)",
      },
      redirect: "follow",
    });

    if (!response.ok) return null;

    const html = await response.text();

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch?.[1]) {
      return titleMatch[1].trim().slice(0, 500);
    }

    const ogMatch = html.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    );
    if (ogMatch?.[1]) {
      return ogMatch[1].trim().slice(0, 500);
    }

    return null;
  } catch {
    return null;
  }
}

export async function addItem(
  url: string,
  options: {
    title?: string;
    tags?: string;
    notes?: string;
    isBookmark?: boolean;
  } = {},
): Promise<Item> {
  const db = await getDb();
  const type = detectType(url, options.isBookmark || false);

  let title: string | null = options.title || null;
  if (!title) {
    title = await fetchTitle(url);
  }

  return (await db.get<Item>(
    "INSERT INTO items (url, title, type, tags, notes) VALUES (?, ?, ?, ?, ?) RETURNING *",
    url,
    title,
    type,
    options.tags ?? null,
    options.notes ?? null,
  ))!;
}

export async function getItem(idOrUrl: string | number): Promise<Item | null> {
  const db = await getDb();
  return db.get<Item>(
    "SELECT * FROM items WHERE id = ? OR url = ?",
    idOrUrl,
    idOrUrl,
  );
}

export async function listItems(
  options: {
    type?: Item["type"];
    status?: Item["status"];
    tag?: string;
    limit?: number;
  } = {},
): Promise<Item[]> {
  const db = await getDb();
  let query = "SELECT * FROM items WHERE 1=1";
  const params: any[] = [];

  if (options.type) {
    query += " AND type = ?";
    params.push(options.type);
  }

  if (options.status) {
    query += " AND status = ?";
    params.push(options.status);
  }

  if (options.tag) {
    query += " AND tags LIKE ?";
    params.push(`%${options.tag}%`);
  }

  query += " ORDER BY added_at DESC";

  if (options.limit) {
    query += " LIMIT ?";
    params.push(options.limit);
  }

  return db.all<Item>(query, ...params);
}

export async function markDone(idOrUrl: string | number): Promise<boolean> {
  const item = await getItem(idOrUrl);
  if (!item) return false;

  const db = await getDb();
  const now = new Date().toISOString();
  await db.run(
    "UPDATE items SET status = 'read', read_at = ? WHERE id = ?",
    now,
    item.id,
  );
  return true;
}

export async function markUnread(idOrUrl: string | number): Promise<boolean> {
  const item = await getItem(idOrUrl);
  if (!item) return false;

  const db = await getDb();
  await db.run(
    "UPDATE items SET status = 'unread', read_at = NULL WHERE id = ?",
    item.id,
  );
  return true;
}

export async function updateItem(
  idOrUrl: string | number,
  updates: {
    tags?: string;
    notes?: string;
    title?: string;
    type?: Item["type"];
  },
): Promise<boolean> {
  const item = await getItem(idOrUrl);
  if (!item) return false;

  const setClauses: string[] = [];
  const params: any[] = [];

  if (updates.tags !== undefined) {
    setClauses.push("tags = ?");
    params.push(updates.tags);
  }
  if (updates.notes !== undefined) {
    setClauses.push("notes = ?");
    params.push(updates.notes);
  }
  if (updates.title !== undefined) {
    setClauses.push("title = ?");
    params.push(updates.title);
  }
  if (updates.type !== undefined) {
    setClauses.push("type = ?");
    params.push(updates.type);
  }

  if (setClauses.length === 0) return true;

  const db = await getDb();
  params.push(item.id);
  await db.run(
    `UPDATE items SET ${setClauses.join(", ")} WHERE id = ?`,
    ...params,
  );

  return true;
}

export async function deleteItem(idOrUrl: string | number): Promise<boolean> {
  const item = await getItem(idOrUrl);
  if (!item) return false;

  const db = await getDb();
  await db.run("DELETE FROM items WHERE id = ?", item.id);
  return true;
}

export async function searchItems(
  query: string,
  limit: number = 20,
): Promise<Item[]> {
  const db = await getDb();
  const pattern = `%${query}%`;
  return db.all<Item>(
    "SELECT * FROM items WHERE title LIKE ? OR url LIKE ? OR tags LIKE ? OR notes LIKE ? ORDER BY added_at DESC LIMIT ?",
    pattern,
    pattern,
    pattern,
    pattern,
    limit,
  );
}

export async function getHistory(
  options: { days?: number; weeks?: number; month?: string } = {},
): Promise<Item[]> {
  const db = await getDb();
  let startDate: string;

  if (options.month) {
    const month = Number.parseInt(options.month.slice(0, 2), 10);
    const year = 2000 + Number.parseInt(options.month.slice(2, 4), 10);
    startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = new Date(year, month, 0).toISOString().split("T")[0];

    return db.all<Item>(
      "SELECT * FROM items WHERE status = 'read' AND read_at >= ? AND read_at <= ? ORDER BY read_at DESC",
      startDate,
      `${endDate}T23:59:59`,
    );
  }

  const now = new Date();
  if (options.weeks) {
    now.setDate(now.getDate() - options.weeks * 7);
  } else {
    now.setDate(now.getDate() - (options.days || 7));
  }
  startDate = now.toISOString();

  return db.all<Item>(
    "SELECT * FROM items WHERE status = 'read' AND read_at >= ? ORDER BY read_at DESC",
    startDate,
  );
}

export async function getTags(): Promise<{ tag: string; count: number }[]> {
  const db = await getDb();
  const items = await db.all<{ tags: string }>(
    "SELECT tags FROM items WHERE tags IS NOT NULL AND tags != ''",
  );

  const tagCounts: Record<string, number> = {};

  for (const item of items) {
    const tags = item.tags.split(",").map((t) => t.trim().toLowerCase());
    for (const tag of tags) {
      if (tag) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
  }

  return Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getRecent(days: number = 30): Promise<Item[]> {
  const db = await getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);

  return db.all<Item>(
    "SELECT * FROM items WHERE added_at >= ? ORDER BY added_at DESC",
    since.toISOString(),
  );
}
