import { describe, expect, it } from 'vitest';
import { terrain } from '../src/data';
import { parseMap, type MapJson } from '../src/core/map';
import { computeReach, pathTo } from '../src/core/pathfinding';
import { tileKey } from '../src/core/grid';
import type { MoveType, Point, Side } from '../src/core/types';

const LEGEND = {
  '.': 'plain', G: 'grove', h: 'hill', '^': 'crag', '~': 'river', w: 'shallows', d: 'dune', r: 'reeds', '#': 'wall',
};

const mapOf = (rows: string[]) =>
  parseMap({ id: 't', name: 't', size: [rows[0]!.length, rows.length], terrain: rows, legend: LEGEND } as MapJson, terrain);

const reach = (
  rows: string[],
  start: Point,
  moveType: MoveType,
  mov: number,
  occupants: Record<string, Side> = {},
  side: Side = 'player',
) =>
  computeReach({
    map: mapOf(rows),
    start,
    moveType,
    mov,
    side,
    occupantAt: (x, y) => occupants[`${x},${y}`] ?? null,
  });

const costAt = (r: ReturnType<typeof reach>, x: number, y: number) => r.nodes.get(tileKey(x, y))?.cost;
const canStop = (r: ReturnType<typeof reach>, x: number, y: number) => r.stops.some((p) => p.x === x && p.y === y);

describe('movement on open ground', () => {
  const open = ['.......', '.......', '.......', '.......', '.......', '.......', '.......'];

  it('reaches the Manhattan diamond', () => {
    const r = reach(open, { x: 3, y: 3 }, 'foot', 2);
    expect(r.stops).toHaveLength(13); // 1 + 4 + 8
    expect(costAt(r, 3, 3)).toBe(0);
    expect(costAt(r, 5, 3)).toBe(2);
    expect(costAt(r, 4, 4)).toBe(2);
    expect(r.nodes.has(tileKey(6, 3))).toBe(false);
  });

  it('can stay put with no movement', () => {
    const r = reach(open, { x: 3, y: 3 }, 'foot', 0);
    expect(r.stops).toEqual([{ x: 3, y: 3 }]);
  });
});

describe('terrain costs by movement type', () => {
  it('charges a foot soldier double in a grove but a skirmisher only one', () => {
    const rows = ['.G....'];
    expect(costAt(reach(rows, { x: 0, y: 0 }, 'foot', 5), 1, 0)).toBe(2);
    expect(costAt(reach(rows, { x: 0, y: 0 }, 'foot', 5), 2, 0)).toBe(3);
    expect(costAt(reach(rows, { x: 0, y: 0 }, 'light', 5), 1, 0)).toBe(1);
    expect(costAt(reach(rows, { x: 0, y: 0 }, 'mounted', 7), 1, 0)).toBe(3);
    expect(costAt(reach(rows, { x: 0, y: 0 }, 'armored', 4), 1, 0)).toBe(3);
  });

  it('never enters impassable tiles', () => {
    const rows = ['.~.', '.~.', '.~.'];
    const r = reach(rows, { x: 0, y: 1 }, 'foot', 9);
    expect(canStop(r, 2, 1)).toBe(false);
    expect(r.nodes.has(tileKey(1, 1))).toBe(false);
  });

  it('keeps mounted and armored units out of crags and armored out of shallows', () => {
    expect(canStop(reach(['.^.'], { x: 0, y: 0 }, 'mounted', 9), 1, 0)).toBe(false);
    expect(canStop(reach(['.^.'], { x: 0, y: 0 }, 'armored', 9), 1, 0)).toBe(false);
    expect(canStop(reach(['.^.'], { x: 0, y: 0 }, 'foot', 9), 1, 0)).toBe(true);
    expect(canStop(reach(['.w.'], { x: 0, y: 0 }, 'armored', 9), 1, 0)).toBe(false);
    expect(canStop(reach(['.w.'], { x: 0, y: 0 }, 'mounted', 9), 1, 0)).toBe(true);
  });

  it('respects the movement budget with mixed terrain', () => {
    const rows = ['.hGd.'];
    const r = reach(rows, { x: 0, y: 0 }, 'foot', 5);
    expect(costAt(r, 1, 0)).toBe(2); // hill
    expect(costAt(r, 2, 0)).toBe(4); // + grove
    expect(r.nodes.has(tileKey(3, 0))).toBe(false); // + dune would be 6
  });

  it('takes the cheaper way round a costly tile', () => {
    // Through the crag: (1,0) costs 4, (2,0) costs 5. Around it: 1 + 1 + 1 + 1 = 4.
    const rows = ['.^.', '...'];
    const r = reach(rows, { x: 0, y: 0 }, 'foot', 6);
    expect(costAt(r, 2, 0)).toBe(4);
    const path = pathTo(r, { x: 2, y: 0 });
    expect(path!.some((p) => p.x === 1 && p.y === 0)).toBe(false);
  });

  it('goes straight through a cheap tile when that is cheaper', () => {
    // A grove costs 2, so crossing it (2 + 1 = 3) beats the detour (4).
    const rows = ['.G.', '...'];
    const r = reach(rows, { x: 0, y: 0 }, 'foot', 6);
    expect(costAt(r, 2, 0)).toBe(3);
  });
});

