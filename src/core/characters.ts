import { deniedWordIn, hasArabicScript } from './sensitive';

/**
 * The people who speak in scenes. A character is a name, a portrait and a row in the ledger
 * (`CHR-…`); the narrator is built in and has neither.
 */

export interface CharacterDef {
  readonly id: string;
  readonly name: string;
  /** What the name plate says; the name if absent. */
  readonly short?: string;
  /** The ledger row (`CHR-…`) the character stands on. */
  readonly ledger: string;
  /** A portrait sprite id (`portrait.…`), or none: a name plate only. */
  readonly portrait: string | null;
  /** A faction palette, for the placeholder portrait's colours. */
  readonly faction?: string;
  /** A skin ramp (`s1` to `s5`) for the portrait; `s2` if absent. */
  readonly skin?: string;
  readonly fictional?: boolean;
}

export type CharacterTable = ReadonlyMap<string, CharacterDef>;

export const NARRATOR = 'narrator';

export const plateName = (c: CharacterDef): string => c.short ?? c.name;

export function buildCharacterTable(raw: readonly unknown[]): CharacterTable {
  const table = new Map<string, CharacterDef>();
  raw.forEach((entry, i) => {
    const c = entry as Partial<CharacterDef> & Record<string, unknown>;
    const where = `character #${i}${typeof c.id === 'string' ? ` "${c.id}"` : ''}`;
    if (typeof c.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(c.id)) throw new Error(`${where}: id must be lower-case words joined by hyphens`);
    if (c.id === NARRATOR) throw new Error(`${where}: "narrator" is built in`);
    if (table.has(c.id)) throw new Error(`${where}: duplicate id`);
    if (typeof c.name !== 'string' || c.name === '') throw new Error(`${where}: missing name`);
    if (typeof c.ledger !== 'string' || !/^CHR-[A-Z0-9*-]+$/.test(c.ledger)) throw new Error(`${where}: ledger must be a CHR- row`);
    if (c.portrait !== null && typeof c.portrait !== 'string') throw new Error(`${where}: portrait must be a sprite id or null`);
    for (const [what, value] of [['id', c.id], ['portrait', c.portrait ?? '']] as const) {
      const denied = deniedWordIn(value);
      if (denied) throw new Error(`${where}: ${what} contains "${denied}", which the project never depicts`);
    }
    for (const text of [c.name, c.short ?? '']) if (hasArabicScript(text)) throw new Error(`${where}: names are written in Latin letters`);
    table.set(c.id, c as CharacterDef);
  });
  return table;
}
