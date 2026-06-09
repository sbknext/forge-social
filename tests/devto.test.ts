/**
 * Dev.to adapter unit tests.
 * All network calls are mocked — no real HTTP in this suite.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  toDevtoTags,
  postToArticle,
  createArticle,
  type DevtoArticle,
} from '../src/platforms/devto/client.js';

// ---------------------------------------------------------------------------
// toDevtoTags
// ---------------------------------------------------------------------------
describe('toDevtoTags', () => {
  it('strips leading # from tags', () => {
    expect(toDevtoTags(['#typescript', '#node'])).toEqual(['typescript', 'node']);
  });

  it('lowercases tags', () => {
    expect(toDevtoTags(['TypeScript', 'NodeJS'])).toEqual(['typescript', 'nodejs']);
  });

  it('removes non-alphanumeric characters', () => {
    expect(toDevtoTags(['open-source', 'web dev', 'c++'])).toEqual([
      'opensource',
      'webdev',
      'c',
    ]);
  });

  it('deduplicates (first occurrence wins)', () => {
    expect(toDevtoTags(['ts', 'TS', '#ts'])).toEqual(['ts']);
  });

  it('caps at 4 tags', () => {
    const result = toDevtoTags(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(result).toHaveLength(4);
    expect(result).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops empty strings after cleaning', () => {
    expect(toDevtoTags(['###', '  ', '', 'ok'])).toEqual(['ok']);
  });

  it('returns empty array for empty input', () => {
    expect(toDevtoTags([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// postToArticle
// ---------------------------------------------------------------------------
describe('postToArticle', () => {
  it('derives title from first non-empty line of text', () => {
    const text = 'Hello World\nSome body text';
    const article = postToArticle(text, []);
    expect(article.title).toBe('Hello World');
  });

  it('skips bare URL lines when deriving title', () => {
    const text = 'https://example.com\nActual headline here';
    const article = postToArticle(text, []);
    expect(article.title).toBe('Actual headline here');
  });

  it('truncates title at 100 chars with ellipsis', () => {
    const longLine = 'A'.repeat(120);
    const article = postToArticle(longLine, []);
    expect(article.title.length).toBeLessThanOrEqual(100);
    expect(article.title.endsWith('…')).toBe(true);
  });

  it('uses provided opts.title over derived title', () => {
    const article = postToArticle('First line', [], { title: 'Custom Title' });
    expect(article.title).toBe('Custom Title');
  });

  it('truncates opts.title if > 100 chars', () => {
    const article = postToArticle('text', [], { title: 'B'.repeat(110) });
    expect(article.title.length).toBeLessThanOrEqual(100);
    expect(article.title.endsWith('…')).toBe(true);
  });

  it('body_markdown equals full input text unchanged', () => {
    const text = 'Line one\nhttps://link.example\nLine three';
    const article = postToArticle(text, []);
    expect(article.body_markdown).toBe(text);
  });

  it('published defaults to true', () => {
    const article = postToArticle('text', []);
    expect(article.published).toBe(true);
  });

  it('respects opts.published = false', () => {
    const article = postToArticle('text', [], { published: false });
    expect(article.published).toBe(false);
  });

  it('tags are cleaned via toDevtoTags', () => {
    const article = postToArticle('text', ['#TypeScript', '#node', '#node']);
    expect(article.tags).toEqual(['typescript', 'node']);
  });

  it('falls back to "Post" title when all lines are blank', () => {
    const article = postToArticle('   \n\n  ', []);
    expect(article.title).toBe('Post');
  });
});

// ---------------------------------------------------------------------------
// createArticle — fetch mocked
// ---------------------------------------------------------------------------
describe('createArticle', () => {
  const mockArticle: DevtoArticle = {
    title: 'Test Article',
    body_markdown: 'Hello world',
    tags: ['test'],
    published: true,
  };

  it('POSTs to https://dev.to/api/articles', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 42, url: 'https://dev.to/user/test-article-abc' }),
    });

    await createArticle('mykey', mockArticle, mockFetch as unknown as typeof fetch);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://dev.to/api/articles');
  });

  it('sends api-key header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 1, url: 'https://dev.to/u/a' }),
    });

    await createArticle('secret-key', mockArticle, mockFetch as unknown as typeof fetch);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['api-key']).toBe('secret-key');
  });

  it('sends article wrapped in { article: ... } body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 2, url: 'https://dev.to/u/b' }),
    });

    await createArticle('k', mockArticle, mockFetch as unknown as typeof fetch);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toHaveProperty('article');
    expect(body.article.title).toBe('Test Article');
    expect(body.article.body_markdown).toBe('Hello world');
    expect(body.article.tags).toEqual(['test']);
    expect(body.article.published).toBe(true);
  });

  it('returns id and url from response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 99, url: 'https://dev.to/user/my-post-xyz' }),
    });

    const result = await createArticle('k', mockArticle, mockFetch as unknown as typeof fetch);
    expect(result.id).toBe(99);
    expect(result.url).toBe('https://dev.to/user/my-post-xyz');
  });

  it('throws on non-ok response with status + body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => '{"error":"is invalid","status":422}',
    });

    await expect(
      createArticle('bad-key', mockArticle, mockFetch as unknown as typeof fetch),
    ).rejects.toThrow('422');
  });

  it('throws on 401 unauthorized', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    await expect(
      createArticle('wrong', mockArticle, mockFetch as unknown as typeof fetch),
    ).rejects.toThrow('Dev.to API error 401');
  });
});
