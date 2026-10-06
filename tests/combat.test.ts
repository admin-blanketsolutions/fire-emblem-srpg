import { describe, expect, it } from 'vitest';
import { accuracy, attackSpeed, critRate, defence, evasion, forecast, power, resolveStrikes, strikeStats, type Combatant } from '../src/core/combat';
import { createRng } from '../src/core/rng';
import type { TerrainDef } from '../src/core/terrain';
import type { UnitInstance } from '../src/core/unit';
import { arena, balance, battleOf, scripted, unit as makeUnit, weapons } from './support';

const map = arena(5, 1, ['.G...'], { '.': 'plain', G: 'grove', '~': 'river' });
const plain = map.terrainAt(0, 0);
const grove = map.terrainAt(1, 0);

/** A combatant standing on the given terrain with its first weapon equipped. */
function side(u: UnitInstance, terrainDef: TerrainDef = plain): Combatant {
  const stack = u.inventory[u.equipped];
  return { unit: u, weapon: stack ? (weapons.get(stack.id) ?? null) : null, usesLeft: stack?.uses ?? 0, terrain: terrainDef };
}

/** The two units of the worked example in DESIGN §5.2. */
function workedExample(): { salah: UnitInstance; soldier: UnitInstance } {
  const salah = makeUnit({ id: 'salah', class: 'young-lord', level: 3, offset: { hp: 1, mgt: 1, skl: 1, spd: 1, fort: 3 }, inventory: ['iron-sabre'] });
  const soldier = makeUnit({ id: 'soldier', class: 'soldier', side: 'enemy', level: 2, offset: { mgt: 1, fort: 1 }, inventory: ['levy-spear'] });
  return { salah, soldier };
}

describe('the worked example (DESIGN §5.2)', () => {
  const { salah, soldier } = workedExample();
  const a = side(salah, plain);
  const d = side(soldier, grove);

  it('builds the stats the table lists', () => {
    expect(salah.stats).toMatchObject({ hp: 20, mgt: 6, skl: 6, spd: 7, fort: 3, grd: 3, bld: 7 });
    expect(soldier.stats).toMatchObject({ hp: 18, mgt: 5, skl: 3, spd: 4, fort: 1, grd: 3, bld: 6 });
  });

  it('computes attack speed 7 and 4', () => {
    expect(attackSpeed(a)).toBe(7);
    expect(attackSpeed(d)).toBe(4);
  });

  it('computes accuracy, evasion and hit chance for both sides', () => {
    expect(accuracy(a, 1, 1)).toBe(113);
    expect(evasion(d)).toBe(29); // 2*4 + 1 + 20 (grove)
    expect(strikeStats(a, d, 1)?.hit).toBe(84);
    expect(accuracy(d, -1, 1)).toBe(81);
    expect(evasion(a)).toBe(17); // 2*7 + 3 + 0 (plain)
    expect(strikeStats(d, a, 1)?.hit).toBe(64);
  });

  it('computes power, defence and damage', () => {
    expect(power(a, d, 1)).toBe(12);
    expect(defence(a.weapon!, d)).toBe(4); // 3 Guard + 1 grove cover
    expect(strikeStats(a, d, 1)?.damage).toBe(8);
    expect(power(d, a, -1)).toBe(9);
    expect(defence(d.weapon!, a)).toBe(3);
    expect(strikeStats(d, a, 1)?.damage).toBe(6);
  });

  it('computes crit chances: 7% and 0%', () => {
    expect(critRate(a, d)).toBe(7);
    expect(critRate(d, a)).toBe(0);
  });

  it('is one strike each: 7 against 4 + 4 is not a double', () => {
    const fc = forecast(a, d, 1, balance);
    expect(fc.order).toEqual(['a', 'd']);
    expect(fc.attacker.strikes).toBe(1);
    expect(fc.defender.strikes).toBe(1);
  });

  it('forecasts HP 20 -> 14 and 18 -> 10', () => {
    const fc = forecast(a, d, 1, balance);
    expect([fc.attacker.hpNow, fc.attacker.hpAfter]).toEqual([20, 14]);
    expect([fc.defender.hpNow, fc.defender.hpAfter]).toEqual([18, 10]);
    expect(fc.attacker.triangle).toBe(1);
    expect(fc.defender.triangle).toBe(-1);
  });

  it('crits for triple damage: 24', () => {
    const fc = forecast(a, d, 1, balance);
    expect(fc.attacker.strike!.damage * balance.critMultiplier).toBe(24);
  });
});

