import { usedIndices, type SpriteDef } from '../../../src/core/sprite';

/**
 * Drop palette entries a sprite never draws and renumber the rest, so each definition carries
 * only its own colours. Recolour slots are positional (the n-th slot takes the n-th ramp colour),
 * so a slot is trimmed only from the end of its list; a gap in the middle stays in the palette.
 */
export function compactSprite(def: SpriteDef): SpriteDef {
  const used = usedIndices(def);
  const trimTrailing = (slots: readonly number[] | undefined): readonly number[] | undefined => {
    if (!slots) return undefined;
    let end = slots.length;
    while (end > 0 && !used.has(slots[end - 1] as number)) end--;
    return slots.slice(0, end);
  };
  const faction = trimTrailing(def.slots?.faction);
  const skin = trimTrailing(def.slots?.skin);

  const keep = new Set<number>([...used, ...(faction ?? []), ...(skin ?? [])]);
  const order = [0, ...[...keep].filter((i) => i > 0).sort((a, b) => a - b)];
  const renumber = new Map(order.map((oldIndex, newIndex) => [oldIndex, newIndex]));
  const mapIndex = (i: number): number => renumber.get(i) ?? 0;

  const frames = Object.fromEntries(
    Object.entries(def.frames).map(([set, list]) => [
      set,
      list.map((frame) => frame.map((row) => [...row].map((ch) => mapIndex(Number.parseInt(ch, 16)).toString(16)).join(''))),
    ]),
  );
  const slotGroups = {
    ...(faction && faction.length > 0 ? { faction: faction.map(mapIndex) } : {}),
    ...(skin && skin.length > 0 ? { skin: skin.map(mapIndex) } : {}),
  };
  return {
    id: def.id,
    kind: def.kind,
    size: def.size,
    palette: order.map((i) => def.palette[i] as string),
    ...(Object.keys(slotGroups).length > 0 ? { slots: slotGroups } : {}),
    frames,
    ...(def.anim ? { anim: def.anim } : {}),
  };
}
