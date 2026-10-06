import { KIND_SIZES, usedIndices, type SpriteDef, type SpriteKind } from './sprite';

/**
 * House rules for sprite definitions, beyond the structural checks in `validateSpriteDef`.
 * Pure, so the command-line lint, the preview page and the tests all run the same rules.
 */

export type LintSeverity = 'error' | 'warning';

export interface LintIssue {
  readonly severity: LintSeverity;
  readonly message: string;
}

/** Each kind of sprite lives under its own id prefix, e.g. `unit.pikeman` or `tile.river`. */
export const ID_PREFIX: Readonly<Record<SpriteKind, string>> = {
  'map-unit': 'unit',
  tile: 'tile',
  battle: 'battle',
  portrait: 'portrait',
  ui: 'ui',
  icon: 'icon',
};

/**
 * Words that must not appear in a sprite id: the project never depicts the Prophet or the
 * Companions (DECISIONS D-005). This catches an accidental asset name, not a deliberate one.
 */
const DENIED_ID_WORDS: readonly string[] = ['prophet', 'rasul', 'nabi', 'sahaba', 'sahabi', 'companion'];

const ID_PATTERN = /^[a-z0-9]+(\.[a-z0-9]+(-[a-z0-9]+)*)+$/;

export function lintSprite(def: SpriteDef): LintIssue[] {
  const issues: LintIssue[] = [];
  const error = (message: string): void => void issues.push({ severity: 'error', message });
  const warn = (message: string): void => void issues.push({ severity: 'warning', message });

  if (!ID_PATTERN.test(def.id)) error(`id "${def.id}" must be lower-case dotted words, e.g. "unit.pikeman"`);
  const prefix = ID_PREFIX[def.kind];
  if (!def.id.startsWith(`${prefix}.`)) error(`a ${def.kind} sprite's id must start with "${prefix}."`);
  const tokens = def.id.split(/[.\-_]/);
  for (const word of DENIED_ID_WORDS) {
    if (tokens.includes(word)) error(`id contains "${word}", which the project never depicts`);
  }

  const allowed = KIND_SIZES[def.kind];
  if (!allowed.some(([w, h]) => w === def.size[0] && h === def.size[1])) {
    error(`size ${def.size[0]}×${def.size[1]} is not allowed for ${def.kind} (allowed: ${allowed.map(([w, h]) => `${w}×${h}`).join(', ')})`);
  }

  const used = usedIndices(def);
  const factionSlots = def.slots?.faction ?? [];
  const skinSlots = def.slots?.skin ?? [];
  const reserved = new Set<number>([...factionSlots, ...skinSlots]);
  def.palette.forEach((color, i) => {
    if (i > 0 && !used.has(i) && !reserved.has(i)) warn(`palette entry ${i.toString(16)} (${color}) is never used`);
  });
  const seen = new Map<string, number>();
  def.palette.forEach((color, i) => {
    if (i === 0) return;
    const key = color.toLowerCase();
    const first = seen.get(key);
    if (first === undefined) seen.set(key, i);
    else warn(`palette entries ${first.toString(16)} and ${i.toString(16)} are both ${color}`);
  });

  for (const slot of factionSlots) {
    if (skinSlots.includes(slot)) error(`palette entry ${slot.toString(16)} is both a faction slot and a skin slot`);
  }
  // A ramp may skip a colour, but a whole group that is never drawn cannot show any recolouring.
  if (factionSlots.length > 0 && !factionSlots.some((i) => used.has(i))) warn('no faction slot is drawn, so faction colours cannot show');
  if (skinSlots.length > 0 && !skinSlots.some((i) => used.has(i))) warn('no skin slot is drawn, so skin tones cannot show');

  if (def.kind === 'tile') {
    const hasHole = Object.values(def.frames).some((frames) => frames.some((frame) => frame.some((row) => row.includes('0'))));
    if (hasHole) error('tiles must be fully opaque (no index 0 pixels)');
  }
  if (def.kind === 'map-unit' && !def.frames['idle']) error('map-unit sprites need an "idle" frame set');

  for (const [set, frames] of Object.entries(def.frames)) {
    frames.forEach((frame, i) => {
      if (frame.every((row) => /^0*$/.test(row))) warn(`frame ${set}[${i}] is completely transparent`);
    });
  }
  return issues;
}

export function hasErrors(issues: readonly LintIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}
