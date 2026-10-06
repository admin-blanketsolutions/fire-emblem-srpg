/** The nine stats (DESIGN §5.1). HP in a unit's stats is its maximum; current HP is separate. */
export const STAT_KEYS = ['hp', 'mgt', 'skl', 'spd', 'fort', 'grd', 'nrv', 'bld', 'mov'] as const;
export type Stat = (typeof STAT_KEYS)[number];
export type Stats = Readonly<Record<Stat, number>>;
export type MutableStats = Record<Stat, number>;

/** The stats that roll for growth at each level-up. Build and Move do not grow by levelling. */
export const GROWTH_KEYS: readonly Stat[] = ['hp', 'mgt', 'skl', 'spd', 'fort', 'grd', 'nrv'];

export const STAT_LABELS: Readonly<Record<Stat, string>> = {
  hp: 'HP',
  mgt: 'Might',
  skl: 'Skill',
  spd: 'Speed',
  fort: 'Fortune',
  grd: 'Guard',
  nrv: 'Nerve',
  bld: 'Build',
  mov: 'Move',
};

/** Short labels for tight layouts (DESIGN §5.1). */
export const STAT_ABBR: Readonly<Record<Stat, string>> = {
  hp: 'HP',
  mgt: 'MGT',
  skl: 'SKL',
  spd: 'SPD',
  fort: 'FORT',
  grd: 'GRD',
  nrv: 'NRV',
  bld: 'BLD',
  mov: 'MOV',
};

export type Tier = 1 | 2 | 3;

/** Default stat caps by tier; a class may override individual stats (DESIGN §6.3). */
export const TIER_CAPS: Readonly<Record<Tier, Stats>> = {
  1: { hp: 40, mgt: 20, skl: 20, spd: 20, fort: 20, grd: 20, nrv: 20, bld: 14, mov: 10 },
  2: { hp: 60, mgt: 30, skl: 30, spd: 30, fort: 30, grd: 30, nrv: 30, bld: 20, mov: 12 },
  3: { hp: 80, mgt: 40, skl: 40, spd: 40, fort: 40, grd: 40, nrv: 40, bld: 26, mov: 12 },
};

export function zeroStats(): MutableStats {
  return { hp: 0, mgt: 0, skl: 0, spd: 0, fort: 0, grd: 0, nrv: 0, bld: 0, mov: 0 };
}

/** A copy of `base` with each stat in `delta` added. */
export function addStats(base: Stats, delta: Partial<Stats>): MutableStats {
  const out: MutableStats = { ...base };
  for (const key of STAT_KEYS) out[key] += delta[key] ?? 0;
  return out;
}

export function isStats(value: unknown): value is Stats {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return STAT_KEYS.every((key) => Number.isInteger(record[key]));
}
