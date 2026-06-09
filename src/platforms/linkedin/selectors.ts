/**
 * LinkedIn DOM selectors — multi-fallback, aria-label/role preferred.
 *
 * LinkedIn aggressively obfuscates CSS class names (e.g. `.LWLdVFByJqGMnEToYxLFNKoWTyILlImpGfMJqVQ`).
 * We deliberately avoid class-based selectors and rely on:
 *   1. aria-label / aria-label substrings  (most stable)
 *   2. role + semantic attributes           (stable across releases)
 *   3. data-* attributes                    (stable when present)
 *   4. input[name], input[id]              (stable for login forms)
 *
 * All live-DOM selectors are marked @unverified — they require a live LinkedIn session
 * to confirm. Selectors are ordered: most specific / most reliable first.
 */

// ---------------------------------------------------------------------------
// Auth selectors  (ported from forge-linkedin/src/linkedin/auth.ts)
// ---------------------------------------------------------------------------

/**
 * Signals that the user is authenticated.
 * Ordered by reliability — first match wins.
 * @unverified — needs live LinkedIn session
 */
export const LI_LOGGED_IN_SELECTORS = [
  // Search typeahead — present in every authenticated page header
  'input.search-global-typeahead__input',
  // Primary nav landmark — stable role+label attribute
  'nav[aria-label="Primary Navigation"]',
  // Older class-based global nav fallback still seen on some accounts
  '[data-test-global-nav]',
  // Catch-all nav with any aria-label (may match non-LI pages too, last resort)
  'nav[aria-label]',
] as const;

/** Login form — input[name] selectors are stable on LinkedIn's login page */
export const LI_AUTH_SELECTORS = {
  usernameInput: 'input[name="session_key"]',
  passwordInput: 'input[name="session_password"]',
  submitButton: 'button[type="submit"]',
  loginUrl: 'https://www.linkedin.com/login',
  feedUrl: 'https://www.linkedin.com/feed/',
} as const;

// ---------------------------------------------------------------------------
// Captcha / checkpoint selectors  (ported from forge-linkedin/src/linkedin/captcha.ts)
// ---------------------------------------------------------------------------

/**
 * URL path patterns that indicate a LinkedIn security challenge.
 * @unverified — reflects known LinkedIn challenge URL shapes
 */
export const LI_CHECKPOINT_URL_PATTERNS = [
  '/checkpoint/',
  '/captcha',
  '/uas/login',
  '/security',
  '/challenge/',
] as const;

/**
 * DOM selectors whose presence signals a captcha / challenge page.
 * @unverified — needs live session with triggered challenge
 */
export const LI_CAPTCHA_SELECTORS = [
  'form[id="captcha-challenge"]',
  '[data-test-id="captcha"]',
  '[data-challenge-id]',
] as const;

/**
 * Page title substrings (lowercased) that indicate a challenge page.
 */
export const LI_CAPTCHA_TITLE_PATTERNS = [
  'security verification',
  'security check',
  'confirm',
  'challenge',
  'verify',
] as const;

// ---------------------------------------------------------------------------
// Share box / composer selectors
// @unverified — all require a live authenticated LinkedIn session
// ---------------------------------------------------------------------------

/**
 * The "Start a post" / "Create a post" trigger button on the feed.
 * Multi-fallback: aria-label (most stable) → role+text → data attribute.
 * @unverified — needs live feed DOM
 */
export const LI_START_POST_SELECTORS = [
  // LinkedIn renders this as a button with aria-label containing "Start a post"
  'button[aria-label*="Start a post"]',
  // Alternate wording seen on some accounts
  'button[aria-label*="Create a post"]',
  // The share-box component sometimes uses a div[role="button"]
  'div[role="button"][aria-label*="Start a post"]',
  'div[role="button"][aria-label*="Create a post"]',
  // Fallback: any element whose text content is exactly "Start a post"
  // (used as last resort via page.locator — not for page.$)
] as const;

/**
 * The rich-text editor inside the share dialog (Quill-based).
 * LinkedIn uses a div[contenteditable] wrapped in the Quill editor.
 * @unverified — needs live composer DOM
 */
export const LI_POST_EDITOR_SELECTORS = [
  // role=textbox is the most reliable ARIA selector for the Quill editor
  'div[role="textbox"]',
  // Quill editor class (obfuscated but consistent within a deploy)
  '.ql-editor[contenteditable="true"]',
  // Broader contenteditable fallback scoped inside the share modal
  '.share-creation-state__text-editor div[contenteditable="true"]',
  // Generic contenteditable last resort
  'div[contenteditable="true"]',
] as const;

/**
 * The "Add a photo" / media attachment button inside the share dialog.
 * @unverified — needs live composer DOM
 */
export const LI_MEDIA_BUTTON_SELECTORS = [
  'button[aria-label*="Add a photo"]',
  'button[aria-label*="Add photo"]',
  'button[aria-label*="media"]',
  // Icon-only button — data attribute seen in some LI builds
  'button[data-control-name="add_media"]',
] as const;

/**
 * The hidden file input that appears after clicking the media button.
 * @unverified — needs live composer DOM
 */
export const LI_FILE_INPUT_SELECTOR = 'input[type="file"][accept*="image"]' as const;

/**
 * The "Post" submit button inside the share dialog.
 * LinkedIn puts "Post" as visible text inside a button. We must distinguish
 * it from other "Post" occurrences on the page.
 * Multi-fallback ordered by specificity.
 * @unverified — needs live composer DOM
 */
export const LI_SUBMIT_POST_SELECTORS = [
  // Most specific: button with aria-label "Post" scoped to share modal
  'button[aria-label="Post"]',
  // data-control-name seen in some builds
  'button[data-control-name="share.post"]',
  // Fallback role+text (used with page.getByRole or manual text scan)
  // Pure text match via playwright's :has-text pseudo (non-standard, runtime fallback)
  'button:has-text("Post")',
] as const;

// ---------------------------------------------------------------------------
// LinkedIn URL constants
// ---------------------------------------------------------------------------
export const LI_URLS = {
  feed: 'https://www.linkedin.com/feed/',
  login: 'https://www.linkedin.com/login',
  myProfile: 'https://www.linkedin.com/in/me/',
} as const;

/** Conservative character limit for LinkedIn text posts (actual UI limit is 3000) */
export const LI_TEXT_LIMIT = 3000;
