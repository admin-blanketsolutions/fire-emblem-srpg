import { describe, expect, it } from 'vitest';
import { createTestBattle, testMap } from '../src/data';
import { arena, battleOf, scripted, unit } from './support';

describe('the proving ground', () => {
  it('places every unit', () => {
    const battle = createTestBattle();
    expect(battle.units).toHaveLength(12);
    expect(battle.livingUnits('player')).toHaveLength(7);
    expect(battle.livingUnits('enemy')).toHaveLength(5);
    const ids = battle.units.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('soldier#1');
    expect(ids).toContain('soldier#2');
    expect(battle.turn).toBe(1);
    expect(battle.phase).toBe('player');
  });

  it('never starts a unit on terrain it cannot enter', () => {
    for (const u of createTestBattle().units) expect(testMap.costFor(u.x, u.y, u.moveType), u.id).not.toBeNull();
  });

  it('gives every unit a weapon it can wield', () => {
    const battle = createTestBattle();
    for (const u of battle.units) expect(battle.weaponOf(u), u.id).not.toBeNull();
  });

  it('keeps armour out of the ford but lets cavalry through', () => {
    const battle = createTestBattle();
    const horseman = battle.units.find((u) => u.id === 'horseman')!;
    horseman.x = 8;
    horseman.y = 9;
    expect(battle.reachFor(horseman).stops.some((p) => p.x === 10 && p.y === 9)).toBe(true); // shallows, cost 3 for mounted
    const armour = battle.units.find((u) => u.id === 'enemy-pikeman')!;
    armour.moveType = 'armored';
    armour.x = 12;
    armour.y = 9;
    expect(battle.reachFor(armour).stops.some((p) => p.x === 10 && p.y === 9)).toBe(false);
  });

  it('is reproducible: the same seed gives the same fight', () => {
    const play = () => {
      const battle = createTestBattle({ seed: 99 });
      const lord = battle.units.find((u) => u.id === 'lord')!;
      const foe = battle.units.find((u) => u.id === 'soldier#1')!;
      lord.x = 13;
      lord.y = 6;
      return battle.fight(lord, foe).events;
    };
    expect(play()).toEqual(play());
  });
});

describe('moving and waiting', () => {
  it('moves along the cheapest path and marks the unit moved', () => {
    const battle = battleOf([unit({ x: 0, y: 1 })]);
    const u = battle.units[0]!;
    const path = battle.moveUnit(u, { x: 3, y: 1 }, battle.reachFor(u));
    expect(path).toEqual([{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }]);
    expect([u.x, u.y]).toEqual([3, 1]);
    expect(u.moved).toBe(true);
    expect(u.acted).toBe(false);
  });

  it('uses the unit’s own Move stat and movement type', () => {
    const battle = battleOf([unit({ class: 'horseman', x: 0, y: 1 })], arena(12, 3));
    const u = battle.units[0]!;
    expect(u.stats.mov).toBe(7);
    expect(battle.reachFor(u).stops.some((p) => p.x === 7)).toBe(true);
    expect(battle.reachFor(u).stops.some((p) => p.x === 8)).toBe(false);
  });

  it('refuses to move beyond reach or onto an occupied tile', () => {
    const battle = battleOf([unit({ id: 'a', x: 0, y: 1 }), unit({ id: 'b', x: 2, y: 1 })]);
    const a = battle.units[0]!;
    const reach = battle.reachFor(a);
    expect(battle.moveUnit(a, { x: 8, y: 1 }, reach)).toBeNull();
    expect(battle.moveUnit(a, { x: 2, y: 1 }, reach)).toBeNull();
    expect(a.moved).toBe(false);
  });

  it('waiting spends the unit', () => {
    const battle = battleOf([unit()]);
    battle.wait(battle.units[0]!);
    expect(battle.units[0]).toMatchObject({ moved: true, acted: true });
    expect(battle.isSideSpent('player')).toBe(true);
  });
});

