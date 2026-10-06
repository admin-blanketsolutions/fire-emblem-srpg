import type { Action } from '../core/input';
import type { Point } from '../core/types';
import type { Assets } from './assets';
import type { Display } from './display';
import type { Input } from './input';
import type { TextRenderer } from './text';

/** One screen of the game: the title, a battle, a dialogue. */
export interface Scene {
  update(dtMs: number, actions: ReadonlySet<Action>, taps: readonly Point[]): void;
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
      this.scene.update(dt, input.update(dt), input.takeTaps());
      this.scene.draw(display.ctx);
    }
    requestAnimationFrame((t) => this.frame(t));
  }
}
