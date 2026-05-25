// Stable Instagram selectors — aria-label preferred, role fallback
export const IG_SELECTORS = {
  // Auth (verified against live DOM 2026-05-25)
  usernameInput: 'input[name="email"]',
  passwordInput: 'input[name="pass"]',
  loginButton: 'input[type="submit"], button[type="submit"]',

  // Logged-in indicators
  nav: 'nav[role="navigation"]',
  homeIcon: 'svg[aria-label="Home"]',

  // Create post
  newPostSvg: 'svg[aria-label="New post"]',
  createButton: 'div[role="button"]', // fallback — text "Create"
  postOption: 'span', // "Post" option in menu

  // Upload
  fileInput: 'input[type="file"][accept*="image"]',
  selectFileButton: 'button', // "Select from computer"

  // Navigation through create flow
  nextButton: 'div[role="button"]', // "Next" aria-label

  // Caption
  captionTextarea: 'textarea[aria-label="Write a caption..."]',

  // Share
  shareButton: 'div[role="button"]', // "Share"

  // URLs
  loginUrl: 'https://www.instagram.com/accounts/login/',
  homeUrl: 'https://www.instagram.com/',
};

export const IG_CAPTION_LIMIT = 2200;
export const IG_HASHTAG_LIMIT = 30;