describe('attack ranges', () => {
  it('finds hostile targets in bow range only', () => {
    const archer = unit({ id: 'a', class: 'archer', inventory: ['composite-bow'], x: 0, y: 1 });
    const battle = battleOf([
      archer,
      unit({ id: 'adjacent', side: 'enemy', x: 1, y: 1 }),
      unit({ id: 'far', side: 'enemy', x: 3, y: 1 }),
      unit({ id: 'toofar', side: 'enemy', x: 5, y: 1 }),
      unit({ id: 'friend', x: 2, y: 1 }),
    ]);
    expect(battle.targetsFrom(archer, archer).map((u) => u.id)).toEqual(['far']);
  });

  it('units without an offensive weapon have no targets or threat', () => {
    const healer = unit({ id: 'h', class: 'healer', inventory: ['salve'], x: 0, y: 0 });
    const battle = battleOf([healer, unit({ id: 'e', side: 'enemy', x: 1, y: 0 })]);
    expect(battle.targetsFrom(healer, healer)).toEqual([]);
    expect(battle.threatTiles(healer, battle.reachFor(healer))).toEqual([]);
    expect(battle.attackOptions(healer)).toEqual([]);
  });

  it('shows threat tiles beyond the move range', () => {
    const battle = battleOf([unit({ x: 0, y: 1 })]);
    const u = battle.units[0]!;
    const threat = battle.threatTiles(u, battle.reachFor(u));
    expect(threat.some((p) => p.x === 6 && p.y === 1)).toBe(true); // move 5 + range 1
    expect(threat.some((p) => p.x === 7 && p.y === 1)).toBe(false);
  });

  it('threat uses every usable weapon, so a bow in the pack extends it', () => {
    const lord = unit({ class: 'young-lord', inventory: ['iron-sabre', 'short-bow'], x: 0, y: 1 });
    const battle = battleOf([lord]);
    const threat = battle.threatTiles(lord, battle.reachFor(lord));
    expect(threat.some((p) => p.x === 7 && p.y === 1)).toBe(true); // move 5 + short bow range 2
  });

  it('offers each weapon that reaches someone, with its targets', () => {
    const lord = unit({ class: 'young-lord', inventory: ['iron-sabre', 'short-bow'], x: 0, y: 0 });
    const battle = battleOf([lord, unit({ id: 'near', side: 'enemy', x: 1, y: 0 }), unit({ id: 'mid', side: 'enemy', x: 2, y: 0 })]);
    const options = battle.attackOptions(lord);
    expect(options.map((o) => [o.weapon.id, o.targets.map((t) => t.id)])).toEqual([
      ['iron-sabre', ['near']],
      ['short-bow', ['near', 'mid']],
    ]);
  });
});

describe('equipping', () => {
  it('equips a weapon the class can wield and refuses one it cannot', () => {
    const battle = battleOf([unit({ class: 'fire-thrower', inventory: ['naphtha-pot', 'knife'] })]);
    const u = battle.units[0]!;
    expect(battle.weaponOf(u)?.id).toBe('naphtha-pot');
    expect(battle.equip(u, 1)).toBe(true);
    expect(battle.weaponOf(u)?.id).toBe('knife');
  });

  it('keeps cavalry lances for mounted units and enforces grades', () => {
    const rider = unit({ class: 'horseman', inventory: ['cavalry-lance'] });
    const walker = unit({ class: 'soldier', inventory: ['cavalry-lance'] });
    expect(rider.equipped).toBe(-1); // horseman spear cap is III, the lance is IV
    expect(walker.equipped).toBe(-1);
    const rider2 = unit({ class: 'horseman', inventory: ['cavalry-lance'], weaponGrades: { spear: 4 } });
    expect(rider2.equipped).toBe(0);
    const walker2 = unit({ class: 'pikeman', inventory: ['cavalry-lance'] });
    expect(walker2.equipped).toBe(-1); // grade IV is within the pikeman's cap, but a lance is mounted-only
  });
});

