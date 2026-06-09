/**
 * daemon.ts — Campaign drip daemon.
 *
 * Runs a continuous (or single-pass) loop that checks each platform in the
 * campaign file and sends the next eligible post when all gates pass.
 *
 * Design principles:
 *   - ALL scheduling logic lives in src/core/scheduler.ts (pure + unit-tested).
 *   - This file is intentionally thin: load → check → post → sleep → repeat.
 *   - DOM interaction is delegated to postOne() (imported from campaign command).
 *   - Captcha detection → Telegram alert (if configured) + hard stop.
 *   - Graceful SIGINT: finish current iteration, then exit 0.
 *
 */

import { resolve } from 'node:path';
import { loadCampaignFile, postsForPlatform, type Campaign } from '../core/campaign.js';
import { loadBrand } from '../core/brand.js';
import { loadConfig } from '../core/config.js';
import { getDb, todayCount, lastPostAtMs } from '../core/db.js';
import { canRunNow } from '../core/limiter.js';
import { canPostNow } from '../core/scheduler.js';
import { postOne } from './campaign.js';
import type { Platform } from '../types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Send a Telegram alert if TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID are configured. */
async function alertTelegram(msg: string): Promise<void> {
  const token = process.env['TELEGRAM_BOT_TOKEN'];
  const chatId = process.env['TELEGRAM_CHAT_ID'];
  if (!token || !chatId) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: `[forge-social daemon] ${msg}` }),
    });
  } catch {
    // Alert failure must never crash the daemon — swallow silently
  }
}

/** Derive the list of concrete platforms present in a campaign. */
function campaignPlatforms(campaign: Campaign): Platform[] {
  const all: Platform[] = ['x', 'instagram', 'linkedin', 'bluesky', 'mastodon', 'devto'];
  return all.filter((p) => postsForPlatform(campaign, p).length > 0);
}

// ── daemon ────────────────────────────────────────────────────────────────────

export interface DaemonOptions {
  file: string;
  /** Polling interval in seconds between full passes (default: 60). */
  intervalSec?: number;
  /** Single-pass mode: run once then return (default: false). */
  once?: boolean;
  /** Dry-run: compute gates + select post but do not call browser adapter (default: false). */
  dryRun?: boolean;
}

/**
 * Run the campaign drip daemon.
 *
 * Loop body (runs for each pass):
 *   1. Reload campaign + brand + config + db on every pass (picks up live edits).
 *   2. For each platform in the campaign:
 *      a. Compute activeNow via canRunNow (active_hours + skip_weekends).
 *      b. Query sentToday, lastPostAtMs from DB.
 *      c. Run canPostNow gate check (pure, from scheduler.ts).
 *      d. If ok → call postOne; if it throws with a captcha signal → alert + stop.
 *   3. If `once` → return; else sleep `intervalSec` seconds.
 *   4. SIGINT → log "daemon stopping" + exit 0.
 */
export async function daemon(opts: DaemonOptions): Promise<void> {
  const absFile = resolve(opts.file);
  const intervalMs = (opts.intervalSec ?? 60) * 1000;
  const dryRun = opts.dryRun ?? false;
  let stopping = false;

  process.once('SIGINT', () => {
    console.log('\n[daemon] Caught SIGINT — daemon stopping');
    stopping = true;
    process.exit(0);
  });

  console.log(
    `[daemon] Starting${dryRun ? ' (dry-run)' : ''} — file: ${absFile}` +
    `${opts.once ? ' — single pass' : ` — interval: ${opts.intervalSec ?? 60}s`}`
  );

  while (!stopping) {
    // ── Load fresh state on every pass ──────────────────────────────────────
    let campaign: Campaign;
    let config: ReturnType<typeof loadConfig>;
    let db: ReturnType<typeof getDb>;

    try {
      campaign = loadCampaignFile(absFile);
      config = loadConfig();
      db = getDb();
    } catch (err) {
      console.error(`[daemon] Failed to load campaign/config/db: ${(err as Error).message}`);
      if (opts.once) return;
      await sleep(intervalMs);
      continue;
    }

    const brand = loadBrand();
    const platforms = campaignPlatforms(campaign);
    const nowMs = Date.now();

    console.log(`[daemon] Pass at ${new Date(nowMs).toISOString()} — platforms: ${platforms.join(', ') || 'none'}`);

    // ── Per-platform gate + post ─────────────────────────────────────────────
    for (const platform of platforms) {
      const platformCfg = config.platforms[platform];
      const activeNow = canRunNow(config);
      const sentToday = todayCount(db, platform);
      const lastPostMs = lastPostAtMs(db, platform);

      const gate = canPostNow({
        activeNow,
        sentToday,
        dailyCap: platformCfg.daily_cap,
        lastPostAtMs: lastPostMs,
        nowMs,
        minDelaySec: platformCfg.min_delay_sec,
      });

      if (!gate.ok) {
        console.log(`  [${platform}] skip — ${gate.reason}`);
        continue;
      }

      console.log(`  [${platform}] gate ok — posting next drip item...`);

      try {
        const result = await postOne(campaign, platform, brand, db, { dryRun });

        if (result.posted) {
          console.log(`  [${platform}] posted${result.id ? ` [${result.id}]` : ''}`);
        } else {
          console.log(`  [${platform}] nothing posted (all sent or cap met)`);
        }
      } catch (err) {
        const msg = (err as Error).message ?? String(err);

        // Treat any captcha-related error as a hard stop
        if (/captcha|challenge|verification required/i.test(msg)) {
          const alert = `CAPTCHA detected on ${platform} — daemon stopped. Message: ${msg}`;
          console.error(`[daemon] ${alert}`);
          await alertTelegram(alert);
          process.exit(1);
        }

        console.error(`  [${platform}] error: ${msg}`);
      }
    }

    // ── Loop control ─────────────────────────────────────────────────────────
    if (opts.once) {
      console.log('[daemon] Single-pass complete — exiting');
      return;
    }

    console.log(`[daemon] Sleeping ${opts.intervalSec ?? 60}s...`);
    await sleep(intervalMs);
  }
}
