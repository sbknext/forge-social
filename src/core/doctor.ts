/**
 * doctor.ts — offline self-test for forge-social.
 *
 * runDoctorChecks is a PURE function — no I/O, no side-effects.
 * All I/O (loadConfig, getDb, fs checks, env reads) is done in doctorCmd.ts
 * and the results are passed in here for easy unit-testing.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlatformCredStatus {
  platform: string;
  kind: 'browser' | 'api';
  configured: boolean;
  detail: string;
}

export interface DoctorReport {
  configOk: boolean;
  configError?: string;
  dbTables: string[];
  dbOk: boolean;
  missingTables: string[];
  platforms: PlatformCredStatus[];
  brandKeysSet: string[];
  brandKeysMissing: string[];
  notes: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Exact table names created by db.ts migrate().
 * Keep in sync with the CREATE TABLE statements in src/core/db.ts.
 */
export const EXPECTED_TABLES: string[] = [
  'posts',
  'daily_count',
  'logins',
  'campaign_sent',
  'engagement_actions',
];

// ── Pure check function ───────────────────────────────────────────────────────

export interface DoctorInput {
  configOk: boolean;
  configError?: string;
  dbTables: string[];
  platforms: PlatformCredStatus[];
  brand: Record<string, string>;
  /** Set when loadBrand() threw; surfaced as a note rather than crashing the command. */
  brandError?: string;
}

/**
 * Pure function — never throws.
 * Derives the full DoctorReport from pre-collected inputs.
 */
export function runDoctorChecks(input: DoctorInput): DoctorReport {
  const notes: string[] = [];

  // ── DB table check ─────────────────────────────────────────────────────────
  const tableSet = new Set(input.dbTables);
  const missingTables = EXPECTED_TABLES.filter((t) => !tableSet.has(t));
  const dbOk = missingTables.length === 0;

  if (!dbOk) {
    notes.push(`Missing DB tables: ${missingTables.join(', ')}`);
  }

  // ── Config check ──────────────────────────────────────────────────────────
  if (!input.configOk && input.configError) {
    notes.push(`Config error: ${input.configError}`);
  }

  // ── Platform cred check ───────────────────────────────────────────────────
  for (const p of input.platforms) {
    if (!p.configured) {
      notes.push(`Platform ${p.platform} not configured: ${p.detail}`);
    }
  }

  // ── Brand key check ───────────────────────────────────────────────────────
  const brandKeysSet: string[] = [];
  const brandKeysMissing: string[] = [];

  if (input.brandError) {
    notes.push(`Brand load error: ${input.brandError}`);
  }

  for (const [key, value] of Object.entries(input.brand)) {
    if (!value) {
      brandKeysMissing.push(key);
    } else {
      brandKeysSet.push(key);
    }
  }

  if (brandKeysMissing.length > 0) {
    notes.push(`Brand keys not set: ${brandKeysMissing.join(', ')}`);
  }

  return {
    configOk: input.configOk,
    configError: input.configError,
    dbTables: input.dbTables,
    dbOk,
    missingTables,
    platforms: input.platforms,
    brandKeysSet,
    brandKeysMissing,
    notes,
  };
}
