import chalk from 'chalk';
import { getDb, recentPosts, lastLogin, todayCount } from '../core/db.js';
import { loadConfig, platformConfig } from '../core/config.js';
import type { Platform } from '../types.js';

export async function status(): Promise<void> {
  const db = getDb();
  const config = loadConfig();
  const platforms: Platform[] = ['x', 'instagram'];

  console.log(chalk.bold('\n=== forge-social status ===\n'));

  // Per-platform summary
  for (const platform of platforms) {
    const used = todayCount(db, platform);
    const cap = platformConfig(config, platform).daily_cap;
    const login = lastLogin(db, platform);

    const label = platform === 'x' ? 'X (Twitter)' : 'Instagram';
    const bar = buildBar(used, cap);
    console.log(chalk.bold(label));
    console.log(`  today: ${bar} ${used}/${cap}`);
    console.log(`  last login: ${login ? chalk.green(login) : chalk.dim('never')}`);
    console.log('');
  }

  // Last 10 posts
  const posts = recentPosts(db, 10);
  if (posts.length === 0) {
    console.log(chalk.dim('No posts yet.'));
    return;
  }

  console.log(chalk.bold('Last 10 posts:'));
  for (const p of posts) {
    const statusColor =
      p.status === 'success' ? chalk.green :
      p.status === 'captcha' ? chalk.yellow :
      p.status === 'error' ? chalk.red :
      chalk.dim;

    const snippet = p.text.length > 50 ? p.text.slice(0, 47) + '...' : p.text;
    const platform = p.platform.padEnd(10);
    const ts = p.posted_at.slice(0, 16);

    console.log(
      `  ${chalk.dim(ts)}  ${chalk.cyan(platform)} ${statusColor(p.status.padEnd(8))} "${snippet}"`,
    );
    if (p.error) {
      console.log(chalk.red(`    error: ${p.error}`));
    }
  }
  console.log('');
}

function buildBar(used: number, cap: number): string {
  const width = 10;
  const filled = Math.round((used / cap) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  const color = used >= cap ? chalk.red : used >= cap * 0.8 ? chalk.yellow : chalk.green;
  return color(`[${bar}]`);
}
