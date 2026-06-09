/**
 * Brand config — URL + handle placeholders resolved from env at post time.
 * Placeholders in templates: {echo_url} {forge_url} {mcp_url} {handle} {x_handle} {ig_handle}
 *
 * Unknown placeholders (e.g. {typo_url}) are left intact so typos are visible
 * rather than silently posting blank content.
 *
 * When a brand value is '' (not set), renderBrand replaces the placeholder with ''
 * which may leave double-spaces; these are collapsed and the result is trimmed.
 */

export interface Brand {
  echo_url: string;
  forge_url: string;
  mcp_url: string;
  handle: string;
  x_handle: string;
  ig_handle: string;
}

const ENV_KEYS: Record<keyof Brand, string> = {
  echo_url: 'FORGE_SOCIAL_ECHO_URL',
  forge_url: 'FORGE_SOCIAL_FORGE_URL',
  mcp_url: 'FORGE_SOCIAL_MCP_URL',
  handle: 'FORGE_SOCIAL_HANDLE',
  x_handle: 'FORGE_SOCIAL_X_HANDLE',
  ig_handle: 'FORGE_SOCIAL_IG_HANDLE',
};

const DEFAULTS: Partial<Record<keyof Brand, string>> = {
  forge_url: 'https://forge.sbknext.com',
  mcp_url: 'https://mcp.sbknext.com',
};

/**
 * Load brand config from env (defaults to process.env).
 * Missing env vars resolve to documented defaults or '' if no default exists.
 */
export function loadBrand(env: Record<string, string | undefined> = process.env): Brand {
  const resolve = (key: keyof Brand): string =>
    env[ENV_KEYS[key]] ?? DEFAULTS[key] ?? '';

  return {
    echo_url: resolve('echo_url'),
    forge_url: resolve('forge_url'),
    mcp_url: resolve('mcp_url'),
    handle: resolve('handle'),
    x_handle: resolve('x_handle'),
    ig_handle: resolve('ig_handle'),
  };
}

/** All known placeholder keys, case-insensitive match. */
const KNOWN_KEYS = new Set<string>([
  'echo_url', 'forge_url', 'mcp_url', 'handle', 'x_handle', 'ig_handle',
]);

/**
 * Replace all {key} placeholders in template with brand values.
 * - Case-insensitive match on key name.
 * - Unknown placeholder keys are left intact (visible typo signal).
 * - After substitution, collapse runs of 2+ spaces into one and trim.
 */
export function renderBrand(template: string, brand: Brand): string {
  const rendered = template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    const lower = key.toLowerCase() as keyof Brand;
    if (KNOWN_KEYS.has(lower)) {
      return brand[lower];
    }
    // Unknown placeholder — leave intact so typo is visible
    return _match;
  });
  // Collapse multiple spaces (from empty brand values) and trim
  return rendered.replace(/ {2,}/g, ' ').trim();
}

/**
 * Return the placeholder keys used in template whose brand value is '' (empty).
 * Useful to warn before posting content with blank URLs or handles.
 */
export function missingBrandKeys(template: string, brand: Brand): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const match of template.matchAll(/\{([a-zA-Z0-9_]+)\}/g)) {
    const key = match[1].toLowerCase() as keyof Brand;
    if (KNOWN_KEYS.has(key) && brand[key] === '' && !seen.has(key)) {
      missing.push(key);
      seen.add(key);
    }
  }
  return missing;
}
