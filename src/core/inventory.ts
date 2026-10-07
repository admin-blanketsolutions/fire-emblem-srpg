import type { Balance } from './balance';
import type { ClassTable } from './classes';
import type { ItemTable } from './items';
import { checkPromotion, promote, type PromotionResult } from './promotion';
import type { StatusId } from './status';
import { autoEquip, canEquip, INVENTORY_SLOTS, maxHp, type ItemStack, type UnitInstance } from './unit';
import type { WeaponTable } from './weapons';

/**
 * What units carry and what they can do with it. The same rules serve the battlefield (where
 * using an item costs the unit's action) and the camp (where it does not).
 */

export interface InventoryEnv {
  readonly weapons: WeaponTable;
  readonly items: ItemTable;
  readonly classes: ClassTable;
  readonly balance: Balance;
}

/** What using an item did. */
export interface ItemUseReport {
  readonly unit: UnitInstance;
  readonly item: string;
  readonly restored: number;
  readonly cured: readonly StatusId[];
  readonly promotion: PromotionResult | null;
}

/** A name for any stack: a weapon's or an item's. */
export function stackName(id: string, env: Pick<InventoryEnv, 'weapons' | 'items'>): string {
  return env.weapons.get(id)?.name ?? env.items.get(id)?.name ?? id;
}

/** Uses a fresh copy of the thing has (a weapon's durability, a consumable's charges). */
export function freshUses(id: string, env: Pick<InventoryEnv, 'weapons' | 'items'>): number | null {
  const found = env.weapons.get(id) ?? env.items.get(id);
  return found ? found.uses : null;
}

/** The price of one whole copy, in dinars. */
export function priceOf(id: string, env: Pick<InventoryEnv, 'weapons' | 'items'>): number {
  return (env.weapons.get(id) ?? env.items.get(id))?.price ?? 0;
}

/** What a stack fetches if sold: half its price, in proportion to the uses it has left. */
export function sellValue(stack: ItemStack, env: Pick<InventoryEnv, 'weapons' | 'items'>): number {
  const full = freshUses(stack.id, env);
  if (!full) return 0;
  return Math.floor((priceOf(stack.id, env) * Math.min(stack.uses, full)) / full / 2);
}

/** Equip the weapon in `slot` if the unit may wield it. */
export function equipWeapon(unit: UnitInstance, slot: number, env: InventoryEnv): boolean {
  const stack = unit.inventory[slot];
  const weapon = stack ? env.weapons.get(stack.id) : undefined;
  const classDef = env.classes.get(unit.classId);
  if (!stack || !weapon || !classDef || stack.uses <= 0 || !canEquip(unit, weapon, classDef)) return false;
  unit.equipped = slot;
  return true;
}

/** Whether using the item in `slot` would do anything for the unit right now. */
export function canUseItem(unit: UnitInstance, slot: number, env: InventoryEnv): boolean {
  const stack = unit.inventory[slot];
  const item = stack ? env.items.get(stack.id) : undefined;
  if (!stack || !item || stack.uses <= 0) return false;
  if (item.kind === 'promotion') {
    const check = checkPromotion(unit, env.classes, env.balance);
    return check.ok && unit.tier === item.promotes;
  }
  if (item.kind !== 'consumable') return false;
  const heals = (item.heal ?? 0) > 0 && unit.hp < maxHp(unit);
  const cures = (item.cures ?? []).some((id) => unit.statuses.some((s) => s.id === id));
  return heals || cures;
}

/** Remove one use from the stack in `slot`, dropping it when it is used up and keeping `equipped` on the same weapon. */
export function consumeStack(unit: UnitInstance, slot: number, env: Pick<InventoryEnv, 'weapons' | 'classes'>): void {
  const stack = unit.inventory[slot];
  if (!stack) return;
  stack.uses -= 1;
  if (stack.uses > 0) return;
  unit.inventory.splice(slot, 1);
  if (unit.equipped === slot) autoEquip(unit, env.weapons, env.classes);
  else if (unit.equipped > slot) unit.equipped -= 1;
}

