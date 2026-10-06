/**
 * Palette-indexed sprites. A sprite definition is plain JSON: a palette of at most 16 entries
 * (index 0 transparent, so at most 15 colours) and frames of hex-digit rows. This module is pure:
 * it validates definitions and renders frames to RGBA, and is shared by the browser and the tools.
 */

export type SpriteKind = 'map-unit' | 'tile' | 'battle' | 'portrait' | 'ui' | 'icon';

export const SPRITE_KINDS: readonly SpriteKind[] = ['map-unit', 'tile', 'battle', 'portrait', 'ui', 'icon'];

export interface SpriteAnim {
  readonly fps: number;
  /** Frame order; defaults to every frame of the set in order. */
  readonly frames?: readonly number[];
  readonly loop?: boolean;
}

export interface SpriteDef {
  readonly id: string;
  readonly kind: SpriteKind;
  readonly size: readonly [number, number];
  /** Hex colours; index 0 must be fully transparent. At most 16 entries. */
  readonly palette: readonly string[];
  /** Palette indices that are replaced per faction or skin ramp at render time. */
  readonly slots?: {
    readonly faction?: readonly number[];
    readonly skin?: readonly number[];
  };
  /** Frame sets by name; each frame is `size[1]` rows of `size[0]` hex digits. */
  readonly frames: Readonly<Record<string, ReadonlyArray<readonly string[]>>>;
  readonly anim?: Readonly<Record<string, SpriteAnim>>;
}

export type Rgba = readonly [number, number, number, number];

export interface RemapSpec {
  readonly faction?: readonly string[];
  readonly skin?: readonly string[];
}

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** Expected frame size per sprite kind, checked by the lint (not by the loader). */
export const KIND_SIZES: Readonly<Record<SpriteKind, ReadonlyArray<readonly [number, number]>>> = {
  'map-unit': [[16, 16]],
  tile: [[16, 16]],
  battle: [[32, 32]],
  portrait: [[32, 32]],
  ui: [
    [8, 8],
    [16, 16],
    [16, 8],
    [8, 16],
  ],
  icon: [
    [8, 8],
    [16, 16],
  ],
};

const COLOR_RE = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

export function parseColor(hex: string): Rgba {
  if (!COLOR_RE.test(hex)) throw new Error(`Invalid colour "${hex}" (use #rrggbb or #rrggbbaa)`);
  const n = (i: number): number => Number.parseInt(hex.slice(i, i + 2), 16);
  return [n(1), n(3), n(5), hex.length === 9 ? n(7) : 255];
}

