import { describe, expect, it } from 'vitest';
import { isCritical, isHolding, nextUnitToAct, planUnit, playPhase } from '../src/core/ai';
import { manhattan } from '../src/core/grid';
import type { UnitInstance } from '../src/core/unit';
import { arena, battleOf, openMap, unit } from './support';

const target = (plan: ReturnType<typeof planUnit>): UnitInstance | null => (plan.action.kind === 'wait' ? null : plan.action.target);

describe('choosing a fight', () => {
  it('attacks a unit it can reach, from the nearest tile beside it', () => {
    const foe = unit({ id: 'foe', side: 'enemy', x: 0 });
    const hero = unit({ id: 'hero', x: 4 });
    const plan = planUnit(battleOf([foe, hero], openMap(15, 1)), foe);
    expect(plan.action.kind).toBe('attack');
    expect(target(plan)).toBe(hero);
    expect(plan.dest).toEqual({ x: 3, y: 0 });
  });

  it('prefers the kill to the stronger hit', () => {
    const foe = unit({ id: 'foe', side: 'enemy', x: 1, y: 1 });
    const weak = unit({ id: 'weak', x: 0, y: 1 });
    weak.hp = 1;
    const strong = unit({ id: 'strong', x: 2, y: 1 });
    expect(target(planUnit(battleOf([foe, weak, strong], arena(3, 3)), foe))).toBe(weak);
  });

  it('prefers the Lord when targets are otherwise equal', () => {
    const foe = unit({ id: 'foe', side: 'enemy', x: 1, y: 1 });
    const pawn = unit({ id: 'pawn', x: 0, y: 1 });
    const lord = unit({ id: 'lord', x: 2, y: 1, tags: ['lord'] });
    expect(target(planUnit(battleOf([foe, pawn, lord], arena(3, 3)), foe))).toBe(lord);
  });

  it('follows its own priority list when it has one', () => {
    const foe = unit({ id: 'foe', side: 'enemy', x: 1, y: 1, ai: { mode: 'priority', priority: ['archer'] } });
    const lord = unit({ id: 'lord', x: 0, y: 1, tags: ['lord'] });
    const bowman = unit({ id: 'bowman', class: 'archer', inventory: ['short-bow'], x: 2, y: 1 });
    expect(target(planUnit(battleOf([foe, lord, bowman], arena(3, 3)), foe))).toBe(bowman);
  });

  it('keeps an archer out of melee range', () => {
    const archer = unit({ id: 'archer', class: 'archer', inventory: ['composite-bow'], side: 'enemy', x: 0 });
    const hero = unit({ id: 'hero', x: 4 });
    const plan = planUnit(battleOf([archer, hero], openMap(15, 1)), archer);
    expect(plan.action.kind).toBe('attack');
    expect(manhattan(plan.dest, hero)).toBeGreaterThanOrEqual(2);
    expect(plan.dest).toEqual({ x: 1, y: 0 }); // the shortest move that is still out of the sabre's reach
  });

  it('fights from good ground when the fight is the same', () => {
    const rows = ['.....', '.G...'];
    const foe = unit({ id: 'foe', side: 'enemy', x: 3, y: 0 });
    const hero = unit({ id: 'hero', x: 1, y: 0 });
    const plan = planUnit(battleOf([foe, hero], arena(5, 2, rows)), foe);
    // beside the hero are (0,0), (2,0) and (1,1) [grove]; the grove's cover and evasion win out over a shorter walk
    expect(plan.dest).toEqual({ x: 1, y: 1 });
  });
});

