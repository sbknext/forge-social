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
forge-social init           # creates ~/.forge-social/
```

Edit `~/.forge-social/.env`:

```
X_USERNAME=your_x_handle
X_PASSWORD=your_x_password
IG_USERNAME=your_ig_handle
IG_PASSWORD=your_ig_password
# Optional — Telegram alerts on captcha
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Then log in to each platform:

```bash
forge-social login --platform x
forge-social login --platform ig
```

The browser will open. If auto-fill succeeds it will submit — otherwise log in manually and press Enter in the terminal.

## Manual global link

```bash
npm link
# adds forge-social to PATH
```

## Verify zero secrets

```bash
git ls-files | xargs grep -E "(PASSWORD=.+|@gmail|your_)" 2>/dev/null
# should return nothing
```
