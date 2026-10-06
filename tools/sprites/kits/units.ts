import type { SpriteDef } from '../../../src/core/sprite';
import { Pix } from './pix';

/**
 * Map-unit sprites composed from a few body templates, headgear variants and weapon overlays.
 * Every sprite shares one palette; faction colours and skin tones are slots remapped at render time.
 */

const PALETTE = [
  '#00000000', // 0 transparent
  '#1b1426', // 1 outline
  '#e2b48a', // 2 skin (slot)
  '#bf8a5f', // 3 skin shade (slot)
  '#d8a21e', // 4 faction primary (slot)
  '#f3e6c0', // 5 faction secondary (slot)
  '#7a4a12', // 6 faction trim (slot)
  '#3a2a22', // 7 dark hair and cloth
  '#9aa3b2', // 8 metal
  '#dfe6f0', // 9 metal highlight
  '#8a5a2b', // 10 wood
  '#6b4a30', // 11 leather
  '#f4f4f4', // 12 white
  '#8b5a3c', // 13 horse
  '#5a3826', // 14 horse dark
  '#c2412d', // 15 accent red
] as const;

const CHAR_TO_INDEX: Readonly<Record<string, number>> = {
  '.': 0, o: 1, s: 2, d: 3, a: 4, b: 5, t: 6, h: 7, m: 8, M: 9, w: 10, l: 11, e: 12, H: 13, J: 14, r: 15,
};

const BLANK = '................';

const FOOT: readonly string[] = [
  BLANK,
  '....oooooooo....',
  '....ohhhhhho....',
  '....ohhhhhho....',
  '....osssssso....',
  '....osossoso....',
  '.....osssso.....',
  '......oooo......',
  '....oaaaaaao....',
  '...osabbbbaso...',
  '...osabbbbaso...',
  '...ooaaaaaaoo...',
  '....otttttto....',
  '....olloollo....',
  '....ohhoohho....',
  '....oooooooo....',
];

const ROBED: readonly string[] = [
  ...FOOT.slice(0, 12),
  '....oaaaaaao....',
  '....oaaaaaao....',
  '....otttttto....',
  '....oooooooo....',
];

type LegPose = readonly [string, string, string];
const FOOT_LEGS: Record<'stand' | 'stepA' | 'stepB', LegPose> = {
  stand: ['....olloollo....', '....ohhoohho....', '....oooooooo....'],
  stepA: ['....olloollo....', '....ohho.ohho...', '....oooo.oooo...'],
  stepB: ['....olloollo....', '...ohho.ohho....', '...oooo.oooo....'],
};
const ROBE_HEM: Record<'stand' | 'stepA' | 'stepB', LegPose> = {
  stand: ['....oaaaaaao....', '....otttttto....', '....oooooooo....'],
  stepA: ['....oaaaaaao....', '....otttttto....', '...oooooooo.....'],
  stepB: ['....oaaaaaao....', '....otttttto....', '.....oooooooo...'],
};

type Head = 'hair' | 'cap' | 'helmet' | 'turban' | 'hood' | 'plume' | 'band' | 'closedhelm';

/** Rows 0..3 replacement for each head variant. */
const HEADS: Record<Head, readonly [string, string, string, string]> = {
  hair: [BLANK, '....oooooooo....', '....ohhhhhho....', '....ohhhhhho....'],
  cap: [BLANK, '....oooooooo....', '....ollllllo....', '....ohhhhhho....'],
  helmet: [BLANK, '....oooooooo....', '....oMmmmmmo....', '....ommmmmmo....'],
  closedhelm: [BLANK, '....oooooooo....', '....oMmmmmmo....', '....ommmmmmo....'],
  turban: ['.....oooooo.....', '....oeeeeeeo....', '...oeeeeeeeeo...', '....oeeeeeeo....'],
  hood: [BLANK, '....oooooooo....', '....obbbbbbo....', '....obbhhbbo....'],
  plume: ['.......rr.......', '....ooorrooo....', '....ohhhhhho....', '....ohhhhhho....'],
  band: [BLANK, '....oooooooo....', '....ohhhhhho....', '....obbbbbbo....'],
};

