import { describe, expect, it } from 'vitest';
import { dangerZone, threatOf } from '../src/core/danger';
import { tileKey } from '../src/core/grid';
import { battleOf, openMap, unit } from './support';

const keys = (xs: number[], y = 0): number[] => xs.map((x) => tileKey(x, y)).sort((a, b) => a - b);
const sorted = (s: Set<number>): number[] => [...s].sort((a, b) => a - b);

describe('the danger zone', () => {
  it('covers where an aggressive unit can move and strike', () => {
    const foe = unit({ id: 'foe', side: 'enemy', x: 10 });
    const battle = battleOf([foe, unit({ id: 'p', x: 0 })], openMap(15, 1));
    const { active, latent } = dangerZone(battle);
    expect(sorted(active)).toEqual(keys([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])); // move 5, then range 1: x from 4 to 14
    expect(latent.size).toBe(0);
  });

  it('is the unit’s range from its own tile when it never moves', () => {
    const archer = unit({ id: 'a', class: 'archer', inventory: ['composite-bow'], side: 'enemy', x: 7, ai: { mode: 'stationary' } });
    const battle = battleOf([archer, unit({ id: 'p', x: 0 })], openMap(15, 1));
    expect(sorted(dangerZone(battle).active)).toEqual(keys([4, 5, 9, 10])); // a bow's range 2 to 3 on either side
  });

  it('shows a sleeping defensive unit’s post as active and its wider reach as latent', () => {
    const foe = unit({ id: 'foe', side: 'enemy', x: 7, ai: { mode: 'defensive' } });
    const battle = battleOf([foe, unit({ id: 'p', x: 0, y: 0 })], openMap(15, 1));
    const threat = threatOf(battle, foe);
    expect(sorted(threat.active)).toEqual(keys([6, 8]));
    expect(threat.latent.has(tileKey(2, 0))).toBe(true); // it would reach this if it woke
    expect([...threat.latent].some((k) => threat.active.has(k))).toBe(false);
    const zone = dangerZone(battle);
    expect([...zone.latent].some((k) => zone.active.has(k))).toBe(false);
  });

  it('turns a woken unit’s whole reach active', () => {
    const foe = unit({ id: 'foe', side: 'enemy', x: 7, ai: { mode: 'defensive' } });
    foe.triggered = true;
    const battle = battleOf([foe, unit({ id: 'p', x: 0 })], openMap(15, 1));
    const threat = threatOf(battle, foe);
    expect(threat.active.has(tileKey(2, 0))).toBe(true);
    expect(threat.latent.size).toBe(0);
  });

  it('keeps a unit that is not yet active in the latent area', () => {
    const foe = unit({ id: 'foe', side: 'enemy', x: 10, ai: { mode: 'aggressive', activateOnTurn: 4 } });
    const battle = battleOf([foe, unit({ id: 'p', x: 0 })], openMap(15, 1));
    const zone = dangerZone(battle);
    expect(zone.active.size).toBe(0);
    expect(zone.latent.has(tileKey(10, 0))).toBe(true);
  });

  it('leaves out enemies the player cannot see', () => {
    const foe = unit({ id: 'foe', side: 'enemy', x: 13 });
    const battle = battleOf([foe, unit({ id: 'p', x: 0 })], openMap(15, 1, { fog: true }));
    expect(dangerZone(battle).active.size).toBe(0);
    foe.x = 3;
    battle.updateVisibility();
    expect(dangerZone(battle).active.size).toBeGreaterThan(0);
  });

  it('is measured from the viewer’s side: the enemy’s view is of the player’s units', () => {
    const battle = battleOf([unit({ id: 'p', x: 0 }), unit({ id: 'foe', side: 'enemy', x: 14 })], openMap(15, 1));
    const zone = dangerZone(battle, 'enemy');
    expect(zone.active.has(tileKey(5, 0))).toBe(true);
    expect(zone.active.has(tileKey(10, 0))).toBe(false);
  });
});
