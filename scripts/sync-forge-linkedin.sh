#!/usr/bin/env bash
# sync-forge-linkedin.sh
#
# Re-ports the LinkedIn login/captcha selector logic from a local
# forge-linkedin checkout into forge-social so they stay aligned.
#
# Usage:
#   bash scripts/sync-forge-linkedin.sh [--apply] [PATH_TO_FORGE_LINKEDIN]
#
# Options:
#   --apply    Write the ported selectors/logic into forge-social (default: diff-only)
#
# PATH_TO_FORGE_LINKEDIN is required — no default to avoid non-portable assumptions.
#
# chmod note: after cloning forge-social run  chmod +x scripts/sync-forge-linkedin.sh
#
# Safety contract:
#   - Without --apply: prints a unified diff of upstream vs. ported files only.
#     Nothing is written. Review the diff, then re-run with --apply.
#   - With --apply: overwrites ONLY the ported sections (auth-selectors + captcha
#     constants) in the forge-social-specific files. Does NOT touch the adapter
#     wiring (index.ts, post.ts) or forge-social core.
#   - Idempotent: running --apply twice produces the same result.
#   - Never commits. Always prints "review git diff before committing."

set -euo pipefail

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
APPLY=false
FORGE_LINKEDIN_PATH=""

for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=true ;;
    --*) echo "Unknown flag: $arg" >&2; exit 1 ;;
    *) FORGE_LINKEDIN_PATH="$arg" ;;
  esac
done

if [[ -z "$FORGE_LINKEDIN_PATH" ]]; then
  echo "ERROR: FORGE_LINKEDIN_PATH argument is required." >&2
  echo "Usage: bash scripts/sync-forge-linkedin.sh [--apply] /path/to/forge-linkedin" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Validate source
# ---------------------------------------------------------------------------
SRC_AUTH="${FORGE_LINKEDIN_PATH}/src/linkedin/auth.ts"
SRC_CAPTCHA="${FORGE_LINKEDIN_PATH}/src/linkedin/captcha.ts"

if [[ ! -f "$SRC_AUTH" ]]; then
  echo "ERROR: forge-linkedin auth.ts not found at: $SRC_AUTH" >&2
  echo "Pass the correct path as an argument:  bash scripts/sync-forge-linkedin.sh /path/to/forge-linkedin" >&2
  exit 1
fi

if [[ ! -f "$SRC_CAPTCHA" ]]; then
  echo "ERROR: forge-linkedin captcha.ts not found at: $SRC_CAPTCHA" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Locate forge-social root (directory where this script lives under scripts/)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGE_SOCIAL_ROOT="$(dirname "$SCRIPT_DIR")"
DEST_LINKEDIN_DIR="${FORGE_SOCIAL_ROOT}/src/platforms/linkedin"
DEST_SELECTORS="${DEST_LINKEDIN_DIR}/selectors.ts"

echo ""
echo "=== sync-forge-linkedin ==="
echo "Source  : ${FORGE_LINKEDIN_PATH}"
echo "Dest    : ${DEST_LINKEDIN_DIR}"
echo "Mode    : $([ "$APPLY" = true ] && echo '--apply (write)' || echo 'diff-only (read-only)')"
echo ""

# ---------------------------------------------------------------------------
# Generate the ported selectors file content from the source
# ---------------------------------------------------------------------------
# We extract the LOGGED_IN_SELECTORS from auth.ts and the URL/DOM/title
# patterns from captcha.ts and emit a self-contained selectors.ts for
# forge-social that mirrors them but uses forge-social's own types/exports.
#
# Strategy: use grep/awk to extract the literal array values, then emit a
# typed TypeScript file. This is intentionally conservative — only selector
# constants are ported, not the full async login/captcha logic (which uses
# forge-linkedin's own core/env.js and readline patterns that differ from
# forge-social's PlatformAdapter API).

