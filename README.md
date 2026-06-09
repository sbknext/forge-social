# forge-social

Safe-pace social posting to X (Twitter), Instagram, LinkedIn, Bluesky, Mastodon, and Dev.to. Promotion tool for [echo-ai](https://echo.sbknext.com) and [forge](https://forge.sbknext.com). No LLM. Real Chrome for browser platforms; HTTP API for Bluesky/Mastodon/Dev.to — more reliable, fully unit-testable.

> **Terms of service notice:** Automating social media activity may violate platform ToS. The operator bears full responsibility for usage. Review each platform's automation policies before use.

---

## Start here

```bash
forge-social doctor
```

Run `doctor` after every install or credential change. It performs an offline selftest — validates config, DB tables, per-platform credentials, and brand env vars. No browser, no network.

---

## Platforms

| Platform | Type | Auth | Daily cap | Hard ceiling | Char limit |
|---|---|---|---|---|---|
| X | Browser | `X_USERNAME` + `X_PASSWORD` + Chrome profile | 5 | 10 | 280 |
| Instagram | Browser | `IG_USERNAME` + `IG_PASSWORD` + Chrome profile | 3 | 5 | 2,200 |
| LinkedIn | Browser **`@unverified`** | `LI_USERNAME` + `LI_PASSWORD` + Chrome profile | 2 | 3 | 3,000 |
| Bluesky | API | `BLUESKY_HANDLE` + `BLUESKY_APP_PASSWORD` | 10 | 10 | 300 graphemes |
| Mastodon | API | `MASTODON_INSTANCE` + `MASTODON_TOKEN` | 10 | 10 | 500 |
| Dev.to | API | `DEVTO_API_KEY` | 2 articles | 2 | — (long-form) |

**Browser platforms** (x, instagram, linkedin): uses a persistent real-Chrome session via Playwright. Captcha detection built in — process stops and sends an optional Telegram alert on captcha.

**API platforms** (bluesky, mastodon, devto): official HTTP APIs with bearer tokens from env. No browser needed, no DOM involved.

**LinkedIn `@unverified`:** DOM selectors ported from the private `forge-linkedin` repo but not confirmed against a live session. Always dry-run LinkedIn first. See [`docs/PORTED-FROM-forge-linkedin.md`](docs/PORTED-FROM-forge-linkedin.md).

To keep LinkedIn selectors current with upstream:
```bash
bash scripts/sync-forge-linkedin.sh            # diff only
bash scripts/sync-forge-linkedin.sh --apply    # apply upstream changes
```

Active hours: **09:00–21:00 IST** (`active_tz: "Asia/Kolkata"`). Configurable in `~/.forge-social/config.json`. `skip_weekends: false` by default.

---

## Quick start

```bash
git clone https://github.com/sbknext/forge-social
cd forge-social
bash scripts/install.sh          # installs deps, builds, downloads Chromium

forge-social init                # scaffold ~/.forge-social/ (config + .env + DB)
# edit ~/.forge-social/.env — credentials + brand vars (see INSTALL.md)
forge-social doctor              # verify everything before touching a browser

forge-social login --platform x
forge-social login --platform ig
forge-social login --platform linkedin    # opens browser; log in manually first time
forge-social login --platform bluesky     # validates env token — no browser

forge-social post --platform all \
  --text "Shipped forge-social v0.3.0." \
  --image hero.png \
  --tags "#AgenticAI,#BuildInPublic"
```

---

## Commands

### Setup

| Command | Flags | What it does |
|---|---|---|
| `doctor` | `[--json]` | Offline selftest: config, DB tables, credentials, brand env vars. No browser, no network. |
| `init` | — | Scaffold `~/.forge-social/` (config.json, .env, SQLite DB) |
| `login` | `--platform x\|ig\|linkedin\|bluesky\|bsky\|mastodon\|masto\|devto\|dev.to` | Browser session (x/ig/linkedin); token validation (bluesky/mastodon/devto) |

### Posting

| Command | Flags | What it does |
|---|---|---|
| `post` | `--platform <p>` `--text <text>` `[--image <path>]` `[--tags <csv>]` `[--force]` | Post to one or all platforms. `--force` ignores active-hours gate. |
| `dry-run` | `--platform <p>` `--text <text>` `[--image <path>]` `[--tags <csv>]` | Validate inputs + quota. No browser. No post. |

`--platform` values for post/dry-run: `x | ig | linkedin | li | bluesky | bsky | mastodon | masto | devto | dev.to | all`

`all` expands to all 6 platforms in sequence (x → instagram → linkedin → bluesky → mastodon → devto), with a 60 s gap between browser platforms.

### Campaigns

| Command | Flags | What it does |
|---|---|---|
| `campaign list` | `--file <path>` | Print all posts with metadata + brand-rendered preview |
| `campaign status` | `--file <path>` | Per-platform drip progress (total/sent/remaining) from DB |
| `campaign run` | `--file <path>` `--platform x\|ig\|linkedin\|li\|all` `[--dry-run]` `[--max <n>]` `[--force]` | Send next eligible posts; respects daily cap + active hours |
| `daemon` | `--file <path>` `[--interval <sec>]` `[--once]` `[--dry-run]` | Auto-drip on schedule. Captcha → Telegram alert + exit 1. Ctrl-C to stop. |
| `schedule` | `--file <path>` `[--json]` | Per-platform posting plan: quota, drip progress, active-hours status, next-eligible time |

`campaign run --platform` accepts `x | ig | linkedin | li | all` only (not bluesky/mastodon/devto — use `post` for those).

`daemon --interval <sec>` sets poll frequency (default 60 s). `--once` runs a single pass and exits (useful in cron).

### Insight

| Command | Flags | What it does |
|---|---|---|
| `status` | — | Today's counts, last 10 posts, last login per platform |
| `report` | `[--json]` | Posting analytics: per-platform totals, per-campaign sent counts, recent posts |
| `config` | — | Print active `~/.forge-social/config.json` |

### Media

| Command | Flags | What it does |
|---|---|---|
| `media` | `--file <path>` `[--out <dir>]` `[--size wide\|square\|both]` `[--theme echo\|forge\|neutral]` `[--attach]` | Generate branded image cards for campaign posts |

**Sizes:** `wide` = 1200×675 (X/LinkedIn), `square` = 1080×1080 (Instagram). Default: `both`.

**Themes:** `echo` (teal), `forge` (orange #e85d04), `neutral` (grey). Auto-detected from post id prefix (`echo-*`, `forge-*`); override with `--theme`.

**PNG vs SVG:** `@napi-rs/canvas` is an optional dependency (prebuilt — no node-gyp). Install for PNG output:
```bash
npm install @napi-rs/canvas
```
Without it, `.svg` files are written instead. The command always succeeds regardless.

**`--attach`:** rewrites campaign JSON `image` fields to the generated wide card paths so `campaign run` picks them up automatically.

### Engagement

| Command | Flags | What it does |
|---|---|---|
| `engage` | `--platform bluesky\|mastodon` `[--dry-run]` `[--max <n>]` | Process inbound notifications: auto-like, follow-back, optional reply |

> **Off by default.** No actions taken unless `engage_enabled: true` is explicitly set in `~/.forge-social/config.json`.

Supported platforms: **Bluesky** and **Mastodon** only (API). Browser platforms (X, Instagram, LinkedIn) are NOT supported for engagement.

---

## Promotion workflow

```bash
# 1. Set brand env vars + credentials in ~/.forge-social/.env
# 2. Verify everything
forge-social doctor

# 3. Generate image cards for the bundled echo-forge campaign
forge-social media --file campaigns/echo-forge.json --attach

# 4. Preview rendered posts (brand placeholders filled, no posts sent)
forge-social campaign run --file campaigns/echo-forge.json --platform x --dry-run

# 5. Check the schedule plan
forge-social schedule --file campaigns/echo-forge.json

# 6. Start the drip daemon (live, 60 s poll, Ctrl-C to stop)
forge-social daemon --file campaigns/echo-forge.json

# 7. Check analytics after a few posts
forge-social report
```

---

## Campaign files

```jsonc
{
  "name": "campaign-slug",
  "description": "...",
  "posts": [
    {
      "id": "unique-kebab-id",
      "platforms": ["x"],              // "x" | "instagram" | "linkedin" | "all"
      "text": "Post text with {echo_url} placeholder.",
      "tags": ["buildinpublic"],       // optional hashtags
      "image": "assets/echo.png"      // optional; relative to repo root
    }
  ]
}
```

The bundled campaign `campaigns/echo-forge.json` has ~20 authored posts for echo-ai + forge across X, Instagram, and LinkedIn. See [`campaigns/README.md`](campaigns/README.md).

### Brand placeholders

Post text uses `{placeholder}` tokens resolved at post time from env vars. Unknown placeholders are left intact (visible typo signal in dry-run).

| Placeholder | Env var | Built-in default |
|---|---|---|
| `{echo_url}` | `FORGE_SOCIAL_ECHO_URL` | _(empty — set this)_ |
| `{forge_url}` | `FORGE_SOCIAL_FORGE_URL` | `https://forge.sbknext.com` |
| `{mcp_url}` | `FORGE_SOCIAL_MCP_URL` | `https://mcp.sbknext.com` |
| `{handle}` | `FORGE_SOCIAL_HANDLE` | _(empty)_ |
| `{x_handle}` | `FORGE_SOCIAL_X_HANDLE` | _(empty)_ |
| `{ig_handle}` | `FORGE_SOCIAL_IG_HANDLE` | _(empty)_ |

Set these in `~/.forge-social/.env` alongside credentials.

---

## Engagement (auto-like / follow-back)

> **Off by default.** Opt in explicitly in `~/.forge-social/config.json`:

```json
{
  "engage_enabled": true,
  "engage_like": true,
  "engage_follow_back": true,
  "engage_reply_enabled": false,
  "engage_reply_templates": [
    "Thanks {handle}!",
    "Appreciate it, {handle}!"
  ],
  "engage_daily_cap": 20
}
```

| Action | Config flag | Risk | Notes |
|---|---|---|---|
| Like | `engage_like: true` | Low | Likes back replies, mentions, likes received |
| Follow-back | `engage_follow_back: true` | Low | Follows back new followers |
| Reply | `engage_reply_enabled: true` | **High** | Opt-in only; templated; may violate ToS if over-used |

Decision precedence per notification: follow-back > reply > like > skip.

Reply templates support `{handle}` and `{name}` substitution. One template is chosen at random per reply.

Safety guarantees: dedup (SQLite `engagement_actions`), daily cap (`engage_daily_cap`, default 20), only YOUR inbound notifications, `--dry-run` prints intended actions with no API calls.

> **ToS warning:** Review Bluesky's and Mastodon's automation policies before enabling, especially `engage_reply_enabled`. The operator bears full responsibility.

---

## Security / Safety

- Credentials live in `~/.forge-social/.env` (chmod 600). Never committed.
- Chrome profiles + SQLite DB in `~/.forge-social/`. Never committed.
- Captcha detected → process stops + optional Telegram alert (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`).
- Conservative caps baked in. Hard ceilings enforced in code; config cannot exceed them.
- Brand URLs/handles from env only; never hardcoded in post text or campaign files.
- `--dry-run` is available on `post`, `dry-run`, `campaign run`, `daemon`, and `engage` — always use it first.
- Automating social media may violate platform ToS. Operator bears full responsibility.

---

## Known limitations

- Instagram requires an image; text-only posts not supported.
- LinkedIn DOM selectors `@unverified` — ported, not confirmed live.
- `--platform all` posts sequentially with 60 s gap between browser platforms; no true parallel.
- Headless mode intentionally disabled — real Chrome only.
- X image upload uses `setInputFiles` on `input[data-testid="fileInput"]`; fragile to X DOM changes.
- Instagram post flow may need selector updates on Meta DOM changes.

---

## License

MIT 2026 sbknext
