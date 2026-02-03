#!/usr/bin/env bun
import { parseArgs } from "util";
import { initDb, getDbPath } from "./db";
import * as items from "./items";

// Initialize database on startup
initDb();

const HELP = `
shelf - CLI for saving and organizing URLs

USAGE:
  shelf <command> [options]

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
  db                        Show database path

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
  --help, -h                Show this help

EXAMPLES:
  shelf add "https://youtube.com/watch?v=abc"
  shelf add "https://turbotax.com" --bookmark --tags "tax"
  shelf reading
  shelf reading --videos
  shelf bookmarks
  shelf done 3
  shelf search "machine learning"
  shelf history --days 7
`;

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function typeEmoji(type: string): string {
  switch (type) {
    case "video": return "🎬";
    case "bookmark": return "🔖";
    default: return "📄";
  }
}

function statusEmoji(status: string): string {
  return status === "read" ? "✅" : "⬜";
}

function truncate(str: string | null, len: number): string {
  if (!str) return "";
  return str.length > len ? str.slice(0, len - 1) + "…" : str;
}

function printItem(item: items.Item, showStatus: boolean = true) {
  const status = showStatus ? statusEmoji(item.status) + " " : "";
  const type = typeEmoji(item.type);
  const title = truncate(item.title || item.url, 60);
  const tags = item.tags ? ` [${item.tags}]` : "";
  console.log(`${status}${item.id}. ${type} ${title}${tags}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(HELP);
    return;
  }

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
        console.error("Usage: shelf add <url> [--tags X] [--notes X] [--bookmark]");
        process.exit(1);
      }
      
      console.log("⏳ Fetching title...");
      const item = await items.addItem(url, {
        tags: values.tags as string,
        notes: values.notes as string,
        isBookmark: values.bookmark as boolean,
        title: values.title as string,
      });
      
      if (asJson) {
        console.log(JSON.stringify(item, null, 2));
      } else {
        console.log(`✅ Added: ${typeEmoji(item.type)} ${item.title || item.url}`);
        if (item.tags) console.log(`   Tags: ${item.tags}`);
      }
      break;
    }

    case "reading": {
      // Get articles and videos (excludes bookmarks)
      let itemList: items.Item[] = [];
      
      if (values.articles && !values.videos) {
        itemList = items.listItems({ type: "article", status: "unread", tag: values.tag as string });
      } else if (values.videos && !values.articles) {
        itemList = items.listItems({ type: "video", status: "unread", tag: values.tag as string });
      } else {
        // Both articles and videos
        const articles = items.listItems({ type: "article", status: "unread", tag: values.tag as string });
        const videos = items.listItems({ type: "video", status: "unread", tag: values.tag as string });
        itemList = [...articles, ...videos].sort((a, b) => 
          new Date(b.added_at).getTime() - new Date(a.added_at).getTime()
        );
      }
      
      if (asJson) {
        console.log(JSON.stringify(itemList, null, 2));
      } else {
        if (itemList.length === 0) {
          console.log("No items in reading list.");
        } else {
          const filter = values.articles ? " (articles)" : values.videos ? " (videos)" : "";
          console.log(`\n📚 Reading List${filter}\n`);
          itemList.forEach((item) => printItem(item, false));
          console.log("");
        }
      }
      break;
    }

    case "bookmarks": {
      const itemList = items.listItems({
        type: "bookmark",
        status: (values.status as items.Item["status"]) || "unread",
        tag: values.tag as string,
      });
      
      if (asJson) {
        console.log(JSON.stringify(itemList, null, 2));
      } else {
        if (itemList.length === 0) {
          console.log("No bookmarks found.");
        } else {
          console.log("\n🔖 Bookmarks\n");
          itemList.forEach((item) => printItem(item, false));
          console.log("");
        }
      }
      break;
    }

    case "list": {
      const itemList = items.listItems({
        type: values.type as items.Item["type"],
        status: (values.status as items.Item["status"]) || "unread",
        tag: values.tag as string,
        limit: values.limit ? parseInt(values.limit as string, 10) : undefined,
      });
      
      if (asJson) {
        console.log(JSON.stringify(itemList, null, 2));
      } else {
        if (itemList.length === 0) {
          console.log("No items found.");
        } else {
          const statusLabel = values.status || "unread";
          console.log(`\n📚 ${statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1)} Items\n`);
          itemList.forEach((item) => printItem(item, false));
          console.log("");
        }
      }
      break;
    }

    case "done": {
      const id = positionals[1];
      if (!id) {
        console.error("Usage: shelf done <id>");
        process.exit(1);
      }
      const success = items.markDone(id);
      if (asJson) {
        console.log(JSON.stringify({ success, id }));
      } else if (success) {
        console.log(`✅ Marked as done: ${id}`);
      } else {
        console.error(`❌ Item not found: ${id}`);
        process.exit(1);
      }
      break;
    }

    case "undone": {
      const id = positionals[1];
      if (!id) {
        console.error("Usage: shelf undone <id>");
        process.exit(1);
      }
      const success = items.markUnread(id);
      if (asJson) {
        console.log(JSON.stringify({ success, id }));
      } else if (success) {
        console.log(`✅ Marked as unread: ${id}`);
      } else {
        console.error(`❌ Item not found: ${id}`);
        process.exit(1);
      }
      break;
    }

    case "search": {
      const query = positionals.slice(1).join(" ");
      if (!query) {
        console.error("Usage: shelf search <query>");
        process.exit(1);
      }
      const results = items.searchItems(query);
      if (asJson) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        if (results.length === 0) {
          console.log("No matching items found.");
        } else {
          console.log(`\n🔍 Search: "${query}"\n`);
          results.forEach((item) => printItem(item));
          console.log("");
        }
      }
      break;
    }

    case "tags": {
      const tagList = items.getTags();
      if (asJson) {
        console.log(JSON.stringify(tagList, null, 2));
      } else {
        if (tagList.length === 0) {
          console.log("No tags found.");
        } else {
          console.log("\n🏷️ Tags\n");
          tagList.forEach((t) => console.log(`  ${t.tag} (${t.count})`));
          console.log("");
        }
      }
      break;
    }

    case "history": {
      const historyItems = items.getHistory({
        days: values.days ? parseInt(values.days as string, 10) : undefined,
        weeks: values.weeks ? parseInt(values.weeks as string, 10) : undefined,
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
          console.log(`\n📖 History: ${period}\n`);
          historyItems.forEach((item) => {
            const date = item.read_at ? formatDate(item.read_at) : "";
            console.log(`  ${typeEmoji(item.type)} ${truncate(item.title || item.url, 50)} — ${date}`);
          });
          console.log("");
        }
      }
      break;
    }

    case "recent": {
      const days = positionals[1] ? parseInt(positionals[1], 10) : 30;
      const recentItems = items.getRecent(days);
      
      if (asJson) {
        console.log(JSON.stringify(recentItems, null, 2));
      } else {
        if (recentItems.length === 0) {
          console.log("No recent items.");
        } else {
          console.log(`\n🆕 Recently Added (last ${days} days)\n`);
          recentItems.forEach((item) => printItem(item));
          console.log("");
        }
      }
      break;
    }

    case "edit": {
      const id = positionals[1];
      if (!id) {
        console.error("Usage: shelf edit <id> [--tags X] [--notes X] [--title X] [--type video|article|bookmark] [--bookmark]");
        process.exit(1);
      }
      
      const updates: { tags?: string; notes?: string; title?: string; type?: items.Item["type"] } = {};
      if (values.tags !== undefined) updates.tags = values.tags as string;
      if (values.notes !== undefined) updates.notes = values.notes as string;
      if (values.title !== undefined) updates.title = values.title as string;
      if (values.type !== undefined) updates.type = values.type as items.Item["type"];
      if (values.bookmark) updates.type = "bookmark";
      
      if (Object.keys(updates).length === 0) {
        console.error("Provide at least one field to update: --tags, --notes, --title, --type, --bookmark");
        process.exit(1);
      }
      
      const success = items.updateItem(id, updates);
      if (asJson) {
        console.log(JSON.stringify({ success, id, updates }));
      } else if (success) {
        const typeMsg = updates.type ? ` → ${typeEmoji(updates.type)} ${updates.type}` : "";
        console.log(`✅ Updated: ${id}${typeMsg}`);
      } else {
        console.error(`❌ Item not found: ${id}`);
        process.exit(1);
      }
      break;
    }

    case "delete": {
      const id = positionals[1];
      if (!id) {
        console.error("Usage: shelf delete <id>");
        process.exit(1);
      }
      const success = items.deleteItem(id);
      if (asJson) {
        console.log(JSON.stringify({ success, id }));
      } else if (success) {
        console.log(`✅ Deleted: ${id}`);
      } else {
        console.error(`❌ Item not found: ${id}`);
        process.exit(1);
      }
      break;
    }

    case "db":
      console.log(getDbPath());
      break;

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