extract_array() {
  # Extract the content between the first '[' and matching ']' after the pattern
  local file="$1" pattern="$2"
  awk "
    /^${pattern}/ { capture=1; next }
    capture && /\[/ { depth++; buf=buf\$0\"\n\"; next }
    capture && depth>0 {
      buf=buf\$0\"\n\"
      if (/\]/) { depth--; if (depth==0) { print buf; capture=0; buf=\"\"; depth=0 } }
    }
  " "$file"
}

# Grab raw selector/pattern lines from source files
LOGGED_IN_SELECTORS=$(grep -A 20 'LOGGED_IN_SELECTORS' "$SRC_AUTH" | \
  awk '/LOGGED_IN_SELECTORS = \[/{found=1} found{print} /^\];/{found=0}')

CAPTCHA_URL_PATTERNS=$(grep -A 10 'CAPTCHA_URL_PATTERNS' "$SRC_CAPTCHA" | \
  awk '/CAPTCHA_URL_PATTERNS = \[/{found=1} found{print} /^\];/{found=0}')

CAPTCHA_SELECTORS=$(grep -A 10 'CAPTCHA_SELECTORS' "$SRC_CAPTCHA" | \
  awk '/^const CAPTCHA_SELECTORS = \[/{found=1} found{print} /^\];/{found=0}')

CAPTCHA_TITLE=$(grep -A 10 'CAPTCHA_TITLE_PATTERNS' "$SRC_CAPTCHA" | \
  awk '/CAPTCHA_TITLE_PATTERNS = \[/{found=1} found{print} /^\];/{found=0}')

# ---------------------------------------------------------------------------
# Build the ported selectors.ts content
# ---------------------------------------------------------------------------
SOURCE_VERSION="$(cd "$FORGE_LINKEDIN_PATH" && git describe --tags --always 2>/dev/null || echo 'unknown')"

GENERATED_CONTENT="// @unverified — needs live LinkedIn session to confirm these selectors still match.
// Ported from forge-linkedin @ ${SOURCE_VERSION}
// DO NOT EDIT manually — run  scripts/sync-forge-linkedin.sh --apply  to refresh from source.
//
// Only selector/pattern constants are ported here. The async login/captcha
// handling (which integrates with forge-social's PlatformAdapter API) lives
// in auth.ts and captcha.ts within this directory.

// ---------------------------------------------------------------------------
// Logged-in indicators — sourced from forge-linkedin/src/linkedin/auth.ts
// ---------------------------------------------------------------------------
${LOGGED_IN_SELECTORS}

export { LOGGED_IN_SELECTORS };

// ---------------------------------------------------------------------------
// Captcha / checkpoint detection — sourced from forge-linkedin/src/linkedin/captcha.ts
// ---------------------------------------------------------------------------
${CAPTCHA_URL_PATTERNS}

export { CAPTCHA_URL_PATTERNS };

${CAPTCHA_SELECTORS}

export { CAPTCHA_SELECTORS };

${CAPTCHA_TITLE}

export { CAPTCHA_TITLE_PATTERNS };

// ---------------------------------------------------------------------------
// URL constants
// ---------------------------------------------------------------------------
export const LINKEDIN_FEED_URL = 'https://www.linkedin.com/feed/';
export const LINKEDIN_LOGIN_URL = 'https://www.linkedin.com/login';
"

# ---------------------------------------------------------------------------
# Diff mode (default)
# ---------------------------------------------------------------------------
if [[ "$APPLY" = false ]]; then
  echo "--- Diff: existing selectors.ts vs. ported content from source ---"
  echo ""

  if [[ -f "$DEST_SELECTORS" ]]; then
    diff -u "$DEST_SELECTORS" <(echo "$GENERATED_CONTENT") || true
  else
    echo "[new file — does not yet exist in forge-social]"
    echo ""
    echo "$GENERATED_CONTENT"
  fi

  echo ""
  echo "--- auth.ts (upstream source, for reference) ---"
  diff -u /dev/null "$SRC_AUTH" || true

  echo ""
  echo "--- captcha.ts (upstream source, for reference) ---"
  diff -u /dev/null "$SRC_CAPTCHA" || true

  echo ""
  echo "=== No files written (diff-only mode). Run with --apply to port the changes. ==="
  exit 0
fi

# ---------------------------------------------------------------------------
# Apply mode — write ported selectors.ts
# ---------------------------------------------------------------------------
mkdir -p "$DEST_LINKEDIN_DIR"

# Back up existing file if present
if [[ -f "$DEST_SELECTORS" ]]; then
  TS="$(date +%Y%m%d-%H%M%S)"
  cp "$DEST_SELECTORS" "${DEST_SELECTORS}.bak.${TS}"
  echo "Backed up existing selectors.ts → selectors.ts.bak.${TS}"
fi

echo "$GENERATED_CONTENT" > "$DEST_SELECTORS"
echo "Wrote: ${DEST_SELECTORS}"

echo ""
echo "=== Done. Ported selector constants from forge-linkedin @ ${SOURCE_VERSION}. ==="
echo ""
echo "Files written:"
echo "  ${DEST_SELECTORS}"
echo ""
echo "Files NOT touched (forge-social adapter wiring — edit manually if needed):"
echo "  ${DEST_LINKEDIN_DIR}/index.ts"
echo "  ${DEST_LINKEDIN_DIR}/auth.ts"
echo "  ${DEST_LINKEDIN_DIR}/post.ts"
echo "  ${DEST_LINKEDIN_DIR}/compose.ts"
echo ""
echo "IMPORTANT: review git diff before committing."
