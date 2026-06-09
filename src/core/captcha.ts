import type { Page } from 'playwright';
import type { Platform } from '../types.js';
import { LI_CHECKPOINT_URL_PATTERNS, LI_CAPTCHA_SELECTORS } from '../platforms/linkedin/selectors.js';

// URL substrings that indicate captcha / challenge / auth wall
// API platforms (bluesky, mastodon, devto) have no browser-based captcha — empty arrays.
const CAPTCHA_URL_PATTERNS: Record<Platform, string[]> = {
  x: [
    '/account_access_step',
    '/i/flow/login',
    '/i/flow/consent',
    'arkose',
    '/challenge',
  ],
  instagram: [
    '/accounts/login/two_factor',
    '/challenge/',
    '/accounts/suspended',
    '/accounts/disabled',
  ],
  linkedin: [...LI_CHECKPOINT_URL_PATTERNS],
  bluesky: [],
  mastodon: [],
  devto: [],
};

// Selectors that indicate a challenge form is visible
// API platforms have no browser session — empty arrays.
const CAPTCHA_SELECTORS: Record<Platform, string[]> = {
  x: [
    'iframe[src*="arkose"]',
    'iframe[src*="captcha"]',
    '[data-testid="LoginForm"]',
  ],
  instagram: [
    'form[id*="challenge"]',
    'input[name="security_code"]',
    'button[value="0"]', // "It was me" / "Not me" buttons
  ],
  linkedin: [...LI_CAPTCHA_SELECTORS],
  bluesky: [],
  mastodon: [],
  devto: [],
};

export interface CaptchaResult {
  detected: boolean;
  reason?: string;
}

export async function detectCaptcha(
  page: Page,
  platform: Platform,
): Promise<CaptchaResult> {
  const url = page.url();
  const urlPatterns = CAPTCHA_URL_PATTERNS[platform];

  for (const pattern of urlPatterns) {
    if (url.includes(pattern)) {
      return { detected: true, reason: `URL contains challenge pattern: ${pattern}` };
    }
  }

  const selectors = CAPTCHA_SELECTORS[platform];
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        const visible = await el.isVisible();
        if (visible) {
          return { detected: true, reason: `Challenge element visible: ${sel}` };
        }
      }
    } catch {
      // element query failures are non-fatal
    }
  }

  return { detected: false };
}

export function isCaptchaUrl(url: string, platform: Platform): boolean {
  return CAPTCHA_URL_PATTERNS[platform].some(p => url.includes(p));
}
