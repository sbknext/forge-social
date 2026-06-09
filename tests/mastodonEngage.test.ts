/**
 * Unit tests for src/platforms/mastodon/engage.ts
 *
 * All tests are network-free: fetch is injected via the fetchImpl parameter.
 * normalizeInstanceUrl is imported from client.ts (same package) and is exercised
 * implicitly through each action helper.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  listNotifications,
  favourite,
  followAccount,
  reply,
} from '../src/platforms/mastodon/engage.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch;
}

const INSTANCE = 'mastodon.social';
const TOKEN = 'test-mastodon-token';

// ── listNotifications ─────────────────────────────────────────────────────────

describe('listNotifications', () => {
  const sampleNotifications = [
    {
      id: 'notif-001',
      type: 'favourite',
      account: { id: 'acc-alice', acct: 'alice@mastodon.social' },
      status: { id: 'status-001', content: '<p>Great post!</p>' },
    },
    {
      id: 'notif-002',
      type: 'mention',
      account: { id: 'acc-bob', acct: 'bob' },
      status: { id: 'status-002', content: '<p>Hey <span>@me</span> what do you think?</p>' },
    },
    {
      id: 'notif-003',
      type: 'follow',
      account: { id: 'acc-carol', acct: 'carol@other.social' },
    },
    {
      id: 'notif-004',
      type: 'reblog',
      account: { id: 'acc-dave', acct: 'dave' },
      status: { id: 'status-004', content: '<p>Reposted content</p>' },
    },
  ];

  it('maps favourite notification to kind=like', async () => {
    const items = await listNotifications(INSTANCE, TOKEN, mockFetch(sampleNotifications));
    expect(items[0].kind).toBe('like');
    expect(items[0].authorHandle).toBe('alice@mastodon.social');
    expect(items[0].authorId).toBe('acc-alice');
  });

  it('extracts status id as subjectUri for favourite', async () => {
    const items = await listNotifications(INSTANCE, TOKEN, mockFetch(sampleNotifications));
    expect(items[0].subjectUri).toBe('status-001');
  });

  it('strips HTML tags from status content', async () => {
    const items = await listNotifications(INSTANCE, TOKEN, mockFetch(sampleNotifications));
    expect(items[0].text).toBe('Great post!');
  });

  it('maps mention notification to kind=mention', async () => {
    const items = await listNotifications(INSTANCE, TOKEN, mockFetch(sampleNotifications));
    expect(items[1].kind).toBe('mention');
    expect(items[1].authorHandle).toBe('bob');
    expect(items[1].text).not.toContain('<');
  });

  it('maps follow notification to kind=follow with empty subjectUri', async () => {
    const items = await listNotifications(INSTANCE, TOKEN, mockFetch(sampleNotifications));
    expect(items[2].kind).toBe('follow');
    expect(items[2].authorHandle).toBe('carol@other.social');
    expect(items[2].subjectUri).toBe('');
    expect(items[2].text).toBe('');
  });

  it('maps reblog notification to kind=repost', async () => {
    const items = await listNotifications(INSTANCE, TOKEN, mockFetch(sampleNotifications));
    expect(items[3].kind).toBe('repost');
  });

  it('returns EngagementItem[] with correct length', async () => {
    const items = await listNotifications(INSTANCE, TOKEN, mockFetch(sampleNotifications));
    expect(items).toHaveLength(4);
  });

  it('sends Authorization Bearer header', async () => {
    const fetch = mockFetch(sampleNotifications);
    await listNotifications(INSTANCE, TOKEN, fetch);
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('throws on non-2xx response', async () => {
    await expect(
      listNotifications(INSTANCE, TOKEN, mockFetch({ error: 'Unauthorized' }, 401))
    ).rejects.toThrow('Mastodon listNotifications failed: 401');
  });

  it('sets subjectCid to empty string (Mastodon has no CID)', async () => {
    const items = await listNotifications(INSTANCE, TOKEN, mockFetch(sampleNotifications));
    for (const item of items) {
      expect(item.subjectCid).toBe('');
    }
  });
});

// ── favourite ─────────────────────────────────────────────────────────────────

describe('favourite', () => {
  it('POSTs to /api/v1/statuses/:id/favourite with Bearer', async () => {
    const fetch = mockFetch({ id: 'status-001', favourited: true });
    await favourite(INSTANCE, TOKEN, 'status-001', fetch);
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain('/api/v1/statuses/status-001/favourite');
    expect(call[1].method).toBe('POST');
    expect(call[1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('throws on non-2xx response', async () => {
    await expect(
      favourite(INSTANCE, TOKEN, 'status-001', mockFetch({}, 422))
    ).rejects.toThrow('Mastodon favourite failed: 422');
  });
});

// ── followAccount ─────────────────────────────────────────────────────────────

describe('followAccount', () => {
  it('POSTs to /api/v1/accounts/:id/follow with Bearer', async () => {
    const fetch = mockFetch({ id: 'acc-carol', following: true });
    await followAccount(INSTANCE, TOKEN, 'acc-carol', fetch);
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain('/api/v1/accounts/acc-carol/follow');
    expect(call[1].method).toBe('POST');
    expect(call[1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('throws on non-2xx response', async () => {
    await expect(
      followAccount(INSTANCE, TOKEN, 'acc-carol', mockFetch({}, 404))
    ).rejects.toThrow('Mastodon followAccount failed: 404');
  });
});

// ── reply ─────────────────────────────────────────────────────────────────────

describe('reply', () => {
  it('POSTs to /api/v1/statuses with in_reply_to_id and status text', async () => {
    const fetch = mockFetch({ id: 'new-status-001', in_reply_to_id: 'status-002' });
    await reply(INSTANCE, TOKEN, 'status-002', 'Thanks for the mention!', fetch);
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain('/api/v1/statuses');
    expect(call[1].method).toBe('POST');
    expect(call[1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    const body = JSON.parse(call[1].body as string);
    expect(body.in_reply_to_id).toBe('status-002');
    expect(body.status).toBe('Thanks for the mention!');
  });

  it('throws on non-2xx response', async () => {
    await expect(
      reply(INSTANCE, TOKEN, 'status-002', 'Hi', mockFetch({}, 500))
    ).rejects.toThrow('Mastodon reply failed: 500');
  });
});
