import { BattleState, DEFAULT_RULES, type BattleRules, type BattleTables } from './battle';
import type { GameMap } from './map';
import { createRng, hashSeed } from './rng';
import { createStructure } from './structures';
import type { SupportTracker } from './supports';
import { createUnit, type UnitInstance, type UnitTable } from './unit';

export interface BattleOptions {
  /** Seeds every random draw in the battle; defaults to a hash of the map id. */
  readonly seed?: number;
  readonly rules?: Partial<BattleRules>;
  /** The army's supports: given before the battle begins, so the chapter's points start from nothing. */
  readonly supports?: SupportTracker;
  /**
   * Start the first phase (default). A campaign puts its own army on the field first and begins the
   * battle itself, so the first turn's events act on the units that are really there.
   */
  readonly begin?: boolean;
}

/**
 * Place every unit named in the map's spawns. A definition used more than once gets numbered
 * instance ids (`soldier#1`, `soldier#2`), so every unit on the board has a unique id.
 */
export function buildBattle(map: GameMap, defs: UnitTable, tables: BattleTables, options: BattleOptions = {}): BattleState {
  const sides = ['player', 'ally', 'enemy'] as const;
  const spawns = sides.flatMap((side) => (map.spawns[side] ?? []).map((spawn) => ({ side, spawn })));
  const totals = new Map<string, number>();
  for (const { spawn } of spawns) totals.set(spawn.unit, (totals.get(spawn.unit) ?? 0) + 1);
  const seen = new Map<string, number>();
  const units: UnitInstance[] = spawns.map(({ side, spawn }) => {
    const n = (seen.get(spawn.unit) ?? 0) + 1;
    seen.set(spawn.unit, n);
    const id = (totals.get(spawn.unit) ?? 1) > 1 ? `${spawn.unit}#${n}` : spawn.unit;
    const def = defs[spawn.unit];
    if (!def) {
      // a gate, a wall, a barricade or a siege engine: placed where the map says, on its side
      const structure = tables.structures.get(spawn.unit);
      if (!structure) throw new Error(`Map "${map.id}" places unknown unit "${spawn.unit}"`);
      const built = createStructure(structure, id, spawn.at[0], spawn.at[1], side, tables, spawn.tags ?? [], spawn.faction);
      if (built.ai) built.ai = side === 'player' ? null : (spawn.ai ?? built.ai);
      return built;
    }
    const overrides = { ...(spawn.ai ? { ai: spawn.ai } : {}), ...(spawn.tags ? { tags: spawn.tags } : {}), ...(spawn.side ? { side: spawn.side } : {}) };
    const unit = createUnit(def, id, spawn.at[0], spawn.at[1], tables, overrides);
    // a reserve stands off the map until an event brings it on
    if (unit.tags.includes('reserve')) Object.assign(unit, { retreated: true, escaped: true });
    return unit;
  });
  const rng = createRng(options.seed ?? hashSeed('battle', map.id));
  const battle = new BattleState(map, units, tables, rng, { ...DEFAULT_RULES, ...options.rules });
  if (options.supports) battle.supports = options.supports;
  if (options.begin !== false) battle.begin();
  return battle;
}
