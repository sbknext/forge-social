/**
 * Drip engine — pure functions for selecting and tracking campaign post delivery.
 *
 * All functions are pure (no I/O, no DB). The integrator owns persistence via
 * a `campaign_sent` DB table and wires daily counts from there.
 *
 * Integrator must add to the DB (src/core/db.ts migrate):
 *   CREATE TABLE IF NOT EXISTS campaign_sent (
 *     id          INTEGER PRIMARY KEY AUTOINCREMENT,
 *     campaign    TEXT    NOT NULL,
 *     platform    TEXT    NOT NULL,
 *     post_id     TEXT    NOT NULL,
 *     sent_at     TEXT    NOT NULL DEFAULT (datetime('now'))
 *   );
 *   CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_sent ON campaign_sent(campaign, platform, post_id);
 */

import type { Campaign, CampaignPost } from './campaign.js';

export interface DripState {
  campaign: string;
  platform: string;
  sentIds: string[];
}

/**
 * Return the next posts to send for a platform drip.
 *
 * Rules (pure):
 *  - Only posts targeting `platform` (or 'all') are considered.
 *  - Posts already in `sentIds` are skipped.
 *  - `sentTodayCount` is the number already sent today (from DB).
 *  - Returns at most `dailyCap - sentTodayCount` posts.
 *  - If cap already met (sentTodayCount >= dailyCap) → [].
 *  - Order preserved from campaign.posts array (chronological drip).
 */
export function nextToSend(
  c: Campaign,
  platform: 'x' | 'instagram' | 'linkedin' | 'bluesky' | 'mastodon' | 'devto',
  sentIds: string[],
  dailyCap: number,
  sentTodayCount: number
): CampaignPost[] {
  const remaining = dailyCap - sentTodayCount;
  if (remaining <= 0) return [];

  const sentSet = new Set(sentIds);
  const eligible = c.posts.filter(
    (p) =>
      (p.platforms.includes(platform) || p.platforms.includes('all')) &&
      !sentSet.has(p.id)
  );

  return eligible.slice(0, remaining);
}

/**
 * Return drip progress counts for a platform.
 *
 * - `total`: posts targeting the platform (incl 'all').
 * - `sent`: how many of those are in sentIds.
 * - `remaining`: total - sent.
 */
export function dripProgress(
  c: Campaign,
  platform: 'x' | 'instagram' | 'linkedin' | 'bluesky' | 'mastodon' | 'devto',
  sentIds: string[]
): { total: number; sent: number; remaining: number } {
  const sentSet = new Set(sentIds);
  const targeted = c.posts.filter(
    (p) => p.platforms.includes(platform) || p.platforms.includes('all')
  );
  const sentCount = targeted.filter((p) => sentSet.has(p.id)).length;
  return {
    total: targeted.length,
    sent: sentCount,
    remaining: targeted.length - sentCount,
  };
}
