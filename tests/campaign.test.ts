import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  validateCampaign,
  loadCampaignFile,
  postsForPlatform,
  renderCampaignPost,
  type Campaign,
  type CampaignPost,
} from '../src/core/campaign.js';
import type { Brand } from '../src/core/brand.js';

const GOOD_CAMPAIGN = {
  name: 'echo-launch',
  description: 'Echo AI launch drip',
  posts: [
    { id: 'p1', text: 'Check {echo_url}!', platforms: ['x', 'instagram'], tags: ['#AI'] },
    { id: 'p2', text: 'Forge at {forge_url}', platforms: ['all'] },
    { id: 'p3', text: 'LinkedIn post', platforms: ['linkedin'] },
  ],
};

describe('validateCampaign', () => {
  it('accepts a well-formed campaign', () => {
    const c = validateCampaign(GOOD_CAMPAIGN);
    expect(c.name).toBe('echo-launch');
    expect(c.posts).toHaveLength(3);
  });

  it('trims campaign name whitespace', () => {
    const c = validateCampaign({ ...GOOD_CAMPAIGN, name: '  trimmed  ' });
    expect(c.name).toBe('trimmed');
  });

  it('throws when name is missing', () => {
    expect(() => validateCampaign({ posts: GOOD_CAMPAIGN.posts })).toThrow(/name/);
  });

  it('throws when name is empty string', () => {
    expect(() => validateCampaign({ ...GOOD_CAMPAIGN, name: '  ' })).toThrow(/name/);
  });

  it('throws when posts is empty array', () => {
    expect(() => validateCampaign({ name: 'x', posts: [] })).toThrow(/non-empty/);
  });

  it('throws when posts is missing', () => {
    expect(() => validateCampaign({ name: 'x' })).toThrow(/posts/);
  });

  it('throws on duplicate post ids', () => {
    const dup = {
      name: 'x',
      posts: [
        { id: 'same', text: 'a', platforms: ['x'] },
        { id: 'same', text: 'b', platforms: ['x'] },
      ],
    };
    expect(() => validateCampaign(dup)).toThrow(/duplicated/);
  });

  it('throws when post id is empty', () => {
    const bad = { name: 'x', posts: [{ id: '', text: 'hello', platforms: ['x'] }] };
    expect(() => validateCampaign(bad)).toThrow(/id/);
  });

  it('throws when post text is empty', () => {
    const bad = { name: 'x', posts: [{ id: 'p1', text: '', platforms: ['x'] }] };
    expect(() => validateCampaign(bad)).toThrow(/text/);
  });

  it('throws when platforms is empty array', () => {
    const bad = { name: 'x', posts: [{ id: 'p1', text: 'hi', platforms: [] }] };
    expect(() => validateCampaign(bad)).toThrow(/platforms/);
  });

  it('throws on invalid platform value', () => {
    const bad = { name: 'x', posts: [{ id: 'p1', text: 'hi', platforms: ['tiktok'] }] };
    expect(() => validateCampaign(bad)).toThrow(/invalid/);
  });

  it('accepts all allowed platform values', () => {
    const c = validateCampaign({
      name: 'x',
      posts: [
        { id: 'p1', text: 'a', platforms: ['x'] },
        { id: 'p2', text: 'b', platforms: ['instagram'] },
        { id: 'p3', text: 'c', platforms: ['linkedin'] },
        { id: 'p4', text: 'd', platforms: ['all'] },
      ],
    });
    expect(c.posts).toHaveLength(4);
  });

  it('throws when raw is not an object', () => {
    expect(() => validateCampaign('not an object')).toThrow();
    expect(() => validateCampaign(null)).toThrow();
    expect(() => validateCampaign(42)).toThrow();
  });

  it('preserves optional tags and image fields', () => {
    const c = validateCampaign(GOOD_CAMPAIGN);
    expect(c.posts[0].tags).toEqual(['#AI']);
    expect(c.posts[0].image).toBeUndefined();
  });
});

