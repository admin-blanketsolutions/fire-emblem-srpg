import type { BattleTables } from '../core/battle';
import { parseMap, type GameMap, type MapJson } from '../core/map';
import type { UnitDef, UnitTable } from '../core/unit';
import { tables, terrain } from './index';
import unitsJson from './units.json';

/**
 * The campaign's own battle data: its units and its maps. The proving ground and the demos keep
 * theirs under `test/`; nothing of these is shared, so a change to a test map never moves a chapter.
 */

/** Every unit the chapters use, by definition id. */
export const campaignUnits: UnitTable = unitsJson as unknown as UnitTable;

for (const [key, def] of Object.entries(campaignUnits)) {
  if (def.id !== key) throw new Error(`units.json: "${key}" is the definition of "${def.id}"`);
}

const mapModules = import.meta.glob<unknown>('./maps/ch*.json', { eager: true, import: 'default' });

/** The chapters' maps, by map id (which is also the battle's id in `chapters.json`). */
export const campaignMapJson: ReadonlyMap<string, MapJson> = new Map(
  Object.entries(mapModules).map(([path, raw]) => {
    const json = raw as MapJson;
    if (typeof json?.id !== 'string') throw new Error(`${path}: a map needs an id`);
    return [json.id, json] as const;
  }),
);

/** The tables a chapter's battle runs on: the shared rules and items, with the campaign's units. */
export const campaignTables: BattleTables = { ...tables, units: campaignUnits };

/** A chapter map, parsed and checked. Throws if there is none of that id. */
export function campaignMap(id: string): GameMap {
  const json = campaignMapJson.get(id);
  if (!json) throw new Error(`There is no campaign map "${id}"`);
  return parseMap(json, terrain);
}

export const campaignUnitIds: ReadonlySet<string> = new Set(Object.keys(campaignUnits));
export const campaignBattleIds: ReadonlySet<string> = new Set(campaignMapJson.keys());

/** A unit definition of the campaign, or a clear error. */
export function campaignUnit(id: string): UnitDef {
  const def = campaignUnits[id];
  if (!def) throw new Error(`There is no campaign unit "${id}"`);
  return def;
}
