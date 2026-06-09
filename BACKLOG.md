# forge-social Backlog

Findings from PR #1 AI review (CodeRabbit + Greptile) not addressed in that PR.
Items already fixed or noted as false positives are excluded.

---

## Already fixed (commit 7637337 — do not relist)

- `src/commands/login.ts` — unknown-platform throw
- `src/commands/campaign.ts` — newline regex
- `src/commands/campaign.ts` — `Intl.Segmenter` guard

---

## False positive — skip

- `src/platforms/devto/client.ts:119` — header already correctly uses `api-key`. Not a bug.

---

## Open items

### P1 — FIXED

**[engage] Auto-LIKE self-likes own post** (`src/commands/engage.ts`)
- [x] Fixed: for `like`-kind notifications (Bluesky and Mastodon) the `like` action
  is now skipped — `subjectUri` is YOUR post (the subject the liker acted on), so
  favouriting it would self-like. No AT Protocol field reliably identifies the liker's
  own content from a `like` notification, so the safest fix is to skip.
  Added `// NOTE: needs live Bluesky/Mastodon verification` comments in both runners.

---

### P2 — FIXED

**[engage] Bluesky reply mis-threads** (`src/commands/engage.ts`)
- [x] Fixed: `EngagementItem` now carries `rootUri`/`rootCid` populated from
  `record.reply.root` when the Bluesky notification carries reply context, falling back
  to `subjectUri`/`subjectCid` when the subject is a top-level post (where parent = root).
  The reply builder now passes `item.rootUri`/`item.rootCid` as `rootUri`/`rootCid` and
  `item.subjectUri`/`item.subjectCid` as `parentUri`/`parentCid`.
  Limitation noted in comment: `mention` notifications without embedded reply context
  may still mis-thread deeply nested mentions; full accuracy requires a `getPostThread` fetch.
  Added `// NOTE: needs live Bluesky/Mastodon verification` comment.

**[scripts] Hardcoded macOS default in sync script** (`scripts/sync-forge-linkedin.sh`)
- [x] Fixed: removed hardcoded `/Users/sam/Documents/saas/forge-linkedin` default.
  `FORGE_LINKEDIN_PATH` is now required; script errors out with a usage message if absent.

---

### Major — FIXED

**[render] Fallback writeFile not guarded** (`src/core/render.ts`)
- [x] Fixed: SVG fallback `writeFile` is now wrapped in try/catch. On failure, logs to
  stderr and returns the error-result (ok: false) without throwing, honouring the
  documented "NEVER throws" contract.

**[doctorCmd] loadBrand() not wrapped** (`src/commands/doctorCmd.ts`)
- [x] Fixed: `loadBrand()` is now wrapped in try/catch. A throw is captured as
  `brandError`, passed to `runDoctorChecks`, and surfaced as a note in the doctor
  report instead of crashing the command.

**[engagement] Duplicate `EngageConfig` interface** (`src/core/engagement.ts`)
- [x] Fixed: renamed the runtime-shaped interface to `EngageRuntimeConfig`.
  Added `export type EngageConfig = EngageRuntimeConfig` for backwards-compat imports
  (existing test imports of `EngageConfig` continue to work).
  `decideAction` signature updated to use `EngageRuntimeConfig`.
  `engage.ts` updated to import `EngageRuntimeConfig`.

**[post] Inline adapter selection duplicates makeAdapter** (`src/commands/post.ts`)
- [x] Fixed: extracted `src/core/adapters.ts` with a single `makeAdapter(platform)`
  factory. Both `login.ts` and `post.ts` now import from there; all per-platform
  adapter imports removed from those files.

**[devto] Token-validation fetch has no timeout** (`src/platforms/devto/index.ts`)
- [x] Fixed: added `AbortController` with a 10 s timeout. Throws
  `"Dev.to token validation timed out after 10 s"` on abort; clears timer in finally.

**[mastodon] normalizeInstanceUrl accepts http://** (`src/platforms/mastodon/client.ts`)
- [x] Fixed: `http://` is now rejected with a descriptive error. Bare hostnames are
  assumed `https://`. Updated `tests/mastodon.test.ts` to assert on the throw.

**[package.json] @napi-rs/canvas pinned to old major** (`package.json:24`)
- [ ] DEFERRED: `^0.1.53` → `1.0.0` is a major bump. Needs separate evaluation —
  check breaking changes in changelog, verify canvas API compatibility with current
  usage in `src/core/render.ts`. Low-risk (optionalDependency) but out of scope here.

---

### Minor — FIXED

**[doctor] Brand value check misses null/undefined** (`src/core/doctor.ts`)
- [x] Fixed: `=== ''` replaced with `!value` to catch null/undefined.

**[bluesky] Misleading "No-op" comment** (`src/platforms/bluesky/index.ts`)
- [x] Fixed: comment updated to accurately describe the throw behaviour when
  credentials are absent.
