#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { getConfig, getDbPath, getReplicaPath, initDb } from "./db";
import * as items from "./items";

const VERSION = JSON.parse(
  readFileSync(join(import.meta.dir, "../package.json"), "utf-8"),
).version;

const HELP = `
ril - Read It Later CLI for saving and organizing URLs

USAGE:
  ril <command> [options]

COMMANDS:
  add <url>                 Add a URL (auto-detects type)
  reading                   Show reading list (articles + videos)
  bookmarks                 Show saved bookmarks
  list                      List all items (default: unread)
  done <id>                 Mark item as read/watched
  undone <id>               Mark item as unread
  search <query>            Search across title, url, tags, notes
  tags                      List all tags with counts
  history                   Show recently completed items
  recent [days]             Show recently added items
  edit <id>                 Edit item (tags/notes/title/type)
  delete <id>               Delete an item

  setup                     Interactive backend setup wizard
  config                    Show current config
  db                        Show database info

OPTIONS:
  --bookmark, -b            Save as bookmark (reference, not to consume)
  --tags, -t <tags>         Comma-separated tags
  --notes, -n <text>        Add a note
  --type <type>             Filter by type (video|article|bookmark)
  --status <status>         Filter by status (unread|read)
  --tag <tag>               Filter by tag
  --articles                Filter reading list to articles only
  --videos                  Filter reading list to videos only
  --days <n>                History: last N days (default: 7)
  --weeks <n>               History: last N weeks
  --month <mmyy>            History: specific month (e.g., 0226)
  --json                    Output as JSON
  --version, -v             Show version
  --help, -h                Show this help

EXAMPLES:
  ril add "https://youtube.com/watch?v=abc"
  ril add "https://turbotax.com" --bookmark --tags "tax"
  ril reading
  ril reading --videos
  ril bookmarks
  ril done 3
  ril search "machine learning"
  ril history --days 7
  ril setup
`;

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function typeEmoji(type: string): string {
  switch (type) {
    case "video":
      return "🎬";
    case "bookmark":
      return "🔖";
    default:
      return "📄";
  }
}

function statusEmoji(status: string): string {
  return status === "read" ? "✅" : "⬜";
}

function truncate(str: string | null, len: number): string {
  if (!str) return "";
  return str.length > len ? `${str.slice(0, len - 1)}…` : str;
}

