/**
 * SVG card generator — pure, deterministic, no I/O.
 *
 * Produces branded image cards for promo posts.
 * Two sizes: wide (1200×675, X/LinkedIn), square (1080×1080, IG).
 * Three themes: echo (teal/blue), forge (orange #e85d04), neutral (grey).
 *
 * Word-wrap heuristic:
 *   Each character is assumed to be ~0.55× the font-size wide (reasonable
 *   approximation for a bold sans-serif at typical title sizes). The max
 *   chars per line is derived as: floor(maxLineWidth / (fontSize * 0.55)).
 *   Lines are broken at word boundaries (no mid-word splits). If a single
 *   word exceeds the per-line budget it is placed on its own line.
 */

export type CardSize = 'wide' | 'square';   // wide=1200×675, square=1080×1080
export type CardTheme = 'echo' | 'forge' | 'neutral';

export interface CardOptions {
  title: string;
  subtitle?: string;
  footer?: string;
  size?: CardSize;
  theme?: CardTheme;
}

// ---------------------------------------------------------------------------
// Internal geometry constants
// ---------------------------------------------------------------------------

const DIMS: Record<CardSize, { w: number; h: number }> = {
  wide:   { w: 1200, h: 675 },
  square: { w: 1080, h: 1080 },
};

// Theme colour tokens: accent, bgFrom, bgTo, textPrimary, textSecondary, textFooter
interface ThemeTokens {
  accent: string;
  bgFrom: string;
  bgTo: string;
  textPrimary: string;
  textSecondary: string;
  textFooter: string;
}

const THEMES: Record<CardTheme, ThemeTokens> = {
  echo: {
    accent:        '#0ea5e9',   // sky-500 teal/blue
    bgFrom:        '#0f172a',   // slate-900
    bgTo:          '#0c2340',   // deep navy
    textPrimary:   '#f0f9ff',   // sky-50
    textSecondary: '#7dd3fc',   // sky-300
    textFooter:    '#38bdf8',   // sky-400
  },
  forge: {
    accent:        '#e85d04',   // forge brand orange
    bgFrom:        '#1a0a00',   // very dark warm brown
    bgTo:          '#2d1200',   // dark orange-tinted
    textPrimary:   '#fff7ed',   // orange-50
    textSecondary: '#fdba74',   // orange-300
    textFooter:    '#fb923c',   // orange-400
  },
  neutral: {
    accent:        '#6b7280',   // grey-500
    bgFrom:        '#111827',   // grey-900
    bgTo:          '#1f2937',   // grey-800
    textPrimary:   '#f9fafb',   // grey-50
    textSecondary: '#d1d5db',   // grey-300
    textFooter:    '#9ca3af',   // grey-400
  },
};

// ---------------------------------------------------------------------------
// XML escaping
// ---------------------------------------------------------------------------

const XML_ESC: Record<string, string> = {
  '&':  '&amp;',
  '<':  '&lt;',
  '>':  '&gt;',
  '"':  '&quot;',
  "'":  '&apos;',
};

/** Escape characters that are illegal in XML text / attribute values. */
export function xmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => XML_ESC[c] ?? c);
}

// ---------------------------------------------------------------------------
// Word-wrap helper
// ---------------------------------------------------------------------------

/**
 * Break `text` into lines so that no line exceeds `maxChars` characters,
 * splitting only at whitespace. Single words longer than `maxChars` are
 * placed on their own line (not split).
 *
 * Wrap heuristic: maxChars = floor(maxLineWidth / (fontSize * 0.55))
 * The 0.55 factor approximates bold sans-serif average glyph width.
 */
export function wrapText(text: string, maxLineWidth: number, fontSize: number): string[] {
  const maxChars = Math.max(1, Math.floor(maxLineWidth / (fontSize * 0.55)));
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current === '') {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== '') lines.push(current);
  return lines.length > 0 ? lines : [''];
}

// ---------------------------------------------------------------------------
// pickCardText
// ---------------------------------------------------------------------------

const MAX_TITLE_CHARS = 80;

/** Leading emoji pattern — one or more emoji clusters at the start of the string. */
const LEADING_EMOJI_RE = /^(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})[️⃐-⃿‍]*/u;

/**
 * Extract a punchy headline from a post:
 * - title: first non-empty line, stripped of leading emoji if it would
 *   push past MAX_TITLE_CHARS once truncated, truncated at ~80 chars at
 *   a word boundary with trailing ellipsis.
 * - subtitle: second non-empty line (if present), truncated similarly.
 */
