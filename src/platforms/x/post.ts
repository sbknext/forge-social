import type { BrowserContext } from 'playwright';
import type { PostContent } from '../../types.js';
import { X_SELECTORS, X_CHAR_LIMIT } from './selectors.js';
import { detectCaptcha } from '../../core/captcha.js';

export class XPostError extends Error {
  constructor(
    message: string,
    public readonly isCaptcha: boolean = false,
  ) {
    super(message);
    this.name = 'XPostError';
  }
}

export async function postToX(ctx: BrowserContext, content: PostContent): Promise<void> {
  const page = ctx.pages().length > 0 ? ctx.pages()[0] : await ctx.newPage();

  // Navigate to home
  await page.goto(X_SELECTORS.homeUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

  // Captcha check
  const captcha = await detectCaptcha(page, 'x');
  if (captcha.detected) {
    throw new XPostError(`Captcha/challenge detected: ${captcha.reason}`, true);
  }

  // Build full post text
  const fullText = buildText(content);
  if (fullText.length > X_CHAR_LIMIT) {
    throw new XPostError(
      `Text too long: ${fullText.length} chars (limit ${X_CHAR_LIMIT}). Shorten text or tags.`,
    );
  }

  // Open composer
  const newTweetBtn = await page.waitForSelector(X_SELECTORS.newTweetButton, { timeout: 10000 });
  await newTweetBtn.click();

  // Wait for textarea
  const textarea = await page.waitForSelector(X_SELECTORS.tweetTextarea, { timeout: 8000 });
  await textarea.click();

  // Type text at human pace
  await page.keyboard.type(fullText, { delay: 30 });
  await page.waitForTimeout(500);

  // Upload image if provided
  if (content.imagePath) {
    const fileInput = await page.$(X_SELECTORS.fileInput);
    if (!fileInput) {
      throw new XPostError('File input not found in X composer');
    }
    await fileInput.setInputFiles(content.imagePath);
    // Wait for image preview
    await page.waitForSelector(X_SELECTORS.imagePreview, { timeout: 15000 });
    await page.waitForTimeout(1000);
  }

  // Submit
  let submitBtn = await page.$(X_SELECTORS.tweetButtonInline);
  if (!submitBtn) {
    submitBtn = await page.$(X_SELECTORS.tweetButton);
  }
  if (!submitBtn) {
    throw new XPostError('Submit button not found');
  }

  await submitBtn.click();

  // Wait for composer to close (success indicator)
  await page.waitForTimeout(3000);

  // Verify captcha wasn't triggered post-submit
  const postCaptcha = await detectCaptcha(page, 'x');
  if (postCaptcha.detected) {
    throw new XPostError(`Post-submit challenge: ${postCaptcha.reason}`, true);
  }
}

function buildText(content: PostContent): string {
  const tags = content.tags.length > 0 ? '\n\n' + content.tags.join(' ') : '';
  return content.text + tags;
}
