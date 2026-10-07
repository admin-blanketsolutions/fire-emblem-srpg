import { validateAiProfile, type AiProfile } from './aiProfile';
import type { Point, Side, Tile } from './types';
import type { UnitInstance } from './unit';

/**
 * Chapter events (DESIGN §3.8): plain data that says "when this happens, do that". The runner is
 * pure: given a trigger and a view of the battle it returns the actions that came due and
 * remembers which events have fired. The battle applies the actions.
 */

export type PhaseSide = Exclude<Side, 'neutral'>;
const PHASE_SIDES: readonly PhaseSide[] = ['player', 'ally', 'enemy'];

/** A unit named by id, definition id or tag. */
export type UnitKey = string;

export type Condition =
  | { readonly type: 'turnStart'; readonly turn: number; readonly phase?: PhaseSide }
  | { readonly type: 'unitEntersTile'; readonly unit: UnitKey; readonly tile: Tile }
  | { readonly type: 'unitDefeated'; readonly unit: UnitKey }
  | { readonly type: 'hpBelow'; readonly unit: UnitKey; /** A fraction of maximum HP, 0 to 1. */ readonly fraction: number }
  | { readonly type: 'talk'; readonly a: UnitKey; readonly b: UnitKey }
  | { readonly type: 'visit'; readonly tile: Tile }
  | { readonly type: 'allDefeated'; readonly tag: string }
  | { readonly type: 'flag'; readonly name: string };

export type When = Condition | { readonly all: readonly Condition[] } | { readonly any: readonly Condition[] };

export interface SpawnSpec {
  /** A unit or structure definition id. */
  readonly def: string;
  /** For a structure: whose it is (default enemy). Units take their side from their definition. */
  readonly side?: Side;
  readonly at: Tile;
  readonly ai?: AiProfile;
  readonly tags?: readonly string[];
}

export type EventAction =
  | { readonly type: 'dialogue'; readonly scene: string }
  | { readonly type: 'message'; readonly text: string }
  | { readonly type: 'spawn'; readonly units: readonly SpawnSpec[] }
  | { readonly type: 'setAi'; readonly unit: UnitKey; readonly ai: AiProfile }
  | { readonly type: 'recruit'; readonly unit: UnitKey }
  /** A rank event: promote the unit, or hand it the Charter of Iqta' if it has not reached the promotion level. */
  | { readonly type: 'promote'; readonly unit: UnitKey }
  | { readonly type: 'flag'; readonly name: string }
  | { readonly type: 'giveItem'; readonly unit: UnitKey; readonly item: string }
  | { readonly type: 'openGate'; readonly at: Tile }
  | { readonly type: 'ignite'; readonly tile: Tile }
  | { readonly type: 'unlockCodex'; readonly id: string }
  | { readonly type: 'endChapter'; readonly result: 'won' | 'lost'; readonly reason?: string };

export interface EventDef {
  readonly id: string;
  readonly when: When;
  readonly then: readonly EventAction[];
  /** Fire only the first time the condition holds. Default true. */
  readonly once?: boolean;
}

/** Something that just happened, offered to the runner. */
export type Trigger =
  | { readonly type: 'turnStart'; readonly turn: number; readonly phase: PhaseSide }
  | { readonly type: 'enter'; readonly unit: UnitInstance; readonly tile: Point }
  | { readonly type: 'talk'; readonly a: UnitInstance; readonly b: UnitInstance }
  | { readonly type: 'visit'; readonly unit: UnitInstance; readonly tile: Point }
  /** Any other change of state: conditions about defeats, HP and flags are checked. */
  | { readonly type: 'update' };

/** What the runner may look at. */
export interface EventView {
  readonly units: readonly UnitInstance[];
  readonly flags: ReadonlySet<string>;
}

export const matchesKey = (unit: UnitInstance, key: UnitKey): boolean => unit.id === key || unit.defId === key || unit.tags.includes(key);

