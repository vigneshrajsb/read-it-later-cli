import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { getDb, initDb } from "../src/db";
import { addItem, getItem, listItems } from "../src/items";

beforeAll(async () => {
  await initDb();
});

beforeEach(async () => {
  const db = await getDb();
  await db.run("DELETE FROM items");
});

describe("added_at timestamp", () => {
  test("should set added_at when adding item", async () => {
    const before = Date.now();
    const item = await addItem("https://example.com/article", {
      title: "Test Article",
    });
    const after = Date.now();

    expect(item.added_at).toBeDefined();
    expect(item.added_at).not.toBeNull();

    const addedTime = new Date(item.added_at).getTime();
    expect(addedTime).toBeGreaterThanOrEqual(before - 1000);
    expect(addedTime).toBeLessThanOrEqual(after + 1000);
  });

  test("should retrieve added_at from database", async () => {
    const item = await addItem("https://example.com/article", {
      title: "Test Article",
    });

    const fetched = await getItem(item.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.added_at).toBeDefined();
    expect(fetched!.added_at).not.toBeNull();
    expect(fetched!.added_at).toBe(item.added_at);
  });

  test("should have different added_at for items added at different times", async () => {
    const item1 = await addItem("https://example.com/1", { title: "First" });

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const item2 = await addItem("https://example.com/2", { title: "Second" });

    expect(item1.added_at).not.toBe(item2.added_at);
  });

  test("should return ISO-like string format", async () => {
    const item = await addItem("https://example.com/article", {
      title: "Test Article",
    });

    expect(item.added_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  test("listItems should include added_at", async () => {
    await addItem("https://example.com/1", { title: "First" });
    await addItem("https://example.com/2", { title: "Second" });

    const result = await listItems();
    expect(result.length).toBe(2);

    for (const item of result) {
      expect(item.added_at).toBeDefined();
      expect(item.added_at).not.toBeNull();
    }
  });

  test("should order by added_at DESC", async () => {
    const item1 = await addItem("https://example.com/1", { title: "First" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const item2 = await addItem("https://example.com/2", { title: "Second" });

    const result = await listItems();
    expect(result[0].id).toBe(item2.id);
    expect(result[1].id).toBe(item1.id);
  });
});
