import type { SpriteDef } from '../../../src/core/sprite';
import { Pix } from './pix';

/**
 * Placeholder portraits, 32 by 32: a face from a few features, in the faction's colours and the
 * character's skin ramp (both slots, recoloured at draw time). They are deliberately generic: no
 * source describes what Salah ad-Din or his family looked like (ledger UNV-05), so no portrait
 * claims to. Real art replaces them through the override manifest.
 */

const PALETTE = [
  '#00000000', // 0 transparent
  '#1b1426', // 1 outline
  '#e2b48a', // 2 skin (slot)
  '#bf8a5f', // 3 skin shade (slot)
  '#d8a21e', // 4 faction primary (slot)
  '#f3e6c0', // 5 faction secondary (slot)
  '#7a4a12', // 6 faction trim (slot)
  '#3a2a22', // 7 dark hair
  '#9a9aa4', // 8 grey hair
  '#f4f4f4', // 9 white
  '#2a1c18', // a eye / brow
  '#9a5a4a', // b lips
  '#9aa3b2', // c metal
  '#dfe6f0', // d metal highlight
] as const;

const [O, SKIN, SHADE, A, B, T, DARK, GREY, WHITE, EYE, LIP, METAL, SHINE] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export interface Face {
  readonly hair: 'short' | 'none';
  readonly hairColor: 'dark' | 'grey' | 'white';
  readonly beard: 'none' | 'stubble' | 'short' | 'full' | 'long';
  readonly head: 'none' | 'turban' | 'cap' | 'helm' | 'band';
  readonly brow: 'thin' | 'heavy';
  readonly age: 'young' | 'mid' | 'old';
  readonly scar?: boolean;
}

function drawFace(f: Face): Pix {
  const p = new Pix(32, 32, 0);
  const hairIndex = f.hairColor === 'dark' ? DARK : f.hairColor === 'grey' ? GREY : WHITE;

  // shoulders and the collar, in the faction's colours
  p.rect(3, 26, 26, 6, A);
  p.rect(10, 25, 12, 2, SKIN);
  p.hline(10, 27, 12, B);
  p.hline(3, 26, 26, B);
  p.hline(3, 30, 26, T);
  p.vline(16, 27, 5, T);
  // the neck
  p.rect(12, 21, 8, 5, SKIN);
  p.hline(12, 24, 8, SHADE);

  // the face
  p.ellipse(16, 13, 8, 10, SKIN);
  p.vline(23, 7, 11, SHADE);
  p.vline(24, 9, 7, SHADE);
  // ears
  p.rect(7, 12, 2, 4, SKIN);
  p.rect(23, 12, 2, 4, SKIN);

  // hair
  if (f.hair === 'short') {
    p.ellipse(16, 7, 9, 5, hairIndex);
    p.rect(7, 7, 2, 7, hairIndex);
    p.rect(23, 7, 2, 7, hairIndex);
    p.hline(9, 9, 14, SKIN); // the forehead below the fringe
  }

  // eyes, brows, nose, mouth
  const brow = f.brow === 'heavy' ? 2 : 1;
  for (const x of [11, 18]) {
    p.hline(x, 11 - brow + 1, 4, EYE);
    if (brow === 2) p.hline(x, 11, 4, EYE);
    p.rect(x, 13, 3, 2, WHITE);
    p.set(x + 1, 13, EYE);
    p.set(x + 1, 14, EYE);
  }
  p.vline(16, 14, 4, SHADE);
  p.set(15, 18, SHADE);
  if (f.age !== 'young') {
    p.hline(11, 16, 3, SHADE);
    p.hline(18, 16, 3, SHADE);
  }
  if (f.age === 'old') {
    p.hline(10, 9, 5, SHADE);
    p.hline(17, 9, 5, SHADE);
  }
  if (f.scar) p.line(21, 9, 23, 16, SHADE);
  p.hline(13, 20, 6, LIP);

  // beard
  const beardColor = f.hairColor === 'white' ? WHITE : f.hairColor === 'grey' ? GREY : DARK;
  if (f.beard === 'stubble') {
    for (let y = 18; y <= 22; y++) for (let x = 10; x <= 22; x += 2) if ((x + y) % 2 === 0) p.set(x, y, SHADE);
  } else if (f.beard !== 'none') {
    const depth = f.beard === 'short' ? 3 : f.beard === 'full' ? 5 : 8;
    p.ellipse(16, 20, 8, depth, beardColor);
    p.rect(8, 15, 2, 6, beardColor);
    p.rect(22, 15, 2, 6, beardColor);
    p.hline(12, 19, 8, beardColor);
    p.hline(13, 20, 6, LIP); // the mouth shows through
    // the face above the beard line stays clear
    for (let y = 8; y < 17; y++) for (let x = 10; x < 22; x++) if (p.get(x, y) === beardColor) p.set(x, y, SKIN);
    p.hline(10, 18, 3, beardColor);
    p.hline(19, 18, 3, beardColor);
  }

  // headgear
  if (f.head === 'turban') {
    p.ellipse(16, 6, 11, 6, WHITE);
    p.hline(6, 8, 20, WHITE);
    p.hline(8, 4, 16, SHADE === 3 ? 9 : 9);
    p.line(7, 9, 24, 3, SHADE);
    p.line(7, 6, 24, 0, SHADE);
    p.hline(8, 10, 16, SKIN);
    p.hline(8, 9, 16, WHITE);
  } else if (f.head === 'cap') {
    p.ellipse(16, 5, 9, 4, A);
    p.hline(7, 8, 18, B);
    p.hline(8, 9, 16, T);
  } else if (f.head === 'helm') {
    p.ellipse(16, 6, 10, 6, METAL);
    p.hline(6, 8, 20, METAL);
    p.hline(8, 4, 8, SHINE);
    p.vline(16, 5, 6, METAL);
    p.vline(16, 6, 5, SHINE);
    p.hline(7, 9, 18, SHADE === 3 ? 12 : 12);
  } else if (f.head === 'band') {
    p.hline(7, 8, 18, B);
    p.hline(7, 9, 18, A);
  }

  p.outline(O);
  return p;
}

