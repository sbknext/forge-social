/**
 * Mastodon REST API client — pure builders + thin network layer.
 *
 * Builder functions are pure (no side effects). Network functions accept an
 * optional fetchImpl for injection in tests.
 */

/** Conservative maximum post length (Mastodon default; instance may differ). */
export const MASTODON_MAX = 500;

export interface MastodonCreds {
  instance: string;
  token: string;
}

/**
 * Normalises a Mastodon instance URL: ensures https:// scheme and no trailing slash.
 * Pure.
 */
export function normalizeInstanceUrl(instance: string): string {
  let url = instance.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, '');
}

/**
 * Builds the JSON body for POST /api/v1/statuses.
 * Pure.
 */
export function buildStatusBody(text: string): { status: string } {
  return { status: text };
}

/**
 * Posts a status to a Mastodon instance.
 * Returns the status id and URL from the API response.
 * Throws a descriptive error on non-2xx responses.
 */
export async function postStatus(
  creds: MastodonCreds,
  text: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ id: string; url: string }> {
  const base = normalizeInstanceUrl(creds.instance);
  const url = `${base}/api/v1/statuses`;

  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${creds.token}`,
    },
    body: JSON.stringify(buildStatusBody(text)),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Mastodon postStatus failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { id: string; url: string };
  return { id: data.id, url: data.url };
}
