import type { Army, Result } from './army';
import { applyItem, type InventoryEnv } from './inventory';
import { checkPromotion, type PromotionResult } from './promotion';
import { grantWexp, type WexpGain } from './exp';
import type { Rank, SupportDef, SupportGate, SupportScene } from './supports';
import { TALKS_PER_CAMP } from './supports';
import { INVENTORY_SLOTS, equippedWeapon, type UnitInstance } from './unit';

/**
 * The Majlis (DESIGN §8): what the army does between battles besides shopping. A few conversations
 * (each shows a support scene), one drill in the Maydan for each unit, promotion by the Charter
 * of Iqta' or the Diploma of Investiture, and the choice of who takes the field.
 */

const ok: Result = { ok: true };
const no = (reason: string): Result => ({ ok: false, reason });

/** A new camp: the conversations and the drills are allowed again. */
export function beginCamp(army: Army): void {
  army.camp = { talks: 0, drilled: new Set() };
}

// ------------------------------------------------------------------ conversations

export interface Talk {
  readonly support: SupportDef;
  readonly rank: Rank;
  readonly scene: SupportScene;
  readonly a: UnitInstance;
  readonly b: UnitInstance;
}

/** The conversations the camp could hold now: both friends are in the army, a scene is due, and the camp has talks left. */
export function availableTalks(army: Army, gate: SupportGate): Talk[] {
  if (!army.supports || army.camp.talks >= TALKS_PER_CAMP) return [];
  const out: Talk[] = [];
  for (const { support, rank, scene } of army.supports.availableAll(gate)) {
    const a = army.units.find((u) => u.defId === support.a);
    const b = army.units.find((u) => u.defId === support.b);
    if (a && b) out.push({ support, rank, scene, a, b });
  }
  return out;
}

/** The scene has been seen: the rank takes effect, the talk adds its points, and the camp has one fewer. */
export function completeTalk(army: Army, talk: Talk, gate: SupportGate): void {
  if (!army.supports) throw new Error('The army has no supports');
  army.supports.view(talk.support.id, talk.rank, gate);
  army.camp.talks += 1;
}

// ------------------------------------------------------------------ the Maydan

/** Weapon EXP a drill gives. */
export const DRILL_WEXP = 4;

export type DrillResult = { readonly ok: true; readonly gain: WexpGain } | { readonly ok: false; readonly reason: string };

/** Drill a unit once a camp: a little weapon EXP in the kind of weapon it has in hand. */
export function drill(army: Army, unit: UnitInstance, env: Pick<InventoryEnv, 'weapons'>): DrillResult {
  if (army.camp.drilled.has(unit.id)) return { ok: false, reason: `${unit.name} has drilled today.` };
  const weapon = equippedWeapon(unit, env.weapons);
  if (!weapon) return { ok: false, reason: `${unit.name} has no weapon in hand to drill with.` };
  army.camp.drilled.add(unit.id);
  return { ok: true, gain: grantWexp(unit, weapon.kind, DRILL_WEXP) };
}

// ------------------------------------------------------------------ promotion

export interface Promotable {
  readonly unit: UnitInstance;
  /** The item that will be used, and where it is. */
  readonly item: string;
  readonly from: 'pack' | 'convoy';
  readonly targetName: string;
}

const promotionItem = (env: InventoryEnv, tier: number): string | undefined => [...env.items.values()].find((i) => i.kind === 'promotion' && i.promotes === tier)?.id;

/** Units that could be promoted now, with the item that would do it: in their pack, or else in the convoy. */
export function promotable(army: Army, env: InventoryEnv): Promotable[] {
  const out: Promotable[] = [];
  for (const unit of army.units) {
    const check = checkPromotion(unit, env.classes, env.balance);
    if (!check.ok) continue;
    const wanted = promotionItem(env, unit.tier);
    if (!wanted) continue;
    const from = unit.inventory.some((s) => s.id === wanted) ? 'pack' : army.convoy.some((s) => s.id === wanted) ? 'convoy' : null;
    if (from) out.push({ unit, item: wanted, from, targetName: check.target.name });
  }
  return out;
}

export type PromotionOutcome = { readonly ok: true; readonly result: PromotionResult } | { readonly ok: false; readonly reason: string };

/** Promote a unit with the item it needs, taking it from the convoy if the unit is not carrying it. */
export function promoteWithItem(army: Army, unit: UnitInstance, env: InventoryEnv): PromotionOutcome {
  const entry = promotable(army, env).find((p) => p.unit === unit);
  if (!entry) return { ok: false, reason: `${unit.name} cannot be promoted now.` };
  let slot = unit.inventory.findIndex((s) => s.id === entry.item);
  if (slot < 0) {
    if (unit.inventory.length >= INVENTORY_SLOTS) return { ok: false, reason: `${unit.name} has no room to carry it.` };
    const at = army.convoy.findIndex((s) => s.id === entry.item);
    const [stack] = army.convoy.splice(at, 1);
    if (!stack) return { ok: false, reason: 'The item is gone.' };
    unit.inventory.push(stack);
    slot = unit.inventory.length - 1;
  }
  const report = applyItem(unit, slot, env);
  if (!report.promotion) return { ok: false, reason: `${unit.name} was not promoted.` };
  return { ok: true, result: report.promotion };
}

// ------------------------------------------------------------------ who takes the field

const isLord = (u: UnitInstance): boolean => u.tags.includes('lord');

/** Whether the unit is chosen to deploy. */
export const isDeployed = (army: Army, unit: UnitInstance): boolean => army.deployed.has(unit.id);

/** Choose or release a unit. The Lord always goes; no more than the map has room for. */
export function toggleDeploy(army: Army, unit: UnitInstance): Result {
  if (!army.units.includes(unit)) return no(`${unit.name} is not in the army.`);
  if (army.deployed.has(unit.id)) {
    if (isLord(unit)) return no(`${unit.name} must go.`);
    army.deployed.delete(unit.id);
    return ok;
  }
  if (army.deployed.size >= army.deployLimit) return no(`The map has room for only ${army.deployLimit}.`);
  army.deployed.add(unit.id);
  return ok;
}

/**
 * Make the choice fit the map: keep the Lord first, then those already chosen, in the order they
 * joined, up to the limit. Call it when a new chapter's room is known.
 */
export function fitDeployment(army: Army, limit: number): void {
  army.deployLimit = limit;
  const order = [...army.units.filter(isLord), ...army.units.filter((u) => !isLord(u) && army.deployed.has(u.id)), ...army.units.filter((u) => !isLord(u) && !army.deployed.has(u.id))];
  army.deployed = new Set(order.slice(0, limit).map((u) => u.id));
}

/** The units that take the field, in the order they joined. */
export const deployedUnits = (army: Army): UnitInstance[] => army.units.filter((u) => army.deployed.has(u.id));

