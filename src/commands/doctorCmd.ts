/**
 * doctorCmd.ts — "doctor" command.
 *
 * Offline self-test: checks config, DB tables, platform credentials, and brand keys.
 * No browser launched, no network calls.
 *
 * Usage (from CLI):
 *   forge-social doctor
 *   forge-social doctor --json
 */

import { existsSync } from 'node:fs';
import chalk from 'chalk';
import { loadConfig } from '../core/config.js';
import { getDb } from '../core/db.js';
import { profileDir } from '../core/paths.js';
import { loadBrand } from '../core/brand.js';
import {
  runDoctorChecks,
  type PlatformCredStatus,
  type DoctorReport,
} from '../core/doctor.js';

// ── Env-var requirements per API platform ─────────────────────────────────────

const API_PLATFORM_VARS: Record<string, string[]> = {
  bluesky:  ['BLUESKY_HANDLE', 'BLUESKY_APP_PASSWORD'],
  mastodon: ['MASTODON_INSTANCE', 'MASTODON_TOKEN'],
  devto:    ['DEVTO_API_KEY'],
};

const BROWSER_PLATFORMS = ['x', 'instagram', 'linkedin'] as const;

// ── doctor ────────────────────────────────────────────────────────────────────

export interface DoctorOptions {
  json?: boolean;
}

export async function doctor(opts: DoctorOptions = {}): Promise<void> {
  // 1. Config
  let configOk = true;
  let configError: string | undefined;
  try {
    loadConfig();
  } catch (e) {
    configOk = false;
    configError = (e as Error).message;
  }

  // 2. DB tables
  let dbTables: string[] = [];
  try {
    const db = getDb();
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[];
    dbTables = rows.map((r) => r.name);
  } catch {
    // DB unreadable — dbTables stays empty; missing tables will surface
  }

  // 3. Platform cred statuses
  const platforms: PlatformCredStatus[] = [];

  // Browser platforms — check for persisted Chrome profile dir
  for (const plat of BROWSER_PLATFORMS) {
    const dir = profileDir(plat);
    const present = existsSync(dir);
    platforms.push({
      platform: plat,
      kind: 'browser',
      configured: present,
      detail: present ? 'session profile present' : `session profile absent (${dir})`,
    });
  }

  // API platforms — check env vars
  for (const [plat, vars] of Object.entries(API_PLATFORM_VARS)) {
    const missing = vars.filter((v) => !process.env[v]);
    const configured = missing.length === 0;
    platforms.push({
      platform: plat,
      kind: 'api',
      configured,
      detail: configured
        ? `${vars.join(', ')} set`
        : `missing env var(s): ${missing.join(', ')}`,
    });
  }

  // 4. Brand
  let brand: ReturnType<typeof loadBrand> | null = null;
  let brandError: string | undefined;
  try {
    brand = loadBrand();
  } catch (e) {
    brandError = (e as Error).message;
  }

  // 5. Run pure checks
  const report = runDoctorChecks({
    configOk,
    configError,
    dbTables,
    platforms,
    brand: (brand ?? {}) as unknown as Record<string, string>,
    brandError,
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  printReport(report);
}

// ── Chalk printer ─────────────────────────────────────────────────────────────

function ok(label: string): string  { return chalk.green('✓') + ' ' + label; }
function fail(label: string): string { return chalk.red('✗') + ' ' + label; }

function printReport(r: DoctorReport): void {
  console.log(chalk.bold('\nforge-social doctor\n'));

  // Config
  console.log(r.configOk ? ok('Config OK') : fail(`Config: ${r.configError ?? 'unknown error'}`));

  // DB
  console.log(r.dbOk
    ? ok(`DB tables OK (${r.dbTables.length} tables)`)
    : fail(`DB missing tables: ${r.missingTables.join(', ')}`));

  // Platforms
  console.log(chalk.bold('\nPlatform credentials:'));
  for (const p of r.platforms) {
    const tag  = `[${p.kind}]`.padEnd(9);
    const icon = p.configured ? chalk.green('✓') : chalk.red('✗');
    console.log(`  ${icon} ${chalk.cyan(p.platform.padEnd(12))} ${tag} ${p.detail}`);
  }

  // Brand keys
  console.log(chalk.bold('\nBrand keys:'));
  if (r.brandKeysSet.length > 0) {
    console.log(ok(`Set: ${r.brandKeysSet.join(', ')}`));
  }
  if (r.brandKeysMissing.length > 0) {
    console.log(fail(`Missing: ${r.brandKeysMissing.join(', ')}`));
  }
  if (r.brandKeysSet.length === 0 && r.brandKeysMissing.length === 0) {
    console.log(chalk.dim('  (no brand keys defined)'));
  }

  // Notes
  if (r.notes.length > 0) {
    console.log(chalk.bold('\nNotes:'));
    for (const note of r.notes) {
      console.log(chalk.yellow('  ! ') + note);
    }
  }

  // Summary line
  const allOk = r.configOk && r.dbOk && r.platforms.every((p) => p.configured) && r.brandKeysMissing.length === 0;
  console.log('');
  if (allOk) {
    console.log(chalk.green.bold('All checks passed.'));
  } else {
    console.log(chalk.yellow.bold('Some checks failed — see notes above.'));
  }
  console.log('');
}
