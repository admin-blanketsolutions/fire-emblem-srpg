import { describe, expect, it } from 'vitest';
import { m1TestMap, terrain } from '../src/data';
import { parseMap, type MapJson } from '../src/core/map';

const tiny = (over: Partial<MapJson> = {}): MapJson => ({
  id: 'tiny',
  name: 'Tiny',
  size: [3, 2],
  terrain: ['.G.', '~~.'],
  legend: { '.': 'plain', G: 'grove', '~': 'river' },
  ...over,
});

describe('map parsing', () => {
  it('parses the M1 test map', () => {
    expect(m1TestMap.width).toBe(22);
    expect(m1TestMap.height).toBe(16);
    expect(m1TestMap.terrainAt(10, 7).id).toBe('bridge');
    expect(m1TestMap.terrainAt(10, 9).id).toBe('shallows');
    expect(m1TestMap.terrainAt(15, 7).id).toBe('gate');
    expect(m1TestMap.costFor(10, 6, 'foot')).toBeNull();
  });

  it('places the spawns inside the map', () => {
    for (const list of Object.values(m1TestMap.spawns)) {
      for (const s of list ?? []) {
        expect(m1TestMap.inBounds(s.at[0], s.at[1])).toBe(true);
        expect(m1TestMap.terrainAt(s.at[0], s.at[1]).cost.foot).not.toBeNull();
      }
    }
  });

  it('reads costs per movement type', () => {
    const map = parseMap(tiny(), terrain);
    expect(map.costFor(1, 0, 'foot')).toBe(2);
    expect(map.costFor(1, 0, 'light')).toBe(1);
    expect(map.costFor(1, 0, 'mounted')).toBe(3);
    expect(map.costFor(0, 1, 'foot')).toBeNull();
  });

  it('throws outside the map', () => {
    const map = parseMap(tiny(), terrain);
    expect(() => map.terrainAt(3, 0)).toThrow(RangeError);
    expect(() => map.terrainAt(0, -1)).toThrow(RangeError);
    expect(map.inBounds(2, 1)).toBe(true);
    expect(map.inBounds(2, 2)).toBe(false);
  });

  it('rejects malformed maps with a descriptive error', () => {
    expect(() => parseMap(tiny({ size: [3, 3] }), terrain)).toThrow(/3 rows/);
    expect(() => parseMap(tiny({ terrain: ['.G', '~~.'] }), terrain)).toThrow(/row 0 has 2 tiles/);
    expect(() => parseMap(tiny({ terrain: ['.X.', '~~.'] }), terrain)).toThrow(/no legend entry for "X"/);
    expect(() => parseMap(tiny({ legend: { '.': 'plain', G: 'moonbase', '~': 'river' } }), terrain)).toThrow(/unknown terrain "moonbase"/);
    expect(() => parseMap(tiny({ legend: { '..': 'plain', G: 'grove', '~': 'river' } }), terrain)).toThrow(/one character/);
    expect(() => parseMap(tiny({ size: [0, 2] }), terrain)).toThrow(/invalid size/);
    expect(() =>
      parseMap(tiny({ spawns: { player: [{ unit: 'u', at: [5, 0] }] } }), terrain),
    ).toThrow(/outside the map/);
  });
});