describe('weapon effects', () => {
  it('doubles Brace Spear Might against mounted units only', () => {
    const rider = makeUnit({ id: 'r', class: 'horseman', side: 'enemy', inventory: ['iron-sabre'] });
    const walker = makeUnit({ id: 'w', class: 'swordsman', side: 'enemy', inventory: ['iron-sabre'] });
    const lancer = makeUnit({ id: 'l', class: 'pikeman', inventory: ['brace-spear'] });
    const vsRider = strikeStats(side(lancer), side(rider), 1)!;
    const vsWalker = strikeStats(side(lancer), side(walker), 1)!;
    // Brace Spear might 6: doubled to 12 against the rider. Triangle: spear beats nothing here (sabre loses to ... spear wins)
    expect(vsRider.damage - vsWalker.damage).toBe(6 + (rider.stats.grd - walker.stats.grd) * -1);
  });

  it('Crush adds Might against armoured units', () => {
    const mace = makeUnit({ id: 'm', class: 'sapper', inventory: ['iron-mace'] });
    const armoured = makeUnit({ id: 'a', class: 'soldier', side: 'enemy', inventory: [] });
    const walker = makeUnit({ id: 'w', class: 'soldier', side: 'enemy', inventory: [] });
    armoured.moveType = 'armored';
    expect(strikeStats(side(mace), side(armoured), 1)!.damage - strikeStats(side(mace), side(walker), 1)!.damage).toBe(3);
  });

  it('Breaker doubles an axe against structures', () => {
    const axeman = makeUnit({ id: 'x', class: 'axeman', inventory: ['hatchet'] });
    const gate = makeUnit({ id: 'g', class: 'soldier', side: 'neutral', inventory: [] });
    const normal = strikeStats(side(axeman), side(gate), 1)!;
    const structure = strikeStats(side(axeman), { ...side(gate), structure: true }, 1)!;
    expect(structure.damage - normal.damage).toBe(7); // hatchet Might 7, doubled
  });

  it('Pierce ignores Guard', () => {
    const shooter = makeUnit({ id: 's', class: 'crossbowman', inventory: ['light-crossbow'] });
    const target = makeUnit({ id: 't', class: 'soldier', side: 'enemy', inventory: [] });
    const withPierce = strikeStats(side(shooter), side(target), 2)!;
    expect(withPierce.damage).toBe(shooter.stats.mgt + 7 - (target.stats.grd - 2));
  });

  it('Quick adds attack speed to a dagger', () => {
    const knifeman = makeUnit({ id: 'k', class: 'swordsman', inventory: ['knife'] });
    const swordman = makeUnit({ id: 'k2', class: 'swordsman', inventory: ['iron-sabre'] });
    expect(attackSpeed(side(knifeman))).toBe(knifeman.stats.spd + 2);
    expect(attackSpeed(side(swordman))).toBe(swordman.stats.spd); // sabre weight 4 <= build 5
  });

  it('weight beyond Build slows the wielder', () => {
    const weak = makeUnit({ id: 'f', class: 'fire-thrower', inventory: ['halberd'], weaponGrades: { axe: 3 } });
    expect(attackSpeed(side(weak))).toBe(weak.stats.spd - (12 - weak.stats.bld));
  });

  it('fire uses Skill, ignores cover and is resisted by Nerve and water', () => {
    const caster = makeUnit({ id: 'c', class: 'fire-thrower', inventory: ['naphtha-pot'] });
    const target = makeUnit({ id: 't', class: 'soldier', side: 'enemy', inventory: [] });
    const onGrove = strikeStats(side(caster), side(target, grove), 1)!;
    const onPlain = strikeStats(side(caster), side(target, plain), 1)!;
    expect(onGrove.damage).toBe(onPlain.damage); // cover ignored
    expect(onPlain.damage).toBe(caster.stats.skl + 6 - target.stats.nrv);
    const water: TerrainDef = { ...plain, quench: 2 };
    expect(strikeStats(side(caster), side(target, water), 1)!.damage).toBe(onPlain.damage - 2);
  });

  it('a short bow shoots badly at point-blank range', () => {
    const archer = makeUnit({ id: 'a', class: 'archer', inventory: ['short-bow'] });
    const target = makeUnit({ id: 't', class: 'soldier', side: 'enemy', inventory: [] });
    const close = strikeStats(side(archer), side(target), 1)!;
    const far = strikeStats(side(archer), side(target), 2)!;
    expect(far.hit - close.hit).toBe(10);
  });

  it('a remedy cannot attack, and a weapon out of range cannot strike or counter', () => {
    const healer = makeUnit({ id: 'h', class: 'healer', inventory: ['salve'] });
    const target = makeUnit({ id: 't', class: 'soldier', side: 'enemy', inventory: ['levy-spear'] });
    expect(strikeStats(side(healer), side(target), 1)).toBeNull();
    const archer = makeUnit({ id: 'a', class: 'archer', inventory: ['composite-bow'] });
    expect(strikeStats(side(archer), side(target), 1)).toBeNull(); // bow 2-3
    expect(strikeStats(side(archer), side(target), 2)).not.toBeNull();
    const fc = forecast(side(archer), side(target), 2, balance);
    expect(fc.defender.strike).toBeNull(); // the spear cannot reach 2
    expect(fc.order).toEqual(['a']);
  });
});

