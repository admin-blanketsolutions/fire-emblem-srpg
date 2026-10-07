import type { BattleState } from '../core/battle';
import { parseMap, type MapJson } from '../core/map';
import { buildBattle, type BattleOptions } from '../core/setup';
import type { UnitTable } from '../core/unit';
import siegeMapJson from './maps/m4-siege.json';
import siegeUnitsJson from './test/siege-units.json';
import { tables, terrain, testUnits } from './index';

/**
 * Small battles that show off a system, reachable with `?demo=` in the address. Test data only:
 * the chapters of the campaign define their own maps.
 */

export const DEMOS = ['siege'] as const;
export type DemoName = (typeof DEMOS)[number];

const siegeUnits: UnitTable = { ...testUnits, ...(siegeUnitsJson as unknown as UnitTable) };

/**
 * A walled courtyard with a barred gate, wall segments that can be broken, mangonels, a barricade
 * and dry grass to burn: structures, flames, Sap, Entrench, Counsel, Open and a promotion item.
 */
export function createSiegeDemo(options?: BattleOptions): BattleState {
  const map = parseMap(siegeMapJson as unknown as MapJson, terrain);
  return buildBattle(map, siegeUnits, { ...tables, units: siegeUnits }, options);
}
