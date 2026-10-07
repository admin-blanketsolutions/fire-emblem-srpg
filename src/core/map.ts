import { validateAiProfile, type AiProfile } from './aiProfile';
import { validateEvents, type EventDef, type PhaseSide, type SpawnSpec } from './events';
import { MAX_MAP_SIZE } from './grid';
import { validateObjective, type ObjectiveDef } from './objectives';
import type { TerrainDef, TerrainTable } from './terrain';
import type { MoveType, Tile } from './types';

export interface SpawnJson {
  readonly unit: string;
  readonly at: Tile;
  /** Overrides the unit definition's behaviour for this placement. */
  readonly ai?: AiProfile;
  /** Extra tags for this placement (`lord`, `boss`, `guards`, …). */
  readonly tags?: readonly string[];
  /** For a structure: whose colours its flag wears (a faction palette); default neutral. */
  readonly faction?: string;
}

/** Units that arrive at the start of a phase. */
export interface Reinforcement {
  readonly turn: number;
  readonly phase: PhaseSide;
  readonly units: readonly SpawnSpec[];
}

const PHASE_SIDES: readonly PhaseSide[] = ['player', 'ally', 'enemy'];

/** The on-disk map format: one string per row, one character per tile, plus a legend. */
export interface MapJson {
  readonly id: string;
  readonly name: string;
  readonly size: readonly [number, number];
  readonly tileset?: string;
  readonly terrain: readonly string[];
  readonly legend: Readonly<Record<string, string>>;
  readonly spawns?: {
    readonly player?: readonly SpawnJson[];
    readonly ally?: readonly SpawnJson[];
    readonly enemy?: readonly SpawnJson[];
  };
  /** The order sides act in each turn; a side with no units is skipped. Default player, ally, enemy. */
  readonly phaseOrder?: readonly PhaseSide[];
  /** Fog of war (DESIGN §4.5). */
  readonly fog?: boolean;
  /** Vision lost to darkness or weather, in tiles. */
  readonly visionPenalty?: number;
  /** Tiles where fleeing units leave the map. */
  readonly exits?: readonly Tile[];
  /** The way the wind blows, which fire spreads along more readily. */
  readonly wind?: 'N' | 'E' | 'S' | 'W';
  readonly reinforcements?: readonly Reinforcement[];
  readonly objective?: ObjectiveDef;
  readonly events?: readonly EventDef[];
}

export interface MapRules {
  readonly wind: 'N' | 'E' | 'S' | 'W' | null;
  readonly phaseOrder: readonly PhaseSide[];
  readonly fog: boolean;
  readonly visionPenalty: number;
  readonly exits: readonly Tile[];
  readonly reinforcements: readonly Reinforcement[];
  readonly objective: ObjectiveDef | null;
  readonly events: readonly EventDef[];
}

export const DEFAULT_MAP_RULES: MapRules = {
  wind: null,
  phaseOrder: PHASE_SIDES,
  fog: false,
  visionPenalty: 0,
  exits: [],
  reinforcements: [],
  objective: null,
  events: [],
};

export class GameMap {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly spawns: NonNullable<MapJson['spawns']>;
  readonly rules: MapRules;
  private readonly tiles: readonly TerrainDef[];