function portrait(id: string, face: Face): SpriteDef {
  return {
    id,
    kind: 'portrait',
    size: [32, 32],
    palette: PALETTE,
    slots: { faction: [4, 5, 6], skin: [2, 3] },
    frames: { still: [drawFace(face).rows()] },
  };
}

/**
 * The faces: the demos' stand-ins, and the cast of the chapters. No source describes what any of
 * them looked like (ledger UNV-05), so each is a type, not a likeness: age, beard and headgear
 * tell people apart, and the faction colours do the rest. None is a picture of a real face.
 */
const F = (hair: Face['hair'], hairColor: Face['hairColor'], beard: Face['beard'], head: Face['head'], brow: Face['brow'], age: Face['age'], scar?: boolean): Face => ({
  hair,
  hairColor,
  beard,
  head,
  brow,
  age,
  ...(scar ? { scar: true } : {}),
});

export const FACES: ReadonlyArray<readonly [string, Face]> = [
  ['demo-lord', { hair: 'short', hairColor: 'dark', beard: 'stubble', head: 'band', brow: 'heavy', age: 'young' }],
  ['demo-pike', { hair: 'none', hairColor: 'dark', beard: 'full', head: 'helm', brow: 'heavy', age: 'mid', scar: true }],
  ['demo-scribe', { hair: 'none', hairColor: 'grey', beard: 'short', head: 'turban', brow: 'thin', age: 'old' }],
  // the family
  ['ayyub', F('none', 'dark', 'full', 'turban', 'thin', 'mid')],
  ['shirkuh', F('none', 'dark', 'full', 'helm', 'heavy', 'mid', true)],
  ['salah-ad-din', F('short', 'dark', 'stubble', 'cap', 'thin', 'young')],
  ['turan-shah', F('short', 'dark', 'full', 'helm', 'heavy', 'mid')],
  ['recruit', F('short', 'dark', 'none', 'cap', 'heavy', 'young')],
  // Tikrit and Mosul
  ['zengi', F('none', 'grey', 'short', 'helm', 'heavy', 'mid')],
  ['bihruz', F('none', 'dark', 'none', 'turban', 'thin', 'mid')],
  ['usama', F('short', 'dark', 'short', 'turban', 'thin', 'mid')],
  // Damascus
  ['nur-ad-din', F('none', 'dark', 'short', 'turban', 'thin', 'mid')],
  ['mujir-ad-din', F('none', 'dark', 'none', 'band', 'thin', 'young')],
  ['gate-captain', F('short', 'dark', 'stubble', 'helm', 'heavy', 'mid')],
  // Egypt
  ['silafi', F('none', 'white', 'long', 'turban', 'thin', 'old')],
  ['shawar', F('none', 'dark', 'short', 'turban', 'thin', 'mid')],
  ['jurdik', F('short', 'dark', 'full', 'helm', 'heavy', 'mid')],
  ['al-adid', F('short', 'dark', 'none', 'band', 'thin', 'young')],
  ['mutamin', F('none', 'dark', 'none', 'turban', 'thin', 'mid')],
  ['qaraqush', F('none', 'dark', 'none', 'cap', 'thin', 'mid')],
  ['abul-hayja', F('short', 'dark', 'full', 'helm', 'heavy', 'mid')],
  // the emirs of Shirkuh's army
  ['isa', F('none', 'grey', 'short', 'turban', 'thin', 'mid')],
  ['qutb-ad-din', F('short', 'dark', 'stubble', 'cap', 'thin', 'mid')],
  ['al-mashtub', F('none', 'dark', 'short', 'helm', 'heavy', 'mid', true)],
  ['al-harimi', F('none', 'grey', 'full', 'turban', 'thin', 'old')],
  ['al-yaruqi', F('short', 'grey', 'long', 'band', 'heavy', 'old')],
];

export function portraitSprites(): SpriteDef[] {
  return FACES.map(([id, face]) => portrait(`portrait.${id}`, face));
}
