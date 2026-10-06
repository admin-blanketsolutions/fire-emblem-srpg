export const LOGICAL_WIDTH = 240;
export const LOGICAL_HEIGHT = 160;

export interface Viewport {
  /** Device pixels per logical pixel; always a whole number, so scaling stays crisp. */
  readonly deviceScale: number;
  /** Size of the canvas backing store in device pixels. */
  readonly backingWidth: number;
  readonly backingHeight: number;
  /** Size and position of the canvas in CSS pixels. */
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/**
 * The largest integer scale that fits the window. The scale is an integer number of *device*
 * pixels, so at a device pixel ratio of 1 this is the classic `floor(min(w/240, h/160))`.
 */
export function computeViewport(windowWidth: number, windowHeight: number, devicePixelRatio = 1): Viewport {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const deviceScale = Math.max(
    1,
    Math.floor(Math.min((windowWidth * dpr) / LOGICAL_WIDTH, (windowHeight * dpr) / LOGICAL_HEIGHT)),
  );
  const backingWidth = LOGICAL_WIDTH * deviceScale;
  const backingHeight = LOGICAL_HEIGHT * deviceScale;
  const cssWidth = backingWidth / dpr;
  const cssHeight = backingHeight / dpr;
  return {
    deviceScale,
    backingWidth,
    backingHeight,
    cssWidth,
    cssHeight,
    offsetX: Math.max(0, Math.floor((windowWidth - cssWidth) / 2)),
    offsetY: Math.max(0, Math.floor((windowHeight - cssHeight) / 2)),
  };
}
