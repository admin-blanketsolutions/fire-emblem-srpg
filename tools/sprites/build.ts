import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { remapFor } from '../../src/core/palettes';
import { allFrames, renderFrame, type SpriteDef } from '../../src/core/sprite';
import { OUT_DIR, loadPalettes, loadSpriteDefs } from './lib';
import { encodePng, upscale } from './png';

/**
 * Render every sprite definition to a PNG strip (all frames left to right, set by set in the
 * order of the definition) plus an atlas, and a contact sheet for a quick look.
 * Real art replaces a sprite by providing a PNG in the same layout under
 * public/assets/override/sprites/<id>.png.
 */
const palettes = loadPalettes();
const sprites = loadSpriteDefs();
const outDir = join(OUT_DIR, 'strips');
mkdirSync(outDir, { recursive: true });

interface AtlasEntry {
  id: string;
  size: readonly [number, number];
  sets: Array<{ name: string; frames: number }>;
  file: string;
}
const atlas: AtlasEntry[] = [];

function render(def: SpriteDef, faction: string, skin: string): { width: number; height: number; data: Uint8Array } {
  const frames = allFrames(def);
  const [w, h] = def.size;
  const width = w * frames.length;
  const data = new Uint8Array(width * h * 4);
  frames.forEach(({ set, index }, i) => {
    const img = renderFrame(def, set, index, remapFor(palettes, faction, skin));
    for (let y = 0; y < h; y++) {
      data.set(img.data.subarray(y * w * 4, (y + 1) * w * 4), (y * width + i * w) * 4);
    }
  });
  return { width, height: h, data };
}

for (const { def } of sprites) {
  const strip = render(def, 'ayyubid', 's2');
  const file = `${def.id}.png`;
  writeFileSync(join(outDir, file), encodePng(strip.width, strip.height, strip.data));
  const sets = Object.entries(def.frames).map(([name, frames]) => ({ name, frames: frames.length }));
  atlas.push({ id: def.id, size: def.size, sets, file: `sprites/${file}` });
}
writeFileSync(join(OUT_DIR, 'atlas.json'), `${JSON.stringify(atlas, null, 2)}\n`);

// Contact sheets: one per sprite kind, laid out as a grid and enlarged for a quick visual check.
interface SheetSpec {
  name: string;
  columns: number;
  scale: number;
  select: (def: SpriteDef) => boolean;
}
const SHEETS: SheetSpec[] = [
  { name: 'units', columns: 3, scale: 6, select: (d) => d.kind === 'map-unit' },
  { name: 'tiles', columns: 7, scale: 6, select: (d) => d.kind === 'tile' },
  { name: 'ui', columns: 4, scale: 6, select: (d) => d.kind === 'ui' },
];
const GAP = 3;

function writeSheet({ name, columns, scale, select }: SheetSpec): void {
  const chosen = sprites.map(({ def }) => def).filter(select);
  if (chosen.length === 0) return;
  const frameCount = Math.max(...chosen.map((d) => allFrames(d).length));
  const cellW = Math.max(...chosen.map((d) => d.size[0])) * frameCount + GAP;
  const cellH = Math.max(...chosen.map((d) => d.size[1])) + GAP;
  const rows = Math.ceil(chosen.length / columns);
  const width = columns * cellW + GAP;
  const height = rows * cellH + GAP;
  const sheet = new Uint8Array(width * height * 4);
  for (let i = 0; i < sheet.length; i += 4) {
    sheet[i] = 0x3a;
    sheet[i + 1] = 0x7c;
    sheet[i + 2] = 0x3c;
    sheet[i + 3] = 255;
  }
  chosen.forEach((def, n) => {
    const isUnit = def.kind === 'map-unit';
    // vary faction and skin along the sheet so the remapping is visible too
    const strip = render(def, isUnit && n % 2 === 1 ? 'frankish' : 'ayyubid', isUnit ? `s${(n % 5) + 1}` : 's2');
    const ox = GAP + (n % columns) * cellW;
    const oy = GAP + Math.floor(n / columns) * cellH;
    for (let y = 0; y < strip.height; y++) {
      for (let x = 0; x < strip.width; x++) {
        const src = (y * strip.width + x) * 4;
        if ((strip.data[src + 3] ?? 0) === 0) continue;
        const dst = ((oy + y) * width + ox + x) * 4;
        sheet[dst] = strip.data[src] ?? 0;
        sheet[dst + 1] = strip.data[src + 1] ?? 0;
        sheet[dst + 2] = strip.data[src + 2] ?? 0;
        sheet[dst + 3] = 255;
      }
    }
  });
  const big = upscale(width, height, sheet, scale);
  writeFileSync(join(OUT_DIR, `contact-${name}.png`), encodePng(big.width, big.height, big.data));
}
for (const spec of SHEETS) writeSheet(spec);
console.log(`Built ${sprites.length} sprites into ${outDir}`);
console.log(`Contact sheets: ${join(OUT_DIR, 'contact-*.png')}`);
