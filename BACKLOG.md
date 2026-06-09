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

### P1 — Fix soon (requires live Bluesky / Mastodon test)

**[engage] Auto-LIKE self-likes own post** (`src/commands/engage.ts:199`)
- Source: Greptile P1
- For a `like` notification, `item.subjectUri` is the URI of *your* post (the subject the liker acted on), so `bskyLike(...subjectUri)` self-likes your own content.
  Same issue in the Mastodon runner (~line 284): `mastoFavourite(...subjectUri)` self-favourites.
- Fix: like the liker's content or skip self-like; do not pass `subjectUri` as the target.
- Future PR: `fix(engage): resolve self-like on Bluesky and Mastodon`

---

### P2

**[engage] Bluesky reply mis-threads** (`src/commands/engage.ts:213`)
- Source: Greptile P2
- AT Protocol requires `reply.root` to be the thread root, not the immediate parent.
  Currently `rootUri = item.subjectUri` and `parentUri = item.subjectUri` — both set to parent.
- Fix: track/fetch the actual thread root URI for `reply.root`.
- Future PR: `fix(engage): set correct reply.root per AT Protocol`

**[scripts] Hardcoded macOS default in sync script** (`scripts/sync-forge-linkedin.sh:32`)
- Source: Greptile P2
- `FORGE_LINKEDIN_PATH` defaults to a developer macOS path; non-portable.
- Fix: require the argument; error out with a usage message if absent.
- Future PR: `fix(scripts): require FORGE_LINKEDIN_PATH arg, remove hardcoded default`

---

### Major

**[render] Fallback writeFile not guarded** (`src/core/render.ts:155`)
- `fallback writeFile` can throw despite the documented "NEVER throws" contract.
- Fix: wrap in `try/catch`; log and swallow.

**[doctorCmd] loadBrand() not wrapped** (`src/commands/doctorCmd.ts:102`)
- `loadBrand()` called without try-catch (unlike `loadConfig`); a throw crashes the doctor command.
- Fix: wrap in try-catch, surface as a diagnostic warning rather than an unhandled error.

**[engagement] Duplicate `EngageConfig` interface** (`src/core/engagement.ts:80`)
- A second `EngageConfig` interface defined here conflicts with the differently-shaped one in `src/types.ts`.
- Fix: remove duplicate; import from `src/types.ts` consistently.

**[post] Inline adapter selection duplicates makeAdapter** (`src/commands/post.ts:96`)
- Adapter selection logic in `post.ts` duplicates `makeAdapter` from `login.ts`.
- Fix: extract shared `src/core/adapters.ts` factory; import in both commands.

**[devto] Token-validation fetch has no timeout** (`src/platforms/devto/index.ts:46`)
- Can hang login indefinitely on an unresponsive Dev.to endpoint.
- Fix: add `AbortController` with a reasonable timeout (e.g. 10 s).

**[mastodon] normalizeInstanceUrl accepts http://** (`src/platforms/mastodon/client.ts:26`)
- Tokens transmitted over plain HTTP.
- Fix: enforce `https://`; reject or upgrade `http://` instances.

**[package.json] @napi-rs/canvas pinned to old major** (`package.json:24`)
- `^0.1.53` pinned; latest stable is `1.0.0` (major bump).
- Evaluate upgrade — it is an `optionalDependency`, so a test in CI with the new version is low risk.

---

### Minor

**[doctor] Brand value check misses null/undefined** (`src/core/doctor.ts:92`)
- `=== ''` check misses `null`/`undefined` values.
- Fix: use `!value`.

**[bluesky] Misleading "No-op" comment** (`src/platforms/bluesky/index.ts:56`)
- Comment says "No-op when credentials absent" but the code throws.
- Fix: update comment to reflect actual behavior.
