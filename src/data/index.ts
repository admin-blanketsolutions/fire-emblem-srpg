import { buildBattle, type UnitTable } from '../core/setup';
import { parseMap, type MapJson } from '../core/map';
import { buildTerrainTable, type TerrainDef } from '../core/terrain';
import m1TestMapJson from './maps/m1-test.json';
import terrainJson from './terrain.json';
import testUnitsJson from './test/units.json';

/** The terrain table, validated once at load. */
export const terrain = buildTerrainTable(terrainJson as unknown as TerrainDef[]);

/** Milestone M1's proving-ground map and units. Test data only; campaign data arrives later. */
export const m1TestMap = parseMap(m1TestMapJson as unknown as MapJson, terrain);
export const testUnits = testUnitsJson as unknown as UnitTable;

export function createM1Battle() {
  return buildBattle(m1TestMap, testUnits);
}
