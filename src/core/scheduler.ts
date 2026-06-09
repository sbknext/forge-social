/**
 * scheduler.ts — PURE scheduling logic for campaign daemon.
 *
 * No I/O. No DB. No Date.now() calls inside functions.
 * The caller always passes explicit `nowMs` so tests can inject any timestamp.
 *
 * Gate order (canPostNow):
 *   1. outside-hours  — activeNow===false
 *   2. daily-cap      — sentToday >= dailyCap
 *   3. too-soon       — lastPostAtMs exists and (nowMs - lastPostAtMs) < minDelaySec*1000
 *   4. ok             — all gates passed
 */

// ── PostGate ─────────────────────────────────────────────────────────────────

/**
 * All inputs needed to decide whether a post is allowed right now.
 * All values are plain numbers — no Date objects, no DB handles.
 */
export interface PostGate {
  /** Is this instant inside the configured active_hours window (and not a skipped weekend)? */
  activeNow: boolean;
  /** How many posts were sent for this platform today (from todayCount or campaignSentToday). */
  sentToday: number;
  /** Per-platform daily_cap from config. */
  dailyCap: number;
  /**
   * UNIX timestamp (ms) of the last successful post for this platform,
   * or null if no post has ever been made.
   */
  lastPostAtMs: number | null;
  /** Current time as UNIX timestamp (ms). Caller supplies; never read from Date.now() here. */
  nowMs: number;
  /** Minimum seconds that must elapse between consecutive posts (from platform config). */
  minDelaySec: number;
}

// ── canPostNow ────────────────────────────────────────────────────────────────

export type CanPostResult =
  | { ok: true }
  | { ok: false; reason: 'outside-hours' | 'daily-cap' | 'too-soon' };

/**
 * Pure gate check — returns {ok:true} or {ok:false, reason}.
 * Gate order is intentional: active-hours first (cheapest), cap second, delay last.
 */
export function canPostNow(g: PostGate): CanPostResult {
  if (!g.activeNow) {
    return { ok: false, reason: 'outside-hours' };
  }

  if (g.sentToday >= g.dailyCap) {
    return { ok: false, reason: 'daily-cap' };
  }

  if (
    g.lastPostAtMs !== null &&
    g.nowMs - g.lastPostAtMs < g.minDelaySec * 1000
  ) {
    return { ok: false, reason: 'too-soon' };
  }

  return { ok: true };
}

// ── nextEligibleMs ────────────────────────────────────────────────────────────

/**
 * Return the earliest UNIX timestamp (ms) at which the min-delay gate will open.
 *
 * - lastPostAtMs === null  →  0  (already eligible)
 * - otherwise              →  lastPostAtMs + minDelaySec * 1000
 */
export function nextEligibleMs(
  lastPostAtMs: number | null,
  minDelaySec: number,
): number {
  if (lastPostAtMs === null) return 0;
  return lastPostAtMs + minDelaySec * 1000;
}

// ── PlatformPlan ──────────────────────────────────────────────────────────────

/**
 * Computed scheduling plan for a single platform — used by the schedule view.
 */
export interface PlatformPlan {
  platform: string;
  sentToday: number;
  dailyCap: number;
  /** max(0, dailyCap - sentToday) — remaining quota for today */
  remaining: number;
  /** UNIX ms when the min-delay gate opens (0 if no prior post). */
  nextEligibleMs: number;
  /** true if canPostNow returned ok:true */
  canPost: boolean;
  /** reason string when canPost===false; undefined when canPost===true */
  reason?: string;
}

/**
 * Compute a PlatformPlan from a platform name + PostGate.
 * Pure — no I/O.
 */
export function planPlatform(platform: string, g: PostGate): PlatformPlan {
  const result = canPostNow(g);
  const remaining = Math.max(0, g.dailyCap - g.sentToday);
  const eligible = nextEligibleMs(g.lastPostAtMs, g.minDelaySec);

  return {
    platform,
    sentToday: g.sentToday,
    dailyCap: g.dailyCap,
    remaining,
    nextEligibleMs: eligible,
    canPost: result.ok,
    ...(result.ok ? {} : { reason: result.reason }),
  };
}
