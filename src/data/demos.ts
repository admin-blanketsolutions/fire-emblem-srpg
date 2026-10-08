import { newArmy, type Army, type CampaignMode } from '../core/army';
import { newCampaign, type Campaign } from '../core/campaign';
import type { BattleState, BattleTables } from '../core/battle';
import { freshUses } from '../core/inventory';
import { parseMap, type MapJson } from '../core/map';
import { buildBattle, type BattleOptions } from '../core/setup';
import { SupportTracker } from '../core/supports';
import { createUnit, type UnitTable } from '../core/unit';
import siegeMapJson from './maps/m4-siege.json';
import siegeUnitsJson from './test/siege-units.json';
import { demoStory } from './story';
import { tables, terrain, testUnits } from './index';

/**
 * Small battles that show off a system, reachable with `?demo=` in the address. Test data only:
 * the chapters of the campaign define their own maps.
 */

export const DEMOS = ['siege', 'camp'] as const;
export type DemoName = (typeof DEMOS)[number];

/** The demos' supports, kept while the page is open so that what the proving ground earns the camp can show. */
export const demoSupports = new SupportTracker(demoStory.supports);

export const siegeUnits: UnitTable = { ...testUnits, ...(siegeUnitsJson as unknown as UnitTable) };

export const siegeMap = () => parseMap(siegeMapJson as unknown as MapJson, terrain);

/**
 * A walled courtyard with a barred gate, wall segments that can be broken, mangonels, a barricade
 * and dry grass to burn: structures, flames, Sap, Entrench, Counsel, Open and a promotion item.
 */
export function createSiegeDemo(options?: BattleOptions): BattleState {
  return buildBattle(siegeMap(), siegeUnits, { ...tables, units: siegeUnits }, { ...options, supports: demoSupports });
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
    { supports: demoSupports },
  );
  // a pair that has fought side by side, and has something to say
  demoSupports.stateOf('demo-lord-pikeman').points = Math.max(demoSupports.stateOf('demo-lord-pikeman').points, 25);
  for (const id of ['steel-head-spear', 'syrian-sabre', 'bandage', 'naphtha-pot', 'water-skin', 'flanged-mace']) {
    army.convoy.push({ id, uses: freshUses(id, tables) ?? 1 });
  }
  return { army, tables };
}

/**
 * A campaign for the demo story: the camp army above with its own supports, every Codex entry
 * there is to read, and the siege as its battle. New Game plays this until the chapters exist (M7).
 */
export function newDemoCampaign(mode: CampaignMode, seed: number): Campaign {
  const supports = new SupportTracker(demoStory.supports);
  const defs = Object.values(siegeUnits).filter((d) => d.side === 'player');
  const army = newArmy(
    defs.map((d) => createUnit(d, d.id, 0, 0, tables)),
    1500,
    { supports },
  );
  for (const id of ['steel-head-spear', 'bandage', 'naphtha-pot', 'water-skin']) army.convoy.push({ id, uses: freshUses(id, tables) ?? 1 });
  const campaign = newCampaign({ mode, seed, story: 'demo', army, chapter: 'CH-00' });
  for (const id of demoStory.codex.keys()) campaign.codex.add(id);
  return campaign;
}
