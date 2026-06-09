#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'node:module';
import { init } from './commands/init.js';
import { login } from './commands/login.js';
import { post } from './commands/post.js';
import { dryRun } from './commands/dryRun.js';
import { status } from './commands/status.js';
import { printConfig } from './commands/config.js';
import { campaignList, campaignStatus, campaignRun } from './commands/campaign.js';
import { daemon } from './commands/daemon.js';
import { schedule } from './commands/scheduleCmd.js';
import { report } from './commands/report.js';
import { media } from './commands/media.js';
import { engage } from './commands/engage.js';
import { doctor } from './commands/doctorCmd.js';
import type { Platform } from './types.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
  .name('forge-social')
  .description('Safe-pace social posting to X + Instagram + LinkedIn + Bluesky + Mastodon + Dev.to. Real Chrome for browser platforms; HTTP API for Bluesky/Mastodon/Dev.to.')
  .version(version);

program
  .command('doctor')
  .description('Offline selftest: config, DB tables, per-platform credentials, brand env vars. Run this first after setup.')
  .option('--json', 'Output raw JSON')
  .action(opts => doctor({ json: !!opts.json }).catch(die));

program
  .command('init')
  .description('Scaffold ~/.forge-social/ with default config and empty .env')
  .action(() => init().catch(die));

program
  .command('login')
  .description('Log in to platform (browser session for x/ig/linkedin; token validation for bluesky/mastodon/devto)')
  .requiredOption('--platform <name>', 'Platform: x | ig | linkedin | bluesky | bsky | mastodon | masto | devto | dev.to')
  .action(opts => {
    const p = normalisePlatform(opts.platform);
    login(p).catch(die);
  });

program
  .command('post')
  .description('Post text + optional image to platform(s)')
  .requiredOption('--platform <name>', 'Platform: x | ig | linkedin | li | bluesky | bsky | mastodon | masto | devto | dev.to | all')
  .requiredOption('--text <text>', 'Post text')
  .option('--image <path>', 'Image file path')
  .option('--tags <tags>', 'Comma-separated hashtags, e.g. "#AI,#Build"')
  .option('--force', 'Post even outside active hours')
  .action(opts => {
    const tags = opts.tags ? (opts.tags as string).split(',').map((t: string) => t.trim()) : [];
    const platform = opts.platform === 'all' ? 'all' : normalisePlatform(opts.platform);
    post({ platform, text: opts.text, image: opts.image, tags, force: !!opts.force }).catch(die);
  });

program
  .command('dry-run')
  .description('Validate inputs + quota without opening browser or posting')
  .requiredOption('--platform <name>', 'Platform: x | ig | linkedin | li | bluesky | bsky | mastodon | masto | devto | dev.to | all')
  .requiredOption('--text <text>', 'Post text')
  .option('--image <path>', 'Image file path')
  .option('--tags <tags>', 'Comma-separated hashtags')
  .action(opts => {
    const tags = opts.tags ? (opts.tags as string).split(',').map((t: string) => t.trim()) : [];
    const platform = opts.platform === 'all' ? 'all' : normalisePlatform(opts.platform);
    dryRun({ platform, text: opts.text, image: opts.image, tags }).catch(die);
  });

program
  .command('status')
  .description("Today's counts, last 10 posts, last login per platform")
  .action(() => status().catch(die));

program
  .command('config')
  .description('Print current ~/.forge-social/config.json')
  .action(() => printConfig().catch(die));

// ── campaign command group ────────────────────────────────────────────────────

const campaignCmd = program
  .command('campaign')
  .description('Drip promotion posts from a campaign JSON file');

campaignCmd
  .command('list')
  .description('Print all posts in the campaign with metadata + brand-rendered preview')
  .requiredOption('--file <path>', 'Path to campaign JSON file')
  .action(opts => campaignList(opts.file).catch(die));

campaignCmd
  .command('status')
  .description('Per-platform drip progress (total/sent/remaining) from DB')
  .requiredOption('--file <path>', 'Path to campaign JSON file')
  .action(opts => campaignStatus(opts.file).catch(die));

