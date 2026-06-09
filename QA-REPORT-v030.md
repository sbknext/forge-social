# QA Report — forge-social v0.3.0 Release

Date: 2026-06-03
Scope: Adversarial QA across phases A–J

---

## Gates

| Gate | Result |
|------|--------|
| `npm run build` (tsc) | PASS — zero errors |
| `npx tsc --noEmit` | PASS — zero errors |
| `npx vitest run` | PASS — 359/359 tests green (20 test files) |

---

## Summary

- Must-fix: **3**
- Should-fix: **3**
- Nit: **4**

---

## Must-Fix

### BUG-1 — daemon.ts: `campaignPlatforms` only returns 3 platforms, drops bluesky/mastodon/devto

**File:** `src/commands/daemon.ts:86-88`

```ts
// WRONG:
function campaignPlatforms(campaign: Campaign): Platform[] {
  const all: Platform[] = ['x', 'instagram', 'linkedin'];   // ← hard-coded to 3
  return all.filter((p) => postsForPlatform(campaign, p).length > 0);
}
```

**Impact:** When a campaign has posts targeting bluesky, mastodon, or devto and the user runs `forge-social daemon`, those platforms are silently skipped entirely. The drip never fires for 3 of 6 platforms. The daemon logs "platforms: x, instagram, linkedin" even when the campaign has bluesky/mastodon entries.

**Fix:**
```ts
function campaignPlatforms(campaign: Campaign): Platform[] {
  const all: Platform[] = ['x', 'instagram', 'linkedin', 'bluesky', 'mastodon', 'devto'];
  return all.filter((p) => postsForPlatform(campaign, p).length > 0);
}
```

---

### BUG-2 — dryRun.ts: `all` platform expansion is missing bluesky, mastodon, devto

**File:** `src/commands/dryRun.ts:20`

```ts
// WRONG:
const platforms: Platform[] =
  opts.platform === 'all' ? ['x', 'instagram', 'linkedin'] : [opts.platform];
```

**Impact:** `forge-social dry-run --platform all` silently omits quota/hours checks for bluesky, mastodon, and devto. User thinks they are validating all 6 platforms but only 3 are shown. Misleading before a real `post --platform all` run.

**Fix:**
```ts
const platforms: Platform[] =
  opts.platform === 'all'
    ? ['x', 'instagram', 'linkedin', 'bluesky', 'mastodon', 'devto']
    : [opts.platform];
```

---

### BUG-3 — campaigns/echo-forge.json: 5 image paths reference non-existent files

**File:** `campaigns/echo-forge.json` (posts: echo-tiers-instagram, echo-cta-instagram, forge-linkedin-intro, forge-oss-ethos, bip-two-products)

```
assets/echo-tiers.png         — missing
assets/echo-screenshot.png    — missing
assets/forge-linkedin-demo.png — missing
assets/forge-oss.png          — missing
assets/echo-forge-dual.png    — missing
```

**Impact:** When any of these 5 posts is selected for posting (they target instagram and instagram is in the campaign), the adapter receives a non-existent image path. The `validateImage` check in `post.ts` and the browser adapter's `imagePath` handling will fail. For campaign run, the error is caught and logged, but the campaign still advances past these posts silently (no dedup write, so they will be retried — but will fail again every time).

**Fix:** Either create the image files before the v0.3.0 release, or remove the `image` field from those posts in the campaign JSON until the assets are ready. The campaign JSON is shipped in the repo so users who clone and run it will hit this.

---

## Should-Fix

### SHOULD-1 — daemon.ts alertTelegram silently dead in Node 18+ environments

**File:** `src/commands/daemon.ts:71-81`

```ts
const mod = await (import('node-fetch' as string) as Promise<{ default: FetchFn }>).catch(() => ({ default: null }));
const fetch = mod.default;
if (!fetch) return; // node-fetch not installed — skip silently
```

