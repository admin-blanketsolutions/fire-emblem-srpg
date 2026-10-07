import type { BattleState } from './battle';
import { addToPack, freshUses, priceOf, putInPack, removeFromPack, sellValue, type InventoryEnv } from './inventory';
import type { ShopDef } from './shop';
import type { SupportTracker } from './supports';
import { INVENTORY_SLOTS, maxHp, type ItemStack, type UnitInstance } from './unit';

/**
 * The army between battles: its units, the baggage train (the convoy) and its dinars. Everything
 * here happens in camp, where nothing costs a unit its action.
 */

/** The convoy (the baggage train, *athqal*) holds this many stacks (DESIGN §5.4). */
export const CONVOY_SLOTS = 100;

/** What a camp allows: a few conversations, and one drill for each unit. */
export interface CampAllowance {
  talks: number;
  drilled: Set<string>;
}

export interface Army {
  /** Everyone who fights for the player, in the order they joined. */
  units: UnitInstance[];
  convoy: ItemStack[];
  dinars: number;
  /** Units lost to the Classic rules, for the Casualty roll. */
  fallen: UnitInstance[];
  /** The chapter each fallen unit was lost in, by unit id. */
  fallenIn: Map<string, string>;
  /** The army's supports; they grow in battle and are shown in camp. */
  supports: SupportTracker | null;
  camp: CampAllowance;
  /** Units chosen to take the field, by id; the Lord always goes. */
  deployed: Set<string>;
  /** How many the next chapter's map has room for. */
  deployLimit: number;
}

export interface ArmyOptions {
  readonly supports?: SupportTracker;
  readonly deployLimit?: number;
}

export const newArmy = (units: UnitInstance[] = [], dinars = 0, options: ArmyOptions = {}): Army => ({
  units,
  convoy: [],
  dinars,
  fallen: [],
  fallenIn: new Map(),
  supports: options.supports ?? null,
  camp: { talks: 0, drilled: new Set() },
  deployed: new Set(units.map((u) => u.id)),
  deployLimit: options.deployLimit ?? 99,
});

export type Result = { readonly ok: true } | { readonly ok: false; readonly reason: string };
const ok: Result = { ok: true };
const no = (reason: string): Result => ({ ok: false, reason });

/** Move a stack from a unit's pack into the convoy. */
export function store(army: Army, unit: UnitInstance, slot: number, env: InventoryEnv): Result {
  if (army.convoy.length >= CONVOY_SLOTS) return no('The convoy is full.');
  const stack = removeFromPack(unit, slot, env);
  if (!stack) return no('There is nothing in that slot.');
  army.convoy.push(stack);
  return ok;
}

/** Move a stack from the convoy into a unit's pack. */
export function withdraw(army: Army, unit: UnitInstance, index: number, env: InventoryEnv): Result {
  const stack = army.convoy[index];
  if (!stack) return no('There is nothing at that place in the convoy.');
  if (unit.inventory.length >= INVENTORY_SLOTS) return no(`${unit.name} cannot carry any more.`);
  army.convoy.splice(index, 1);
  putInPack(unit, stack, env);
  return ok;
}

/** Buy one copy of something from a shop, into a unit's pack or, if it is full or none is named, the convoy. */
export function buy(army: Army, shop: ShopDef, id: string, unit: UnitInstance | null, env: InventoryEnv): Result {
  if (!shop.stock.includes(id)) return no(`${shop.name} does not sell that.`);
  const price = priceOf(id, env);
  if (army.dinars < price) return no('Not enough dinars.');
  const uses = freshUses(id, env);
  if (uses === null) return no('Unknown goods.');
  if (unit && unit.inventory.length < INVENTORY_SLOTS) {
    addToPack(unit, id, env);
  } else if (army.convoy.length < CONVOY_SLOTS) {
    army.convoy.push({ id, uses });
  } else {
    return no('There is nowhere to put it.');
  }
  army.dinars -= price;
  return ok;
}

/** Sell a stack from a unit's pack or from the convoy, for half its worth. Keys and gifts have no price and stay. */
export function sell(army: Army, from: { unit: UnitInstance; slot: number } | { convoyIndex: number }, env: InventoryEnv): Result {
  const stack = 'unit' in from ? from.unit.inventory[from.slot] : army.convoy[from.convoyIndex];
  if (!stack) return no('There is nothing there to sell.');
  if (priceOf(stack.id, env) <= 0) return no('That cannot be sold.');
  const value = sellValue(stack, env);
  if ('unit' in from) removeFromPack(from.unit, from.slot, env);
  else army.convoy.splice(from.convoyIndex, 1);
  army.dinars += value;
  return ok;
}

export type CampaignMode = 'classic' | 'casual';

export interface ChapterSettlement {
  /** Ordinary units lost under the Classic rules. */
  readonly lost: readonly UnitInstance[];
  /** Units that were won over during the chapter and now join the army. */
  readonly joined: readonly UnitInstance[];
  readonly ransom: number;
}

/**
 * Bring the survivors of a battle back into the army (DESIGN §4.8). A unit that retreated wounded
 * is lost in Classic mode unless it is *chronicled*, one the sources place in later events; in
 * Casual mode every unit returns. Everyone is healed, their conditions cleared, and units won over
 * in the chapter join. Ransom becomes dinars.
 */
export function settleChapter(army: Army, battle: BattleState, mode: CampaignMode, chapter?: string): ChapterSettlement {
  const lost: UnitInstance[] = [];
  const joined: UnitInstance[] = [];
  const keep: UnitInstance[] = [];
  for (const unit of army.units) {
    const fallen = unit.retreated && !unit.escaped;
    if (fallen && mode === 'classic' && !unit.chronicled) lost.push(unit);
    else keep.push(unit);
  }
  for (const unit of battle.units) {
    if (unit.side === 'player' && unit.kind === 'unit' && !army.units.includes(unit) && !keep.includes(unit)) {
      keep.push(unit);
      joined.push(unit);
    }
  }
  for (const unit of keep) {
    unit.retreated = false;
    unit.escaped = false;
    unit.hp = maxHp(unit);
    unit.statuses = [];
    unit.moved = false;
    unit.acted = false;
    unit.travelled = 0;
    unit.bonusMove = 0;
    unit.turnFlags = [];
  }
  army.units = keep;
  army.fallen.push(...lost);
  if (chapter) for (const unit of lost) army.fallenIn.set(unit.id, chapter);
  for (const unit of lost) army.deployed.delete(unit.id);
  for (const unit of joined) army.deployed.add(unit.id);
  army.dinars += battle.ransom;
  return { lost, joined, ransom: battle.ransom };
}
