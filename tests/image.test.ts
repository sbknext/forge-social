import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validateImage, allowedFormats, maxBytes } from '../src/core/image.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

const TMP = join(os.tmpdir(), 'forge-social-test-images');

// Minimal valid 1x1 PNG (67 bytes)
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
  '2e0000000c49444154789c6260f8cfc000000002006f0015400000000049454e44ae426082',
  'hex',
);

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
  writeFileSync(join(TMP, 'photo.jpg'), Buffer.alloc(100));
  writeFileSync(join(TMP, 'photo.png'), TINY_PNG);
  writeFileSync(join(TMP, 'photo.gif'), Buffer.alloc(100));
  writeFileSync(join(TMP, 'photo.webp'), Buffer.alloc(100));
  writeFileSync(join(TMP, 'photo.heic'), Buffer.alloc(100));
  writeFileSync(join(TMP, 'photo.bmp'), Buffer.alloc(100));
  // Large file: 6MB (exceeds X 5MB limit)
  writeFileSync(join(TMP, 'large.jpg'), Buffer.alloc(6 * 1024 * 1024));
  // Very large file: 31MB (exceeds IG 30MB limit)
  writeFileSync(join(TMP, 'huge.jpg'), Buffer.alloc(31 * 1024 * 1024));
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('validateImage', () => {
  describe('X platform', () => {
    it('accepts jpg', () => {
      expect(validateImage(join(TMP, 'photo.jpg'), 'x').valid).toBe(true);
    });

    it('accepts png', () => {
      expect(validateImage(join(TMP, 'photo.png'), 'x').valid).toBe(true);
    });

    it('accepts gif', () => {
      expect(validateImage(join(TMP, 'photo.gif'), 'x').valid).toBe(true);
    });

    it('accepts webp', () => {
      expect(validateImage(join(TMP, 'photo.webp'), 'x').valid).toBe(true);
    });

    it('rejects heic', () => {
      const result = validateImage(join(TMP, 'photo.heic'), 'x');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/heic/i);
    });

    it('rejects bmp', () => {
      expect(validateImage(join(TMP, 'photo.bmp'), 'x').valid).toBe(false);
    });

    it('rejects files over 5MB', () => {
      const result = validateImage(join(TMP, 'large.jpg'), 'x');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/too large/i);
    });

    it('rejects non-existent file', () => {
      const result = validateImage('/tmp/no-such-file.jpg', 'x');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/not found/i);
    });
  });

  describe('Instagram platform', () => {
    it('accepts jpg', () => {
      expect(validateImage(join(TMP, 'photo.jpg'), 'instagram').valid).toBe(true);
    });

    it('accepts png', () => {
      expect(validateImage(join(TMP, 'photo.png'), 'instagram').valid).toBe(true);
    });

    it('accepts heic', () => {
      expect(validateImage(join(TMP, 'photo.heic'), 'instagram').valid).toBe(true);
    });

    it('rejects gif (not in IG formats)', () => {
      const result = validateImage(join(TMP, 'photo.gif'), 'instagram');
      expect(result.valid).toBe(false);
    });

    it('rejects files over 30MB', () => {
      const result = validateImage(join(TMP, 'huge.jpg'), 'instagram');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/too large/i);
    });

    it('accepts large.jpg (6MB — under 30MB IG limit)', () => {
      expect(validateImage(join(TMP, 'large.jpg'), 'instagram').valid).toBe(true);
    });
  });
});

describe('allowedFormats', () => {
  it('x allows gif and webp', () => {
    const fmts = allowedFormats('x');
    expect(fmts).toContain('.gif');
    expect(fmts).toContain('.webp');
  });

  it('instagram allows heic', () => {
    const fmts = allowedFormats('instagram');
    expect(fmts).toContain('.heic');
  });
});

describe('maxBytes', () => {
  it('x limit is 5MB', () => {
    expect(maxBytes('x')).toBe(5 * 1024 * 1024);
  });

  it('instagram limit is 30MB', () => {
    expect(maxBytes('instagram')).toBe(30 * 1024 * 1024);
  });
});
