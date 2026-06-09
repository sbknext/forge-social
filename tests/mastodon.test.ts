import { describe, it, expect, vi } from 'vitest';
import {
  MASTODON_MAX,
  buildStatusBody,
  normalizeInstanceUrl,
  postStatus,
} from '../src/platforms/mastodon/client.js';

// ---------------------------------------------------------------------------
// Pure builder + normaliser tests — no network
// ---------------------------------------------------------------------------

describe('MASTODON_MAX', () => {
  it('is 500', () => {
    expect(MASTODON_MAX).toBe(500);
  });
});

describe('buildStatusBody', () => {
  it('wraps text in status key', () => {
    const body = buildStatusBody('Hello Mastodon!');
    expect(body.status).toBe('Hello Mastodon!');
  });

  it('preserves text with special characters', () => {
    const text = 'Check this: https://example.com 🎉 #tag';
    expect(buildStatusBody(text).status).toBe(text);
  });
});

describe('normalizeInstanceUrl', () => {
  it('prepends https:// when scheme is absent', () => {
    expect(normalizeInstanceUrl('mastodon.social')).toBe('https://mastodon.social');
  });

  it('strips trailing slash', () => {
    expect(normalizeInstanceUrl('https://mastodon.social/')).toBe('https://mastodon.social');
  });

  it('strips multiple trailing slashes', () => {
    expect(normalizeInstanceUrl('mastodon.social///')).toBe('https://mastodon.social');
  });

  it('leaves already-normalised URL unchanged', () => {
    expect(normalizeInstanceUrl('https://fosstodon.org')).toBe('https://fosstodon.org');
  });

  it('throws on http:// to prevent token transmission over plain HTTP', () => {
    expect(() => normalizeInstanceUrl('http://local.dev')).toThrow(/must use https/);
  });
});

// ---------------------------------------------------------------------------
// postStatus — mocked fetch
// ---------------------------------------------------------------------------

describe('postStatus', () => {
  it('POSTs to {instance}/api/v1/statuses with Bearer token', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: '1234567890', url: 'https://mastodon.social/@sam/1234567890' }),
    });

    await postStatus(
      { instance: 'mastodon.social', token: 'tok-xyz' },
      'Hello Mastodon!',
      mockFetch as unknown as typeof fetch
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://mastodon.social/api/v1/statuses');
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-xyz');
    const body = JSON.parse(opts.body as string);
    expect(body.status).toBe('Hello Mastodon!');
  });

  it('returns id and url from response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'abc', url: 'https://mastodon.social/@s/abc' }),
    });

    const result = await postStatus(
      { instance: 'https://mastodon.social', token: 't' },
      'hi',
      mockFetch as unknown as typeof fetch
    );

    expect(result.id).toBe('abc');
    expect(result.url).toBe('https://mastodon.social/@s/abc');
  });

  it('normalises instance URL before building the endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: '1', url: 'https://fosstodon.org/@x/1' }),
    });

    await postStatus(
      { instance: 'fosstodon.org/', token: 't' },
      'test',
      mockFetch as unknown as typeof fetch
    );

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://fosstodon.org/api/v1/statuses');
  });

  it('throws with status + body on non-2xx', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'Unprocessable Entity',
    });

    await expect(
      postStatus(
        { instance: 'mastodon.social', token: 't' },
        'text',
        mockFetch as unknown as typeof fetch
      )
    ).rejects.toThrow('422');
  });
});
