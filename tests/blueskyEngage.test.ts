/**
 * Unit tests for src/platforms/bluesky/engage.ts
 *
 * All tests are network-free: fetch is injected via the fetchImpl parameter.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  listNotifications,
  buildLikeRecord,
  buildFollowRecord,
  buildReplyRecord,
  likePost,
  followAccount,
  replyToPost,
} from '../src/platforms/bluesky/engage.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch;
}

const PDS = 'https://bsky.social';
const JWT = 'test-access-jwt';
const DID = 'did:plc:testuser';
const NOW = '2026-06-03T00:00:00.000Z';

// ── listNotifications ─────────────────────────────────────────────────────────

describe('listNotifications', () => {
  const sampleResponse = {
    notifications: [
      {
        uri: 'at://did:plc:alice/app.bsky.feed.post/001',
        cid: 'cid001',
        author: { did: 'did:plc:alice', handle: 'alice.bsky.social' },
        reason: 'like',
        record: {
          $type: 'app.bsky.feed.like',
          subject: { uri: 'at://did:plc:me/app.bsky.feed.post/mypost', cid: 'cidMyPost' },
        },
        indexedAt: '2026-06-03T10:00:00.000Z',
      },
      {
        uri: 'at://did:plc:bob/app.bsky.feed.post/002',
        cid: 'cid002',
        author: { did: 'did:plc:bob', handle: 'bob.bsky.social' },
        reason: 'reply',
        record: {
          $type: 'app.bsky.feed.post',
          text: 'Nice post!',
          reply: {
            root: { uri: 'at://did:plc:me/app.bsky.feed.post/mypost', cid: 'cidMyPost' },
            parent: { uri: 'at://did:plc:me/app.bsky.feed.post/mypost', cid: 'cidMyPost' },
          },
        },
        indexedAt: '2026-06-03T11:00:00.000Z',
      },
      {
        uri: 'at://did:plc:carol/app.bsky.graph.follow/003',
        cid: 'cid003',
        author: { did: 'did:plc:carol', handle: 'carol.bsky.social' },
        reason: 'follow',
        record: { $type: 'app.bsky.graph.follow' },
        indexedAt: '2026-06-03T12:00:00.000Z',
      },
      {
        uri: 'at://did:plc:dave/app.bsky.feed.post/004',
        cid: 'cid004',
        author: { did: 'did:plc:dave', handle: 'dave.bsky.social' },
        reason: 'mention',
        record: {
          $type: 'app.bsky.feed.post',
          text: 'Hey @me check this out',
        },
        indexedAt: '2026-06-03T13:00:00.000Z',
      },
    ],
  };

  it('maps like notification to kind=like with correct subjectUri', async () => {
    const items = await listNotifications(PDS, JWT, mockFetch(sampleResponse));
    const like = items[0];
    expect(like.kind).toBe('like');
    expect(like.authorHandle).toBe('alice.bsky.social');
    expect(like.subjectUri).toBe('at://did:plc:me/app.bsky.feed.post/mypost');
    expect(like.id).toBe('at://did:plc:alice/app.bsky.feed.post/001');
  });

  it('maps reply notification to kind=reply with text', async () => {
    const items = await listNotifications(PDS, JWT, mockFetch(sampleResponse));
    const reply = items[1];
    expect(reply.kind).toBe('reply');
    expect(reply.text).toBe('Nice post!');
    expect(reply.authorHandle).toBe('bob.bsky.social');
  });

  it('maps follow notification to kind=follow', async () => {
    const items = await listNotifications(PDS, JWT, mockFetch(sampleResponse));
    const follow = items[2];
    expect(follow.kind).toBe('follow');
    expect(follow.authorHandle).toBe('carol.bsky.social');
    // follow has no record.subject — should fall back to notification uri
    expect(follow.subjectUri).toBe('at://did:plc:carol/app.bsky.graph.follow/003');
  });

  it('maps mention notification to kind=mention', async () => {
    const items = await listNotifications(PDS, JWT, mockFetch(sampleResponse));
    const mention = items[3];
    expect(mention.kind).toBe('mention');
    expect(mention.text).toBe('Hey @me check this out');
  });

  it('returns EngagementItem[] of correct length', async () => {
    const items = await listNotifications(PDS, JWT, mockFetch(sampleResponse));
    expect(items).toHaveLength(4);
  });

  it('sends Authorization header with Bearer token', async () => {
    const fetch = mockFetch(sampleResponse);
    await listNotifications(PDS, JWT, fetch);
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].headers.Authorization).toBe(`Bearer ${JWT}`);
  });

  it('throws on non-2xx response', async () => {
    await expect(
      listNotifications(PDS, JWT, mockFetch({ error: 'Unauthorized' }, 401))
    ).rejects.toThrow('Bluesky listNotifications failed: 401');
  });
});

// ── Pure record builders ──────────────────────────────────────────────────────

describe('buildLikeRecord', () => {
  it('returns correct $type and collection', () => {
    const rec = buildLikeRecord(DID, 'at://uri/1', 'cid1', NOW);
    expect(rec.collection).toBe('app.bsky.feed.like');
    expect(rec.record.$type).toBe('app.bsky.feed.like');
  });

  it('embeds subject uri/cid', () => {
    const rec = buildLikeRecord(DID, 'at://uri/1', 'cid1', NOW);
    expect(rec.record.subject).toEqual({ uri: 'at://uri/1', cid: 'cid1' });
  });

  it('sets repo to provided did', () => {
    const rec = buildLikeRecord(DID, 'at://uri/1', 'cid1', NOW);
    expect(rec.repo).toBe(DID);
  });
});

describe('buildFollowRecord', () => {
  it('returns correct $type and collection', () => {
    const rec = buildFollowRecord(DID, 'did:plc:target', NOW);
    expect(rec.collection).toBe('app.bsky.graph.follow');
    expect(rec.record.$type).toBe('app.bsky.graph.follow');
  });

  it('sets subject to target DID string', () => {
    const rec = buildFollowRecord(DID, 'did:plc:target', NOW);
    expect(rec.record.subject).toBe('did:plc:target');
  });
});

describe('buildReplyRecord', () => {
  it('returns correct $type and collection', () => {
    const rec = buildReplyRecord(DID, 'at://root', 'rootCid', 'at://parent', 'parentCid', 'Hello', NOW);
    expect(rec.collection).toBe('app.bsky.feed.post');
    expect(rec.record.$type).toBe('app.bsky.feed.post');
  });

  it('embeds root and parent refs', () => {
    const rec = buildReplyRecord(DID, 'at://root', 'rootCid', 'at://parent', 'parentCid', 'Hello', NOW);
    expect(rec.record.reply.root).toEqual({ uri: 'at://root', cid: 'rootCid' });
    expect(rec.record.reply.parent).toEqual({ uri: 'at://parent', cid: 'parentCid' });
  });

  it('sets text field', () => {
    const rec = buildReplyRecord(DID, 'at://root', 'rootCid', 'at://parent', 'parentCid', 'Hello world', NOW);
    expect(rec.record.text).toBe('Hello world');
  });
});

// ── Network action helpers ────────────────────────────────────────────────────

describe('likePost', () => {
  it('POSTs to com.atproto.repo.createRecord with Bearer + like collection', async () => {
    const fetch = mockFetch({});
    await likePost(PDS, JWT, DID, 'at://uri/1', 'cid1', NOW, fetch);
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain('com.atproto.repo.createRecord');
    expect(call[1].method).toBe('POST');
    expect(call[1].headers.Authorization).toBe(`Bearer ${JWT}`);
    const body = JSON.parse(call[1].body as string);
    expect(body.collection).toBe('app.bsky.feed.like');
  });
});

describe('followAccount', () => {
  it('POSTs to createRecord with follow collection', async () => {
    const fetch = mockFetch({});
    await followAccount(PDS, JWT, DID, 'did:plc:target', NOW, fetch);
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body.collection).toBe('app.bsky.graph.follow');
    expect(body.record.subject).toBe('did:plc:target');
  });
});

describe('replyToPost', () => {
  it('POSTs to createRecord with post collection and reply refs', async () => {
    const fetch = mockFetch({});
    await replyToPost(PDS, JWT, DID, 'at://root', 'rootCid', 'at://parent', 'parentCid', 'Hi!', NOW, fetch);
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body.collection).toBe('app.bsky.feed.post');
    expect(body.record.text).toBe('Hi!');
    expect(body.record.reply.root.uri).toBe('at://root');
  });
});
