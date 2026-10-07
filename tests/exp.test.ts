import { describe, expect, it } from 'vitest';
import { awardExp, effectiveLevel, expForFight, expForHeal, grantWexp, growthChance, levelUp } from '../src/core/exp';
import { createRng } from '../src/core/rng';
import { arena, balance, battleOf, classes, counting, scripted, unit } from './support';

const classOf = (u: ReturnType<typeof unit>) => classes.get(u.classId)!;
const at = (level: number, tier: 1 | 2 | 3 = 1, extra: Parameters<typeof unit>[0] = {}) => {
  const u = unit({ level, ...extra });
  u.tier = tier;
  return u;
};

describe('effective level', () => {
  it('adds twenty per tier above the first', () => {
    expect(effectiveLevel(at(7))).toBe(7);
    expect(effectiveLevel(at(7, 2))).toBe(27);
    expect(effectiveLevel(at(7, 3))).toBe(47);
  });
});

describe('EXP for a fight', () => {
  const hit = { dealtDamage: true, killed: false };
  const kill = { dealtDamage: true, killed: true };

  it('gives 10 for an even fight without a kill, rising 3 a level up to 30 and falling to 1', () => {
    expect(expForFight(at(5), at(5), hit, balance)).toBe(10);
    expect(expForFight(at(5), at(8), hit, balance)).toBe(19);
    expect(expForFight(at(1), at(20), hit, balance)).toBe(30);
    expect(expForFight(at(20), at(1), hit, balance)).toBe(1);
  });

  it('gives 20 for an even kill, 4 a level, between 5 and 70', () => {
    expect(expForFight(at(5), at(5), kill, balance)).toBe(20);
    expect(expForFight(at(5), at(7), kill, balance)).toBe(28);
    expect(expForFight(at(1), at(20), kill, balance)).toBe(70);
    expect(expForFight(at(20), at(1), kill, balance)).toBe(5);
  });

  it('adds 40 for defeating a boss', () => {
    const boss = unit({ side: 'enemy', level: 5, boss: true });
    expect(expForFight(at(5), boss, kill, balance)).toBe(60);
    expect(expForFight(at(5), boss, hit, balance)).toBe(10); // only a kill earns the bonus
  });

  it('gives 1 when no damage was dealt', () => {
    expect(expForFight(at(5), at(5), { dealtDamage: false, killed: false }, balance)).toBe(1);
  });

  it('applies the actor’s tier rate: ×1, ×0.85, ×0.7', () => {
    expect(expForFight(at(5, 1), at(5, 1), kill, balance)).toBe(20);
    // a Tier II actor fights a Tier II opponent: even effective levels
    expect(expForFight(at(5, 2), at(5, 2), kill, balance)).toBe(17);
    expect(expForFight(at(5, 3), at(5, 3), kill, balance)).toBe(14);
  });

  it('compares across tiers by effective level', () => {
    // Tier I level 20 against a Tier II level 1: effective 20 vs 21, an even-ish fight
    expect(expForFight(at(20, 1), at(1, 2), hit, balance)).toBe(13);
  });

  it('pays healers 5 plus the HP restored, at most 30', () => {
    expect(expForHeal(at(1), 8, balance)).toBe(13);
    expect(expForHeal(at(1), 40, balance)).toBe(30);
  });
});