export function pickCardText(postText: string): { title: string; subtitle?: string } {
  const lines = postText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const truncate = (s: string): string => {
    if (s.length <= MAX_TITLE_CHARS) return s;
    // Find the last space at or before MAX_TITLE_CHARS
    let cut = s.lastIndexOf(' ', MAX_TITLE_CHARS);
    if (cut <= 0) cut = MAX_TITLE_CHARS;
    return s.slice(0, cut).trimEnd() + '…';
  };

  let rawTitle = lines[0] ?? '';

  // Strip leading emoji only when the raw line would exceed the char budget
  if (rawTitle.length > MAX_TITLE_CHARS) {
    rawTitle = rawTitle.replace(LEADING_EMOJI_RE, '').trimStart();
  }

  const title = truncate(rawTitle);

  if (lines.length < 2) return { title };

  const rawSub = lines[1] ?? '';
  const subtitle = truncate(rawSub);
  return { title, subtitle };
}

// ---------------------------------------------------------------------------
// buildCardSvg
// ---------------------------------------------------------------------------

/**
 * Build a complete SVG string for a branded promo card.
 *
 * Layout (top→bottom):
 *   - Gradient background
 *   - Accent bar (4px) near top
 *   - Title block (word-wrapped <tspan> lines, vertically centred-ish)
 *   - Subtitle (single line, smaller)
 *   - Footer (handle/url, bottom-right)
 *   - Small accent circle decoration (bottom-left)
 */
export function buildCardSvg(opts: CardOptions): string {
  const size  = opts.size  ?? 'wide';
  const theme = opts.theme ?? 'neutral';
  const { w, h } = DIMS[size];
  const tk = THEMES[theme];

  const pad = Math.round(w * 0.067);          // ~80px for wide, ~72px for square
  const contentW = w - pad * 2;

  // Typography sizes (px)
  const titleSize    = size === 'wide' ? 72 : 80;
  const subtitleSize = size === 'wide' ? 36 : 40;
  const footerSize   = size === 'wide' ? 28 : 30;
  const lineHeight   = titleSize * 1.2;

  // Title lines
  const titleLines = wrapText(opts.title, contentW, titleSize);

  // Vertical layout
  const accentBarY  = Math.round(h * 0.06);   // top accent bar y
  const accentBarH  = 4;

  // Title block starts at ~30% height
  const titleBlockY = Math.round(h * 0.28);
  const titleBlockH = titleLines.length * lineHeight;

  // Subtitle below title block + gap
  const subtitleY = titleBlockY + titleBlockH + subtitleSize * 1.0;

  // Footer near bottom
  const footerY = h - Math.round(h * 0.06) - footerSize * 0.3;

  // Accent circle (decorative, bottom-left corner offset)
  const circleR  = Math.round(h * 0.22);
  const circleX  = -Math.round(circleR * 0.35);
  const circleY  = h + Math.round(circleR * 0.35);

  // Gradient id (deterministic, no random)
  const gradId = `bg-${theme}-${size}`;

  // Build <tspan> elements for title
  const tspans = titleLines
    .map((line, i) =>
      `<tspan x="${pad}" dy="${i === 0 ? 0 : lineHeight}">${xmlEscape(line)}</tspan>`
    )
    .join('\n      ');

  // Subtitle element
  const subtitleEl = opts.subtitle
    ? `<text
    x="${pad}"
    y="${Math.round(subtitleY)}"
    font-family="'SF Pro Display', 'Inter', 'Segoe UI', system-ui, sans-serif"
    font-size="${subtitleSize}"
    font-weight="400"
    fill="${tk.textSecondary}"
    opacity="0.9"
  >${xmlEscape(opts.subtitle)}</text>`
    : '';

  // Footer element
  const footerEl = opts.footer
    ? `<text
    x="${w - pad}"
    y="${Math.round(footerY)}"
    font-family="'SF Pro Display', 'Inter', 'Segoe UI', system-ui, sans-serif"
    font-size="${footerSize}"
    font-weight="500"
    fill="${tk.textFooter}"
    text-anchor="end"
    opacity="0.85"
  >${xmlEscape(opts.footer)}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${tk.bgFrom}"/>
      <stop offset="100%" stop-color="${tk.bgTo}"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${w}" height="${h}" fill="url(#${gradId})"/>

  <!-- Decorative accent circle (bottom-left) -->
  <circle cx="${circleX}" cy="${circleY}" r="${circleR}" fill="${tk.accent}" opacity="0.12"/>

  <!-- Top accent bar -->
  <rect x="${pad}" y="${accentBarY}" width="${Math.round(contentW * 0.18)}" height="${accentBarH}" rx="2" fill="${tk.accent}"/>

  <!-- Title -->
  <text
    x="${pad}"
    y="${Math.round(titleBlockY)}"
    font-family="'SF Pro Display', 'Inter', 'Segoe UI', system-ui, sans-serif"
    font-size="${titleSize}"
    font-weight="700"
    fill="${tk.textPrimary}"
    dominant-baseline="hanging"
  >
      ${tspans}
  </text>

  ${subtitleEl}

  ${footerEl}
</svg>`;
}

// ---------------------------------------------------------------------------
// cardFileName
// ---------------------------------------------------------------------------

/** e.g. "post-1-wide.png" */
export function cardFileName(postId: string, size: CardSize): string {
  return `${postId}-${size}.png`;
}
