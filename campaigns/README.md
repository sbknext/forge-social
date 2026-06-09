# Campaigns

A campaign is a JSON file containing a library of authored posts. The campaign engine loads it, applies brand placeholders, and drips posts on a schedule via `forge-social`.

---

## Campaign file schema

```jsonc
{
  "name": "campaign-slug",          // kebab-case identifier
  "description": "...",             // human note, not posted
  "posts": [
    {
      "id": "unique-kebab-id",       // required, unique within file
      "platforms": ["x"],            // "x" | "instagram" | "linkedin" | "all"
      "text": "Post text with {echo_url} placeholder.",
      "tags": ["buildinpublic"],     // optional; engine may append as hashtags
      "image": "assets/echo.png"    // optional; user supplies file under assets/
    }
  ]
}
```

### platforms values

| Value | Meaning |
|---|---|
| `"x"` | X (Twitter) only |
| `"instagram"` | Instagram only |
| `"linkedin"` | LinkedIn |
| `"all"` | Every active platform in config |

---

## Placeholders

Placeholders are filled at post time from env vars. They must not be hardcoded in post text.

| Placeholder | Env var | Example value |
|---|---|---|
| `{echo_url}` | `FORGE_SOCIAL_ECHO_URL` | `https://echo.yourdomain.com` |
| `{forge_url}` | `FORGE_SOCIAL_FORGE_URL` | `https://github.com/you/forge` |
| `{mcp_url}` | `FORGE_SOCIAL_MCP_URL` | `https://mcp.yourdomain.com` |
| `{handle}` | `FORGE_SOCIAL_HANDLE` | `@yourhandle` |
| `{x_handle}` | `FORGE_SOCIAL_X_HANDLE` | `@yourxhandle` |
| `{ig_handle}` | `FORGE_SOCIAL_IG_HANDLE` | `@yourighandle` |

The env-to-placeholder mapping is implemented in `src/core/brand.ts`. Set the vars in `~/.forge-social/.env`.

---

## Running a campaign

```bash
# dry run — show what would post, no browser
forge-social campaign run --file campaigns/echo-forge.json --dry-run

# dry run for a specific platform
forge-social campaign run --file campaigns/echo-forge.json --platform linkedin --dry-run

# live run — posts next eligible item per active platform, respects daily caps
forge-social campaign run --file campaigns/echo-forge.json --platform all

# cap the number of posts in this run
forge-social campaign run --file campaigns/echo-forge.json --platform x --max 1

# run outside active hours
forge-social campaign run --file campaigns/echo-forge.json --platform all --force
```

Note: there is no `--id` flag. The engine sends the next unset post automatically.

---

## Images

Post entries may reference an `"image"` path (e.g. `"assets/echo-tiers.png"`). The engine reads the file relative to the repo root and attaches it to the post.

**Images are user-supplied.** The repo ships only `assets/.gitkeep`. Add your own PNG/JPG files under `assets/` — they are gitignored by default (add exceptions deliberately).

Recommended sizes:
- X: 1200×675 (16:9)
- Instagram: 1080×1080 (square) or 1080×1350 (portrait)

---

## Files in this directory

| File | Purpose |
|---|---|
| `echo-forge.json` | Launch campaign for echo-ai + forge products |
| `README.md` | This file |
