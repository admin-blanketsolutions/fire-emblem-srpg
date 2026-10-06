import type { MoveType } from './types';

/** The ten weapon types (DESIGN §5.3). Spear, sabre and mace form the Three Postures triangle. */
export const WEAPON_KINDS = ['spear', 'sabre', 'mace', 'axe', 'dagger', 'bow', 'crossbow', 'javelin', 'fire', 'remedy'] as const;
export type WeaponKind = (typeof WEAPON_KINDS)[number];

/** What a weapon can be especially effective against: a movement type, or a structure. */
export type TargetClass = MoveType | 'structure';
const TARGET_CLASSES: readonly TargetClass[] = ['foot', 'light', 'mounted', 'armored', 'structure'];

export interface WeaponDef {
  readonly id: string;
  readonly name: string;
  readonly kind: WeaponKind;
  /** Grade I to V: the rank a unit needs to equip it. */
  readonly grade: 1 | 2 | 3 | 4 | 5;
  /** Might; for a remedy, the HP it restores. */
  readonly might: number;
  readonly hit: number;
  readonly crit: number;
  readonly weight: number;
  readonly range: readonly [number, number];
  readonly uses: number;
  readonly price: number;
  /** Added to the wielder's attack speed (daggers). */
  readonly quick?: number;
  /** Ignores this much of the target's Guard (crossbows). */
  readonly pierce?: number;
  /** Might is doubled against these. */
  readonly effective?: readonly TargetClass[];
  /** Flat extra Might against these. */
  readonly vsBonus?: Readonly<Partial<Record<TargetClass, number>>>;
  /** Accuracy modifier when the target is adjacent (the short bow). */
  readonly closeHit?: number;
  /** Only mounted units may equip it (cavalry lances). */
  readonly mountedOnly?: boolean;
  /** Fire leaves flames on the target tile (M4). */
  readonly ignite?: boolean;
  readonly tags?: readonly string[];
}

export type WeaponTable = ReadonlyMap<string, WeaponDef>;

const BEATS = { spear: 'mace', mace: 'sabre', sabre: 'spear' } as const satisfies Record<string, WeaponKind>;
type PostureKind = keyof typeof BEATS;

const isPosture = (kind: WeaponKind): kind is PostureKind => kind in BEATS;

/** Triangle result for the attacker: +1 advantage, −1 disadvantage, 0 otherwise. */
export function triangle(attacker: WeaponKind, defender: WeaponKind): -1 | 0 | 1 {
  if (!isPosture(attacker) || !isPosture(defender)) return 0;
  if (BEATS[attacker] === defender) return 1;
  if (BEATS[defender] === attacker) return -1;
  return 0;
}

/** Whether a weapon can attack at all (a remedy only heals). */
export const isOffensive = (weapon: WeaponDef): boolean => weapon.kind !== 'remedy';

export const canReach = (weapon: WeaponDef, distance: number): boolean => distance >= weapon.range[0] && distance <= weapon.range[1];

export function isEffective(weapon: WeaponDef, target: TargetClass): boolean {
  return weapon.effective?.includes(target) ?? false;
}

/** Weapon EXP needed for each grade (I to V). */
export const GRADE_THRESHOLDS: readonly number[] = [0, 15, 40, 80, 140];

/** The grade (1 to 5) that an amount of weapon EXP has earned. */
export function gradeFromWexp(wexp: number): 1 | 2 | 3 | 4 | 5 {
  let grade = 1;
  GRADE_THRESHOLDS.forEach((threshold, i) => {
    if (wexp >= threshold) grade = i + 1;
  });
  return grade as 1 | 2 | 3 | 4 | 5;
}

/** The weapon EXP at which a grade is first reached. */
export function wexpForGrade(grade: number): number {
  return GRADE_THRESHOLDS[Math.max(1, Math.min(5, grade)) - 1] ?? 0;
}

/** Validate untrusted weapon data and index it by id. Throws a descriptive error. */
export function buildWeaponTable(raw: readonly unknown[]): WeaponTable {
  const table = new Map<string, WeaponDef>();
  raw.forEach((entry, i) => {
    const w = entry as Partial<WeaponDef> & Record<string, unknown>;
    const where = `weapon #${i}${typeof w.id === 'string' ? ` "${w.id}"` : ''}`;
    if (typeof w.id !== 'string' || w.id === '') throw new Error(`${where}: missing id`);
    if (table.has(w.id)) throw new Error(`${where}: duplicate id`);
    if (typeof w.name !== 'string') throw new Error(`${where}: missing name`);
    if (!WEAPON_KINDS.includes(w.kind as WeaponKind)) throw new Error(`${where}: unknown kind "${String(w.kind)}"`);
    if (![1, 2, 3, 4, 5].includes(w.grade as number)) throw new Error(`${where}: grade must be 1 to 5`);
    for (const field of ['might', 'hit', 'crit', 'weight', 'uses', 'price'] as const) {
      const value = w[field];
      if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${where}: ${field} must be a non-negative integer`);
    }
    const range = w.range;
    if (!Array.isArray(range) || range.length !== 2 || !range.every((n) => Number.isInteger(n) && n >= 1) || range[0] > range[1]) {
      throw new Error(`${where}: range must be [min, max] with 1 <= min <= max`);
    }
    for (const target of w.effective ?? []) {
      if (!TARGET_CLASSES.includes(target)) throw new Error(`${where}: effective against unknown "${String(target)}"`);
    }
    for (const target of Object.keys(w.vsBonus ?? {})) {
      if (!TARGET_CLASSES.includes(target as TargetClass)) throw new Error(`${where}: vsBonus against unknown "${target}"`);
    }
    table.set(w.id, w as WeaponDef);
  });
  return table;
}
