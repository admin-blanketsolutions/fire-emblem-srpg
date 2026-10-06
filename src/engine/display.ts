import { computeViewport, LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/viewport';

/**
 * The game screen: a fixed 240×160 logical canvas scaled by a whole number of device pixels,
 * centred in the window. Everything is drawn in logical pixels through the context's transform.
 */
export class Display {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private scale = 1;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('This browser does not support the Canvas 2D API');
    this.canvas = canvas;
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Re-fit the canvas to the window. Resizing resets the context, so the transform is re-applied. */
  resize(): void {
    const v = computeViewport(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
    this.canvas.width = v.backingWidth;
    this.canvas.height = v.backingHeight;
    this.canvas.style.width = `${v.cssWidth}px`;
    this.canvas.style.height = `${v.cssHeight}px`;
    this.canvas.style.left = `${v.offsetX}px`;
    this.canvas.style.top = `${v.offsetY}px`;
    this.scale = v.deviceScale;
    this.ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  /** Convert a pointer position in client pixels to logical pixels, or null outside the screen. */
  toLogical(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = ((clientX - rect.left) / rect.width) * LOGICAL_WIDTH;
    const y = ((clientY - rect.top) / rect.height) * LOGICAL_HEIGHT;
    if (x < 0 || y < 0 || x >= LOGICAL_WIDTH || y >= LOGICAL_HEIGHT) return null;
    return { x: Math.floor(x), y: Math.floor(y) };
  }
}
