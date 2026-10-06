import type { Point } from './types';

/** Maps are at most this wide, so a tile fits in one integer key. */
export const MAX_MAP_SIZE = 4096;

export const tileKey = (x: number, y: number): number => y * MAX_MAP_SIZE + x;
export const keyX = (key: number): number => key % MAX_MAP_SIZE;
export const keyY = (key: number): number => Math.floor(key / MAX_MAP_SIZE);

export const manhattan = (a: Point, b: Point): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export const DIRS4: readonly Point[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** The in-bounds orthogonal neighbours of a tile. */
export function neighbors4(p: Point, width: number, height: number): Point[] {
  const out: Point[] = [];
  for (const d of DIRS4) {
    const x = p.x + d.x;
    const y = p.y + d.y;
    if (x >= 0 && y >= 0 && x < width && y < height) out.push({ x, y });
  }
  return out;
}

/** Every in-bounds tile whose Manhattan distance from `origin` is within [min, max]. */
export function ring(origin: Point, min: number, max: number, width: number, height: number): Point[] {
  const out: Point[] = [];
  for (let dy = -max; dy <= max; dy++) {
    const span = max - Math.abs(dy);
    for (let dx = -span; dx <= span; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist < min || dist > max) continue;
      const x = origin.x + dx;
      const y = origin.y + dy;
      if (x >= 0 && y >= 0 && x < width && y < height) out.push({ x, y });
    }
  }
  return out;
}
