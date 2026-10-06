import { glyphFor, measureText, wrapText, type FontDef } from '../core/font';

export interface TextStyle {
  readonly color?: string;
  /** A second copy drawn one pixel down and right, for legibility on busy backgrounds. */
  readonly shadow?: string;
  /** Whole-number magnification of the glyphs. */
  readonly scale?: number;
}

/** Draws text with the bitmap font. Glyph bitmaps are built once per colour and reused. */
export class TextRenderer {
  private readonly glyphs = new Map<string, HTMLCanvasElement | null>();

  constructor(private readonly font: FontDef) {}

  get lineHeight(): number {
    return this.font.lineHeight;
  }

  width(text: string, scale = 1): number {
    return measureText(this.font, text) * scale;
  }

  wrap(text: string, maxWidth: number): string[] {
    return wrapText(this.font, text, maxWidth);
  }

  /** Draw one line with its top-left at (x, y); returns the width drawn. */
  draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, style: TextStyle = {}): number {
    const scale = style.scale ?? 1;
    if (style.shadow) this.run(ctx, text, x + scale, y + scale, style.shadow, scale);
    return this.run(ctx, text, x, y, style.color ?? '#ffffff', scale);
  }

  drawCentered(ctx: CanvasRenderingContext2D, text: string, centerX: number, y: number, style: TextStyle = {}): void {
    this.draw(ctx, text, Math.round(centerX - this.width(text, style.scale ?? 1) / 2), y, style);
  }

  drawRight(ctx: CanvasRenderingContext2D, text: string, rightX: number, y: number, style: TextStyle = {}): void {
    this.draw(ctx, text, rightX - this.width(text, style.scale ?? 1), y, style);
  }

  /** Draw wrapped lines; returns the number of lines. */
  drawWrapped(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, style: TextStyle = {}): number {
    const lines = this.wrap(text, maxWidth);
    lines.forEach((line, i) => this.draw(ctx, line, x, y + i * this.font.lineHeight * (style.scale ?? 1), style));
    return lines.length;
  }

  private run(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, scale: number): number {
    let cx = x;
    for (const ch of text) {
      const glyph = this.glyph(ch, color);
      if (glyph) ctx.drawImage(glyph, cx, y, glyph.width * scale, glyph.height * scale);
      cx += (glyphFor(this.font, ch)?.[0]?.length ?? 0) * scale + scale;
    }
    return cx - x - scale;
  }

  private glyph(ch: string, color: string): HTMLCanvasElement | null {
    const key = `${color}|${ch}`;
    const cached = this.glyphs.get(key);
    if (cached !== undefined) return cached;
    const rows = glyphFor(this.font, ch);
    let canvas: HTMLCanvasElement | null = null;
    if (rows && rows[0]) {
      canvas = document.createElement('canvas');
      canvas.width = rows[0].length;
      canvas.height = rows.length;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = color;
        rows.forEach((row, y) => {
          for (let x = 0; x < row.length; x++) if (row.charAt(x) === '#') ctx.fillRect(x, y, 1, 1);
        });
      }
    }
    this.glyphs.set(key, canvas);
    return canvas;
  }
}
