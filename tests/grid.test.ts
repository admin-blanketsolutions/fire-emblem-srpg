import { describe, expect, it } from 'vitest';
import { keyX, keyY, manhattan, neighbors4, ring, tileKey } from '../src/core/grid';

describe('grid', () => {
  it('round-trips tile keys', () => {
    for (const [x, y] of [[0, 0], [5, 9], [4095, 4095], [12, 0]] as const) {
      const key = tileKey(x, y);
      expect([keyX(key), keyY(key)]).toEqual([x, y]);
    }
  });

  it('measures Manhattan distance', () => {
    expect(manhattan({ x: 1, y: 1 }, { x: 4, y: 5 })).toBe(7);
    expect(manhattan({ x: 3, y: 3 }, { x: 3, y: 3 })).toBe(0);
  });

  it('lists in-bounds neighbours only', () => {
    expect(neighbors4({ x: 0, y: 0 }, 5, 5)).toHaveLength(2);
    expect(neighbors4({ x: 2, y: 2 }, 5, 5)).toHaveLength(4);
    expect(neighbors4({ x: 4, y: 0 }, 5, 5)).toHaveLength(2);
  });

  it('builds attack rings', () => {
    const origin = { x: 5, y: 5 };
    expect(ring(origin, 1, 1, 11, 11)).toHaveLength(4);
    expect(ring(origin, 2, 3, 11, 11)).toHaveLength(8 + 12);
    expect(ring(origin, 0, 0, 11, 11)).toEqual([origin]);
    for (const p of ring(origin, 2, 3, 11, 11)) {
      const d = manhattan(origin, p);
      expect(d).toBeGreaterThanOrEqual(2);
      expect(d).toBeLessThanOrEqual(3);
    }
  });

  it('clips rings at the map edge', () => {
    expect(ring({ x: 0, y: 0 }, 1, 1, 5, 5)).toHaveLength(2);
    expect(ring({ x: 0, y: 0 }, 1, 2, 5, 5).every((p) => p.x >= 0 && p.y >= 0)).toBe(true);
  });
});
