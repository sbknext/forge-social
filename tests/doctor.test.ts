import { describe, it, expect } from 'vitest';
import {
  runDoctorChecks,
  EXPECTED_TABLES,
  type PlatformCredStatus,
  type DoctorInput,
} from '../src/core/doctor.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function allTables(): string[] {
  return [...EXPECTED_TABLES];
}

function allPlatforms(): PlatformCredStatus[] {
  return [
    { platform: 'x',        kind: 'browser', configured: true, detail: 'session profile present' },
    { platform: 'instagram', kind: 'browser', configured: true, detail: 'session profile present' },
    { platform: 'linkedin',  kind: 'browser', configured: true, detail: 'session profile present' },
    { platform: 'bluesky',  kind: 'api',     configured: true, detail: 'BLUESKY_HANDLE, BLUESKY_APP_PASSWORD set' },
    { platform: 'mastodon', kind: 'api',     configured: true, detail: 'MASTODON_INSTANCE, MASTODON_TOKEN set' },
    { platform: 'devto',    kind: 'api',     configured: true, detail: 'DEVTO_API_KEY set' },
  ];
}

function fullBrand(): Record<string, string> {
  return {
    echo_url:  'https://echo.example.com',
    forge_url: 'https://forge.example.com',
    mcp_url:   'https://mcp.example.com',
    handle:    '@sam',
    x_handle:  '@sam_x',
    ig_handle: '@sam_ig',
  };
}

// ── EXPECTED_TABLES ───────────────────────────────────────────────────────────

describe('EXPECTED_TABLES', () => {
  it('contains exactly the 5 tables defined in db.ts migrate()', () => {
    expect(EXPECTED_TABLES).toEqual([
      'posts',
      'daily_count',
      'logins',
      'campaign_sent',
      'engagement_actions',
    ]);
    expect(EXPECTED_TABLES).toHaveLength(5);
  });
});

// ── runDoctorChecks — DB ──────────────────────────────────────────────────────

describe('runDoctorChecks — DB tables', () => {
  it('dbOk true when all expected tables are present', () => {
    const report = runDoctorChecks({
      configOk: true,
      dbTables: allTables(),
      platforms: allPlatforms(),
      brand: fullBrand(),
    });
    expect(report.dbOk).toBe(true);
    expect(report.missingTables).toHaveLength(0);
  });

  it('dbOk false when a table is missing', () => {
    const tables = allTables().filter((t) => t !== 'engagement_actions');
    const report = runDoctorChecks({
      configOk: true,
      dbTables: tables,
      platforms: allPlatforms(),
      brand: fullBrand(),
    });
    expect(report.dbOk).toBe(false);
    expect(report.missingTables).toContain('engagement_actions');
  });

  it('missingTables lists every absent table', () => {
    const report = runDoctorChecks({
      configOk: true,
      dbTables: ['posts'], // only posts present
      platforms: allPlatforms(),
      brand: fullBrand(),
    });
    expect(report.missingTables).toContain('daily_count');
    expect(report.missingTables).toContain('logins');
    expect(report.missingTables).toContain('campaign_sent');
    expect(report.missingTables).toContain('engagement_actions');
    expect(report.missingTables).toHaveLength(4);
  });

  it('adds a note when tables are missing', () => {
    const report = runDoctorChecks({
      configOk: true,
      dbTables: [],
      platforms: allPlatforms(),
      brand: fullBrand(),
    });
    expect(report.notes.some((n) => n.includes('Missing DB tables'))).toBe(true);
  });

  it('dbTables in report equals the input array', () => {
    const tables = allTables();
    const report = runDoctorChecks({
      configOk: true,
      dbTables: tables,
      platforms: allPlatforms(),
      brand: fullBrand(),
    });
    expect(report.dbTables).toEqual(tables);
  });
});

// ── runDoctorChecks — config ──────────────────────────────────────────────────

