# CLAUDE.md

URL saving and organization CLI with SQLite backend.

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
