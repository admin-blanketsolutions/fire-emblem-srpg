import { createRng, hashSeed } from '../../../src/core/rng';
import type { SpriteDef } from '../../../src/core/sprite';
import { Pix } from './pix';

type Rand = () => number;
type Painter = (p: Pix, rand: Rand) => void;

const TRANSPARENT = '#00000000';

/** Build a 16×16 terrain tile from colours (indices start at 1) and a painter. */
function tile(id: string, colors: readonly string[], paint: Painter): SpriteDef {
  const p = new Pix(16, 16, 1);
  const rng = createRng(hashSeed('tile', id));
  paint(p, () => rng.next());
  return {
    id: `tile.${id}`,
    kind: 'tile',
    size: [16, 16],
    palette: [TRANSPARENT, ...colors],
    frames: { still: [p.rows()] },
  };
}

/** Fill a solid triangle (barycentric rasterisation). */
function triangle(p: Pix, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, index: number): void {
  const minX = Math.min(x0, x1, x2);
  const maxX = Math.max(x0, x1, x2);
  const minY = Math.min(y0, y1, y2);
  const maxY = Math.max(y0, y1, y2);
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (area === 0) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w0 = ((x1 - x) * (y2 - y) - (x2 - x) * (y1 - y)) / area;
      const w1 = ((x2 - x) * (y0 - y) - (x0 - x) * (y2 - y)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 >= -0.001 && w1 >= -0.001 && w2 >= -0.001) p.set(x, y, index);
    }
  }
}

/** Speckled ground used under buildings and tents. Uses indices 1 and 2. */
function ground(p: Pix, rand: Rand): void {
  p.fill(1);
  p.scatter(rand, 2, 18, [1]);
}

const GROUND = ['#b5a26a', '#a28f58'];

