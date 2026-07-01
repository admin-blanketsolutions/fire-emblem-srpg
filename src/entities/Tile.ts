export type TerrainType = 'plain' | 'grass' | 'forest' | 'mountain' | 'fort' | 'castle';

export interface TileData {
  terrain: TerrainType;
  /** Movement cost for foot units */
  movCost: number;
  /** Avoid bonus */
  avoid: number;
  /** Defense bonus */
  defense: number;
}

export const TERRAIN_STATS: Record<TerrainType, Omit<TileData, 'terrain'>> = {
  plain:    { movCost: 1, avoid: 0,  defense: 0 },
  grass:    { movCost: 1, avoid: 10, defense: 0 },
  forest:   { movCost: 2, avoid: 20, defense: 1 },
  mountain: { movCost: 4, avoid: 30, defense: 2 },
  fort:     { movCost: 2, avoid: 20, defense: 2 },
  castle:   { movCost: 1, avoid: 30, defense: 3 },
};

export function makeTile(terrain: TerrainType): TileData {
  return { terrain, ...TERRAIN_STATS[terrain] };
}
