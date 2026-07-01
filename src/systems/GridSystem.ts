import { TileData, TerrainType, makeTile } from '@/entities/Tile';
import { UnitData } from '@/entities/Unit';

export const TILE_SIZE = 32;

export interface GridCell {
  x: number;
  y: number;
  tile: TileData;
}

export class GridSystem {
  readonly cols: number;
  readonly rows: number;
  private grid: GridCell[][];

  constructor(cols: number, rows: number, layout?: TerrainType[][]) {
    this.cols = cols;
    this.rows = rows;
    this.grid = [];

    for (let y = 0; y < rows; y++) {
      this.grid[y] = [];
      for (let x = 0; x < cols; x++) {
        const terrain: TerrainType = layout?.[y]?.[x] ?? 'plain';
        this.grid[y][x] = { x, y, tile: makeTile(terrain) };
      }
    }
  }

  getCell(x: number, y: number): GridCell | null {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return null;
    return this.grid[y][x];
  }

  /** Returns grid coords from pixel coords */
  pixelToGrid(px: number, py: number): { x: number; y: number } {
    return { x: Math.floor(px / TILE_SIZE), y: Math.floor(py / TILE_SIZE) };
  }

  /** Returns top-left pixel coords of a grid cell */
  gridToPixel(gx: number, gy: number): { x: number; y: number } {
    return { x: gx * TILE_SIZE, y: gy * TILE_SIZE };
  }

  /** BFS flood-fill to get reachable cells for a unit */
  getMovementRange(unit: UnitData, allUnits: UnitData[]): Set<string> {
    const enemyPositions = new Set(
      allUnits
        .filter(u => u.faction !== unit.faction)
        .map(u => `${u.gridX},${u.gridY}`)
    );

    const reachable = new Set<string>();
    // cost map: key = "x,y", value = remaining movement
    const queue: Array<{ x: number; y: number; remaining: number }> = [
      { x: unit.gridX, y: unit.gridY, remaining: unit.stats.mov },
    ];
    const visited = new Map<string, number>();

    while (queue.length > 0) {
      // Sort by remaining (descending) for greedy BFS — close enough for FE-style movement
      queue.sort((a, b) => b.remaining - a.remaining);
      const current = queue.shift()!;
      const key = `${current.x},${current.y}`;

      if ((visited.get(key) ?? -1) >= current.remaining) continue;
      visited.set(key, current.remaining);

      if (!enemyPositions.has(key)) {
        reachable.add(key);
      }

      const neighbors = [
        { x: current.x - 1, y: current.y },
        { x: current.x + 1, y: current.y },
        { x: current.x, y: current.y - 1 },
        { x: current.x, y: current.y + 1 },
      ];

      for (const n of neighbors) {
        const cell = this.getCell(n.x, n.y);
        if (!cell) continue;
        const cost = cell.tile.movCost;
        const remaining = current.remaining - cost;
        if (remaining < 0) continue;
        if (enemyPositions.has(`${n.x},${n.y}`)) continue;
        queue.push({ x: n.x, y: n.y, remaining });
      }
    }

    return reachable;
  }
}
