/**
 * LinkedIn compose helpers — pure logic, no DOM, fully unit-tested.
 *
 * LinkedIn-specific rules:
 *  - 3 000-character hard cap (including hashtags).
 *  - Hashtags appended after a blank-line separator, space-separated.
 *  - Duplicate tags collapsed; leading `#` enforced.
 */

/** LinkedIn post character limit (as of 2026-06). */
export const LINKEDIN_MAX_CHARS = 3000;

/**
 * Compose a LinkedIn post body from plain text + optional tag list.
 *
 * Rules:
 *  1. Tags are deduped (case-preserving first-occurrence wins).
 *  2. Each tag is normalised to have exactly one leading `#`.
 *  3. Tags are appended after `\n\n` when non-empty.
 *  4. Result is trimmed.
 *
 * @param text   - Body text (may already contain hashtags inline).
 * @param tags   - Additional hashtag strings (with or without leading `#`).
 * @returns      Composed post string.
 */
export function composeLinkedInPost(text: string, tags: string[]): string {
  const normalisedTags = dedupeAndNormaliseTags(tags);

  if (normalisedTags.length === 0) {
    return text.trim();
  }

  return (text.trim() + '\n\n' + normalisedTags.join(' ')).trim();
}

/**
 * Validate a composed LinkedIn post.
 *
 * @param composed - String produced by {@link composeLinkedInPost}.
 * @returns `{ ok: true }` on pass, or `{ ok: false, reason }` on failure.
 */
export function validateLinkedInPost(
  composed: string,
): { ok: boolean; reason?: string } {
  if (!composed || composed.trim().length === 0) {
    return { ok: false, reason: 'Post text is empty' };
  }
  if (composed.length > LINKEDIN_MAX_CHARS) {
    return {
      ok: false,
      reason: `Post too long: ${composed.length} chars (limit ${LINKEDIN_MAX_CHARS})`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Normalise each tag to have exactly one `#` prefix and deduplicate by the
 * lower-cased tag value (first occurrence wins).
 */
function dedupeAndNormaliseTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of tags) {
    const stripped = raw.trim().replace(/^#+/, '');
    if (!stripped) continue;
    const key = stripped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push('#' + stripped);
  }

  return result;
}