describe('levelling up', () => {
  it('raises each stat whose roll is under its growth, by one, and the level by one', () => {
    const u = at(3, 1, { class: 'swordsman', growth: { hp: 50, mgt: 50, skl: 50, spd: 50, fort: 50, grd: 50, nrv: 50 } });
    const before = { ...u.stats };
    // rolls in stat order: hp mgt skl spd fort grd nrv
    const result = levelUp(u, classOf(u), scripted(10, 90, 10, 90, 10, 90, 10), false);
    expect(result.gains).toEqual({ hp: 1, skl: 1, fort: 1, nrv: 1 });
    expect(u.stats).toMatchObject({ hp: before.hp + 1, mgt: before.mgt, skl: before.skl + 1, spd: before.spd, fort: before.fort + 1, grd: before.grd, nrv: before.nrv + 1 });
    expect(u.level).toBe(4);
    expect(result).toMatchObject({ levelBefore: 3, levelAfter: 4 });
  });

  it('adds the class modifier to the unit’s own growth', () => {
    const u = at(1, 1, { class: 'axeman', growth: { mgt: 30 } });
    expect(growthChance(u, classOf(u), 'mgt')).toBe(40); // axeman +10
    expect(growthChance(u, classOf(u), 'spd')).toBe(0); // -10, floored at 0
    const rogue = at(1, 1, { class: 'axeman', growth: { mgt: 95 } });
    expect(growthChance(rogue, classOf(rogue), 'mgt')).toBe(100);
  });

  it('raises current HP together with maximum HP', () => {
    const u = at(1, 1, { growth: { hp: 100 } });
    u.hp = 5;
    levelUp(u, classOf(u), scripted(0, 99, 99, 99, 99, 99, 99), false);
    expect(u.hp).toBe(6);
    expect(u.stats.hp).toBeGreaterThan(6);
  });

  it('never raises a stat past its cap but still draws every roll', () => {
    const u = at(1, 1, { growth: { mgt: 100 } });
    u.stats.mgt = 20; // Tier I cap
    const rng = scripted(0, 0, 0, 0, 0, 0, 0);
    const result = levelUp(u, classOf(u), rng, false);
    expect(u.stats.mgt).toBe(20);
    expect(result.gains.mgt).toBeUndefined();
    expect(rng.drawn()).toBe(7);
  });

  it('with Guaranteed progress, re-rolls the highest-growth stat when nothing rose', () => {
    const u = at(1, 1, { growth: { mgt: 30, skl: 60, spd: 40 } });
    const skl = u.stats.skl;
    // seven failed rolls, then the re-roll for skill (60%) succeeds on 59
    const result = levelUp(u, classOf(u), scripted(99, 99, 99, 99, 99, 99, 99, 59), true);
    expect(result.gains).toEqual({ skl: 1 });
    expect(u.stats.skl).toBe(skl + 1);
  });

  it('with Guaranteed progress, the re-roll can still fail, and is skipped when something rose', () => {
    const u = at(1, 1, { growth: { skl: 60 } });
    const failed = levelUp(u, classOf(u), scripted(99, 99, 99, 99, 99, 99, 99, 99), true);
    expect(failed.gains).toEqual({});
    const v = at(1, 1, { growth: { skl: 60, spd: 60 } });
    const rng = scripted(99, 99, 0, 99, 99, 99, 99);
    levelUp(v, classOf(v), rng, true);
    expect(rng.drawn()).toBe(7);
  });

  it('without Guaranteed progress a lucky-less level-up gains nothing', () => {
    const u = at(1, 1, { growth: { skl: 60 } });
    const rng = scripted(99, 99, 99, 99, 99, 99, 99);
    expect(levelUp(u, classOf(u), rng, false).gains).toEqual({});
    expect(rng.drawn()).toBe(7);
  });

  it('is deterministic for a seed and uses a fixed number of rolls', () => {
    const run = () => {
      const u = at(1, 1, { growth: { hp: 70, mgt: 40, skl: 40, spd: 40, fort: 30, grd: 30, nrv: 20 } });
      const rng = counting(42);
      const result = levelUp(u, classOf(u), rng, false);
      return { stats: u.stats, gains: result.gains, drawn: rng.drawn() };
    };
    expect(run()).toEqual(run());
    expect(run().drawn).toBe(7);
  });
});

