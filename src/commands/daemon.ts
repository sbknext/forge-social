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

/**
 * Abortable sleep: resolves early when `signal` fires (e.g. SIGINT sets stopping).
 * The returned promise always resolves (never rejects) so callers need no try/catch.
 */
function sleep(ms: number, signal?: { aborted: boolean; onAbort: (cb: () => void) => void }): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.onAbort(() => {
        clearTimeout(timer);
        resolve();
      });
    }
  });
}

/** Simple one-shot abort signal used to wake the inter-iteration sleep on SIGINT. */
function makeAbortSignal(): { aborted: boolean; abort: () => void; onAbort: (cb: () => void) => void } {
  let aborted = false;
  const listeners: Array<() => void> = [];
  return {
    get aborted() { return aborted; },
    abort() {
      if (!aborted) {
        aborted = true;
        for (const cb of listeners) cb();
      }
    },
    onAbort(cb: () => void) { listeners.push(cb); },
  };
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
  const sleepAbort = makeAbortSignal();

  // First SIGINT: set stopping flag + wake any in-progress sleep so Ctrl-C feels
  // responsive. The while (!stopping) check handles the actual exit — no process.exit.
  process.once('SIGINT', () => {
    console.log('\n[daemon] Caught SIGINT — finishing current iteration, then stopping…');
    stopping = true;
    sleepAbort.abort();

    // Second SIGINT escape hatch: user really wants out immediately.
    process.once('SIGINT', () => {
      console.log('\n[daemon] Second SIGINT — force exit');
      process.exit(130);
    });
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
    await sleep(intervalMs, sleepAbort);
  }
}
