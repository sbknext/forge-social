/**
 * engage command — auto-like/follow-back/reply on Bluesky and Mastodon.
 *
 * SAFETY:
 *   - engagement_enabled is FALSE by default — set engage_enabled: true in
 *     ~/.forge-social/config.json to opt in.
 *   - engage_reply_enabled is separately opt-in (default false). Auto-replying
 *     to humans is ToS-sensitive and potentially spammy. Only enable after reading
 *     your platform's automation policy.
 *   - Daily cap (engage_daily_cap, default 20) limits total actions per day.
 *   - Dedup table (engagement_actions in DB) ensures each item is never acted on twice.
 *   - Only acts on notifications to YOUR account — never cold-targets others.
 *
 * Supports: bluesky, mastodon only.
 * Browser platforms (x / instagram / linkedin) are NOT supported for engagement
 * (notification scraping is too fragile + risky).
 */

import chalk from 'chalk';
import { getEnv } from '../core/env.js';
import { loadConfig } from '../core/config.js';
import { getDb, engagementActedToday, engagementDone, recordEngagement } from '../core/db.js';
import {
  decideAction,
  canAct,
  dedupKey,
  renderReply,
  type EngageConfig,
} from '../core/engagement.js';
import { createSession } from '../platforms/bluesky/client.js';
import {
  listNotifications as bskyListNotifications,
  likePost as bskyLike,
  followAccount as bskyFollow,
  replyToPost as bskyReply,
} from '../platforms/bluesky/engage.js';
import {
  listNotifications as mastoListNotifications,
  favourite as mastoFavourite,
  followAccount as mastoFollow,
  reply as mastoReply,
} from '../platforms/mastodon/engage.js';

export interface EngageOpts {
  platform: 'bluesky' | 'mastodon';
  dryRun?: boolean;
  max?: number;
}

interface EngageSummary {
  liked: number;
  followed: number;
  replied: number;
  skipped: number;
}

// ── Credential helpers ────────────────────────────────────────────────────────

function getBlueskyCreds(): { handle: string; appPassword: string; pds: string } | null {
  const handle = getEnv('BLUESKY_HANDLE');
  const appPassword = getEnv('BLUESKY_APP_PASSWORD');
  if (!handle || !appPassword) return null;
  return { handle, appPassword, pds: getEnv('BLUESKY_PDS') ?? 'https://bsky.social' };
}

function getMastodonCreds(): { instance: string; token: string } | null {
  const instance = getEnv('MASTODON_INSTANCE');
  const token = getEnv('MASTODON_TOKEN');
  if (!instance || !token) return null;
  return { instance, token };
}

// ── Template selection ────────────────────────────────────────────────────────

function pickTemplate(templates: string[]): string {
  if (!templates.length) return 'Thanks {handle}!';
  return templates[Math.floor(Math.random() * templates.length)];
}

// ── Main command ──────────────────────────────────────────────────────────────

export async function engage(opts: EngageOpts): Promise<void> {
  const { platform, dryRun = false, max } = opts;

  const config = loadConfig();

  // Guard: engagement globally disabled
  if (!config.engage_enabled) {
    console.log(
      chalk.yellow(
        'Engagement is disabled. Set "engage_enabled": true in ~/.forge-social/config.json to opt in.'
      )
    );
    return;
  }

  // Build EngageConfig from loaded config
  const engageCfg: EngageConfig = {
    likeEnabled: config.engage_like ?? true,
    followBackEnabled: config.engage_follow_back ?? true,
    replyEnabled: config.engage_reply_enabled ?? false,
    dailyCap: config.engage_daily_cap ?? 20,
  };

  const templates: string[] = config.engage_reply_templates ?? ['Thanks {handle}!'];

  const db = getDb();

  const summary: EngageSummary = { liked: 0, followed: 0, replied: 0, skipped: 0 };

  if (platform === 'bluesky') {
    await runBluesky({ engageCfg, templates, dryRun, max, db, summary });
  } else {
    await runMastodon({ engageCfg, templates, dryRun, max, db, summary });
  }

  // Summary
  const mode = dryRun ? chalk.cyan('[dry-run] ') : '';
  console.log('');
  console.log(
    `${mode}${chalk.bold('Engagement summary')} — liked: ${summary.liked}, followed: ${summary.followed}, replied: ${summary.replied}, skipped: ${summary.skipped}`
  );
}

// ── Bluesky runner ────────────────────────────────────────────────────────────

