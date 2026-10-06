import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { glyphFor, measureText, validateFont, wrapText, type FontDef } from '../src/core/font';
import { FONT_PATH } from '../tools/sprites/lib';

const font: FontDef = validateFont(JSON.parse(readFileSync(FONT_PATH, 'utf8')), 'majlis.font.json');

describe('the bundled font', () => {
  it('covers printable ASCII and the transliteration marks the story needs', () => {
    for (let code = 0x20; code <= 0x7e; code++) {
      expect(font.glyphs[String.fromCharCode(code)], `U+${code.toString(16)}`).toBeDefined();
    }
    for (const ch of ['ʿ', 'ʾ', '→', '×', '–', '—', '…', '·', '•', '◆', '◇']) expect(font.glyphs[ch], ch).toBeDefined();
  });

  it('has one height for every glyph and fits the 8-pixel line grid', () => {
    expect(font.glyphHeight).toBeLessThanOrEqual(8);
    expect(font.lineHeight).toBeGreaterThanOrEqual(font.glyphHeight);
    for (const [ch, rows] of Object.entries(font.glyphs)) expect(rows, ch).toHaveLength(font.glyphHeight);
  });

  it('measures proportionally with one pixel of spacing', () => {
    const iw = glyphFor(font, 'i')?.[0]?.length ?? 0;
    const mw = glyphFor(font, 'm')?.[0]?.length ?? 0;
    expect(iw).toBeLessThan(mw);
    expect(measureText(font, 'im')).toBe(iw + mw + 1);
    expect(measureText(font, '')).toBe(0);
  });

  it('falls back to a question mark for unknown characters', () => {
    expect(glyphFor(font, '\u0001')).toEqual(font.glyphs['?']);
  });

  it('wraps on word boundaries without exceeding the width', () => {
    const lines = wrapText(font, 'The army of Shirkuh marched on the road to Egypt', 80);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measureText(font, line)).toBeLessThanOrEqual(80);
    expect(lines.join(' ')).toBe('The army of Shirkuh marched on the road to Egypt');
  });

  it('keeps explicit line breaks and splits words longer than a line', () => {
    expect(wrapText(font, 'a\nb', 100)).toEqual(['a', 'b']);
    for (const line of wrapText(font, 'Mmmmmmmmmmmmmmmmmmmmmmmmmmmm', 40)) expect(measureText(font, line)).toBeLessThanOrEqual(40);
  });
});

describe('validateFont', () => {
  const good = { id: 't', glyphHeight: 2, lineHeight: 3, glyphs: { a: ['#.', '.#'] } };

  it('accepts a minimal font', () => {
    expect(validateFont(good).id).toBe('t');
  });

  it('rejects ragged or malformed glyphs', () => {
    expect(() => validateFont({ ...good, glyphs: { a: ['#.', '#'] } })).toThrow(/malformed/);
    expect(() => validateFont({ ...good, glyphs: { a: ['#.'] } })).toThrow(/2 rows/);
    expect(() => validateFont({ ...good, glyphs: { a: ['#x', '.#'] } })).toThrow(/malformed/);
    expect(() => validateFont({ ...good, glyphs: { ab: ['#.', '.#'] } })).toThrow(/one character/);
    expect(() => validateFont({ ...good, lineHeight: 1 })).toThrow(/lineHeight/);
  });
});
