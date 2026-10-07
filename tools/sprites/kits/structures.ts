import type { SpriteDef } from '../../../src/core/sprite';
import { Pix } from './pix';
import { CHAR_TO_INDEX, PALETTE } from './units';

/**
 * Gates, walls, barricades and siege engines (DESIGN §4.6), and the flames that burn on a tile.
 * They share the unit palette; the flag on a siege engine takes its faction's colours.
 */

const idx = (ch: string): number => CHAR_TO_INDEX[ch] ?? 0;
const [O, A, B, T, H, M, MH, W, L] = [idx('o'), idx('a'), idx('b'), idx('t'), idx('h'), idx('m'), idx('M'), idx('w'), idx('l')];

function structure(id: string, frames: Pix[]): SpriteDef {
  return {
    id,
    kind: 'map-unit',
    size: [16, 16],
    palette: PALETTE,
    slots: { faction: [4, 5, 6], skin: [2, 3] },
    frames: { idle: frames.map((p) => p.rows()) },
    anim: { idle: { fps: 2, loop: true } },
  };
}

/** A closed gate: a stone arch around two studded doors bound with iron. */
function gate(): Pix {
  const p = new Pix(16, 16, 0);
  p.rect(1, 1, 14, 15, M);
  p.rect(2, 3, 12, 13, W);
  p.vline(7, 3, 13, O);
  p.vline(8, 3, 13, O);
  p.hline(2, 3, 12, MH);
  p.hline(2, 6, 12, H);
  p.hline(2, 12, 12, H);
  for (const [x, y] of [[3, 8], [5, 8], [10, 8], [12, 8], [3, 10], [5, 10], [10, 10], [12, 10]] as const) p.set(x, y, L);
  p.hline(1, 2, 14, MH);
  p.set(6, 9, MH);
  p.set(9, 9, MH);
  p.outline(O);
  return p;
}

/** A length of wall: grey blocks laid in courses, with merlons along the top. */
function wallSegment(): Pix {
  const p = new Pix(16, 16, 0);
  p.rect(0, 5, 16, 11, M);
  for (const x of [0, 6, 12]) p.rect(x, 1, 4, 5, M);
  for (const x of [0, 6, 12]) p.hline(x, 1, 4, MH);
  p.hline(0, 5, 16, MH);
  for (const y of [8, 11, 14]) p.hline(0, y, 16, H);
  for (const [x, y0, y1] of [[5, 6, 7], [11, 6, 7], [2, 9, 10], [8, 9, 10], [14, 9, 10], [5, 12, 13], [11, 12, 13], [2, 15, 15], [8, 15, 15], [14, 15, 15]] as const) p.vline(x, y0, y1 - y0 + 1, H);
  p.outline(O);
  return p;
}

/** A barricade of sharpened stakes lashed across a log. */
function barricade(): Pix {
  const p = new Pix(16, 16, 0);
  for (const [x0, y0, x1, y1] of [[2, 14, 6, 4], [13, 14, 9, 4], [7, 15, 7, 3], [8, 15, 8, 3]] as const) {
    p.line(x0, y0, x1, y1, W);
    p.line(x0 + 1, y0, x1 + 1, y1, W);
  }
  p.line(6, 4, 6, 3, MH);
  p.line(9, 4, 9, 3, MH);
  p.rect(1, 9, 14, 3, W);
  p.hline(1, 9, 14, L);
  p.hline(1, 11, 14, H);
  for (const x of [4, 8, 12]) p.vline(x, 9, 3, T);
  p.outline(O);
  return p;
}

/** A mangonel: a timber frame on wheels, its throwing arm cocked, and a small flag. */
function mangonel(armUp: boolean): Pix {
  const p = new Pix(16, 16, 0);
  p.ellipse(3, 13, 2, 2, H);
  p.ellipse(12, 13, 2, 2, H);
  p.set(3, 13, L);
  p.set(12, 13, L);
  p.rect(1, 10, 14, 2, W);
  p.hline(1, 10, 14, L);
  p.rect(4, 5, 2, 5, W);
  p.rect(9, 5, 2, 5, W);
  p.hline(4, 5, 7, L);
  if (armUp) {
    p.line(11, 6, 3, 2, W);
    p.line(11, 7, 3, 3, W);
    p.rect(1, 0, 3, 2, L);
    p.set(2, 1, H);
  } else {
    p.line(5, 7, 13, 2, W);
    p.line(5, 8, 13, 3, W);
    p.rect(12, 0, 3, 2, L);
    p.set(13, 1, H);
  }
  p.vline(14, 6, 4, W);
  p.rect(14, 5, 2, 2, A);
  p.set(15, 7, B);
  p.outline(O);
  return p;
}

export function structureSprites(): SpriteDef[] {
  return [
    structure('unit.gate', [gate()]),
    structure('unit.wall-segment', [wallSegment()]),
    structure('unit.barricade', [barricade()]),
    structure('unit.mangonel', [mangonel(false), mangonel(true)]),
  ];
}

const FLAME_COLOURS = ['#00000000', '#7a1a10', '#d8431a', '#f29b2b', '#ffe27a'] as const;

/** One frame of flames: four tongues of the given heights, sway shifting them from side to side. */
function flames(heights: readonly [number, number, number, number], sway: number): Pix {
  const p = new Pix(16, 16, 0);
  [3, 7, 11, 14].forEach((cx, i) => {
    const h = heights[i] ?? 6;
    for (let k = 0; k < h; k++) {
      const y = 15 - k;
      const taper = Math.max(0, Math.round(((h - k) / h) * 2.6));
      const shift = Math.round(Math.sin((k + sway + i * 2) * 0.8));
      for (let dx = -taper; dx <= taper; dx++) {
        const depth = Math.abs(dx) / Math.max(1, taper);
        p.set(cx + dx + shift, y, depth > 0.7 ? 1 : k < h * 0.35 ? 4 : k < h * 0.65 ? 3 : 2);
      }
    }
  });
  p.hline(0, 15, 16, 1);
  return p;
}

/** Flames over a tile: three frames of flicker. */
export function flameSprites(): SpriteDef[] {
  const frames = [flames([12, 15, 11, 13], 0), flames([14, 11, 14, 12], 2), flames([11, 14, 12, 15], 4)];
  return [
    {
      id: 'ui.flames',
      kind: 'ui',
      size: [16, 16],
      palette: FLAME_COLOURS,
      frames: { burn: frames.map((p) => p.rows()) },
      anim: { burn: { fps: 6, loop: true } },
    },
  ];
}