describe('runDoctorChecks — config', () => {
  it('configOk false is preserved in report', () => {
    const report = runDoctorChecks({
      configOk: false,
      configError: 'JSON parse failed',
      dbTables: allTables(),
      platforms: allPlatforms(),
      brand: fullBrand(),
    });
    expect(report.configOk).toBe(false);
    expect(report.configError).toBe('JSON parse failed');
  });

  it('adds a note on config error', () => {
    const report = runDoctorChecks({
      configOk: false,
      configError: 'bad JSON',
      dbTables: allTables(),
      platforms: allPlatforms(),
      brand: fullBrand(),
    });
    expect(report.notes.some((n) => n.includes('Config error'))).toBe(true);
  });

  it('configOk true produces no config note', () => {
    const report = runDoctorChecks({
      configOk: true,
      dbTables: allTables(),
      platforms: allPlatforms(),
      brand: fullBrand(),
    });
    expect(report.notes.every((n) => !n.startsWith('Config error'))).toBe(true);
  });
});

// ── runDoctorChecks — platforms ───────────────────────────────────────────────

describe('runDoctorChecks — platforms', () => {
  it('platform statuses pass through unchanged', () => {
    const platforms = allPlatforms();
    const report = runDoctorChecks({
      configOk: true,
      dbTables: allTables(),
      platforms,
      brand: fullBrand(),
    });
    expect(report.platforms).toEqual(platforms);
  });

  it('adds a note for each unconfigured platform', () => {
    const platforms: PlatformCredStatus[] = [
      { platform: 'bluesky', kind: 'api', configured: false, detail: 'missing env var(s): BLUESKY_HANDLE' },
      { platform: 'mastodon', kind: 'api', configured: true, detail: 'all set' },
    ];
    const report = runDoctorChecks({
      configOk: true,
      dbTables: allTables(),
      platforms,
      brand: fullBrand(),
    });
    const blueskyNote = report.notes.find((n) => n.includes('bluesky'));
    expect(blueskyNote).toBeTruthy();
    expect(report.notes.every((n) => !n.includes('mastodon'))).toBe(true);
  });
});

// ── runDoctorChecks — brand ───────────────────────────────────────────────────

describe('runDoctorChecks — brand keys', () => {
  it('brandKeysSet populated for non-empty values', () => {
    const report = runDoctorChecks({
      configOk: true,
      dbTables: allTables(),
      platforms: allPlatforms(),
      brand: { echo_url: 'https://echo.example.com', forge_url: '' },
    });
    expect(report.brandKeysSet).toContain('echo_url');
    expect(report.brandKeysMissing).toContain('forge_url');
  });

  it('brandKeysMissing detects empty string values', () => {
    const brand: Record<string, string> = {
      echo_url: '',
      forge_url: '',
      mcp_url: 'https://mcp.example.com',
    };
    const report = runDoctorChecks({
      configOk: true,
      dbTables: allTables(),
      platforms: allPlatforms(),
      brand,
    });
    expect(report.brandKeysMissing).toEqual(['echo_url', 'forge_url']);
    expect(report.brandKeysSet).toEqual(['mcp_url']);
  });

  it('adds a note when brand keys are missing', () => {
    const report = runDoctorChecks({
      configOk: true,
      dbTables: allTables(),
      platforms: allPlatforms(),
      brand: { echo_url: '' },
    });
    expect(report.notes.some((n) => n.includes('Brand keys not set'))).toBe(true);
  });

  it('no brand note when all brand keys are set', () => {
    const report = runDoctorChecks({
      configOk: true,
      dbTables: allTables(),
      platforms: allPlatforms(),
      brand: fullBrand(),
    });
    expect(report.notes.every((n) => !n.includes('Brand keys not set'))).toBe(true);
  });
});

// ── runDoctorChecks — never throws ───────────────────────────────────────────

describe('runDoctorChecks — robustness', () => {
  it('handles empty inputs without throwing', () => {
    expect(() =>
      runDoctorChecks({
        configOk: false,
        configError: 'oops',
        dbTables: [],
        platforms: [],
        brand: {},
      })
    ).not.toThrow();
  });

  it('returns all missingTables when dbTables is empty', () => {
    const report = runDoctorChecks({
      configOk: true,
      dbTables: [],
      platforms: [],
      brand: {},
    });
    expect(report.missingTables).toEqual(EXPECTED_TABLES);
    expect(report.dbOk).toBe(false);
  });
});
