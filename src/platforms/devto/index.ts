/**
 * DevtoAdapter — PlatformAdapter implementation for Dev.to (Forem).
 *
 * API-based: reads DEVTO_API_KEY from env; no browser, no DOM.
 */

import type { PostContent } from '../../types.js';
import type { Platform } from '../../types.js';
import type { PlatformAdapter } from '../base.js';
import { createArticle, postToArticle } from './client.js';

const DEVTO_ME_URL = 'https://dev.to/api/articles/me';

export class DevtoAdapter implements PlatformAdapter {
  readonly name: Platform = 'devto' as const;

  private get apiKey(): string | undefined {
    return process.env['DEVTO_API_KEY'];
  }

  /**
   * Returns true if DEVTO_API_KEY is set.
   * Full token validation is deferred to login().
   */
  async isLoggedIn(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  /**
   * Validates the API key by calling the authenticated /api/articles/me endpoint.
   * If key is absent, throws immediately.
   * Pass username/password as no-op — Dev.to uses API key auth only.
   */
  async login(_username?: string, _password?: string): Promise<void> {
    const key = this.apiKey;
    if (!key) {
      throw new Error('DEVTO_API_KEY is not set');
    }
    const res = await fetch(DEVTO_ME_URL, {
      headers: { 'api-key': key, Accept: 'application/json' },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Dev.to token validation failed ${res.status}: ${body}`);
    }
  }

  /**
   * Posts content as a Dev.to article.
   * Maps text + tags to article via postToArticle(); see client.ts for mapping rule.
   */
  async post(content: PostContent): Promise<void> {
    const key = this.apiKey;
    if (!key) {
      throw new Error('DEVTO_API_KEY is not set');
    }
    const article = postToArticle(content.text, content.tags);
    await createArticle(key, article);
  }

  /** No persistent connection to close. */
  async close(): Promise<void> {
    // no-op
  }
}
