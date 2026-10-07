import type { Balance } from './balance';
import type { Rng } from './rng';
import type { TerrainDef } from './terrain';
import type { UnitInstance } from './unit';
import { isEffective, isOffensive, triangle, type WeaponDef } from './weapons';

/**
 * Combat arithmetic (DESIGN §5.2). Everything here is pure: formulas take plain values and
 * resolution takes a seeded `Rng`, so a fight can be replayed exactly.
 */

/** Bonuses from skills, auras, statuses and (M5) supports, added to one side of an exchange. */
export interface Bonus {
  readonly hit: number;
  readonly avoid: number;
  readonly crit: number;
  /** Added to the power of this side's strikes. */
  readonly might: number;
  /** Added to this side's Guard against physical weapons. */
  readonly grd: number;
  /** Guard this side's strikes ignore, on top of the weapon's own Pierce. */
  readonly pierce: number;
  /** Damage taken from physical weapons is reduced by this, never below zero. */
  readonly reduction: number;
  /** Added to the longest range of this side's weapon. */
  readonly range: number;
  /** This side's strikes cannot miss. */
  readonly alwaysHit: boolean;
}
export const NO_BONUS: Bonus = { hit: 0, avoid: 0, crit: 0, might: 0, grd: 0, pierce: 0, reduction: 0, range: 0, alwaysHit: false };

/** The sum of two bonuses. */
export function addBonus(a: Bonus, b: Partial<Bonus>): Bonus {
  return {
    hit: a.hit + (b.hit ?? 0),
    avoid: a.avoid + (b.avoid ?? 0),
    crit: a.crit + (b.crit ?? 0),
    might: a.might + (b.might ?? 0),
    grd: a.grd + (b.grd ?? 0),
    pierce: a.pierce + (b.pierce ?? 0),
    reduction: a.reduction + (b.reduction ?? 0),
    range: a.range + (b.range ?? 0),
    alwaysHit: a.alwaysHit || (b.alwaysHit ?? false),
  };
}

/** One side of a fight, with everything the formulas need. */
export interface Combatant {
  readonly unit: UnitInstance;
  /** The equipped weapon, or null for none. */
  readonly weapon: WeaponDef | null;
  /** Uses left on the equipped weapon. */
  readonly usesLeft: number;
  /** The terrain under the unit. */
  readonly terrain: TerrainDef;
  readonly bonus?: Bonus;
  /** A structure (gate, barricade): it has no attack speed, so its evasion is terrain alone. */
  readonly structure?: boolean;
}

export type HitMode = 'honest' | 'weighted';

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const bonusOf = (c: Combatant): Bonus => c.bonus ?? NO_BONUS;

/** Attack speed: Speed, less the weight the unit is too weak to carry, plus Quick. */
export function attackSpeed(c: Combatant): number {
  const { stats } = c.unit;
  if (!c.weapon) return stats.spd;
  return stats.spd - Math.max(0, c.weapon.weight - stats.bld) + (c.weapon.quick ?? 0);
}

/** Might of the weapon against this target: doubled if effective, plus any flat bonus. */
export function effectiveMight(weapon: WeaponDef, target: Combatant): number {
  const classes = target.structure ? (['structure'] as const) : ([target.unit.moveType] as const);
  const isEff = classes.some((c) => isEffective(weapon, c));
  const flat = classes.reduce((sum, c) => sum + (weapon.vsBonus?.[c] ?? 0), 0);
  return weapon.might * (isEff ? 2 : 1) + flat;
}

/** Offensive power before defence: Might (Skill for fire) plus weapon Might and the triangle. */
export function power(attacker: Combatant, defender: Combatant, tri: number): number {
  const weapon = attacker.weapon;
  if (!weapon) return 0;
  const stat = weapon.kind === 'fire' ? attacker.unit.stats.skl : attacker.unit.stats.mgt;
  return stat + effectiveMight(weapon, defender) + tri + bonusOf(attacker).might;
}

/** Fire is resisted by Nerve and water; everything else by Guard and cover, less Pierce. */
export function defence(weapon: WeaponDef, defender: Combatant, extraPierce = 0): number {
  if (weapon.kind === 'fire') return defender.unit.stats.nrv + (defender.terrain.quench ?? 0);
  return defender.unit.stats.grd + bonusOf(defender).grd + defender.terrain.cover - (weapon.pierce ?? 0) - extraPierce;
}

export function accuracy(attacker: Combatant, tri: number, distance: number): number {
  const weapon = attacker.weapon;
  if (!weapon) return 0;
  const { skl, fort } = attacker.unit.stats;
  const close = distance === 1 ? (weapon.closeHit ?? 0) : 0;
  return weapon.hit + 2 * skl + Math.floor(fort / 2) + 10 * tri + bonusOf(attacker).hit + close;
}

