import { describe, expect, it } from 'vitest';
import { createM1Battle, m1TestMap, terrain } from '../src/data';
import { BattleState } from '../src/core/battle';
import { parseMap, type MapJson } from '../src/core/map';
import { createUnit, type UnitTemplate } from '../src/core/setup';

const sword: UnitTemplate = {
  name: 'Swordsman', className: 'Swordsman', side: 'player', level: 1, moveType: 'foot', mov: 5,
  mgt: 5, grd: 2, maxHp: 20, weapon: { name: 'Sabre', might: 5, rangeMin: 1, rangeMax: 1 },
  spriteId: 'unit.swordsman', faction: 'ayyubid', skin: 's1',
};
const archer: UnitTemplate = {
  ...sword, name: 'Archer', className: 'Archer', mgt: 4, grd: 1, maxHp: 15,
  weapon: { name: 'Bow', might: 5, rangeMin: 2, rangeMax: 3 },
};
const foe = (over: Partial<UnitTemplate> = {}): UnitTemplate => ({ ...sword, side: 'enemy', name: 'Foe', ...over });

const plain = (w = 9, h = 3) =>
  parseMap({ id: 'p', name: 'p', size: [w, h], terrain: Array(h).fill('.'.repeat(w)) as string[], legend: { '.': 'plain' } } as MapJson, terrain);

describe('the M1 battle', () => {
  it('places every unit on the proving ground', () => {
    const battle = createM1Battle();
    expect(battle.units).toHaveLength(11);
    expect(battle.livingUnits('player')).toHaveLength(6);
    expect(battle.livingUnits('enemy')).toHaveLength(5);
    const ids = battle.units.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('soldier#1');
    expect(ids).toContain('soldier#2');
    expect(battle.turn).toBe(1);
    expect(battle.phase).toBe('player');
  });

  it('never starts a unit on terrain it cannot enter', () => {
    const battle = createM1Battle();
    for (const u of battle.units) {
      expect(m1TestMap.costFor(u.x, u.y, u.moveType)).not.toBeNull();
    }
  });

  it('keeps armour out of the ford but lets cavalry through', () => {
    const battle = createM1Battle();
    const horseman = battle.units.find((u) => u.id === 'horseman')!;
    horseman.x = 8;
    horseman.y = 9;
    const reach = battle.reachFor(horseman);
    expect(reach.stops.some((p) => p.x === 10 && p.y === 9)).toBe(true); // shallows, cost 3 for mounted
    const armour = battle.units.find((u) => u.id === 'man-at-arms')!;
    armour.x = 12;
    armour.y = 9;
    expect(battle.reachFor(armour).stops.some((p) => p.x === 10 && p.y === 9)).toBe(false);
  });
});

describe('moving and waiting', () => {
  it('moves along the cheapest path and marks the unit moved', () => {
    const battle = new BattleState(plain(), [createUnit('a', sword, 0, 1)]);
    const unit = battle.units[0]!;
    const reach = battle.reachFor(unit);
    const path = battle.moveUnit(unit, { x: 3, y: 1 }, reach);
    expect(path).toEqual([{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }]);
    expect([unit.x, unit.y]).toEqual([3, 1]);
    expect(unit.moved).toBe(true);
    expect(unit.acted).toBe(false);
  });

  it('refuses to move beyond reach or onto an occupied tile', () => {
    const battle = new BattleState(plain(), [createUnit('a', sword, 0, 1), createUnit('b', sword, 2, 1)]);
    const unit = battle.units[0]!;
    const reach = battle.reachFor(unit);
    expect(battle.moveUnit(unit, { x: 8, y: 1 }, reach)).toBeNull();
    expect(battle.moveUnit(unit, { x: 2, y: 1 }, reach)).toBeNull();
    expect(unit.x).toBe(0);
    expect(unit.moved).toBe(false);
  });

  it('waiting spends the unit', () => {
    const battle = new BattleState(plain(), [createUnit('a', sword, 0, 0)]);
    battle.wait(battle.units[0]!);
    expect(battle.units[0]).toMatchObject({ moved: true, acted: true });
    expect(battle.isSideSpent('player')).toBe(true);
  });
});

