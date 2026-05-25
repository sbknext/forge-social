import type { BrowserContext } from 'playwright';
import { X_SELECTORS } from './selectors.js';

export async function isLoggedIn(ctx: BrowserContext): Promise<boolean> {
  const pages = ctx.pages();
  const page = pages.length > 0 ? pages[0] : await ctx.newPage();

  try {
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 15000 });
    // Logged in if new-tweet button exists
    const el = await page.$(X_SELECTORS.newTweetButton);
    return !!el;
  } catch {
    return false;
  }
}

export async function interactiveLogin(
  ctx: BrowserContext,
  username?: string,
  password?: string,
): Promise<void> {
  const page = ctx.pages().length > 0 ? ctx.pages()[0] : await ctx.newPage();
  await page.goto(X_SELECTORS.loginUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

  if (username && password) {
    // Attempt auto-fill
    try {
      await page.waitForSelector(X_SELECTORS.loginInput, { timeout: 10000 });
      await page.fill(X_SELECTORS.loginInput, username);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);

      await page.waitForSelector(X_SELECTORS.passwordInput, { timeout: 10000 });
      await page.fill(X_SELECTORS.passwordInput, password);
      await page.waitForTimeout(500);
      await page.click(X_SELECTORS.loginButton);
      await page.waitForTimeout(3000);
    } catch {
      // Fall through to manual login
      console.log('[x] Auto-fill failed — complete login manually in the browser window.');
    }
  }

  // Wait for manual completion
  console.log('[x] Press Enter in this terminal once logged in...');
  await waitForEnter();
}

function waitForEnter(): Promise<void> {
  return new Promise(resolve => {
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });
}
