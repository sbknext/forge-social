# Installation

## Requirements

- Node.js >= 20
- macOS / Linux (Windows untested)
- A real Chrome/Chromium install (Playwright downloads one automatically)

## Steps

```bash
git clone https://github.com/sbknext/forge-social
cd forge-social
bash scripts/install.sh     # installs deps, builds, downloads Chromium
forge-social init           # creates ~/.forge-social/ (config.json, .env, SQLite DB)
```

After init, run the selftest before setting up credentials:

```bash
forge-social doctor         # verify config + DB structure; shows which env vars are missing
```

---

## Credentials and env vars

Edit `~/.forge-social/.env` (chmod 600 — never commit):

```bash
# ── Browser platforms (X, Instagram, LinkedIn) ────────────────────────────────
X_USERNAME=your_x_handle
X_PASSWORD=your_x_password

IG_USERNAME=your_ig_handle
IG_PASSWORD=your_ig_password

LI_USERNAME=your_linkedin_email
LI_PASSWORD=your_linkedin_password

# ── API platforms ─────────────────────────────────────────────────────────────
# Bluesky — get an App Password at https://bsky.app/settings/app-passwords
BLUESKY_HANDLE=yourhandle.bsky.social
BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
# Optional — override PDS (default: https://bsky.social)
# BLUESKY_PDS=https://bsky.social

# Mastodon — generate a token at https://<instance>/settings/applications
MASTODON_INSTANCE=https://mastodon.social
MASTODON_TOKEN=your_mastodon_token

# Dev.to — get an API key at https://dev.to/settings/extensions
DEVTO_API_KEY=your_devto_api_key

# ── Brand placeholders for campaign posts ────────────────────────────────────
# Used to fill {echo_url}, {forge_url}, {mcp_url}, {handle}, {x_handle}, {ig_handle}
# in campaign post text. forge_url and mcp_url have built-in defaults; set the rest.
FORGE_SOCIAL_ECHO_URL=https://echo.yourdomain.com
FORGE_SOCIAL_FORGE_URL=https://forge.yourdomain.com
FORGE_SOCIAL_MCP_URL=https://mcp.yourdomain.com
FORGE_SOCIAL_HANDLE=@yourhandle
FORGE_SOCIAL_X_HANDLE=@yourxhandle
FORGE_SOCIAL_IG_HANDLE=@yourighandle

# ── Optional — Telegram alert on captcha ─────────────────────────────────────
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

---

## Log in to each platform

```bash
# Browser platforms — opens real Chrome; auto-fills if env vars are set
forge-social login --platform x
forge-social login --platform ig
forge-social login --platform linkedin    # first time: log in manually, then press Enter

# API platforms — validates tokens from env; no browser
forge-social login --platform bluesky
forge-social login --platform mastodon
forge-social login --platform devto
```

> **LinkedIn note:** DOM selectors are `@unverified` (ported from a private repo, not confirmed live). After logging in, always dry-run before live posting:
> ```bash
> forge-social campaign run --file campaigns/echo-forge.json --platform linkedin --dry-run
> ```

---

## Verify setup

```bash
forge-social doctor         # shows config OK, DB tables present, per-platform credential status, brand vars
forge-social status         # today's counts and last login per platform
```

---

## Optional: PNG image cards

`@napi-rs/canvas` is an optional dependency — prebuilt binaries, no node-gyp. Install it to get PNG output from the `media` command; without it `.svg` files are generated instead:

```bash
npm install @napi-rs/canvas
```

---

## Manual global link

```bash
npm link
# adds forge-social to PATH; alternative to bash scripts/install.sh
```

---

## Verify zero secrets

```bash
git ls-files | xargs grep -E "(PASSWORD=.+|@gmail|your_)" 2>/dev/null
# should return nothing
```