const isTile = (t: unknown, width: number, height: number): t is Tile =>
  Array.isArray(t) && t.length === 2 && Number.isInteger(t[0]) && Number.isInteger(t[1]) && t[0] >= 0 && t[1] >= 0 && t[0] < width && t[1] < height;

const same = (a: Tile, p: Point): boolean => a[0] === p.x && a[1] === p.y;

function conditionHolds(c: Condition, trigger: Trigger, view: EventView): boolean {
  switch (c.type) {
    case 'turnStart':
      return trigger.type === 'turnStart' && trigger.turn === c.turn && (c.phase === undefined || trigger.phase === c.phase);
    case 'unitEntersTile':
      return trigger.type === 'enter' && matchesKey(trigger.unit, c.unit) && same(c.tile, trigger.tile);
    case 'talk':
      return trigger.type === 'talk' && ((matchesKey(trigger.a, c.a) && matchesKey(trigger.b, c.b)) || (matchesKey(trigger.a, c.b) && matchesKey(trigger.b, c.a)));
    case 'visit':
      return trigger.type === 'visit' && same(c.tile, trigger.tile);
    case 'unitDefeated':
      return view.units.some((u) => matchesKey(u, c.unit)) && view.units.filter((u) => matchesKey(u, c.unit)).every((u) => u.retreated);
    case 'hpBelow':
      return view.units.some((u) => !u.retreated && matchesKey(u, c.unit) && u.hp < u.stats.hp * c.fraction);
    case 'allDefeated': {
      const tagged = view.units.filter((u) => u.tags.includes(c.tag));
      return tagged.length > 0 && tagged.every((u) => u.retreated);
    }
    case 'flag':
      return view.flags.has(c.name);
  }
}

function whenHolds(when: When, trigger: Trigger, view: EventView): boolean {
  if ('all' in when) return when.all.every((c) => conditionHolds(c, trigger, view));
  if ('any' in when) return when.any.some((c) => conditionHolds(c, trigger, view));
  return conditionHolds(when, trigger, view);
}

const conditionsOf = (when: When): readonly Condition[] => ('all' in when ? when.all : 'any' in when ? when.any : [when]);

export class EventRunner {
  readonly fired = new Set<string>();

  constructor(readonly events: readonly EventDef[]) {}

  /** The actions of every event whose condition holds now, in the order the events are written. */
  run(trigger: Trigger, view: EventView): EventAction[] {
    const actions: EventAction[] = [];
    for (const event of this.events) {
      if ((event.once ?? true) && this.fired.has(event.id)) continue;
      if (!whenHolds(event.when, trigger, view)) continue;
      this.fired.add(event.id);
      actions.push(...event.then);
    }
    return actions;
  }

  /** Talk conversations that have not happened yet, for the Talk command. */
  pendingTalks(): Array<{ id: string; a: UnitKey; b: UnitKey }> {
    const out: Array<{ id: string; a: UnitKey; b: UnitKey }> = [];
    for (const event of this.events) {
      if ((event.once ?? true) && this.fired.has(event.id)) continue;
      for (const c of conditionsOf(event.when)) if (c.type === 'talk') out.push({ id: event.id, a: c.a, b: c.b });
    }
    return out;
  }

  /** Tiles with a visit event still to come. */
  pendingVisits(): Tile[] {
    const out: Tile[] = [];
    for (const event of this.events) {
      if ((event.once ?? true) && this.fired.has(event.id)) continue;
      for (const c of conditionsOf(event.when)) if (c.type === 'visit') out.push(c.tile);
    }
    return out;
  }
}

