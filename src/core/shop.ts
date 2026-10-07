import type { InventoryEnv } from './inventory';
import { freshUses, priceOf } from './inventory';

/** A place to buy things with dinars. Stock is by item or weapon id, and is always available. */
export interface ShopDef {
  readonly id: string;
  readonly name: string;
  readonly stock: readonly string[];
}

export type ShopTable = ReadonlyMap<string, ShopDef>;

export function buildShopTable(raw: readonly unknown[], env: Pick<InventoryEnv, 'weapons' | 'items'>): ShopTable {
  const table = new Map<string, ShopDef>();
  raw.forEach((entry, i) => {
    const d = entry as Partial<ShopDef>;
    const where = `shop #${i}${typeof d.id === 'string' ? ` "${d.id}"` : ''}`;
    if (typeof d.id !== 'string' || d.id === '') throw new Error(`${where}: missing id`);
    if (table.has(d.id)) throw new Error(`${where}: duplicate id`);
    if (typeof d.name !== 'string') throw new Error(`${where}: missing name`);
    if (!Array.isArray(d.stock) || d.stock.length === 0) throw new Error(`${where}: needs stock`);
    for (const id of d.stock) {
      if (freshUses(id, env) === null) throw new Error(`${where}: sells unknown item "${String(id)}"`);
      if (priceOf(id, env) <= 0) throw new Error(`${where}: "${String(id)}" has no price`);
    }
    table.set(d.id, d as ShopDef);
  });
  return table;
}
