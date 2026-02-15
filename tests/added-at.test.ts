import { describe, test, expect, beforeEach } from "bun:test";
import { db, initDb } from "../src/db";
import { addItem, getItem, listItems } from "../src/items";

// Initialize db once
initDb();

// Clear before each test for isolation
beforeEach(() => {
  db.run("DELETE FROM items");
});

describe("added_at timestamp", () => {
  test("should set added_at when adding item", async () => {
    const before = new Date().getTime();
    const item = await addItem("https://example.com/article", {
      title: "Test Article",
    });
    const after = new Date().getTime();

    // Check that added_at exists and is a valid timestamp
    expect(item.added_at).toBeDefined();
    expect(item.added_at).not.toBeNull();
    
    // Parse the timestamp and verify it's reasonable
    const addedTime = new Date(item.added_at).getTime();
    expect(addedTime).toBeGreaterThanOrEqual(before - 1000); // Allow 1s buffer
    expect(addedTime).toBeLessThanOrEqual(after + 1000);
  });

  test("should retrieve added_at from database", async () => {
    const item = await addItem("https://example.com/article", {
      title: "Test Article",
    });

    // Fetch the item fresh from DB
    const fetched = getItem(item.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.added_at).toBeDefined();
    expect(fetched!.added_at).not.toBeNull();
    expect(fetched!.added_at).toBe(item.added_at);
  });

  test("should have different added_at for items added at different times", async () => {
    const item1 = await addItem("https://example.com/1", { title: "First" });
    
    // Need >1s delay because SQLite CURRENT_TIMESTAMP has second precision
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const item2 = await addItem("https://example.com/2", { title: "Second" });

    expect(item1.added_at).not.toBe(item2.added_at);
  });

  test("should return ISO-like string format", async () => {
    const item = await addItem("https://example.com/article", {
      title: "Test Article",
    });

    // Should be in format: "2026-02-07 12:34:56"
    expect(item.added_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  test("listItems should include added_at", async () => {
    await addItem("https://example.com/1", { title: "First" });
    await addItem("https://example.com/2", { title: "Second" });

    const items = listItems();
    expect(items.length).toBe(2);
    
    for (const item of items) {
      expect(item.added_at).toBeDefined();
      expect(item.added_at).not.toBeNull();
    }
  });

  test("should order by added_at DESC", async () => {
    const item1 = await addItem("https://example.com/1", { title: "First" });
    await new Promise(resolve => setTimeout(resolve, 50));
    const item2 = await addItem("https://example.com/2", { title: "Second" });

    const items = listItems();
    expect(items[0].id).toBe(item2.id); // Most recent first
    expect(items[1].id).toBe(item1.id);
  });
});
