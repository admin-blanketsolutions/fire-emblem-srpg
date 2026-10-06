/**
 * Bitmap fonts. Glyphs are rows of '.' and '#' of equal width (up to 8), all the same height.
 * Text is proportional: a glyph advances by its own width plus one pixel of spacing.
 */

export interface FontDef {
  readonly id: string;
  readonly glyphHeight: number;
  /** Vertical distance between lines of text. */
  readonly lineHeight: number;
  readonly glyphs: Readonly<Record<string, readonly string[]>>;
}

/** Validate untrusted JSON as a font. Throws a descriptive error. */
export function validateFont(raw: unknown, source = 'font'): FontDef {
  if (typeof raw !== 'object' || raw === null) throw new Error(`${source}: must be an object`);
  const r = raw as Record<string, unknown>;
  const { id, glyphHeight, lineHeight, glyphs } = r;
  if (typeof id !== 'string') throw new Error(`${source}: missing id`);
  if (!Number.isInteger(glyphHeight) || (glyphHeight as number) < 1) throw new Error(`${source}: bad glyphHeight`);
  if (!Number.isInteger(lineHeight) || (lineHeight as number) < (glyphHeight as number)) {
    throw new Error(`${source}: lineHeight must be at least glyphHeight`);
  }
  if (typeof glyphs !== 'object' || glyphs === null) throw new Error(`${source}: missing glyphs`);
  for (const [ch, rows] of Object.entries(glyphs)) {
    if ([...ch].length !== 1) throw new Error(`${source}: glyph key "${ch}" must be one character`);
    if (!Array.isArray(rows) || rows.length !== glyphHeight) {
      throw new Error(`${source}: glyph "${ch}" must have ${String(glyphHeight)} rows`);
    }
    const width = (rows[0] as string | undefined)?.length ?? 0;
    if (width < 1 || width > 8) throw new Error(`${source}: glyph "${ch}" width must be 1..8`);
    for (const row of rows as unknown[]) {
      if (typeof row !== 'string' || row.length !== width || !/^[.#]+$/.test(row)) {
        throw new Error(`${source}: glyph "${ch}" has a malformed row`);
      }
    }
  }
  return raw as FontDef;
}

/** The glyph for a character, falling back to "?" and then to nothing. */
export function glyphFor(font: FontDef, ch: string): readonly string[] | undefined {
  return font.glyphs[ch] ?? font.glyphs['?'];
}

export function glyphWidth(font: FontDef, ch: string): number {
  return glyphFor(font, ch)?.[0]?.length ?? 0;
}

/** Pixel width of a single line of text. */
export function measureText(font: FontDef, text: string): number {
  let width = 0;
  let count = 0;
  for (const ch of text) {
    width += glyphWidth(font, ch);
    count += 1;
  }
  return count === 0 ? 0 : width + (count - 1);
}

/** Greedy word wrap into lines no wider than `maxWidth` pixels. Words longer than a line are split. */
export function wrapText(font: FontDef, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const candidate = line === '' ? word : `${line} ${word}`;
      if (measureText(font, candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line !== '') lines.push(line);
      line = '';
      let rest = word;
      while (measureText(font, rest) > maxWidth && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && measureText(font, rest.slice(0, cut)) > maxWidth) cut -= 1;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}
