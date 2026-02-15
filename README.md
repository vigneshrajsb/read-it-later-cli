# read-it-later-cli 🦊

A simple CLI for saving and organizing URLs - articles, videos, and bookmarks. Read it later.

## Install

```bash
npm install -g read-it-later-cli
# or
pnpm add -g read-it-later-cli
# or
bun add -g read-it-later-cli

# one-shot (no install)
bunx read-it-later-cli --help
npx read-it-later-cli --help
```

<!-- Homebrew (macOS):
```bash
brew install vigneshrajsb/tap/ril
``` -->

**Requires:** [Bun](https://bun.sh) runtime (`curl -fsSL https://bun.sh/install | bash`)

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
--json                          # JSON output
--bookmark, -b                  # save as bookmark
--tags, -t "tag1,tag2"          # add tags
--notes, -n "text"              # add notes
```

## Data Storage

Data stored in `~/.shelf/shelf.db` (SQLite).

```bash
ril db                          # show path
```

## Development

### Running Tests

Tests use an in-memory database (automatically via `RIL_TEST=1`):

```bash
# Run all tests
bun test

# Watch mode
bun test --watch

# Via test runner script
cd tests && ./run-tests.sh
```

### Test Coverage

| Feature | Tests |
|---------|-------|
| Add items | ✅ Title, URL, type detection, tags, notes |
| List items | ✅ Filtering by type, tag, status, limit |
| Mark done/undone | ✅ Status changes, read_at timestamp |
| Search | ✅ Title, tags, limit |
| Tags | ✅ Count aggregation, sorting |
| Timestamps | ✅ added_at, read_at, ordering |

## Type Detection

| Type | Detected From |
|------|---------------|
| 🎬 video | YouTube, Vimeo, TikTok, Instagram, Netflix, Twitch, Loom |
| 📄 article | Default (blogs, news, etc.) |
| 🔖 bookmark | `--bookmark` flag |

## AI Agent Integration

See **AGENTS.md** for detailed agent usage.

## Release Process

1. **Bump version & tag:**
   ```bash
   npm version patch|minor|major -m "Release %s - description"
   ```

2. **Push to GitHub (triggers npm publish):**
   ```bash
   git push && git push --tags
   ```

3. **Update global install on this machine:**
   ```bash
   npm install -g read-it-later-cli@latest
   ```

4. **Verify:**
   ```bash
   npm list -g read-it-later-cli
   ```

> ⚠️ **Don't forget step 3!** The dashboard uses the global `ril` command.

## License

MIT
