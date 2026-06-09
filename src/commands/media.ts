/**
 * media.ts — CLI command: generate branded image cards for campaign posts.
 *
 * For each post in the campaign file:
 *   1. Derive theme from post id (echo-* → echo, forge-* → forge, else neutral).
 *   2. Extract a punchy headline via pickCardText.
 *   3. Build SVG for requested size(s) via buildCardSvg.
 *   4. Rasterize to PNG (or degrade to SVG) via rasterizeSvgToPng.
 *   5. Optionally update campaign file's image fields (--attach flag).
 *
 * Flags:
 *   --file   <path>         Campaign JSON (required).
 *   --out    <dir>          Output directory (default: 'assets/' relative to cwd).
 *   --size   wide|square|both  Which card size(s) to generate (default: both).
 *   --attach                Write the wide card path back into the campaign JSON.
 *   --theme  echo|forge|neutral  Override the auto-detected theme for all posts.
 */

import { resolve, join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import chalk from 'chalk';
import { loadCampaignFile, type Campaign, type CampaignPost } from '../core/campaign.js';
import { loadBrand } from '../core/brand.js';
import {
  buildCardSvg,
  pickCardText,
  cardFileName,
  type CardSize,
  type CardTheme,
} from '../core/card.js';

// Dimensions per size — mirrors the internal DIMS in card.ts
const CARD_DIMS: Record<CardSize, { w: number; h: number }> = {
  wide:   { w: 1200, h: 675 },
  square: { w: 1080, h: 1080 },
};
import {
  rasterizeSvgToPng,
  isRasterizerAvailable,
} from '../core/render.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MediaOptions {
  /** Absolute or relative path to the campaign JSON file. */
  file: string;
  /** Output directory. Defaults to 'assets/' relative to cwd. */
  out?: string;
  /** Which size(s) to generate. Defaults to 'both'. */
  size?: 'wide' | 'square' | 'both';
  /**
   * If true: update the campaign JSON file's image fields to point at the
   * generated wide card path for each post. The file is rewritten as valid
   * JSON (2-space indent, trailing newline).
   */
  attach?: boolean;
  /** Override auto-detected theme for all posts. */
  theme?: string;
}

// ---------------------------------------------------------------------------
// Theme derivation
// ---------------------------------------------------------------------------

/**
 * Derive card theme from post id: echo-* → 'echo', forge-* → 'forge', else 'neutral'.
 * Overridden by opts.theme when provided.
 */
function resolveTheme(postId: string, override?: string): CardTheme {
  if (override === 'echo' || override === 'forge' || override === 'neutral') {
    return override as CardTheme;
  }
  if (postId.startsWith('echo')) return 'echo';
  if (postId.startsWith('forge')) return 'forge';
  return 'neutral';
}

// ---------------------------------------------------------------------------
// Per-post card generation
// ---------------------------------------------------------------------------

interface CardResult {
  postId: string;
  size: CardSize;
  wrote: 'png' | 'svg';
  path: string;
  ok: boolean;
}

async function generateCard(
  post: CampaignPost,
  size: CardSize,
  outDir: string,
  theme: CardTheme,
): Promise<CardResult> {
  const { title, subtitle } = pickCardText(post.text);
  const { w, h } = CARD_DIMS[size];

  const svg = buildCardSvg({
    title,
    subtitle,
    size,
    theme,
    // footer: handle derived from brand could go here; omit for clean layout
  });

  const filename = cardFileName(post.id, size);
  const outPath = join(outDir, filename);

  const result = await rasterizeSvgToPng(svg, outPath, w, h);

  return {
    postId: post.id,
    size,
    wrote: result.wrote,
    path: result.path,
    ok: result.ok,
  };
}

// ---------------------------------------------------------------------------
// Attach: update campaign JSON image fields
// ---------------------------------------------------------------------------

async function attachImagesToFile(
  campaignPath: string,
  campaign: Campaign,
  cardResults: CardResult[],
): Promise<void> {
  // Build a map: postId → wide card path
  const wideByPost = new Map<string, string>();
  for (const r of cardResults) {
    if (r.size === 'wide') {
      wideByPost.set(r.postId, r.path);
    }
  }

  // Mutate the in-memory posts and rewrite the file.
  const updated: Campaign = {
    ...campaign,
    posts: campaign.posts.map((p) => {
      const img = wideByPost.get(p.id);
      if (img !== undefined) {
        return { ...p, image: img };
      }
      return p;
    }),
  };

  await writeFile(campaignPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function media(opts: MediaOptions): Promise<void> {
  const campaignPath = resolve(opts.file);
  const outDir = resolve(opts.out ?? 'assets');
  const sizeMode = opts.size ?? 'both';

  // Which concrete sizes to generate
  const sizes: CardSize[] =
    sizeMode === 'wide'   ? ['wide'] :
    sizeMode === 'square' ? ['square'] :
    ['wide', 'square'];

  // Load campaign (throws on bad JSON/schema)
  const campaign = loadCampaignFile(campaignPath);
  // Brand loaded but not used for card copy directly (card.ts handles footer)
  const _brand = loadBrand();
  void _brand; // referenced for completeness — future: pass handle to buildCardSvg

  // Check rasterizer once for the warning message
  const hasRasterizer = await isRasterizerAvailable();
  if (!hasRasterizer) {
    console.log(
      chalk.yellow(
        '  ⚠ @napi-rs/canvas not installed — cards will be written as .svg files.\n' +
        '    Install it for PNG output: npm install @napi-rs/canvas',
      ),
    );
  }

  // Generate cards
  const allResults: CardResult[] = [];

  for (const post of campaign.posts) {
    const theme = resolveTheme(post.id, opts.theme);

    for (const size of sizes) {
      const result = await generateCard(post, size, outDir, theme);
      allResults.push(result);
    }
  }

  // Summary
  const pngCount = allResults.filter((r) => r.wrote === 'png').length;
  const svgCount = allResults.filter((r) => r.wrote === 'svg').length;
  const total = allResults.length;

  console.log(chalk.bold(`\n  Media cards generated: ${total}`));
  if (pngCount > 0) {
    console.log(chalk.green(`    ${pngCount} PNG${pngCount > 1 ? 's' : ''} written to ${outDir}`));
  }
  if (svgCount > 0) {
    console.log(chalk.yellow(`    ${svgCount} SVG${svgCount > 1 ? 's' : ''} written (PNG rasterizer missing)`));
  }

  // Per-post path hints when --attach not set
  if (opts.attach) {
    await attachImagesToFile(campaignPath, campaign, allResults);
    console.log(chalk.cyan(`    Campaign file updated with image paths: ${campaignPath}`));
  } else {
    // Print suggested image path per post (wide card)
    const wideResults = allResults.filter((r) => r.size === 'wide');
    if (wideResults.length > 0) {
      console.log(chalk.dim('\n  Suggested image paths per post (use --attach to write back):'));
      for (const r of wideResults) {
        console.log(chalk.dim(`    ${r.postId}: ${r.path}`));
      }
    }
  }

  console.log('');
}