describe('the Three Postures in a fight', () => {
  it('gives +1 Might and +10 accuracy to the winner and the reverse to the loser', () => {
    const sabre = makeUnit({ id: 's', class: 'swordsman', inventory: ['iron-sabre'] });
    const spear = makeUnit({ id: 'p', class: 'soldier', side: 'enemy', inventory: ['levy-spear'] });
    const win = side(sabre);
    const lose = side(spear);
    expect(strikeStats(win, lose, 1)).toMatchObject({});
    expect(accuracy(win, 1, 1) - accuracy(win, 0, 1)).toBe(10);
    expect(power(win, lose, 1) - power(win, lose, 0)).toBe(1);
    expect(power(lose, win, -1) - power(lose, win, 0)).toBe(-1);
  });
});

describe('doubling', () => {
  it('doubles when attack speed leads by four or more', () => {
    const fast = makeUnit({ id: 'f', class: 'skirmisher', inventory: ['knife'] });
    const slow = makeUnit({ id: 's', class: 'axeman', side: 'enemy', inventory: ['hatchet'] });
    const fc = forecast(side(fast), side(slow), 1, balance);
    expect(attackSpeed(side(fast)) - attackSpeed(side(slow))).toBeGreaterThanOrEqual(4);
    expect(fc.order).toEqual(['a', 'd', 'a']);
    expect(fc.attacker.strikes).toBe(2);
  });

  it('lets the defender double too', () => {
    const slow = makeUnit({ id: 's', class: 'axeman', inventory: ['hatchet'] });
    const fast = makeUnit({ id: 'f', class: 'skirmisher', side: 'enemy', inventory: ['knife'] });
    expect(forecast(side(slow), side(fast), 1, balance).order).toEqual(['a', 'd', 'd']);
  });

  it('does not double on a lead of three', () => {
    const a = makeUnit({ id: 'a', class: 'swordsman', inventory: ['iron-sabre'] }); // spd 7
    const b = makeUnit({ id: 'b', class: 'soldier', side: 'enemy', inventory: ['levy-spear'] }); // spd 4
    expect(attackSpeed(side(a)) - attackSpeed(side(b))).toBe(3);
    expect(forecast(side(a), side(b), 1, balance).order).toEqual(['a', 'd']);
  });

  it('limits strikes to the uses left on the weapon', () => {
    const fast = makeUnit({ id: 'f', class: 'skirmisher', inventory: ['knife'] });
    const slow = makeUnit({ id: 's', class: 'axeman', side: 'enemy', inventory: ['hatchet'] });
    const a: Combatant = { ...side(fast), usesLeft: 1 };
    expect(forecast(a, side(slow), 1, balance).order).toEqual(['a', 'd']);
  });
});

