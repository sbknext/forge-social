import type { PlatformAdapter } from '../base.js';
import type { PostContent } from '../../types.js';
import { getBrowserContext, closeContext } from '../../core/browser.js';
import { isLoggedIn, interactiveLogin } from './auth.js';
import { postToX } from './post.js';

export class XAdapter implements PlatformAdapter {
  readonly name = 'x' as const;

  async isLoggedIn(): Promise<boolean> {
    const ctx = await getBrowserContext('x');
    return isLoggedIn(ctx);
  }

  async login(username?: string, password?: string): Promise<void> {
    const ctx = await getBrowserContext('x');
    await interactiveLogin(ctx, username, password);
  }

  async post(content: PostContent): Promise<void> {
    const ctx = await getBrowserContext('x');
    await postToX(ctx, content);
  }

  async close(): Promise<void> {
    await closeContext('x');
  }
}