export function evasion(defender: Combatant): number {
  const terrain = defender.terrain.avoid;
  if (defender.structure) return terrain;
  return 2 * attackSpeed(defender) + defender.unit.stats.fort + terrain + bonusOf(defender).avoid;
}

export function critRate(attacker: Combatant, defender: Combatant): number {
  const weapon = attacker.weapon;
  if (!weapon) return 0;
  const raw = weapon.crit + Math.floor(attacker.unit.stats.skl / 2) + bonusOf(attacker).crit - defender.unit.stats.fort;
  return clamp(raw, 0, 100);
}

/** Damage, hit and crit chance for one strike. */
export interface StrikeStats {
  readonly damage: number;
  readonly hit: number;
  readonly crit: number;
}

/** What a side's strike would do, or null if it cannot attack at this distance. */
export function strikeStats(attacker: Combatant, defender: Combatant, distance: number): StrikeStats | null {
  const weapon = attacker.weapon;
  const range = weapon ? ([weapon.range[0], weapon.range[1] + bonusOf(attacker).range] as const) : null;
  if (!weapon || !range || !isOffensive(weapon) || attacker.usesLeft <= 0 || distance < range[0] || distance > range[1]) return null;
  const tri = defender.weapon ? triangle(weapon.kind, defender.weapon.kind) : 0;
  // damage reduction (the Bulwark) applies to physical weapons only
  const reduction = weapon.kind === 'fire' ? 0 : bonusOf(defender).reduction;
  const damage = Math.max(0, power(attacker, defender, tri) - defence(weapon, defender, bonusOf(attacker).pierce) - reduction);
  return {
    damage,
    hit: bonusOf(attacker).alwaysHit ? 100 : clamp(accuracy(attacker, tri, distance) - evasion(defender), 0, 100),
    crit: critRate(attacker, defender),
  };
}

export interface SideForecast {
  /** Null when this side cannot attack in this exchange. */
  readonly strike: StrikeStats | null;
  /** Strikes this side will make if nobody falls: 0, 1 or 2. */
  readonly strikes: number;
  readonly attackSpeed: number;
  readonly accuracy: number;
  readonly evasion: number;
  readonly triangle: -1 | 0 | 1;
  readonly weaponName: string | null;
  readonly hpNow: number;
  /** Expected HP after the exchange if every strike hits (and none crits). */
  readonly hpAfter: number;
}

export interface Forecast {
  readonly distance: number;
  readonly attacker: SideForecast;
  readonly defender: SideForecast;
  /** The order of strikes: the attacker, the counter, then each side's follow-up. */
  readonly order: readonly ('a' | 'd')[];
}

/** The order of strikes, honouring weapon durability. */
function strikeOrder(aCan: boolean, dCan: boolean, aDouble: boolean, dDouble: boolean, aUses: number, dUses: number): Array<'a' | 'd'> {
  const wanted: Array<'a' | 'd'> = [];
  if (aCan) wanted.push('a');
  if (dCan) wanted.push('d');
  if (aCan && aDouble) wanted.push('a');
  if (dCan && dDouble) wanted.push('d');
  const used = { a: 0, d: 0 };
  const limit = { a: aUses, d: dUses };
  return wanted.filter((side) => used[side]++ < limit[side]);
}

export function forecast(a: Combatant, d: Combatant, distance: number, balance: Balance): Forecast {
  const aStrike = strikeStats(a, d, distance);
  const dStrike = strikeStats(d, a, distance);
  const aSpeed = attackSpeed(a);
  const dSpeed = attackSpeed(d);
  const aDouble = aSpeed >= dSpeed + balance.doubleThreshold;
  const dDouble = dSpeed >= aSpeed + balance.doubleThreshold;
  const order = aStrike ? strikeOrder(true, dStrike !== null, aDouble, dDouble, a.usesLeft, d.usesLeft) : [];
  const count = (side: 'a' | 'd'): number => order.filter((s) => s === side).length;

  // simulate the exchange with every strike hitting, to show the expected HP
  let aHp = a.unit.hp;
  let dHp = d.unit.hp;
  for (const side of order) {
    if (aHp <= 0 || dHp <= 0) break;
    if (side === 'a') dHp = Math.max(0, dHp - (aStrike?.damage ?? 0));
    else aHp = Math.max(0, aHp - (dStrike?.damage ?? 0));
  }

  const side = (c: Combatant, other: Combatant, strike: StrikeStats | null, speed: number, key: 'a' | 'd', hpAfter: number): SideForecast => ({
    strike,
    strikes: count(key),
    attackSpeed: speed,
    accuracy: strike ? accuracy(c, c.weapon && other.weapon ? triangle(c.weapon.kind, other.weapon.kind) : 0, distance) : 0,
    evasion: evasion(c),
    triangle: c.weapon && other.weapon ? triangle(c.weapon.kind, other.weapon.kind) : 0,
    weaponName: c.weapon?.name ?? null,
    hpNow: c.unit.hp,
    hpAfter,
  });
  return {
    distance,
    attacker: side(a, d, aStrike, aSpeed, 'a', aHp),
    defender: side(d, a, dStrike, dSpeed, 'd', dHp),
    order,
  };
}

