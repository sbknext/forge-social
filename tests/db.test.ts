import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  openDb,
  recordPost,
  recentPosts,
  todayCount,
  incrementToday,
  lastLogin,
  setLastLogin,
  markCampaignSent,
  sentPostIds,
  campaignSentToday,
  recordEngagement,
  engagementDone,
  engagementActedToday,
} from '../src/core/db.js';
import Database from 'better-sqlite3';

describe('db', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('recordPost + recentPosts', () => {
    it('inserts a post record', () => {
      recordPost(db, 'x', 'Hello world', null, '#AI', 'success');
      const posts = recentPosts(db, 10);
      expect(posts).toHaveLength(1);
      expect(posts[0].platform).toBe('x');
      expect(posts[0].text).toBe('Hello world');
      expect(posts[0].status).toBe('success');
    });

    it('inserts multiple posts and returns newest first', () => {
      recordPost(db, 'x', 'First', null, null, 'success');
      // Force a later timestamp for the second record
      db.prepare(
        "INSERT INTO posts (platform, text, image_path, tags, status, posted_at) VALUES ('instagram','Second','/img.jpg','#tag','success', datetime('now', '+1 second'))"
      ).run();
      const posts = recentPosts(db, 10);
      expect(posts).toHaveLength(2);
      expect(posts[0].platform).toBe('instagram'); // inserted last → newest first
    });

    it('respects limit', () => {
      for (let i = 0; i < 15; i++) {
        recordPost(db, 'x', `Post ${i}`, null, null, 'success');
      }
      expect(recentPosts(db, 5)).toHaveLength(5);
    });

    it('stores error message', () => {
      recordPost(db, 'x', 'fail', null, null, 'error', 'Something broke');
      const posts = recentPosts(db, 1);
      expect(posts[0].error).toBe('Something broke');
    });

    it('stores captcha status', () => {
      recordPost(db, 'instagram', 'ig post', '/img.jpg', null, 'captcha', 'Challenge detected');
      const posts = recentPosts(db, 1);
      expect(posts[0].status).toBe('captcha');
    });
  });

  describe('todayCount + incrementToday', () => {
    it('starts at zero', () => {
      expect(todayCount(db, 'x')).toBe(0);
      expect(todayCount(db, 'instagram')).toBe(0);
    });

    it('increments x independently from instagram', () => {
      incrementToday(db, 'x');
      incrementToday(db, 'x');
      incrementToday(db, 'instagram');
      expect(todayCount(db, 'x')).toBe(2);
      expect(todayCount(db, 'instagram')).toBe(1);
    });

    it('increments idempotently (upsert)', () => {
      incrementToday(db, 'x');
      incrementToday(db, 'x');
      incrementToday(db, 'x');
      expect(todayCount(db, 'x')).toBe(3);
    });
  });

  describe('lastLogin + setLastLogin', () => {
    it('returns null before any login', () => {
      expect(lastLogin(db, 'x')).toBeNull();
      expect(lastLogin(db, 'instagram')).toBeNull();
    });

    it('records login timestamp', () => {
      setLastLogin(db, 'x');
      const ts = lastLogin(db, 'x');
      expect(ts).not.toBeNull();
      expect(typeof ts).toBe('string');
    });

    it('platforms have independent login records', () => {
      setLastLogin(db, 'x');
      expect(lastLogin(db, 'instagram')).toBeNull();
    });

    it('linkedin login row seeded by migrate — setLastLogin updates it', () => {
      // M3 fix: migrate() inserts linkedin row; setLastLogin must find it
      expect(lastLogin(db, 'linkedin')).toBeNull();
      setLastLogin(db, 'linkedin');
      expect(lastLogin(db, 'linkedin')).not.toBeNull();
    });
  });

  describe('campaign_sent helpers', () => {
    it('sentPostIds returns empty array before any sends', () => {
      expect(sentPostIds(db, 'echo-forge', 'x')).toEqual([]);
    });

    it('markCampaignSent records a post_id', () => {
      markCampaignSent(db, { campaign: 'echo-forge', platform: 'x', postId: 'post-1' });
      expect(sentPostIds(db, 'echo-forge', 'x')).toContain('post-1');
    });

    it('markCampaignSent is idempotent (duplicate ignored)', () => {
      markCampaignSent(db, { campaign: 'echo-forge', platform: 'x', postId: 'post-1' });
      markCampaignSent(db, { campaign: 'echo-forge', platform: 'x', postId: 'post-1' });
      expect(sentPostIds(db, 'echo-forge', 'x')).toHaveLength(1);
    });

    it('sentPostIds is scoped to campaign+platform', () => {
      markCampaignSent(db, { campaign: 'echo-forge', platform: 'x', postId: 'post-1' });
      expect(sentPostIds(db, 'echo-forge', 'instagram')).toHaveLength(0);
      expect(sentPostIds(db, 'other-campaign', 'x')).toHaveLength(0);
    });

    it('campaignSentToday counts across campaigns for a platform', () => {
      expect(campaignSentToday(db, 'x')).toBe(0);
      markCampaignSent(db, { campaign: 'echo-forge', platform: 'x', postId: 'post-1' });
      markCampaignSent(db, { campaign: 'echo-forge', platform: 'x', postId: 'post-2' });
      markCampaignSent(db, { campaign: 'echo-forge', platform: 'instagram', postId: 'post-3' });
      expect(campaignSentToday(db, 'x')).toBe(2);
      expect(campaignSentToday(db, 'instagram')).toBe(1);
    });
  });

  describe('engagement_actions helpers', () => {
    it('engagementDone returns false before any action recorded', () => {
      expect(engagementDone(db, 'bluesky', 'like', 'item-1', 'like')).toBe(false);
    });

    it('recordEngagement marks an action as done', () => {
      recordEngagement(db, { platform: 'bluesky', kind: 'like', itemId: 'item-1', action: 'like' });
      expect(engagementDone(db, 'bluesky', 'like', 'item-1', 'like')).toBe(true);
    });

    it('recordEngagement is idempotent (duplicate ignored)', () => {
      recordEngagement(db, { platform: 'bluesky', kind: 'follow', itemId: 'u1', action: 'follow-back' });
      recordEngagement(db, { platform: 'bluesky', kind: 'follow', itemId: 'u1', action: 'follow-back' });
      // no throw + still counts as 1
      expect(engagementActedToday(db, 'bluesky')).toBe(1);
    });

    it('engagementDone works with a dedupKey string', () => {
      recordEngagement(db, { platform: 'mastodon', kind: 'mention', itemId: 'notif-99', action: 'like' });
      expect(engagementDone(db, 'mastodon:mention:notif-99:like')).toBe(true);
    });

    it('engagementDone handles AT URIs with colons in itemId', () => {
      const atUri = 'at://did:plc:abc/app.bsky.feed.post/123';
      recordEngagement(db, { platform: 'bluesky', kind: 'reply', itemId: atUri, action: 'reply' });
      expect(engagementDone(db, 'bluesky', 'reply', atUri, 'reply')).toBe(true);
      // Also via dedupKey
      expect(engagementDone(db, `bluesky:reply:${atUri}:reply`)).toBe(true);
    });

    it('engagementActedToday returns count for platform', () => {
      expect(engagementActedToday(db, 'mastodon')).toBe(0);
      recordEngagement(db, { platform: 'mastodon', kind: 'like', itemId: 'a', action: 'like' });
      recordEngagement(db, { platform: 'mastodon', kind: 'follow', itemId: 'b', action: 'follow-back' });
      expect(engagementActedToday(db, 'mastodon')).toBe(2);
      expect(engagementActedToday(db, 'bluesky')).toBe(0);
    });

    it('different actions on same item are separate records', () => {
      recordEngagement(db, { platform: 'bluesky', kind: 'mention', itemId: 'x1', action: 'like' });
      recordEngagement(db, { platform: 'bluesky', kind: 'mention', itemId: 'x1', action: 'reply' });
      expect(engagementDone(db, 'bluesky', 'mention', 'x1', 'like')).toBe(true);
      expect(engagementDone(db, 'bluesky', 'mention', 'x1', 'reply')).toBe(true);
      expect(engagementActedToday(db, 'bluesky')).toBe(2);
    });
  });
});
