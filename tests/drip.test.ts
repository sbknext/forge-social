import { describe, it, expect } from 'vitest';
import { nextToSend, dripProgress } from '../src/core/drip.js';
import { validateCampaign, type Campaign } from '../src/core/campaign.js';

const RAW_CAMPAIGN = {
  name: 'launch',
  posts: [
    { id: 'a', text: 'Post A', platforms: ['x'] },
    { id: 'b', text: 'Post B', platforms: ['x', 'instagram'] },
    { id: 'c', text: 'Post C', platforms: ['all'] },
    { id: 'd', text: 'Post D', platforms: ['instagram'] },
    { id: 'e', text: 'Post E', platforms: ['linkedin'] },
  ],
};

const C: Campaign = validateCampaign(RAW_CAMPAIGN);

describe('nextToSend', () => {
  it('returns posts for x in order skipping already sent', () => {
    // x posts: a, b, c
    const result = nextToSend(C, 'x', ['a'], 5, 0);
    expect(result.map((p) => p.id)).toEqual(['b', 'c']);
  });

  it('respects dailyCap - sentTodayCount', () => {
    // x posts: a, b, c — cap 2, sent 1 today -> max 1 more
    const result = nextToSend(C, 'x', [], 2, 1);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('returns [] when cap already met (sentTodayCount >= dailyCap)', () => {
    const result = nextToSend(C, 'x', [], 3, 3);
    expect(result).toHaveLength(0);
  });

  it('returns [] when sentTodayCount exceeds dailyCap', () => {
    const result = nextToSend(C, 'x', [], 2, 5);
    expect(result).toHaveLength(0);
  });

  it('returns [] when all posts for platform already sent', () => {
    // x posts: a, b, c
    const result = nextToSend(C, 'x', ['a', 'b', 'c'], 5, 0);
    expect(result).toHaveLength(0);
  });

  it('includes all-platform posts for instagram', () => {
    // instagram posts: b, c, d
    const result = nextToSend(C, 'instagram', [], 10, 0);
    expect(result.map((p) => p.id)).toEqual(['b', 'c', 'd']);
  });

  it('excludes posts from other platforms', () => {
    // linkedin post: e
    const result = nextToSend(C, 'linkedin', [], 10, 0);
    expect(result.map((p) => p.id)).toEqual(['c', 'e']); // c=all, e=linkedin
  });

  it('preserves order from campaign.posts', () => {
    const result = nextToSend(C, 'x', [], 10, 0);
    expect(result.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns empty array when no posts exist for platform', () => {
    const single: Campaign = validateCampaign({
      name: 'x',
      posts: [{ id: 'z', text: 'hi', platforms: ['instagram'] }],
    });
    expect(nextToSend(single, 'x', [], 5, 0)).toHaveLength(0);
  });

  it('cap=0 always returns empty', () => {
    expect(nextToSend(C, 'x', [], 0, 0)).toHaveLength(0);
  });
});

describe('dripProgress', () => {
  it('returns correct totals for x (includes all)', () => {
    // x eligible: a, b, c
    const p = dripProgress(C, 'x', []);
    expect(p.total).toBe(3);
    expect(p.sent).toBe(0);
    expect(p.remaining).toBe(3);
  });

  it('counts sent posts correctly', () => {
    const p = dripProgress(C, 'x', ['a', 'c']);
    expect(p.total).toBe(3);
    expect(p.sent).toBe(2);
    expect(p.remaining).toBe(1);
  });

  it('returns 0 remaining when all sent', () => {
    const p = dripProgress(C, 'x', ['a', 'b', 'c']);
    expect(p.remaining).toBe(0);
    expect(p.sent).toBe(3);
  });

  it('ignores sentIds from other platforms', () => {
    // 'd' is instagram-only — should not affect x progress
    const p = dripProgress(C, 'x', ['d']);
    expect(p.sent).toBe(0);
  });

  it('instagram total includes b, c, d', () => {
    const p = dripProgress(C, 'instagram', []);
    expect(p.total).toBe(3);
  });

  it('total + sent + remaining are consistent', () => {
    const p = dripProgress(C, 'instagram', ['b']);
    expect(p.sent + p.remaining).toBe(p.total);
  });
});
