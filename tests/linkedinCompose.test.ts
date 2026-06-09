import { describe, it, expect } from 'vitest';
import {
  LINKEDIN_MAX_CHARS,
  composeLinkedInPost,
  validateLinkedInPost,
} from '../src/platforms/linkedin/compose.js';

// ---------------------------------------------------------------------------
// composeLinkedInPost
// ---------------------------------------------------------------------------
describe('composeLinkedInPost', () => {
  it('appends tags after a blank line when tags are provided', () => {
    const result = composeLinkedInPost('Hello world', ['#ai', '#saas']);
    expect(result).toBe('Hello world\n\n#ai #saas');
  });

  it('returns only text when tags array is empty', () => {
    const result = composeLinkedInPost('Just the text', []);
    expect(result).toBe('Just the text');
  });

  it('ensures each tag has exactly one leading #', () => {
    const result = composeLinkedInPost('Test', ['ai', '##cloud', '#saas']);
    expect(result).toBe('Test\n\n#ai #cloud #saas');
  });

  it('deduplicates tags case-insensitively, preserving first occurrence', () => {
    const result = composeLinkedInPost('Dedup', ['#AI', 'ai', '#Ai']);
    // Only the first tag kept, normalised to single #
    expect(result).toBe('Dedup\n\n#AI');
  });

  it('trims leading/trailing whitespace from text', () => {
    const result = composeLinkedInPost('  trimmed  ', []);
    expect(result).toBe('trimmed');
  });

  it('trims the final composed string', () => {
    const result = composeLinkedInPost('  text  ', ['#tag']);
    expect(result).toBe('text\n\n#tag');
  });

  it('handles tags that are pure whitespace or empty strings', () => {
    const result = composeLinkedInPost('Body', ['', '  ', '#real']);
    expect(result).toBe('Body\n\n#real');
  });

  it('tags with multiple ## prefixes are normalised to single #', () => {
    const result = composeLinkedInPost('X', ['##double', '###triple']);
    expect(result).toBe('X\n\n#double #triple');
  });
});

// ---------------------------------------------------------------------------
// validateLinkedInPost
// ---------------------------------------------------------------------------
describe('validateLinkedInPost', () => {
  it('returns ok:true for a normal short post', () => {
    const { ok } = validateLinkedInPost('A perfectly valid post.');
    expect(ok).toBe(true);
  });

  it('returns ok:false for an empty string', () => {
    const { ok, reason } = validateLinkedInPost('');
    expect(ok).toBe(false);
    expect(reason).toBeTruthy();
  });

  it('returns ok:false for a whitespace-only string', () => {
    const { ok } = validateLinkedInPost('   ');
    expect(ok).toBe(false);
  });

  it('returns ok:false when length exceeds LINKEDIN_MAX_CHARS', () => {
    const long = 'a'.repeat(LINKEDIN_MAX_CHARS + 1);
    const { ok, reason } = validateLinkedInPost(long);
    expect(ok).toBe(false);
    expect(reason).toContain(`${LINKEDIN_MAX_CHARS + 1} chars`);
  });

  it('returns ok:true for a post exactly at the character limit', () => {
    const exact = 'a'.repeat(LINKEDIN_MAX_CHARS);
    const { ok } = validateLinkedInPost(exact);
    expect(ok).toBe(true);
  });

  it('reason string is undefined when ok:true', () => {
    const { reason } = validateLinkedInPost('valid');
    expect(reason).toBeUndefined();
  });

  it('LINKEDIN_MAX_CHARS is exported as 3000', () => {
    expect(LINKEDIN_MAX_CHARS).toBe(3000);
  });

  it('composeLinkedInPost + validateLinkedInPost round-trip: composed post within limit is valid', () => {
    const composed = composeLinkedInPost('Launch post for forge-social.', ['#forge', '#open-source']);
    const { ok } = validateLinkedInPost(composed);
    expect(ok).toBe(true);
  });
});