describe('resolving strikes', () => {
  const salahAndSoldier = () => {
    const { salah, soldier } = workedExample();
    return forecast(side(salah, plain), side(soldier, grove), 1, balance);
  };

  it('hits when the roll is below the hit chance (honest mode)', () => {
    const fc = salahAndSoldier(); // 84% then 64%, crit 7% on a hit
    const events = resolveStrikes(fc, 20, 18, scripted(83, 50, 63, /* soldier has 0 crit: no roll */), 'honest', balance);
    expect(events).toEqual([
      { by: 'a', hit: true, crit: false, damage: 8, targetHpAfter: 10, killed: false },
      { by: 'd', hit: true, crit: false, damage: 6, targetHpAfter: 14, killed: false },
    ]);
  });

  it('misses on a roll at or above the hit chance and draws no crit roll', () => {
    const fc = salahAndSoldier();
    const events = resolveStrikes(fc, 20, 18, scripted(84, 64), 'honest', balance);
    expect(events.map((e) => [e.hit, e.damage])).toEqual([[false, 0], [false, 0]]);
  });

  it('crits for triple damage', () => {
    const fc = salahAndSoldier();
    const events = resolveStrikes(fc, 20, 18, scripted(0, 6, 0), 'honest', balance); // crit roll 6 < 7
    expect(events[0]).toMatchObject({ hit: true, crit: true, damage: 24, targetHpAfter: 0, killed: true });
    expect(events).toHaveLength(1); // the fight ends when a unit falls
  });

  it('averages two rolls in weighted mode', () => {
    const fc = salahAndSoldier();
    // rolls 99 and 61 average 80 < 84: a hit (then a crit roll of 99 fails); honest would have missed on 99 alone
    const weighted = resolveStrikes(fc, 20, 18, scripted(99, 61, 99, 99, 99), 'weighted', balance);
    expect(weighted[0]?.hit).toBe(true);
    const honest = resolveStrikes(fc, 20, 18, scripted(99, 99), 'honest', balance);
    expect(honest[0]?.hit).toBe(false);
  });

  it('is deterministic for a seed', () => {
    const run = (seed: number) => resolveStrikes(salahAndSoldier(), 20, 18, createRng(seed), 'honest', balance);
    expect(run(7)).toEqual(run(7));
  });

  it('plays the same sequence as the forecast order, and skips nothing when nobody falls', () => {
    const fast = makeUnit({ id: 'f', class: 'skirmisher', inventory: ['knife'] });
    const slow = makeUnit({ id: 's', class: 'axeman', side: 'enemy', inventory: ['hatchet'] });
    const fc = forecast(side(fast), side(slow), 1, balance);
    const events = resolveStrikes(fc, fast.hp, slow.hp, scripted(...Array(10).fill(99)), 'honest', balance);
    expect(events.map((e) => e.by)).toEqual(fc.order);
  });
});

describe('a fight on the battle', () => {
  it('applies the strikes to HP, wears the weapons, and spends the attacker', () => {
    const attacker = makeUnit({ id: 'a', class: 'swordsman', inventory: ['iron-sabre'], x: 0 });
    const defender = makeUnit({ id: 'd', class: 'soldier', side: 'enemy', inventory: ['levy-spear'], x: 1 });
    const battle = battleOf([attacker, defender], arena(), 5);
    const before = { a: attacker.hp, d: defender.hp };
    const report = battle.fight(attacker, defender);
    const dealt = report.events.filter((e) => e.by === 'a').reduce((n, e) => n + e.damage, 0);
    const taken = report.events.filter((e) => e.by === 'd').reduce((n, e) => n + e.damage, 0);
    expect(defender.hp).toBe(before.d - dealt);
    expect(attacker.hp).toBe(before.a - taken);
    expect(attacker.inventory[0]?.uses).toBe(40 - report.events.filter((e) => e.by === 'a').length);
    expect(defender.inventory[0]?.uses).toBe(40 - report.events.filter((e) => e.by === 'd').length);
    expect(attacker).toMatchObject({ acted: true, moved: true });
  });

  it('is identical for the same seed', () => {
    const play = () => {
      const a = makeUnit({ id: 'a', class: 'swordsman', inventory: ['iron-sabre'], x: 0 });
      const d = makeUnit({ id: 'd', class: 'soldier', side: 'enemy', inventory: ['levy-spear'], x: 1 });
      return battleOf([a, d], arena(), 11).fight(a, d).events;
    };
    expect(play()).toEqual(play());
  });

  it('refuses an attack the weapon cannot make', () => {
    const archer = makeUnit({ id: 'a', class: 'archer', inventory: ['composite-bow'], x: 0 });
    const target = makeUnit({ id: 't', class: 'soldier', side: 'enemy', inventory: ['levy-spear'], x: 1 });
    expect(() => battleOf([archer, target]).fight(archer, target)).toThrow(/cannot attack/);
  });
});