/** Use the item in `slot`: its effect, then one use. The caller decides what that costs the unit. */
export function applyItem(unit: UnitInstance, slot: number, env: InventoryEnv): ItemUseReport {
  if (!canUseItem(unit, slot, env)) throw new Error(`${unit.name} cannot use the item in slot ${slot}`);
  const stack = unit.inventory[slot];
  const item = stack ? env.items.get(stack.id) : undefined;
  if (!stack || !item) throw new Error(`${unit.name} has no item in slot ${slot}`);
  let restored = 0;
  let cured: StatusId[] = [];
  let promotion: PromotionResult | null = null;
  if (item.kind === 'promotion') {
    promotion = promote(unit, env.classes);
  } else {
    restored = Math.min(item.heal ?? 0, maxHp(unit) - unit.hp);
    unit.hp += restored;
    const curable = new Set<StatusId>(item.cures ?? []);
    cured = unit.statuses.filter((s) => curable.has(s.id)).map((s) => s.id);
    unit.statuses = unit.statuses.filter((s) => !curable.has(s.id));
  }
  consumeStack(unit, slot, env);
  return { unit, item: item.id, restored, cured, promotion };
}

/** Add a fresh copy to the pack if there is room. */
export function addToPack(unit: UnitInstance, id: string, env: InventoryEnv): boolean {
  const uses = freshUses(id, env);
  if (uses === null || unit.inventory.length >= INVENTORY_SLOTS) return false;
  unit.inventory.push({ id, uses });
  if (unit.equipped < 0) autoEquip(unit, env.weapons, env.classes);
  return true;
}

/** Take the stack in `slot` out of the pack. */
export function removeFromPack(unit: UnitInstance, slot: number, env: Pick<InventoryEnv, 'weapons' | 'classes'>): ItemStack | null {
  const stack = unit.inventory[slot];
  if (!stack) return null;
  const was = unit.inventory[unit.equipped];
  unit.inventory.splice(slot, 1);
  const index = was && was !== stack ? unit.inventory.indexOf(was) : -1;
  if (index >= 0) unit.equipped = index;
  else autoEquip(unit, env.weapons, env.classes);
  return stack;
}

/** Put an existing stack in the pack, if there is room. */
export function putInPack(unit: UnitInstance, stack: ItemStack, env: Pick<InventoryEnv, 'weapons' | 'classes'>): boolean {
  if (unit.inventory.length >= INVENTORY_SLOTS) return false;
  const was = unit.inventory[unit.equipped];
  unit.inventory.push(stack);
  const index = was ? unit.inventory.indexOf(was) : -1;
  if (index >= 0) unit.equipped = index;
  else autoEquip(unit, env.weapons, env.classes);
  return true;
}

/**
 * Swap a stack between two packs, or give one to a pack that has room (name the slot one past
 * its end). Adjacency and friendliness are the caller's to check.
 */
export function swapItems(a: UnitInstance, slotA: number, b: UnitInstance, slotB: number, env: Pick<InventoryEnv, 'weapons' | 'classes'>): boolean {
  if (a === b) return false;
  const stackA = a.inventory[slotA];
  const stackB = b.inventory[slotB];
  if (!stackA && !stackB) return false;
  if (!stackA && (slotA !== a.inventory.length || a.inventory.length >= INVENTORY_SLOTS)) return false;
  if (!stackB && (slotB !== b.inventory.length || b.inventory.length >= INVENTORY_SLOTS)) return false;
  const wasA = a.inventory[a.equipped];
  const wasB = b.inventory[b.equipped];
  if (stackA) a.inventory.splice(slotA, 1);
  if (stackB) b.inventory.splice(slotB, 1);
  if (stackB) a.inventory.splice(Math.min(slotA, a.inventory.length), 0, stackB);
  if (stackA) b.inventory.splice(Math.min(slotB, b.inventory.length), 0, stackA);
  for (const [unit, was] of [[a, wasA], [b, wasB]] as const) {
    const index = was ? unit.inventory.indexOf(was) : -1;
    if (index >= 0) unit.equipped = index;
    else autoEquip(unit, env.weapons, env.classes);
  }
  return true;
}
