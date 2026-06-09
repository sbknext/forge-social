import { describe, it, expect } from 'vitest';
import {
  buildCardSvg,
  pickCardText,
  cardFileName,
  wrapText,
  xmlEscape,
  type CardSize,
  type CardTheme,
} from '../src/core/card.js';

// ---------------------------------------------------------------------------
// xmlEscape
// ---------------------------------------------------------------------------
describe('xmlEscape', () => {
  it('escapes all five XML special chars', () => {
    expect(xmlEscape('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&apos;');
  });

  it('leaves plain text unchanged', () => {
    expect(xmlEscape('hello world 123')).toBe('hello world 123');
  });
});

// ---------------------------------------------------------------------------
// wrapText
// ---------------------------------------------------------------------------
describe('wrapText', () => {
  it('returns single line when text fits', () => {
    const lines = wrapText('Short title', 1000, 72);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('Short title');
  });

  it('breaks a long string into multiple lines', () => {
    // maxChars ≈ floor(400 / (72 * 0.55)) = floor(400/39.6) = 10
    // "one two three four five six" should break
    const lines = wrapText('one two three four five six seven', 400, 72);
    expect(lines.length).toBeGreaterThan(1);
  });

  it('never splits in the middle of a word', () => {
    const lines = wrapText('alpha bravo charlie delta echo foxtrot golf', 300, 72);
    for (const line of lines) {
      // each word should be intact — no partial words
      expect(line).not.toMatch(/^\s|\s$/);
    }
  });

  it('places a single overlong word on its own line', () => {
    // word longer than maxChars but must not be split
    const lines = wrapText('supercalifragilistic', 10, 72);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('supercalifragilistic');
  });
});

// ---------------------------------------------------------------------------
// pickCardText
// ---------------------------------------------------------------------------
describe('pickCardText', () => {
  it('returns title from first non-empty line', () => {
    const { title, subtitle } = pickCardText('Hello world\nSecond line');
    expect(title).toBe('Hello world');
    expect(subtitle).toBe('Second line');
  });

  it('returns no subtitle when only one line', () => {
    const { title, subtitle } = pickCardText('Only one line here');
    expect(title).toBe('Only one line here');
    expect(subtitle).toBeUndefined();
  });

  it('truncates a very long first line with ellipsis at a word boundary', () => {
    const longLine =
      'This is a very long title that goes well beyond eighty characters and must be truncated properly at a word boundary';
    const { title } = pickCardText(longLine);
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(81); // 80 + ellipsis char
    // the char before ellipsis should not be a space (trimmed)
    expect(title.slice(-2, -1)).not.toBe(' ');
  });

  it('does not add ellipsis when line is exactly 80 chars', () => {
    const exactly80 = 'a'.repeat(80);
    const { title } = pickCardText(exactly80);
    expect(title.endsWith('…')).toBe(false);
    expect(title).toBe(exactly80);
  });

  it('strips leading emoji from title when line exceeds 80 chars', () => {
    const longWithEmoji =
      '🚀 This is a very long title that goes well beyond eighty characters and should strip the emoji prefix cleanly';
    const { title } = pickCardText(longWithEmoji);
    expect(title.startsWith('🚀')).toBe(false);
  });

  it('keeps leading emoji when line is short enough', () => {
    const short = '🚀 Short';
    const { title } = pickCardText(short);
    expect(title).toBe('🚀 Short');
  });

  it('skips blank lines when extracting first/second lines', () => {
    const { title, subtitle } = pickCardText('\n\nActual title\n\nActual subtitle');
    expect(title).toBe('Actual title');
    expect(subtitle).toBe('Actual subtitle');
  });
});

// ---------------------------------------------------------------------------
// buildCardSvg — structural
// ---------------------------------------------------------------------------
describe('buildCardSvg — structure', () => {
  it('output starts with <svg', () => {
    const svg = buildCardSvg({ title: 'Hello' });
    expect(svg.trimStart().startsWith('<svg')).toBe(true);
  });

  it('wide size has correct width and height', () => {
    const svg = buildCardSvg({ title: 'Test', size: 'wide' });
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="675"');
  });

  it('square size has correct width and height', () => {
    const svg = buildCardSvg({ title: 'Test', size: 'square' });
    expect(svg).toContain('width="1080"');
    expect(svg).toContain('height="1080"');
  });

  it('defaults to wide when size is omitted', () => {
    const svg = buildCardSvg({ title: 'Test' });
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="675"');
  });
});

// ---------------------------------------------------------------------------
// buildCardSvg — title text
// ---------------------------------------------------------------------------
describe('buildCardSvg — title text', () => {
  it('contains the title text (escaped) in output', () => {
    const svg = buildCardSvg({ title: 'Echo AI rocks' });
    expect(svg).toContain('Echo AI rocks');
  });

  it('XML-escapes a title containing & and <', () => {
    const svg = buildCardSvg({ title: 'Speed & <Power>' });
    expect(svg).toContain('Speed &amp; &lt;Power&gt;');
    expect(svg).not.toContain('Speed & <Power>');
  });

  it('long title produces multiple <tspan> elements', () => {
    const longTitle =
      'Build faster ship smarter deploy everywhere with Echo AI the dev productivity powerhouse';
    const svg = buildCardSvg({ title: longTitle, size: 'wide' });
    const tspanCount = (svg.match(/<tspan/g) ?? []).length;
    expect(tspanCount).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// buildCardSvg — themes
// ---------------------------------------------------------------------------
describe('buildCardSvg — themes', () => {
  it('echo theme contains the teal/blue accent colour', () => {
    const svg = buildCardSvg({ title: 'Echo', theme: 'echo' });
    expect(svg).toContain('#0ea5e9');
  });

  it('forge theme contains the orange accent colour', () => {
    const svg = buildCardSvg({ title: 'Forge', theme: 'forge' });
    expect(svg).toContain('#e85d04');
  });

  it('neutral theme contains the grey accent colour', () => {
    const svg = buildCardSvg({ title: 'Neutral', theme: 'neutral' });
    expect(svg).toContain('#6b7280');
  });

  it('defaults to neutral when theme is omitted', () => {
    const svg = buildCardSvg({ title: 'Default' });
    expect(svg).toContain('#6b7280');
  });
});

// ---------------------------------------------------------------------------
// buildCardSvg — subtitle + footer
// ---------------------------------------------------------------------------
describe('buildCardSvg — subtitle and footer', () => {
  it('renders subtitle when provided', () => {
    const svg = buildCardSvg({ title: 'Title', subtitle: 'Flash Think Pro Deep' });
    expect(svg).toContain('Flash Think Pro Deep');
  });

  it('omits subtitle element when not provided', () => {
    const svg = buildCardSvg({ title: 'Title only' });
    // No subtitle text block should appear
    const count = (svg.match(/Flash Think Pro Deep/g) ?? []).length;
    expect(count).toBe(0);
  });

  it('renders footer when provided', () => {
    const svg = buildCardSvg({ title: 'T', footer: '@forge_social' });
    expect(svg).toContain('@forge_social');
  });

  it('XML-escapes footer with single-quote', () => {
    const svg = buildCardSvg({ title: 'T', footer: "it's here" });
    expect(svg).toContain('it&apos;s here');
  });
});

// ---------------------------------------------------------------------------
// buildCardSvg — determinism
// ---------------------------------------------------------------------------
describe('buildCardSvg — determinism', () => {
  it('produces identical output on repeated calls', () => {
    const opts = { title: 'Stable output', size: 'wide' as CardSize, theme: 'echo' as CardTheme };
    expect(buildCardSvg(opts)).toBe(buildCardSvg(opts));
  });
});

// ---------------------------------------------------------------------------
// cardFileName
// ---------------------------------------------------------------------------
describe('cardFileName', () => {
  it('formats wide filename correctly', () => {
    expect(cardFileName('post-1', 'wide')).toBe('post-1-wide.png');
  });

  it('formats square filename correctly', () => {
    expect(cardFileName('echo-launch', 'square')).toBe('echo-launch-square.png');
  });

  it('uses postId verbatim', () => {
    expect(cardFileName('my_post_id_42', 'wide')).toBe('my_post_id_42-wide.png');
  });
});
