import { MOVE_TYPES, type MoveType } from './types';

export interface TerrainDef {
  readonly id: string;
  readonly name: string;
  /** Movement cost per movement type; null means impassable. */
  readonly cost: Readonly<Record<MoveType, number | null>>;
  /** Added to Guard against physical attacks. */
  readonly cover: number;
  /** Added to evasion. */
  readonly avoid: number;
  /** Added to Nerve against fire (water). */
  readonly quench?: number;
  readonly flammable?: boolean;
  /** Share of max HP restored at the start of the occupant's phase. */
  readonly heals?: number;
  readonly tags?: readonly string[];
}

export type TerrainTable = ReadonlyMap<string, TerrainDef>;

/** Validate terrain definitions and index them by id. Throws a descriptive error on bad data. */
export function buildTerrainTable(defs: readonly TerrainDef[]): TerrainTable {
  const table = new Map<string, TerrainDef>();
  for (const def of defs) {
    if (!def.id) throw new Error('Terrain definition without an id');
    if (table.has(def.id)) throw new Error(`Duplicate terrain id "${def.id}"`);
    for (const moveType of MOVE_TYPES) {
      const cost = def.cost[moveType];
      if (cost === undefined) throw new Error(`Terrain "${def.id}" has no cost for ${moveType}`);
      if (cost !== null && (!Number.isInteger(cost) || cost < 1)) {
        throw new Error(`Terrain "${def.id}" has an invalid ${moveType} cost: ${cost}`);
      }
    }
    if (!Number.isInteger(def.cover) || !Number.isInteger(def.avoid)) {
      throw new Error(`Terrain "${def.id}" needs integer cover and avoid`);
    }
    table.set(def.id, def);
  }
  return table;
}
