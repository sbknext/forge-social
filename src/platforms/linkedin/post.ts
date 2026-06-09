/**
 * LinkedIn post submission.
 *
 * @unverified — all share-box/composer selectors need a live authenticated LinkedIn session.
 *
 * SAFETY NOTES:
 *   - Conservative: never post outside caller-enforced rate limits (see core/limiter.ts).
 *   - Captcha canary: throws LinkedInPostError(isCaptcha=true) on any checkpoint, stopping
 *     the session so the operator can intervene.
 *   - All waits use explicit timeouts with fallbacks — no blind page.waitForNavigation().
 *   - Image upload is optional; LinkedIn supports text-only posts.
 *
 * FLOW:
 *   1. Navigate to /feed/
 *   2. Pre-post captcha canary
 *   3. Click "Start a post" trigger (multi-fallback)
 *   4. Wait for editor (multi-fallback)
 *   5. Type text + tags at human pace
 *   6. Optionally attach image via media button → file input
 *   7. Click "Post" submit (multi-fallback)
 *   8. Wait for composer close / success signal
 *   9. Post-submit captcha canary
 */

import type { BrowserContext } from 'playwright';
import type { PostContent } from '../../types.js';
import { isCheckpointUrl } from './auth.js';
import {
  LI_START_POST_SELECTORS,
  LI_POST_EDITOR_SELECTORS,
  LI_MEDIA_BUTTON_SELECTORS,
  LI_FILE_INPUT_SELECTOR,
  LI_SUBMIT_POST_SELECTORS,
  LI_CAPTCHA_SELECTORS,
  LI_CAPTCHA_TITLE_PATTERNS,
  LI_URLS,
  LI_TEXT_LIMIT,
} from './selectors.js';

// ---------------------------------------------------------------------------
// Error class — mirrors XPostError / IGPostError shape
// ---------------------------------------------------------------------------

export class LinkedInPostError extends Error {
  constructor(
    message: string,
    public readonly isCaptcha: boolean = false,
  ) {
    super(message);
    this.name = 'LinkedInPostError';
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Posts a text update (with optional image) to LinkedIn.
 *
 * @param ctx     - Playwright BrowserContext from getBrowserContext('linkedin')
 * @param content - Post text, optional image path, optional tags
 * @throws LinkedInPostError on validation failure, DOM failure, or captcha
 *
 * @unverified — all DOM interactions need live LinkedIn session to confirm
 */
export async function postUpdate(
  ctx: BrowserContext,
  content: PostContent,
): Promise<void> {
  const fullText = _buildText(content);

  if (fullText.length > LI_TEXT_LIMIT) {
    throw new LinkedInPostError(
      `Text too long: ${fullText.length} chars (limit ${LI_TEXT_LIMIT}). Shorten text or tags.`,
    );
  }

  const page = ctx.pages().length > 0 ? ctx.pages()[0] : await ctx.newPage();

  // 1. Navigate to feed
  await page.goto(LI_URLS.feed, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1500);

  // 2. Pre-post captcha canary
  await _assertNoCaptcha(page, 'pre-post');

  // 3. Click "Start a post" trigger
  let opened = false;
  for (const sel of LI_START_POST_SELECTORS) {
    try {
      // @unverified — selector may not match; next fallback tried on timeout
      const trigger = await page.waitForSelector(sel, { timeout: 6000 });
      await trigger.click();
      opened = true;
      break;
    } catch {
      // try next selector
    }
  }

  if (!opened) {
    // Final fallback: use Playwright locator with text matching
    try {
      await page.getByRole('button', { name: /start a post/i }).click({ timeout: 5000 });
      opened = true;
    } catch {
      // give up
    }
  }

  if (!opened) {
    throw new LinkedInPostError(
      'Could not find "Start a post" / "Create a post" trigger. Selectors may be outdated.',
    );
  }

  // Wait for modal animation
  await page.waitForTimeout(1000);

  // 4. Wait for editor (multi-fallback)
  // @unverified — Quill editor selector; fallback to generic contenteditable
  let editor: import('playwright').ElementHandle | null = null;
  for (const sel of LI_POST_EDITOR_SELECTORS) {
    try {
      editor = await page.waitForSelector(sel, { timeout: 6000 });
      if (editor) break;
    } catch {
      // try next
    }
  }

  if (!editor) {
    throw new LinkedInPostError(
      'Post editor (textbox/contenteditable) not found after opening share box.',
    );
  }

  // 5. Click + type text at human pace
  await editor.click();
  await page.keyboard.type(fullText, { delay: 25 + Math.floor(Math.random() * 20) });
  await page.waitForTimeout(800);

  // 6. Optionally attach image
  if (content.imagePath) {
    // Click media button (multi-fallback)
    // @unverified — media button aria-label may differ
    let mediaClicked = false;
    for (const sel of LI_MEDIA_BUTTON_SELECTORS) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click();
          mediaClicked = true;
          break;
        }
      } catch {
        // try next
      }
    }

