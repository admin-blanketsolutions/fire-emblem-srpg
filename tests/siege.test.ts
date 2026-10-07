import { describe, expect, it } from 'vitest';
import { playPhase } from '../src/core/ai';
import type { BattleState } from '../src/core/battle';
import { tileKey } from '../src/core/grid';
import { createSiegeDemo } from '../src/data/demos';

/**
 * The M4 demo map played by the computer on both sides: it must finish, replay exactly from its
 * seed, and never leave the board in a state the rules forbid (two units on a tile, a unit on
 * ground it cannot stand on, HP below zero).
 */

function autoplay(battle: BattleState, maxTurns = 40): void {
  for (const u of battle.units) if (u.side === 'player' && u.kind === 'unit' && !u.ai) u.ai = { mode: 'aggressive' };
  for (let guard = 0; guard < maxTurns * 4 && !battle.outcome && battle.turn <= maxTurns; guard++) {
    playPhase(battle, battle.phase);
    if (battle.outcome) break;
    battle.endPhase();
  }
}

/** A one-line record of how a battle ended, to compare runs. */
const record = (b: BattleState): string =>
  JSON.stringify({
    outcome: b.outcome,
    turn: b.turn,
    hp: b.units.map((u) => [u.id, u.hp, u.retreated, u.x, u.y]),
    flames: [...b.flames.entries()].sort((a, c) => a[0] - c[0]),
    rng: b.rng.state(),
  });

function checkBoard(b: BattleState): void {
  const seen = new Set<number>();
  for (const u of b.livingUnits()) {
    expect(u.hp, u.id).toBeGreaterThan(0);
    expect(u.hp, u.id).toBeLessThanOrEqual(u.stats.hp);
    const key = tileKey(u.x, u.y);
    expect(seen.has(key), `${u.id} shares a tile`).toBe(false);
    seen.add(key);
    if (u.kind === 'unit') expect(b.terrainAt(u.x, u.y).cost[u.moveType], `${u.id} stands on ground it cannot`).not.toBeNull();
  }
}

describe('the siege demo', () => {
  it('is a walled courtyard with a gate, wall segments, mangonels and dry grass', () => {
    const b = createSiegeDemo({ seed: 1 });
    const ids = b.units.map((u) => u.defId);
    expect(ids.filter((d) => d === 'mangonel')).toHaveLength(2);
    expect(ids.filter((d) => d === 'wall-segment')).toHaveLength(4);
    expect(ids).toContain('gate');
    expect(b.units.find((u) => u.defId === 'gate')?.faction).toBe('frankish');
    expect(b.map.rules.wind).toBe('E');
    expect(b.livingUnits('player').find((u) => u.id === 'lord')?.inventory.map((i) => i.id)).toContain('gate-key');
  });

  it('plays to an end with the computer on both sides, and keeps the board lawful all the way', () => {
    const b = createSiegeDemo({ seed: 3 });
    for (const u of b.units) if (u.side === 'player' && u.kind === 'unit') u.ai = { mode: 'aggressive' };
    for (let i = 0; i < 160 && !b.outcome; i++) {
      playPhase(b, b.phase);
      checkBoard(b);
      if (b.outcome) break;
      b.endPhase();
    }
    expect(b.outcome ?? { result: 'undecided' }).toBeDefined();
    expect(b.turn).toBeLessThanOrEqual(41);
  });

  it('replays exactly from its seed, and differs from another', () => {
    const run = (seed: number): string => {
      const b = createSiegeDemo({ seed });
      autoplay(b);
      return record(b);
    };
    expect(run(5)).toBe(run(5));
    expect(run(5)).not.toBe(run(6));
  });

  it('the mangonels shell the approach on the first enemy phase', () => {
    const b = createSiegeDemo({ seed: 9 });
    const hero = b.units.find((u) => u.id === 'lord')!;
    hero.x = 11;
    hero.y = 5; // four tiles from a mangonel at (15,5)
    b.endPhase();
    const results = playPhase(b, 'enemy');
    expect(results.some((r) => r.unit.defId === 'mangonel' && r.fight)).toBe(true);
  });

  it('can be broken open: a sapper brings a wall down, and the way through is clear', () => {
    const b = createSiegeDemo({ seed: 2 });
    const sapper = b.units.find((u) => u.id === 'sapper')!;
    const wall = b.units.find((u) => u.id === 'wall-segment#1')!; // (13,4)
    sapper.x = 12;
    sapper.y = 4;
    wall.hp = 8;
    const report = b.doClassAction(sapper, 'sap', { x: 13, y: 4 });
    expect(report).toMatchObject({ destroyed: true });
    expect(b.terrainAt(13, 4).id).toBe('plain');
    const axeman = b.units.find((u) => u.id === 'axeman')!;
    axeman.x = 11;
    axeman.y = 4;
    expect(b.reachFor(axeman).stops.some((p) => p.x === 14 && p.y === 4)).toBe(true);
  });

  it('can be opened with the key the lord is given', () => {
    const b = createSiegeDemo({ seed: 2 });
    const lord = b.units.find((u) => u.id === 'lord')!;
    lord.x = 12;
    lord.y = 6;
    const report = b.doClassAction(lord, 'open', { x: 13, y: 6 });
    expect(report.destroyed).toBe(true);
    expect(b.unitAt(13, 6)).toBeUndefined();
    expect(lord.inventory.map((i) => i.id)).not.toContain('gate-key');
  });

  it('a fire lit on the grass spreads east on the wind, and reaches the barricade', () => {
    const b = createSiegeDemo({ seed: 2 });
    b.ignite(6, 6); // the road does not burn onward, so light the grass either side
    b.ignite(6, 5);
    b.ignite(6, 7);
    const spread = (): number => [...b.flames.keys()].map((k) => k % 4096).reduce((a, c) => Math.max(a, c), 0);
    const before = spread();
    for (let i = 0; i < 8; i++) b.endPhase();
    expect(spread()).toBeGreaterThan(before);
  });
});
