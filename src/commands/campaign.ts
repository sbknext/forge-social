/**
 * Campaign command — drip promotion posts from a JSON campaign file.
 *
 * Subcommands:
 *   list   — print all posts in the campaign with metadata + rendered preview
 *   status — per-platform drip progress (total/sent/remaining)
 *   run    — send next eligible posts for a platform (dry-run safe)
 */

import chalk from 'chalk';
import { resolve } from 'node:path';
import { loadCampaignFile, renderCampaignPost, postsForPlatform } from '../core/campaign.js';
import { loadBrand, missingBrandKeys } from '../core/brand.js';
import { nextToSend, dripProgress } from '../core/drip.js';
import { loadConfig } from '../core/config.js';
import { getDb, markCampaignSent, sentPostIds, todayCount } from '../core/db.js';
import { canRunNow } from '../core/limiter.js';
import { XAdapter } from '../platforms/x/index.js';
import { InstagramAdapter } from '../platforms/instagram/index.js';
import { LinkedInAdapter } from '../platforms/linkedin/index.js';
import { BlueskyAdapter } from '../platforms/bluesky/index.js';
import { MastodonAdapter } from '../platforms/mastodon/index.js';
import { DevtoAdapter } from '../platforms/devto/index.js';
import { composeLinkedInPost, validateLinkedInPost, LINKEDIN_MAX_CHARS } from '../platforms/linkedin/compose.js';
import { BLUESKY_MAX } from '../platforms/bluesky/client.js';
import { MASTODON_MAX } from '../platforms/mastodon/client.js';
import type { Platform, PlatformAdapter, PostContent } from '../types.js';
import { recordPost, incrementToday } from '../core/db.js';

// ── campaign list ─────────────────────────────────────────────────────────────

export async function campaignList(file: string): Promise<void> {
  const absPath = resolve(file);
  const campaign = loadCampaignFile(absPath);
  const brand = loadBrand();

  console.log(chalk.bold(`\nCampaign: ${campaign.name}`));
  if (campaign.description) {
    console.log(chalk.dim(campaign.description));
  }
  console.log(chalk.dim(`${campaign.posts.length} posts\n`));

  for (const post of campaign.posts) {
    const rendered = renderCampaignPost(post, brand);
    const missing = missingBrandKeys(post.text, brand);
    const platforms = post.platforms.join(', ');
    const chars = rendered.text.length;

    console.log(chalk.cyan(`  [${post.id}]`) + chalk.dim(` platforms:${platforms}  chars:${chars}`));

    if (missing.length > 0) {
      console.log(chalk.yellow(`    ⚠ empty brand keys: ${missing.join(', ')}`));
    }

    // Preview: first 120 chars
    const preview = rendered.text.replace(/\\n/g, ' ').slice(0, 120);
    console.log(chalk.white(`    ${preview}${rendered.text.length > 120 ? '…' : ''}`));

    if (rendered.tags.length > 0) {
      console.log(chalk.dim(`    tags: ${rendered.tags.join(' ')}`));
    }
    if (rendered.image) {
      console.log(chalk.dim(`    image: ${rendered.image}`));
    }

    console.log('');
  }
}

// ── campaign status ───────────────────────────────────────────────────────────

export async function campaignStatus(file: string): Promise<void> {
  const absPath = resolve(file);
  const campaign = loadCampaignFile(absPath);
  const db = getDb();

  const platforms: Platform[] = ['x', 'instagram', 'linkedin', 'bluesky', 'mastodon', 'devto'];

  console.log(chalk.bold(`\nCampaign status: ${campaign.name}\n`));

  for (const platform of platforms) {
    const sent = sentPostIds(db, campaign.name, platform);
    const progress = dripProgress(campaign, platform, sent);
    const todaySentCount = todayCount(db, platform);

    const bar = renderProgressBar(progress.sent, progress.total);
    console.log(
      chalk.cyan(`  ${platform}`) +
        `  ${bar}  ` +
        chalk.white(`${progress.sent}/${progress.total} sent`) +
        chalk.dim(`  (${progress.remaining} remaining)`) +
        chalk.dim(`  today: ${todaySentCount}`)
    );
  }

  console.log('');
}

function renderProgressBar(sent: number, total: number, width = 20): string {
  if (total === 0) return chalk.dim('─'.repeat(width));
  const filled = Math.round((sent / total) * width);
  return chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(width - filled));
}

// ── campaign run ──────────────────────────────────────────────────────────────

interface CampaignRunOptions {
  file: string;
  platform: string; // 'x' | 'ig' | 'instagram' | 'all'
  dryRun: boolean;
  max?: number;
  force?: boolean;
}

