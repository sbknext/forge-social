# Phase C Adversarial QA Report — forge-social v0.2.0-dev

Date: 2026-06-02
Reviewer: Claude Sonnet 4.6 (subagent)

---

## Gate Results

| Gate | Result |
|------|--------|
| `tsc --noEmit` | PASS (0 errors) |
| `npm run build` | PASS |
| `vitest run` | PASS — 145 tests, 9 suites |
| X post char limits (echo-forge.json) | PASS — all X-targeted posts render within 280 chars after brand substitution |
| JSON validity (echo-forge.json) | PASS |
| Post IDs unique (echo-forge.json) | PASS — 20 posts, 20 unique IDs |

---

## Must-Fix (3)

### M1 — LinkedIn campaign posts get tags appended twice

**Files:** `src/commands/campaign.ts:233–241`, `src/platforms/linkedin/post.ts:231–233`

**Reproduction:**
In `livePost` (campaign.ts), the rendered post is composed via `composeLinkedInPost` which appends `#tags` after `\n\n`, then the `PostContent` object is built with `tags: rendered.tags` still populated:

```typescript
// campaign.ts:233-241 (livePost)
const composedText = platform === 'linkedin'
  ? composeLinkedInPost(rendered.text, rendered.tags)  // <- appends "#AI #devtools"
  : rendered.text;

const content: PostContent = {
  text: composedText,
  tags: rendered.tags,  // <- ["AI", "devtools"] still present!
};
```

Then `post.ts` `_buildText` appends `content.tags` again:

```typescript
// post.ts:231-233
function _buildText(content: PostContent): string {
  const tags = content.tags.length > 0 ? '\n\n' + content.tags.join(' ') : '';
  return content.text + tags;  // <- appends "AI devtools" a second time (no # prefix)
}
```

**Result:** LinkedIn receives `...body\n\n#AI #devtools\n\nAI devtools` — the tags block appears twice, second time without `#` prefixes. Also inflates char count vs the `composeLinkedInPost` output the operator sees.

**Fix:** In `livePost`, pass `tags: []` in the `PostContent` when platform is linkedin (since tags are already baked into `composedText`):

```typescript
const content: PostContent = {
  text: composedText,
  imagePath: rendered.image,
  tags: platform === 'linkedin' ? [] : rendered.tags,
};
```

---

### M2 — Split daily-cap tracking: `post` command and `campaign run` use different tables

**Files:** `src/commands/post.ts:64`, `src/commands/campaign.ts:163`, `src/core/db.ts:75-88`, `src/core/db.ts:153-159`

**Root cause:** Two independent counters track "posts sent today":

- `post` command: enforces cap via `remainingQuota` → `todayCount` → `daily_count` table
- `campaign run`: enforces cap via `campaignSentToday` → `campaign_sent` table

Both paths call `incrementToday` (writes `daily_count`), but `campaignSentToday` reads `campaign_sent` — it is blind to direct `post` calls. Symmetrically, `remainingQuota` is blind to campaign posts.

**Impact:** Running 2 direct `post` commands then `campaign run` on LinkedIn (cap=2) sends 2+2=4 posts in a day. Same in reverse. The cap is bypassed.

**Fix options:**
1. Make `campaignSentToday` call `todayCount` (unify on `daily_count`), or
2. Make `remainingQuota` also check `campaign_sent` for the day, or
3. (Simplest) In `runForPlatform`, replace `campaignSentToday(db, platform)` with `todayCount(db, platform)` from db.ts. Both paths then read the same table; `incrementToday` already writes it on every post.

---

### M3 — `logins` table never inserts a `linkedin` row; `setLastLogin` is a silent no-op

**File:** `src/core/db.ts:57-58`

**Root cause:** `migrate()` seeds the `logins` table with rows for `x` and `instagram` but not `linkedin`:

```typescript
INSERT OR IGNORE INTO logins (platform, last_login_at) VALUES ('x', NULL);
INSERT OR IGNORE INTO logins (platform, last_login_at) VALUES ('instagram', NULL);
// linkedin row missing
```

`setLastLogin` runs `UPDATE logins SET last_login_at = ... WHERE platform = ?`. With no row for `linkedin`, the UPDATE matches 0 rows and silently does nothing. `login.ts` calls `setLastLogin(db, platform)` after a successful LinkedIn login — the timestamp is never recorded. `lastLogin(db, 'linkedin')` always returns `null`.

