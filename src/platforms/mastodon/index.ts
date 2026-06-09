/**
 * MastodonAdapter — PlatformAdapter for Mastodon (REST API).
 *
 * Uses the HTTP API only — no browser, no DOM.
 * Env vars: MASTODON_INSTANCE (e.g. mastodon.social), MASTODON_TOKEN.
 *
 */

import type { PostContent } from '../../types.js';
import type { PlatformAdapter } from '../base.js';
import type { Platform } from '../../types.js';
import { getEnv } from '../../core/env.js';
import {
  MASTODON_MAX,
  type MastodonCreds,
  normalizeInstanceUrl,
  postStatus,
} from './client.js';

function getCreds(): MastodonCreds | null {
  const instance = getEnv('MASTODON_INSTANCE');
  const token = getEnv('MASTODON_TOKEN');
  if (!instance || !token) return null;
  return { instance, token };
}

/** Append tags as hashtags after the main text. */
function composeText(content: PostContent): string {
  const tags = content.tags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
  return tags ? `${content.text}\n${tags}` : content.text;
}

export class MastodonAdapter implements PlatformAdapter {
  readonly name: Platform = 'mastodon' as const;

  async isLoggedIn(): Promise<boolean> {
    return getCreds() !== null;
  }

  /**
   * Validates credentials by calling GET /api/v1/accounts/verify_credentials.
   * Throws if the token is invalid or the instance is unreachable.
   */
  async login(_username?: string, _password?: string): Promise<void> {
    const creds = getCreds();
    if (!creds) {
      throw new Error('Mastodon: MASTODON_INSTANCE and MASTODON_TOKEN must be set.');
    }
    const base = normalizeInstanceUrl(creds.instance);
    const res = await fetch(`${base}/api/v1/accounts/verify_credentials`, {
      headers: { Authorization: `Bearer ${creds.token}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Mastodon login verification failed: ${res.status} ${body}`);
    }
  }

  async post(content: PostContent): Promise<void> {
    const creds = getCreds();
    if (!creds) {
      throw new Error('Mastodon: MASTODON_INSTANCE and MASTODON_TOKEN must be set.');
    }

    const text = composeText(content);

    if (text.length > MASTODON_MAX) {
      throw new Error(
        `Mastodon: post exceeds ${MASTODON_MAX}-char limit (${text.length}).`
      );
    }

    await postStatus(creds, text);
  }

  async close(): Promise<void> {
    // No persistent connection — nothing to close.
  }
}
