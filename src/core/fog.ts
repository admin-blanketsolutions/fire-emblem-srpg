import type { BattleState } from './battle';
import { tileKey } from './grid';
import type { MoveType, Side } from './types';
import type { UnitInstance } from './unit';

/** Fog of war (DESIGN §4.5): what each side can see, as a set of tile keys. */

/** Vision radius in tiles by movement type. */
export const VISION: Readonly<Record<MoveType, number>> = { foot: 3, light: 4, mounted: 4, armored: 3 };

/** A unit's vision radius: its movement type's, plus the terrain bonus, less the map's penalty; at least 1. */
export function visionRadius(battle: BattleState, unit: UnitInstance): number {
  const bonus = battle.terrainAt(unit.x, unit.y).vision ?? 0;
  return Math.max(1, VISION[unit.moveType] + bonus - battle.map.rules.visionPenalty);
}

/** Every tile within sight of any living unit of the given sides. */
export function computeVisible(battle: BattleState, sides: readonly Side[]): Set<number> {
  const seen = new Set<number>();
  const { width, height } = battle.map;
  for (const unit of battle.units) {
    if (unit.retreated || unit.kind !== 'unit' || !sides.includes(unit.side)) continue;
    const r = visionRadius(battle, unit);
    for (let dy = -r; dy <= r; dy++) {
      const span = r - Math.abs(dy);
      for (let dx = -span; dx <= span; dx++) {
        const x = unit.x + dx;
        const y = unit.y + dy;
        if (x >= 0 && y >= 0 && x < width && y < height) seen.add(tileKey(x, y));
      }
    }
  }
  return seen;
}
