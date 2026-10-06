import { isStats, STAT_KEYS, type Stats, type Tier } from './stats';
import { MOVE_TYPES, type MoveType } from './types';
import { WEAPON_KINDS, type WeaponKind } from './weapons';

/** A class: the base of a unit's stats and what it may wield (DESIGN §3.6, §6). */
export interface ClassDef {
  readonly id: string;
  /** The line this class belongs to (a line has three tiers). */
  readonly line: string;
  readonly tier: Tier;
  /** The common English name shown by default. */
  readonly name: string;
  /** A flavour name from the sources, or a flagged game label. */
  readonly historicalName?: string;
  readonly moveType: MoveType;
  /** Level-1 stats of this class in this tier. */
  readonly base: Stats;
  /** Overrides of the tier's default stat caps. */
  readonly caps?: Readonly<Partial<Stats>>;
  /** Added to a unit's own growth rates. */
  readonly growthMod?: Readonly<Partial<Stats>>;
  /** The highest weapon grade the class can reach, per kind. */
  readonly weapons: Readonly<Partial<Record<WeaponKind, number>>>;
  readonly skills?: readonly string[];
  readonly promotesTo?: string;
  /** True for classes that are not for general recruitment. */
  readonly unique?: boolean;
}

export type ClassTable = ReadonlyMap<string, ClassDef>;

export function buildClassTable(raw: readonly unknown[]): ClassTable {
  const table = new Map<string, ClassDef>();
  raw.forEach((entry, i) => {
    const c = entry as Partial<ClassDef> & Record<string, unknown>;
    const where = `class #${i}${typeof c.id === 'string' ? ` "${c.id}"` : ''}`;
    if (typeof c.id !== 'string' || c.id === '') throw new Error(`${where}: missing id`);
    if (table.has(c.id)) throw new Error(`${where}: duplicate id`);
    if (typeof c.name !== 'string' || typeof c.line !== 'string') throw new Error(`${where}: needs name and line`);
    if (![1, 2, 3].includes(c.tier as number)) throw new Error(`${where}: tier must be 1, 2 or 3`);
    if (!MOVE_TYPES.includes(c.moveType as MoveType)) throw new Error(`${where}: unknown moveType "${String(c.moveType)}"`);
    if (!isStats(c.base)) throw new Error(`${where}: base needs all nine integer stats`);
    for (const [kind, grade] of Object.entries(c.weapons ?? {})) {
      if (!WEAPON_KINDS.includes(kind as WeaponKind)) throw new Error(`${where}: unknown weapon kind "${kind}"`);
      if (!Number.isInteger(grade) || (grade as number) < 1 || (grade as number) > 5) throw new Error(`${where}: grade for ${kind} must be 1 to 5`);
    }
    for (const group of [c.caps, c.growthMod] as const) {
      for (const key of Object.keys(group ?? {})) {
        if (!(STAT_KEYS as readonly string[]).includes(key)) throw new Error(`${where}: unknown stat "${key}"`);
      }
    }
    table.set(c.id, c as ClassDef);
  });
  for (const c of table.values()) {
    if (c.promotesTo !== undefined && !table.has(c.promotesTo)) throw new Error(`class "${c.id}" promotes to unknown "${c.promotesTo}"`);
  }
  return table;
}