describe('awarding EXP', () => {
  it('adds EXP below a level without levelling', () => {
    const u = at(3);
    const r = awardExp(u, 40, classOf(u), balance, createRng(1), true);
    expect(r).toMatchObject({ expBefore: 0, expAfter: 40, levelUps: [] });
    expect([u.level, u.exp]).toEqual([3, 40]);
  });

  it('carries leftover EXP over a level boundary', () => {
    const u = at(3);
    u.exp = 90;
    const r = awardExp(u, 25, classOf(u), balance, createRng(1), true);
    expect(r.levelUps).toHaveLength(1);
    expect([u.level, u.exp]).toEqual([4, 15]);
  });

  it('can raise several levels at once', () => {
    const u = at(3);
    const r = awardExp(u, 250, classOf(u), balance, createRng(1), true);
    expect(r.levelUps.map((l) => l.levelAfter)).toEqual([4, 5]);
    expect([u.level, u.exp]).toEqual([5, 50]);
  });

  it('stops at level 20 and earns nothing afterwards', () => {
    const u = at(19);
    u.exp = 95;
    const r = awardExp(u, 30, classOf(u), balance, createRng(1), true);
    expect(u.level).toBe(20);
    expect(u.exp).toBe(0);
    expect(r.levelUps).toHaveLength(1);
    const again = awardExp(u, 30, classOf(u), balance, createRng(1), true);
    expect(again.levelUps).toEqual([]);
    expect(u.exp).toBe(0);
  });

  it('gives the same level-ups for the same seed', () => {
    const run = () => {
      const u = at(3, 1, { growth: { hp: 60, mgt: 40, skl: 40, spd: 40, fort: 30, grd: 30, nrv: 20 } });
      awardExp(u, 450, classOf(u), balance, createRng(2024), true);
      return { level: u.level, exp: u.exp, stats: u.stats };
    };
    expect(run()).toEqual(run());
    expect(run().level).toBe(7);
  });
});

describe('weapon EXP', () => {
  it('earns grades at 0, 15, 40, 80 and 140', () => {
    const u = unit();
    u.wexp = { sabre: 14 };
    expect(grantWexp(u, 'sabre', 1)).toMatchObject({ gradeUp: 2 });
    expect(grantWexp(u, 'sabre', 1)).toMatchObject({ gradeUp: null });
    u.wexp = { sabre: 139 };
    expect(grantWexp(u, 'sabre', 2)).toMatchObject({ gradeUp: 5 });
  });
});

describe('EXP in a fight', () => {
  const duel = (seed: number, foe: Parameters<typeof unit>[0] = {}) => {
    const a = unit({ id: 'a', class: 'swordsman', level: 3, growth: { hp: 100, mgt: 100 }, x: 0 });
    const e = unit({ id: 'e', side: 'enemy', class: 'soldier', level: 3, x: 1, ...foe });
    return { a, e, battle: battleOf([a, e], arena(), seed) };
  };

  it('pays the player unit and not the enemy', () => {
    const { a, battle, e } = duel(3);
    const report = battle.fight(a, e);
    expect(report.expAwards.map((x) => x.unit.id)).toEqual(['a']);
    expect(e.exp).toBe(0);
    expect(a.exp).toBeGreaterThan(0);
  });

  it('pays a kill more than a mere hit, and the defender too when it fights back', () => {
    const killer = unit({ id: 'k', x: 0 });
    const victim = unit({ id: 'v', side: 'enemy', x: 1 });
    victim.hp = 1;
    const report = battleOf([killer, victim], arena(), scripted(0, 99)).fight(killer, victim);
    expect(report.expAwards[0]?.amount).toBe(20); // an even kill

    const defender = unit({ id: 'd', class: 'soldier', x: 1 });
    const attacker = unit({ id: 'x', side: 'enemy', x: 0 });
    const r2 = battleOf([attacker, defender], arena(), scripted(99, 0, 99)).fight(attacker, defender);
    expect(r2.expAwards.map((x) => x.unit.id)).toEqual(['d']);
    expect(r2.expAwards[0]?.amount).toBe(10); // the defender's counter landed: an even non-kill
  });

  it('pays 1 EXP to a player unit that dealt no damage', () => {
    const a = unit({ id: 'a', x: 0 });
    const e = unit({ id: 'e', side: 'enemy', x: 1 });
    const report = battleOf([a, e], arena(), scripted(99, 99)).fight(a, e); // both miss
    expect(report.expAwards[0]?.amount).toBe(1);
  });

  it('reports level-ups with the stats gained and the EXP before and after', () => {
    const a = unit({ id: 'a', class: 'swordsman', level: 3, growth: { hp: 100, mgt: 100, skl: 100, spd: 100, fort: 100, grd: 100, nrv: 100 }, x: 0 });
    a.exp = 95;
    const e = unit({ id: 'e', side: 'enemy', level: 3, x: 1 }); // an even-level foe: 10 EXP for a hit
    // the attacker hits (no crit), the counter misses, then seven level-up rolls all succeed
    const report = battleOf([a, e], arena(), scripted(0, 99, 99, ...Array(7).fill(0))).fight(a, e);
    const award = report.expAwards[0]!;
    expect(award.expBefore).toBe(95);
    expect(award.levelUps).toHaveLength(1);
    expect(award.levelUps[0]?.gains).toMatchObject({ hp: 1, mgt: 1 });
    expect(a.level).toBe(4);
  });

  it('grants weapon EXP: one per fight, two for a kill', () => {
    const a = unit({ id: 'a', x: 0 });
    const e = unit({ id: 'e', side: 'enemy', x: 1 });
    e.hp = 1;
    const before = a.wexp['sabre'] ?? 0;
    const report = battleOf([a, e], arena(), scripted(0, 99)).fight(a, e);
    expect(report.wexpGains).toMatchObject([{ kind: 'sabre', amount: 2 }]);
    expect(a.wexp['sabre']).toBe(before + 2);
  });

  it('credits weapon EXP to the weapon that broke', () => {
    const a = unit({ id: 'a', x: 0 });
    a.inventory[0]!.uses = 1;
    const e = unit({ id: 'e', side: 'enemy', x: 1 });
    const report = battleOf([a, e], arena(), scripted(99, 99)).fight(a, e);
    expect(report.brokenWeapons).toHaveLength(1);
    expect(report.wexpGains[0]?.kind).toBe('sabre');
  });
});