describe('critical targets', () => {
  it('goes for a sure Lord kill over a bigger, sturdier kill', () => {
    const foe = unit({ id: 'foe', side: 'enemy', x: 1, y: 1 });
    foe.stats.skl = 60;
    foe.stats.mgt = 20;
    const lord = unit({ id: 'lord', x: 0, y: 1, tags: ['lord'] });
    lord.hp = 1;
    const brute = unit({ id: 'brute', class: 'axeman', x: 2, y: 1 });
    expect(target(planUnit(battleOf([foe, lord, brute], arena(3, 3)), foe))).toBe(lord);
  });

  it('treats the escorted unit and the defended unit as critical too', () => {
    const vip = unit({ id: 'vip' });
    const other = unit({ id: 'other', x: 1 });
    const escort = battleOf([vip, other], openMap(5, 1, { objective: { type: 'escort', unit: 'vip', exit: [[4, 0]] } }));
    expect([isCritical(escort, vip), isCritical(escort, other)]).toEqual([true, false]);
    const defend = battleOf([vip, other], openMap(5, 1, { objective: { type: 'defend', turns: 3, anchor: 'vip' } }));
    expect([isCritical(defend, vip), isCritical(defend, other)]).toEqual([true, false]);
    const lord = unit({ id: 'lord', tags: ['lord'] });
    expect(isCritical(battleOf([lord], arena()), lord)).toBe(true);
  });
});

describe('moving when nothing is in reach', () => {
  it('advances along the road toward the nearest target', () => {
    const foe = unit({ id: 'foe', side: 'enemy', x: 0 });
    const hero = unit({ id: 'hero', x: 14 });
    const plan = planUnit(battleOf([foe, hero], openMap(15, 1)), foe);
    expect(plan.action.kind).toBe('wait');
    expect(plan.dest).toEqual({ x: 5, y: 0 });
  });

  it('stays put when it cannot get any closer', () => {
    const foe = unit({ id: 'foe', side: 'enemy', x: 0 });
    const hero = unit({ id: 'hero', x: 4 });
    const river = openMap(5, 1);
    river.terrainAt(0, 0); // plain
    const wall = arena(5, 1, ['.~...'], { '.': 'plain', '~': 'river' });
    const plan = planUnit(battleOf([foe, hero], wall), foe);
    expect(plan.dest).toEqual({ x: 0, y: 0 });
  });

  it('a priority unit heads for its priority target even when another is as near', () => {
    const lord = unit({ id: 'lord', x: 20, tags: ['lord'] });
    const pawn = unit({ id: 'pawn', x: 0 });
    const headed = unit({ id: 'headed', side: 'enemy', x: 10, ai: { mode: 'priority', priority: ['lord'] } });
    expect(planUnit(battleOf([headed, lord, pawn], openMap(21, 1)), headed).dest.x).toBe(15);
    const plain = unit({ id: 'plain', side: 'enemy', x: 10 });
    expect(planUnit(battleOf([plain, lord, pawn], openMap(21, 1)), plain).dest.x).toBe(5); // a tie goes to the nearer tile on the left
  });

  it('a leashed unit does not stray beyond its leash', () => {
    const foe = unit({ id: 'foe', side: 'enemy', x: 5, ai: { mode: 'aggressive', leash: 3 } });
    const hero = unit({ id: 'hero', x: 14 });
    expect(planUnit(battleOf([foe, hero], openMap(15, 1)), foe).dest.x).toBe(8);
  });

  it('a leashed unit that has been drawn out heads home when there is no fight', () => {
    const foe = unit({ id: 'foe', side: 'enemy', x: 3, ai: { mode: 'aggressive', leash: 2 } });
    const hero = unit({ id: 'hero', x: 14 });
    const battle = battleOf([foe, hero], openMap(15, 1));
    foe.x = 9; // pulled well past its post at x = 3
    expect(planUnit(battle, foe).dest.x).toBe(4); // as close to the post as its move allows
  });
});

