# Ported from forge-linkedin

## What is ported

| forge-social file | forge-linkedin source | What was ported |
|---|---|---|
| `src/platforms/linkedin/selectors.ts` | `src/linkedin/auth.ts` | `LOGGED_IN_SELECTORS` array (search typeahead + Primary Navigation selectors) |
| `src/platforms/linkedin/selectors.ts` | `src/linkedin/captcha.ts` | `CAPTCHA_URL_PATTERNS`, `CAPTCHA_SELECTORS`, `CAPTCHA_TITLE_PATTERNS` |

The async login flow (`auth.ts`) and captcha detection logic (`captcha.ts`) in
`src/platforms/linkedin/` are re-implemented inside forge-social, wiring into
forge-social's own `PlatformAdapter` API, `core/browser.ts` persistent Chrome
context, and `core/captcha.ts` detection primitives. The *selector constants*
are synced verbatim from forge-linkedin so behaviour stays aligned.

## Why a port and not a private submodule

forge-social is a **public** repository.

Adding forge-linkedin as a git submodule would:

1. Break `git clone` for anyone who does not have access to the private repo.
2. Leak the path and existence of `forge-linkedin` in `.gitmodules` (a public
   file checked into the index).
3. Require all contributors to authenticate to a private repo just to build or
   test the public tool.

Copying the small selector/pattern constants is both safe and sufficient.
The sensitive parts of forge-linkedin (account credentials, scraping heuristics)
are not present in the ported code.

## Source repo + pinned version

- **Repo**: `github.com/sbknext/forge-linkedin` (private)
- **Pinned version**: `v0.5.0`
- **Files consulted at time of port**:
  - `src/linkedin/auth.ts` — `LOGGED_IN_SELECTORS`, `isLoggedIn()` logic
  - `src/linkedin/captcha.ts` — checkpoint/captcha URL + DOM + title patterns

## How to re-sync when forge-linkedin updates

Run the idempotent sync script:

```bash
# Dry run — prints a diff, writes nothing
bash scripts/sync-forge-linkedin.sh

# Or point at a non-default forge-linkedin path
bash scripts/sync-forge-linkedin.sh /path/to/forge-linkedin

# Apply the ported selectors to src/platforms/linkedin/selectors.ts
bash scripts/sync-forge-linkedin.sh --apply

# Apply from a custom path
bash scripts/sync-forge-linkedin.sh --apply /path/to/forge-linkedin
```

The script:

- Extracts `LOGGED_IN_SELECTORS`, `CAPTCHA_URL_PATTERNS`, `CAPTCHA_SELECTORS`,
  and `CAPTCHA_TITLE_PATTERNS` from the forge-linkedin source files.
- Emits a typed, `@unverified`-annotated `selectors.ts`.
- Backs up the existing `selectors.ts` with a timestamp before overwriting.
- Does **not** touch `index.ts`, `auth.ts`, `post.ts`, or `compose.ts`.
- Prints a reminder to review `git diff` before committing.

## Selector stability note

LinkedIn's selectors are marked `@unverified` because LinkedIn's DOM can change
without notice. Run a live session verification after each re-sync and update the
`// verified` timestamp comment in `selectors.ts` once confirmed.