type Pixel = readonly [number, number, string];
const col = (x: number, y0: number, y1: number, ch: string): Pixel[] =>
  Array.from({ length: y1 - y0 + 1 }, (_, i) => [x, y0 + i, ch] as const);

const OVERLAYS: Record<string, readonly Pixel[]> = {
  spear: [[13, 1, 'M'], [13, 2, 'm'], ...col(13, 3, 13, 'w')],
  longspear: [[13, 0, 'M'], [13, 1, 'm'], ...col(13, 2, 14, 'w')],
  javelin: [[13, 3, 'M'], ...col(13, 4, 12, 'w'), [14, 6, 'M'], ...col(14, 7, 12, 'w')],
  sabre: [[12, 10, 'l'], [13, 9, 'M'], [14, 8, 'M'], [15, 7, 'm']],
  dagger: [[13, 9, 'M'], [13, 10, 'l']],
  mace: [[13, 6, 'm'], [14, 6, 'm'], [13, 7, 'm'], [14, 7, 'M'], ...col(13, 8, 12, 'w')],
  axe: [[14, 4, 'M'], [15, 4, 'M'], [14, 5, 'm'], [15, 5, 'm'], [14, 6, 'm'], ...col(13, 4, 12, 'w')],
  pick: [[12, 5, 'm'], [13, 4, 'M'], [14, 5, 'm'], ...col(13, 5, 12, 'w')],
  bow: [[13, 3, 'w'], [14, 4, 'w'], [14, 5, 'w'], [14, 6, 'w'], [14, 7, 'w'], [14, 8, 'w'], [13, 9, 'w'], ...col(13, 4, 8, 'e')],
  crossbow: [[12, 9, 'w'], [13, 9, 'w'], [14, 9, 'w'], [15, 9, 'w'], [15, 7, 'w'], [15, 8, 'w'], [15, 10, 'w'], [15, 11, 'w'], [13, 8, 'l']],
  staff: [[13, 1, 'e'], [13, 2, 'r'], ...col(13, 3, 13, 'w')],
  scroll: [[12, 10, 'e'], [13, 10, 'e'], [12, 11, 'e'], [13, 11, 'e'], [12, 12, 'r'], [13, 12, 'r']],
  pot: [[13, 8, 'r'], [14, 7, 'r'], [13, 9, 'r'], [13, 10, 'H'], [14, 10, 'H'], [13, 11, 'H'], [14, 11, 'J']],
  shield: [[1, 8, 'm'], [2, 8, 'M'], [1, 9, 'm'], [2, 9, 'm'], [1, 10, 'M'], [2, 10, 'm'], [1, 11, 'm'], [2, 11, 'm'], [2, 12, 'm']],
};

interface FootLook {
  readonly body: 'foot' | 'robed';
  readonly head: Head;
  readonly weapon?: keyof typeof OVERLAYS;
  readonly offhand?: keyof typeof OVERLAYS;
  /** Recolour tunic to metal. */
  readonly armored?: boolean;
}

function toGrid(rows: readonly string[]): string[][] {
  return rows.map((r) => r.split(''));
}

function stamp(grid: string[][], pixels: readonly Pixel[], dy: number): void {
  for (const [x, y, ch] of pixels) {
    const row = grid[y + dy];
    if (row && x >= 0 && x < 16) row[x] = ch;
  }
}

function composeFoot(look: FootLook, pose: 'stand' | 'stepA' | 'stepB', bob: boolean): string[] {
  const base = look.body === 'foot' ? FOOT : ROBED;
  const grid = toGrid(base);
  HEADS[look.head].forEach((row, i) => {
    if (i === 0 && look.head !== 'turban' && look.head !== 'plume') return;
    grid[i] = row.split('');
  });
  if (look.head === 'turban') {
    // the face row sits one pixel lower under the wide wrap, so keep the original face rows
  }
  if (look.armored) {
    for (const row of grid) {
      for (let x = 0; x < 16; x++) {
        if (row[x] === 'a') row[x] = 'm';
        else if (row[x] === 'b') row[x] = 'M';
      }
    }
  }
  const legs = look.body === 'foot' ? FOOT_LEGS[pose] : ROBE_HEM[pose];
  legs.forEach((row, i) => {
    grid[13 + i] = row.split('');
  });
  if (look.armored && look.body === 'foot') {
    // boots in metal tones for heavy infantry
    grid[14] = '....ommoommo....'.split('');
  }
  let rows = grid;
  if (bob) {
    // shift the upper body (rows 0..12) down one pixel; the legs stay planted
    rows = Array.from({ length: 16 }, (_, y) => {
      if (y >= 13) return grid[y]!;
      if (y === 0) return BLANK.split('');
      return grid[y - 1]!;
    });
  }
  const dy = bob ? 1 : 0;
  if (look.offhand) stamp(rows, OVERLAYS[look.offhand] ?? [], dy);
  if (look.weapon) stamp(rows, OVERLAYS[look.weapon] ?? [], dy);
  return rows.map((r) => r.join(''));
}

