export type Platform = 'x' | 'instagram';

export interface PlatformConfig {
  daily_cap: number;
  min_delay_sec: number;
  max_delay_sec: number;
}

export interface Config {
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