describe('modes', () => {
  it('a stationary unit shoots what is in range and never moves', () => {
    const archer = unit({ id: 'archer', class: 'archer', inventory: ['composite-bow'], side: 'enemy', x: 0, ai: { mode: 'stationary' } });
    const near = unit({ id: 'near', x: 2 });
    const battle = battleOf([archer, near], openMap(15, 1));
    const plan = planUnit(battle, archer);
    expect(plan.action.kind).toBe('attack');
    expect(plan.dest).toEqual({ x: 0, y: 0 });
    near.x = 9;
    expect(planUnit(battle, archer)).toMatchObject({ action: { kind: 'wait' }, dest: { x: 0, y: 0 } });
  });

  it('a defensive unit holds until an opponent comes close, then wakes', () => {
    const foe = unit({ id: 'foe', side: 'enemy', x: 0, ai: { mode: 'defensive', aggroRange: 1 } });
    const hero = unit({ id: 'hero', x: 10 });
    const battle = battleOf([foe, hero], openMap(15, 1));
    expect(isHolding(battle, foe)).toBe(true);
    expect(planUnit(battle, foe)).toMatchObject({ dest: { x: 0, y: 0 }, wakes: false });
    hero.x = 7; // within move 5 + range 1 + aggro 1
    expect(isHolding(battle, foe)).toBe(false);
    expect(planUnit(battle, foe)).toMatchObject({ dest: { x: 5, y: 0 }, wakes: true });
  });

  it('a defensive unit that has been hurt wakes at once, and stays awake', () => {
    const foe = unit({ id: 'foe', side: 'enemy', x: 0, ai: { mode: 'defensive' } });
    const hero = unit({ id: 'hero', x: 14 });
    const battle = battleOf([foe, hero], openMap(15, 1));
    foe.hp -= 1;
    expect(planUnit(battle, foe).wakes).toBe(true);
    battle.executePlan(planUnit(battle, foe));
    expect(foe.triggered).toBe(true);
    foe.hp = foe.stats.hp;
    expect(isHolding(battle, foe)).toBe(false);
  });

  it('a defensive unit still strikes what comes within reach of its post', () => {
    const foe = unit({ id: 'foe', side: 'enemy', x: 1, ai: { mode: 'defensive' } });
    const hero = unit({ id: 'hero', x: 2 });
    const plan = planUnit(battleOf([foe, hero], openMap(15, 1)), foe);
    expect(plan.action.kind).toBe('attack');
    expect(plan.dest).toEqual({ x: 1, y: 0 });
  });

  it('a fleeing unit makes for the exit and leaves the map when it gets there', () => {
    const map = openMap(16, 1, { exits: [[15, 0]] });
    const runner = unit({ id: 'runner', side: 'enemy', x: 8, ai: { mode: 'flee' } });
    const hero = unit({ id: 'hero', x: 0 });
    const battle = battleOf([runner, hero], map);
    expect(planUnit(battle, runner)).toMatchObject({ dest: { x: 13, y: 0 }, escape: false });
    runner.x = 13;
    const plan = planUnit(battle, runner);
    expect(plan).toMatchObject({ dest: { x: 15, y: 0 }, escape: true });
    const result = battle.executePlan(plan);
    expect(result.escaped).toBe(true);
    expect(runner).toMatchObject({ retreated: true, escaped: true });
  });

  it('a guard stays within a couple of tiles of what it guards, and comes back to it', () => {
    const vip = unit({ id: 'vip', side: 'enemy', x: 2, y: 0, ai: { mode: 'stationary' } });
    const guard = unit({ id: 'guard', side: 'enemy', x: 2, y: 4, ai: { mode: 'guard', guard: 'vip' } });
    const hero = unit({ id: 'hero', x: 14, y: 4 });
    const battle = battleOf([vip, guard, hero], arena(15, 5));
    const back = planUnit(battle, guard);
    expect(manhattan(back.dest, vip)).toBeLessThanOrEqual(2);
    expect(back.dest).not.toEqual({ x: 2, y: 4 });
    guard.y = 2;
    expect(planUnit(battle, guard).dest).toEqual({ x: 2, y: 2 }); // already close enough
  });

  it('does nothing before its turn or its flag', () => {
    const foe = unit({ id: 'foe', side: 'enemy', x: 0, ai: { mode: 'aggressive', activateOnTurn: 3 } });
    const hero = unit({ id: 'hero', x: 1 });
    const battle = battleOf([foe, hero], openMap(15, 1));
    expect(planUnit(battle, foe).action.kind).toBe('wait');
    battle.turn = 3;
    expect(planUnit(battle, foe).action.kind).toBe('attack');

    const waiting = unit({ id: 'waiting', side: 'enemy', x: 5, ai: { mode: 'aggressive', activateOnFlag: 'alarm' } });
    const b2 = battleOf([waiting, unit({ id: 'h2', x: 6 })], openMap(15, 1));
    expect(planUnit(b2, waiting).action.kind).toBe('wait');
    b2.flags.add('alarm');
    expect(planUnit(b2, waiting).action.kind).toBe('attack');
  });
});

