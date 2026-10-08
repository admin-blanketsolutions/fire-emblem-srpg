import { DIRECTION_ACTIONS, type Action } from '../core/input';
import { audio } from './audio';
import type { Point } from '../core/types';
import type { Assets } from './assets';
import type { Display } from './display';
import type { Input } from './input';
import type { TextRenderer } from './text';

/** One screen of the game: the title, a battle, a dialogue. */
export interface Scene {
  /** `pan` is how far the player dragged this frame, in logical pixels; most scenes ignore it. */
  update(dtMs: number, actions: ReadonlySet<Action>, taps: readonly Point[], pan?: Point): void;
  draw(ctx: CanvasRenderingContext2D): void;
}

export interface Services {
  readonly display: Display;
  readonly input: Input;
  readonly assets: Assets;
  readonly text: TextRenderer;
}

/** Longest frame step the simulation will take, so a stalled tab does not teleport animations. */
const MAX_STEP_MS = 100;

/** Runs the current scene on `requestAnimationFrame`. */
export class Game {
  private scene: Scene | null = null;
  private last = 0;

  constructor(private readonly services: Services) {}

  run(scene: Scene): void {
    this.scene = scene;
    this.last = performance.now();
    requestAnimationFrame((now) => this.frame(now));
  }

  setScene(scene: Scene): void {
    this.scene = scene;
  }

  private frame(now: number): void {
    const dt = Math.min(MAX_STEP_MS, Math.max(0, now - this.last));
    this.last = now;
    const { display, input } = this.services;
    if (this.scene) {
      const actions = input.update(dt);
      // the interface sounds, the same everywhere: moving, choosing, going back
      if (actions.has('confirm')) audio.playSfx('confirm');
      else if (actions.has('cancel')) audio.playSfx('cancel');
      else if (DIRECTION_ACTIONS.some((a) => actions.has(a))) audio.playSfx('cursor');
      this.scene.update(dt, actions, input.takeTaps(), input.takePan());
      this.scene.draw(display.ctx);
    }
    requestAnimationFrame((t) => this.frame(t));
  }
}
