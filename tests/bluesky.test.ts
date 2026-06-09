import { describe, it, expect, vi } from 'vitest';
import {
  BLUESKY_MAX,
  buildSessionBody,
  buildPostRecord,
  createSession,
  createPost,
} from '../src/platforms/bluesky/client.js';

// ---------------------------------------------------------------------------
// Pure builder tests — no network
// ---------------------------------------------------------------------------

describe('buildSessionBody', () => {
  it('maps handle -> identifier and appPassword -> password', () => {
    const body = buildSessionBody({ handle: 'sam.bsky.social', appPassword: 'secret123' });
    expect(body.identifier).toBe('sam.bsky.social');
    expect(body.password).toBe('secret123');
  });

  it('does not include the pds field', () => {
    const body = buildSessionBody({ handle: 'h', appPassword: 'p', pds: 'https://bsky.social' });
    expect(Object.keys(body)).toEqual(['identifier', 'password']);
  });
});

describe('buildPostRecord', () => {
  const rec = buildPostRecord('Hello Bluesky!', '2026-06-03T10:00:00.000Z');

  it('sets collection to app.bsky.feed.post', () => {
    expect(rec.collection).toBe('app.bsky.feed.post');
  });

  it('sets $type inside record to app.bsky.feed.post', () => {
    expect(rec.record.$type).toBe('app.bsky.feed.post');
  });

  it('preserves text verbatim', () => {
    expect(rec.record.text).toBe('Hello Bluesky!');
  });

  it('preserves injected createdAt', () => {
    expect(rec.record.createdAt).toBe('2026-06-03T10:00:00.000Z');
  });
});

describe('BLUESKY_MAX', () => {
  it('is 300', () => {
    expect(BLUESKY_MAX).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// createSession — mocked fetch
// ---------------------------------------------------------------------------

describe('createSession', () => {
  it('POSTs to {pds}/xrpc/com.atproto.server.createSession', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accessJwt: 'jwt-abc', did: 'did:plc:xyz' }),
    });

    await createSession(
      { handle: 'sam.bsky.social', appPassword: 'app-pass', pds: 'https://bsky.social' },
      mockFetch as unknown as typeof fetch
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://bsky.social/xrpc/com.atproto.server.createSession');
    expect(opts.method).toBe('POST');
    const sentBody = JSON.parse(opts.body as string);
    expect(sentBody.identifier).toBe('sam.bsky.social');
    expect(sentBody.password).toBe('app-pass');
  });

  it('returns accessJwt and did from response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accessJwt: 'tok-999', did: 'did:plc:abc' }),
    });

    const result = await createSession(
      { handle: 'h', appPassword: 'p' },
      mockFetch as unknown as typeof fetch
    );

    expect(result.accessJwt).toBe('tok-999');
    expect(result.did).toBe('did:plc:abc');
  });

  it('throws with status + body on non-2xx', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    await expect(
      createSession({ handle: 'h', appPassword: 'p' }, mockFetch as unknown as typeof fetch)
    ).rejects.toThrow('401');
  });
});

// ---------------------------------------------------------------------------
// createPost — mocked fetch
// ---------------------------------------------------------------------------

describe('createPost', () => {
  it('POSTs to {pds}/xrpc/com.atproto.repo.createRecord with Bearer token', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ uri: 'at://did:plc:xyz/app.bsky.feed.post/abc123' }),
    });

    await createPost(
      'did:plc:xyz',
      'bearer-token',
      'Test post',
      '2026-06-03T10:00:00.000Z',
      'https://bsky.social',
      mockFetch as unknown as typeof fetch
    );

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://bsky.social/xrpc/com.atproto.repo.createRecord');
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer bearer-token');
    const body = JSON.parse(opts.body as string);
    expect(body.repo).toBe('did:plc:xyz');
    expect(body.collection).toBe('app.bsky.feed.post');
    expect(body.record.text).toBe('Test post');
  });

  it('returns uri from response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ uri: 'at://did:plc:xyz/app.bsky.feed.post/newpost' }),
    });

    const result = await createPost(
      'did:plc:xyz', 'tok', 'hi', '2026-01-01T00:00:00.000Z',
      'https://bsky.social', mockFetch as unknown as typeof fetch
    );

    expect(result.uri).toBe('at://did:plc:xyz/app.bsky.feed.post/newpost');
  });

  it('throws with status on non-2xx', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    await expect(
      createPost('did', 'tok', 'text', 'ts', 'https://bsky.social', mockFetch as unknown as typeof fetch)
    ).rejects.toThrow('403');
  });
});
