import chalk from 'chalk';
import ora from 'ora';
import type { Platform } from '../types.js';
import { loadConfig, platformConfig } from '../core/config.js';
import { getDb, recordPost, incrementToday } from '../core/db.js';
import { canRunNow, remainingQuota, randomDelay } from '../core/limiter.js';
import { validateImage } from '../core/image.js';
import { getEnv } from '../core/env.js';
import { XAdapter } from '../platforms/x/index.js';
import { InstagramAdapter } from '../platforms/instagram/index.js';
import { LinkedInAdapter } from '../platforms/linkedin/index.js';
import { BlueskyAdapter } from '../platforms/bluesky/index.js';
import { MastodonAdapter } from '../platforms/mastodon/index.js';
import { DevtoAdapter } from '../platforms/devto/index.js';
import { loadBrand, renderBrand } from '../core/brand.js';
import type { PlatformAdapter, PostContent } from '../types.js';

interface PostOptions {
  platform: Platform | 'all';
  text: string;
  image?: string;
  tags: string[];
  force?: boolean;
}

export async function post(opts: PostOptions): Promise<void> {
  // Render brand placeholders in post text
  const brand = loadBrand();
  opts = { ...opts, text: renderBrand(opts.text, brand) };

  const config = loadConfig();
  const db = getDb();

  const platforms: Platform[] =
    opts.platform === 'all' ? ['x', 'instagram', 'linkedin', 'bluesky', 'mastodon', 'devto'] : [opts.platform];

  for (let i = 0; i < platforms.length; i++) {
    const platform = platforms[i];

    if (i > 0) {
      // Extra delay between platforms when posting to all
      console.log(chalk.dim('  waiting 60s between platforms...'));
      await new Promise(r => setTimeout(r, 60000));
    }

    await postToPlatform(platform, opts, config, db);
  }
}

async function postToPlatform(
  platform: Platform,
  opts: PostOptions,
  config: ReturnType<typeof loadConfig>,
  db: ReturnType<typeof getDb>,
): Promise<void> {
  console.log(chalk.bold(`\n[${platform}]`));

  // Active hours check
  if (!opts.force && !canRunNow(config)) {
    const [start, end] = config.active_hours;
    console.log(chalk.yellow(`  outside active hours (${start}:00–${end}:00 ${config.active_tz})`));
    console.log(chalk.dim('  use --force to override'));
    return;
  }

  // Quota check
  const quota = remainingQuota(config, db, platform);
  if (quota <= 0) {
    const cap = platformConfig(config, platform).daily_cap;
    console.log(chalk.yellow(`  daily cap reached (${cap}/${cap})`));
    return;
  }

  // Image validation
  if (opts.image) {
    const result = validateImage(opts.image, platform);
    if (!result.valid) {
      console.log(chalk.red(`  image error: ${result.error}`));
      recordPost(db, platform, opts.text, opts.image ?? null, opts.tags.join(',') || null, 'error', result.error);
      return;
    }
  }

  const content: PostContent = {
    text: opts.text,
    imagePath: opts.image,
    tags: opts.tags,
  };

  const adapter: PlatformAdapter =
    platform === 'x' ? new XAdapter()
    : platform === 'instagram' ? new InstagramAdapter()
    : platform === 'linkedin' ? new LinkedInAdapter()
    : platform === 'bluesky' ? new BlueskyAdapter()
    : platform === 'mastodon' ? new MastodonAdapter()
    : new DevtoAdapter();

  // Verify logged in
  const spinner = ora('Checking session...').start();
  const loggedIn = await adapter.isLoggedIn();
  if (!loggedIn) {
    spinner.fail(`Not logged in to ${platform}. Run: forge-social login --platform ${platform}`);
    await adapter.close();
    return;
  }
  spinner.succeed('Session active');

  // Random delay before action
  await randomDelay(config, platform);

  // Post
  const postSpinner = ora(`Posting to ${platform}...`).start();
  try {
    await adapter.post(content);
    recordPost(db, platform, opts.text, opts.image ?? null, opts.tags.join(',') || null, 'success');
    incrementToday(db, platform);
    postSpinner.succeed(chalk.green(`Posted to ${platform}`));
  } catch (err) {
    const msg = (err as Error).message;
    const isCaptcha = msg.toLowerCase().includes('captcha') || msg.toLowerCase().includes('challenge');
    const status = isCaptcha ? 'captcha' : 'error';
    recordPost(db, platform, opts.text, opts.image ?? null, opts.tags.join(',') || null, status, msg);
    postSpinner.fail(`${isCaptcha ? 'Captcha' : 'Error'}: ${msg}`);

    if (isCaptcha) {
      await sendTelegramAlert(platform, 'Captcha/challenge detected — manual action needed');
    }
  } finally {
    await adapter.close();
  }
}

async function sendTelegramAlert(platform: Platform, message: string): Promise<void> {
  const token = getEnv('TELEGRAM_BOT_TOKEN');
  const chatId = getEnv('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return;

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const body = JSON.stringify({
      chat_id: chatId,
      text: `[forge-social/${platform}] ${message}`,
    });
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  } catch {
    // Non-fatal
  }
}
