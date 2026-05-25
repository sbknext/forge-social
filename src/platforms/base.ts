import type { Platform, PostContent } from '../types.js';

export interface PlatformAdapter {
  name: Platform;
  isLoggedIn(): Promise<boolean>;
  login(username?: string, password?: string): Promise<void>;
  post(content: PostContent): Promise<void>;
  close(): Promise<void>;
}
