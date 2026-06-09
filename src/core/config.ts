import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { forgePaths } from './paths.js';
import type { Config, Platform } from '../types.js';

/** Default values for the optional engage block. */
export const DEFAULT_ENGAGE_ENABLED = false;
export const DEFAULT_ENGAGE_LIKE = true;
export const DEFAULT_ENGAGE_FOLLOW_BACK = true;
export const DEFAULT_ENGAGE_REPLY_ENABLED = false;
export const DEFAULT_ENGAGE_REPLY_TEMPLATES: string[] = [
  'Thanks {handle}! 🙏',
  'Appreciate it, {handle}!',
];
export const DEFAULT_ENGAGE_DAILY_CAP = 20;

const DEFAULT_CONFIG: Config = {
  // Engagement is off by default — all flags must be explicitly set.
  engage_enabled: DEFAULT_ENGAGE_ENABLED,
  engage_like: DEFAULT_ENGAGE_LIKE,
  engage_follow_back: DEFAULT_ENGAGE_FOLLOW_BACK,
  engage_reply_enabled: DEFAULT_ENGAGE_REPLY_ENABLED,
  engage_reply_templates: DEFAULT_ENGAGE_REPLY_TEMPLATES,
  engage_daily_cap: DEFAULT_ENGAGE_DAILY_CAP,
  platforms: {
    x: {
      daily_cap: 5,
      min_delay_sec: 300,
      max_delay_sec: 900,
    },
    instagram: {
      daily_cap: 3,
      min_delay_sec: 600,
      max_delay_sec: 1800,
    },
    linkedin: {
      daily_cap: 2,
      min_delay_sec: 600,
      max_delay_sec: 1800,
    },
    bluesky: {
      daily_cap: 10,
      min_delay_sec: 120,
      max_delay_sec: 600,
    },
    mastodon: {
      daily_cap: 10,
      min_delay_sec: 120,
      max_delay_sec: 600,
    },
    devto: {
      daily_cap: 2,
      min_delay_sec: 3600,
      max_delay_sec: 7200,
    },
  },
  active_hours: [9, 21],
  active_tz: 'Asia/Kolkata',
  skip_weekends: false,
};

export function loadConfig(overridePath?: string): Config {
  const configPath = overridePath ?? forgePaths().config;

  if (!existsSync(configPath)) {
    return structuredClone(DEFAULT_CONFIG);
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Config>;
    const merged: Config = {
      ...DEFAULT_CONFIG,
      ...parsed,
      // Engage fields — explicit merge so unknown keys from JSON don't clobber defaults.
      engage_enabled: parsed.engage_enabled ?? DEFAULT_CONFIG.engage_enabled,
      engage_like: parsed.engage_like ?? DEFAULT_CONFIG.engage_like,
      engage_follow_back: parsed.engage_follow_back ?? DEFAULT_CONFIG.engage_follow_back,
      engage_reply_enabled: parsed.engage_reply_enabled ?? DEFAULT_CONFIG.engage_reply_enabled,
      engage_reply_templates: parsed.engage_reply_templates ?? DEFAULT_CONFIG.engage_reply_templates,
      engage_daily_cap: parsed.engage_daily_cap ?? DEFAULT_CONFIG.engage_daily_cap,
      platforms: {
        x: { ...DEFAULT_CONFIG.platforms.x, ...parsed.platforms?.x },
        instagram: { ...DEFAULT_CONFIG.platforms.instagram, ...parsed.platforms?.instagram },
        linkedin: { ...DEFAULT_CONFIG.platforms.linkedin, ...parsed.platforms?.linkedin },
        bluesky: { ...DEFAULT_CONFIG.platforms.bluesky, ...parsed.platforms?.bluesky },
        mastodon: { ...DEFAULT_CONFIG.platforms.mastodon, ...parsed.platforms?.mastodon },
        devto: { ...DEFAULT_CONFIG.platforms.devto, ...parsed.platforms?.devto },
      },
    };
    // Hard ceilings
    merged.platforms.x.daily_cap = Math.min(merged.platforms.x.daily_cap, 10);
    merged.platforms.instagram.daily_cap = Math.min(merged.platforms.instagram.daily_cap, 5);
    merged.platforms.linkedin.daily_cap = Math.min(merged.platforms.linkedin.daily_cap, 3);
    merged.platforms.bluesky.daily_cap = Math.min(merged.platforms.bluesky.daily_cap, 10);
    merged.platforms.mastodon.daily_cap = Math.min(merged.platforms.mastodon.daily_cap, 10);
    merged.platforms.devto.daily_cap = Math.min(merged.platforms.devto.daily_cap, 2);
    return merged;
  } catch (e) {
    throw new Error(`Failed to parse config at ${configPath}: ${(e as Error).message}`);
  }
}

export function platformConfig(config: Config, platform: Platform) {
  return config.platforms[platform];
}

export function defaultConfig(): Config {
  return structuredClone(DEFAULT_CONFIG);
}

export function saveConfig(cfg: Config, overridePath?: string): void {
  const configPath = overridePath ?? forgePaths().config;
  writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8');
}
