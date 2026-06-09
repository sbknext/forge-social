/**
 * Campaign engine — JSON-defined drip campaign with platform routing + brand rendering.
 *
 * Campaign JSON shape:
 * {
 *   "name": "echo-launch",
 *   "description": "optional",
 *   "posts": [
 *     {
 *       "id": "post-1",
 *       "text": "Try {echo_url} — AI chat with tiered providers.",
 *       "platforms": ["x", "instagram"],
 *       "tags": ["#AI", "#EchoAI"],
 *       "image": "assets/echo-banner.png"   // optional
 *     }
 *   ]
 * }
 *
 * 'linkedin' is reserved for Phase B — allowed in platform lists but not yet wired to an adapter.
 */

import { readFileSync } from 'node:fs';
import { renderBrand, type Brand } from './brand.js';

export type CampaignPlatform = 'x' | 'instagram' | 'linkedin' | 'bluesky' | 'mastodon' | 'devto' | 'all';

export interface CampaignPost {
  id: string;
  text: string;
  platforms: CampaignPlatform[];
  tags?: string[];
  image?: string;
}

export interface Campaign {
  name: string;
  description?: string;
  posts: CampaignPost[];
}

const ALLOWED_PLATFORMS = new Set<CampaignPlatform>(['x', 'instagram', 'linkedin', 'bluesky', 'mastodon', 'devto', 'all']);

/**
 * Validate a raw unknown value as a Campaign.
 * Throws a readable aggregated error listing all violations.
 */
export function validateCampaign(raw: unknown): Campaign {
  const errors: string[] = [];

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Campaign must be a JSON object.');
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj['name'] !== 'string' || obj['name'].trim() === '') {
    errors.push('campaign.name must be a non-empty string');
  }

  if (!Array.isArray(obj['posts']) || obj['posts'].length === 0) {
    errors.push('campaign.posts must be a non-empty array');
    throw new Error(`Invalid campaign:\n  ${errors.join('\n  ')}`);
  }

  const posts = obj['posts'] as unknown[];
  const seenIds = new Set<string>();

  posts.forEach((p, i) => {
    const prefix = `posts[${i}]`;
    if (typeof p !== 'object' || p === null || Array.isArray(p)) {
      errors.push(`${prefix} must be an object`);
      return;
    }
    const post = p as Record<string, unknown>;

    if (typeof post['id'] !== 'string' || post['id'].trim() === '') {
      errors.push(`${prefix}.id must be a non-empty string`);
    } else if (seenIds.has(post['id'])) {
      errors.push(`${prefix}.id "${post['id']}" is duplicated`);
    } else {
      seenIds.add(post['id']);
    }

    if (typeof post['text'] !== 'string' || post['text'].trim() === '') {
      errors.push(`${prefix}.text must be a non-empty string`);
    }

    if (!Array.isArray(post['platforms']) || post['platforms'].length === 0) {
      errors.push(`${prefix}.platforms must be a non-empty array`);
    } else {
      for (const pl of post['platforms'] as unknown[]) {
        if (typeof pl !== 'string' || !ALLOWED_PLATFORMS.has(pl as CampaignPlatform)) {
          errors.push(
            `${prefix}.platforms contains invalid value "${pl}"; allowed: x, instagram, linkedin, bluesky, mastodon, devto, all`
          );
        }
      }
    }

    if (post['tags'] !== undefined) {
      if (!Array.isArray(post['tags'])) {
        errors.push(`${prefix}.tags must be an array if present`);
      } else {
        for (const t of post['tags'] as unknown[]) {
          if (typeof t !== 'string') errors.push(`${prefix}.tags values must be strings`);
        }
      }
    }

    if (post['image'] !== undefined && typeof post['image'] !== 'string') {
      errors.push(`${prefix}.image must be a string if present`);
    }
  });

  if (errors.length) {
    throw new Error(`Invalid campaign:\n  ${errors.join('\n  ')}`);
  }

  return {
    name: (obj['name'] as string).trim(),
    ...(obj['description'] !== undefined && typeof obj['description'] === 'string'
      ? { description: obj['description'] }
      : {}),
    posts: posts.map((p) => {
      const post = p as Record<string, unknown>;
      const cp: CampaignPost = {
        id: (post['id'] as string).trim(),
        text: (post['text'] as string),
        platforms: post['platforms'] as CampaignPlatform[],
      };
      if (post['tags'] !== undefined) cp.tags = post['tags'] as string[];
      if (post['image'] !== undefined) cp.image = post['image'] as string;
      return cp;
    }),
  };
}

/**
 * Load a campaign from a JSON file (absolute path).
 * Throws a clear error if the file is missing or invalid.
 */
export function loadCampaignFile(absPath: string): Campaign {
  let raw: string;
  try {
    raw = readFileSync(absPath, 'utf-8');
  } catch (e) {
    throw new Error(`Cannot read campaign file "${absPath}": ${(e as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Campaign file "${absPath}" is not valid JSON: ${(e as Error).message}`);
  }

  return validateCampaign(parsed);
}

/**
 * Return posts targeting the given concrete platform (includes posts with platform 'all').
 */
export function postsForPlatform(
  c: Campaign,
  platform: 'x' | 'instagram' | 'linkedin' | 'bluesky' | 'mastodon' | 'devto'
): CampaignPost[] {
  return c.posts.filter(
    (p) => p.platforms.includes(platform) || p.platforms.includes('all')
  );
}

/**
 * Render a campaign post's text with brand placeholders filled in.
 * Tags and image path are passed through unchanged.
 */
export function renderCampaignPost(
  post: CampaignPost,
  brand: Brand
): { text: string; tags: string[]; image?: string } {
  return {
    text: renderBrand(post.text, brand),
    tags: post.tags ?? [],
    ...(post.image !== undefined ? { image: post.image } : {}),
  };
}
