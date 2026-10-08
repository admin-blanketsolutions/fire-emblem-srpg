import type { Action } from './input';
import { deniedWordIn, hasArabicScript } from './sensitive';

/**
 * Naming the Recruit (DESIGN §9.5): an on-screen keyboard that arrow keys, Confirm and a tap can
 * all work, so it needs no physical keyboard. This is the model: the letters, the cursor, the
 * name so far and whether the name will do. `scenes/nameScene.ts` draws it.
 */

export const NAME_MAX = 12;

export type Key = { readonly kind: 'char'; readonly char: string } | { readonly kind: 'space' } | { readonly kind: 'back' } | { readonly kind: 'done' };

const chars = (letters: string): Key[] => [...letters].map((char) => ({ kind: 'char', char }));

/** Four rows of letters and a row of the rest. The font has no accents, so none are offered. */
export const KEY_ROWS: ReadonlyArray<readonly Key[]> = [
  chars('ABCDEFGHIJKLM'),
  chars('NOPQRSTUVWXYZ'),
  chars('abcdefghijklm'),
  chars('nopqrstuvwxyz'),
  [...chars("-'."), { kind: 'space' }, { kind: 'back' }, { kind: 'done' }],
];

/** The label a key is drawn with. */
export const keyLabel = (key: Key): string => (key.kind === 'char' ? key.char : key.kind === 'space' ? 'Space' : key.kind === 'back' ? 'Del' : 'Done');

/** Words that are not given to a soldier of the levy, in any case: the project's own deny-list, and the name of God. */
const BLOCKED = ['allah'];

export type NameCheck = { readonly ok: true; readonly name: string } | { readonly ok: false; readonly reason: string };

/** Tidy a name (no stray spaces) and say whether it will do. */
export function checkName(raw: string): NameCheck {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name === '') return { ok: false, reason: 'A name needs at least one letter.' };
  if (name.length > NAME_MAX) return { ok: false, reason: `A name has at most ${NAME_MAX} letters.` };
  if (hasArabicScript(name)) return { ok: false, reason: 'Names are written in Latin letters.' };
  if (!/^[A-Za-z][A-Za-z '.-]*$/.test(name)) return { ok: false, reason: 'A name begins with a letter and uses letters, spaces, hyphens, apostrophes and full stops.' };
  const lower = name.toLowerCase();
  const tokens = lower.split(/[\s'.-]+/);
  if (BLOCKED.some((w) => tokens.includes(w)) || deniedWordIn(name)) return { ok: false, reason: 'That is not a name for a soldier of the levy.' };
  return { ok: true, name };
}

export class NameEntry {
  text: string;
  row = 0;
  col = 0;
  /** Why the last attempt to finish failed. */
  message: string | null = null;

  constructor(initial = '') {
    this.text = initial;
  }

  get keys(): ReadonlyArray<readonly Key[]> {
    return KEY_ROWS;
  }

  get key(): Key {
    return (KEY_ROWS[this.row] as readonly Key[])[this.col] as Key;
  }

  /** Move the cursor, wrapping at the edges; a shorter row keeps the cursor in its last key. */
  move(action: Action): void {
    const rows = KEY_ROWS.length;
    if (action === 'up') this.row = (this.row + rows - 1) % rows;
    else if (action === 'down') this.row = (this.row + 1) % rows;
    else if (action === 'left' || action === 'right') {
      const width = (KEY_ROWS[this.row] as readonly Key[]).length;
      this.col = (this.col + (action === 'left' ? width - 1 : 1)) % width;
    }
    this.col = Math.min(this.col, (KEY_ROWS[this.row] as readonly Key[]).length - 1);
  }

  /** Put the cursor on a key. */
  moveTo(row: number, col: number): void {
    if (row < 0 || row >= KEY_ROWS.length) return;
    this.row = row;
    this.col = Math.max(0, Math.min(col, (KEY_ROWS[row] as readonly Key[]).length - 1));
  }

  /** Press the key under the cursor. Returns the finished name when Done is pressed on a name that will do. */
  press(): string | null {
    const key = this.key;
    this.message = null;
    if (key.kind === 'char') {
      if (this.text.length < NAME_MAX) this.text += key.char;
      else this.message = `A name has at most ${NAME_MAX} letters.`;
    } else if (key.kind === 'space') {
      if (this.text.length > 0 && !this.text.endsWith(' ') && this.text.length < NAME_MAX) this.text += ' ';
    } else if (key.kind === 'back') {
      this.delete();
    } else {
      const check = checkName(this.text);
      if (check.ok) return check.name;
      this.message = check.reason;
    }
    return null;
  }

  /** Take back the last letter. */
  delete(): void {
    this.text = this.text.slice(0, -1);
    this.message = null;
  }
}
