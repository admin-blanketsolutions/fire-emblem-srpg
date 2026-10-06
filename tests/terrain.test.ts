import { describe, expect, it } from 'vitest';
import { terrain } from '../src/data';
import { buildTerrainTable, type TerrainDef } from '../src/core/terrain';
import { MOVE_TYPES } from '../src/core/types';

const cost = (id: string) => terrain.get(id)?.cost;

describe('terrain table', () => {
  it('defines a cost for every movement type on every tile', () => {
    expect(terrain.size).toBeGreaterThanOrEqual(19);
    for (const def of terrain.values()) {
      for (const moveType of MOVE_TYPES) {
        const c = def.cost[moveType];
        expect(c === null || (Number.isInteger(c) && c >= 1)).toBe(true);
      }
    }
  });

  it('matches the design table for the interesting tiles', () => {
    expect(cost('plain')).toEqual({ foot: 1, light: 1, mounted: 1, armored: 1 });
    expect(cost('grove')).toEqual({ foot: 2, light: 1, mounted: 3, armored: 3 });
    expect(cost('hill')).toEqual({ foot: 2, light: 2, mounted: 3, armored: 3 });
    expect(cost('crag')).toEqual({ foot: 4, light: 3, mounted: null, armored: null });
    expect(cost('dune')).toEqual({ foot: 2, light: 2, mounted: 3, armored: 4 });
    expect(cost('reeds')).toEqual({ foot: 3, light: 2, mounted: 4, armored: null });
    expect(cost('shallows')).toEqual({ foot: 3, light: 2, mounted: 3, armored: null });
    expect(cost('rampart')).toEqual({ foot: 2, light: 2, mounted: null, armored: 3 });
    expect(cost('river')).toEqual({ foot: null, light: null, mounted: null, armored: null });
    expect(cost('wall')).toEqual({ foot: null, light: null, mounted: null, armored: null });
  });

  it('carries cover, avoid and the special properties', () => {
    expect(terrain.get('grove')).toMatchObject({ cover: 1, avoid: 20 });
    expect(terrain.get('crag')).toMatchObject({ cover: 2, avoid: 30 });
    expect(terrain.get('fort')).toMatchObject({ cover: 2, avoid: 20 });
    expect(terrain.get('gate')).toMatchObject({ cover: 3, avoid: 20 });
    expect(terrain.get('reeds')).toMatchObject({ flammable: true, quench: 2 });
    expect(terrain.get('steppe')?.flammable).toBe(true);
    expect(terrain.get('hospice')?.heals).toBe(0.1);
  });

  it('rejects duplicate ids and bad costs', () => {
    const base: TerrainDef = { id: 'x', name: 'X', cost: { foot: 1, light: 1, mounted: 1, armored: 1 }, cover: 0, avoid: 0 };
    expect(() => buildTerrainTable([base, base])).toThrow(/Duplicate/);
    expect(() => buildTerrainTable([{ ...base, cost: { ...base.cost, foot: 0 } }])).toThrow(/invalid foot cost/);
    expect(() => buildTerrainTable([{ ...base, cost: { ...base.cost, foot: 1.5 } }])).toThrow(/invalid foot cost/);
    expect(() => buildTerrainTable([{ ...base, cost: { foot: 1, light: 1, mounted: 1 } as never }])).toThrow(/no cost for armored/);
  });
});
