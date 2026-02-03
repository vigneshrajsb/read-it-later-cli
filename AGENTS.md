# AGENTS.md - How to Use shelf-cli

Guide for AI agents to interact with the `shelf` CLI.

## Philosophy

**You are the orchestrator, not the data janitor.**

Call CLI commands instead of parsing markdown. The database handles consistency; you handle natural language.

## Quick Reference

```bash
shelf add <url> [--tags X] [--bookmark]   # save URL
shelf list [--type X] [--status X]        # view items
shelf done <id>                           # mark complete
shelf search <query>                      # find items
shelf tags                                # list all tags
shelf history --days 7                    # what was read recently
```

## Command Patterns

### Saving URLs

Auto-detect type from URL:

```bash
# User: "save this video" + YouTube link
shelf add "https://youtube.com/watch?v=abc"
# ✅ Added: 🎬 Video Title

# User: "bookmark this for later" 
shelf add "https://turbotax.com" --bookmark --tags "tax,tools"
# ✅ Added: 🔖 TurboTax

# User: "interesting article on AI"
shelf add "https://blog.com/ai-post" --tags "ai"
```

### Checking Reading List

```bash
# User: "what do I need to read?"
shelf list --json

# User: "what videos are in my queue?"
shelf list --type video --json

# User: "show me my bookmarks"
shelf list --type bookmark --status unread --json
```

### Marking Complete

```bash
# User: "finished that article"
shelf done 3

# User: "watched the YouTube video"
shelf done 5
```

### Finding Things

```bash
# User: "did I save anything about taxes?"
shelf search "tax" --json

# User: "what tags do I have?"
shelf tags --json

# User: "what did I read last week?"
shelf history --days 7 --json
```

## Type Detection

The CLI auto-detects type from URL:

| Pattern | Type |
|---------|------|
| youtube.com, youtu.be | video |
| vimeo.com | video |
| tiktok.com | video |
| instagram.com/reel | video |
| netflix.com | video |
| twitch.tv | video |
| loom.com | video |
| `--bookmark` flag | bookmark |
| Everything else | article |

## Best Practices

1. **Auto-detect type**: Don't ask user what type — let URL detection handle it
2. **Use tags liberally**: Help user organize (`--tags "ai,tools,later"`)
3. **Add notes for context**: `--notes "Recommended by X"`
4. **Use --json**: For programmatic access
5. **Search broadly**: `shelf search` checks title, url, tags, notes

## Presenting Data to Users

When showing lists, **always include clickable URLs**:

```
📚 Unread

1. <https://bazel.build/> — Bazel [tools]
2. <https://x.com/user/status/123> — AI Guide [social, ai]
3. <https://medium.com/article> — Great read [tech]

✅ Completed

1. <https://example.com/post> — Finished article [ai]
```

**Format rules:**
- Use `<url>` format for clickable links (works in Telegram/Discord)
- Include title if available, otherwise just the URL
- Show tags in brackets `[tag1, tag2]`
- Group by status (Unread / Completed)
- Use emoji prefixes: 📄 article, 🎬 video, 🔖 bookmark

## Database Info

- **Location**: `~/.shelf/shelf.db`
- **Format**: SQLite (portable, queryable)
- **Backup**: Copy the file to back up all data
- **Privacy**: Local only, never transmitted

## First-Time Setup (Onboarding Users)

When a user first uses shelf, explain:

> "I use a local database (`~/.shelf/shelf.db`) to save URLs you want to read, watch, or bookmark.
> 
> Just send me links and I'll save them. I auto-detect if it's a video or article.
> 
> For reference links (tools, docs), add `--bookmark` so they stay in your permanent collection.
> 
> Ask 'what's in my reading list?' anytime to see your queue."

## Example Agent Flow

```
User: "save this https://youtube.com/watch?v=abc123 looks interesting"

Agent:
$ shelf add "https://youtube.com/watch?v=abc123"

Response: "✅ Saved to your watchlist! You have 5 videos queued."
```

```
User: "what did I read this week?"

Agent:
$ shelf history --days 7 --json

Response: "This week you finished:
- 📄 How to Build AI Agents (Mon)
- 🎬 System Design Interview (Wed)
- 📄 Netflix Culture Memo (Today)"
```

## Installation

```bash
git clone https://github.com/vigneshrajsb/shelf-cli.git
cd shelf-cli && bun install && bun link
```

Requires Bun runtime.
