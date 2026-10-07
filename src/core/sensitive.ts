/**
 * What the project never does (DECISIONS D-004, D-005), as checks the data validators share.
 * No prophet and no Companion (sahaba) is depicted in art, dialogue or sprites; no Arabic script
 * appears except in entries that are verified; the checks are on identifiers and on script, not on
 * prose, because *Muhammad* is a common name and means the same here as anywhere.
 */

/** Words that must not appear as a word in an identifier (a sprite, a speaker, a portrait). */
export const DENIED_ID_WORDS: readonly string[] = ['prophet', 'rasul', 'nabi', 'sahaba', 'sahabi', 'companion'];

/** The first denied word an identifier contains, if any. Identifiers are split at dots, hyphens and underscores. */
export function deniedWordIn(id: string): string | null {
  const tokens = id.toLowerCase().split(/[.\-_\s]/);
  return DENIED_ID_WORDS.find((word) => tokens.includes(word)) ?? null;
}

/** Arabic, Arabic Supplement, Arabic Extended-A, and the two presentation-form blocks. */
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/u;

export const hasArabicScript = (text: string): boolean => ARABIC_SCRIPT.test(text);

/** Every string anywhere inside a JSON value, with a path to it, for scanning data files. */
export function* stringsIn(value: unknown, path = ''): Generator<{ path: string; text: string }> {
  if (typeof value === 'string') yield { path, text: value };
  else if (Array.isArray(value)) for (const [i, item] of value.entries()) yield* stringsIn(item, `${path}[${i}]`);
  else if (value !== null && typeof value === 'object') for (const [key, item] of Object.entries(value)) yield* stringsIn(item, path ? `${path}.${key}` : key);
}
