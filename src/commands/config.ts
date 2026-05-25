import chalk from 'chalk';
import { loadConfig } from '../core/config.js';
import { forgePaths } from '../core/paths.js';

export async function printConfig(): Promise<void> {
  const config = loadConfig();
  const { config: configPath } = forgePaths();
  console.log(chalk.bold(`Config: ${configPath}\n`));
  console.log(JSON.stringify(config, null, 2));
}
