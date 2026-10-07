import { describe, expect, it } from 'vitest';
import { aiOrder, expectedExchange, hitChance, planUnit, scoreOptions, validateAiWeights } from '../src/core/ai';
import type { AiProfile } from '../src/core/aiProfile';
import type { BattleState } from '../src/core/battle';
import { manhattan, tileKey } from '../src/core/grid';
import { createTestBattle } from '../src/data';
import aiJson from '../src/data/ai.json';
import { arena, battleOf, unit, type UnitSpec } from './support';

/** An enemy unit played by the computer. */
function foe(spec: UnitSpec, ai: AiProfile = { mode: 'aggressive' }) {
  const u = unit({ side: 'enemy', ...spec });
  u.ai = ai;
  return u;
}

const wide = () => arena(20, 3);
const targetOf = (battle: BattleState, id: string) => {
  const plan = planUnit(battle, battle.units.find((u) => u.id === id)!);
  return plan.action.kind === 'attack' || plan.action.kind === 'heal' ? plan.action.target.id : null;
};

describe('hit chances and expected exchanges', () => {
  it('reads honest rates directly and weighted rates as the average of two rolls', () => {
    expect(hitChance(75, 'honest')).toBe(0.75);
    expect(hitChance(0, 'weighted')).toBe(0);
    expect(hitChance(100, 'weighted')).toBe(1);
    expect(hitChance(50, 'weighted')).toBeCloseTo(0.505, 6);
    expect(hitChance(90, 'weighted')).toBeGreaterThan(0.9);
    expect(hitChance(20, 'weighted')).toBeLessThan(0.2);
  });

  it('gives the kill chance of a single lethal strike as its hit chance', () => {
    const e = foe({ id: 'e', x: 3, y: 1 });
    const p = unit({ id: 'p', x: 4, y: 1 });
    p.hp = 1;
    const battle = battleOf([e, p]);
    const fc = battle.forecastFor(e, p)!;
    const ex = expectedExchange(fc, 'honest', battle.tables.balance.critMultiplier);
    expect(ex.pKill).toBeCloseTo(fc.attacker.strike!.hit / 100, 9);
    expect(ex.dealt).toBeCloseTo(ex.pKill, 9); // 1 HP lost exactly when it lands
    expect(ex.taken).toBeGreaterThan(0); // a miss lets the defender counter
  });
});

