import { describe, expect, it } from 'vitest';
import { expectOutcome, forecast, type Combatant, type Forecast } from '../src/core/combat';
import { distanceField } from '../src/core/pathfinding';
import { tileKey } from '../src/core/grid';
import { arena, balance, unit, weapons } from './support';

const side = (u: ReturnType<typeof unit>, terrainAt: ReturnType<typeof arena>, x: number): Combatant => {
  const stack = u.inventory[u.equipped];
  return { unit: u, weapon: stack ? (weapons.get(stack.id) ?? null) : null, usesLeft: stack?.uses ?? 0, terrain: terrainAt.terrainAt(x, 0) };
};

/** A forecast reduced to what the expectation reads. */
const fake = (order: Array<'a' | 'd'>, a: { damage: number; hit: number; crit: number } | null, d: { damage: number; hit: number; crit: number } | null): Forecast =>
  ({ order, attacker: { strike: a }, defender: { strike: d } }) as unknown as Forecast;

describe('expectOutcome', () => {
  it('reproduces the worked example: a 5.9% chance that a critical hit finishes the Soldier', () => {
    const map = arena(5, 1, ['.G...']);
    const salah = unit({ id: 'salah', class: 'young-lord', level: 3, offset: { hp: 1, mgt: 1, skl: 1, spd: 1, fort: 3 }, inventory: ['iron-sabre'] });
    const soldier = unit({ id: 's', class: 'soldier', side: 'enemy', level: 2, offset: { mgt: 1, fort: 1 }, inventory: ['levy-spear'] });
    const fc = forecast(side(salah, map, 0), side(soldier, map, 1), 1, balance);
    const e = expectOutcome(fc, 20, 18, balance);
    expect(e.pKill).toBeCloseTo(0.84 * 0.07, 6); // a hit that crits does 24, more than the Soldier's 18 HP
    expect(e.pDeath).toBe(0);
    expect(e.damageDealt).toBeCloseTo(0.84 * 0.93 * 8 + 0.84 * 0.07 * 18, 6);
    expect(e.damageTaken).toBeCloseTo((1 - 0.84 * 0.07) * 0.64 * 6, 6); // the Soldier only answers if it lives
  });

  it('is certain when every strike hits and kills, and the defender never answers', () => {
    const e = expectOutcome(fake(['a', 'd'], { damage: 10, hit: 100, crit: 0 }, { damage: 5, hit: 100, crit: 0 }), 20, 10, balance);
    expect(e).toMatchObject({ pKill: 1, pDeath: 0, damageDealt: 10, damageTaken: 0 });
  });

  it('adds up a doubled attack: two 50% hits of 8 against 16 HP kill a quarter of the time', () => {
    const e = expectOutcome(fake(['a', 'a'], { damage: 8, hit: 50, crit: 0 }, null), 20, 16, balance);
    expect(e.pKill).toBeCloseTo(0.25, 9);
    expect(e.damageDealt).toBeCloseTo(8, 9);
  });

  it('stops the sequence when the attacker falls first', () => {
    const e = expectOutcome(fake(['d', 'a'], { damage: 9, hit: 100, crit: 0 }, { damage: 9, hit: 100, crit: 0 }), 5, 20, balance);
    expect(e).toMatchObject({ pKill: 0, pDeath: 1, damageDealt: 0 });
  });

  it('treats an attacker with no strike as dealing nothing', () => {
    expect(expectOutcome(fake([], null, null), 10, 10, balance)).toEqual({ pKill: 0, pDeath: 0, damageDealt: 0, damageTaken: 0 });
  });
});

describe('distanceField', () => {
  const map = arena(5, 1, ['..G..']);
  const key = (x: number) => tileKey(x, 0);

  it('counts the cost of the tiles a walker enters, up to standing beside the nearest source', () => {
    const field = distanceField(map, 'foot', [{ x: 0, y: 0 }]);
    expect([0, 1, 2, 3, 4].map((x) => field.get(key(x)))).toEqual([0, 0, 1, 3, 4]); // the grove at x=2 costs a foot soldier 2
  });

  it('uses the movement type’s own costs', () => {
    const light = distanceField(map, 'light', [{ x: 0, y: 0 }]);
    expect([0, 1, 2, 3, 4].map((x) => light.get(key(x)))).toEqual([0, 0, 1, 2, 3]);
  });

  it('measures from the nearest of several sources', () => {
    const field = distanceField(arena(7, 1), 'foot', [{ x: 0, y: 0 }, { x: 6, y: 0 }]);
    expect([0, 1, 2, 3, 4, 5, 6].map((x) => field.get(key(x)))).toEqual([0, 0, 1, 2, 1, 0, 0]);
  });

  it('does not cross terrain the movement type cannot enter', () => {
    const river = arena(4, 1, ['.~..']);
    const field = distanceField(river, 'foot', [{ x: 0, y: 0 }]);
    expect(field.has(key(2))).toBe(false);
    expect(field.has(key(3))).toBe(false);
  });
});
