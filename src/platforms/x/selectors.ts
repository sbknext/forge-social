// Stable X (Twitter) selectors — data-testid preferred, aria-label fallback
export const X_SELECTORS = {
  // Auth (verified against live DOM 2026-05-25)
  loginInput: 'input[name="username_or_email"], input[autocomplete="username"], input[name="text"]',
  passwordInput: 'input[name="password"], input[autocomplete="current-password"]',
  loginButton: 'button[data-testid="LoginForm_Login_Button"], button[role="button"]:has-text("Log in")',

  // Logged-in indicators
  newTweetButton: 'a[data-testid="SideNav_NewTweet_Button"]',
  homeLink: 'header[role="banner"] a[href="/home"]',

  // Composer
  tweetTextarea: 'div[data-testid="tweetTextarea_0"]',
  fileInput: 'input[data-testid="fileInput"]',
  imagePreview: 'div[data-testid="attachments"]',
  tweetButtonInline: 'button[data-testid="tweetButtonInline"]',
  tweetButton: 'button[data-testid="tweetButton"]',

  // URLs
  loginUrl: 'https://x.com/i/flow/login',
  homeUrl: 'https://x.com/home',
  composeUrl: 'https://x.com/compose/tweet',
};

export const X_CHAR_LIMIT = 280;