  constructor(
    id: string,
    name: string,
    width: number,
    height: number,
    tiles: readonly TerrainDef[],
    spawns: NonNullable<MapJson['spawns']>,
    rules: Partial<MapRules> = {},
  ) {
    this.id = id;
    this.name = name;
    this.width = width;
    this.height = height;
    this.tiles = tiles;
    this.spawns = spawns;
    this.rules = { ...DEFAULT_MAP_RULES, ...rules };
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  terrainAt(x: number, y: number): TerrainDef {
    const tile = this.inBounds(x, y) ? this.tiles[y * this.width + x] : undefined;
    if (!tile) throw new RangeError(`Tile (${x}, ${y}) is outside the ${this.width}×${this.height} map`);
    return tile;
  }

  /** Movement cost of entering a tile, or null if the movement type cannot enter it. */
  costFor(x: number, y: number, moveType: MoveType): number | null {
    return this.terrainAt(x, y).cost[moveType];
  }
}

/** Parse and validate a map. Throws a descriptive error naming the map and the tile. */
export function parseMap(json: MapJson, table: TerrainTable): GameMap {
  const where = `Map "${json.id}"`;
  const [width, height] = json.size;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`${where}: invalid size ${width}×${height}`);
  }
  if (width > MAX_MAP_SIZE || height > MAX_MAP_SIZE) {
    throw new Error(`${where}: size ${width}×${height} exceeds ${MAX_MAP_SIZE}`);
  }
  if (json.terrain.length !== height) {
    throw new Error(`${where}: size says ${height} rows but terrain has ${json.terrain.length}`);
  }
  for (const [char, id] of Object.entries(json.legend)) {
    if (char.length !== 1) throw new Error(`${where}: legend key "${char}" must be one character`);
    if (!table.has(id)) throw new Error(`${where}: legend "${char}" names unknown terrain "${id}"`);
  }
  const tiles: TerrainDef[] = [];
  json.terrain.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`${where}: row ${y} has ${row.length} tiles, expected ${width}`);
    }
    for (let x = 0; x < width; x++) {
      const char = row.charAt(x);
      const id = json.legend[char];
      if (id === undefined) throw new Error(`${where}: no legend entry for "${char}" at (${x}, ${y})`);
      const def = table.get(id);
      if (!def) throw new Error(`${where}: unknown terrain "${id}"`);
      tiles.push(def);
    }
  });
  const spawns = json.spawns ?? {};
  for (const [side, list] of Object.entries(spawns)) {
    for (const spawn of list ?? []) {
      const [sx, sy] = spawn.at;
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) {
        throw new Error(`${where}: ${side} spawn "${spawn.unit}" at (${sx}, ${sy}) is outside the map`);
      }
      if (spawn.ai) validateAiProfile(spawn.ai, `${where}: ${side} spawn "${spawn.unit}"`);
    }
  }

  const inside = (t: Tile): boolean => Array.isArray(t) && t.length === 2 && Number.isInteger(t[0]) && Number.isInteger(t[1]) && t[0] >= 0 && t[1] >= 0 && t[0] < width && t[1] < height;
  const phaseOrder = json.phaseOrder ?? PHASE_SIDES;
  if (!phaseOrder.includes('player') || new Set(phaseOrder).size !== phaseOrder.length || phaseOrder.some((p) => !PHASE_SIDES.includes(p))) {
    throw new Error(`${where}: phaseOrder must list player, ally and enemy at most once each, and include player`);
  }
  const visionPenalty = json.visionPenalty ?? 0;
  if (!Number.isInteger(visionPenalty) || visionPenalty < 0 || visionPenalty > 3) throw new Error(`${where}: visionPenalty must be an integer from 0 to 3`);
  const exits = json.exits ?? [];
  for (const exit of exits) if (!inside(exit)) throw new Error(`${where}: exit (${String(exit)}) is outside the map`);
  const reinforcements = json.reinforcements ?? [];
  reinforcements.forEach((r, i) => {
    const label = `${where}: reinforcement #${i}`;
    if (!Number.isInteger(r.turn) || r.turn < 1) throw new Error(`${label} needs a turn of 1 or more`);
    if (!PHASE_SIDES.includes(r.phase)) throw new Error(`${label} has an unknown phase "${String(r.phase)}"`);
    if (!Array.isArray(r.units) || r.units.length === 0) throw new Error(`${label} needs units`);
    for (const u of r.units) {
      if (typeof u.def !== 'string' || !inside(u.at)) throw new Error(`${label} needs a def and an in-bounds tile for each unit`);
      if (u.ai) validateAiProfile(u.ai, label);
    }
  });
  if (json.wind !== undefined && !['N', 'E', 'S', 'W'].includes(json.wind)) throw new Error(`${where}: wind must be N, E, S or W`);
  const rules: MapRules = {
    wind: json.wind ?? null,
    phaseOrder,
    fog: json.fog ?? false,
    visionPenalty,
    exits,
    reinforcements,
    objective: validateObjective(json.objective, width, height, where),
    events: validateEvents(json.events, width, height, where),
  };
  return new GameMap(json.id, json.name, width, height, tiles, spawns, rules);
}
