export type Platform = 'x' | 'instagram' | 'linkedin' | 'bluesky' | 'mastodon' | 'devto';

export interface PlatformConfig {
  daily_cap: number;
  min_delay_sec: number;
  max_delay_sec: number;
}

export interface EngageConfig {
  /** Master switch — all engagement is OFF unless this is true. Default: false. */
  engage_enabled?: boolean;
  /** Auto-like replies/mentions/likes received. Default: true when engagement on. */
  engage_like?: boolean;
  /** Auto-follow back new followers. Default: true when engagement on. */
  engage_follow_back?: boolean;
  /**
   * Auto-reply to mentions/replies using a template.
   * HIGHEST RISK — opt-in only. Default: false.
   * Review platform ToS before enabling.
   */
  engage_reply_enabled?: boolean;
  /** Reply templates. {handle} and {name} are substituted. */
  engage_reply_templates?: string[];
  /** Max engagement actions per day across all action types. Default: 20. */
  engage_daily_cap?: number;
}

export interface Config extends EngageConfig {
  platforms: Record<Platform, PlatformConfig>;
  active_hours: [number, number];
  active_tz: string;
  skip_weekends: boolean;
}

export interface PostContent {
  text: string;
  imagePath?: string;
  tags: string[];
}

export interface PostRecord {
  id?: number;
  platform: Platform;
  text: string;
  image_path: string | null;
  tags: string | null;
  status: 'success' | 'error' | 'captcha' | 'dry-run';
  posted_at: string;
  error: string | null;
}

export interface LoginRecord {
  platform: Platform;
  last_login_at: string | null;
}

export interface PlatformAdapter {
  name: Platform;
  isLoggedIn(): Promise<boolean>;
  login(username?: string, password?: string): Promise<void>;
  post(content: PostContent): Promise<void>;
  close(): Promise<void>;
}