function printItem(item: items.Item, showStatus: boolean = true) {
  const status = showStatus ? `${statusEmoji(item.status)} ` : "";
  const type = typeEmoji(item.type);
  const tags = item.tags ? ` [${item.tags}]` : "";

  if (item.title) {
    console.log(
      `${status}${item.id}. ${type} ${truncate(item.title, 60)}${tags}`,
    );
    console.log(`     ${item.url}`);
  } else {
    console.log(`${status}${item.id}. ${type} ${item.url}${tags}`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(HELP);
    return;
  }

  if (args[0] === "--version" || args[0] === "-v") {
    console.log(VERSION);
    return;
  }

  if (args[0] === "setup") {
    const { runSetup } = await import("./setup");
    await runSetup();
    return;
  }

  await initDb();

  const { values, positionals } = parseArgs({
    args,
    options: {
      json: { type: "boolean", default: false },
      bookmark: { type: "boolean", short: "b", default: false },
      tags: { type: "string", short: "t" },
      notes: { type: "string", short: "n" },
      type: { type: "string" },
      status: { type: "string" },
      tag: { type: "string" },
      articles: { type: "boolean", default: false },
      videos: { type: "boolean", default: false },
      days: { type: "string" },
      weeks: { type: "string" },
      month: { type: "string" },
      title: { type: "string" },
      limit: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  const asJson = values.json as boolean;
  const command = positionals[0];

  switch (command) {
    case "add": {
      const url = positionals[1];
      if (!url) {
        console.error(
          "Usage: ril add <url> [--tags X] [--notes X] [--bookmark]",
        );
        process.exit(1);
      }

      console.log("Fetching title...");
      const item = await items.addItem(url, {
        tags: values.tags as string,
        notes: values.notes as string,
        isBookmark: values.bookmark as boolean,
        title: values.title as string,
      });

      if (asJson) {
        console.log(JSON.stringify(item, null, 2));
      } else {
        console.log(`Added: ${typeEmoji(item.type)} ${item.title || item.url}`);
        if (item.tags) console.log(`   Tags: ${item.tags}`);
      }
      break;
    }

    case "reading": {
      let itemList: items.Item[] = [];

      if (values.articles && !values.videos) {
        itemList = await items.listItems({
          type: "article",
          status: "unread",
          tag: values.tag as string,
        });
      } else if (values.videos && !values.articles) {
        itemList = await items.listItems({
          type: "video",
          status: "unread",
          tag: values.tag as string,
        });
      } else {
        const articles = await items.listItems({
          type: "article",
          status: "unread",
          tag: values.tag as string,
        });
        const videos = await items.listItems({
          type: "video",
          status: "unread",
          tag: values.tag as string,
        });
        itemList = [...articles, ...videos].sort(
          (a, b) =>
            new Date(b.added_at).getTime() - new Date(a.added_at).getTime(),
        );
      }

      if (asJson) {
        console.log(JSON.stringify(itemList, null, 2));
      } else {
        if (itemList.length === 0) {
          console.log("No items in reading list.");
        } else {
          const filter = values.articles
            ? " (articles)"
            : values.videos
              ? " (videos)"
              : "";
          console.log(`\nReading List${filter}\n`);
          for (const item of itemList) printItem(item, false);
          console.log("");
        }
      }
      break;
    }

    case "bookmarks": {
      const itemList = await items.listItems({
        type: "bookmark",
        status: values.status as items.Item["status"],
        tag: values.tag as string,
      });

      if (asJson) {
        console.log(JSON.stringify(itemList, null, 2));
      } else {
        if (itemList.length === 0) {
          console.log("No bookmarks found.");
        } else {
          console.log("\nBookmarks\n");
          for (const item of itemList) printItem(item, false);
          console.log("");
        }
      }
      break;
    }

    case "list": {
      const itemList = await items.listItems({
        type: values.type as items.Item["type"],
        status: (values.status as items.Item["status"]) || "unread",
        tag: values.tag as string,
        limit: values.limit
          ? Number.parseInt(values.limit as string, 10)
          : undefined,
      });

      if (asJson) {
        console.log(JSON.stringify(itemList, null, 2));
      } else {
        if (itemList.length === 0) {
          console.log("No items found.");
        } else {
          const statusLabel = (values.status as string) || "unread";
          console.log(
            `\n${statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1)} Items\n`,
          );
          for (const item of itemList) printItem(item, false);
          console.log("");
        }
      }
      break;
    }

    case "done": {
      const id = positionals[1];
      if (!id) {
        console.error("Usage: ril done <id>");
        process.exit(1);
      }
      const success = await items.markDone(id);
      if (asJson) {
        console.log(JSON.stringify({ success, id }));
      } else if (success) {
        console.log(`Marked as done: ${id}`);
      } else {
        console.error(`Item not found: ${id}`);
        process.exit(1);
      }
      break;
    }

    case "undone": {
      const id = positionals[1];
      if (!id) {
        console.error("Usage: ril undone <id>");
        process.exit(1);
      }
      const success = await items.markUnread(id);
      if (asJson) {
        console.log(JSON.stringify({ success, id }));
      } else if (success) {
        console.log(`Marked as unread: ${id}`);
      } else {
        console.error(`Item not found: ${id}`);
        process.exit(1);
      }
      break;
    }

    case "search": {
      const query = positionals.slice(1).join(" ");
      if (!query) {
        console.error("Usage: ril search <query>");
        process.exit(1);
      }
      const results = await items.searchItems(query);
      if (asJson) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        if (results.length === 0) {
          console.log("No matching items found.");
        } else {
          console.log(`\nSearch: "${query}"\n`);
          for (const item of results) printItem(item);
          console.log("");
        }
      }
      break;
    }

    case "tags": {
      const tagList = await items.getTags();
      if (asJson) {
        console.log(JSON.stringify(tagList, null, 2));
      } else {
        if (tagList.length === 0) {
          console.log("No tags found.");
        } else {
          console.log("\nTags\n");
          for (const t of tagList) console.log(`  ${t.tag} (${t.count})`);
          console.log("");
        }
      }
      break;
    }

    case "history": {
      const historyItems = await items.getHistory({
        days: values.days
          ? Number.parseInt(values.days as string, 10)
          : undefined,
        weeks: values.weeks
          ? Number.parseInt(values.weeks as string, 10)
          : undefined,
        month: values.month as string,
      });

      if (asJson) {
        console.log(JSON.stringify(historyItems, null, 2));
      } else {
        if (historyItems.length === 0) {
          console.log("No completed items in this period.");
        } else {
          const period = values.month
            ? `Month ${values.month}`
            : values.weeks
              ? `Last ${values.weeks} weeks`
              : `Last ${values.days || 7} days`;
          console.log(`\nHistory: ${period}\n`);
          for (const item of historyItems) {
            const date = item.read_at ? formatDate(item.read_at) : "";
            console.log(
              `  ${typeEmoji(item.type)} ${truncate(item.title || item.url, 50)} — ${date}`,
            );
          }
          console.log("");
        }
      }
      break;
    }

    case "recent": {
      const days = positionals[1] ? Number.parseInt(positionals[1], 10) : 30;
      const recentItems = await items.getRecent(days);

      if (asJson) {
        console.log(JSON.stringify(recentItems, null, 2));
      } else {
        if (recentItems.length === 0) {
          console.log("No recent items.");
        } else {
          console.log(`\nRecently Added (last ${days} days)\n`);
          for (const item of recentItems) printItem(item);
          console.log("");
        }
      }
      break;
    }

    case "edit": {
      const id = positionals[1];
      if (!id) {
        console.error(
          "Usage: ril edit <id> [--tags X] [--notes X] [--title X] [--type video|article|bookmark] [--bookmark]",
        );
        process.exit(1);
      }

      const updates: {
        tags?: string;
        notes?: string;
        title?: string;
        type?: items.Item["type"];
      } = {};
      if (values.tags !== undefined) updates.tags = values.tags as string;
      if (values.notes !== undefined) updates.notes = values.notes as string;
      if (values.title !== undefined) updates.title = values.title as string;
      if (values.type !== undefined)
        updates.type = values.type as items.Item["type"];
      if (values.bookmark) updates.type = "bookmark";

      if (Object.keys(updates).length === 0) {
        console.error(
          "Provide at least one field to update: --tags, --notes, --title, --type, --bookmark",
        );
        process.exit(1);
      }

      const success = await items.updateItem(id, updates);
      if (asJson) {
        console.log(JSON.stringify({ success, id, updates }));
      } else if (success) {
        const typeMsg = updates.type
          ? ` → ${typeEmoji(updates.type)} ${updates.type}`
          : "";
        console.log(`Updated: ${id}${typeMsg}`);
      } else {
        console.error(`Item not found: ${id}`);
        process.exit(1);
      }
      break;
    }

    case "delete": {
      const id = positionals[1];
      if (!id) {
        console.error("Usage: ril delete <id>");
        process.exit(1);
      }
      const success = await items.deleteItem(id);
      if (asJson) {
        console.log(JSON.stringify({ success, id }));
      } else if (success) {
        console.log(`Deleted: ${id}`);
      } else {
        console.error(`Item not found: ${id}`);
        process.exit(1);
      }
      break;
    }

    case "config": {
      const config = getConfig();
      if (asJson) {
        const display = { ...config };
        if (display.turso?.authToken) {
          display.turso = { ...display.turso, authToken: "***" };
        }
        console.log(JSON.stringify(display, null, 2));
      } else {
        console.log("\nConfig\n");
        console.log(`Backend: ${config.backend || "local"}`);
        if (config.backend === "turso") {
          console.log(`Turso URL: ${config.turso?.url || "(env vars)"}`);
        }
        console.log("");
      }
      break;
    }

    case "db": {
      const config = getConfig();
      const backend = config.backend || "local";
      if (asJson) {
        console.log(
          JSON.stringify(
            {
              backend,
              path: backend === "turso" ? getReplicaPath() : getDbPath(),
              ...(backend === "turso"
                ? { remote: config.turso?.url || "(env vars)" }
                : {}),
            },
            null,
            2,
          ),
        );
      } else {
        console.log(`\nBackend: ${backend}`);
        if (backend === "turso") {
          console.log(`Local replica: ${getReplicaPath()}`);
          console.log(`Remote: ${config.turso?.url || "(using env vars)"}`);
        } else {
          console.log(`Database: ${getDbPath()}`);
        }
        console.log("");
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
