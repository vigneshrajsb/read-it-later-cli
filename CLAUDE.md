# CLAUDE.md

URL saving and organization CLI with SQLite backend (formerly shelf-cli).

## ⚠️ Data Safety

**Backup before destructive operations:**
```bash
cp ~/.shelf/shelf.db ~/.shelf/shelf.db.bak
```

## Release Process

When releasing a new version:

```bash
# 1. Bump version (creates commit + tag)
npm version patch|minor|major -m "Release %s - description"

# 2. Push (GitHub Actions publishes to npm)
git push && git push --tags

# 3. UPDATE GLOBAL INSTALL (don't forget!)
npm install -g read-it-later-cli@latest

# 4. Verify
npm list -g read-it-later-cli
```

> ⚠️ Step 3 is critical! Dashboard uses the global `ril` command.

## For Agents

Read **AGENTS.md** for complete usage.

## Quick Commands

```bash
ril add <url>                   # save (auto-detects type)
ril add <url> --bookmark        # save as bookmark
ril reading                     # articles + videos to consume
ril reading --videos            # videos only
ril bookmarks                   # saved references
ril done <id>                   # mark complete
ril search <query>              # find items
ril history --days 7            # recent completions
```

## Types

- 🎬 `video` — YouTube, Vimeo, TikTok, Instagram, Netflix, Twitch
- 📄 `article` — Default (blogs, news, etc.)
- 🔖 `bookmark` — Reference items (--bookmark flag)

## Key Points

- Use `--json` for programmatic access
- Data lives in `~/.shelf/shelf.db`
- You orchestrate; the CLI manages data