describe('healing', () => {
  const setup = () => {
    const healer = unit({ id: 'h', class: 'healer', level: 2, inventory: ['salve'], x: 0 });
    const friend = unit({ id: 'f', x: 1 });
    friend.hp = 9; // exactly half: the Healer's Triage only adds to targets below half
    return { healer, friend, battle: battleOf([healer, friend]) };
  };

  it('restores the remedy’s HP, at most to full, and uses it up', () => {
    const { healer, friend, battle } = setup();
    const report = battle.heal(healer, friend, 0);
    expect(report.restored).toBe(8);
    expect(friend.hp).toBe(17);
    expect(healer.inventory[0]?.uses).toBe(7);
    expect(healer).toMatchObject({ acted: true, moved: true });
    friend.hp = friend.stats.hp - 2;
    expect(battle.heal(healer, friend, 0).restored).toBe(2);
  });

  it('pays the healer 5 plus the HP restored, and weapon EXP', () => {
    const { healer, friend, battle } = setup();
    const report = battle.heal(healer, friend, 0);
    expect(report.expAward?.amount).toBe(13);
    expect(healer.exp).toBe(13);
    expect(healer.wexp['remedy']).toBeGreaterThan(0);
  });

  it('lists only wounded friends within reach', () => {
    const { healer, friend, battle } = setup();
    const enemy = unit({ id: 'e', side: 'enemy', x: 0, y: 1 });
    enemy.hp = 1;
    const healthy = unit({ id: 'g', x: 0, y: 2 });
    battle.units.push(enemy, healthy);
    const salve = battle.usableRemedies(healer)[0]!.weapon;
    expect(battle.healTargets(healer, salve).map((u) => u.id)).toEqual(['f']);
    friend.x = 3;
    expect(battle.healTargets(healer, salve)).toEqual([]);
  });

  it('removes a used-up remedy', () => {
    const { healer, friend, battle } = setup();
    healer.inventory[0]!.uses = 1;
    battle.heal(healer, friend, 0);
    expect(healer.inventory).toEqual([]);
  });

  it('refuses a slot that holds no remedy', () => {
    const healer = unit({ id: 'h', class: 'healer', inventory: ['knife'], x: 0 });
    const friend = unit({ id: 'f', x: 1 });
    expect(() => battleOf([healer, friend]).heal(healer, friend, 0)).toThrow(/no remedy/);
  });
});
