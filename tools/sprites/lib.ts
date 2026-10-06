import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PaletteSet } from '../../src/core/palettes';
import { validateSpriteDef, type SpriteDef } from '../../src/core/sprite';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SPRITES_DIR = join(ROOT, 'assets', 'sprites');
export const PALETTES_DIR = join(ROOT, 'assets', 'palettes');
export const FONT_PATH = join(ROOT, 'assets', 'fonts', 'majlis.font.json');
/** Tool output (PNG strips, atlas, contact sheets). Git-ignored and not shipped with the game. */
export const OUT_DIR = join(ROOT, 'out', 'sprites');

export interface LoadedSprite {
  readonly file: string;
  readonly def: SpriteDef;
}

/** Read and validate every sprite definition. Throws on the first invalid file. */
export function loadSpriteDefs(dir: string = SPRITES_DIR): LoadedSprite[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sprite.json'))
    .sort()
    .map((file) => {
      const raw: unknown = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      const def = validateSpriteDef(raw, file);
      if (`${def.id}.sprite.json` !== file) {
        throw new Error(`${file}: the file name must be "${def.id}.sprite.json"`);
      }
      return { file, def };
    });
}

export function loadPalettes(dir: string = PALETTES_DIR): PaletteSet {
  const read = (name: string): Record<string, string[]> =>
    JSON.parse(readFileSync(join(dir, name), 'utf8')) as Record<string, string[]>;
  return { factions: read('factions.json'), skins: read('skins.json') };
}

/** Pretty-print a sprite definition with one frame row per line, so diffs show pixel changes. */
export function formatSpriteJson(def: SpriteDef): string {
  const lines: string[] = ['{'];
  lines.push(`  "id": ${JSON.stringify(def.id)},`);
  lines.push(`  "kind": ${JSON.stringify(def.kind)},`);
  lines.push(`  "size": ${JSON.stringify(def.size)},`);
  lines.push(`  "palette": ${JSON.stringify(def.palette)},`);
  if (def.slots) lines.push(`  "slots": ${JSON.stringify(def.slots)},`);
  lines.push('  "frames": {');
  const sets = Object.entries(def.frames);
  sets.forEach(([name, frames], si) => {
    lines.push(`    ${JSON.stringify(name)}: [`);
    frames.forEach((frame, fi) => {
      lines.push('      [');
      frame.forEach((row, ri) => lines.push(`        ${JSON.stringify(row)}${ri < frame.length - 1 ? ',' : ''}`));
      lines.push(`      ]${fi < frames.length - 1 ? ',' : ''}`);
    });
    lines.push(`    ]${si < sets.length - 1 ? ',' : ''}`);
  });
  lines.push(def.anim ? '  },' : '  }');
  if (def.anim) lines.push(`  "anim": ${JSON.stringify(def.anim)}`);
  lines.push('}');
  return `${lines.join('\n')}\n`;
}
