/**
 * Dev.to (Forem) API client — pure functions + thin HTTP wrapper.
 *
 * Mapping rule (promo post → article):
 *   title        = opts.title OR first non-empty line of text, truncated to 100 chars.
 *                  Dev.to requires a title; we derive one from the text so callers
 *                  don't have to supply it explicitly for simple promo posts.
 *   body_markdown = full text as-is, so links, hashtags, and line breaks are preserved.
 *   tags         = toDevtoTags(content.tags)  — ≤4 cleaned lowercase alnum tags.
 *   published    = opts.published ?? true  — posts live by default.
 */

const DEVTO_API = 'https://dev.to/api';
const MAX_TAGS = 4;
const MAX_TITLE = 100;

/** Shape of the article payload accepted by Dev.to's POST /api/articles. */
export interface DevtoArticle {
  title: string;
  body_markdown: string;
  tags: string[];
  published: boolean;
}

/**
 * Normalise raw tag strings for Dev.to:
 *   - strip leading '#'
 *   - lowercase
 *   - keep only alphanumeric characters (no hyphens, spaces, etc.)
 *   - drop empties after cleaning
 *   - deduplicate (first occurrence wins)
 *   - cap at MAX_TAGS (4)
 */
export function toDevtoTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const cleaned = raw.replace(/^#+/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      result.push(cleaned);
      if (result.length === MAX_TAGS) break;
    }
  }
  return result;
}

/**
 * Map a generic promo post to a Dev.to article payload.
 *
 * Title derivation:
 *   1. Use opts.title if provided.
 *   2. Otherwise scan text lines top-to-bottom for the first non-empty, non-URL line.
 *   3. Truncate at MAX_TITLE chars, appending '…' if truncated.
 *   4. If no usable line found, fall back to 'Post'.
 */
export function postToArticle(
  text: string,
  tags: string[],
  opts?: { title?: string; published?: boolean },
): DevtoArticle {
  let title: string;

  if (opts?.title) {
    title =
      opts.title.length > MAX_TITLE
        ? opts.title.slice(0, MAX_TITLE - 1) + '…'
        : opts.title;
  } else {
    // Derive from first meaningful line (skip blank lines and bare URLs)
    const lines = text.split('\n');
    const candidate = lines.find(
      (l) => l.trim().length > 0 && !/^https?:\/\/\S+$/.test(l.trim()),
    );
    const raw = (candidate ?? '').trim() || 'Post';
    title = raw.length > MAX_TITLE ? raw.slice(0, MAX_TITLE - 1) + '…' : raw;
  }

  return {
    title,
    body_markdown: text,
    tags: toDevtoTags(tags),
    published: opts?.published ?? true,
  };
}

/**
 * POST a new article to Dev.to.
 *
 * @param apiKey    - Dev.to API key (from DEVTO_API_KEY env var).
 * @param article   - Fully formed DevtoArticle payload.
 * @param fetchImpl - Injected fetch implementation (defaults to global fetch).
 *                    Inject a mock in tests — no real network in test suites.
 * @returns { id, url } of the created article.
 * @throws  Error with HTTP status + response body on non-2xx responses.
 */
export async function createArticle(
  apiKey: string,
  article: DevtoArticle,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: number; url: string }> {
  const response = await fetchImpl(`${DEVTO_API}/articles`, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ article }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Dev.to API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as { id: number; url: string };
  return { id: data.id, url: data.url };
}
