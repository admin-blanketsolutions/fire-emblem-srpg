import { validateAiWeights } from '../core/aiProfile';
import { validateBalance } from '../core/balance';
import type { BattleTables } from '../core/battle';
import { buildBattle, type BattleOptions } from '../core/setup';
import { buildClassTable } from '../core/classes';
import { parseMap, type MapJson } from '../core/map';
import { buildTerrainTable, type TerrainDef } from '../core/terrain';
import type { UnitTable } from '../core/unit';
import { buildWeaponTable } from '../core/weapons';
import aiJson from './ai.json';
import balanceJson from './balance.json';
import classesJson from './classes.json';
import m1TestMapJson from './maps/m1-test.json';
import terrainJson from './terrain.json';
import testUnitsJson from './test/units.json';
import weaponsJson from './weapons.json';

/** The terrain table, validated once at load. */
export const terrain = buildTerrainTable(terrainJson as unknown as TerrainDef[]);

export const weapons = buildWeaponTable(weaponsJson);
export const classes = buildClassTable(classesJson);
export const balance = validateBalance(balanceJson);
export const aiWeights = validateAiWeights(aiJson);

/** The proving-ground map and units. Test data only; campaign data arrives with the chapters. */
export const testMap = parseMap(m1TestMapJson as unknown as MapJson, terrain);
export const testUnits = testUnitsJson as unknown as UnitTable;

export const tables: BattleTables = { weapons, classes, balance, units: testUnits, ai: aiWeights };

export function createTestBattle(options?: BattleOptions) {
  return buildBattle(testMap, testUnits, tables, options);
}