export async function campaignRun(opts: CampaignRunOptions): Promise<void> {
  const absPath = resolve(opts.file);
  const campaign = loadCampaignFile(absPath);
  const brand = loadBrand();
  const config = loadConfig();
  const db = getDb();

  // Warn if important brand URLs are empty
  const allText = campaign.posts.map((p) => p.text).join(' ');
  const globalMissing = missingBrandKeys(allText, brand);
  if (globalMissing.length > 0) {
    console.log(
      chalk.yellow(`\n⚠ Brand placeholders with empty values: ${globalMissing.join(', ')}`)
    );
    console.log(chalk.dim('  Set env vars to fill them (see .env.example for names)\n'));
  }

  const platforms = normalisePlatforms(opts.platform);

  // Active hours check (global, unless --force)
  if (!opts.force && !canRunNow(config)) {
    const [start, end] = config.active_hours;
    console.log(
      chalk.yellow(
        `Outside active hours (${start}:00–${end}:00 ${config.active_tz}). Use --force to override.`
      )
    );
    return;
  }

  for (const platform of platforms) {
    await runForPlatform({ campaign, brand, config, db, platform, opts });
  }
}

async function runForPlatform({
  campaign,
  brand,
  config,
  db,
  platform,
  opts,
}: {
  campaign: ReturnType<typeof loadCampaignFile>;
  brand: ReturnType<typeof loadBrand>;
  config: ReturnType<typeof loadConfig>;
  db: ReturnType<typeof getDb>;
  platform: Platform;
  opts: CampaignRunOptions;
}): Promise<void> {
  console.log(chalk.bold(`\n[${platform}]`));

  const dailyCap = config.platforms[platform].daily_cap;
  const todaySent = todayCount(db, platform);
  const sent = sentPostIds(db, campaign.name, platform);
  const batch = nextToSend(campaign, platform, sent, dailyCap, todaySent);

  const max = opts.max ?? batch.length;
  const toPost = batch.slice(0, max);

  if (toPost.length === 0) {
    if (todaySent >= dailyCap) {
      console.log(chalk.yellow(`  Daily cap reached (${dailyCap}/${dailyCap}).`));
    } else {
      const progress = dripProgress(campaign, platform, sent);
      if (progress.remaining === 0) {
        console.log(chalk.green('  All posts sent for this platform.'));
      } else {
        console.log(chalk.dim('  No eligible posts.'));
      }
    }
    return;
  }

  console.log(chalk.dim(`  ${toPost.length} post(s) to send (cap: ${dailyCap}, sent today: ${todaySent})\n`));

  for (const post of toPost) {
    const rendered = renderCampaignPost(post, brand);
    const missing = missingBrandKeys(post.text, brand);

    if (missing.length > 0) {
      console.log(chalk.yellow(`  ⚠ [${post.id}] empty brand keys: ${missing.join(', ')}`));
    }

    if (opts.dryRun) {
      // Dry run — print rendered post, no browser
      console.log(chalk.cyan(`  [DRY-RUN] ${post.id}`));
      console.log(chalk.white(`  ${rendered.text}`));
      if (rendered.tags.length > 0) {
        console.log(chalk.dim(`  tags: ${rendered.tags.join(' ')}`));
      }
      if (rendered.image) {
        console.log(chalk.dim(`  image: ${rendered.image}`));
      }
      console.log('');
    } else {
      // Live post via platform adapter
      await livePost({ campaign, platform, post, rendered, db, opts });
    }
  }
}

