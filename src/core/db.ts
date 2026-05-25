import Database from 'better-sqlite3';
import { dbPath } from './paths.js';
import type { Platform, PostRecord, LoginRecord } from '../types.js';

let _db: Database.Database | null = null;

export function getDb(overridePath?: string): Database.Database {
  if (_db) return _db;
  _db = new Database(overridePath ?? dbPath());
  _db.pragma('journal_mode = WAL');
  migrate(_db);
  return _db;
}

// For tests — fresh DB per test
export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      platform   TEXT NOT NULL,
      text       TEXT NOT NULL,
      image_path TEXT,
      tags       TEXT,
      status     TEXT NOT NULL DEFAULT 'success',
      posted_at  TEXT NOT NULL DEFAULT (datetime('now')),
      error      TEXT
    );

    CREATE TABLE IF NOT EXISTS daily_count (
      date     TEXT NOT NULL,
      platform TEXT NOT NULL,
      count    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, platform)
    );

    CREATE TABLE IF NOT EXISTS logins (
      platform      TEXT PRIMARY KEY,
      last_login_at TEXT
    );

    INSERT OR IGNORE INTO logins (platform, last_login_at) VALUES ('x', NULL);
    INSERT OR IGNORE INTO logins (platform, last_login_at) VALUES ('instagram', NULL);
  `);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function todayCount(db: Database.Database, platform: Platform): number {
  const row = db
    .prepare('SELECT count FROM daily_count WHERE date = ? AND platform = ?')
    .get(todayISO(), platform) as { count: number } | undefined;
  return row?.count ?? 0;
}

export function incrementToday(db: Database.Database, platform: Platform): void {
  const today = todayISO();
  db.prepare(`
    INSERT INTO daily_count (date, platform, count) VALUES (?, ?, 1)
    ON CONFLICT(date, platform) DO UPDATE SET count = count + 1
  `).run(today, platform);
}

export function recordPost(
  db: Database.Database,
  platform: Platform,
  text: string,
  imagePath: string | null,
  tags: string | null,
  status: PostRecord['status'],
  error: string | null = null,
): void {
  db.prepare(`
    INSERT INTO posts (platform, text, image_path, tags, status, posted_at, error)
    VALUES (?, ?, ?, ?, ?, datetime('now'), ?)
  `).run(platform, text, imagePath, tags, status, error);
}

export function recentPosts(db: Database.Database, limit = 10): PostRecord[] {
  return db
    .prepare('SELECT * FROM posts ORDER BY posted_at DESC LIMIT ?')
    .all(limit) as PostRecord[];
}

export function lastLogin(db: Database.Database, platform: Platform): string | null {
  const row = db
    .prepare('SELECT last_login_at FROM logins WHERE platform = ?')
    .get(platform) as LoginRecord | undefined;
  return row?.last_login_at ?? null;
}

export function setLastLogin(db: Database.Database, platform: Platform): void {
  db.prepare("UPDATE logins SET last_login_at = datetime('now') WHERE platform = ?").run(platform);
}
