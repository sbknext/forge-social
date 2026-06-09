/**
 * LinkedInAdapter — PlatformAdapter implementation for LinkedIn.
 *
 * Mirrors the shape of XAdapter (src/platforms/x/index.ts) exactly.
 */

import type { PostContent } from '../../types.js';
import type { Platform } from '../../types.js';
import type { PlatformAdapter } from '../base.js';
import { getBrowserContext, closeContext } from '../../core/browser.js';
import { isLoggedIn, login } from './auth.js';
import { postUpdate } from './post.js';

export class LinkedInAdapter implements PlatformAdapter {
  readonly name: Platform = 'linkedin';

  async isLoggedIn(): Promise<boolean> {
    const ctx = await getBrowserContext(this.name);
    return isLoggedIn(ctx);
  }

  /**
   * Logs in to LinkedIn.
   * Opens the persistent Chrome profile managed by forge-social's core/browser.ts.
   * Session cookies are persisted to ~/.forge-social/chrome-profile-linkedin/.
   */
  async login(username?: string, password?: string): Promise<void> {
    const ctx = await getBrowserContext(this.name);
    await login(ctx, username, password);
  }

  /**
   * Posts a text update (with optional image) to LinkedIn.
   * @see post.ts for the full DOM flow and safety notes.
   */
  async post(content: PostContent): Promise<void> {
    const ctx = await getBrowserContext(this.name);
    await postUpdate(ctx, content);
  }

  async close(): Promise<void> {
    await closeContext(this.name);
  }
}
