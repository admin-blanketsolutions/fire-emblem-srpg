import { STATUS_IDS, type StatusId } from './status';

/** Things that are carried but are not weapons (weapons live in the weapon table). */
export type ItemKind = 'consumable' | 'promotion' | 'key';

export interface ItemDef {
  readonly id: string;
  readonly name: string;
  readonly kind: ItemKind;
  readonly uses: number;
  readonly price: number;
  readonly description: string;
  /** HP restored when used. */
  readonly heal?: number;
  /** Statuses removed when used. */
  readonly cures?: readonly StatusId[];
  /** For a promotion item: the tier of the unit it promotes (1 promotes Tier I to II). */
  readonly promotes?: 1 | 2;
}

export type ItemTable = ReadonlyMap<string, ItemDef>;

const KINDS: readonly ItemKind[] = ['consumable', 'promotion', 'key'];

export function buildItemTable(raw: readonly unknown[]): ItemTable {
  const table = new Map<string, ItemDef>();
  raw.forEach((entry, i) => {
    const d = entry as Partial<ItemDef> & Record<string, unknown>;
    const where = `item #${i}${typeof d.id === 'string' ? ` "${d.id}"` : ''}`;
    if (typeof d.id !== 'string' || d.id === '') throw new Error(`${where}: missing id`);
    if (table.has(d.id)) throw new Error(`${where}: duplicate id`);
    if (typeof d.name !== 'string' || typeof d.description !== 'string') throw new Error(`${where}: needs a name and a description`);
    if (!KINDS.includes(d.kind as ItemKind)) throw new Error(`${where}: unknown kind "${String(d.kind)}"`);
    for (const field of ['uses', 'price'] as const) {
      if (!Number.isInteger(d[field]) || (d[field] as number) < 0) throw new Error(`${where}: ${field} must be a non-negative integer`);
    }
    for (const status of d.cures ?? []) if (!STATUS_IDS.includes(status)) throw new Error(`${where}: cures unknown status "${String(status)}"`);
    if (d.kind === 'promotion' && d.promotes !== 1 && d.promotes !== 2) throw new Error(`${where}: a promotion item needs promotes of 1 or 2`);
    if (d.kind !== 'promotion' && d.promotes !== undefined) throw new Error(`${where}: only a promotion item promotes`);
    table.set(d.id, d as ItemDef);
  });
  return table;
}