const INDEX_TO_CHAR: readonly string[] = Object.entries(CHAR_TO_INDEX)
  .sort(([, a], [, b]) => a - b)
  .map(([ch]) => ch);

const MOUNTED_OVERLAYS: Record<string, readonly Pixel[]> = {
  lance: [[11, 0, 'M'], [11, 1, 'm'], ...col(11, 2, 7, 'w')],
  bow: [[11, 0, 'w'], [12, 1, 'w'], [12, 2, 'w'], [12, 3, 'w'], [12, 4, 'w'], [11, 5, 'w'], [11, 1, 'e'], [11, 2, 'e'], [11, 3, 'e'], [11, 4, 'e']],
  sabre: [[11, 6, 'l'], [11, 5, 'M'], [11, 4, 'M'], [11, 3, 'M'], [11, 2, 'm']],
  javelin: [[11, 1, 'M'], ...col(11, 2, 7, 'w')],
};

/**
 * A compact rider, six pixels wide and eight tall, so the horse underneath stays readable.
 * The top two rows come from the head variant; the rest is shared.
 */
const RIDER_TOPS: Partial<Record<Head, readonly [string, string]>> = {
  cap: ['.oooo.', 'ollllo'],
  helmet: ['.oooo.', 'ommMmo'],
  closedhelm: ['.oooo.', 'ommMmo'],
  hair: ['.oooo.', 'ohhhho'],
  band: ['.oooo.', 'ohhhho'],
  hood: ['.oooo.', 'obbbbo'],
  turban: ['.oeeo.', 'oeeeeo'],
  plume: ['..rr..', 'orrrro'],
};
const RIDER_BODY: readonly string[] = ['osssso', 'ossoso', '.osso.', 'oabbao', 'oabbao', '.otto.'];

function riderBust(head: Head): string[] {
  return [...(RIDER_TOPS[head] ?? RIDER_TOPS.hair!), ...RIDER_BODY];
}

/** A rider on a horse drawn from primitives; `legs` animates the hooves and `bob` lifts the rider. */
function composeMounted(look: { head: Head; weapon?: keyof typeof MOUNTED_OVERLAYS }, legs: 0 | 1 | 2, bob: boolean): string[] {
  const p = new Pix(16, 16, 0);
  const idx = (ch: string): number => CHAR_TO_INDEX[ch] ?? 0;
  const [horse, dark, primary, trim, outline] = [idx('H'), idx('J'), idx('a'), idx('t'), idx('o')];

  // body and tail
  p.ellipse(7, 10, 6, 2, horse);
  p.hline(3, 12, 9, dark);
  p.line(1, 9, 0, 12, dark);
  p.line(2, 9, 1, 13, dark);
  // neck and head, facing right
  p.rect(10, 6, 3, 4, horse);
  p.rect(12, 4, 3, 3, horse);
  p.rect(13, 7, 3, 2, horse);
  p.set(15, 4, 0);
  p.set(12, 3, dark); // ear
  p.line(10, 6, 10, 9, dark); // mane
  p.set(12, 5, dark);
  p.set(14, 5, outline); // eye
  p.set(15, 8, dark); // muzzle
  // legs: near pair in the body colour, far pair darker
  const front = legs === 1 ? 1 : legs === 2 ? -1 : 0;
  const rear = legs === 1 ? -1 : legs === 2 ? 1 : 0;
  for (const [x, shade] of [[10 + front, horse], [3 + rear, horse], [8 + front, dark], [5 + rear, dark]] as const) {
    p.rect(x, 12, 2, 4, shade);
    p.set(x, 15, dark);
    p.set(x + 1, 15, dark);
  }
  // saddle cloth in the faction colours
  p.rect(3, 8, 6, 2, primary);
  p.hline(3, 10, 6, trim);
  p.outline(outline);

  // the rider sits on the saddle, left of the horse's head
  const dy = bob ? 1 : 0;
  riderBust(look.head).forEach((row, ry) => {
    for (let x = 0; x < 6; x++) {
      const ch = row.charAt(x);
      if (ch !== '.') p.set(x + 3, ry + dy, idx(ch));
    }
  });
  const rows = p.rows().map((r) => [...r].map((digit) => INDEX_TO_CHAR[Number.parseInt(digit, 16)] ?? '.'));
  if (look.weapon) stamp(rows, MOUNTED_OVERLAYS[look.weapon] ?? [], dy);
  return rows.map((r) => r.join(''));
}