describe('fights', () => {
  it('retreats a defeated defender wounded and removes it from the board', () => {
    const a = unit({ id: 'a', x: 0, y: 1 });
    const e = unit({ id: 'e', side: 'enemy', x: 1, y: 1 });
    e.hp = 1;
    const battle = battleOf([a, e], arena(), scripted(0, 99)); // the first strike hits; no crit
    const report = battle.fight(a, e);
    expect(report.defeated).toEqual([e]);
    expect(e).toMatchObject({ hp: 0, retreated: true });
    expect(battle.unitAt(1, 1)).toBeUndefined();
    expect(battle.livingUnits('enemy')).toHaveLength(0);
    expect(report.events).toHaveLength(1); // the fight ends when a unit falls: no counter
    expect(report.events[0]?.killed).toBe(true);
    expect(a.hp).toBe(a.stats.hp);
  });

  it('retreats the attacker on a lethal counter', () => {
    const a = unit({ id: 'a', x: 0, y: 1 });
    a.hp = 1;
    // an overwhelming defender: its hit chance clamps to 100, so any roll connects
    const e = unit({ id: 'e', side: 'enemy', offset: { mgt: 20, skl: 40 }, x: 1, y: 1 });
    const battle = battleOf([a, e], arena(), scripted(99, 0, 99)); // the attacker misses; the counter hits, no crit
    const report = battle.fight(a, e);
    expect(report.defeated.map((u) => u.id)).toEqual(['a']);
    expect(a.retreated).toBe(true);
    expect(battle.livingUnits('player')).toHaveLength(0);
    expect(report.expAwards).toEqual([]); // a fallen unit earns nothing
  });

  it('breaks a weapon at zero uses, removes it and equips the next', () => {
    const a = unit({ id: 'a', class: 'young-lord', inventory: ['iron-sabre', 'levy-spear'], x: 0, y: 1 });
    a.inventory[0]!.uses = 1;
    const e = unit({ id: 'e', side: 'enemy', x: 1, y: 1 });
    const battle = battleOf([a, e]);
    const report = battle.fight(a, e);
    expect(report.brokenWeapons.map((b) => [b.unit.id, b.weapon.id])).toContainEqual(['a', 'iron-sabre']);
    expect(a.inventory.map((i) => i.id)).toEqual(['levy-spear']);
    expect(battle.weaponOf(a)?.id).toBe('levy-spear');
  });

  it('a lone weapon at one use gets one strike even against a slow foe', () => {
    const fast = unit({ id: 'f', class: 'skirmisher', inventory: ['knife'], x: 0, y: 1 });
    fast.inventory[0]!.uses = 1;
    const slow = unit({ id: 's', class: 'axeman', side: 'enemy', inventory: ['hatchet'], x: 1, y: 1 });
    const report = battleOf([fast, slow]).fight(fast, slow);
    expect(report.events.filter((e) => e.by === 'a')).toHaveLength(1);
  });

  it('terrain cover reduces damage', () => {
    const grove = arena(3, 1, ['.G.']);
    const dmg = (map: typeof grove) => {
      const a = unit({ id: 'a', x: 0, y: 0 });
      const e = unit({ id: 'e', side: 'enemy', x: 1, y: 0 });
      return battleOf([a, e], map).forecastFor(a, e)!.attacker.strike!.damage;
    };
    expect(dmg(arena(3, 1))).toBe(dmg(grove) + 1);
  });

  it('does not counter when the defender cannot reach', () => {
    const archer = unit({ id: 'a', class: 'archer', inventory: ['composite-bow'], x: 0, y: 1 });
    const foe = unit({ id: 'e', side: 'enemy', x: 2, y: 1 });
    const battle = battleOf([archer, foe]);
    const report = battle.fight(archer, foe);
    expect(report.forecast.defender.strike).toBeNull();
    expect(report.events.every((e) => e.by === 'a')).toBe(true);
    expect(archer.hp).toBe(archer.stats.hp);
  });

  it('forecasts from a tile the unit is about to move to', () => {
    const archer = unit({ id: 'a', class: 'archer', inventory: ['composite-bow'], x: 0, y: 0 });
    const foe = unit({ id: 'e', side: 'enemy', x: 5, y: 0 });
    const battle = battleOf([archer, foe], arena(9, 1));
    expect(battle.forecastFor(archer, foe)).toBeNull(); // out of range from here
    expect(battle.forecastFor(archer, foe, { from: { x: 3, y: 0 } })).not.toBeNull();
  });

  it('evaluates another weapon without equipping it', () => {
    const lord = unit({ id: 'l', class: 'young-lord', inventory: ['iron-sabre', 'short-bow'], x: 0, y: 0 });
    const foe = unit({ id: 'e', side: 'enemy', x: 2, y: 0 });
    const battle = battleOf([lord, foe]);
    expect(battle.forecastFor(lord, foe)).toBeNull();
    expect(battle.forecastFor(lord, foe, { slot: 1 })?.attacker.weaponName).toBe('Short Bow');
    expect(lord.equipped).toBe(0);
  });
});

describe('phases', () => {
  it('runs player phase, enemy phase, then the next turn with everyone ready', () => {
    const battle = battleOf([unit({ id: 'a' }), unit({ id: 'e', side: 'enemy', x: 5 })]);
    battle.wait(battle.units[0]!);
    battle.endPlayerPhase();
    expect(battle.phase).toBe('enemy');
    battle.endEnemyPhase();
    expect(battle.phase).toBe('player');
    expect(battle.turn).toBe(2);
    expect(battle.units.every((u) => !u.moved && !u.acted)).toBe(true);
  });
});
