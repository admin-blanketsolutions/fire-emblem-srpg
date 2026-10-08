import type { Action } from '../core/input';
import type { Point } from '../core/types';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/viewport';
import type { Scene } from '../engine/game';
import type { TextRenderer, TextStyle } from '../engine/text';
import { COLORS } from '../engine/theme';
import { drawPanel } from '../engine/ui';

/**
 * The full-screen list that the title, settings, save slots and Codex screens are made of: a
 * heading, rows with an optional value on the right, a note under the list, and a hint line.
 * Up and Down move, Left and Right change a row's value, OK chooses, Back leaves. A tap on a row
 * moves to it, and a tap on the chosen row is OK.
 */

export const PLAIN: TextStyle = { color: COLORS.text };
export const DIM: TextStyle = { color: COLORS.textDim };
export const GOLD: TextStyle = { color: COLORS.gold };

export const ROW = 11;
const LIST_TOP = 30;
const LIST_X = 18;

export interface Row {
  readonly label: string;
  readonly value?: string;
  /** Shown dim and not chosen by OK. */
  readonly disabled?: boolean;
  /** A line about the row, shown under the list while it is chosen. */
  readonly about?: string;
  readonly choose?: () => void;
  /** Left (-1) or Right (+1) on the row. */
  readonly change?: (delta: -1 | 1) => void;
}

export interface ListContent {
  readonly title: string;
  readonly rows: readonly Row[];
  /** Under the list, whatever row is chosen (a notice, a status). */
  readonly note?: string;
  readonly hint?: string;
}

/** Fill the screen with the dark backdrop the menus sit on. */
export function drawBackdrop(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = COLORS.ink;
  ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
}

/** How many rows fit between the heading and the note. */
export const VISIBLE_ROWS = 8;

export abstract class ListScreen implements Scene {
  index = 0;
  /** The first row on screen, when there are more rows than fit. */
  private top = 0;

  constructor(protected readonly text: TextRenderer) {}

  /** What to show now; asked every frame, so it always reflects the state. */
  protected abstract content(): ListContent;

  /** Back. */
  protected abstract back(): void;

  update(_dtMs: number, actions: ReadonlySet<Action>, taps: readonly Point[]): void {
    const { rows } = this.content();
    const merged = new Set(actions);
    for (const tap of taps) {
      const i = this.rowAt(tap);
      if (i === null) continue;
      if (i === this.index) merged.add('confirm');
      else this.index = i;
    }
    const n = rows.length;
    if (n > 0) {
      if (merged.has('up')) this.index = (this.index + n - 1) % n;
      if (merged.has('down')) this.index = (this.index + 1) % n;
      this.index = Math.min(this.index, n - 1);
    }
    const row = rows[this.index];
    if (merged.has('cancel')) {
      this.back();
      return;
    }
    if (row && !row.disabled) {
      if (merged.has('left')) row.change?.(-1);
      if (merged.has('right')) row.change?.(1);
      if (merged.has('confirm')) {
        if (row.choose) row.choose();
        else row.change?.(1);
      }
    }
  }

  private rowAt(p: Point): number | null {
    if (p.x < LIST_X - 8 || p.x > LOGICAL_WIDTH - 8) return null;
    const i = Math.floor((p.y - LIST_TOP) / ROW);
    if (i < 0 || i >= VISIBLE_ROWS) return null;
    const index = this.top + i;
    return index < this.content().rows.length ? index : null;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const { title, rows, note, hint } = this.content();
    drawBackdrop(ctx);
    drawPanel(ctx, 4, 4, LOGICAL_WIDTH - 8, LOGICAL_HEIGHT - 8);
    this.text.draw(ctx, title, 12, 12, GOLD);
    if (this.index < this.top) this.top = this.index;
    if (this.index >= this.top + VISIBLE_ROWS) this.top = this.index - VISIBLE_ROWS + 1;
    this.top = Math.max(0, Math.min(this.top, Math.max(0, rows.length - VISIBLE_ROWS)));
    rows.slice(this.top, this.top + VISIBLE_ROWS).forEach((row, i) => {
      const y = LIST_TOP + i * ROW;
      const chosen = this.top + i === this.index;
      if (chosen) this.text.draw(ctx, '→', LIST_X - 9, y, GOLD);
      this.text.draw(ctx, row.label, LIST_X, y, row.disabled ? DIM : PLAIN);
      if (row.value !== undefined) {
        const value = row.change && chosen ? `< ${row.value} >` : row.value;
        this.text.drawRight(ctx, value, LOGICAL_WIDTH - 14, y, chosen ? GOLD : DIM);
      }
    });
    if (this.top > 0) this.text.drawRight(ctx, '▲', LOGICAL_WIDTH - 14, 12, DIM);
    if (this.top + VISIBLE_ROWS < rows.length) this.text.drawRight(ctx, '▼', LOGICAL_WIDTH - 14, LIST_TOP + VISIBLE_ROWS * ROW, DIM);
    const about = rows[this.index]?.about ?? note;
    if (about) this.text.wrap(about, LOGICAL_WIDTH - 28).slice(0, 2).forEach((line, i) => this.text.draw(ctx, line, 12, 124 + i * 10, DIM));
    this.text.draw(ctx, hint ?? 'OK Choose   Back Return', 12, LOGICAL_HEIGHT - 16, DIM);
  }
}