/** Validate untrusted event data against a map of the given size. Throws a descriptive error. */
export function validateEvents(raw: unknown, width: number, height: number, where: string): EventDef[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error(`${where}: events must be an array`);
  const ids = new Set<string>();
  return raw.map((entry, i) => {
    const e = entry as Partial<EventDef> & Record<string, unknown>;
    const label = `${where}: event #${i}${typeof e.id === 'string' ? ` "${e.id}"` : ''}`;
    if (typeof e.id !== 'string' || e.id === '') throw new Error(`${label} needs an id`);
    if (ids.has(e.id)) throw new Error(`${label} has a duplicate id`);
    ids.add(e.id);
    if (!e.when || typeof e.when !== 'object') throw new Error(`${label} needs a "when" condition`);
    if (!Array.isArray(e.then) || e.then.length === 0) throw new Error(`${label} needs a non-empty "then" list`);
    for (const c of conditionsOf(e.when as When)) validateCondition(c, width, height, label);
    for (const a of e.then) validateAction(a as EventAction, width, height, label);
    return e as EventDef;
  });
}

function validateCondition(c: Condition, width: number, height: number, label: string): void {
  const need = (ok: boolean, what: string): void => {
    if (!ok) throw new Error(`${label}: condition "${c.type}" ${what}`);
  };
  switch (c.type) {
    case 'turnStart':
      need(Number.isInteger(c.turn) && c.turn >= 1, 'needs a turn of 1 or more');
      need(c.phase === undefined || PHASE_SIDES.includes(c.phase), 'has an unknown phase');
      break;
    case 'unitEntersTile':
      need(typeof c.unit === 'string' && isTile(c.tile, width, height), 'needs a unit and an in-bounds tile');
      break;
    case 'unitDefeated':
      need(typeof c.unit === 'string', 'needs a unit');
      break;
    case 'hpBelow':
      need(typeof c.unit === 'string' && c.fraction > 0 && c.fraction <= 1, 'needs a unit and a fraction in (0, 1]');
      break;
    case 'talk':
      need(typeof c.a === 'string' && typeof c.b === 'string', 'needs two units');
      break;
    case 'visit':
      need(isTile(c.tile, width, height), 'needs an in-bounds tile');
      break;
    case 'allDefeated':
      need(typeof c.tag === 'string', 'needs a tag');
      break;
    case 'flag':
      need(typeof c.name === 'string', 'needs a name');
      break;
    default:
      throw new Error(`${label}: unknown condition "${String((c as { type?: unknown }).type)}"`);
  }
}

function validateAction(a: EventAction, width: number, height: number, label: string): void {
  const need = (ok: boolean, what: string): void => {
    if (!ok) throw new Error(`${label}: action "${a.type}" ${what}`);
  };
  switch (a.type) {
    case 'dialogue':
      need(typeof a.scene === 'string', 'needs a scene id');
      break;
    case 'message':
      need(typeof a.text === 'string' && a.text.length > 0, 'needs text');
      break;
    case 'spawn':
      need(Array.isArray(a.units) && a.units.length > 0, 'needs units');
      for (const u of a.units) {
        need(typeof u.def === 'string' && isTile(u.at, width, height), 'needs a def and an in-bounds tile for each unit');
        if (u.ai) validateAiProfile(u.ai, label);
      }
      break;
    case 'setAi':
      need(typeof a.unit === 'string', 'needs a unit');
      validateAiProfile(a.ai, label);
      break;
    case 'recruit':
      need(typeof a.unit === 'string', 'needs a unit');
      break;
    case 'promote':
      need(typeof a.unit === 'string', 'needs a unit');
      break;
    case 'flag':
      need(typeof a.name === 'string', 'needs a name');
      break;
    case 'giveItem':
      need(typeof a.unit === 'string' && typeof a.item === 'string', 'needs a unit and an item');
      break;
    case 'openGate':
      need(isTile(a.at, width, height), 'needs an in-bounds tile');
      break;
    case 'ignite':
      need(isTile(a.tile, width, height), 'needs an in-bounds tile');
      break;
    case 'unlockCodex':
      need(typeof a.id === 'string', 'needs an id');
      break;
    case 'endChapter':
      need(a.result === 'won' || a.result === 'lost', 'needs a result of won or lost');
      break;
    default:
      throw new Error(`${label}: unknown action "${String((a as { type?: unknown }).type)}"`);
  }
}
