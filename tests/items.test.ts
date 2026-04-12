import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { getDb, initDb } from "../src/db";
import {
  addItem,
  deleteItem,
  getItem,
  getTags,
  listItems,
  markDone,
  markUnread,
  searchItems,
  updateItem,
} from "../src/items";

beforeAll(async () => {
  await initDb();
});

beforeEach(async () => {
  const db = await getDb();
  await db.run("DELETE FROM items");
});

describe("addItem", () => {
  test("adds an article", async () => {
    const item = await addItem("https://example.com/article", {
      title: "Test Article",
      tags: "test,article",
    });

    expect(item.id).toBeGreaterThan(0);
    expect(item.url).toBe("https://example.com/article");
    expect(item.title).toBe("Test Article");
    expect(item.type).toBe("article");
    expect(item.tags).toBe("test,article");
    expect(item.status).toBe("unread");
  });

  test("adds a video (auto-detected)", async () => {
    const item = await addItem("https://youtube.com/watch?v=abc123", {
      title: "Test Video",
    });

    expect(item.type).toBe("video");
  });

  test("adds a bookmark", async () => {
    const item = await addItem("https://youtube.com/watch?v=abc123", {
      title: "Saved Video",
      isBookmark: true,
    });

    expect(item.type).toBe("bookmark");
  });

  test("adds with notes", async () => {
    const item = await addItem("https://example.com/post", {
      title: "Post",
      notes: "Important notes here",
    });

    expect(item.notes).toBe("Important notes here");
  });
});

describe("getItem", () => {
  test("gets item by id", async () => {
    const added = await addItem("https://example.com/test", { title: "Test" });
    const item = await getItem(added.id);

    expect(item).not.toBeNull();
    expect(item!.id).toBe(added.id);
  });

  test("gets item by url", async () => {
    await addItem("https://example.com/test", { title: "Test" });
    const item = await getItem("https://example.com/test");

    expect(item).not.toBeNull();
    expect(item!.url).toBe("https://example.com/test");
  });

  test("returns null for non-existent item", async () => {
    const item = await getItem(99999);
    expect(item).toBeNull();
  });
});

describe("listItems", () => {
  test("lists all items", async () => {
    await addItem("https://youtube.com/watch?v=1", { title: "Video 1" });
    await addItem("https://example.com/article", { title: "Article 1" });
    await addItem("https://tool.com", { title: "Tool", isBookmark: true });

    const result = await listItems();
    expect(result.length).toBe(3);
  });

  test("filters by type", async () => {
    await addItem("https://youtube.com/watch?v=1", { title: "Video 1" });
    await addItem("https://example.com/article", { title: "Article 1" });

    const videos = await listItems({ type: "video" });
    expect(videos.length).toBe(1);
    expect(videos[0]!.type).toBe("video");
  });

  test("filters by tag", async () => {
    await addItem("https://example.com/ai", {
      title: "AI Post",
      tags: "ai,ml",
    });
    await addItem("https://example.com/web", {
      title: "Web Post",
      tags: "web",
    });

    const aiItems = await listItems({ tag: "ai" });
    expect(aiItems.length).toBe(1);
    expect(aiItems[0]!.tags).toContain("ai");
  });

  test("respects limit", async () => {
    await addItem("https://example.com/1", { title: "Item 1" });
    await addItem("https://example.com/2", { title: "Item 2" });
    await addItem("https://example.com/3", { title: "Item 3" });

    const result = await listItems({ limit: 2 });
    expect(result.length).toBe(2);
  });
});

describe("markDone / markUnread", () => {
  test("marks item as done", async () => {
    const item = await addItem("https://example.com/read", {
      title: "To Read",
    });
    expect(item.status).toBe("unread");

    const result = await markDone(item.id);
    expect(result).toBe(true);

    const updated = await getItem(item.id);
    expect(updated!.status).toBe("read");
    expect(updated!.read_at).not.toBeNull();
  });

  test("marks item as unread", async () => {
    const item = await addItem("https://example.com/unread", {
      title: "Was Read",
    });
    await markDone(item.id);

    const result = await markUnread(item.id);
    expect(result).toBe(true);

    const updated = await getItem(item.id);
    expect(updated!.status).toBe("unread");
    expect(updated!.read_at).toBeNull();
  });

  test("returns false for non-existent item", async () => {
    expect(await markDone(99999)).toBe(false);
    expect(await markUnread(99999)).toBe(false);
  });
});

