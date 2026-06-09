/**
 * BlueskyAdapter — PlatformAdapter for Bluesky (AT Protocol).
 *
 * Uses the HTTP API only — no browser, no DOM.
 * Env vars: BLUESKY_HANDLE, BLUESKY_APP_PASSWORD, BLUESKY_PDS (optional).
 *
 */

import type { PostContent } from '../../types.js';
import type { PlatformAdapter } from '../base.js';
import type { Platform } from '../../types.js';
import { getEnv } from '../../core/env.js';
import {
  BLUESKY_MAX,
  type BlueskyCreds,
  createSession,
  createPost,
} from './client.js';

/** Append tags as hashtags after the main text, separated by a newline. */
function composeText(content: PostContent): string {
  const tags = content.tags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
  return tags ? `${content.text}\n${tags}` : content.text;
}

function getCreds(): BlueskyCreds | null {
  const handle = getEnv('BLUESKY_HANDLE');
  const appPassword = getEnv('BLUESKY_APP_PASSWORD');
  if (!handle || !appPassword) return null;
  return {
    handle,
    appPassword,
    pds: getEnv('BLUESKY_PDS') ?? 'https://bsky.social',
  };
}

export class BlueskyAdapter implements PlatformAdapter {
  readonly name: Platform = 'bluesky' as const;

  async isLoggedIn(): Promise<boolean> {
    const creds = getCreds();
    return creds !== null;
  }

  /**
   * Validates credentials by attempting a real createSession call.
   * Throws immediately when credentials are absent (BLUESKY_HANDLE or
   * BLUESKY_APP_PASSWORD not set) — callers should check isLoggedIn() first.
   */
  async login(_username?: string, _password?: string): Promise<void> {
    const creds = getCreds();
    if (!creds) {
      throw new Error('Bluesky: BLUESKY_HANDLE and BLUESKY_APP_PASSWORD must be set.');
    }
    // Validate by creating + discarding a session.
    await createSession(creds);
  }

  async post(content: PostContent): Promise<void> {
    const creds = getCreds();
    if (!creds) {
      throw new Error('Bluesky: BLUESKY_HANDLE and BLUESKY_APP_PASSWORD must be set.');
    }

    const text = composeText(content);

    // Count graphemes conservatively via Intl.Segmenter when available, else .length.
    const graphemeCount =
      typeof Intl !== 'undefined' && 'Segmenter' in Intl
        ? [...new Intl.Segmenter().segment(text)].length
        : text.length;

    if (graphemeCount > BLUESKY_MAX) {
      throw new Error(
        `Bluesky: post exceeds ${BLUESKY_MAX}-grapheme limit (${graphemeCount}).`
      );
    }

    const pds = creds.pds ?? 'https://bsky.social';
    const { accessJwt, did } = await createSession(creds);
    await createPost(did, accessJwt, text, new Date().toISOString(), pds);
  }

  async close(): Promise<void> {
    // No persistent connection — nothing to close.
  }
}
