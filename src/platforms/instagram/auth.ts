import type { BrowserContext } from 'playwright';
import { IG_SELECTORS } from './selectors.js';

export async function isLoggedIn(ctx: BrowserContext): Promise<boolean> {
  const pages = ctx.pages();
  const page = pages.length > 0 ? pages[0] : await ctx.newPage();

  try {
    await page.goto(IG_SELECTORS.homeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    const nav = await page.$(IG_SELECTORS.nav);
    const loginForm = await page.$('input[name="email"], input[name="username"]');
    return !!nav && !loginForm;
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
  await page.goto(IG_SELECTORS.loginUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);

  if (username && password) {
    try {
      await page.waitForSelector(IG_SELECTORS.usernameInput, { timeout: 10000 });
      await page.fill(IG_SELECTORS.usernameInput, username);
      await page.waitForTimeout(500);
      await page.fill(IG_SELECTORS.passwordInput, password);
      await page.waitForTimeout(500);
      await page.click(IG_SELECTORS.loginButton);
      await page.waitForTimeout(4000);
    } catch {
      console.log('[ig] Auto-fill failed — complete login manually in the browser window.');
    }
  }

  console.log('[ig] Press Enter in this terminal once logged in...');
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
