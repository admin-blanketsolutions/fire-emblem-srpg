import type { Point } from './types';

/** How a computer-controlled unit behaves (DESIGN §10). */
export const AI_MODES = ['aggressive', 'defensive', 'stationary', 'priority', 'guard', 'flee'] as const;
export type AiMode = (typeof AI_MODES)[number];

/** What a unit prefers to attack, in order. `lowestHp` and `canKill` are judged per attack. */
export const TARGET_TAGS = ['lord', 'healer', 'archer', 'mounted', 'lowestHp', 'canKill', 'armored'] as const;
export type TargetTag = (typeof TARGET_TAGS)[number];

export interface AiProfile {
  readonly mode: AiMode;
  /** Defensive units wake when an opponent is within move + weapon range + this many tiles. */
  readonly aggroRange?: number;
  readonly priority?: readonly TargetTag[];
  /** The unit does nothing before this turn. */
  readonly activateOnTurn?: number;
  /** The unit does nothing until this flag is set. */
  readonly activateOnFlag?: string;
  /** Furthest the unit will stray from its post, in tiles. */
  readonly leash?: number;
  /** A unit id, or a tile, for the guard mode to stay close to. */
  readonly guard?: string | Point;
  /** Weigh the counter-attack more heavily when choosing a fight. */
  readonly avoidCounter?: boolean;
  /** Only see opponents the player can see; the default is to know where everyone is. */
  readonly respectsFog?: boolean;
}

export const DEFAULT_AI: AiProfile = { mode: 'aggressive' };

/** Validate untrusted JSON as an AI profile. Throws a descriptive error. */
export function validateAiProfile(raw: unknown, where: string): AiProfile {
  const p = raw as Partial<AiProfile> & Record<string, unknown>;
  if (typeof raw !== 'object' || raw === null) throw new Error(`${where}: ai must be an object`);
  if (!AI_MODES.includes(p.mode as AiMode)) throw new Error(`${where}: ai.mode must be one of ${AI_MODES.join(', ')}`);
  for (const key of ['aggroRange', 'activateOnTurn', 'leash'] as const) {
    const v = p[key];
    if (v !== undefined && (!Number.isInteger(v) || (v as number) < 0)) throw new Error(`${where}: ai.${key} must be a non-negative integer`);
  }
  for (const tag of p.priority ?? []) {
    if (!TARGET_TAGS.includes(tag)) throw new Error(`${where}: ai.priority has unknown tag "${String(tag)}"`);
  }
  if (p.mode === 'guard' && p.guard === undefined) throw new Error(`${where}: guard mode needs ai.guard`);
  return p as AiProfile;
}
