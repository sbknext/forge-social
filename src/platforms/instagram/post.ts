import type { BrowserContext } from 'playwright';
import type { PostContent } from '../../types.js';
import { IG_CAPTION_LIMIT, IG_HASHTAG_LIMIT } from './selectors.js';
import { detectCaptcha } from '../../core/captcha.js';

export class IGPostError extends Error {
  constructor(
    message: string,
    public readonly isCaptcha: boolean = false,
  ) {
    super(message);
    this.name = 'IGPostError';
  }
}

export async function postToInstagram(
  ctx: BrowserContext,
  content: PostContent,
): Promise<void> {
  if (!content.imagePath) {
    throw new IGPostError('Instagram requires an image');
  }

  const caption = buildCaption(content);
  if (caption.length > IG_CAPTION_LIMIT) {
    throw new IGPostError(
      `Caption too long: ${caption.length} chars (limit ${IG_CAPTION_LIMIT})`,
    );
  }

  const tagCount = content.tags.length;
  if (tagCount > IG_HASHTAG_LIMIT) {
    throw new IGPostError(`Too many hashtags: ${tagCount} (limit ${IG_HASHTAG_LIMIT})`);
  }

  const page = ctx.pages().length > 0 ? ctx.pages()[0] : await ctx.newPage();
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);

  // Captcha check
  const captcha = await detectCaptcha(page, 'instagram');
  if (captcha.detected) {
    throw new IGPostError(`Captcha/challenge detected: ${captcha.reason}`, true);
  }

  // Click "New post" button (SVG aria-label or text)
  let opened = false;
  try {
    const newPostBtn = await page.waitForSelector('svg[aria-label="New post"]', { timeout: 8000 });
    const parent = await newPostBtn.$('xpath=../..');
    if (parent) {
      await parent.click();
      opened = true;
    }
  } catch {
    // Try text-based Create button
  }

  if (!opened) {
    // Fallback: look for a button/anchor that contains "Create" text
    const createEl = await page.$('a[href="/create/select/"]');
    if (createEl) {
      await createEl.click();
      opened = true;
    }
  }

  if (!opened) {
    throw new IGPostError('Could not find New Post / Create button');
  }

  await page.waitForTimeout(1500);

  // Click "Post" in the sub-menu if it appears
  try {
    const postOption = await page.waitForSelector('text=Post', { timeout: 4000 });
    await postOption.click();
    await page.waitForTimeout(1000);
  } catch {
    // No sub-menu — might go directly to upload screen
  }

  // Upload image via hidden file input
  const fileInput = await page.waitForSelector('input[type="file"][accept*="image"]', {
    timeout: 10000,
    state: 'attached',
  });
  await fileInput.setInputFiles(content.imagePath);
  await page.waitForTimeout(3000);

  // Step through "Next" buttons (crop → filter → caption)
  for (let step = 0; step < 2; step++) {
    const nextBtn = await findButtonByText(page, 'Next');
    if (nextBtn) {
      await nextBtn.click();
      await page.waitForTimeout(2000);
    }
  }

  // Fill caption
  const captionArea = await page.waitForSelector(
    'textarea[aria-label="Write a caption..."], div[aria-label="Write a caption..."]',
    { timeout: 8000 },
  );
  await captionArea.click();
  await page.keyboard.type(caption, { delay: 20 });
  await page.waitForTimeout(1000);

  // Click Share
  const shareBtn = await findButtonByText(page, 'Share');
  if (!shareBtn) {
    throw new IGPostError('Share button not found');
  }
  await shareBtn.click();

  // Wait for success signal
  await page.waitForTimeout(5000);

  // Check for captcha post-share
  const postCaptcha = await detectCaptcha(page, 'instagram');
  if (postCaptcha.detected) {
    throw new IGPostError(`Post-share challenge: ${postCaptcha.reason}`, true);
  }
}

async function findButtonByText(page: import('playwright').Page, text: string) {
  const buttons = await page.$$('div[role="button"], button');
  for (const btn of buttons) {
    try {
      const innerText = await btn.innerText();
      if (innerText.trim() === text) return btn;
    } catch {
      // skip
    }
  }
  return null;
}

function buildCaption(content: PostContent): string {
  const tags = content.tags.length > 0 ? '\n\n' + content.tags.join(' ') : '';
  return content.text + tags;
}
