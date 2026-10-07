import type { Tier } from './stats';

/** Tunable numbers for combat and progression (DESIGN §5, balance.json). */
export interface Balance {
  readonly expPerLevel: number;
  readonly levelCap: number;
  /** EXP multiplier by the actor's tier (Tier I, II, III). */
  readonly tierExpRate: Readonly<Record<Tier, number>>;
  readonly critMultiplier: number;
  /** A side attacks twice when its attack speed beats the other's by at least this much. */
  readonly doubleThreshold: number;
  readonly bossExpBonus: number;
  /** The level a unit must reach before it can be promoted. */
  readonly promotionLevel: number;
  /** The chance each burning tile ignites a flammable neighbour at the start of a phase (1 makes fire deterministic). */
  readonly spreadChance: number;
}

export function validateBalance(raw: unknown): Balance {
  const b = raw as Partial<Balance> & Record<string, unknown>;
  const positive = (key: keyof Balance): number => {
    const value = b[key];
    if (typeof value !== 'number' || !(value > 0)) throw new Error(`balance.${key} must be a positive number`);
    return value;
  };
  const nonNegative = (key: keyof Balance): number => {
    const value = b[key];
    if (typeof value !== 'number' || !(value >= 0 && value <= 1)) throw new Error(`balance.${key} must be a number from 0 to 1`);
    return value;
  };
  const rate = b.tierExpRate;
  if (!rate || ![1, 2, 3].every((t) => typeof (rate as Record<number, unknown>)[t] === 'number')) {
    throw new Error('balance.tierExpRate needs entries for tiers 1, 2 and 3');
  }
  return {
    expPerLevel: positive('expPerLevel'),
    levelCap: positive('levelCap'),
    tierExpRate: rate as Balance['tierExpRate'],
    critMultiplier: positive('critMultiplier'),
    doubleThreshold: positive('doubleThreshold'),
    bossExpBonus: positive('bossExpBonus'),
    promotionLevel: positive('promotionLevel'),
    spreadChance: nonNegative('spreadChance'),
  };
}
