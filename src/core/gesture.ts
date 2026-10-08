import type { Point } from './types';

/**
 * Tells a tap from a drag (DESIGN §3.5): a pointer that moves less than `threshold` logical pixels
 * between going down and coming up is a tap, at the place it went down; one that moves further is
 * a drag, and its movement is handed out as a pan. Only the first pointer down counts, so a
 * second finger does not disturb the first.
 */
export class PointerGesture {
  private active: { id: number; start: Point; last: Point; dragging: boolean } | null = null;
  private pan = { x: 0, y: 0 };

  constructor(private readonly threshold = 4) {}

  down(id: number, p: Point): void {
    if (this.active) return;
    this.active = { id, start: p, last: p, dragging: false };
  }

  move(id: number, p: Point): void {
    const a = this.active;
    if (!a || a.id !== id) return;
    if (!a.dragging) {
      if (Math.abs(p.x - a.start.x) + Math.abs(p.y - a.start.y) <= this.threshold) return;
      a.dragging = true;
    }
    this.pan.x += p.x - a.last.x;
    this.pan.y += p.y - a.last.y;
    a.last = p;
  }

  /** The pointer is lifted: a tap, if it never became a drag. */
  up(id: number): Point | null {
    const a = this.active;
    if (!a || a.id !== id) return null;
    this.active = null;
    return a.dragging ? null : a.start;
  }

  /** The pointer is taken away by the browser (a system gesture): neither a tap nor more drag. */
  cancel(id: number): void {
    if (this.active?.id === id) this.active = null;
  }

  /** How far the drag has moved since the last call, in logical pixels. */
  takePan(): Point {
    const out = { x: this.pan.x, y: this.pan.y };
    this.pan = { x: 0, y: 0 };
    return out;
  }
}
