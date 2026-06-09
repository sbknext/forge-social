import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { openDb, recordPost, markCampaignSent } from '../src/core/db.js';
import { computePostSummary } from '../src/core/postStats.js';

describe('computePostSummary', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('returns empty summary for a fresh db', () => {
    const s = computePostSummary(db);
    expect(s.byPlatform).toEqual({});
    expect(s.byCampaign).toEqual({});
    expect(s.recent).toEqual([]);
  });

  it('counts total posts per platform', () => {
    recordPost(db, 'x', 'post1', null, null, 'success');
    recordPost(db, 'x', 'post2', null, null, 'success');
    recordPost(db, 'instagram', 'ig1', null, null, 'success');
    const s = computePostSummary(db);
    expect(s.byPlatform['x'].total).toBe(2);
    expect(s.byPlatform['instagram'].total).toBe(1);
  });

  it('splits success vs error counts', () => {
    recordPost(db, 'x', 'ok', null, null, 'success');
    recordPost(db, 'x', 'fail', null, null, 'error');
    recordPost(db, 'x', 'cap', null, null, 'captcha');
    const s = computePostSummary(db);
    expect(s.byPlatform['x'].success).toBe(1);
    // error + captcha both count as error
    expect(s.byPlatform['x'].error).toBe(2);
    expect(s.byPlatform['x'].total).toBe(3);
  });

  it('today count reflects DATE(now) rows only', () => {
    // Rows recorded normally land in today via datetime('now')
    recordPost(db, 'x', 'today-post', null, null, 'success');
    // Inject a past row directly
    db.prepare(
      "INSERT INTO posts (platform, text, status, posted_at) VALUES ('x', 'old', 'success', '2020-01-01 00:00:00')"
    ).run();
    const s = computePostSummary(db);
    // total = 2, today = 1
    expect(s.byPlatform['x'].total).toBe(2);
    expect(s.byPlatform['x'].today).toBe(1);
  });

  it('counts campaign sends per campaign', () => {
    markCampaignSent(db, { campaign: 'echo-launch', platform: 'x', postId: 'p1' });
    markCampaignSent(db, { campaign: 'echo-launch', platform: 'x', postId: 'p2' });
    markCampaignSent(db, { campaign: 'forge-promo', platform: 'instagram', postId: 'p3' });
    const s = computePostSummary(db);
    expect(s.byCampaign['echo-launch']).toBe(2);
    expect(s.byCampaign['forge-promo']).toBe(1);
  });

  it('byCampaign is empty when no campaign rows exist', () => {
    recordPost(db, 'x', 'some post', null, null, 'success');
    const s = computePostSummary(db);
    expect(s.byCampaign).toEqual({});
  });

  it('recent returns newest first up to limit', () => {
    recordPost(db, 'x', 'first', null, null, 'success');
    db.prepare(
      "INSERT INTO posts (platform, text, status, posted_at) VALUES ('instagram', 'second', 'success', datetime('now', '+1 second'))"
    ).run();
    const s = computePostSummary(db, 5);
    expect(s.recent).toHaveLength(2);
    expect(s.recent[0].platform).toBe('instagram'); // newest first
    expect(s.recent[1].platform).toBe('x');
  });

  it('recent respects recentLimit', () => {
    for (let i = 0; i < 8; i++) {
      recordPost(db, 'x', `post ${i}`, null, null, 'success');
    }
    const s = computePostSummary(db, 3);
    expect(s.recent).toHaveLength(3);
  });

  it('recent row has expected shape', () => {
    recordPost(db, 'linkedin', 'hello linkedin', null, null, 'success');
    const s = computePostSummary(db);
    const row = s.recent[0];
    expect(row).toHaveProperty('platform', 'linkedin');
    expect(row).toHaveProperty('text', 'hello linkedin');
    expect(row).toHaveProperty('status', 'success');
    expect(typeof row.posted_at).toBe('string');
  });

  it('multiple platforms have independent today counts', () => {
    recordPost(db, 'x', 'x-today', null, null, 'success');
    recordPost(db, 'instagram', 'ig-today', null, null, 'success');
    recordPost(db, 'instagram', 'ig-today-2', null, null, 'success');
    const s = computePostSummary(db);
    expect(s.byPlatform['x'].today).toBe(1);
    expect(s.byPlatform['instagram'].today).toBe(2);
  });
});