**Fix:** Add the missing seed row in `migrate`:

```typescript
INSERT OR IGNORE INTO logins (platform, last_login_at) VALUES ('linkedin', NULL);
```

---

## Should-Fix (3)

### S1 — `dryRun.ts:20` omits linkedin from `all` expansion

**File:** `src/commands/dryRun.ts:20`

```typescript
const platforms: Platform[] =
  opts.platform === 'all' ? ['x', 'instagram'] : [opts.platform];
//                                    ^ linkedin missing
```

`post.ts:32` and `campaign.ts normalisePlatforms` both expand `all` to `['x', 'instagram', 'linkedin']`. The dry-run command silently skips the LinkedIn quota/hours check when `--platform all` is passed.

**Fix:**
```typescript
opts.platform === 'all' ? ['x', 'instagram', 'linkedin'] : [opts.platform];
```

---

### S2 — `cli.ts:17` hardcodes version string; will drift from `package.json`

**File:** `src/cli.ts:17`

```typescript
.version('0.2.0-dev');  // hardcoded — will drift on every version bump
```

**Fix:** Read from `package.json` at build time or runtime:
```typescript
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };
// ...
.version(version);
```

---

### S3 — `cli.ts` program description still says "X + Instagram" only

**File:** `src/cli.ts:17`

```typescript
.description('Safe-pace social posting to X + Instagram. Real Chrome, zero passwords in repo.');
```

LinkedIn is fully wired (Phase B merged). Description is factually wrong in Phase C.

**Fix:** `'Safe-pace social posting to X, Instagram + LinkedIn.'`

---

## Nits (2)

### N1 — `linkedin/index.ts` contains 5 stale "TODO (integrator)" comments that are already done

**File:** `src/platforms/linkedin/index.ts:6-20`

All 5 TODOs (add to Platform union, add config, register in registry, wire login dispatch, replace Phase B stub) are already implemented. The `@see` comment on line 33 says `Platform = 'x' | 'instagram' (Phase B adds 'linkedin')` — this is stale; `types.ts` already has `linkedin` in the union making the `as Platform` cast redundant.

**Fix:** Delete the TODO block and the stale `@see` comment. Remove the `as Platform` cast.

---

### N2 — `echo-forge.json` post `bip-weeklog-1` says "52 tests green" (actual: 145)

**File:** `campaigns/echo-forge.json` — post id `bip-weeklog-1`

Post text: `→ 52 tests green`. Current suite has 145 passing tests. Minor content staleness but will be published as-is if sent.

**Fix:** Update post text to reflect actual count, or make it a round number for authenticity.

---

## Items Verified Clean

- `drip.ts nextToSend`: cap math correct (`remaining = dailyCap - sentTodayCount`; `remaining <= 0` guard fires correctly; no `|| 0` coercion hiding a zero-cap issue — `??` used throughout).
- `drip.ts` / `campaign.ts`: `'all'` platform posts are deduped correctly per `(campaign, platform, post_id)` triplet — an `all`-targeted post is tracked separately for each concrete platform.
- `brand.ts renderBrand`: space-collapse regex `/ {2,}/g` does not touch URLs (URLs have no spaces), does not strip newlines. Empty brand value creates `space\nnewline` orphan at most — cosmetic only.
- `brand.ts missingBrandKeys`: only warns on KNOWN keys that are actually used in the template — unknown placeholders left intact (correct signal for typos).
- `config.ts loadConfig`: ceiling enforced correctly for all 3 platforms (x≤10, ig≤5, li≤3). `??` used throughout (not `||`), so `daily_cap: 0` in a config file would not be coerced to a default.
- `captcha.ts CAPTCHA_URL_PATTERNS`: `Record<Platform, string[]>` includes `linkedin` entry — no runtime `undefined` on `platform === 'linkedin'`.
- `campaign run --dry-run`: confirmed no browser opened, no `campaign_sent` writes.
- `echo-forge.json` X posts: all 14 X-targeted posts render within 280 chars after full brand substitution with realistic URL lengths.
- `echo-forge.json`: valid JSON, 20 unique post IDs, no invalid platform names.
- `tsc --noEmit`: clean.
- `vitest run`: 145/145 pass.
