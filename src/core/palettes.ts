import type { RemapSpec } from './sprite';

/** Faction colours (primary, secondary, trim) and skin ramps (light, shade), by name. */
export interface PaletteSet {
  readonly factions: Readonly<Record<string, readonly string[]>>;
  readonly skins: Readonly<Record<string, readonly string[]>>;
}

export function remapFor(set: PaletteSet, faction: string, skin: string): RemapSpec {
  const f = set.factions[faction];
  const s = set.skins[skin];
  if (!f) throw new Error(`Unknown faction palette "${faction}"`);
  if (!s) throw new Error(`Unknown skin ramp "${skin}"`);
  return { faction: f, skin: s };
}
