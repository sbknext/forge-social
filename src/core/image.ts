import { existsSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import type { Platform } from '../types.js';

interface ImageConstraints {
  maxBytes: number;
  formats: string[];
}

const CONSTRAINTS: Record<Platform, ImageConstraints> = {
  x: {
    maxBytes: 5 * 1024 * 1024, // 5MB
    formats: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  },
  instagram: {
    maxBytes: 30 * 1024 * 1024, // 30MB
    formats: ['.jpg', '.jpeg', '.png', '.heic', '.heif'],
  },
  linkedin: {
    maxBytes: 100 * 1024 * 1024, // 100MB (LinkedIn allows large images)
    formats: ['.jpg', '.jpeg', '.png', '.gif'],
  },
  // API platforms — image upload not yet implemented; use same generous defaults.
  bluesky: {
    maxBytes: 1 * 1024 * 1024, // 1MB (AT Protocol image blob limit)
    formats: ['.jpg', '.jpeg', '.png', '.webp'],
  },
  mastodon: {
    maxBytes: 8 * 1024 * 1024, // 8MB (Mastodon default)
    formats: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  },
  devto: {
    maxBytes: 25 * 1024 * 1024, // 25MB (Dev.to cover image)
    formats: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  },
};

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

export function validateImage(
  imagePath: string,
  platform: Platform,
): ImageValidationResult {
  if (!existsSync(imagePath)) {
    return { valid: false, error: `Image not found: ${imagePath}` };
  }

  const ext = extname(imagePath).toLowerCase();
  const constraints = CONSTRAINTS[platform];

  if (!constraints.formats.includes(ext)) {
    return {
      valid: false,
      error: `Unsupported format ${ext} for ${platform}. Allowed: ${constraints.formats.join(', ')}`,
    };
  }

  const { size } = statSync(imagePath);
  if (size > constraints.maxBytes) {
    const mb = (size / 1024 / 1024).toFixed(1);
    const maxMb = (constraints.maxBytes / 1024 / 1024).toFixed(0);
    return {
      valid: false,
      error: `Image too large: ${mb}MB (max ${maxMb}MB for ${platform})`,
    };
  }

  return { valid: true };
}

export function allowedFormats(platform: Platform): string[] {
  return CONSTRAINTS[platform].formats;
}

export function maxBytes(platform: Platform): number {
  return CONSTRAINTS[platform].maxBytes;
}
