/**
 * adapters.ts — shared PlatformAdapter factory.
 *
 * Single source of truth for platform → adapter mapping.
 * Used by both login.ts and post.ts to avoid duplication.
 */

import type { Platform } from '../types.js';
import type { PlatformAdapter } from '../platforms/base.js';
import { XAdapter } from '../platforms/x/index.js';
import { InstagramAdapter } from '../platforms/instagram/index.js';
import { LinkedInAdapter } from '../platforms/linkedin/index.js';
import { BlueskyAdapter } from '../platforms/bluesky/index.js';
import { MastodonAdapter } from '../platforms/mastodon/index.js';
import { DevtoAdapter } from '../platforms/devto/index.js';

/**
 * Return a fresh PlatformAdapter for the given platform.
 * Throws on unknown platform (should never happen if the caller validates
 * against the Platform union type, but guards against future drift).
 */
export function makeAdapter(platform: Platform): PlatformAdapter {
  if (platform === 'x')         return new XAdapter();
  if (platform === 'instagram') return new InstagramAdapter();
  if (platform === 'linkedin')  return new LinkedInAdapter();
  if (platform === 'bluesky')   return new BlueskyAdapter();
  if (platform === 'mastodon')  return new MastodonAdapter();
  if (platform === 'devto')     return new DevtoAdapter();
  throw new Error(`Unknown platform: ${platform}`);
}