/** One strike as it happened, with the target's HP afterwards. */
export interface StrikeEvent {
  readonly by: 'a' | 'd';
  readonly hit: boolean;
  readonly crit: boolean;
  readonly damage: number;
  readonly targetHpAfter: number;
  readonly killed: boolean;
}

/**
 * Play out the forecast's strikes with seeded rolls. For each strike one hit roll is drawn
 * (two, averaged, in Weighted mode) and, only on a hit with a crit chance, one crit roll.
 * The sequence stops as soon as a unit falls.
 */
export function resolveStrikes(fc: Forecast, aHp: number, dHp: number, rng: Rng, mode: HitMode, balance: Balance): StrikeEvent[] {
  const events: StrikeEvent[] = [];
  let hp = { a: aHp, d: dHp };
  for (const by of fc.order) {
    if (hp.a <= 0 || hp.d <= 0) break;
    const stats = (by === 'a' ? fc.attacker : fc.defender).strike;
    if (!stats) continue;
    const roll = mode === 'weighted' ? (rng.int(100) + rng.int(100)) / 2 : rng.int(100);
    const hit = roll < stats.hit;
    const crit = hit && stats.crit > 0 && rng.int(100) < stats.crit;
    const damage = hit ? stats.damage * (crit ? balance.critMultiplier : 1) : 0;
    const target = by === 'a' ? 'd' : 'a';
    hp = { ...hp, [target]: Math.max(0, hp[target] - damage) };
    events.push({ by, hit, crit, damage, targetHpAfter: hp[target], killed: hp[target] <= 0 });
  }
  return events;
}

/** What an exchange is worth to the attacker, averaged over every way the rolls could fall. */
export interface Expectation {
  /** Chance the defender is defeated. */
  readonly pKill: number;
  /** Chance the attacker is defeated. */
  readonly pDeath: number;
  /** Expected HP the defender loses. */
  readonly damageDealt: number;
  /** Expected HP the attacker loses. */
  readonly damageTaken: number;
}

/**
 * The exact expectation of a forecast's exchange. Every strike is a miss, a hit or a critical hit
 * with the chances the forecast shows, and the sequence stops when a unit falls, just as
 * `resolveStrikes` plays it. There are at most four strikes, so the enumeration is tiny.
 */
export function expectOutcome(fc: Forecast, aHp: number, dHp: number, balance: Balance): Expectation {
  type State = { a: number; d: number; p: number };
  let states = new Map<string, State>([[`${aHp}|${dHp}`, { a: aHp, d: dHp, p: 1 }]]);
  const add = (into: Map<string, State>, a: number, d: number, p: number): void => {
    const key = `${a}|${d}`;
    const known = into.get(key);
    if (known) known.p += p;
    else into.set(key, { a, d, p });
  };
  for (const by of fc.order) {
    const stats = (by === 'a' ? fc.attacker : fc.defender).strike;
    if (!stats) continue;
    const hit = stats.hit / 100;
    const crit = stats.crit / 100;
    const outcomes: ReadonlyArray<readonly [number, number]> = [
      [1 - hit, 0],
      [hit * (1 - crit), stats.damage],
      [hit * crit, stats.damage * balance.critMultiplier],
    ];
    const next = new Map<string, State>();
    for (const s of states.values()) {
      if (s.a <= 0 || s.d <= 0) {
        add(next, s.a, s.d, s.p);
        continue;
      }
      for (const [chance, damage] of outcomes) {
        if (chance <= 0) continue;
        if (by === 'a') add(next, s.a, Math.max(0, s.d - damage), s.p * chance);
        else add(next, Math.max(0, s.a - damage), s.d, s.p * chance);
      }
    }
    states = next;
  }
  let pKill = 0;
  let pDeath = 0;
  let aLeft = 0;
  let dLeft = 0;
  for (const s of states.values()) {
    if (s.d <= 0) pKill += s.p;
    if (s.a <= 0) pDeath += s.p;
    aLeft += s.a * s.p;
    dLeft += s.d * s.p;
  }
  return { pKill, pDeath, damageDealt: dHp - dLeft, damageTaken: aHp - aLeft };
}
