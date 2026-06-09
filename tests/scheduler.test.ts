import { describe, it, expect } from 'vitest';
import {
  canPostNow,
  nextEligibleMs,
  planPlatform,
  type PostGate,
} from '../src/core/scheduler.js';

// ── Shared base gate (all gates pass) ────────────────────────────────────────

const BASE_GATE: PostGate = {
  activeNow: true,
  sentToday: 0,
  dailyCap: 5,
  lastPostAtMs: null,
  nowMs: 1_000_000_000_000, // arbitrary fixed epoch
  minDelaySec: 300,
};

// ── canPostNow ────────────────────────────────────────────────────────────────

describe('canPostNow', () => {
  it('returns ok:true when all gates pass (first post ever)', () => {
    const result = canPostNow(BASE_GATE);
    expect(result.ok).toBe(true);
  });

  it('returns ok:true when last post is old enough', () => {
    const result = canPostNow({
      ...BASE_GATE,
      lastPostAtMs: BASE_GATE.nowMs - 400 * 1000, // 400s ago, min=300s
    });
    expect(result.ok).toBe(true);
  });

  // Gate 1 — outside-hours
  it('blocks with outside-hours when activeNow===false', () => {
    const result = canPostNow({ ...BASE_GATE, activeNow: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('outside-hours');
  });

  it('outside-hours fires before daily-cap (gate order)', () => {
    // Both outside-hours AND cap exceeded — should still report outside-hours
    const result = canPostNow({
      ...BASE_GATE,
      activeNow: false,
      sentToday: 10, // exceeds cap
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('outside-hours');
  });

  // Gate 2 — daily-cap
  it('blocks with daily-cap when sentToday === dailyCap', () => {
    const result = canPostNow({ ...BASE_GATE, sentToday: 5, dailyCap: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('daily-cap');
  });

  it('blocks with daily-cap when sentToday > dailyCap', () => {
    const result = canPostNow({ ...BASE_GATE, sentToday: 7, dailyCap: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('daily-cap');
  });

  it('does not block when sentToday < dailyCap', () => {
    const result = canPostNow({ ...BASE_GATE, sentToday: 4, dailyCap: 5 });
    expect(result.ok).toBe(true);
  });

  // Gate 3 — too-soon
  it('blocks with too-soon when elapsed < minDelaySec', () => {
    const lastPostAtMs = BASE_GATE.nowMs - 100 * 1000; // only 100s ago, min=300s
    const result = canPostNow({ ...BASE_GATE, lastPostAtMs });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('too-soon');
  });

  it('blocks with too-soon at exact minDelaySec boundary (< not <=)', () => {
    // elapsed === minDelaySec*1000 — should be ok (not blocked)
    const lastPostAtMs = BASE_GATE.nowMs - 300 * 1000; // exactly 300s
    const result = canPostNow({ ...BASE_GATE, lastPostAtMs });
    expect(result.ok).toBe(true);
  });

  it('blocks when elapsed is 1ms short of minDelaySec', () => {
    const lastPostAtMs = BASE_GATE.nowMs - (300 * 1000 - 1);
    const result = canPostNow({ ...BASE_GATE, lastPostAtMs });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('too-soon');
  });

  it('daily-cap fires before too-soon (gate order)', () => {
    // Cap exceeded AND too-soon — should report daily-cap first
    const result = canPostNow({
      ...BASE_GATE,
      sentToday: 5,
      dailyCap: 5,
      lastPostAtMs: BASE_GATE.nowMs - 10 * 1000, // only 10s ago
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('daily-cap');
  });
});

// ── nextEligibleMs ────────────────────────────────────────────────────────────

describe('nextEligibleMs', () => {
  it('returns 0 when lastPostAtMs is null (never posted)', () => {
    expect(nextEligibleMs(null, 300)).toBe(0);
  });

  it('returns lastPostAtMs + minDelaySec*1000', () => {
    const last = 1_000_000_000_000;
    expect(nextEligibleMs(last, 300)).toBe(last + 300_000);
  });

  it('returns 0 for null regardless of minDelaySec', () => {
    expect(nextEligibleMs(null, 3600)).toBe(0);
    expect(nextEligibleMs(null, 0)).toBe(0);
  });

  it('works with minDelaySec=0', () => {
    const last = 5000;
    expect(nextEligibleMs(last, 0)).toBe(5000);
  });
});

// ── planPlatform ──────────────────────────────────────────────────────────────

describe('planPlatform', () => {
  it('returns remaining = dailyCap - sentToday when under cap', () => {
    const plan = planPlatform('x', { ...BASE_GATE, sentToday: 2, dailyCap: 5 });
    expect(plan.remaining).toBe(3);
  });

  it('returns remaining = 0 when at cap', () => {
    const plan = planPlatform('x', { ...BASE_GATE, sentToday: 5, dailyCap: 5 });
    expect(plan.remaining).toBe(0);
  });

  it('returns remaining = 0 when over cap (never negative)', () => {
    const plan = planPlatform('x', { ...BASE_GATE, sentToday: 8, dailyCap: 5 });
    expect(plan.remaining).toBe(0);
  });

  it('canPost=true when all gates pass', () => {
    const plan = planPlatform('instagram', BASE_GATE);
    expect(plan.canPost).toBe(true);
    expect(plan.reason).toBeUndefined();
  });

  it('canPost=false with reason when outside hours', () => {
    const plan = planPlatform('linkedin', { ...BASE_GATE, activeNow: false });
    expect(plan.canPost).toBe(false);
    expect(plan.reason).toBe('outside-hours');
  });

  it('canPost=false with reason when daily cap hit', () => {
    const plan = planPlatform('x', { ...BASE_GATE, sentToday: 5, dailyCap: 5 });
    expect(plan.canPost).toBe(false);
    expect(plan.reason).toBe('daily-cap');
  });

  it('nextEligibleMs is 0 when no prior post', () => {
    const plan = planPlatform('x', { ...BASE_GATE, lastPostAtMs: null });
    expect(plan.nextEligibleMs).toBe(0);
  });

  it('nextEligibleMs equals lastPostAtMs + minDelaySec*1000', () => {
    const last = 1_000_000_000_000;
    const plan = planPlatform('x', { ...BASE_GATE, lastPostAtMs: last, minDelaySec: 300 });
    expect(plan.nextEligibleMs).toBe(last + 300_000);
  });

  it('carries platform name through to output', () => {
    const plan = planPlatform('instagram', BASE_GATE);
    expect(plan.platform).toBe('instagram');
  });

  it('carries sentToday and dailyCap through to output', () => {
    const plan = planPlatform('linkedin', { ...BASE_GATE, sentToday: 1, dailyCap: 2 });
    expect(plan.sentToday).toBe(1);
    expect(plan.dailyCap).toBe(2);
  });
});
