# Changelog

All notable changes to forge-social are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.3.0] — 2026-06-02

### Added

- **`doctor` command** (`forge-social doctor [--json]`) — offline selftest. Validates config, DB tables (`posts`, `daily_count`, `logins`, `campaign_sent`, `engagement_actions`), per-platform credentials (Chrome profile dir for browser platforms; env vars for API platforms), and brand env var coverage. No browser, no network. Recommended first step after install or credential change.
- **`daemon` command** — auto-drip a campaign on a configurable poll interval (default 60 s). Gates every post: active hours, daily cap, min-delay between posts. Captcha → Telegram alert + exit 1. `--once` for cron-friendly single pass. `--dry-run` prints what would post without opening a browser.
- **`schedule` command** — per-platform plan view: today's quota, campaign drip progress, active-hours status, next-eligible timestamp. `--json` for machine-readable output.
- **`report` command** — posting analytics: per-platform totals (total/success/error/today), per-campaign sent counts, recent posts table. `--json` for machine-readable output.
- **`media` command** — generate branded SVG/PNG image cards for campaign posts. Flags: `--file`, `--out <dir>`, `--size wide|square|both`, `--theme echo|forge|neutral`, `--attach` (rewrites campaign JSON `image` fields to generated wide card paths). PNG if `@napi-rs/canvas` is installed, else SVG graceful degrade.
- **Bluesky adapter** — AT Protocol HTTP API. `createSession` → `accessJwt` + `did`; `createPost` → `com.atproto.repo.createRecord`. Env: `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD`, `BLUESKY_PDS` (default `https://bsky.social`). Hard limit: 300 graphemes.
- **Mastodon adapter** — Fediverse REST API. `POST {instance}/api/v1/statuses` with Bearer token. Env: `MASTODON_INSTANCE`, `MASTODON_TOKEN`. Hard limit: 500 chars.
- **Dev.to adapter** — Forem REST API. Maps promo posts to articles (title from first text line, up to 4 cleaned tags). Env: `DEVTO_API_KEY`. No char limit.
- **Engagement command** (`forge-social engage --platform bluesky|mastodon [--dry-run] [--max <n>]`) — auto-like, follow-back, and optionally reply on Bluesky and Mastodon. OFF by default (`engage_enabled: false`). Dedup via `engagement_actions` table. Daily cap (`engage_daily_cap`, default 20). Reply is separately opt-in (`engage_reply_enabled`). Browser platforms not supported.
- **`src/core/engagement.ts`** — pure `decideAction` (precedence: follow-back > reply > like > skip), `canAct` (dedup + cap gate), `dedupKey`, `renderReply` (template substitution with `{handle}` / `{name}`).
- **`src/core/scheduler.ts`** — pure scheduling logic: `canPostNow`, `nextEligibleMs`, `planPlatform`. No I/O; all inputs injected for deterministic tests.
- **`src/core/doctor.ts`** — pure `runDoctorChecks` returning `DoctorReport`.
- **`src/core/card.ts`** — SVG card generation: gradient bg, accent bar, word-wrapped title, subtitle, footer; three themes (echo/forge/neutral); two sizes (wide 1200×675, square 1080×1080).
- **`src/core/render.ts`** — PNG rasterization via optional `@napi-rs/canvas`; graceful SVG degrade when absent.
- **CLI aliases:** `bsky` → bluesky, `masto` → mastodon, `dev.to` → devto, `li` → linkedin.
- **`all` platform expansion** now covers all 6 platforms: x, instagram, linkedin, bluesky, mastodon, devto.
- **Char-limit compose** in campaign runs: Bluesky posts truncated to 299 graphemes + `…`; Mastodon posts truncated to 499 chars + `…` with console warning.
- **`@napi-rs/canvas`** added to `optionalDependencies` — prebuilt binaries, no node-gyp.
- **359 Vitest tests, all green.**

### Changed

- `Platform` union extended from 3 to 6 values; all dispatch paths updated.
- Config defaults added for bluesky, mastodon, devto with enforced hard ceilings.
- `engagement_actions` table added to DB schema.
- `campaign run --platform` accepts `x | ig | linkedin | li | all` only (API platforms use `post` directly).

### Fixed

- `schedule` command printed each platform row twice — misaligned `console.log` alongside `process.stdout.write`. Removed the extra `console.log`; each platform now renders exactly one aligned row.

---

## [0.2.0] — 2026-06-02

### Added

- **Campaign engine** — `campaigns/` directory with JSON schema; `src/core/campaign.ts` loads and validates campaign files; `src/core/drip.ts` schedules next eligible post per platform (respects daily cap + dedup via `campaign_sent` DB table).
- **Brand placeholder system** — `src/core/brand.ts`; six `{placeholder}` tokens (`{echo_url}`, `{forge_url}`, `{mcp_url}`, `{handle}`, `{x_handle}`, `{ig_handle}`) resolved at post time from `FORGE_SOCIAL_*` env vars; unknown placeholders left intact as visible typo signal; `missingBrandKeys` warns before live post.
- **Campaign CLI subcommands** — `campaign list --file`, `campaign status --file`, `campaign run --file --platform [--dry-run] [--max <n>] [--force]`.
- **Bundled echo-forge campaign** — `campaigns/echo-forge.json`: 20 authored posts for echo-ai + forge + build-in-public across X, Instagram, and LinkedIn.
- **LinkedIn platform** — `src/platforms/linkedin/` (login, post, captcha detection); ported from private `forge-linkedin` repo; DOM selectors marked `@unverified`; conservative default cap 2/day (hard ceiling 3).
- **forge-linkedin sync script** — `scripts/sync-forge-linkedin.sh` for diffing and applying upstream selector changes from the private repo.
- **Porting notes** — `docs/PORTED-FROM-forge-linkedin.md` documenting what was ported and sync instructions.
- **`--platform linkedin | li`** accepted in `login`, `post`, `dry-run`, and `campaign run`.

---

## [0.1.0] — 2026-05-15

### Added

- X (Twitter) platform: login, post (text + image), captcha detection.
- Instagram platform: login, post (image required), captcha detection.
- Core: SQLite DB, rate-limit guard, daily cap enforcement, active-hours window.
- CLI commands: `init`, `login`, `post`, `dry-run`, `status`, `config`.
- Per-platform defaults (X: 5/day, Instagram: 3/day) with hard ceilings.
- Telegram alert hook on captcha stop.
- 145 Vitest tests.