function fail(source: string, message: string): never {
  throw new Error(`${source}: ${message}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validate untrusted JSON as a sprite definition. Throws an error that names the source. */
export function validateSpriteDef(raw: unknown, source = 'sprite'): SpriteDef {
  if (!isRecord(raw)) return fail(source, 'definition must be an object');
  const id = raw['id'];
  if (typeof id !== 'string' || id.length === 0) return fail(source, 'missing "id"');
  const where = `${source} (${id})`;
  const kind = raw['kind'];
  if (typeof kind !== 'string' || !SPRITE_KINDS.includes(kind as SpriteKind)) {
    return fail(where, `"kind" must be one of ${SPRITE_KINDS.join(', ')}`);
  }
  const size = raw['size'];
  if (
    !Array.isArray(size) ||
    size.length !== 2 ||
    !size.every((n) => Number.isInteger(n) && (n as number) > 0)
  ) {
    return fail(where, '"size" must be [width, height] of positive integers');
  }
  const [w, h] = size as [number, number];

  const palette = raw['palette'];
  if (!Array.isArray(palette) || palette.length < 1 || palette.length > 16) {
    return fail(where, 'palette must have 1 to 16 entries (index 0 transparent, so at most 15 colours)');
  }
  palette.forEach((c, i) => {
    if (typeof c !== 'string') fail(where, `palette[${i}] must be a string`);
    try {
      parseColor(c as string);
    } catch (e) {
      fail(where, `palette[${i}]: ${(e as Error).message}`);
    }
  });
  const transparent = parseColor(palette[0] as string);
  if (transparent[3] !== 0) return fail(where, 'palette[0] must be fully transparent (e.g. #00000000)');

  const slots = raw['slots'];
  if (slots !== undefined) {
    if (!isRecord(slots)) return fail(where, '"slots" must be an object');
    for (const [name, list] of Object.entries(slots)) {
      if (name !== 'faction' && name !== 'skin') return fail(where, `unknown slot group "${name}"`);
      if (!Array.isArray(list)) return fail(where, `slots.${name} must be an array`);
      for (const idx of list) {
        if (!Number.isInteger(idx) || (idx as number) < 1 || (idx as number) >= palette.length) {
          return fail(where, `slots.${name} index ${String(idx)} is outside palette 1..${palette.length - 1}`);
        }
      }
    }
  }

  const frames = raw['frames'];
  if (!isRecord(frames) || Object.keys(frames).length === 0) return fail(where, '"frames" must name at least one set');
  for (const [setName, set] of Object.entries(frames)) {
    if (!Array.isArray(set) || set.length === 0) return fail(where, `frames.${setName} must be a non-empty array`);
    set.forEach((frame, fi) => {
      if (!Array.isArray(frame) || frame.length !== h) {
        fail(where, `frames.${setName}[${fi}] must have ${h} rows`);
      }
      (frame as unknown[]).forEach((row, ri) => {
        if (typeof row !== 'string' || row.length !== w) {
          fail(where, `frames.${setName}[${fi}] row ${ri} must be a string of ${w} digits`);
        }
        for (const ch of row as string) {
          const v = Number.parseInt(ch, 16);
          if (Number.isNaN(v) || !/^[0-9a-f]$/.test(ch)) {
            fail(where, `frames.${setName}[${fi}] row ${ri} has "${ch}"; use hex digits 0-9a-f`);
          }
          if (v >= palette.length) {
            fail(where, `frames.${setName}[${fi}] row ${ri} uses index ${ch} but the palette has ${palette.length} entries`);
          }
        }
      });
    });
  }

  const anim = raw['anim'];
  if (anim !== undefined) {
    if (!isRecord(anim)) return fail(where, '"anim" must be an object');
    for (const [name, a] of Object.entries(anim)) {
      const set = frames[name];
      if (!Array.isArray(set)) return fail(where, `anim.${name} refers to a missing frame set`);
      if (!isRecord(a) || typeof a['fps'] !== 'number' || (a['fps'] as number) <= 0) {
        return fail(where, `anim.${name}.fps must be a positive number`);
      }
      const order = a['frames'];
      if (order !== undefined) {
        if (!Array.isArray(order) || order.some((n) => !Number.isInteger(n) || (n as number) < 0 || (n as number) >= set.length)) {
          return fail(where, `anim.${name}.frames has an index outside 0..${set.length - 1}`);
        }
      }
    }
  }
  return raw as unknown as SpriteDef;
}

export function frameCount(def: SpriteDef, setName: string): number {
  return def.frames[setName]?.length ?? 0;
}

/** Every (set, index) pair in definition order. This is also the layout of a sprite's PNG strip. */
export function allFrames(def: SpriteDef): Array<{ set: string; index: number }> {
  const out: Array<{ set: string; index: number }> = [];
  for (const [set, frames] of Object.entries(def.frames)) {
    frames.forEach((_, index) => out.push({ set, index }));
  }
  return out;
}

/** The palette indices (other than 0) that appear in at least one frame. */
export function usedIndices(def: SpriteDef): Set<number> {
  const used = new Set<number>();
  for (const frames of Object.values(def.frames)) {
    for (const frame of frames) {
      for (const row of frame) {
        for (const ch of row) {
          const v = Number.parseInt(ch, 16);
          if (v !== 0) used.add(v);
        }
      }
    }
  }
  return used;
}

/** The palette as RGBA, with faction and skin slots replaced by the given ramps. */
export function resolvePalette(def: SpriteDef, remap?: RemapSpec): Rgba[] {
  const colors = def.palette.map((c) => parseColor(c));
  const apply = (slots: readonly number[] | undefined, ramp: readonly string[] | undefined): void => {
    if (!slots || !ramp) return;
    slots.forEach((slot, i) => {
      const replacement = ramp[i];
      if (replacement !== undefined) colors[slot] = parseColor(replacement);
    });
  };
  apply(def.slots?.faction, remap?.faction);
  apply(def.slots?.skin, remap?.skin);
  return colors;
}

/** Render one frame to RGBA. */
export function renderFrame(def: SpriteDef, setName: string, index: number, remap?: RemapSpec): RgbaImage {
  const frame = def.frames[setName]?.[index];
  if (!frame) throw new RangeError(`Sprite "${def.id}" has no frame ${setName}[${index}]`);
  const [width, height] = def.size;
  const colors = resolvePalette(def, remap);
  const data = new Uint8ClampedArray(width * height * 4);
  frame.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const color = colors[Number.parseInt(row.charAt(x), 16)];
      if (!color) continue;
      const o = (y * width + x) * 4;
      data[o] = color[0];
      data[o + 1] = color[1];
      data[o + 2] = color[2];
      data[o + 3] = color[3];
    }
  });
  return { width, height, data };
}
