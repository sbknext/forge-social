/**
 * Bluesky engagement helpers — list notifications + action builders.
 *
 * Pure body-builder functions (buildLikeRecord / buildFollowRecord /
 * buildReplyRecord) carry no side-effects and are fully unit-testable.
 * Network functions accept an optional fetchImpl for test injection.
 *
 * SAFETY: This module only reads/writes notifications for YOUR account
 * (authenticated via accessJwt).  Never cold-targets other accounts.
 */

import type { EngagementItem, EngagementKind } from '../../core/engagement.js';

// ── Raw API shapes ────────────────────────────────────────────────────────────

interface BskyNotificationAuthor {
  did: string;
  handle: string;
}

interface BskyNotificationRecord {
  $type?: string;
  text?: string;
  subject?: { uri: string; cid: string };
  reply?: {
    root: { uri: string; cid: string };
    parent: { uri: string; cid: string };
  };
}

interface BskyNotification {
  uri: string;
  cid: string;
  author: BskyNotificationAuthor;
  reason: string; // 'like' | 'reply' | 'follow' | 'mention' | 'repost' | ...
  record: BskyNotificationRecord;
  indexedAt: string;
}

interface BskyNotificationsResponse {
  notifications: BskyNotification[];
}

// ── Reason → EngagementKind mapping ──────────────────────────────────────────

function reasonToKind(reason: string): EngagementKind {
  switch (reason) {
    case 'like':    return 'like';
    case 'reply':   return 'reply';
    case 'follow':  return 'follow';
    case 'mention': return 'mention';
    case 'repost':  return 'repost';
    default:        return 'unknown';
  }
}

// ── listNotifications ────────────────────────────────────────────────────────

/**
 * Fetch and normalise recent notifications from the Bluesky PDS.
 * Maps each AT-Proto notification to a platform-agnostic EngagementItem.
 */
export async function listNotifications(
  pds: string,
  accessJwt: string,
  fetchImpl: typeof fetch = fetch
): Promise<EngagementItem[]> {
  const url = `${pds}/xrpc/app.bsky.notification.listNotifications`;

  const res = await fetchImpl(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessJwt}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Bluesky listNotifications failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as BskyNotificationsResponse;

  return data.notifications.map((n): EngagementItem => {
    // Subject URI/CID: prefer record.subject (like/repost), fall back to notification uri/cid
    const subjectUri = n.record.subject?.uri ?? n.uri;
    const subjectCid = n.record.subject?.cid ?? n.cid;

    return {
      id: n.uri,
      kind: reasonToKind(n.reason),
      authorHandle: n.author.handle,
      authorId: n.author.did,
      subjectUri,
      subjectCid,
      text: n.record.text ?? '',
      createdAtIso: n.indexedAt,
    };
  });
}

// ── Pure record builders ─────────────────────────────────────────────────────

/** Body for app.bsky.feed.like createRecord call. Pure. */
export function buildLikeRecord(
  did: string,
  subjectUri: string,
  subjectCid: string,
  createdAtIso: string
): {
  repo: string;
  collection: string;
  record: { $type: string; subject: { uri: string; cid: string }; createdAt: string };
} {
  return {
    repo: did,
    collection: 'app.bsky.feed.like',
    record: {
      $type: 'app.bsky.feed.like',
      subject: { uri: subjectUri, cid: subjectCid },
      createdAt: createdAtIso,
    },
  };
}

/** Body for app.bsky.graph.follow createRecord call. Pure. */
export function buildFollowRecord(
  did: string,
  subjectDid: string,
  createdAtIso: string
): {
  repo: string;
  collection: string;
  record: { $type: string; subject: string; createdAt: string };
} {
  return {
    repo: did,
    collection: 'app.bsky.graph.follow',
    record: {
      $type: 'app.bsky.graph.follow',
      subject: subjectDid,
      createdAt: createdAtIso,
    },
  };
}

/** Body for app.bsky.feed.post (reply) createRecord call. Pure. */
export function buildReplyRecord(
  did: string,
  rootUri: string,
  rootCid: string,
  parentUri: string,
  parentCid: string,
  text: string,
  createdAtIso: string
): {
  repo: string;
  collection: string;
  record: {
    $type: string;
    text: string;
    reply: {
      root: { uri: string; cid: string };
      parent: { uri: string; cid: string };
    };
    createdAt: string;
  };
} {
  return {
    repo: did,
    collection: 'app.bsky.feed.post',
    record: {
      $type: 'app.bsky.feed.post',
      text,
      reply: {
        root: { uri: rootUri, cid: rootCid },
        parent: { uri: parentUri, cid: parentCid },
      },
      createdAt: createdAtIso,
    },
  };
}

// ── Network action helpers ───────────────────────────────────────────────────

async function createRecord(
  pds: string,
  accessJwt: string,
  body: object,
  fetchImpl: typeof fetch
): Promise<void> {
  const url = `${pds}/xrpc/com.atproto.repo.createRecord`;

  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessJwt}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Bluesky createRecord failed: ${res.status} ${errBody}`);
  }
}

/**
 * Like a post on Bluesky.
 * @param did      — authenticated user DID
 * @param subjectUri — AT URI of the post to like
 * @param subjectCid — CID of the post to like
 */
export async function likePost(
  pds: string,
  accessJwt: string,
  did: string,
  subjectUri: string,
  subjectCid: string,
  createdAtIso: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  await createRecord(pds, accessJwt, buildLikeRecord(did, subjectUri, subjectCid, createdAtIso), fetchImpl);
}

/**
 * Follow an account on Bluesky.
 * @param subjectDid — DID of the account to follow
 */
export async function followAccount(
  pds: string,
  accessJwt: string,
  did: string,
  subjectDid: string,
  createdAtIso: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  await createRecord(pds, accessJwt, buildFollowRecord(did, subjectDid, createdAtIso), fetchImpl);
}

/**
 * Reply to a post on Bluesky.
 * Both rootUri/Cid (thread root) and parentUri/Cid (direct parent) are required
 * per AT Protocol spec — they are identical when replying directly to a root post.
 */
export async function replyToPost(
  pds: string,
  accessJwt: string,
  did: string,
  rootUri: string,
  rootCid: string,
  parentUri: string,
  parentCid: string,
  text: string,
  createdAtIso: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  await createRecord(
    pds,
    accessJwt,
    buildReplyRecord(did, rootUri, rootCid, parentUri, parentCid, text, createdAtIso),
    fetchImpl
  );
}