async function livePost({
  campaign,
  platform,
  post,
  rendered,
  db,
  opts,
}: {
  campaign: ReturnType<typeof loadCampaignFile>;
  platform: Platform;
  post: { id: string };
  rendered: ReturnType<typeof renderCampaignPost>;
  db: ReturnType<typeof getDb>;
  opts: CampaignRunOptions;
}): Promise<void> {
  const adapter: PlatformAdapter =
    platform === 'x' ? new XAdapter()
    : platform === 'instagram' ? new InstagramAdapter()
    : platform === 'linkedin' ? new LinkedInAdapter()
    : platform === 'bluesky' ? new BlueskyAdapter()
    : platform === 'mastodon' ? new MastodonAdapter()
    : new DevtoAdapter();

  // For LinkedIn, compose via composeLinkedInPost to apply dedup/formatting rules.
  // Pass tags:[] so _buildText in post.ts does not append tags a second time.
  let composedText = platform === 'linkedin'
    ? composeLinkedInPost(rendered.text, rendered.tags)
    : rendered.text;

  // LinkedIn: 3000-char hard limit — truncate with warning if over.
  if (platform === 'linkedin') {
    const validation = validateLinkedInPost(composedText);
    if (!validation.ok) {
      console.log(chalk.yellow(`  ⚠ [${post.id}] linkedin text ${composedText.length} chars > ${LINKEDIN_MAX_CHARS} limit — truncated`));
      composedText = composedText.slice(0, LINKEDIN_MAX_CHARS - 1) + '…';
    }
  }

  // Bluesky: 300-grapheme hard limit — truncate with warning if over.
  if (platform === 'bluesky') {
    const graphemes =
      typeof Intl !== 'undefined' && 'Segmenter' in Intl
        ? [...new Intl.Segmenter().segment(composedText)].length
        : composedText.length;
    if (graphemes > BLUESKY_MAX) {
      console.log(chalk.yellow(`  ⚠ [${post.id}] bluesky text ${graphemes} graphemes > ${BLUESKY_MAX} limit — truncated`));
      const segs = [...new Intl.Segmenter().segment(composedText)].slice(0, BLUESKY_MAX - 1);
      composedText = segs.map((s) => s.segment).join('') + '…';
    }
  }

  // Mastodon: 500-char limit — truncate with warning if over.
  if (platform === 'mastodon' && composedText.length > MASTODON_MAX) {
    console.log(chalk.yellow(`  ⚠ [${post.id}] mastodon text ${composedText.length} chars > ${MASTODON_MAX} limit — truncated`));
    composedText = composedText.slice(0, MASTODON_MAX - 1) + '…';
  }

  const content: PostContent = {
    text: composedText,
    imagePath: rendered.image,
    tags: platform === 'linkedin' ? [] : rendered.tags,
  };

  try {
    const loggedIn = await adapter.isLoggedIn();
    if (!loggedIn) {
      console.log(
        chalk.red(
          `  Not logged in to ${platform}. Run: forge-social login --platform ${platform === 'instagram' ? 'ig' : platform}`
        )
      );
      await adapter.close();
      return;
    }

    console.log(chalk.dim(`  posting [${post.id}]...`));
    await adapter.post(content);

    // Record in both campaign_sent + regular posts table
    markCampaignSent(db, { campaign: campaign.name, platform, postId: post.id });
    recordPost(
      db,
      platform,
      rendered.text,
      rendered.image ?? null,
      rendered.tags.join(',') || null,
      'success'
    );
    incrementToday(db, platform);

    console.log(chalk.green(`  ✓ Posted [${post.id}]`));
  } catch (err) {
    const msg = (err as Error).message;
    recordPost(
      db,
      platform,
      rendered.text,
      rendered.image ?? null,
      rendered.tags.join(',') || null,
      'error',
      msg
    );
    console.log(chalk.red(`  ✗ Error posting [${post.id}]: ${msg}`));
  } finally {
    await adapter.close();
  }
}

// ── postOne ───────────────────────────────────────────────────────────────────

/**
 * Send the next eligible drip post for a single platform.
 * Returns { posted: true, id } on success, { posted: false, reason } if nothing to send.
 * Used by the daemon — thin wrapper around nextToSend + livePost.
 */
export async function postOne(
  campaign: ReturnType<typeof loadCampaignFile>,
  platform: Platform,
  brand: ReturnType<typeof loadBrand>,
  db: ReturnType<typeof getDb>,
  opts: { dryRun?: boolean },
): Promise<{ posted: boolean; id?: string; reason?: string }> {
  const config = loadConfig();
  const dailyCap = config.platforms[platform].daily_cap;
  const todaySent = todayCount(db, platform);
  const sent = sentPostIds(db, campaign.name, platform);

  const batch = nextToSend(campaign, platform, sent, dailyCap, todaySent);
  if (batch.length === 0) {
    return { posted: false, reason: 'nothing-eligible' };
  }

  const post = batch[0];
  const rendered = renderCampaignPost(post, brand);

  if (opts.dryRun) {
    // For linkedin compose via composeLinkedInPost
    const text =
      platform === 'linkedin'
        ? composeLinkedInPost(rendered.text, rendered.tags)
        : rendered.text;
    console.log(`  [dry-run] [${post.id}] ${text}`);
    if (rendered.tags.length > 0) {
      console.log(`  tags: ${rendered.tags.join(' ')}`);
    }
    if (rendered.image) {
      console.log(`  image: ${rendered.image}`);
    }
    return { posted: true, id: post.id };
  }

  // Live post — reuse the existing livePost path
  // Build a minimal opts object compatible with livePost's CampaignRunOptions
  const runOpts: CampaignRunOptions = {
    file: '',      // not used inside livePost
    platform,
    dryRun: false,
    force: true,   // gate already passed in daemon; skip re-check inside livePost
  };

  await livePost({ campaign, platform, post, rendered, db, opts: runOpts });
  return { posted: true, id: post.id };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function normalisePlatforms(raw: string): Platform[] {
  if (raw === 'all') return ['x', 'instagram', 'linkedin', 'bluesky', 'mastodon', 'devto'];
  if (raw === 'ig' || raw === 'instagram') return ['instagram'];
  if (raw === 'x' || raw === 'twitter') return ['x'];
  if (raw === 'li' || raw === 'linkedin') return ['linkedin'];
  if (raw === 'bsky' || raw === 'bluesky') return ['bluesky'];
  if (raw === 'masto' || raw === 'mastodon') return ['mastodon'];
  if (raw === 'devto' || raw === 'dev.to') return ['devto'];
  throw new Error(`Unknown platform: "${raw}". Use x | ig | linkedin | bluesky | mastodon | devto | all`);
}
