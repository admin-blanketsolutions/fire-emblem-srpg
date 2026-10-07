import type { Balance } from './balance';
import type { ClassDef, ClassTable } from './classes';
import { STAT_KEYS, type MutableStats, type Stats } from './stats';
import { maxHp, statCap, type UnitInstance } from './unit';

/**
 * Promotion with the classic reset (DESIGN §6.6): the unit starts the next tier at level 1 with
 * no EXP, its stats rise by its line's promotion gains (never past the new class's caps), its HP
 * is restored, its weapon EXP is kept, and its skills and movement come from the new class.
 */

export type PromotionCheck = { readonly ok: true; readonly target: ClassDef } | { readonly ok: false; readonly reason: string };

/** Whether the unit may be promoted by item: it has a next tier and has reached the promotion level. */
export function checkPromotion(unit: UnitInstance, classes: ClassTable, balance: Balance): PromotionCheck {
  const current = classes.get(unit.classId);
  const next = current?.promotesTo ? classes.get(current.promotesTo) : undefined;
  if (!current || !next) return { ok: false, reason: 'is at the top of its line' };
  if (unit.level < balance.promotionLevel) return { ok: false, reason: `must reach level ${balance.promotionLevel}` };
  return { ok: true, target: next };
}

export interface PromotionResult {
  readonly unit: UnitInstance;
  readonly from: ClassDef;
  readonly to: ClassDef;
  readonly before: Stats;
  readonly after: Stats;
  readonly levelBefore: number;
}

/**
 * Promote a unit to the next tier of its line. The level requirement is the caller's to check:
 * a story rank event may promote a unit that has not reached it.
 */
export function promote(unit: UnitInstance, classes: ClassTable): PromotionResult {
  const from = classes.get(unit.classId);
  const to = from?.promotesTo ? classes.get(from.promotesTo) : undefined;
  if (!from || !to) throw new Error(`${unit.name} cannot be promoted from "${unit.classId}"`);
  const before: Stats = { ...unit.stats };
  const levelBefore = unit.level;
  const stats: MutableStats = { ...unit.stats };
  for (const key of STAT_KEYS) stats[key] = Math.min(stats[key] + (from.promotionGain?.[key] ?? 0), statCap(to, key));
  unit.stats = stats;
  unit.classId = to.id;
  unit.tier = to.tier;
  unit.moveType = to.moveType;
  unit.level = 1;
  unit.exp = 0;
  unit.skills = [...(to.skills ?? [])];
  unit.hp = maxHp(unit);
  return { unit, from, to, before, after: { ...stats }, levelBefore };
}