**Impact:** `node-fetch` is not listed as a dependency and the dynamic `import` string cast defeats bundler resolution. In a standard Node 18+ environment (which has global `fetch`), this import will fail silently (`.catch` returns `null`), so daemon captcha alerts are never sent. Meanwhile `post.ts`'s `sendTelegramAlert` correctly uses the global `fetch` directly and works fine. The inconsistency means captcha events on the daemon path are silently swallowed.

**Fix:** Replace the dynamic node-fetch import with global `fetch` (same pattern as `post.ts:138-149`):
```ts
async function alertTelegram(msg: string): Promise<void> {
  const token = process.env['TELEGRAM_BOT_TOKEN'];
  const chatId = process.env['TELEGRAM_CHAT_ID'];
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: `[forge-social daemon] ${msg}` }),
    });
  } catch { /* non-fatal */ }
}
```

---

### SHOULD-2 — LinkedIn: no char-limit guard before browser post in campaign run

**File:** `src/commands/campaign.ts:242-244` (livePost)

```ts
let composedText = platform === 'linkedin'
  ? composeLinkedInPost(rendered.text, rendered.tags)
  : rendered.text;
// No length check here for LinkedIn (unlike bluesky lines 247–256 and mastodon lines 260–263)
```

**Impact:** If a composed LinkedIn post exceeds 3000 chars, it is passed directly to the browser adapter which either fails with an opaque DOM error or the browser silently truncates. Bluesky and mastodon both get an explicit truncation warning and graceful truncation. LinkedIn is inconsistent: it will throw from the adapter (at DOM time), be caught by the outer try/catch, logged as an error, and the post is recorded as status=error. This means the user loses a campaign post slot with no actionable warning at the point of composition.

`validateLinkedInPost` exists in `linkedin/compose.ts` but is never called from any posting path.

**Fix:** Add after line 244:
```ts
if (platform === 'linkedin') {
  const { LINKEDIN_MAX_CHARS } = await import('../platforms/linkedin/compose.js');
  if (composedText.length > LINKEDIN_MAX_CHARS) {
    console.log(chalk.yellow(`  ⚠ [${post.id}] linkedin text ${composedText.length} chars > ${LINKEDIN_MAX_CHARS} — truncated`));
    composedText = composedText.slice(0, LINKEDIN_MAX_CHARS - 1) + '…';
  }
}
```

---

### SHOULD-3 — campaigns/echo-forge.json: `bip-weeklog-1` post text claims "145 tests green" (actual: 359)

**File:** `campaigns/echo-forge.json` post id `bip-weeklog-1`

```json
"text": "...→ 145 tests green\n\n..."
```

**Impact:** This campaign post ships in the repo and would be sent to X and LinkedIn. Users/followers seeing this post will see a factually stale stat. The project is at 359 tests. Minor credibility issue for a build-in-public audience.

**Fix:** Update to `→ 359 tests green` or replace with a version-neutral phrasing like `→ full test suite green`.

---

## Nits

### NIT-1 — Stale TODO comments in bluesky/index.ts, mastodon/index.ts, devto/index.ts

**Files:** `src/platforms/bluesky/index.ts:7`, `src/platforms/mastodon/index.ts:7`, `src/platforms/devto/index.ts:5`

All three say "Integrator TODO: add 'X' to the Platform union in src/types.ts, update config.ts platform caps, and wire this adapter in post.ts / campaign.ts." All three are already wired. These are stale copypaste from the initial phase scaffolding.

**Fix:** Remove the TODO block from all three adapter docstrings.

---

### NIT-2 — Stale shim documentation block in daemon.ts

**File:** `src/commands/daemon.ts:15-42`

The large block comment ("Two helpers are shimmed below with TODO markers") describes helpers `lastPostAtMs` and `postOne` as needing to be added to their respective modules — but both already exist (`lastPostAtMs` in `db.ts:176`, `postOne` in `campaign.ts:323`). The shim documentation is now misleading.

