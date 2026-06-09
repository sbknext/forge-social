/**
 * Engagement decision core — pure functions, no side effects, no I/O.
 *
 * SAFETY NOTE:
 *   All engagement is OFF by default (EngageConfig booleans default false).
 *   Auto-reply to humans is ToS-sensitive and potentially spammy — it is opt-in
 *   (replyEnabled), templated, capped, and deduped. Likes and follow-backs are
 *   lower risk. Never act on cold notifications — only on inbound engagement to
 *   your own account. Never act twice on the same item (dedupKey).
 *
 * Both Bluesky and Mastodon notification streams are normalised into
 * EngagementItem so upper-layer engine code is platform-agnostic.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Canonical engagement kinds across all platforms.
 *
 * - like      → someone liked our post
 * - mention   → someone mentioned us in a post / reply
 * - follow    → someone followed us
 * - reply     → direct reply to one of our posts
 * - repost    → reblog / repost (informational; engine may skip action)
 * - unknown   → unrecognised notification type (skip)
 */
export type EngagementKind =
  | 'like'
  | 'mention'
  | 'follow'
  | 'reply'
  | 'repost'
  | 'unknown';

/**
 * Platform-normalised notification item.
 *
 * Field semantics:
 *   id           — opaque stable ID for dedup (AT URI for Bluesky, numeric string for Mastodon)
 *   kind         — canonical engagement type
 *   platform     — platform identifier, e.g. 'bluesky' | 'mastodon'
 *   authorHandle — @handle of the actor (Bluesky: author.handle, Mastodon: account.acct)
 *   authorId     — platform-native actor ID (Bluesky: DID, Mastodon: numeric account id)
 *   subjectUri   — URI of the subject post (AT URI or Mastodon status id)
 *   subjectCid   — Bluesky CID of the subject (empty string for non-AT platforms)
 *   text         — post text if available (empty string when absent)
 *   createdAtIso — ISO 8601 timestamp of the notification
 */
export interface EngagementItem {
  id: string;
  kind: EngagementKind;
  platform?: string;
  authorHandle: string;
  authorId: string;
  subjectUri: string;
  subjectCid: string;
  text: string;
  createdAtIso: string;
}

/** The action the engine will take in response to a notification. */
export type EngageAction = 'like' | 'reply' | 'follow-back' | 'skip';

/**
 * Runtime-configurable engagement flags.
 * All booleans default to false — engagement is off unless explicitly enabled.
 */
export interface EngageConfig {
  /** Automatically like replies/mentions/likes received. */
  likeEnabled: boolean;
  /** Automatically follow back new followers. */
  followBackEnabled: boolean;
  /**
   * Automatically reply to mentions/replies using a template.
   * Highest-risk flag — opt-in only, always subject to dailyCap.
   */
  replyEnabled: boolean;
  /** Maximum number of engagement actions per day (all action types combined). */
  dailyCap: number;
}

// ── Decision logic ─────────────────────────────────────────────────────────────

/**
 * Decide which action to take for an inbound notification.
 *
 * Precedence (highest → lowest):
 *   1. kind==='follow'  + followBackEnabled   → 'follow-back'
 *   2. kind==='follow'  (no followBack)        → 'skip'
 *   3. kind==='reply'/'mention' + replyEnabled → 'reply'
 *   4. kind==='reply'/'mention'/'like' + likeEnabled → 'like'
 *   5. kind==='repost'/'unknown' or nothing enabled  → 'skip'
 *
 * Rationale:
 *   - follow-back is unambiguous: a follow notification only triggers a follow.
 *   - For social engagement (replies/mentions): prefer 'reply' when enabled because
 *     it is more engaging than a silent like; fall back to 'like' when only
 *     likeEnabled is set.
 *   - Plain 'like' notifications: only action is to like back (no reply makes sense).
 *   - repost/unknown: no auto-action defined — always skip.
 *   - If nothing is enabled, skip — no action is always the safe default.
 *
 * Pure — no I/O, no Date calls, no state.
 */
export function decideAction(item: EngagementItem, cfg: EngageConfig): EngageAction {
  if (item.kind === 'follow') {
    return cfg.followBackEnabled ? 'follow-back' : 'skip';
  }

  if (item.kind === 'reply' || item.kind === 'mention') {
    if (cfg.replyEnabled) return 'reply';
    if (cfg.likeEnabled) return 'like';
    return 'skip';
  }

  if (item.kind === 'like') {
    return cfg.likeEnabled ? 'like' : 'skip';
  }

  // repost | unknown — no automated action
  return 'skip';
}

// ── Gate check ─────────────────────────────────────────────────────────────────

/** Snapshot of gate state passed to canAct — avoids DB coupling in the pure layer. */
export interface ActGate {
  /** Number of engagement actions already executed today. */
  actedToday: number;
  /** Maximum allowed actions per day (from EngageConfig.dailyCap). */
  dailyCap: number;
  /** True if this exact item+action has already been acted on (dedup). */
  alreadyActed: boolean;
}

/**
 * Check whether it is safe to proceed with an action.
 *
 * Check order (earliest short-circuit wins):
 *   1. alreadyActed         → { ok: false, reason: 'already-acted' }
 *   2. actedToday >= dailyCap → { ok: false, reason: 'daily-cap' }
 *   3. otherwise            → { ok: true }
 *
 * Pure — no I/O, no Date calls, no state.
 */
export function canAct(g: ActGate): { ok: boolean; reason?: string } {
  if (g.alreadyActed) return { ok: false, reason: 'already-acted' };
  if (g.actedToday >= g.dailyCap) return { ok: false, reason: 'daily-cap' };
  return { ok: true };
}

// ── Dedup key ──────────────────────────────────────────────────────────────────

/**
 * Produce a stable, opaque dedup key for the engagement_acted table.
 *
 * Format: `<platform>:<kind>:<itemId>:<action>`
 *
 * All segments are colon-joined so the key is both human-readable for debugging
 * and distinct across platforms, notification kinds, and action types.
 * Example: 'bluesky:reply:at://did:plc:abc/app.bsky.feed.post/123:like'
 *
 * Pure — no I/O.
 */
export function dedupKey(
  platform: string,
  kind: EngagementKind,
  itemId: string,
  action: EngageAction
): string {
  return `${platform}:${kind}:${itemId}:${action}`;
}

// ── Reply template renderer ────────────────────────────────────────────────────

/**
 * Render an engagement reply template by substituting `{handle}` and `{name}`
 * (case-insensitive). Unknown placeholders are left intact (visible typo signal).
 * After substitution, runs of 2+ spaces are collapsed to one and result is trimmed.
 *
 * Variables:
 *   {handle} — the author's platform handle (e.g. '@alice.bsky.social')
 *   {name}   — a display name (may be same as handle if no display name is available)
 *
 * Example:
 *   renderReply('Thanks {handle}!', { handle: '@alice' })
 *   // → 'Thanks @alice!'
 *
 * Pure — no I/O, no env reads, no brand coupling.
 */
export function renderReply(
  template: string,
  vars: { handle?: string; name?: string }
): string {
  const known: Record<string, string | undefined> = {
    handle: vars.handle,
    name: vars.name,
  };

  const rendered = template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    const lower = key.toLowerCase();
    if (lower in known) {
      return known[lower] ?? '';
    }
    // Unknown placeholder — leave intact
    return _match;
  });

  return rendered.replace(/ {2,}/g, ' ').trim();
}
