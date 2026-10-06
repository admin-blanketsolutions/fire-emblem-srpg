/** Primitive types shared by the pure game core. No DOM, no randomness, no clocks. */

export type MoveType = 'foot' | 'light' | 'mounted' | 'armored';
export const MOVE_TYPES: readonly MoveType[] = ['foot', 'light', 'mounted', 'armored'];

export type Side = 'player' | 'ally' | 'enemy' | 'neutral';

/** A tile as written in data files: `[x, y]`. */
export type Tile = readonly [number, number];

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Hostility between two sides. Player and ally are friends; neutral is hostile to nobody. */
export function areHostile(a: Side, b: Side): boolean {
  if (a === 'neutral' || b === 'neutral') return false;
  return (a === 'enemy') !== (b === 'enemy');
}

/** Units of friendly sides can pass through each other. */
export function areFriendly(a: Side, b: Side): boolean {
  return a === b || (a !== 'enemy' && b !== 'enemy' && a !== 'neutral' && b !== 'neutral');
}