describe('choosing a target (DESIGN §10.2)', () => {
  it('prefers a kill over more damage elsewhere', () => {
    const e = foe({ id: 'e', x: 4, y: 1 });
    const weak = unit({ id: 'b', x: 7, y: 1 });
    weak.hp = 1;
    const strong = unit({ id: 'a', x: 1, y: 1 });
    expect(targetOf(battleOf([e, weak, strong]), 'e')).toBe('b');
  });

  it('goes for the Lord when the targets are otherwise equal', () => {
    const e = foe({ id: 'e', x: 4, y: 1 });
    const a = unit({ id: 'a', x: 2, y: 1 });
    const lord = unit({ id: 'b', x: 6, y: 1 });
    expect(targetOf(battleOf([e, a, lord]), 'e')).toBe('a'); // the tie-break: lower id
    lord.tags.push('lord');
    expect(targetOf(battleOf([e, a, lord]), 'e')).toBe('b');
  });

  it('follows an explicit priority list', () => {
    const e = foe({ id: 'e', x: 4, y: 1 }, { mode: 'priority', priority: ['healer'] });
    const a = unit({ id: 'a', x: 2, y: 1 });
    const medic = unit({ id: 'b', class: 'healer', inventory: ['salve', 'knife'], x: 6, y: 1 });
    expect(targetOf(battleOf([e, a, medic]), 'e')).toBe('b');
  });

  it('avoids a target that can strike back', () => {
    const e = foe({ id: 'e', x: 4, y: 1 });
    const armed = unit({ id: 'a', x: 2, y: 1 });
    const unarmed = unit({ id: 'b', inventory: [], x: 6, y: 1 });
    expect(targetOf(battleOf([e, armed, unarmed]), 'e')).toBe('b');
  });

  it('weighs the counter more heavily with avoidCounter', () => {
    const e = foe({ id: 'e', x: 4, y: 1 });
    const p = unit({ id: 'p', x: 6, y: 1 });
    const battle = battleOf([e, p]);
    const reach = battle.reachFor(e);
    const normal = scoreOptions(battle, e, { mode: 'aggressive' }, [{ x: 5, y: 1 }], reach)[0]!;
    const cautious = scoreOptions(battle, e, { mode: 'aggressive', avoidCounter: true }, [{ x: 5, y: 1 }], reach)[0]!;
    const fc = battle.forecastFor(e, p, { from: { x: 5, y: 1 } })!;
    const { taken } = expectedExchange(fc, 'honest', battle.tables.balance.critMultiplier);
    expect(taken).toBeGreaterThan(0);
    expect(normal.score - cautious.score).toBeCloseTo((aiJson.counterCautious - aiJson.counter) * taken, 9);
  });

  it('attacks from cover when it can', () => {
    const e = foe({ id: 'e', x: 2, y: 1 });
    const p = unit({ id: 'p', x: 5, y: 1 });
    const map = arena(9, 3, ['.....G...', '.........', '.........']);
    expect(planUnit(battleOf([e, p], map), e)).toMatchObject({ to: { x: 5, y: 0 }, action: { kind: 'attack', target: p } });
  });

  it('counts each opponent that could strike the tile against it', () => {
    const e = foe({ id: 'e', x: 11, y: 1 });
    const p = unit({ id: 'p', x: 8, y: 1 });
    const q = unit({ id: 'q', x: 2, y: 1 }); // reaches (7,1) but not (9,1)
    const battle = battleOf([e, p, q], wide());
    const options = scoreOptions(battle, e, { mode: 'aggressive' }, [{ x: 7, y: 1 }, { x: 9, y: 1 }], battle.reachFor(e));
    const west = options.find((o) => o.to.x === 7)!;
    const east = options.find((o) => o.to.x === 9)!;
    expect([west.exposure, east.exposure]).toEqual([2, 1]);
    expect(east.score - west.score).toBeCloseTo(aiJson.exposure, 9);
    expect(options[0]).toBe(east);
  });

  it('heals a wounded friend', () => {
    const medic = foe({ id: 'm', class: 'healer', inventory: ['salve'], x: 4, y: 1 });
    const hurt = foe({ id: 'h', class: 'soldier', inventory: ['levy-spear'], x: 7, y: 1 });
    hurt.hp = 5;
    const p = unit({ id: 'p', x: 0, y: 0 });
    const battle = battleOf([medic, hurt, p]);
    const turn = battle.actAi(medic);
    expect(turn.outcome.kind).toBe('heal');
    expect(manhattan(medic, hurt)).toBe(1);
    expect(hurt.hp).toBe(13);
  });
});