describe('occupancy', () => {
  const open = ['.....', '.....', '.....'];

  it('passes through friends but cannot stop on them', () => {
    const r = reach(open, { x: 0, y: 1 }, 'foot', 3, { '1,1': 'player' });
    expect(r.nodes.has(tileKey(1, 1))).toBe(true);
    expect(canStop(r, 1, 1)).toBe(false);
    expect(canStop(r, 2, 1)).toBe(true);
    expect(costAt(r, 2, 1)).toBe(2);
  });

  it('treats allies like friends', () => {
    const r = reach(open, { x: 0, y: 1 }, 'foot', 3, { '1,1': 'ally' });
    expect(canStop(r, 2, 1)).toBe(true);
  });

  it('is blocked by enemies and must go around', () => {
    const r = reach(['...', '...', '...'], { x: 0, y: 1 }, 'foot', 4, { '1,1': 'enemy' });
    expect(r.nodes.has(tileKey(1, 1))).toBe(false);
    expect(costAt(r, 2, 1)).toBe(4); // around the enemy: up, across, across, down
  });

  it('is fully blocked in a corridor', () => {
    const r = reach(['...'], { x: 0, y: 0 }, 'foot', 9, { '1,0': 'enemy' });
    expect(canStop(r, 2, 0)).toBe(false);
    expect(r.stops).toEqual([{ x: 0, y: 0 }]);
  });

  it('lets enemies pass enemies and treats neutrals as obstacles', () => {
    const e = reach(['...'], { x: 0, y: 0 }, 'foot', 9, { '1,0': 'enemy' }, 'enemy');
    expect(canStop(e, 2, 0)).toBe(true);
    const n = reach(['...'], { x: 0, y: 0 }, 'foot', 9, { '1,0': 'neutral' }, 'player');
    expect(canStop(n, 2, 0)).toBe(false);
  });
});

describe('paths', () => {
  it('reconstructs a path whose steps match the reported cost', () => {
    const rows = ['..G..', '.h...', '...d.'];
    const map = mapOf(rows);
    const r = reach(rows, { x: 0, y: 0 }, 'foot', 7);
    const dest = { x: 4, y: 2 };
    const path = pathTo(r, dest);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 0, y: 0 });
    expect(path![path!.length - 1]).toEqual(dest);
    let total = 0;
    for (let i = 1; i < path!.length; i++) {
      const prev = path![i - 1]!;
      const cur = path![i]!;
      expect(Math.abs(prev.x - cur.x) + Math.abs(prev.y - cur.y)).toBe(1);
      total += map.costFor(cur.x, cur.y, 'foot')!;
    }
    expect(total).toBe(costAt(r, 4, 2));
  });

  it('returns null for unreachable tiles', () => {
    const r = reach(['.~.'], { x: 0, y: 0 }, 'foot', 9);
    expect(pathTo(r, { x: 2, y: 0 })).toBeNull();
  });

  it('returns a single-tile path for the start', () => {
    const r = reach(['...'], { x: 1, y: 0 }, 'foot', 2);
    expect(pathTo(r, { x: 1, y: 0 })).toEqual([{ x: 1, y: 0 }]);
  });
});
