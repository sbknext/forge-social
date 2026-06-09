/**
 * scheduleCmd.ts — "schedule" view command.
 *
 * Loads campaign + config + db and prints a per-platform plan table showing:
 *   - Sent today / daily cap
 *   - Campaign remaining (posts still in drip queue)
 *   - Active now (active_hours + weekends check)
 *   - Next eligible timestamp (when min-delay gate opens)
 *   - Whether the daemon can post right now + reason if not
 *
 * Usage (from CLI):
 *   forge-social schedule --file campaigns/echo-launch.json
 *   forge-social schedule --file campaigns/echo-launch.json --json
 *
 * ── Integrator note ───────────────────────────────────────────────────────────
 * This command uses the same lastPostAtMsShim as daemon.ts.
 * Replace with the real export once lastPostAtMs is added to src/core/db.ts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { resolve } from 'node:path';
import chalk from 'chalk';
import { loadCampaignFile, postsForPlatform } from '../core/campaign.js';
import { loadConfig } from '../core/config.js';
import { getDb, sentPostIds, todayCount, lastPostAtMs } from '../core/db.js';
import { canRunNow } from '../core/limiter.js';
import { planPlatform, type PlatformPlan } from '../core/scheduler.js';
import { dripProgress } from '../core/drip.js';
import type { Platform } from '../types.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlatformRow {
  platform: Platform;
  plan: PlatformPlan;
  campaignTotal: number;
  campaignSent: number;
  campaignRemaining: number;
}

// ── schedule ──────────────────────────────────────────────────────────────────

export interface ScheduleOptions {
  file: string;
  /** Output raw JSON instead of chalk table (default: false). */
  json?: boolean;
}

export async function schedule(opts: ScheduleOptions): Promise<void> {
  const absFile = resolve(opts.file);

  const campaign = loadCampaignFile(absFile);
  const config = loadConfig();
  const db = getDb();
  const nowMs = Date.now();
  const activeNow = canRunNow(config);

  const platforms: Platform[] = ['x', 'instagram', 'linkedin', 'bluesky', 'mastodon', 'devto'];
  const rows: PlatformRow[] = [];

  for (const platform of platforms) {
    // Only include platforms that have at least one post in the campaign
    if (postsForPlatform(campaign, platform).length === 0) continue;

    const platformCfg = config.platforms[platform];
    const sentToday = todayCount(db, platform);
    const lastPostMs = lastPostAtMs(db, platform);

    const plan = planPlatform(platform, {
      activeNow,
      sentToday,
      dailyCap: platformCfg.daily_cap,
      lastPostAtMs: lastPostMs,
      nowMs,
      minDelaySec: platformCfg.min_delay_sec,
    });

    const allSentIds = sentPostIds(db, campaign.name, platform);
    const progress = dripProgress(campaign, platform, allSentIds);

    rows.push({
      platform,
      plan,
      campaignTotal: progress.total,
      campaignSent: progress.sent,
      campaignRemaining: progress.remaining,
    });
  }

  if (opts.json) {
    // JSON output — serialise nextEligibleMs as ISO string for readability
    const out = rows.map((r) => ({
      platform: r.platform,
      sentToday: r.plan.sentToday,
      dailyCap: r.plan.dailyCap,
      remainingQuota: r.plan.remaining,
      campaignTotal: r.campaignTotal,
      campaignSent: r.campaignSent,
      campaignRemaining: r.campaignRemaining,
      activeNow: r.plan.canPost || r.plan.reason !== 'outside-hours',
      canPost: r.plan.canPost,
      reason: r.plan.reason ?? null,
      nextEligibleIso: r.plan.nextEligibleMs
        ? new Date(r.plan.nextEligibleMs).toISOString()
        : null,
    }));
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return;
  }

  // ── Chalk table ──────────────────────────────────────────────────────────────
  console.log(chalk.bold(`\nSchedule plan: ${campaign.name}`));
  console.log(chalk.dim(`As of ${new Date(nowMs).toLocaleString()} — active hours: ${activeNow ? chalk.green('YES') : chalk.red('NO')}\n`));

  if (rows.length === 0) {
    console.log(chalk.dim('  No platforms in campaign.\n'));
    return;
  }

  // Header
  console.log(
    chalk.bold(
      padR('Platform', 12) +
      padR('Today', 9) +
      padR('Campaign', 14) +
      padR('Active', 8) +
      'Next eligible / status'
    )
  );
  console.log(chalk.dim('─'.repeat(68)));

  for (const r of rows) {
    const todayStr = `${r.plan.sentToday}/${r.plan.dailyCap}`;
    const campaignStr = `${r.campaignSent}/${r.campaignTotal} (${r.campaignRemaining} left)`;
    const activeStr = r.plan.reason === 'outside-hours' ? chalk.red('no') : chalk.green('yes');

    let statusStr: string;
    if (r.plan.canPost) {
      statusStr = chalk.green('ready');
    } else if (r.plan.reason === 'outside-hours') {
      const [start, end] = config.active_hours;
      statusStr = chalk.yellow(`outside ${start}:00–${end}:00 ${config.active_tz}`);
    } else if (r.plan.reason === 'daily-cap') {
      statusStr = chalk.yellow('daily cap reached');
    } else if (r.plan.reason === 'too-soon') {
      const diffSec = Math.ceil((r.plan.nextEligibleMs - nowMs) / 1000);
      const waitStr = diffSec > 60 ? `${Math.ceil(diffSec / 60)}m` : `${diffSec}s`;
      statusStr = chalk.yellow(`wait ${waitStr} (min-delay)`);
    } else {
      statusStr = chalk.dim(r.plan.reason ?? 'unknown');
    }

    // Campaign exhausted marker
    const exhausted = r.campaignRemaining === 0 ? chalk.dim(' [done]') : '';

    // Single row per platform — avoid ANSI-in-pad issues by printing columns separately
    process.stdout.write(
      chalk.cyan(r.platform.padEnd(12)) +
      todayStr.padEnd(9) +
      campaignStr.padEnd(14) +
      (r.plan.reason === 'outside-hours' ? chalk.red('no'.padEnd(8)) : chalk.green('yes'.padEnd(8))) +
      statusStr + exhausted + '\n'
    );
  }

  console.log('');
}

// ── util ──────────────────────────────────────────────────────────────────────

function padR(s: string, n: number): string {
  return s.padEnd(n);
}
