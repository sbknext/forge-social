/**
 * Bluesky AT Protocol client — pure builders + thin network layer.
 *
 * All builder functions are pure (no side effects, no Date calls) so they are
 * fully unit-testable without mocks. Network functions accept an optional
 * fetchImpl for injection in tests.
 */

/** Maximum post length in graphemes (AT Protocol spec). */
export const BLUESKY_MAX = 300;

export interface BlueskyCreds {
  handle: string;
  appPassword: string;
  /** Default: https://bsky.social */
  pds?: string;
}

/**
 * Builds the JSON body for com.atproto.server.createSession.
 * Pure — no network, no env reads.
 */
export function buildSessionBody(
  creds: BlueskyCreds
): { identifier: string; password: string } {
  return { identifier: creds.handle, password: creds.appPassword };
}

/**
 * Builds the JSON body for com.atproto.repo.createRecord.
 * The caller is responsible for setting `repo` (did) on the wrapper — see createPost.
 * createdAt is injected so tests remain deterministic.
 * Pure — no network, no Date calls.
 */
export function buildPostRecord(
  text: string,
  createdAtIso: string
): {
  collection: string;
  record: { $type: string; text: string; createdAt: string };
} {
  return {
    collection: 'app.bsky.feed.post',
    record: {
      $type: 'app.bsky.feed.post',
      text,
      createdAt: createdAtIso,
    },
  };
}

/**
 * Creates an authenticated session on the Bluesky PDS.
 * Throws a descriptive error on non-2xx responses.
 */
export async function createSession(
  creds: BlueskyCreds,
  fetchImpl: typeof fetch = fetch
): Promise<{ accessJwt: string; did: string }> {
  const pds = creds.pds ?? 'https://bsky.social';
  const url = `${pds}/xrpc/com.atproto.server.createSession`;

  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildSessionBody(creds)),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Bluesky createSession failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { accessJwt: string; did: string };
  return { accessJwt: data.accessJwt, did: data.did };
}

/**
 * Creates a post record on the Bluesky PDS.
 * Returns the AT-URI of the newly created record.
 */
export async function createPost(
  did: string,
  accessJwt: string,
  text: string,
  createdAtIso: string,
  pds: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ uri: string }> {
  const url = `${pds}/xrpc/com.atproto.repo.createRecord`;
  const { collection, record } = buildPostRecord(text, createdAtIso);

  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessJwt}`,
    },
    body: JSON.stringify({ repo: did, collection, record }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Bluesky createPost failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as { uri: string };
  return { uri: data.uri };
}
