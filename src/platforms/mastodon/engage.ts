/**
 * Mastodon engagement helpers — list notifications + action wrappers.
 *
 * Network functions accept an optional fetchImpl for test injection.
 *
 * SAFETY: Reads only YOUR account notifications (authenticated via Bearer token).
 * reply() should only be invoked when engage_reply_enabled is explicitly set —
 * auto-replying to humans is ToS-sensitive and must respect daily caps + dedup.
 */

import { normalizeInstanceUrl } from './client.js';
import type { EngagementItem, EngagementKind } from '../../core/engagement.js';

// ── Raw API shapes ────────────────────────────────────────────────────────────

interface MastodonAccount {
  id: string;
  acct: string; // handle, e.g. "sam@mastodon.social" or "sam" (local)
}

interface MastodonStatus {
  id: string;
  content: string; // HTML — strip tags for text
}

interface MastodonNotification {
  id: string;
  type: string; // 'favourite' | 'mention' | 'follow' | 'reblog' | ...
  account: MastodonAccount;
  status?: MastodonStatus;
}

// ── Type mapping ──────────────────────────────────────────────────────────────

function mastodonTypeToKind(type: string): EngagementKind {
  switch (type) {
    case 'favourite': return 'like';
    case 'mention':   return 'mention';
    case 'follow':    return 'follow';
    case 'reblog':    return 'repost';
    default:          return 'unknown';
  }
}

/** Strip HTML tags from Mastodon status content. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

// ── listNotifications ────────────────────────────────────────────────────────

/**
 * Fetch and normalise recent notifications from a Mastodon instance.
 * Maps each Mastodon notification to a platform-agnostic EngagementItem.
 *
 * Note: 'reblog' maps to kind 'repost' — the engine may choose to skip action.
 */
export async function listNotifications(
  instance: string,
  token: string,
  fetchImpl: typeof fetch = fetch
): Promise<EngagementItem[]> {
  const base = normalizeInstanceUrl(instance);
  const url = `${base}/api/v1/notifications`;

  const res = await fetchImpl(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Mastodon listNotifications failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as MastodonNotification[];

  return data.map((n): EngagementItem => ({
    id: n.id,
    kind: mastodonTypeToKind(n.type),
    authorHandle: n.account.acct,
    authorId: n.account.id,
    subjectUri: n.status?.id ?? '',
    subjectCid: '', // Mastodon has no CID concept
    rootUri: '',   // Mastodon has no thread-root concept in the notification payload
    rootCid: '',   // Mastodon has no CID concept
    text: n.status ? stripHtml(n.status.content) : '',
    createdAtIso: '', // Mastodon notification object lacks a top-level createdAt; set empty
  }));
}

// ── Action helpers ────────────────────────────────────────────────────────────

/**
 * Favourite (like) a status.
 * POST /api/v1/statuses/:statusId/favourite
 */
export async function favourite(
  instance: string,
  token: string,
  statusId: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const base = normalizeInstanceUrl(instance);
  const url = `${base}/api/v1/statuses/${statusId}/favourite`;

  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Mastodon favourite failed: ${res.status} ${body}`);
  }
}

/**
 * Follow an account.
 * POST /api/v1/accounts/:accountId/follow
 */
export async function followAccount(
  instance: string,
  token: string,
  accountId: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const base = normalizeInstanceUrl(instance);
  const url = `${base}/api/v1/accounts/${accountId}/follow`;

  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Mastodon followAccount failed: ${res.status} ${body}`);
  }
}

/**
 * Reply to a status.
 *
 * ⚠ HIGH RISK — only call when engage_reply_enabled is true, daily cap not
 * reached, and dedup confirms this status has not been replied to before.
 *
 * POST /api/v1/statuses { status, in_reply_to_id }
 */
export async function reply(
  instance: string,
  token: string,
  inReplyToId: string,
  text: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const base = normalizeInstanceUrl(instance);
  const url = `${base}/api/v1/statuses`;

  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status: text, in_reply_to_id: inReplyToId }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Mastodon reply failed: ${res.status} ${body}`);
  }
}
