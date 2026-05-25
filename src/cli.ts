#!/usr/bin/env node
import { Command } from 'commander';
import { init } from './commands/init.js';
import { login } from './commands/login.js';
import { post } from './commands/post.js';
import { dryRun } from './commands/dryRun.js';
import { status } from './commands/status.js';
import { printConfig } from './commands/config.js';
import type { Platform } from './types.js';

const program = new Command();

program
  .name('forge-social')
  .description('Safe-pace social posting to X + Instagram. Real Chrome, zero passwords in repo.')
  .version('0.1.0');

program
  .command('init')
  .description('Scaffold ~/.forge-social/ with default config and empty .env')
  .action(() => init().catch(die));

program
  .command('login')
  .description('Open Chromium, log in to platform (manual or .env creds), persist session')
  .requiredOption('--platform <name>', 'Platform: x | ig')
  .action(opts => {
    const p = normalisePlatform(opts.platform);
    login(p).catch(die);
  });

program
  .command('post')
  .description('Post text + optional image to platform(s)')
  .requiredOption('--platform <name>', 'Platform: x | ig | all')
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
  .requiredOption('--platform <name>', 'Platform: x | ig | all')
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

program.parse();

function normalisePlatform(raw: string): Platform {
  if (raw === 'ig' || raw === 'instagram') return 'instagram';
  if (raw === 'x' || raw === 'twitter') return 'x';
  die(new Error(`Unknown platform: ${raw}. Use x | ig`));
}

function die(e: Error): never {
  console.error('Error:', e.message);
  process.exit(1);
}
