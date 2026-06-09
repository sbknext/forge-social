import chalk from 'chalk';
import ora from 'ora';
import type { Platform } from '../types.js';
import { getEnv } from '../core/env.js';
import { getDb, setLastLogin } from '../core/db.js';
import { makeAdapter } from '../core/adapters.js';

/** API-based platforms that use token/env-var auth — no browser session. */
const API_PLATFORMS = new Set<Platform>(['bluesky', 'mastodon', 'devto']);

/** Return the env-var key(s) required for this platform, or null for API platforms. */
function credKeys(platform: Platform): { usernameKey: string; passwordKey: string } | null {
  if (platform === 'x') return { usernameKey: 'X_USERNAME', passwordKey: 'X_PASSWORD' };
  if (platform === 'instagram') return { usernameKey: 'IG_USERNAME', passwordKey: 'IG_PASSWORD' };
  if (platform === 'linkedin') return { usernameKey: 'LI_USERNAME', passwordKey: 'LI_PASSWORD' };
  return null; // API platforms use their own env vars
}

/** Print which env vars an API platform needs and their current status. */
function printApiCredStatus(platform: Platform): void {
  if (platform === 'bluesky') {
    const handle = getEnv('BLUESKY_HANDLE');
    const pw = getEnv('BLUESKY_APP_PASSWORD');
    console.log(chalk.dim(`  BLUESKY_HANDLE: ${handle ? handle : chalk.yellow('not set')}`));
    console.log(chalk.dim(`  BLUESKY_APP_PASSWORD: ${pw ? '****' : chalk.yellow('not set')}`));
    if (!handle || !pw) {
      console.log(chalk.yellow('  Set BLUESKY_HANDLE and BLUESKY_APP_PASSWORD in ~/.forge-social/.env'));
    }
  } else if (platform === 'mastodon') {
    const instance = getEnv('MASTODON_INSTANCE');
    const token = getEnv('MASTODON_TOKEN');
    console.log(chalk.dim(`  MASTODON_INSTANCE: ${instance ? instance : chalk.yellow('not set')}`));
    console.log(chalk.dim(`  MASTODON_TOKEN: ${token ? '****' : chalk.yellow('not set')}`));
    if (!instance || !token) {
      console.log(chalk.yellow('  Set MASTODON_INSTANCE and MASTODON_TOKEN in ~/.forge-social/.env'));
    }
  } else if (platform === 'devto') {
    const key = getEnv('DEVTO_API_KEY');
    console.log(chalk.dim(`  DEVTO_API_KEY: ${key ? '****' : chalk.yellow('not set')}`));
    if (!key) {
      console.log(chalk.yellow('  Set DEVTO_API_KEY in ~/.forge-social/.env'));
    }
  }
}

export async function login(platform: Platform): Promise<void> {
  const adapter = makeAdapter(platform);
  const isApiPlatform = API_PLATFORMS.has(platform);

  console.log(chalk.bold(`Logging in to ${platform}...`));

  if (isApiPlatform) {
    // API platforms: validate token, no browser
    printApiCredStatus(platform);
    await adapter.login();
  } else {
    // Browser platforms: use username/password from env
    const keys = credKeys(platform)!;
    const username = getEnv(keys.usernameKey);
    const password = getEnv(keys.passwordKey);
    if (username) {
      console.log(chalk.dim(`  username: ${username}`));
    } else {
      console.log(chalk.yellow(`  no ${keys.usernameKey} in ~/.forge-social/.env — manual login`));
    }
    await adapter.login(username, password);
  }

  // Verify session
  const spinner = ora('Verifying session...').start();
  const loggedIn = await adapter.isLoggedIn();
  if (loggedIn) {
    spinner.succeed(`Logged in to ${chalk.green(platform)}`);
    const db = getDb();
    setLastLogin(db, platform);
  } else {
    spinner.fail(`Session check failed for ${platform} — try again or log in manually`);
  }

  await adapter.close();
}
