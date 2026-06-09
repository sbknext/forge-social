import type Database from 'better-sqlite3';

export interface PostSummary {
  byPlatform: Record<string, { total: number; success: number; error: number; today: number }>;
  byCampaign: Record<string, number>;
  recent: Array<{ platform: string; text: string; status: string; posted_at: string }>;
}

interface PlatformRow {
  platform: string;
  status: string;
  cnt: number;
}

interface TodayRow {
  platform: string;
  cnt: number;
}

interface CampaignRow {
  campaign: string;
  cnt: number;
}

interface RecentRow {
  platform: string;
  text: string;
  status: string;
  posted_at: string;
}

export function computePostSummary(db: Database.Database, recentLimit = 10): PostSummary {
  // Group by platform + status
  const platformRows = db
    .prepare(
      `SELECT platform, status, COUNT(*) as cnt
       FROM posts
       GROUP BY platform, status`
    )
    .all() as PlatformRow[];

  // Today counts per platform (using DATE('now') to match SQLite's local date)
  const todayRows = db
    .prepare(
      `SELECT platform, COUNT(*) as cnt
       FROM posts
       WHERE DATE(posted_at) = DATE('now')
       GROUP BY platform`
    )
    .all() as TodayRow[];

  const todayByPlatform: Record<string, number> = {};
  for (const row of todayRows) {
    todayByPlatform[row.platform] = row.cnt;
  }

  const byPlatform: PostSummary['byPlatform'] = {};
  for (const row of platformRows) {
    if (!byPlatform[row.platform]) {
      byPlatform[row.platform] = { total: 0, success: 0, error: 0, today: 0 };
    }
    const entry = byPlatform[row.platform];
    entry.total += row.cnt;
    if (row.status === 'success') entry.success += row.cnt;
    else if (row.status === 'error' || row.status === 'captcha') entry.error += row.cnt;
  }

  // Merge today counts
  for (const [platform, cnt] of Object.entries(todayByPlatform)) {
    if (!byPlatform[platform]) {
      byPlatform[platform] = { total: 0, success: 0, error: 0, today: 0 };
    }
    byPlatform[platform].today = cnt;
  }

  // Campaign sent counts
  const campaignRows = db
    .prepare(
      `SELECT campaign, COUNT(*) as cnt
       FROM campaign_sent
       GROUP BY campaign`
    )
    .all() as CampaignRow[];

  const byCampaign: PostSummary['byCampaign'] = {};
  for (const row of campaignRows) {
    byCampaign[row.campaign] = row.cnt;
  }

  // Recent posts
  const recentRows = db
    .prepare(
      `SELECT platform, text, status, posted_at
       FROM posts
       ORDER BY posted_at DESC
       LIMIT ?`
    )
    .all(recentLimit) as RecentRow[];

  return { byPlatform, byCampaign, recent: recentRows };
}
