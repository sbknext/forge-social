# forge-social

Safe-pace social posting for solo devs. Post to X (Twitter) and Instagram with one CLI. Real Chrome session, zero passwords in repo.

## Try it now

```bash
git clone https://github.com/sbknext/forge-social
cd forge-social
bash scripts/install.sh

forge-social init
# edit ~/.forge-social/.env with your credentials
forge-social login --platform x
forge-social login --platform ig
forge-social post --platform all \
  --text "Shipped forge-social." \
  --image hero.png \
  --tags "#AgenticAI,#Build"
```

## Commands

| Command | What it does |
|---|---|
| `init` | Scaffold `~/.forge-social/` — .env, config.json, DB |
| `login --platform x\|ig` | Open browser, persist session (cookies) |
| `post --platform x\|ig\|all --text ... [--image ...] [--tags ...]` | Post content |
| `dry-run --platform ...` | Validate inputs + quota, no browser |
| `status` | Today's counts + last 10 posts |
| `config` | Print active config |

## Security

- Credentials in `~/.forge-social/.env` (chmod 600). Never in repo.
- Chrome profiles + DB in `~/.forge-social/`. Never committed.
- Captcha detected → stops + optional Telegram alert.

## Defaults

| Platform | Daily cap | Min delay | Max delay |
|---|---|---|---|
| X | 5 posts | 5 min | 15 min |
| Instagram | 3 posts | 10 min | 30 min |

Active hours: 09:00–21:00 IST. Edit `~/.forge-social/config.json` to change.

## Known limitations

- Instagram post flow may need selector updates when Meta updates their DOM — check `src/platforms/instagram/post.ts`.
- X image upload uses `setInputFiles` on the hidden `input[data-testid="fileInput"]`. If X changes this, update `src/platforms/x/post.ts`.
- `--platform all` posts sequentially (X first, then IG) with a 60s gap.
- Headless mode is intentionally disabled — real Chrome only.
- IG requires an image; text-only IG posts are not supported.

## License

MIT 2026 sbknext
