import chalk from 'chalk';
import ora from 'ora';
import type { Platform } from '../types.js';
import { getEnv } from '../core/env.js';
import { getDb, setLastLogin } from '../core/db.js';
import { XAdapter } from '../platforms/x/index.js';
import { InstagramAdapter } from '../platforms/instagram/index.js';

export async function login(platform: Platform): Promise<void> {
  const adapter = platform === 'x' ? new XAdapter() : new InstagramAdapter();
  const usernameKey = platform === 'x' ? 'X_USERNAME' : 'IG_USERNAME';
  const passwordKey = platform === 'x' ? 'X_PASSWORD' : 'IG_PASSWORD';

  const username = getEnv(usernameKey);
  const password = getEnv(passwordKey);

  console.log(chalk.bold(`Logging in to ${platform}...`));
  if (username) {
    console.log(chalk.dim(`  username: ${username}`));
  } else {
    console.log(chalk.yellow(`  no ${usernameKey} in ~/.forge-social/.env — manual login`));
  }

  await adapter.login(username, password);

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
