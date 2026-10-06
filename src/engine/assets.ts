import { validateFont, type FontDef } from '../core/font';
import { remapFor, type PaletteSet } from '../core/palettes';
import { allFrames, renderFrame, validateSpriteDef, type SpriteDef } from '../core/sprite';
import factionsJson from '../../assets/palettes/factions.json';
import skinsJson from '../../assets/palettes/skins.json';
import fontJson from '../../assets/fonts/majlis.font.json';

/** Every sprite definition, bundled with the game. The JSON files are the source of truth. */
const SPRITE_MODULES = import.meta.glob<unknown>('../../assets/sprites/*.sprite.json', { eager: true, import: 'default' });

/** How a sprite is coloured: faction and skin ramps, and the greyed look of a unit that has acted. */
export interface Look {
  readonly faction?: string;
  readonly skin?: string;
  readonly spent?: boolean;
}

interface OverrideManifest {
  /** Sprite id → PNG strip path, relative to `assets/override/`. */
  readonly sprites?: Readonly<Record<string, string>>;
}

type Canvas = HTMLCanvasElement;

function makeCanvas(width: number, height: number): Canvas {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toCanvas(image: { width: number; height: number; data: Uint8ClampedArray }): Canvas {
  const canvas = makeCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  ctx.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0);
  return canvas;
}

/** Desaturate and dim an image in place; transparent pixels stay transparent. */
function grey(image: { data: Uint8ClampedArray }): void {
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    if ((d[i + 3] ?? 0) === 0) continue;
    const luma = 0.3 * (d[i] ?? 0) + 0.59 * (d[i + 1] ?? 0) + 0.11 * (d[i + 2] ?? 0);
    const v = Math.round(luma * 0.62 + 34);
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v + 6;
  }
}

/**
 * Sprites, palettes and the font. Frames are rendered from their definitions on first use and
 * cached per look. Real art replaces a sprite by listing a PNG strip in
 * `public/assets/override/manifest.json` (see the README); overrides ignore faction and skin.
 */
export class Assets {
  readonly font: FontDef;
  private readonly defs = new Map<string, SpriteDef>();
  private readonly palettes: PaletteSet;
  private readonly cache = new Map<string, Canvas>();
  private readonly overrides = new Map<string, Canvas[]>();

  private constructor() {
    this.font = validateFont(fontJson, 'majlis.font.json');
    this.palettes = { factions: factionsJson, skins: skinsJson };
    for (const [path, raw] of Object.entries(SPRITE_MODULES)) {
      const def = validateSpriteDef(raw, path);
      this.defs.set(def.id, def);
    }
  }

  /** Load the bundled assets, then any optional overrides from `<baseUrl>assets/override/`. */
  static async load(baseUrl = '/'): Promise<Assets> {
    const assets = new Assets();
    await assets.loadOverrides(`${baseUrl}assets/override/`);
    return assets;
  }

  has(id: string): boolean {
    return this.defs.has(id);
  }

  def(id: string): SpriteDef {
    const def = this.defs.get(id);
    if (!def) throw new Error(`Unknown sprite "${id}"`);
    return def;
  }

  /** One frame of a sprite as a canvas, coloured for the given look. */
  frame(id: string, set: string, index: number, look: Look = {}): Canvas {
    const def = this.def(id);
    const key = `${id}|${set}|${index}|${look.faction ?? ''}|${look.skin ?? ''}|${look.spent ? 1 : 0}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const flat = allFrames(def).findIndex((f) => f.set === set && f.index === index);
    const overridden = flat >= 0 ? this.overrides.get(id)?.[flat] : undefined;
    let canvas: Canvas;
    if (overridden) {
      canvas = overridden;
    } else {
      const remap = look.faction && look.skin ? remapFor(this.palettes, look.faction, look.skin) : undefined;
      const image = renderFrame(def, set, index, remap);
      if (look.spent) grey(image);
      canvas = toCanvas(image);
    }
    this.cache.set(key, canvas);
    return canvas;
  }

  /** The frame of an animation at a point in time (frames come from the sprite's `anim` entry). */
  animFrame(id: string, animName: string, timeMs: number, look: Look = {}): Canvas {
    const def = this.def(id);
    const anim = def.anim?.[animName];
    const count = def.frames[animName]?.length ?? 1;
    const order = anim?.frames ?? Array.from({ length: count }, (_, i) => i);
    const fps = anim?.fps ?? 1;
    const step = Math.floor((Math.max(0, timeMs) * fps) / 1000);
    const index = anim?.loop === false ? Math.min(step, order.length - 1) : step % order.length;
    return this.frame(id, animName, order[index] ?? 0, look);
  }

  private async loadOverrides(base: string): Promise<void> {
    let manifest: OverrideManifest;
    try {
      const response = await fetch(`${base}manifest.json`);
      if (!response.ok) return;
      manifest = (await response.json()) as OverrideManifest;
    } catch {
      return; // no manifest (or the dev server's HTML fallback): nothing is overridden
    }
    for (const [id, file] of Object.entries(manifest.sprites ?? {})) {
      const def = this.defs.get(id);
      if (!def) {
        console.warn(`Override for unknown sprite "${id}" ignored`);
        continue;
      }
      try {
        const image = await loadImage(`${base}${file}`);
        const frames = allFrames(def);
        const [w, h] = def.size;
        if (image.width !== w * frames.length || image.height !== h) {
          console.warn(`Override ${file} for "${id}" must be ${w * frames.length}×${h}, got ${image.width}×${image.height}; ignored`);
          continue;
        }
        this.overrides.set(
          id,
          frames.map((_, i) => {
            const canvas = makeCanvas(w, h);
            canvas.getContext('2d')?.drawImage(image, i * w, 0, w, h, 0, 0, w, h);
            return canvas;
          }),
        );
      } catch {
        console.warn(`Override ${file} for "${id}" could not be loaded; ignored`);
      }
    }
    this.cache.clear();
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${src}`));
    image.src = src;
  });
}