describe('attack ranges', () => {
  it('finds hostile targets in melee and bow range only', () => {
    const battle = new BattleState(plain(), [
      createUnit('a', archer, 0, 1),
      createUnit('adjacent', foe(), 1, 1),
      createUnit('far', foe(), 3, 1),
      createUnit('toofar', foe(), 5, 1),
      createUnit('friend', sword, 2, 1),
    ]);
    const a = battle.units[0]!;
    const ids = battle.targetsFrom(a, { x: 0, y: 1 }).map((u) => u.id).sort();
    expect(ids).toEqual(['far']); // bow range 2-3: not the adjacent foe, not the friend, not too far
  });

  it('units without a weapon have no targets', () => {
    const healer = createUnit('h', { ...sword, weapon: null }, 0, 0);
    const battle = new BattleState(plain(), [healer, createUnit('e', foe(), 1, 0)]);
    expect(battle.targetsFrom(healer, { x: 0, y: 0 })).toEqual([]);
    expect(battle.threatTiles(healer, battle.reachFor(healer))).toEqual([]);
  });

  it('shows threat tiles beyond the move range', () => {
    const battle = new BattleState(plain(), [createUnit('a', sword, 0, 1)]);
    const a = battle.units[0]!;
    const threat = battle.threatTiles(a, battle.reachFor(a));
    expect(threat.some((p) => p.x === 6 && p.y === 1)).toBe(true); // move 5 + range 1
    expect(threat.some((p) => p.x === 7 && p.y === 1)).toBe(false);
  });
});

describe('the basic attack', () => {
  it('deals might + weapon - guard - cover, and takes a counter', () => {
    const battle = new BattleState(plain(), [createUnit('a', sword, 0, 1), createUnit('e', foe(), 1, 1)]);
    const [a, e] = battle.units as [typeof battle.units[number], typeof battle.units[number]];
    const report = battle.attack(a, e);
    expect(report.damage).toBe(5 + 5 - 2); // 8
    expect(report.counterDamage).toBe(8);
    expect(e.hp).toBe(12);
    expect(a.hp).toBe(12);
    expect(a.acted).toBe(true);
  });

  it('adds terrain cover to the defender', () => {
    const grove = parseMap({ id: 'g', name: 'g', size: [3, 1], terrain: ['.G.'], legend: { '.': 'plain', G: 'grove' } } as MapJson, terrain);
    const battle = new BattleState(grove, [createUnit('a', sword, 0, 0), createUnit('e', foe(), 1, 0)]);
    const report = battle.attack(battle.units[0]!, battle.units[1]!);
    expect(report.damage).toBe(5 + 5 - 2 - 1); // grove cover 1
  });

  it('does not counter when the defender cannot reach', () => {
    const battle = new BattleState(plain(), [createUnit('a', archer, 0, 1), createUnit('e', foe(), 2, 1)]);
    const report = battle.attack(battle.units[0]!, battle.units[1]!);
    expect(report.damage).toBeGreaterThan(0);
    expect(report.counterDamage).toBeNull();
    expect(battle.units[0]!.hp).toBe(15);
  });

  it('retreats a defeated defender wounded and removes it from the board', () => {
    const battle = new BattleState(plain(), [createUnit('a', sword, 0, 1), createUnit('e', foe({ maxHp: 5 }), 1, 1)]);
    const [a, e] = battle.units as [typeof battle.units[number], typeof battle.units[number]];
    const report = battle.attack(a, e);
    expect(report.defeated).toEqual([e]);
    expect(report.counterDamage).toBeNull();
    expect(e.retreated).toBe(true);
    expect(battle.unitAt(1, 1)).toBeUndefined();
    expect(battle.livingUnits('enemy')).toHaveLength(0);
  });

  it('can retreat the attacker on a lethal counter', () => {
    const battle = new BattleState(plain(), [createUnit('a', sword, 0, 1), createUnit('e', foe({ mgt: 20 }), 1, 1)]);
    battle.units[0]!.hp = 3;
    const report = battle.attack(battle.units[0]!, battle.units[1]!);
    expect(report.defeated.map((u) => u.id)).toEqual(['a']);
    expect(battle.units[0]!.retreated).toBe(true);
  });
});

describe('phases', () => {
  it('runs player phase, enemy phase, then the next turn with everyone ready', () => {
    const battle = new BattleState(plain(), [createUnit('a', sword, 0, 0), createUnit('e', foe(), 5, 0)]);
    battle.wait(battle.units[0]!);
    battle.endPlayerPhase();
    expect(battle.phase).toBe('enemy');
    battle.endEnemyPhase();
    expect(battle.phase).toBe('player');
    expect(battle.turn).toBe(2);
    expect(battle.units.every((u) => !u.moved && !u.acted)).toBe(true);
  });
});