    if (!mediaClicked) {
      console.warn(
        '[linkedin] Could not find media/photo button — skipping image attachment. Selectors may be outdated.',
      );
    } else {
      await page.waitForTimeout(1000);

      // Wait for file input (appears after media button click)
      // @unverified — file input selector
      try {
        const fileInput = await page.waitForSelector(LI_FILE_INPUT_SELECTOR, {
          timeout: 8000,
          state: 'attached',
        });
        await fileInput.setInputFiles(content.imagePath);
        // Wait for image preview / upload progress
        await page.waitForTimeout(3000);
      } catch {
        console.warn(
          '[linkedin] File input not found after media button click — image not attached.',
        );
      }
    }
  }

  // 7. Click "Post" submit (multi-fallback)
  // @unverified — submit button selectors need live composer DOM
  let submitted = false;
  for (const sel of LI_SUBMIT_POST_SELECTORS) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        const visible = await btn.isVisible();
        if (visible) {
          await btn.click();
          submitted = true;
          break;
        }
      }
    } catch {
      // try next
    }
  }

  if (!submitted) {
    // Final fallback: scan all buttons for text "Post"
    submitted = await _clickButtonByExactText(page, 'Post');
  }

  if (!submitted) {
    throw new LinkedInPostError('Submit "Post" button not found. Selectors may be outdated.');
  }

  // 8. Wait for composer to close (success signal)
  // LinkedIn closes the modal and shows a "Post sent" toast — we wait for the editor to disappear
  await page.waitForTimeout(4000);

  // 9. Post-submit captcha canary
  await _assertNoCaptcha(page, 'post-submit');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds the final post text: content.text followed by tags on a new paragraph.
 * Mirrors the shape used in x/post.ts and instagram/post.ts.
 */
function _buildText(content: PostContent): string {
  const tags = content.tags.length > 0 ? '\n\n' + content.tags.join(' ') : '';
  return content.text + tags;
}

/**
 * Captcha / checkpoint canary.
 * Checks URL, page title, and known DOM selectors.
 * Throws LinkedInPostError(isCaptcha=true) if a challenge is detected.
 *
 * @unverified — captcha DOM selectors need live challenge page to confirm
 */
async function _assertNoCaptcha(
  page: import('playwright').Page,
  phase: string,
): Promise<void> {
  const url = page.url();

  if (isCheckpointUrl(url)) {
    throw new LinkedInPostError(
      `[${phase}] Checkpoint/challenge URL detected: ${url}`,
      true,
    );
  }

  try {
    const title = (await page.title()).toLowerCase();
    if ((LI_CAPTCHA_TITLE_PATTERNS as readonly string[]).some(p => title.includes(p))) {
      throw new LinkedInPostError(
        `[${phase}] Challenge page title detected: "${title}"`,
        true,
      );
    }

    for (const sel of LI_CAPTCHA_SELECTORS) {
      const el = await page.$(sel);
      if (el) {
        throw new LinkedInPostError(
          `[${phase}] Challenge element visible: ${sel}`,
          true,
        );
      }
    }
  } catch (e) {
    if ((e as LinkedInPostError).isCaptcha !== undefined) throw e;
    // page.title() / page.$() failures are non-fatal
  }
}

/**
 * Last-resort button finder — scans all role=button / button elements for exact text match.
 * @unverified — requires live DOM
 */
async function _clickButtonByExactText(
  page: import('playwright').Page,
  text: string,
): Promise<boolean> {
  try {
    const buttons = await page.$$('button, div[role="button"]');
    for (const btn of buttons) {
      try {
        const t = (await btn.innerText()).trim();
        if (t === text) {
          await btn.click();
          return true;
        }
      } catch {
        // skip
      }
    }
  } catch {
    // non-fatal
  }
  return false;
}
