import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Platform } from '../types.js';

export function forgeHome(): string {
  return join(homedir(), '.forge-social');
}

export function profileDir(platform: Platform): string {
  return join(forgeHome(), `chrome-profile-${platform}`);
}

export function dbPath(): string {
  return join(forgeHome(), 'data.db');
}

export function forgePaths() {
  const home = forgeHome();
  return {
    home,
    env: join(home, '.env'),
    config: join(home, 'config.json'),
    db: dbPath(),
    logs: join(home, 'logs'),
    inbox: join(home, 'inbox'),
    profileX: profileDir('x'),
    profileIg: profileDir('instagram'),
  };
}
