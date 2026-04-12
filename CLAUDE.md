# CLAUDE.md

URL saving and organization CLI with SQLite backend (formerly shelf-cli).

## ⚠️ Data Safety

**Backup before destructive operations:**
```bash
cp ~/.read-it-later/read-it-later.db ~/.read-it-later/read-it-later.db.bak
```

## Release Process

Use conventional commit prefixes (`feat:`, `fix:`, `chore:`, `docs:`) — these are parsed to auto-generate release notes.

```bash
# One-command release (bumps, commits, pushes tag)
bun run release:patch   # bug fixes
bun run release:minor   # new features
bun run release:major   # breaking changes

# GitHub Actions will: publish to npm + create GitHub Release with changelog

# UPDATE GLOBAL INSTALL (don't forget!)
npm install -g read-it-later-cli@latest
```

> ⚠️ Global install update is critical! Dashboard uses the global `ril` command.

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
ril setup                       # configure storage backend
ril config                      # show config
ril db                          # show database info
ril --version                   # show version
```

## Types

- 🎬 `video` — YouTube, Vimeo, TikTok, Instagram, Netflix, Twitch
- 📄 `article` — Default (blogs, news, etc.)
- 🔖 `bookmark` — Reference items (--bookmark flag)

## Key Points

- Use `--json` for programmatic access
- Data lives in `~/.read-it-later/read-it-later.db` (local) or Turso cloud with local replica
- Supports local SQLite and Turso cloud backends (run `ril setup` to configure)
- You orchestrate; the CLI manages data
