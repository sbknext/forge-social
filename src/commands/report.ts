import chalk from 'chalk';
import { getDb } from '../core/db.js';
import { computePostSummary } from '../core/postStats.js';

export async function report(opts?: { json?: boolean }): Promise<void> {
  const db = getDb();
  const summary = computePostSummary(db, 10);

  if (opts?.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(chalk.bold('\n=== forge-social report ===\n'));

  // ── Per-platform totals ───────────────────────────────────────────────────
  const platforms = Object.keys(summary.byPlatform);
  if (platforms.length === 0) {
    console.log(chalk.dim('No posts recorded yet.'));
  } else {
    console.log(chalk.bold('Posts by platform:'));
    for (const platform of platforms) {
      const { total, success, error, today } = summary.byPlatform[platform];
      const successPct = total > 0 ? Math.round((success / total) * 100) : 0;
      const label = platform.padEnd(12);
      const successStr = chalk.green(`${success} ok`);
      const errorStr = error > 0 ? chalk.red(` ${error} err`) : '';
      const todayStr = chalk.cyan(`today: ${today}`);
      console.log(
        `  ${chalk.bold(label)} total: ${total}  ${successStr}${errorStr}  ${todayStr}  (${successPct}% success)`
      );
    }
    console.log('');
  }

  // ── Per-campaign sent counts ──────────────────────────────────────────────
  const campaigns = Object.keys(summary.byCampaign);
  if (campaigns.length > 0) {
    console.log(chalk.bold('Campaign sends:'));
    for (const campaign of campaigns) {
      const cnt = summary.byCampaign[campaign];
      console.log(`  ${chalk.magenta(campaign.padEnd(24))} ${cnt} sent`);
    }
    console.log('');
  }

  // ── Recent posts ─────────────────────────────────────────────────────────
  if (summary.recent.length === 0) {
    console.log(chalk.dim('No recent posts.'));
    return;
  }

  console.log(chalk.bold('Recent posts:'));
  for (const p of summary.recent) {
    const statusColor =
      p.status === 'success' ? chalk.green :
      p.status === 'captcha' ? chalk.yellow :
      p.status === 'error'   ? chalk.red   :
      chalk.dim;

    const snippet = p.text.length > 50 ? p.text.slice(0, 47) + '...' : p.text;
    const ts = p.posted_at.slice(0, 16);
    const platformLabel = p.platform.padEnd(10);

    console.log(
      `  ${chalk.dim(ts)}  ${chalk.cyan(platformLabel)} ${statusColor(p.status.padEnd(8))} "${snippet}"`
    );
  }
  console.log('');
}
