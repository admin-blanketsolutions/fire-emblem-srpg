export interface CameraPos {
  readonly x: number;
  readonly y: number;
}

/** Keep the view inside the map; a map smaller than the view is centred (a negative offset). */
export function clampCamera(
  x: number,
  y: number,
  mapPxWidth: number,
  mapPxHeight: number,
  viewWidth: number,
  viewHeight: number,
): CameraPos {
  const fit = (pos: number, map: number, view: number): number =>
    map <= view ? -Math.floor((view - map) / 2) : Math.min(Math.max(pos, 0), map - view);
  return { x: fit(x, mapPxWidth, viewWidth), y: fit(y, mapPxHeight, viewHeight) };
}

/**
 * The smallest camera move that brings a tile (plus a margin of tiles) into view. Returns the
 * same camera if the tile is already comfortably visible.
 */
export function cameraToInclude(
  cam: CameraPos,
  tileX: number,
  tileY: number,
  tileSize: number,
  marginTiles: number,
  mapPxWidth: number,
  mapPxHeight: number,
  viewWidth: number,
  viewHeight: number,
): CameraPos {
  const margin = marginTiles * tileSize;
  const adjust = (cur: number, tilePos: number, view: number): number => {
    const lo = tilePos * tileSize - margin;
    const hi = (tilePos + 1) * tileSize + margin - view;
    if (cur > lo) return lo;
    if (cur < hi) return hi;
    return cur;
  };
  return clampCamera(adjust(cam.x, tileX, viewWidth), adjust(cam.y, tileY, viewHeight), mapPxWidth, mapPxHeight, viewWidth, viewHeight);
}
