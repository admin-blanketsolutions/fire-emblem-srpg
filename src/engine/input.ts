import { PointerGesture } from '../core/gesture';
import { RepeatTracker, type Action } from '../core/input';
import type { Point } from '../core/types';
import type { Display } from './display';

/** Keyboard keys by `KeyboardEvent.key` (letters lower-cased, so they follow the printed legend). */
const KEY_ACTIONS: Readonly<Record<string, Action>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  z: 'confirm',
  x: 'cancel',
  a: 'info',
  s: 'danger',
  Enter: 'menu',
  Escape: 'pause',
};

/**
 * Collects keyboard, touch-pad and pointer input and hands scenes the actions that fired this
 * frame. A press shorter than one frame still counts: its release is deferred until it was seen.
 */
export class Input {
  private readonly held = new Set<Action>();
  private readonly unseen = new Set<Action>();
  private readonly deferredRelease = new Set<Action>();
  private readonly tracker = new RepeatTracker();
  private taps: Point[] = [];
  private readonly gesture = new PointerGesture();

  constructor(display: Display) {
    window.addEventListener('keydown', (e) => {
      const action = KEY_ACTIONS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!action || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      if (!e.repeat) this.press(action);
    });
    window.addEventListener('keyup', (e) => {
      const action = KEY_ACTIONS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (action) this.release(action);
    });
    window.addEventListener('blur', () => this.releaseAll());
    // a tap is reported when the pointer lifts without having moved; a drag pans instead
    const canvas = display.canvas;
    canvas.addEventListener('pointerdown', (e) => {
      const p = display.toLogical(e.clientX, e.clientY);
      if (!p) return;
      canvas.setPointerCapture?.(e.pointerId);
      this.gesture.down(e.pointerId, p);
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = display.toLogical(e.clientX, e.clientY);
      if (p) this.gesture.move(e.pointerId, p);
    });
    canvas.addEventListener('pointerup', (e) => {
      const tap = this.gesture.up(e.pointerId);
      if (tap) this.taps.push(tap);
    });
    canvas.addEventListener('pointercancel', (e) => this.gesture.cancel(e.pointerId));
  }

  press(action: Action): void {
    this.held.add(action);
    this.unseen.add(action);
  }

  release(action: Action): void {
    if (this.unseen.has(action)) this.deferredRelease.add(action);
    else this.held.delete(action);
  }

  releaseAll(): void {
    this.held.clear();
    this.unseen.clear();
    this.deferredRelease.clear();
  }

  /** Actions that fire this frame (first press, plus repeats for held directions). */
  update(dtMs: number): Set<Action> {
    const fired = this.tracker.update(this.held, dtMs);
    this.unseen.clear();
    for (const action of this.deferredRelease) this.held.delete(action);
    this.deferredRelease.clear();
    return fired;
  }

  /** How far the player has dragged since the last call, in logical pixels. */
  takePan(): Point {
    return this.gesture.takePan();
  }

  /** Pointer taps since the last call, in logical pixels. */
  takeTaps(): Point[] {
    const taps = this.taps;
    this.taps = [];
    return taps;
  }
}