describe('healers', () => {
  it('heals a wounded friend it can reach', () => {
    const doc = unit({ id: 'doc', class: 'healer', inventory: ['salve'], side: 'enemy', x: 0 });
    const buddy = unit({ id: 'buddy', side: 'enemy', x: 3, ai: { mode: 'stationary' } });
    buddy.hp = 5;
    const plan = planUnit(battleOf([doc, buddy, unit({ id: 'hero', x: 14 })], openMap(15, 1)), doc);
    expect(plan.action).toMatchObject({ kind: 'heal', target: buddy });
    expect(manhattan(plan.dest, buddy)).toBe(1);
  });

  it('does not waste a turn on a scratch', () => {
    const doc = unit({ id: 'doc', class: 'healer', inventory: ['salve'], side: 'enemy', x: 0 });
    const buddy = unit({ id: 'buddy', side: 'enemy', x: 3, ai: { mode: 'stationary' } });
    buddy.hp = buddy.stats.hp - 2; // below the worth-it threshold of 3
    const plan = planUnit(battleOf([doc, buddy, unit({ id: 'hero', x: 14 })], openMap(15, 1)), doc);
    expect(plan.action.kind).toBe('wait');
  });
});

describe('a side’s turn', () => {
  it('moves leaders last and otherwise follows the order the units were placed', () => {
    const boss = unit({ id: 'boss', side: 'enemy', x: 0, tags: ['boss'] });
    const first = unit({ id: 'first', side: 'enemy', x: 1 });
    const second = unit({ id: 'second', side: 'enemy', x: 2 });
    const battle = battleOf([boss, first, second, unit({ id: 'hero', x: 14 })], openMap(15, 1));
    expect(nextUnitToAct(battle, 'enemy')).toBe(first);
    first.acted = true;
    expect(nextUnitToAct(battle, 'enemy')).toBe(second);
    second.acted = true;
    expect(nextUnitToAct(battle, 'enemy')).toBe(boss);
    boss.acted = true;
    expect(nextUnitToAct(battle, 'enemy')).toBeNull();
  });

  it('never plans for a player-controlled unit', () => {
    const battle = battleOf([unit({ id: 'mine' }), unit({ id: 'foe', side: 'enemy', x: 5 })]);
    expect(nextUnitToAct(battle, 'player')).toBeNull();
  });

  it('plays every unit once, each seeing the result of the one before', () => {
    const a = unit({ id: 'a', side: 'enemy', x: 5, y: 1 });
    const b = unit({ id: 'b', side: 'enemy', x: 5, y: 2 });
    const hero = unit({ id: 'hero', x: 0, y: 1 });
    hero.stats.hp = 60;
    hero.hp = 60;
    const battle = battleOf([a, b, hero], arena(9, 3), 4);
    const results = playPhase(battle, 'enemy');
    expect(results.map((r) => r.unit.id)).toEqual(['a', 'b']);
    expect(a.acted && b.acted).toBe(true);
    expect(results.every((r) => r.fight !== null)).toBe(true); // both reach the hero, and the second finds the first beside it
    expect(new Set([a, b].map((u) => `${u.x},${u.y}`)).size).toBe(2); // they never share a tile
  });
});
