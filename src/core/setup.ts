import { BattleState, DEFAULT_RULES, type BattleRules, type BattleTables } from './battle';
import type { GameMap } from './map';
import { createRng, hashSeed } from './rng';
import { createUnit, type UnitInstance, type UnitTable } from './unit';

export interface BattleOptions {
  /** Seeds every random draw in the battle; defaults to a hash of the map id. */
  readonly seed?: number;
  readonly rules?: Partial<BattleRules>;
}

/**
 * Place every unit named in the map's spawns. A definition used more than once gets numbered
 * instance ids (`soldier#1`, `soldier#2`), so every unit on the board has a unique id.
 */
export function buildBattle(map: GameMap, defs: UnitTable, tables: BattleTables, options: BattleOptions = {}): BattleState {
  const spawns = [...(map.spawns.player ?? []), ...(map.spawns.ally ?? []), ...(map.spawns.enemy ?? [])];
  const totals = new Map<string, number>();
  for (const spawn of spawns) totals.set(spawn.unit, (totals.get(spawn.unit) ?? 0) + 1);
  const seen = new Map<string, number>();
  const units: UnitInstance[] = spawns.map((spawn) => {
    const def = defs[spawn.unit];
    if (!def) throw new Error(`Map "${map.id}" places unknown unit "${spawn.unit}"`);
    const n = (seen.get(spawn.unit) ?? 0) + 1;
    seen.set(spawn.unit, n);
    const id = (totals.get(spawn.unit) ?? 1) > 1 ? `${spawn.unit}#${n}` : spawn.unit;
    const overrides = { ...(spawn.ai ? { ai: spawn.ai } : {}), ...(spawn.tags ? { tags: spawn.tags } : {}) };
    return createUnit(def, id, spawn.at[0], spawn.at[1], tables, overrides);
  });
  const rng = createRng(options.seed ?? hashSeed('battle', map.id));
  const battle = new BattleState(map, units, tables, rng, { ...DEFAULT_RULES, ...options.rules });
  battle.begin();
  return battle;
}
