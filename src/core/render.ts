/**
 * render.ts — PNG rasterization of SVG cards (optional dep).
 *
 * Design principle: NEVER throw on a missing rasterizer.
 * If @napi-rs/canvas is not installed the pipeline degrades gracefully:
 * the SVG source is written to disk with a .svg extension instead of .png,
 * and the caller is informed via the `wrote` field in the return value.
 *
 * Why @napi-rs/canvas?
 *   - Ships prebuilt native binaries for macOS/Linux/Windows — no node-gyp.
 *   - Supports drawImage from a data: URL backed by an SVG string.
 *   - Peer-optional: the import is lazy (dynamic) so missing the package at
 *     install time does not break the build or any other command.
 *
 * The only file that does real I/O in this module is rasterizeSvgToPng.
 * svgDataUrl and isRasterizerAvailable are pure / side-effect-free for tests.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, extname, basename } from 'node:path';

// ---------------------------------------------------------------------------
// svgDataUrl — pure helper, always testable
// ---------------------------------------------------------------------------

/**
 * Encode an SVG string as a base64 data: URL.
 * Used to hand the SVG to @napi-rs/canvas via loadImage().
 *
 * Pure function: no I/O, no deps, always synchronous.
 */
export function svgDataUrl(svg: string): string {
  const b64 = Buffer.from(svg, 'utf-8').toString('base64');
  return `data:image/svg+xml;base64,${b64}`;
}

// ---------------------------------------------------------------------------
// isRasterizerAvailable — probe without throwing
// ---------------------------------------------------------------------------

/**
 * Check whether @napi-rs/canvas is available at runtime.
 *
 * Performs a dynamic import; catches ModuleNotFoundError and any other
 * error so this never rejects. Returns true only when the import succeeds
 * AND the module exports at least a `createCanvas` symbol (basic sanity).
 *
 * Safe to call multiple times — no caching intentional (avoids stale state
 * in tests or environments where the package is installed mid-process).
 */
export async function isRasterizerAvailable(): Promise<boolean> {
  try {
    // Dynamic import keeps tsc happy: the string literal prevents the
    // compiler from trying to resolve the module at build time.
    // The @ts-ignore below is intentional — @napi-rs/canvas is optional and
    // will not be in node_modules during CI unless the consumer installs it.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — optional peer dep; absence is the expected default
    const mod = await import('@napi-rs/canvas');
    return typeof mod.createCanvas === 'function';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// rasterizeSvgToPng — degrade-safe I/O
// ---------------------------------------------------------------------------

export interface RasterResult {
  /** Whether rasterization succeeded (true) or fell back to SVG (false). */
  ok: boolean;
  /** File type that was actually written. */
  wrote: 'png' | 'svg';
  /** Absolute path of the written file. */
  path: string;
}

/**
 * Render an SVG string to a PNG file at `outPath`.
 *
 * Happy path (@napi-rs/canvas present):
 *   1. Create a canvas at the requested dimensions.
 *   2. Obtain a 2D context.
 *   3. Load the SVG via a data: URL using loadImage().
 *   4. drawImage onto the canvas.
 *   5. Encode as PNG buffer (toBuffer('image/png')).
 *   6. Write to outPath. Parent directory is created if absent.
 *   Returns { ok: true, wrote: 'png', path: outPath }.
 *
 * Degrade path (package missing or any error):
 *   Replace the .png extension of outPath with .svg (same basename).
 *   Write the raw SVG string to that path.
 *   Returns { ok: false, wrote: 'svg', path: '<...>.svg' }.
 *   NEVER throws — the caller always gets a usable file.
 *
 * @param svg      Complete SVG document string.
 * @param outPath  Desired output path (should end in .png).
 * @param width    Canvas width in pixels.
 * @param height   Canvas height in pixels.
 */
export async function rasterizeSvgToPng(
  svg: string,
  outPath: string,
  width: number,
  height: number,
): Promise<RasterResult> {
  // Ensure parent directory exists before we try to write anything.
  const dir = dirname(outPath);
  try {
    await mkdir(dir, { recursive: true });
  } catch {
    // mkdir may throw if dir already exists on some platforms; ignore.
  }

  const available = await isRasterizerAvailable();

  if (available) {
    try {
      // Dynamic import — same pattern as isRasterizerAvailable.
      // @ts-ignore — optional peer dep
      const { createCanvas, loadImage } = await import('@napi-rs/canvas');

      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // loadImage accepts a data: URL; @napi-rs/canvas parses SVG via resvg.
      const dataUrl = svgDataUrl(svg);
      const img = await loadImage(dataUrl);
      ctx.drawImage(img, 0, 0, width, height);

      const pngBuffer: Buffer = canvas.toBuffer('image/png');
      await writeFile(outPath, pngBuffer);

      return { ok: true, wrote: 'png', path: outPath };
    } catch (err) {
      // Rasterizer was available but something went wrong (resvg parse error,
      // disk full, etc.). Fall through to SVG degrade path with a log hint.
      // We intentionally do not re-throw.
      const hint = err instanceof Error ? err.message : String(err);
      // Write hint to stderr so the operator can diagnose without crashing.
      process.stderr.write(`[render] PNG rasterization failed: ${hint}\n`);
    }
  }

  // ---------------------------------------------------------------------------
  // Degrade: write SVG next to the requested PNG path.
  // ---------------------------------------------------------------------------
  const ext = extname(outPath);                          // '.png' (or whatever)
  const base = basename(outPath, ext);                   // stem
  const svgPath = `${dir}/${base}.svg`;

  await writeFile(svgPath, svg, 'utf-8');

  return { ok: false, wrote: 'svg', path: svgPath };
}
