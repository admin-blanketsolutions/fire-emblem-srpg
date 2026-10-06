import { COLORS } from './theme';
import type { TextRenderer } from './text';

/** A framed window: ink outline, cream edge, brown inner line, dark blue fill. */
export function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = COLORS.panelEdge;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = COLORS.panelInner;
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = COLORS.panel;
  ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
  // softened corners
  ctx.clearRect(x, y, 1, 1);
  ctx.clearRect(x + w - 1, y, 1, 1);
  ctx.clearRect(x, y + h - 1, 1, 1);
  ctx.clearRect(x + w - 1, y + h - 1, 1, 1);
}

/** A horizontal gauge. The fill colour turns amber and red as the value drops. */
export function drawGauge(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, value: number, max: number, h = 3): void {
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = COLORS.hpBack;
  ctx.fillRect(x, y, w, h);
  const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  const filled = value > 0 ? Math.max(1, Math.round(w * ratio)) : 0;
  ctx.fillStyle = ratio > 0.5 ? COLORS.hp : ratio > 0.25 ? COLORS.hpLow : COLORS.hpCritical;
  ctx.fillRect(x, y, filled, h);
}

export interface MenuItem {
  readonly label: string;
  readonly enabled?: boolean;
}

/** A vertical menu in its own panel. Returns the panel's size so callers can place it. */
export function menuSize(text: TextRenderer, items: readonly MenuItem[], title?: string): { w: number; h: number } {
  const widest = Math.max(...items.map((i) => text.width(i.label)), title ? text.width(title) : 0);
  const titleRows = title ? 1 : 0;
  return { w: widest + 18, h: (items.length + titleRows) * 11 + 8 };
}

export function drawMenu(
  ctx: CanvasRenderingContext2D,
  text: TextRenderer,
  items: readonly MenuItem[],
  selected: number,
  x: number,
  y: number,
  title?: string,
): void {
  const { w, h } = menuSize(text, items, title);
  drawPanel(ctx, x, y, w, h);
  let row = y + 5;
  if (title) {
    text.draw(ctx, title, x + 9, row, { color: COLORS.textDim });
    row += 11;
  }
  items.forEach((item, i) => {
    const enabled = item.enabled !== false;
    if (i === selected) text.draw(ctx, '→', x + 4, row, { color: COLORS.gold });
    text.draw(ctx, item.label, x + 12, row, { color: enabled ? COLORS.text : COLORS.textDim });
    row += 11;
  });
}
