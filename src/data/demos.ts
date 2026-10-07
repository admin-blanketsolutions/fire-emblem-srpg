import { newArmy, type Army } from '../core/army';
import type { BattleState, BattleTables } from '../core/battle';
import { freshUses } from '../core/inventory';
import { parseMap, type MapJson } from '../core/map';
import { buildBattle, type BattleOptions } from '../core/setup';
import { createUnit, type UnitTable } from '../core/unit';
import siegeMapJson from './maps/m4-siege.json';
import siegeUnitsJson from './test/siege-units.json';
import { tables, terrain, testUnits } from './index';

/**
 * Small battles that show off a system, reachable with `?demo=` in the address. Test data only:
 * the chapters of the campaign define their own maps.
 */

export const DEMOS = ['siege', 'camp'] as const;
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

/**
 * An army in camp: every player unit of the test data, a few things in the baggage and some
 * dinars, so the unit pages, the convoy, the shops and promotion by item can be tried.
 */
export function createCampDemo(): { army: Army; tables: BattleTables } {
  const defs = Object.values(siegeUnits).filter((d) => d.side === 'player');
  const army = newArmy(
    defs.map((d) => createUnit(d, d.id, 0, 0, tables)),
    1500,
  );
  for (const id of ['steel-head-spear', 'syrian-sabre', 'bandage', 'naphtha-pot', 'water-skin', 'flanged-mace']) {
    army.convoy.push({ id, uses: freshUses(id, tables) ?? 1 });
  }
  return { army, tables };
}
