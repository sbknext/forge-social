import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import chalk from 'chalk';
import { forgePaths } from '../core/paths.js';
import { defaultConfig, saveConfig } from '../core/config.js';
import { getDb } from '../core/db.js';

export async function init(): Promise<void> {
  const paths = forgePaths();

  // Create dirs
  for (const dir of [paths.home, paths.logs, paths.inbox, paths.profileX, paths.profileIg]) {
    mkdirSync(dir, { recursive: true });
  }

  // Write .env if missing
  if (!existsSync(paths.env)) {
    writeFileSync(
      paths.env,
      'X_USERNAME=\nX_PASSWORD=\nIG_USERNAME=\nIG_PASSWORD=\nTELEGRAM_BOT_TOKEN=\nTELEGRAM_CHAT_ID=\n',
      { mode: 0o600 },
    );
    console.log(chalk.green('  created'), paths.env, chalk.dim('(chmod 600)'));
  } else {
    console.log(chalk.yellow('  exists '), paths.env);
  }

  // Write config.json if missing
  if (!existsSync(paths.config)) {
    saveConfig(defaultConfig(), paths.config);
    console.log(chalk.green('  created'), paths.config);
  } else {
    console.log(chalk.yellow('  exists '), paths.config);
  }

  // Init DB (runs migrations)
  getDb(paths.db);
  console.log(chalk.green('  created'), paths.db);

  console.log('');
  console.log(chalk.bold('forge-social initialised at'), chalk.cyan(paths.home));
  console.log('');
  console.log('Next steps:');
  console.log(chalk.cyan(`  1. edit ${paths.env}`));
  console.log(chalk.cyan('  2. forge-social login --platform x'));
  console.log(chalk.cyan('  3. forge-social login --platform ig'));
  console.log(chalk.cyan('  4. forge-social post --platform x --text "Hello" --image photo.jpg --tags "#AI"'));
}
