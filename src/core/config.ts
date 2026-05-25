import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { forgePaths } from './paths.js';
import type { Config, Platform } from '../types.js';

const DEFAULT_CONFIG: Config = {
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
      platforms: {
        x: { ...DEFAULT_CONFIG.platforms.x, ...parsed.platforms?.x },
        instagram: { ...DEFAULT_CONFIG.platforms.instagram, ...parsed.platforms?.instagram },
      },
    };
    // Hard ceilings
    merged.platforms.x.daily_cap = Math.min(merged.platforms.x.daily_cap, 10);
    merged.platforms.instagram.daily_cap = Math.min(merged.platforms.instagram.daily_cap, 5);
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
