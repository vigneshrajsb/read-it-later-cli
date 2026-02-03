# read-it-later-cli 🦊

A simple CLI for saving and organizing URLs - articles, videos, and bookmarks. Read it later.

## Installation

```bash
git clone https://github.com/vigneshrajsb/read-it-later-cli.git
cd read-it-later-cli
bun install
bun link
```

## Usage

### Adding Items

```bash
# Auto-detects type from URL
ril add "https://youtube.com/watch?v=abc"     # → video
ril add "https://medium.com/some-article"     # → article

# Save as bookmark (reference, not to consume)
ril add "https://turbotax.com" --bookmark --tags "tax,tools"

# With notes
ril add "https://blog.example.com/post" --tags "ai" --notes "Great intro"
```

### Viewing Items

```bash
ril list                        # unread items (default)
ril list --status read          # completed items
ril list --type video           # only videos
ril list --tag ai               # filter by tag

ril reading                     # articles + videos (to consume)
ril bookmarks                   # reference bookmarks only
```

### Completing Items

```bash
ril done 3                      # mark item #3 as read
ril undone 3                    # mark back as unread
```

### Search & Discovery

```bash
ril search "machine learning"   # search title, url, tags, notes
ril tags                        # list all tags with counts
ril recent                      # recently added (30 days)
ril recent 7                    # recently added (7 days)
```

### History

```bash
ril history                     # read in last 7 days
ril history --days 14           # last 14 days
ril history --weeks 4           # last 4 weeks
ril history --month 0226        # February 2026
```

### Managing Items

```bash
ril edit 3 --tags "ai,ml"       # update tags
ril edit 3 --notes "Updated note"
ril delete 3                    # remove item
```

### Options

```bash
--json                            # JSON output
--bookmark, -b                    # save as bookmark
--tags, -t "tag1,tag2"           # add tags
--notes, -n "text"               # add notes
```

## Data Storage

Data stored in `~/.shelf/shelf.db` (SQLite).

```bash
ril db                          # show path
```

## Type Detection

| Type | Detected From |
|------|---------------|
| 🎬 video | YouTube, Vimeo, TikTok, Instagram, Netflix, Twitch, Loom |
| 📄 article | Default (blogs, news, etc.) |
| 🔖 bookmark | `--bookmark` flag |

## AI Agent Integration

See **AGENTS.md** for detailed agent usage.

## License

MIT