function sprite(id: string, frames: Record<string, string[][]>): SpriteDef {
  return {
    id,
    kind: 'map-unit',
    size: [16, 16],
    palette: PALETTE,
    slots: { faction: [4, 5, 6], skin: [2, 3] },
    frames: Object.fromEntries(
      Object.entries(frames).map(([set, list]) => [set, list.map((rows) => rows.map((row) => [...row].map((c) => (CHAR_TO_INDEX[c] ?? 0).toString(16)).join('')))]),
    ),
    anim: { idle: { fps: 2, loop: true }, walk: { fps: 6, loop: true } },
  };
}

function footSprite(id: string, look: FootLook): SpriteDef {
  return sprite(id, {
    idle: [composeFoot(look, 'stand', false), composeFoot(look, 'stand', true)],
    walk: [composeFoot(look, 'stepA', false), composeFoot(look, 'stepB', true)],
  });
}

function mountedSprite(id: string, look: { head: Head; weapon?: keyof typeof MOUNTED_OVERLAYS }): SpriteDef {
  return sprite(id, {
    idle: [composeMounted(look, 0, false), composeMounted(look, 0, true)],
    walk: [composeMounted(look, 1, false), composeMounted(look, 2, true)],
  });
}

export function unitSprites(): SpriteDef[] {
  return [
    // Tier I of the fourteen class lines (DESIGN §6.2)
    footSprite('unit.young-lord', { body: 'foot', head: 'plume', weapon: 'sabre' }),
    footSprite('unit.soldier', { body: 'foot', head: 'cap', weapon: 'spear' }),
    footSprite('unit.pikeman', { body: 'foot', head: 'helmet', weapon: 'longspear' }),
    footSprite('unit.swordsman', { body: 'foot', head: 'band', weapon: 'sabre' }),
    footSprite('unit.axeman', { body: 'foot', head: 'helmet', weapon: 'axe' }),
    footSprite('unit.archer', { body: 'foot', head: 'hood', weapon: 'bow' }),
    mountedSprite('unit.horse-archer', { head: 'cap', weapon: 'bow' }),
    mountedSprite('unit.horseman', { head: 'helmet', weapon: 'lance' }),
    footSprite('unit.crossbowman', { body: 'foot', head: 'helmet', weapon: 'crossbow' }),
    footSprite('unit.skirmisher', { body: 'foot', head: 'band', weapon: 'javelin', offhand: 'dagger' }),
    footSprite('unit.fire-thrower', { body: 'foot', head: 'turban', weapon: 'pot' }),
    footSprite('unit.sapper', { body: 'foot', head: 'cap', weapon: 'pick' }),
    footSprite('unit.healer', { body: 'robed', head: 'hood', weapon: 'staff' }),
    footSprite('unit.scribe', { body: 'robed', head: 'turban', weapon: 'scroll' }),
    // A Tier II class used by the M1 proving ground
    footSprite('unit.man-at-arms', { body: 'foot', head: 'closedhelm', weapon: 'mace', offhand: 'shield', armored: true }),
  ];
}
