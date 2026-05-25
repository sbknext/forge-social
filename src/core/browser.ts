import { chromium, type BrowserContext } from 'playwright';
import { mkdirSync } from 'node:fs';
import type { Platform } from '../types.js';
import { profileDir } from './paths.js';

const contexts = new Map<Platform, BrowserContext>();

export async function getBrowserContext(platform: Platform): Promise<BrowserContext> {
  if (contexts.has(platform)) return contexts.get(platform)!;

  const userDataDir = profileDir(platform);
  mkdirSync(userDataDir, { recursive: true });

  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
    ],
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  contexts.set(platform, ctx);
  return ctx;
}

export async function closeContext(platform: Platform): Promise<void> {
  const ctx = contexts.get(platform);
  if (ctx) {
    await ctx.close();
    contexts.delete(platform);
  }
}

export async function closeAll(): Promise<void> {
  for (const [platform, ctx] of contexts) {
    await ctx.close();
    contexts.delete(platform);
  }
}
