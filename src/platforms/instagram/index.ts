import type { PlatformAdapter } from '../base.js';
import type { PostContent } from '../../types.js';
import { getBrowserContext, closeContext } from '../../core/browser.js';
import { isLoggedIn, interactiveLogin } from './auth.js';
import { postToInstagram } from './post.js';

export class InstagramAdapter implements PlatformAdapter {
  readonly name = 'instagram' as const;

  async isLoggedIn(): Promise<boolean> {
    const ctx = await getBrowserContext('instagram');
    return isLoggedIn(ctx);
  }

  async login(username?: string, password?: string): Promise<void> {
    const ctx = await getBrowserContext('instagram');
    await interactiveLogin(ctx, username, password);
  }

  async post(content: PostContent): Promise<void> {
    const ctx = await getBrowserContext('instagram');
    await postToInstagram(ctx, content);
  }

  async close(): Promise<void> {
    await closeContext('instagram');
  }
}
