import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, recordPost, recentPosts, todayCount, incrementToday, lastLogin, setLastLogin } from '../src/core/db.js';
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
  });
});
