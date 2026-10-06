import type { Balance } from './balance';
import type { ClassDef } from './classes';
import type { Rng } from './rng';
import { GROWTH_KEYS, type Stat } from './stats';
import { statCap, type UnitInstance } from './unit';
import { gradeFromWexp, type WeaponKind } from './weapons';

/** Experience, levelling and weapon experience (DESIGN §5.4, §5.7). All pure given an Rng. */

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** Level compared across tiers: every tier runs levels 1 to 20 (classic reset). */
export const effectiveLevel = (unit: UnitInstance): number => unit.level + 20 * (unit.tier - 1);

export interface FightOutcome {
  /** The actor landed at least one hit that did damage. */
  readonly dealtDamage: boolean;
  /** The actor's strike defeated the opponent. */
  readonly killed: boolean;
}

/** EXP the actor earns from a fight with the opponent, after the actor's tier rate. */
export function expForFight(actor: UnitInstance, opponent: UnitInstance, outcome: FightOutcome, balance: Balance): number {
  const diff = effectiveLevel(opponent) - effectiveLevel(actor);
  let base = 1;
  if (outcome.killed) base = clamp(20 + 4 * diff, 5, 70) + (opponent.boss ? balance.bossExpBonus : 0);
  else if (outcome.dealtDamage) base = clamp(10 + 3 * diff, 1, 30);
  return Math.max(1, Math.floor(base * balance.tierExpRate[actor.tier]));
}

/** EXP for restoring HP: `min(30, 5 + restored)`, after the tier rate. */
export function expForHeal(actor: UnitInstance, restored: number, balance: Balance): number {
  return Math.max(1, Math.floor(Math.min(30, 5 + restored) * balance.tierExpRate[actor.tier]));
}

export interface LevelUp {
  readonly levelBefore: number;
  readonly levelAfter: number;
  /** Stats that rose, each by 1. */
  readonly gains: Readonly<Partial<Record<Stat, number>>>;
}

/** The chance (percent) that a stat grows at a level-up. */
export function growthChance(unit: UnitInstance, classDef: ClassDef, stat: Stat): number {
  return clamp((unit.growth[stat] ?? 0) + (classDef.growthMod?.[stat] ?? 0), 0, 100);
}

/**
 * Raise the unit one level. Every growth stat draws one roll, in a fixed order, whether or not
 * it is capped, so the stream of rolls never depends on the unit's current stats. If nothing
 * rose and Guaranteed progress is on, the highest-growth stat below its cap rolls once more.
 */
export function levelUp(unit: UnitInstance, classDef: ClassDef, rng: Rng, guaranteedProgress: boolean): LevelUp {
  const levelBefore = unit.level;
  const gains: Partial<Record<Stat, number>> = {};
  const grow = (stat: Stat): void => {
    unit.stats[stat] += 1;
    if (stat === 'hp') unit.hp += 1;
    gains[stat] = 1;
  };
  for (const stat of GROWTH_KEYS) {
    const rolled = rng.int(100) < growthChance(unit, classDef, stat);
    if (rolled && unit.stats[stat] < statCap(classDef, stat)) grow(stat);
  }
  if (guaranteedProgress && Object.keys(gains).length === 0) {
    const open = GROWTH_KEYS.filter((s) => unit.stats[s] < statCap(classDef, s));
    let best: Stat | undefined;
    for (const stat of open) {
      if (best === undefined || growthChance(unit, classDef, stat) > growthChance(unit, classDef, best)) best = stat;
    }
    if (best !== undefined && rng.int(100) < growthChance(unit, classDef, best)) grow(best);
  }
  unit.level += 1;
  return { levelBefore, levelAfter: unit.level, gains };
}

export interface ExpResult {
  readonly expBefore: number;
  readonly expAfter: number;
  readonly levelUps: readonly LevelUp[];
}

/** Add EXP, levelling up at each full level. A unit at the level cap earns nothing. */
export function awardExp(
  unit: UnitInstance,
  amount: number,
  classDef: ClassDef,
  balance: Balance,
  rng: Rng,
  guaranteedProgress: boolean,
): ExpResult {
  const expBefore = unit.exp;
  if (unit.level >= balance.levelCap) return { expBefore, expAfter: unit.exp, levelUps: [] };
  unit.exp += amount;
  const levelUps: LevelUp[] = [];
  while (unit.exp >= balance.expPerLevel && unit.level < balance.levelCap) {
    unit.exp -= balance.expPerLevel;
    levelUps.push(levelUp(unit, classDef, rng, guaranteedProgress));
  }
  if (unit.level >= balance.levelCap) unit.exp = 0;
  return { expBefore, expAfter: unit.exp, levelUps };
}

export interface WexpGain {
  readonly kind: WeaponKind;
  readonly amount: number;
  /** The new grade if this gain earned one, otherwise null. */
  readonly gradeUp: number | null;
}

/** Weapon EXP: 1 per attack made, 2 for a kill. */
export function grantWexp(unit: UnitInstance, kind: WeaponKind, amount: number): WexpGain {
  const before = gradeFromWexp(unit.wexp[kind] ?? 0);
  unit.wexp[kind] = (unit.wexp[kind] ?? 0) + amount;
  const after = gradeFromWexp(unit.wexp[kind] ?? 0);
  return { kind, amount, gradeUp: after > before ? after : null };
}
