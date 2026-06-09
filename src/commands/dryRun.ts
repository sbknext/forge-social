import chalk from 'chalk';
import type { Platform } from '../types.js';
import { loadConfig, platformConfig } from '../core/config.js';
import { getDb } from '../core/db.js';
import { canRunNow, remainingQuota } from '../core/limiter.js';
import { validateImage } from '../core/image.js';

interface DryRunOptions {
  platform: Platform | 'all';
  text: string;
  image?: string;
  tags: string[];
}

export async function dryRun(opts: DryRunOptions): Promise<void> {
  const config = loadConfig();
  const db = getDb();

  const platforms: Platform[] =
    opts.platform === 'all' ? ['x', 'instagram', 'linkedin', 'bluesky', 'mastodon', 'devto'] : [opts.platform];

  console.log(chalk.bold.cyan('[dry-run] No browser will be opened.\n'));

  for (const platform of platforms) {
    console.log(chalk.bold(`[${platform}]`));

    // Active hours
    const inWindow = canRunNow(config);
    const [start, end] = config.active_hours;
    if (!inWindow) {
      console.log(chalk.yellow(`  outside active hours (${start}:00–${end}:00 ${config.active_tz})`));
    } else {
      console.log(chalk.green(`  active hours OK (${start}:00–${end}:00 ${config.active_tz})`));
    }

    // Quota
    const quota = remainingQuota(config, db, platform);
    const cap = platformConfig(config, platform).daily_cap;
    if (quota > 0) {
      console.log(chalk.green(`  quota: ${quota} remaining (cap ${cap}/day)`));
    } else {
      console.log(chalk.yellow(`  quota: 0 remaining (cap ${cap}/day) — would be blocked`));
    }

    // Image validation
    if (opts.image) {
      const result = validateImage(opts.image, platform);
      if (result.valid) {
        console.log(chalk.green(`  image: ${opts.image} OK`));
      } else {
        console.log(chalk.red(`  image: ${result.error}`));
      }
    } else {
      if (platform === 'instagram') {
        console.log(chalk.yellow('  image: missing (Instagram requires an image)'));
      } else {
        console.log(chalk.dim('  image: none'));
      }
    }

    // Text
    const textSnippet = opts.text.length > 60 ? opts.text.slice(0, 57) + '...' : opts.text;
    const tags = opts.tags.length > 0 ? opts.tags.join(' ') : '(none)';
    console.log(chalk.dim(`  text:  "${textSnippet}"`));
    console.log(chalk.dim(`  tags:  ${tags}`));

    const wouldPost = inWindow && quota > 0;
    if (wouldPost) {
      console.log(chalk.green(`  result: would post`));
    } else {
      console.log(chalk.yellow(`  result: would be blocked`));
    }
    console.log('');
  }
}