campaignCmd
  .command('run')
  .description('Send next eligible posts for a platform (use --dry-run to preview)')
  .requiredOption('--file <path>', 'Path to campaign JSON file')
  .requiredOption('--platform <name>', 'Platform: x | ig | linkedin | li | all')
  .option('--dry-run', 'Print rendered posts without opening browser or posting')
  .option('--max <n>', 'Maximum posts to send in this run', parseInt)
  .option('--force', 'Run even outside active hours')
  .action(opts => {
    campaignRun({
      file: opts.file,
      platform: opts.platform,
      dryRun: !!opts.dryRun,
      max: opts.max,
      force: !!opts.force,
    }).catch(die);
  });

// ── daemon ────────────────────────────────────────────────────────────────────

program
  .command('daemon')
  .description('Auto-drip a campaign on schedule (active-hours, caps, captcha-stop). Ctrl-C to stop.')
  .requiredOption('--file <path>', 'Path to campaign JSON file')
  .option('--interval <sec>', 'Polling interval in seconds (default: 60)', parseInt)
  .option('--once', 'Run a single pass then exit')
  .option('--dry-run', 'Compute gates + select post but do not open browser or post')
  .action(opts => {
    daemon({
      file: opts.file,
      intervalSec: opts.interval,
      once: !!opts.once,
      dryRun: !!opts.dryRun,
    }).catch(die);
  });

// ── schedule ──────────────────────────────────────────────────────────────────

program
  .command('schedule')
  .description('Show per-platform posting plan + campaign drip progress.')
  .requiredOption('--file <path>', 'Path to campaign JSON file')
  .option('--json', 'Output raw JSON')
  .action(opts => {
    schedule({ file: opts.file, json: !!opts.json }).catch(die);
  });

// ── report ────────────────────────────────────────────────────────────────────

program
  .command('report')
  .description('Posting analytics: per-platform + per-campaign totals + recent posts.')
  .option('--json', 'Output raw JSON')
  .action(opts => {
    report({ json: !!opts.json }).catch(die);
  });

// ── media ─────────────────────────────────────────────────────────────────────

program
  .command('media')
  .description('Generate branded image cards for campaign posts (PNG if @napi-rs/canvas present, else SVG).')
  .requiredOption('--file <path>', 'Path to campaign JSON file')
  .option('--out <dir>', 'Output directory (default: assets/ relative to cwd)')
  .option('--size <wide|square|both>', 'Which size(s) to generate: wide | square | both (default: both)')
  .option('--theme <echo|forge|neutral>', 'Override auto-detected theme for all posts')
  .option('--attach', 'Rewrite campaign JSON image fields to the generated wide card paths')
  .action(opts => {
    media({
      file: opts.file,
      out: opts.out,
      size: opts.size,
      theme: opts.theme,
      attach: !!opts.attach,
    }).catch(die);
  });

// ── engage ────────────────────────────────────────────────────────────────────

program
  .command('engage')
  .description('Auto-like/follow-back/reply on Bluesky and Mastodon (API platforms only). OFF by default — set engage_enabled: true in config.')
  .requiredOption('--platform <name>', 'Platform: bluesky | mastodon')
  .option('--dry-run', 'Print intended actions without executing them')
  .option('--max <n>', 'Maximum notifications to process in this run', parseInt)
  .action(opts => {
    const p = opts.platform as string;
    if (p !== 'bluesky' && p !== 'mastodon') {
      die(new Error(`engage only supports bluesky or mastodon (browser platforms are not supported)`));
    }
    engage({
      platform: p as 'bluesky' | 'mastodon',
      dryRun: !!opts.dryRun,
      max: opts.max,
    }).catch(die);
  });

program.parse();

function normalisePlatform(raw: string): Platform {
  if (raw === 'ig' || raw === 'instagram') return 'instagram';
  if (raw === 'x' || raw === 'twitter') return 'x';
  if (raw === 'li' || raw === 'linkedin') return 'linkedin';
  if (raw === 'bsky' || raw === 'bluesky') return 'bluesky';
  if (raw === 'masto' || raw === 'mastodon') return 'mastodon';
  if (raw === 'devto' || raw === 'dev.to') return 'devto';
  die(new Error(`Unknown platform: ${raw}. Use x | ig | linkedin | li | bluesky | bsky | mastodon | masto | devto | dev.to`));
}

function die(e: Error): never {
  console.error('Error:', e.message);
  process.exit(1);
}
