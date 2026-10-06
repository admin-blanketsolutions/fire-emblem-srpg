import { MAX_MAP_SIZE } from './grid';
import type { TerrainDef, TerrainTable } from './terrain';
import type { MoveType } from './types';

export interface SpawnJson {
  readonly unit: string;
  readonly at: readonly [number, number];
}

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
}

export class GameMap {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly spawns: NonNullable<MapJson['spawns']>;
  private readonly tiles: readonly TerrainDef[];

  constructor(
    id: string,
    name: string,
    width: number,
    height: number,
    tiles: readonly TerrainDef[],
    spawns: NonNullable<MapJson['spawns']>,
  ) {
    this.id = id;
    this.name = name;
    this.width = width;
    this.height = height;
    this.tiles = tiles;
    this.spawns = spawns;
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
    }
  }
  return new GameMap(json.id, json.name, width, height, tiles, spawns);
}
