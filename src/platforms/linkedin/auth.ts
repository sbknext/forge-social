/**
 * LinkedIn authentication helpers.
 *
 * Ported and adapted from forge-linkedin/src/linkedin/auth.ts.
 * Differences from the original:
 *   - Accepts BrowserContext (forge-social's core/browser.ts manages contexts).
 *   - isLoggedIn() works off a Page derived from the context, matching the X adapter shape.
 *   - login() accepts optional username/password args (same signature as x/auth.ts).
 *   - isCheckpointUrl() is a pure function — no Playwright dependency — for unit testing.
 *   - CaptchaError is not re-exported here; callers use the captcha canary in post.ts.
 */

import type { BrowserContext } from 'playwright';
import {
  LI_LOGGED_IN_SELECTORS,
  LI_AUTH_SELECTORS,
  LI_CHECKPOINT_URL_PATTERNS,
  LI_CAPTCHA_SELECTORS,
  LI_CAPTCHA_TITLE_PATTERNS,
} from './selectors.js';

// ---------------------------------------------------------------------------
// Pure helpers — unit-testable, no Playwright
// ---------------------------------------------------------------------------

/**
 * Returns true if the URL is a known LinkedIn checkpoint / challenge URL.
 *
 * Pure function — no Playwright dependency, safe to unit-test.
 * Ported from forge-linkedin/src/linkedin/captcha.ts (CAPTCHA_URL_PATTERNS).
 */
export function isCheckpointUrl(url: string): boolean {
  const lower = url.toLowerCase();
  // Also catch the auth-wall pattern (/authwall) that redirects unauthenticated users
  if (lower.includes('/authwall')) return true;
  return (LI_CHECKPOINT_URL_PATTERNS as readonly string[]).some(p => lower.includes(p));
}

// ---------------------------------------------------------------------------
// isLoggedIn — ported from forge-linkedin/src/linkedin/auth.ts
// ---------------------------------------------------------------------------

/**
 * Checks whether the LinkedIn session in `ctx` is still authenticated.
 *
 * Strategy (ported from forge-linkedin):
 *   1. Navigate to /feed/
 *   2. If redirected to /login, /uas/login, or /authwall → not logged in
 *   3. If a checkpoint/challenge URL → throw (let callers decide)
 *   4. Check for stable logged-in selectors (typeahead, primary nav)
 *   5. Fall back to URL check (/feed/ without redirect)
 *
 * @unverified — DOM selectors need live LinkedIn session to confirm
 */
export async function isLoggedIn(ctx: BrowserContext): Promise<boolean> {
  const pages = ctx.pages();
  const page = pages.length > 0 ? pages[0] : await ctx.newPage();

  try {
    await page.goto(LI_AUTH_SELECTORS.feedUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });

    const url = page.url();

    // Redirected to login = not authenticated
    if (
      url.includes('/login') ||
      url.includes('/uas/login') ||
      url.includes('/authwall')
    ) {
      return false;
    }

    // Checkpoint = stop, don't swallow
    if (isCheckpointUrl(url)) {
      throw new Error(`[linkedin] Checkpoint/challenge detected at: ${url}`);
    }

    // Check for selectors present only in an authenticated session
    for (const sel of LI_LOGGED_IN_SELECTORS) {
      try {
        await page.waitForSelector(sel, { timeout: 5000 });
        return true;
      } catch {
        // try next
      }
    }

    // If we're on /feed/ without a login redirect and no checkpoint, assume logged in
    return url.includes('/feed/');
  } catch (e) {
    // Re-throw checkpoint errors; swallow network/timeout errors
    if ((e as Error).message?.startsWith('[linkedin]')) throw e;
    return false;
  }
}

// ---------------------------------------------------------------------------
// login — adapted from forge-linkedin/src/linkedin/auth.ts
// ---------------------------------------------------------------------------

/**
 * Logs in to LinkedIn.
 *
 * Flow:
 *   1. If username + password provided → attempt auto-fill (same as X adapter).
 *   2. On any auto-fill failure or post-login checkpoint → fall through to manual.
 *   3. Always ends with a readline prompt so the human can confirm/complete.
 *
 * The persistent Chrome profile (managed by forge-social's core/browser.ts) stores
 * the session cookies — no explicit cookie export/import needed.
 *
 * @param ctx  - Playwright BrowserContext from getBrowserContext('linkedin')
 * @param username - LinkedIn email/username (optional; falls back to manual)
 * @param password - LinkedIn password (optional; falls back to manual)
 */
export async function login(
  ctx: BrowserContext,
  username?: string,
  password?: string,
): Promise<void> {
  const pages = ctx.pages();
  const page = pages.length > 0 ? pages[0] : await ctx.newPage();

  await page.goto(LI_AUTH_SELECTORS.loginUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });

  if (username && password) {
    try {
      // Fill credentials with human-like timing (ported from forge-linkedin)
      await page.waitForSelector(LI_AUTH_SELECTORS.usernameInput, { timeout: 10000 });
      await page.fill(LI_AUTH_SELECTORS.usernameInput, username);
      await page.waitForTimeout(500 + Math.floor(Math.random() * 800));

      await page.fill(LI_AUTH_SELECTORS.passwordInput, password);
      await page.waitForTimeout(300 + Math.floor(Math.random() * 500));
      await page.click(LI_AUTH_SELECTORS.submitButton);
      await page.waitForTimeout(3000);

      const urlAfter = page.url();
      const captchaTriggered =
        isCheckpointUrl(urlAfter) || (await _isCaptchaPageFast(page));

      if (captchaTriggered) {
        console.warn(
          '[linkedin] Challenge triggered after auto-login — complete manually in the browser window.',
        );
      } else if (urlAfter.includes('/login')) {
        console.warn('[linkedin] Login may have failed — complete manually.');
      } else {
        console.log('[linkedin] Auto-login succeeded.');
      }
    } catch {
      console.warn('[linkedin] Auto-fill failed — complete login manually in the browser window.');
    }
  } else {
    console.log(
      '[linkedin] No credentials provided. Chromium is open — log in manually, then press Enter.',
    );
  }

  // Always pause for human confirmation (mirrors X adapter's waitForEnter pattern)
  console.log('[linkedin] Press Enter in this terminal once logged in to LinkedIn...');
  await _waitForEnter();
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Quick page-level captcha check (DOM + title, no URL check to avoid duplication).
 * Used only within this module; post.ts uses its own captcha canary.
 * @unverified — selectors need live challenge page to confirm
 */
async function _isCaptchaPageFast(page: import('playwright').Page): Promise<boolean> {
  try {
    const title = (await page.title()).toLowerCase();
    if ((LI_CAPTCHA_TITLE_PATTERNS as readonly string[]).some(p => title.includes(p))) return true;

    for (const sel of LI_CAPTCHA_SELECTORS) {
      const el = await page.$(sel);
      if (el) return true;
    }
  } catch {
    // non-fatal
  }
  return false;
}

function _waitForEnter(): Promise<void> {
  return new Promise(resolve => {
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });
}