describe('loadCampaignFile', () => {
  it('loads and validates a valid campaign JSON file', () => {
    const p = join(tmpdir(), `campaign-test-${Date.now()}.json`);
    writeFileSync(p, JSON.stringify(GOOD_CAMPAIGN), 'utf-8');
    const c = loadCampaignFile(p);
    expect(c.name).toBe('echo-launch');
    expect(c.posts).toHaveLength(3);
  });

  it('throws a clear error for a missing file', () => {
    expect(() => loadCampaignFile('/tmp/does-not-exist-forge-social.json')).toThrow(
      /Cannot read campaign file/
    );
  });

  it('throws a clear error for invalid JSON', () => {
    const p = join(tmpdir(), `campaign-bad-${Date.now()}.json`);
    writeFileSync(p, '{ bad json }', 'utf-8');
    expect(() => loadCampaignFile(p)).toThrow(/not valid JSON/);
  });

  it('throws a validation error for structurally invalid campaign', () => {
    const p = join(tmpdir(), `campaign-invalid-${Date.now()}.json`);
    writeFileSync(p, JSON.stringify({ name: '', posts: [] }), 'utf-8');
    expect(() => loadCampaignFile(p)).toThrow(/Invalid campaign/);
  });
});

describe('postsForPlatform', () => {
  const c: Campaign = validateCampaign(GOOD_CAMPAIGN);

  it('returns posts for x (includes all)', () => {
    const posts = postsForPlatform(c, 'x');
    const ids = posts.map((p) => p.id);
    expect(ids).toContain('p1'); // x explicit
    expect(ids).toContain('p2'); // all
    expect(ids).not.toContain('p3'); // linkedin only
  });

  it('returns posts for instagram (includes all)', () => {
    const posts = postsForPlatform(c, 'instagram');
    const ids = posts.map((p) => p.id);
    expect(ids).toContain('p1'); // instagram explicit
    expect(ids).toContain('p2'); // all
    expect(ids).not.toContain('p3'); // linkedin only
  });

  it('returns posts for linkedin (includes all)', () => {
    const posts = postsForPlatform(c, 'linkedin');
    const ids = posts.map((p) => p.id);
    expect(ids).toContain('p2'); // all
    expect(ids).toContain('p3'); // linkedin explicit
    expect(ids).not.toContain('p1'); // x+instagram only
  });

  it('returns empty array when no posts match', () => {
    const noMatch: Campaign = {
      name: 'x',
      posts: [{ id: 'a', text: 'hi', platforms: ['linkedin'] }],
    };
    expect(postsForPlatform(noMatch, 'x')).toHaveLength(0);
  });
});

describe('renderCampaignPost', () => {
  const brand: Brand = {
    echo_url: 'https://echo.ai',
    forge_url: 'https://forge.sbknext.com',
    mcp_url: 'https://mcp.sbknext.com',
    handle: '@forge',
    x_handle: '@forgex',
    ig_handle: '@forgeig',
  };

  it('fills brand placeholders in text', () => {
    const post: CampaignPost = {
      id: 'p1',
      text: 'Visit {echo_url} by {handle}',
      platforms: ['x'],
      tags: ['#AI'],
    };
    const rendered = renderCampaignPost(post, brand);
    expect(rendered.text).toBe('Visit https://echo.ai by @forge');
  });

  it('passes tags through unchanged', () => {
    const post: CampaignPost = {
      id: 'p1',
      text: 'hello',
      platforms: ['x'],
      tags: ['#AI', '#Forge'],
    };
    const rendered = renderCampaignPost(post, brand);
    expect(rendered.tags).toEqual(['#AI', '#Forge']);
  });

  it('returns empty tags array when post has no tags', () => {
    const post: CampaignPost = { id: 'p1', text: 'hello', platforms: ['x'] };
    const rendered = renderCampaignPost(post, brand);
    expect(rendered.tags).toEqual([]);
  });

  it('passes image path through when present', () => {
    const post: CampaignPost = {
      id: 'p1',
      text: 'hello',
      platforms: ['x'],
      image: 'assets/banner.png',
    };
    const rendered = renderCampaignPost(post, brand);
    expect(rendered.image).toBe('assets/banner.png');
  });

  it('image is absent from result when post has none', () => {
    const post: CampaignPost = { id: 'p1', text: 'hello', platforms: ['x'] };
    const rendered = renderCampaignPost(post, brand);
    expect(rendered.image).toBeUndefined();
  });
});
