import { isActive, isHolding, unitReach } from './ai';
import type { BattleState } from './battle';
import { tileKey } from './grid';
import { areHostile, type Side } from './types';
import type { UnitInstance } from './unit';

/** The tiles one unit threatens, split into those it threatens now and those it would if it woke. */
export interface Threat {
  readonly active: Set<number>;
  readonly latent: Set<number>;
}

/**
 * Where a unit can attack (DESIGN §4.4). A unit holding its post threatens only what is in range
 * of its own tile; a defensive unit that has not woken, or a unit that has not been activated,
 * also threatens the larger area it would cover once it moves, shown separately as "latent".
 */
export function threatOf(battle: BattleState, unit: UnitInstance): Threat {
  const keys = (tiles: ReadonlyArray<{ x: number; y: number }>): Set<number> => new Set(tiles.map((p) => tileKey(p.x, p.y)));
  const full = keys(battle.threatTiles(unit, battle.reachFor(unit)));
  if (!isActive(battle, unit)) return { active: new Set(), latent: full };
  if (!isHolding(battle, unit)) return { active: full, latent: new Set() };
  const here = keys(battle.threatTiles(unit, unitReach(battle, unit)));
  const latent = new Set<number>();
  if (unit.ai?.mode === 'defensive') for (const key of full) if (!here.has(key)) latent.add(key);
  return { active: here, latent };
}

export interface DangerZone {
  /** Tiles some visible opposing unit can strike on its next turn. */
  readonly active: Set<number>;
  /** Tiles that would be dangerous if sleeping units woke; never overlaps `active`. */
  readonly latent: Set<number>;
  readonly perUnit: ReadonlyMap<string, Threat>;
}

/**
 * The danger zone for a viewing side: the union of every opposing unit's threat. With fog of
 * war, only units the player can currently see contribute, so the zone never gives away what the
 * player has not found.
 */
export function dangerZone(battle: BattleState, viewer: Side = 'player'): DangerZone {
  const active = new Set<number>();
  const latent = new Set<number>();
  const perUnit = new Map<string, Threat>();
  for (const unit of battle.livingUnits()) {
    if (!areHostile(viewer, unit.side)) continue;
    if (viewer === 'player' && !battle.isVisible(unit.x, unit.y)) continue;
    const threat = threatOf(battle, unit);
    perUnit.set(unit.id, threat);
    for (const key of threat.active) active.add(key);
    for (const key of threat.latent) latent.add(key);
  }
  for (const key of active) latent.delete(key);
  return { active, latent, perUnit };
}
