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

const COMMAND_HELP: Record<string, string> = {
  add: `ril add <url> [options]

  Save a URL to your reading list. Type is auto-detected.

  Options:
    --bookmark, -b      Save as bookmark (reference, not to consume)
    --tags, -t <tags>   Comma-separated tags
    --notes, -n <text>  Add a note
    --title <text>      Override auto-fetched title
    --json              Output as JSON

  Examples:
    ril add "https://example.com/article"
    ril add "https://youtube.com/watch?v=abc" --tags "tech,ai"
    ril add "https://tool.com" --bookmark --tags "tools"`,

  reading: `ril reading [options]

  Show your reading list (articles + videos, unread only).

  Options:
    --articles          Show articles only
    --videos            Show videos only
    --tag <tag>         Filter by tag
    --json              Output as JSON

  Examples:
    ril reading
    ril reading --videos
    ril reading --tag "ai"`,

  bookmarks: `ril bookmarks [options]

  Show saved bookmarks (reference items).

  Options:
    --status <status>   Filter by status (unread|read)
    --tag <tag>         Filter by tag
    --json              Output as JSON

  Examples:
    ril bookmarks
    ril bookmarks --tag "tools"`,

  list: `ril list [options]

  List all items (default: unread).

  Options:
    --type <type>       Filter by type (video|article|bookmark)
    --status <status>   Filter by status (unread|read), default: unread
    --tag <tag>         Filter by tag
    --limit <n>         Limit number of results
    --json              Output as JSON

  Examples:
    ril list
    ril list --type video --status read
    ril list --tag "ai" --limit 10`,

  done: `ril done <id>

  Mark an item as read/watched.

  Options:
    --json              Output as JSON

  Examples:
    ril done 3
    ril done 15`,

  undone: `ril undone <id>

  Mark an item back as unread.

  Options:
    --json              Output as JSON

  Examples:
    ril undone 3`,

  search: `ril search <query>

  Search across title, URL, tags, and notes.

  Options:
    --json              Output as JSON

  Examples:
    ril search "machine learning"
    ril search "react"`,

  tags: `ril tags

  List all tags with their usage counts, sorted by frequency.

  Options:
    --json              Output as JSON`,

  history: `ril history [options]

  Show items you've completed (marked as read/watched).

  Options:
    --days <n>          Last N days (default: 7)
    --weeks <n>         Last N weeks
    --month <mmyy>      Specific month (e.g., 0226 for Feb 2026)
    --json              Output as JSON

  Examples:
    ril history
    ril history --days 30
    ril history --month 0426`,

  recent: `ril recent [days]

  Show recently added items (default: last 30 days).

  Options:
    --json              Output as JSON

  Examples:
    ril recent
    ril recent 7`,

  edit: `ril edit <id> [options]

  Update an item's metadata.

  Options:
    --tags, -t <tags>   Set tags (comma-separated)
    --notes, -n <text>  Set notes
    --title <text>      Set title
    --type <type>       Set type (video|article|bookmark)
    --bookmark, -b      Shorthand for --type bookmark
    --json              Output as JSON

  Examples:
    ril edit 3 --tags "ai,ml"
    ril edit 5 --title "Better Title" --notes "Must read"
    ril edit 7 --bookmark`,

  delete: `ril delete <id>

  Permanently delete an item.

  Options:
    --json              Output as JSON

  Examples:
    ril delete 3`,

  setup: `ril setup

  Interactive wizard to configure your storage backend.
  Choose between local SQLite or Turso cloud (synced, offline-capable).`,

  config: `ril config

  Show current configuration (backend, Turso URL if configured).

  Options:
    --json              Output as JSON`,

  db: `ril db

  Show database backend info and file paths.

  Options:
    --json              Output as JSON`,
};

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
    if (args.includes("--help") || args.includes("-h")) {
      console.log(`\n${COMMAND_HELP.setup}\n`);
      return;
    }
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

  if (values.help && command && COMMAND_HELP[command]) {
    console.log(`\n${COMMAND_HELP[command]}\n`);
    return;
  }

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