describe('modes (DESIGN §10.3)', () => {
  it('aggressive: advances on the nearest opponent when none is in reach', () => {
    const e = foe({ id: 'e', x: 15, y: 1 });
    const p = unit({ id: 'p', x: 2, y: 1 });
    const plan = planUnit(battleOf([e, p], wide()), e);
    expect(plan.action.kind).toBe('wait');
    expect(plan.to).toEqual({ x: 10, y: 1 });
  });

  it('priority: advances on the best-ranked target, not the nearest', () => {
    const e = foe({ id: 'e', x: 10, y: 1 }, { mode: 'priority', priority: ['healer'] });
    const near = unit({ id: 'a', x: 2, y: 1 });
    const medic = unit({ id: 'b', class: 'healer', inventory: ['salve', 'knife'], x: 19, y: 1 });
    const plan = planUnit(battleOf([e, near, medic], wide()), e);
    expect(plan.to.x).toBeGreaterThan(10);
  });

  it('stationary: never moves, but strikes what is in range', () => {
    const e = foe({ id: 'e', x: 4, y: 1 }, { mode: 'stationary' });
    const p = unit({ id: 'p', x: 7, y: 1 });
    const battle = battleOf([e, p]);
    expect(planUnit(battle, e)).toMatchObject({ to: { x: 4, y: 1 }, action: { kind: 'wait' } });
    p.x = 5;
    expect(planUnit(battle, e)).toMatchObject({ to: { x: 4, y: 1 }, action: { kind: 'attack', target: p } });
  });

  it('defensive: holds until an opponent comes within range, then stays awake', () => {
    const e = foe({ id: 'e', x: 15, y: 1 }, { mode: 'defensive' });
    const p = unit({ id: 'p', x: 2, y: 1 });
    const battle = battleOf([e, p], wide());
    expect(planUnit(battle, e)).toMatchObject({ to: { x: 15, y: 1 }, action: { kind: 'wait' }, wakes: false });

    p.x = 10; // within move 5 + range 1
    const woken = battle.planAi(e);
    expect(woken).toMatchObject({ wakes: true, action: { kind: 'attack', target: p } });
    expect(e.triggered).toBe(true);

    p.x = 2; // out of range again: an awake unit keeps coming
    expect(planUnit(battle, e).to).toEqual({ x: 10, y: 1 });
  });

  it('defensive: aggroRange widens the trigger', () => {
    const p = unit({ id: 'p', x: 2, y: 1 });
    const e = foe({ id: 'e', x: 15, y: 1 }, { mode: 'defensive', aggroRange: 6 });
    expect(planUnit(battleOf([e, p], wide()), e).wakes).toBe(false); // its threat ends at x = 9
    e.ai = { mode: 'defensive', aggroRange: 7 };
    expect(planUnit(battleOf([e, p], wide()), e)).toMatchObject({ wakes: true, to: { x: 10, y: 1 } });
  });

  it('guard: stays within reach of its post', () => {
    const e = foe({ id: 'e', x: 10, y: 1 }, { mode: 'guard', guard: [10, 1] as unknown as string });
    const p = unit({ id: 'p', x: 5, y: 1 });
    const battle = battleOf([e, p], wide());
    expect(planUnit(battle, e)).toMatchObject({ to: { x: 10, y: 1 }, action: { kind: 'wait' } }); // the attack tile is 4 from the post
    p.x = 7;
    const plan = planUnit(battle, e);
    expect(plan.action).toMatchObject({ kind: 'attack', target: p });
    expect(manhattan(plan.to, { x: 10, y: 1 })).toBeLessThanOrEqual(2);
  });

  it('guard: walks back towards a unit it guards', () => {
    const ward = foe({ id: 'chief', x: 10, y: 1 }, { mode: 'stationary' });
    const e = foe({ id: 'e', x: 2, y: 1 }, { mode: 'guard', guard: 'chief' });
    const p = unit({ id: 'p', x: 19, y: 0 });
    expect(planUnit(battleOf([e, ward, p], wide()), e).to).toEqual({ x: 7, y: 1 });
  });

  it('leash: will not stray further than the leash from its post', () => {
    const e = foe({ id: 'e', x: 10, y: 1 }, { mode: 'aggressive', leash: 2 });
    const p = unit({ id: 'p', x: 4, y: 1 });
    const plan = planUnit(battleOf([e, p], wide()), e);
    expect(plan.action.kind).toBe('wait');
    expect(plan.to).toEqual({ x: 8, y: 1 });
  });

  it('flee: heads for the exit and leaves the map there', () => {
    const e = foe({ id: 'e', x: 10, y: 1 }, { mode: 'flee' });
    const p = unit({ id: 'p', x: 9, y: 1 });
    const battle = battleOf([e, p], wide());
    battle.exits = [{ x: 19, y: 1 }];
    const first = planUnit(battle, e);
    expect(first.action.kind).toBe('wait');
    expect(manhattan(first.to, { x: 19, y: 1 })).toBe(4); // a full move along a shortest path
    battle.actAi(e);
    battle.endPlayerPhase();
    battle.endEnemyPhase();
    const turn = battle.actAi(e);
    expect(turn.outcome.kind).toBe('escape');
    expect(e).toMatchObject({ x: 19, y: 1, escaped: true, retreated: true });
  });

  it('flee: without an exit, puts distance between itself and its foes', () => {
    const e = foe({ id: 'e', x: 10, y: 1 }, { mode: 'flee' });
    const p = unit({ id: 'p', x: 5, y: 1 });
    const plan = planUnit(battleOf([e, p], wide()), e);
    expect(manhattan(plan.to, p)).toBe(10);
  });

  it('waits for its turn or its flag before doing anything', () => {
    const e = foe({ id: 'e', x: 4, y: 1 }, { mode: 'aggressive', activateOnTurn: 3 });
    const p = unit({ id: 'p', x: 5, y: 1 });
    const battle = battleOf([e, p]);
    expect(planUnit(battle, e).action.kind).toBe('wait');
    battle.turn = 3;
    expect(planUnit(battle, e).action.kind).toBe('attack');

    e.ai = { mode: 'aggressive', activateOnFlag: 'alarm' };
    expect(battle.planAi(e).action.kind).toBe('wait');
    battle.flags.add('alarm');
    expect(battle.planAi(e).action.kind).toBe('attack');
  });
});