export function terrainSprites(): SpriteDef[] {
  const tiles: SpriteDef[] = [];

  tiles.push(
    // Open ground is a muted green so it stays clearly apart from roads (tan) and steppe (dry yellow).
    tile('plain', ['#9aac5e', '#8a9c50', '#adbd72', '#6f8a3e'], (p, r) => {
      p.scatter(r, 2, 16, [1]);
      p.scatter(r, 3, 10, [1]);
      for (let i = 0; i < 4; i++) {
        const x = 2 + Math.floor(r() * 12);
        const y = 3 + Math.floor(r() * 11);
        p.set(x, y, 4);
        p.set(x - 1, y - 1, 4);
        p.set(x + 1, y - 1, 4);
      }
    }),
  );

  tiles.push(
    tile('steppe', ['#c8b35e', '#a8963f', '#dcc878', '#8f8d38', '#e4d58a'], (p, r) => {
      p.scatter(r, 2, 14, [1]);
      p.scatter(r, 3, 12, [1]);
      p.scatter(r, 5, 6, [1]);
      for (let i = 0; i < 8; i++) {
        const x = 1 + Math.floor(r() * 14);
        const y = 2 + Math.floor(r() * 13);
        p.set(x, y, 4);
        p.set(x, y - 1, 4);
        p.set(x - 1, y - 2, 4);
        p.set(x + 1, y - 2, 4);
      }
    }),
  );

  tiles.push(
    tile('road', ['#c4a468', '#a3844c', '#dcc08a', '#8e7240'], (p, r) => {
      for (let y = 0; y < 16; y++) {
        if (r() < 0.55) p.set(0, y, 2);
        if (r() < 0.55) p.set(15, y, 2);
        if (r() < 0.3) p.set(1, y, 4);
        if (r() < 0.3) p.set(14, y, 4);
      }
      for (let y = 0; y < 16; y += 3) {
        p.set(5, y, 3);
        p.set(10, y + 1, 3);
      }
      p.scatter(r, 2, 8, [1]);
      p.scatter(r, 3, 6, [1]);
    }),
  );

  tiles.push(
    tile('grove', ['#7a9a3c', '#678a32', '#6b4a2b', '#2c6a30', '#44903f', '#6fb552', '#4f6f2a'], (p, r) => {
      p.scatter(r, 2, 22, [1]);
      p.ellipse(7, 14, 5, 1, 7);
      p.ellipse(12, 13, 3, 1, 7);
      const palm = (cx: number, cy: number, height: number, reach: number): void => {
        p.line(cx - 1, cy, cx, cy - height, 3);
        const top = { x: cx, y: cy - height };
        const dirs: ReadonlyArray<readonly [number, number]> = [
          [-reach, 1], [-reach + 1, -1], [-1, -reach + 1], [1, -reach + 1], [reach - 1, -1], [reach, 1], [0, -reach],
        ];
        dirs.forEach(([dx, dy], i) => {
          p.line(top.x, top.y, top.x + dx, top.y + dy, i % 2 === 0 ? 4 : 5);
          p.set(top.x + dx, top.y + dy - 1, 6);
        });
        p.set(top.x, top.y, 4);
      };
      palm(7, 14, 7, 4);
      palm(12, 12, 5, 3);
    }),
  );

  tiles.push(
    tile('hill', ['#8aa24e', '#7d964a', '#62803b', '#a8c064', '#4f6a30'], (p, r) => {
      p.scatter(r, 2, 14, [1]);
      const cx = 8;
      const cy = 11;
      const rx = 7;
      const ry = 5;
      const inside = (x: number, y: number): boolean => ((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry) <= 1;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (inside(x, y)) p.set(x, y, 2);
      p.ellipse(6, 9, 4, 2, 4);
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          if (!inside(x, y)) continue;
          if (x - cx + (y - cy) > 4) p.set(x, y, 3);
          const edge = !inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1);
          if (edge) p.set(x, y, y >= cy ? 5 : 3);
        }
      }
    }),
  );

  tiles.push(
    tile('crag', ['#8e8a96', '#5e5a68', '#b6b2c0', '#3f3b4a', '#7d8250'], (p, r) => {
      p.fill(5);
      p.scatter(r, 1, 10, [5]);
      triangle(p, 1, 15, 6, 2, 11, 15, 1);
      triangle(p, 8, 15, 12, 4, 15, 15, 1);
      triangle(p, 6, 2, 11, 15, 8, 15, 2);
      triangle(p, 12, 4, 15, 15, 13, 15, 2);
      p.line(6, 2, 2, 14, 3);
      p.line(12, 4, 9, 14, 3);
      p.line(7, 6, 8, 10, 4);
      p.line(8, 10, 6, 13, 4);
      p.line(12, 8, 13, 12, 4);
      p.hline(1, 15, 14, 4);
    }),
  );

  tiles.push(
    tile('dune', ['#e2c88e', '#c9a96a', '#f0dca8', '#a98a52'], (p, r) => {
      for (const base of [3, 8, 13]) {
        for (let x = 0; x < 16; x++) {
          const y = base + Math.round(Math.sin((x / 16) * Math.PI * 2) * 1.5);
          p.set(x, y, 3);
          p.set(x, y + 1, 2);
          if (x % 3 !== 0) p.set(x, y + 2, 2);
        }
      }
      p.scatter(r, 4, 5, [2]);
    }),
  );

  tiles.push(
    tile('reeds', ['#5a9fc0', '#7fbcd6', '#3f7fa3', '#3f7a3f', '#2a5a2c', '#9ab04f'], (p, r) => {
      p.scatter(r, 3, 10, [1]);
      for (let i = 0; i < 6; i++) p.hline(Math.floor(r() * 12), 1 + Math.floor(r() * 14), 3, 2);
      for (const x of [1, 3, 5, 7, 9, 11, 13, 14]) {
        const height = 5 + Math.floor(r() * 5);
        const top = 15 - height;
        p.vline(x, top, height, r() < 0.5 ? 4 : 5);
        p.set(x, top - 1, 6);
        if (r() < 0.5) p.set(x + 1, top + 2, 4);
      }
    }),
  );

  tiles.push(
    tile('shallows', ['#7fc2d6', '#a5dbe8', '#5aa5c0', '#d8c892'], (p, r) => {
      for (let i = 0; i < 3; i++) p.ellipse(2 + Math.floor(r() * 12), 2 + Math.floor(r() * 12), 2, 1, 4);
      for (let i = 0; i < 10; i++) p.hline(Math.floor(r() * 13), Math.floor(r() * 16), 2 + Math.floor(r() * 2), 2);
      for (let i = 0; i < 6; i++) p.hline(Math.floor(r() * 13), Math.floor(r() * 16), 2, 3);
    }),
  );

  tiles.push(
    tile('river', ['#3a78ac', '#4f93c4', '#78b4dc', '#d8ecf6'], (p, r) => {
      for (const base of [2, 6, 10, 14]) {
        const offset = Math.floor(r() * 6);
        for (let x = offset; x < 16; x += 7) {
          p.hline(x, base, 4, 2);
          p.hline(x + 1, base - 1, 2, 3);
        }
      }
      p.scatter(r, 4, 3, [1, 2]);
    }),
  );

  tiles.push(
    tile('bridge', ['#3a78ac', '#4f93c4', '#9a6b3a', '#6b4524', '#b98a52', '#4a2f18'], (p, r) => {
      p.scatter(r, 2, 20, [1]);
      p.rect(0, 4, 16, 8, 3);
      for (let x = 0; x < 16; x += 4) p.vline(x, 4, 8, 4);
      p.scatter(r, 5, 8, [3]);
      p.hline(0, 2, 16, 6);
      p.hline(0, 3, 16, 5);
      p.hline(0, 12, 16, 5);
      p.hline(0, 13, 16, 6);
      for (let x = 1; x < 16; x += 5) {
        p.vline(x, 1, 3, 6);
        p.vline(x, 12, 3, 6);
      }
    }),
  );

  tiles.push(
    tile('pier', ['#3a78ac', '#9a6b3a', '#6b4524', '#b98a52', '#4a2f18'], (p, r) => {
      p.scatter(r, 3, 6, [1]);
      p.rect(2, 0, 12, 16, 2);
      for (let y = 3; y < 16; y += 4) p.hline(2, y, 12, 3);
      p.scatter(r, 4, 10, [2]);
      for (const [x, y] of [[1, 1], [14, 1], [1, 9], [14, 9]] as const) p.rect(x, y, 1, 3, 5);
    }),
  );

  tiles.push(
    tile(
      'house',
      [...GROUND, '#d9c9a0', '#b9a97e', '#a8482e', '#7a3220', '#c8644a', '#5a3a22', '#3a4a6a', '#3a2a22'],
      (p, r) => {
        ground(p, r);
        p.rect(3, 7, 10, 7, 3);
        p.rect(11, 7, 2, 7, 4);
        p.hline(3, 14, 10, 10);
        const roofRows: ReadonlyArray<readonly [number, number, number]> = [[3, 5, 6], [4, 4, 8], [5, 3, 10], [6, 2, 12]];
        for (const [y, x, w] of roofRows) {
          p.hline(x, y, w, 5);
          p.hline(x, y, Math.ceil(w / 2), 7);
        }
        p.hline(2, 7, 12, 6);
        p.rect(7, 10, 2, 4, 8);
        p.rect(4, 9, 2, 2, 9);
        p.rect(10, 9, 2, 2, 9);
      },
    ),
  );

  tiles.push(
    tile('tent', [...GROUND, '#e8dcc0', '#c9bb98', '#5a4a38', '#6b4a2b', '#b0553a'], (p, r) => {
      ground(p, r);
      triangle(p, 8, 2, 1, 13, 14, 13, 3);
      triangle(p, 8, 2, 8, 13, 14, 13, 4);
      triangle(p, 8, 8, 6, 13, 10, 13, 5);
      p.hline(4, 9, 8, 7);
      p.set(8, 1, 6);
      p.hline(1, 14, 14, 2);
    }),
  );

  tiles.push(
    tile('fort', ['#9a9486', '#6f6a60', '#b4aea0', '#857f72'], (p, r) => {
      p.hline(0, 7, 16, 2);
      p.hline(0, 15, 16, 2);
      for (const x of [7, 15]) p.vline(x, 0, 7, 2);
      for (const x of [3, 11]) p.vline(x, 8, 7, 2);
      for (const [x, y] of [[0, 0], [8, 0], [4, 8], [12, 8], [0, 8]] as const) p.hline(x, y, 3, 3);
      p.scatter(r, 4, 14, [1]);
    }),
  );

  tiles.push(
    tile('rampart', ['#a9a394', '#6f6a60', '#c4beae', '#857f72', '#5a564c'], (p, r) => {
      p.fill(1);
      for (const x of [1, 6, 11]) {
        p.rect(x, 0, 4, 5, 1);
        p.hline(x, 0, 4, 3);
        p.vline(x + 3, 1, 4, 4);
      }
      p.hline(0, 5, 16, 5);
      p.rect(0, 6, 16, 10, 1);
      p.hline(0, 11, 16, 2);
      for (const x of [4, 12]) p.vline(x, 6, 5, 2);
      for (const x of [8]) p.vline(x, 12, 4, 2);
      p.scatter(r, 4, 12, [1]);
    }),
  );

  tiles.push(
    // A watchtower seen from above: a stone roof inside a ring of merlons, with a plain pennant. No emblem of any faith.
    tile('tower', ['#9a9486', '#6f6a60', '#c4beae', '#857f72', '#5a564c', '#b0553a'], (p, r) => {
      p.fill(1);
      p.rect(2, 2, 12, 12, 4);
      p.hline(2, 2, 12, 2);
      p.hline(2, 13, 12, 5);
      p.vline(2, 2, 12, 2);
      p.vline(13, 2, 12, 5);
      for (const [x, y] of [[2, 2], [6, 2], [10, 2], [2, 6], [2, 10], [11, 6], [11, 10], [6, 11], [10, 11], [2, 11]] as const) p.rect(x, y, 3, 3, 3);
      p.rect(5, 5, 6, 6, 3);
      p.hline(5, 10, 6, 2);
      p.vline(10, 5, 6, 2);
      p.vline(8, 3, 5, 5);
      p.hline(9, 3, 3, 6);
      p.hline(9, 4, 2, 6);
      p.scatter(r, 2, 6, [4]);
    }),
  );

  tiles.push(
    tile('wall', ['#7a7466', '#4a463e', '#9a9486', '#5e5a50'], (p, r) => {
      for (let y = 3; y < 16; y += 4) p.hline(0, y, 16, 2);
      for (let row = 0; row < 4; row++) {
        const y = row * 4;
        const offset = row % 2 === 0 ? 3 : 7;
        for (let x = offset; x < 16; x += 8) p.vline(x, y, 3, 2);
      }
      p.hline(0, 0, 16, 3);
      p.hline(0, 1, 16, 3);
      p.scatter(r, 4, 16, [1]);
    }),
  );

  tiles.push(
    tile('gate', ['#7a7466', '#4a463e', '#9a9486', '#5e5a50', '#4a3420', '#33240f', '#6b6f7a'], (p, r) => {
      for (let y = 3; y < 16; y += 4) p.hline(0, y, 16, 2);
      for (let row = 0; row < 4; row++) {
        const offset = row % 2 === 0 ? 3 : 7;
        for (let x = offset; x < 16; x += 8) p.vline(x, row * 4, 3, 2);
      }
      p.hline(0, 0, 16, 3);
      p.scatter(r, 4, 10, [1]);
      const opening: ReadonlyArray<readonly [number, number, number]> = [[5, 6, 4], [6, 5, 6]];
      for (const [y, x, w] of opening) {
        p.hline(x - 1, y - 1, w + 2, 3);
        p.hline(x, y, w, 5);
      }
      p.rect(4, 7, 8, 9, 5);
      p.vline(3, 7, 9, 3);
      p.vline(12, 7, 9, 3);
      for (const x of [6, 8, 10]) p.vline(x, 6, 10, 6);
      p.hline(4, 9, 8, 7);
      p.hline(4, 13, 8, 7);
    }),
  );

  tiles.push(
    tile('hospice', [...GROUND, '#e8dcc0', '#c9bb98', '#5a4a38', '#6b4a2b', '#3f9a5a'], (p, r) => {
      ground(p, r);
      triangle(p, 8, 2, 1, 13, 14, 13, 3);
      triangle(p, 8, 2, 8, 13, 14, 13, 4);
      triangle(p, 8, 9, 6, 13, 10, 13, 5);
      // A green band around the canopy and a pennant on the pole mark it as a healing tent.
      // No cross or crescent: neither emblem belongs to a field hospital of this period.
      for (const y of [7, 8]) {
        for (let x = 0; x < 16; x++) {
          const here = p.get(x, y);
          if (here === 3 || here === 4) p.set(x, y, 7);
        }
      }
      p.vline(8, 0, 2, 6);
      p.hline(9, 0, 4, 7);
      p.hline(9, 1, 3, 7);
      p.hline(1, 14, 14, 2);
    }),
  );

  return tiles;
}
