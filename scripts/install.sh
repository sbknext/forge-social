#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== forge-social installer ==="
echo "Repo: $REPO_DIR"
echo ""

# Check Node
if ! command -v node &>/dev/null; then
  echo "Error: node not found. Install Node.js >=20." >&2
  exit 1
fi

NODE_MAJOR=$(node -e 'process.stdout.write(process.versions.node.split(".")[0])')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Error: Node.js >=20 required (found $NODE_MAJOR)" >&2
  exit 1
fi

cd "$REPO_DIR"

echo "Installing dependencies..."
npm install

echo "Building TypeScript..."
npm run build

echo "Installing playwright browsers (chromium only)..."
npx playwright install chromium

echo ""
echo "Done. Run:"
echo "  node $REPO_DIR/dist/cli.js init"
echo ""
echo "Or link globally:"
echo "  npm link"
echo "  forge-social init"