**Fix:** Delete lines 14–42 (the entire integrator checklist block). The imports at lines 48/51 already show the real sources.

---

### NIT-3 — daemon.ts comments say "postsForPlatform" is imported but unused elsewhere

**File:** `src/commands/daemon.ts:45`

```ts
import { loadCampaignFile, postsForPlatform, type Campaign } from '../core/campaign.js';
```

`postsForPlatform` is only used inside `campaignPlatforms`. Once BUG-1 is fixed (the function is rewritten to filter a hardcoded list), `postsForPlatform` may no longer be needed inside `campaignPlatforms`. Verify and remove if unused after BUG-1 fix.

---

### NIT-4 — cardFileName collisions possible for multi-campaign runs with same post IDs across campaigns

**File:** `src/core/card.ts:298-300`, `src/commands/media.ts:109`

```ts
export function cardFileName(postId: string, size: CardSize): string {
  return `${postId}-${size}.png`;
}
```

If two campaigns both have a post with id `intro-1`, running `media` for both into the same `--out` directory will silently overwrite the first campaign's card. There is no campaign namespace in the filename.

**Fix (optional):** Prefix with campaign name or accept a campaign param: `${campaignName}-${postId}-${size}.png`. Or document the limitation in help text.

---

## Detailed Findings — No Action Required (confirmed correct)

| Item | Status |
|------|--------|
| Cap tracking (post/campaign/daemon all use `daily_count` via `todayCount` + `incrementToday`) | Consistent |
| `??` vs `\|\|` for boolean config defaults in `engage.ts` (engage_like, engage_follow_back, engage_reply_enabled) | Correct — all use `??` |
| `engagementDone` dedup key with AT URIs containing colons (`at://did:plc:abc/...`) | Correct — slice(2, len-1).join(':') reconstructs URI |
| `decideAction` precedence (follow > reply > like > skip) | Correct per spec |
| `engage reply` guard in engage.ts lines 197 + 283 (`action === 'reply' && engageCfg.replyEnabled`) | Redundant but safe (decideAction already gates on replyEnabled) |
| `canPostNow` gate order (outside-hours, daily-cap, too-soon) | Correct |
| `loadConfig` backfills all 6 platform defaults for old configs | Correct |
| Hard ceilings in `loadConfig` (x≤10, ig≤5, li≤3, bsky≤10, masto≤10, devto≤2) | Correct |
| `doctor` EXPECTED_TABLES matches `db.ts migrate()` exactly (5 tables) | Correct |
| `xmlEscape` covers `& < > " '` for SVG safety | Correct |
| Bluesky grapheme truncation in `livePost` uses `Intl.Segmenter` | Correct |
| Mastodon `'reply'` notification type not in `mastodonTypeToKind` | Correct — Mastodon API uses `'mention'` for replies; no `'reply'` type exists in the standard Mastodon v3/v4 notification API |
| All 6 platforms wired in `post.ts` `'all'` expansion (line 35) | Correct |
| All 6 platforms wired in `campaign.ts` `normalisePlatforms` `'all'` branch (line 375) | Correct |
| All 6 platforms wired in `scheduleCmd.ts` platform list (line 58) | Correct |
| All 6 platforms wired in `login.ts` (no `'all'` path needed) | Correct |
| `cardFileName` produces deterministic, non-random names (no collision within one campaign) | Correct |
| `rasterizeSvgToPng` degrade path writes `.svg` without throwing | Correct |
| `postToArticle` devto title derivation (first non-empty non-URL line, truncated 100 chars) | Correct |
| Campaign JSON: unique post IDs | Correct — 20 posts, all unique |
| Campaign JSON: valid per `validateCampaign` schema | Correct |
| version string in `cli.ts` read from `package.json` at runtime (not hardcoded) | Correct |

---

*Report generated by adversarial QA pass, 2026-06-03.*
