/**
 * render.test.ts — unit tests for src/core/render.ts
 *
 * Tests:
 *   - svgDataUrl: correct prefix + round-trip decode
 *   - isRasterizerAvailable: resolves to boolean (no throw regardless of install state)
 *
 * NOTE: @napi-rs/canvas is an OPTIONAL peer dep and is NOT expected to be
 * installed in the base dev environment. isRasterizerAvailable() is designed
 * to return false gracefully when it's absent — we assert on the type only.
 */

import { describe, it, expect } from 'vitest';
import { svgDataUrl, isRasterizerAvailable } from '../src/core/render.js';

// ---------------------------------------------------------------------------
// svgDataUrl
// ---------------------------------------------------------------------------

describe('svgDataUrl', () => {
  it('returns a string starting with the expected data URL prefix', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
    const url = svgDataUrl(svg);
    expect(url).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it('base64 body decodes back to the original SVG string', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>hello</text></svg>';
    const url = svgDataUrl(svg);
    const b64 = url.slice('data:image/svg+xml;base64,'.length);
    const decoded = Buffer.from(b64, 'base64').toString('utf-8');
    expect(decoded).toBe(svg);
  });

  it('handles SVGs with special characters (< > & " \')', () => {
    // The SVG itself may contain these — we encode the whole string, not escape it
    const svg = '<svg><text fill="red">it&apos;s &lt;OK&gt;</text></svg>';
    const url = svgDataUrl(svg);
    const b64 = url.slice('data:image/svg+xml;base64,'.length);
    const decoded = Buffer.from(b64, 'base64').toString('utf-8');
    expect(decoded).toBe(svg);
  });

  it('returns a non-empty string for an empty SVG', () => {
    const url = svgDataUrl('');
    // prefix is still present even for empty content
    expect(url).toBe('data:image/svg+xml;base64,');
  });

  it('returns different URLs for different SVG inputs', () => {
    const a = svgDataUrl('<svg id="a"/>');
    const b = svgDataUrl('<svg id="b"/>');
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// isRasterizerAvailable
// ---------------------------------------------------------------------------

describe('isRasterizerAvailable', () => {
  it('resolves to a boolean without throwing', async () => {
    const result = await isRasterizerAvailable();
    expect(typeof result).toBe('boolean');
  });

  it('resolves (does not reject) even when the package is absent', async () => {
    // We cannot guarantee the package is absent, but we can guarantee the
    // promise never rejects and always yields true or false.
    await expect(isRasterizerAvailable()).resolves.toSatisfy(
      (v) => v === true || v === false,
    );
  });
});
