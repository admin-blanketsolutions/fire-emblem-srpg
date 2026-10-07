import type { ClassTable } from './classes';
import type { WeaponTable } from './weapons';
import { MOVE_TYPES, type MoveType, type Side } from './types';
import type { UnitCatalog, UnitInstance } from './unit';

/**
 * Structures (DESIGN §4.6): gates, wall segments, barricades and siege engines. They are units,
 * so movement, ranges, the danger zone and the AI treat them like any other, but they never move,
 * have no skills, earn no EXP and do not count as soldiers for objectives.
 */

export interface StructureDef {
  readonly id: string;
  readonly name: string;
  readonly hp: number;
  readonly grd: number;
  /** The weapon it fires, if any (by weapon id). */
  readonly weapon?: string;
  readonly tags: readonly string[];
  /** Fire does double damage. */
  readonly fireWeak?: boolean;
  /** Movement types that can climb over it (one extra cost to enter) but never stop on it. */
  readonly crossable?: readonly MoveType[];
  /** The terrain its tile becomes when it is destroyed (a breach), if it is not simply removed. */
  readonly breach?: string;
  readonly sprite?: string;
}

export type StructureTable = ReadonlyMap<string, StructureDef>;

export function buildStructureTable(raw: readonly unknown[], weapons: WeaponTable): StructureTable {
  const table = new Map<string, StructureDef>();
  raw.forEach((entry, i) => {
    const d = entry as Partial<StructureDef> & Record<string, unknown>;
    const where = `structure #${i}${typeof d.id === 'string' ? ` "${d.id}"` : ''}`;
    if (typeof d.id !== 'string' || d.id === '') throw new Error(`${where}: missing id`);
    if (table.has(d.id)) throw new Error(`${where}: duplicate id`);
    if (typeof d.name !== 'string') throw new Error(`${where}: missing name`);
    for (const field of ['hp', 'grd'] as const) {
      if (!Number.isInteger(d[field]) || (d[field] as number) < 0) throw new Error(`${where}: ${field} must be a non-negative integer`);
    }
    if ((d.hp as number) < 1) throw new Error(`${where}: hp must be at least 1`);
    if (d.weapon !== undefined && !weapons.has(d.weapon)) throw new Error(`${where}: fires unknown weapon "${d.weapon}"`);
    if (!Array.isArray(d.tags)) throw new Error(`${where}: needs tags`);
    for (const t of d.crossable ?? []) if (!MOVE_TYPES.includes(t)) throw new Error(`${where}: crossable by unknown movement type "${String(t)}"`);
    table.set(d.id, d as StructureDef);
  });
  return table;
}

/** Build a structure as a unit. */
export function createStructure(def: StructureDef, id: string, x: number, y: number, side: Side, catalog: UnitCatalog, tags: readonly string[] = [], faction = 'neutral'): UnitInstance {
  const placeholder = (catalog.classes as ClassTable).get('structure');
  if (!placeholder) throw new Error('The class table has no "structure" placeholder');
  const weapon = def.weapon ? catalog.weapons.get(def.weapon) : undefined;
  const stats = { hp: def.hp, mgt: 0, skl: 0, spd: 0, fort: 0, grd: def.grd, nrv: 0, bld: 0, mov: 0 };
  return {
    id,
    defId: def.id,
    name: def.name,
    side,
    spriteId: def.sprite ?? `unit.${def.id}`,
    faction,
    skin: 's1',
    growth: {},
    gradeCaps: {},
    boss: false,
    chronicled: false,
    fictional: false,
    kind: 'structure',
    home: { x, y },
    classId: placeholder.id,
    tier: 1,
    moveType: 'foot',
    level: 1,
    exp: 0,
    stats,
    wexp: {},
    inventory: weapon ? [{ id: weapon.id, uses: weapon.uses }] : [],
    equipped: weapon ? 0 : -1,
    skills: [],
    hp: def.hp,
    x,
    y,
    moved: false,
    acted: false,
    retreated: false,
    escaped: false,
    ai: weapon ? { mode: 'stationary' } : null,
    tags: [...def.tags, 'structure', ...tags],
    triggered: false,
    statuses: [],
    travelled: 0,
    bonusMove: 0,
    turnFlags: [],
  };
}
