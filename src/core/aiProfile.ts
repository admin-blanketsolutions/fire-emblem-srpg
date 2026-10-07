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

/** The numbers the AI weighs when it scores an option (DESIGN §10.2; data in `ai.json`). */
export interface AiWeights {
  /** Per unit of kill probability. */
  readonly kill: number;
  /** Per point of expected damage. */
  readonly damage: number;
  /** For attacking a preferred target; scaled 0 to 1 by the unit's priority list. */
  readonly tag: number;
  /** Per point of expected counter-damage. */
  readonly counter: number;
  /** The same, for units that avoid counters. */
  readonly counterAvoid: number;
  /** Per unit of probability that the attacker falls. */
  readonly death: number;
  /** Extra per unit of kill probability when the target is critical: the Lord, an escort, a defended unit. Defeating one decides the chapter. */
  readonly criticalKill: number;
  readonly cover: number;
  readonly avoid: number;
  /** Per opposing unit that could strike the tile. */
  readonly exposure: number;
  /** Per HP a healer would restore. */
  readonly heal: number;
  /** Healing less than this is not worth a turn. */
  readonly healMin: number;
  /** How close a guarding unit stays to what it guards. */
  readonly guardRadius: number;
}

export function validateAiWeights(raw: unknown): AiWeights {
  const w = raw as Record<string, unknown>;
  const keys: ReadonlyArray<keyof AiWeights> = ['kill', 'damage', 'tag', 'counter', 'counterAvoid', 'death', 'criticalKill', 'cover', 'avoid', 'exposure', 'heal', 'healMin', 'guardRadius'];
  for (const key of keys) {
    const v = w?.[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`ai weights: "${key}" must be a non-negative number`);
  }
  return w as unknown as AiWeights;
}