describe("updateItem", () => {
  test("updates tags", async () => {
    const item = await addItem("https://example.com/update", {
      title: "Update Me",
    });

    await updateItem(item.id, { tags: "new,tags" });

    const updated = await getItem(item.id);
    expect(updated!.tags).toBe("new,tags");
  });

  test("updates notes", async () => {
    const item = await addItem("https://example.com/notes", {
      title: "Notes Test",
    });

    await updateItem(item.id, { notes: "New notes" });

    const updated = await getItem(item.id);
    expect(updated!.notes).toBe("New notes");
  });

  test("updates title", async () => {
    const item = await addItem("https://example.com/title", {
      title: "Old Title",
    });

    await updateItem(item.id, { title: "New Title" });

    const updated = await getItem(item.id);
    expect(updated!.title).toBe("New Title");
  });

  test("updates type", async () => {
    const item = await addItem("https://example.com/type", {
      title: "Type Test",
    });
    expect(item.type).toBe("article");

    await updateItem(item.id, { type: "bookmark" });

    const updated = await getItem(item.id);
    expect(updated!.type).toBe("bookmark");
  });
});

describe("deleteItem", () => {
  test("deletes an item", async () => {
    const item = await addItem("https://example.com/delete", {
      title: "Delete Me",
    });

    const result = await deleteItem(item.id);
    expect(result).toBe(true);

    const deleted = await getItem(item.id);
    expect(deleted).toBeNull();
  });

  test("returns false for non-existent item", async () => {
    expect(await deleteItem(99999)).toBe(false);
  });
});

describe("searchItems", () => {
  test("searches by title", async () => {
    await addItem("https://example.com/ai", {
      title: "AI Article",
      tags: "ai,ml",
    });
    await addItem("https://example.com/web", {
      title: "Web Development",
      tags: "web",
    });

    const results = await searchItems("AI");
    expect(results.length).toBe(1);
    expect(results[0]!.title).toContain("AI");
  });

  test("searches by tags", async () => {
    await addItem("https://example.com/ai", {
      title: "AI Article",
      tags: "ai,ml",
    });
    await addItem("https://example.com/web", {
      title: "Web Development",
      tags: "web",
    });

    const results = await searchItems("ml");
    expect(results.length).toBe(1);
    expect(results[0]!.tags).toContain("ml");
  });

  test("respects limit", async () => {
    await addItem("https://example.com/1", { title: "Example 1" });
    await addItem("https://example.com/2", { title: "Example 2" });
    await addItem("https://example.com/3", { title: "Example 3" });

    const results = await searchItems("example", 2);
    expect(results.length).toBe(2);
  });
});

describe("getTags", () => {
  test("returns tag counts", async () => {
    await addItem("https://example.com/t1", { title: "T1", tags: "ai,ml" });
    await addItem("https://example.com/t2", { title: "T2", tags: "ai,web" });
    await addItem("https://example.com/t3", { title: "T3", tags: "web" });

    const tags = await getTags();
    expect(tags.length).toBe(3);
  });

  test("counts tags correctly", async () => {
    await addItem("https://example.com/t1", { title: "T1", tags: "ai,ml" });
    await addItem("https://example.com/t2", { title: "T2", tags: "ai,web" });
    await addItem("https://example.com/t3", { title: "T3", tags: "web" });

    const tags = await getTags();
    const aiTag = tags.find((t) => t.tag === "ai");
    const webTag = tags.find((t) => t.tag === "web");
    const mlTag = tags.find((t) => t.tag === "ml");

    expect(aiTag?.count).toBe(2);
    expect(webTag?.count).toBe(2);
    expect(mlTag?.count).toBe(1);
  });

  test("sorts by count descending", async () => {
    await addItem("https://example.com/t1", { title: "T1", tags: "common" });
    await addItem("https://example.com/t2", { title: "T2", tags: "common" });
    await addItem("https://example.com/t3", {
      title: "T3",
      tags: "common,rare",
    });

    const tags = await getTags();
    expect(tags[0]!.tag).toBe("common");
    expect(tags[0]!.count).toBe(3);
  });
});
