import type { Action } from '../core/input';
import { keyLabel, NameEntry, NAME_MAX } from '../core/naming';
import type { Point } from '../core/types';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/viewport';
import type { Scene } from '../engine/game';
import type { TextRenderer } from '../engine/text';
import { COLORS } from '../engine/theme';
import { drawPanel } from '../engine/ui';
import { DIM, drawBackdrop, GOLD, PLAIN } from './listScreen';

/**
 * Naming the Recruit: an on-screen keyboard you move over with the arrows and press with OK (or
 * tap), and a name box above it. Back takes a letter away; on an empty name it leaves.
 */

export interface NameSceneOptions {
  readonly text: TextRenderer;
  readonly initial?: string;
  readonly onDone: (name: string) => void;
  readonly onBack?: () => void;
}

const KEYS_X = 16;
const KEYS_W = LOGICAL_WIDTH - 2 * KEYS_X;
const KEYS_Y = 66;
const KEY_H = 14;

export class NameScene implements Scene {
  readonly entry: NameEntry;
  private clock = 0;

  constructor(private readonly o: NameSceneOptions) {
    this.entry = new NameEntry(o.initial ?? '');
  }

  /** The cell a key occupies: rows share the width equally, so the last row's few keys are wide. */
  private cell(row: number, col: number): { x: number; y: number; w: number; h: number } {
    const count = this.entry.keys[row]?.length ?? 1;
    const w = Math.floor(KEYS_W / count);
    return { x: KEYS_X + col * w, y: KEYS_Y + row * KEY_H, w, h: KEY_H };
  }

  update(dtMs: number, actions: ReadonlySet<Action>, taps: readonly Point[]): void {
    this.clock += dtMs;
    for (const tap of taps) {
      this.entry.keys.forEach((keys, row) =>
        keys.forEach((_, col) => {
          const c = this.cell(row, col);
          if (tap.x >= c.x && tap.x < c.x + c.w && tap.y >= c.y && tap.y < c.y + c.h) {
            this.entry.moveTo(row, col);
            this.press();
          }
        }),
      );
    }
    for (const a of ['up', 'down', 'left', 'right'] as const) if (actions.has(a)) this.entry.move(a);
    if (actions.has('confirm')) this.press();
    if (actions.has('cancel')) {
      if (this.entry.text === '') this.o.onBack?.();
      else this.entry.delete();
    }
  }

  private press(): void {
    const done = this.entry.press();
    if (done !== null) this.o.onDone(done);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const { text } = this.o;
    drawBackdrop(ctx);
    text.drawCentered(ctx, 'Name the Recruit', LOGICAL_WIDTH / 2, 8, { color: COLORS.text, shadow: COLORS.ink, scale: 2 });
    text.drawCentered(ctx, 'A levy soldier of Tikrit: an invented person (game-only).', LOGICAL_WIDTH / 2, 28, DIM);

    drawPanel(ctx, 56, 40, 128, 18);
    const blink = Math.floor(this.clock / 400) % 2 === 0 && this.entry.text.length < NAME_MAX;
    text.draw(ctx, this.entry.text + (blink ? '_' : ''), 64, 46, PLAIN);
    text.drawRight(ctx, `${this.entry.text.length}/${NAME_MAX}`, 178, 46, DIM);

    this.entry.keys.forEach((keys, row) =>
      keys.forEach((key, col) => {
        const c = this.cell(row, col);
        const here = this.entry.row === row && this.entry.col === col;
        ctx.fillStyle = here ? COLORS.panelInner : COLORS.panel;
        ctx.fillRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
        if (here) {
          ctx.fillStyle = COLORS.gold;
          ctx.fillRect(c.x + 1, c.y + 1, c.w - 2, 1);
          ctx.fillRect(c.x + 1, c.y + c.h - 2, c.w - 2, 1);
        }
        text.drawCentered(ctx, keyLabel(key), c.x + c.w / 2, c.y + 4, here ? GOLD : key.kind === 'char' ? PLAIN : DIM);
      }),
    );

    const message = this.entry.message;
    text.drawCentered(ctx, message ?? 'OK Press a key   Back Delete', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 16, message ? { color: COLORS.bad } : DIM);
  }
}
