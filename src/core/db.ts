import Database from 'better-sqlite3';
import { dbPath } from './paths.js';
import type { Platform, PostRecord, LoginRecord } from '../types.js';

// ── Campaign sent record ──────────────────────────────────────────────────────
export interface CampaignSentRecord {
  id: number;
  campaign: string;
  platform: string;
  post_id: string;
  sent_at: string;
}

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
    INSERT OR IGNORE INTO logins (platform, last_login_at) VALUES ('linkedin', NULL);

    CREATE TABLE IF NOT EXISTS campaign_sent (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign   TEXT    NOT NULL,
      platform   TEXT    NOT NULL,
      post_id    TEXT    NOT NULL,
      sent_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_sent ON campaign_sent(campaign, platform, post_id);

    CREATE TABLE IF NOT EXISTS engagement_actions (
      platform  TEXT NOT NULL,
      kind      TEXT NOT NULL,
      item_id   TEXT NOT NULL,
      action    TEXT NOT NULL,
      acted_at  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (platform, kind, item_id, action)
    );
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

// ── Campaign helpers ──────────────────────────────────────────────────────────

export interface MarkCampaignSentArgs {
  campaign: string;
  platform: string;
  postId: string;
}

/**
 * Record that a campaign post was sent. Ignores duplicates (UNIQUE index).
 */
export function markCampaignSent(db: Database.Database, args: MarkCampaignSentArgs): void {
  db.prepare(`
    INSERT OR IGNORE INTO campaign_sent (campaign, platform, post_id)
    VALUES (?, ?, ?)
  `).run(args.campaign, args.platform, args.postId);
}

/**
 * Return all post IDs sent for a campaign+platform (ever).
 */
export function sentPostIds(db: Database.Database, campaign: string, platform: string): string[] {
  const rows = db
    .prepare('SELECT post_id FROM campaign_sent WHERE campaign = ? AND platform = ?')
    .all(campaign, platform) as { post_id: string }[];
  return rows.map((r) => r.post_id);
}

/**
 * Return the number of campaign posts sent for a platform today (any campaign).
 */
export function campaignSentToday(db: Database.Database, platform: string): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) as cnt FROM campaign_sent WHERE platform = ? AND DATE(sent_at) = DATE('now')"
    )
    .get(platform) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

/**
 * Return the epoch-ms timestamp of the most recent successful post for a platform,
 * or null if no successful post exists.
 */
export function lastPostAtMs(db: Database.Database, platform: string): number | null {
  const row = db
    .prepare(
      "SELECT posted_at FROM posts WHERE platform = ? AND status = 'success' ORDER BY posted_at DESC LIMIT 1"
    )
    .get(platform) as { posted_at: string } | undefined;
  if (!row) return null;
  const ms = new Date(row.posted_at).getTime();
  return Number.isNaN(ms) ? null : ms;
}

// ── Engagement dedup helpers ──────────────────────────────────────────────────

export interface RecordEngagementArgs {
  platform: string;
  kind: string;
  itemId: string;
  action: string;
}

/**
 * Record that an engagement action was taken. Silently ignores duplicate
 * entries (PRIMARY KEY conflict) so it is safe to call on retry.
 */
export function recordEngagement(db: Database.Database, args: RecordEngagementArgs): void {
  db.prepare(`
    INSERT OR IGNORE INTO engagement_actions (platform, kind, item_id, action)
    VALUES (?, ?, ?, ?)
  `).run(args.platform, args.kind, args.itemId, args.action);
}

/**
 * Return true if this platform+kind+itemId+action has already been acted on.
 * Accepts either a pre-built dedupKey string or the four individual parts.
 *
 * dedupKey format: `<platform>:<kind>:<itemId>:<action>`
 */
export function engagementDone(
  db: Database.Database,
  platformOrKey: string,
  kind?: string,
  itemId?: string,
  action?: string
): boolean {
  let p: string, k: string, i: string, a: string;
  if (kind === undefined || itemId === undefined || action === undefined) {
    // Parsed from dedupKey
    const parts = platformOrKey.split(':');
    if (parts.length < 4) return false;
    // itemId may contain colons (AT URI), so rejoin from index 2 to end-1
    [p, k] = parts;
    a = parts[parts.length - 1];
    i = parts.slice(2, parts.length - 1).join(':');
  } else {
    p = platformOrKey; k = kind; i = itemId; a = action;
  }
  const row = db
    .prepare(
      'SELECT 1 FROM engagement_actions WHERE platform = ? AND kind = ? AND item_id = ? AND action = ?'
    )
    .get(p, k, i, a);
  return row !== undefined;
}

/**
 * Return the number of engagement actions performed today for a given platform.
 */
export function engagementActedToday(db: Database.Database, platform: string): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) as cnt FROM engagement_actions WHERE platform = ? AND DATE(acted_at) = DATE('now')"
    )
    .get(platform) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}