async function runBluesky(ctx: {
  engageCfg: EngageConfig;
  templates: string[];
  dryRun: boolean;
  max: number | undefined;
  db: import('better-sqlite3').Database;
  summary: EngageSummary;
}): Promise<void> {
  const { engageCfg, templates, dryRun, max, db, summary } = ctx;

  const creds = getBlueskyCreds();
  if (!creds) {
    console.log(chalk.red('Bluesky credentials missing. Set BLUESKY_HANDLE and BLUESKY_APP_PASSWORD.'));
    return;
  }

  let session: { accessJwt: string; did: string };
  try {
    session = await createSession(creds);
  } catch (err) {
    console.log(chalk.red(`Bluesky auth failed: ${(err as Error).message}`));
    return;
  }

  const { accessJwt, did } = session;
  const pds = creds.pds;

  let notifications;
  try {
    notifications = await bskyListNotifications(pds, accessJwt);
  } catch (err) {
    console.log(chalk.red(`Bluesky listNotifications failed: ${(err as Error).message}`));
    return;
  }

  const items = max !== undefined ? notifications.slice(0, max) : notifications;

  for (const item of items) {
    const action = decideAction(item, engageCfg);
    if (action === 'skip') {
      summary.skipped++;
      continue;
    }

    const actedToday = engagementActedToday(db, 'bluesky');
    const key = dedupKey('bluesky', item.kind, item.id, action);
    const alreadyActed = engagementDone(db, key);
    const gate = canAct({ actedToday, dailyCap: engageCfg.dailyCap, alreadyActed });

    if (!gate.ok) {
      console.log(chalk.dim(`  skip [${gate.reason}] ${item.kind} from ${item.authorHandle}`));
      summary.skipped++;
      if (gate.reason === 'daily-cap') break;
      continue;
    }

    if (dryRun) {
      console.log(chalk.cyan(`  [dry-run] would ${action} — ${item.kind} from ${item.authorHandle}`));
      updateSummary(summary, action);
      continue;
    }

    try {
      const now = new Date().toISOString();
      if (action === 'like') {
        await bskyLike(pds, accessJwt, did, item.subjectUri, item.subjectCid, now);
        console.log(chalk.green(`  liked — ${item.kind} from ${item.authorHandle}`));
      } else if (action === 'follow-back') {
        await bskyFollow(pds, accessJwt, did, item.authorId, now);
        console.log(chalk.green(`  followed — ${item.authorHandle}`));
      } else if (action === 'reply' && engageCfg.replyEnabled) {
        // Build reply: root = item root (or subject if follow root), parent = item subject
        const rootUri = item.subjectUri;
        const rootCid = item.subjectCid;
        const parentUri = item.subjectUri;
        const parentCid = item.subjectCid;
        const text = renderReply(pickTemplate(templates), {
          handle: `@${item.authorHandle}`,
          name: item.authorHandle,
        });
        await bskyReply(pds, accessJwt, did, rootUri, rootCid, parentUri, parentCid, text, now);
        console.log(chalk.green(`  replied — ${item.kind} from ${item.authorHandle}`));
      }
      recordEngagement(db, { platform: 'bluesky', kind: item.kind, itemId: item.id, action });
      updateSummary(summary, action);
    } catch (err) {
      console.log(chalk.red(`  error on ${action} for ${item.authorHandle}: ${(err as Error).message}`));
      break;
    }
  }
}

// ── Mastodon runner ───────────────────────────────────────────────────────────

async function runMastodon(ctx: {
  engageCfg: EngageConfig;
  templates: string[];
  dryRun: boolean;
  max: number | undefined;
  db: import('better-sqlite3').Database;
  summary: EngageSummary;
}): Promise<void> {
  const { engageCfg, templates, dryRun, max, db, summary } = ctx;

  const creds = getMastodonCreds();
  if (!creds) {
    console.log(chalk.red('Mastodon credentials missing. Set MASTODON_INSTANCE and MASTODON_TOKEN.'));
    return;
  }

  let notifications;
  try {
    notifications = await mastoListNotifications(creds.instance, creds.token);
  } catch (err) {
    console.log(chalk.red(`Mastodon listNotifications failed: ${(err as Error).message}`));
    return;
  }

  const items = max !== undefined ? notifications.slice(0, max) : notifications;

  for (const item of items) {
    const action = decideAction(item, engageCfg);
    if (action === 'skip') {
      summary.skipped++;
      continue;
    }

    const actedToday = engagementActedToday(db, 'mastodon');
    const key = dedupKey('mastodon', item.kind, item.id, action);
    const alreadyActed = engagementDone(db, key);
    const gate = canAct({ actedToday, dailyCap: engageCfg.dailyCap, alreadyActed });

    if (!gate.ok) {
      console.log(chalk.dim(`  skip [${gate.reason}] ${item.kind} from ${item.authorHandle}`));
      summary.skipped++;
      if (gate.reason === 'daily-cap') break;
      continue;
    }

    if (dryRun) {
      console.log(chalk.cyan(`  [dry-run] would ${action} — ${item.kind} from ${item.authorHandle}`));
      updateSummary(summary, action);
      continue;
    }

    try {
      if (action === 'like') {
        if (!item.subjectUri) {
          summary.skipped++;
          continue;
        }
        await mastoFavourite(creds.instance, creds.token, item.subjectUri);
        console.log(chalk.green(`  liked — ${item.kind} from ${item.authorHandle}`));
      } else if (action === 'follow-back') {
        await mastoFollow(creds.instance, creds.token, item.authorId);
        console.log(chalk.green(`  followed — ${item.authorHandle}`));
      } else if (action === 'reply' && engageCfg.replyEnabled) {
        if (!item.subjectUri) {
          summary.skipped++;
          continue;
        }
        const text = renderReply(pickTemplate(templates), {
          handle: `@${item.authorHandle}`,
          name: item.authorHandle,
        });
        await mastoReply(creds.instance, creds.token, item.subjectUri, text);
        console.log(chalk.green(`  replied — ${item.kind} from ${item.authorHandle}`));
      }
      recordEngagement(db, { platform: 'mastodon', kind: item.kind, itemId: item.id, action });
      updateSummary(summary, action);
    } catch (err) {
      console.log(chalk.red(`  error on ${action} for ${item.authorHandle}: ${(err as Error).message}`));
      break;
    }
  }
}

// ── Summary helper ────────────────────────────────────────────────────────────

function updateSummary(summary: EngageSummary, action: string): void {
  if (action === 'like') summary.liked++;
  else if (action === 'follow-back') summary.followed++;
  else if (action === 'reply') summary.replied++;
}