describe('order and determinism', () => {
  it('moves leaders last, keeping the listed order otherwise', () => {
    const a = foe({ id: 'a' });
    const boss = foe({ id: 'boss', boss: true });
    const b = foe({ id: 'b' });
    const captain = foe({ id: 'captain' });
    captain.tags.push('leader');
    expect(aiOrder([boss, a, captain, b]).map((u) => u.id)).toEqual(['a', 'b', 'boss', 'captain']);
  });

  it('plans the same way every time', () => {
    const e = foe({ id: 'e', x: 4, y: 1 });
    const a = unit({ id: 'a', x: 2, y: 1 });
    const b = unit({ id: 'b', x: 6, y: 1 });
    const battle = battleOf([e, a, b]);
    const first = planUnit(battle, e);
    for (let i = 0; i < 3; i++) expect(planUnit(battle, e)).toEqual(first);
  });

  it('plays the proving ground identically from the same seed', () => {
    const play = () => {
      const battle = createTestBattle({ seed: 7 });
      const log: string[] = [];
      for (let turn = 0; turn < 4; turn++) {
        battle.endPlayerPhase();
        for (const t of battle.runAiPhase('enemy')) {
          const target = t.plan.action.kind === 'attack' || t.plan.action.kind === 'heal' ? t.plan.action.target.id : '-';
          log.push(`${t.plan.unit.id}>${t.plan.to.x},${t.plan.to.y}:${t.outcome.kind}:${target}`);
        }
        battle.endEnemyPhase();
      }
      return { log, hp: battle.units.map((u) => u.hp) };
    };
    const a = play();
    expect(a.log.some((l) => l.includes(':fight:'))).toBe(true);
    expect(play()).toEqual(a);
  });

  it('runs a whole enemy phase without stacking units or leaving one unspent', () => {
    const battle = createTestBattle();
    battle.endPlayerPhase();
    const lord = battle.units.find((u) => u.id === 'lord')!;
    const before = battle.livingUnits('enemy').map((u) => ({ u, d: manhattan(u, lord) }));
    const turns = battle.runAiPhase('enemy');
    expect(turns).toHaveLength(5);
    expect(battle.isSideSpent('enemy')).toBe(true);
    const tiles = battle.livingUnits().map((u) => tileKey(u.x, u.y));
    expect(new Set(tiles).size).toBe(tiles.length);
    for (const { u, d } of before) expect(manhattan(u, lord), u.id).toBeLessThan(d);
  });
});

describe('weights', () => {
  it('validates the weights file', () => {
    expect(validateAiWeights(aiJson)).toEqual(aiJson);
    expect(() => validateAiWeights({ ...aiJson, kill: undefined })).toThrow(/ai\.kill/);
    expect(() => validateAiWeights({ ...aiJson, exposure: -1 })).toThrow(/ai\.exposure/);
  });
});
