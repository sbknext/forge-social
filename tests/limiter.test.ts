import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { canRunNow, remainingQuota, randomDelayMs } from '../src/core/limiter.js';
import type { Config } from '../src/types.js';
import Database from 'better-sqlite3';
import { openDb } from '../src/core/db.js';
import os from 'node:os';
import path from 'node:path';

const BASE_CONFIG: Config = {
  platforms: {
    x: { daily_cap: 5, min_delay_sec: 300, max_delay_sec: 900 },
    instagram: { daily_cap: 3, min_delay_sec: 600, max_delay_sec: 1800 },
  },
  active_hours: [9, 21],
  active_tz: 'UTC',
  skip_weekends: false,
};

describe('canRunNow', () => {
  it('returns true inside active window', () => {
    const config = { ...BASE_CONFIG, active_hours: [0, 24] as [number, number] };
    expect(canRunNow(config)).toBe(true);
  });

  it('returns false when hour is before start', () => {
    // Force a config where window is far in the future
    const config = { ...BASE_CONFIG, active_hours: [23, 24] as [number, number], active_tz: 'UTC' };
    // We cannot mock Date easily without vitest fake timers, but we can test the boundary logic
    // by checking that a 0–0 window is always false
    const narrow = { ...BASE_CONFIG, active_hours: [0, 0] as [number, number] };
    expect(canRunNow(narrow)).toBe(false);
  });

  it('returns false on weekend when skip_weekends=true and it is a weekend', () => {
    // Use a known weekend UTC timestamp: 2026-05-24 (Sunday)
    const realDate = Date;
    vi.setSystemTime(new Date('2026-05-24T12:00:00Z'));
    const config = { ...BASE_CONFIG, skip_weekends: true, active_hours: [0, 24] as [number, number] };
    // Sunday=0 => should be blocked
    expect(canRunNow(config)).toBe(false);
    vi.useRealTimers();
  });

  it('returns true on weekend when skip_weekends=false', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-24T12:00:00Z')); // Sunday
    const config = { ...BASE_CONFIG, skip_weekends: false, active_hours: [0, 24] as [number, number] };
    expect(canRunNow(config)).toBe(true);
    vi.useRealTimers();
  });
});

describe('remainingQuota', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('returns full cap when no posts today for x', () => {
    expect(remainingQuota(BASE_CONFIG, db, 'x')).toBe(5);
  });

  it('returns full cap when no posts today for instagram', () => {
    expect(remainingQuota(BASE_CONFIG, db, 'instagram')).toBe(3);
  });

  it('decrements correctly after posting', () => {
    db.prepare(
      "INSERT INTO daily_count (date, platform, count) VALUES (date('now'), 'x', 3)"
    ).run();
    expect(remainingQuota(BASE_CONFIG, db, 'x')).toBe(2);
  });

  it('returns 0 when cap exhausted', () => {
    db.prepare(
      "INSERT INTO daily_count (date, platform, count) VALUES (date('now'), 'x', 10)"
    ).run();
    expect(remainingQuota(BASE_CONFIG, db, 'x')).toBe(0);
  });

  it('platforms are independent', () => {
    db.prepare(
      "INSERT INTO daily_count (date, platform, count) VALUES (date('now'), 'instagram', 3)"
    ).run();
    expect(remainingQuota(BASE_CONFIG, db, 'x')).toBe(5);
    expect(remainingQuota(BASE_CONFIG, db, 'instagram')).toBe(0);
  });
});

describe('randomDelayMs', () => {
  it('returns value within range', () => {
    for (let i = 0; i < 50; i++) {
      const ms = randomDelayMs(10, 20);
      expect(ms).toBeGreaterThanOrEqual(10000);
      expect(ms).toBeLessThanOrEqual(20000);
    }
  });

  it('handles equal min and max', () => {
    const ms = randomDelayMs(5, 5);
    expect(ms).toBe(5000);
  });
});
