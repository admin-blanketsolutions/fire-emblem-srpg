import { matchesKey, type PhaseSide } from './events';
import type { Tile } from './types';
import type { UnitInstance } from './unit';

/**
 * Chapter objectives (DESIGN §4.7). Evaluation is pure: it reads a view of the battle and the
 * objective's own progress, and says whether the chapter is won, lost, or still going.
 */

export type ObjectiveDef =
  | { readonly type: 'rout'; /** Enemies carrying one of these tags need not be defeated. */ readonly ignoreTags?: readonly string[] }
  | { readonly type: 'seize'; readonly tiles: readonly Tile[]; /** Who may seize: `lord`, `any`, or a unit key. Default `lord`. */ readonly by?: string }
  | { readonly type: 'defend'; readonly turns: number; /** A tile that must not fall to the enemy, or a unit that must not fall. */ readonly anchor?: Tile | string }
  | {
      readonly type: 'hold-the-pass';
      readonly anchors: readonly Tile[];
      /** More than this many distinct enemies reaching an anchor loses the chapter. */
      readonly leakLimit?: number;
      /** Enemies standing on this many anchors at the end of an enemy phase lose the chapter. */
      readonly holdLimit?: number;
      readonly turns?: number;
    }
  | { readonly type: 'escort'; readonly unit: string; readonly exit: readonly Tile[] }
  | { readonly type: 'survive'; readonly turns: number }
  | { readonly type: 'persuade'; readonly targets: readonly string[]; readonly turns: number };

export type ObjectiveType = ObjectiveDef['type'];
export const OBJECTIVE_TYPES: readonly ObjectiveType[] = ['rout', 'seize', 'defend', 'hold-the-pass', 'escort', 'survive', 'persuade'];

export interface Outcome {
  readonly result: 'won' | 'lost';
  readonly reason: string;
}

/** The state an objective accumulates as the battle goes on. */
export interface ObjectiveProgress {
  seized: boolean;
  /** Enemies that have reached a hold-the-pass anchor. */
  readonly leaked: Set<string>;
  /** Ids of units won over by Talk. */
  readonly recruited: Set<string>;
  /** Ids of units that left the map by an exit. */
  readonly escaped: Set<string>;
}

export const newProgress = (): ObjectiveProgress => ({ seized: false, leaked: new Set(), recruited: new Set(), escaped: new Set() });

/** When the objective is being checked. */
export type Checkpoint = 'action' | 'phaseEnd' | 'turnEnd';

export interface ObjectiveView {
  readonly units: readonly UnitInstance[];
  /** The turn in progress; at `turnEnd`, the turn that has just ended. */
  readonly turn: number;
  readonly phase: PhaseSide;
  hasFutureReinforcements(): boolean;
}

const onTile = (u: UnitInstance, tile: Tile): boolean => u.x === tile[0] && u.y === tile[1];
const isTile = (t: unknown, width: number, height: number): t is Tile =>
  Array.isArray(t) && t.length === 2 && Number.isInteger(t[0]) && Number.isInteger(t[1]) && t[0] >= 0 && t[1] >= 0 && t[0] < width && t[1] < height;

export function validateObjective(raw: unknown, width: number, height: number, where: string): ObjectiveDef | null {
  if (raw === undefined) return null;
  const o = raw as ObjectiveDef & Record<string, unknown>;
  const label = `${where}: objective "${String(o?.type)}"`;
  const need = (ok: boolean, what: string): void => {
    if (!ok) throw new Error(`${label} ${what}`);
  };
  const turns = (n: unknown): boolean => Number.isInteger(n) && (n as number) >= 1;
  const tiles = (list: unknown): boolean => Array.isArray(list) && list.length > 0 && list.every((t) => isTile(t, width, height));
  if (!o || !OBJECTIVE_TYPES.includes(o.type)) throw new Error(`${where}: unknown objective type "${String(o?.type)}"`);
  switch (o.type) {
    case 'rout':
      break;
    case 'seize':
      need(tiles(o.tiles), 'needs one or more in-bounds tiles');
      break;
    case 'defend':
      need(turns(o.turns), 'needs turns of 1 or more');
      need(o.anchor === undefined || typeof o.anchor === 'string' || isTile(o.anchor, width, height), 'has an invalid anchor');
      break;
    case 'hold-the-pass':
      need(tiles(o.anchors), 'needs one or more in-bounds anchors');
      need(o.turns !== undefined || o.leakLimit !== undefined || o.holdLimit !== undefined, 'needs turns, leakLimit or holdLimit');
      need(o.turns === undefined || turns(o.turns), 'has invalid turns');
      break;
    case 'escort':
      need(typeof o.unit === 'string' && tiles(o.exit), 'needs a unit and one or more in-bounds exit tiles');
      break;
    case 'survive':
      need(turns(o.turns), 'needs turns of 1 or more');
      break;
    case 'persuade':
      need(Array.isArray(o.targets) && o.targets.length > 0 && turns(o.turns), 'needs targets and turns of 1 or more');
      break;
  }
  return o;
}

const lord = (units: readonly UnitInstance[]): UnitInstance[] => units.filter((u) => u.tags.includes('lord'));

/**
 * Decide the chapter at a checkpoint. Defeat is judged before victory, so a Lord who falls on
 * the same action that would have won still loses. Updates `progress.leaked` as a side effect.
 */
export function checkObjective(view: ObjectiveView, def: ObjectiveDef, progress: ObjectiveProgress, checkpoint: Checkpoint): Outcome | null {
  const { units } = view;
  const fallen = (u: UnitInstance): boolean => u.retreated && !u.escaped;
  if (lord(units).some(fallen)) return { result: 'lost', reason: 'The Lord has retreated wounded.' };
  const enemies = units.filter((u) => u.side === 'enemy' && !u.retreated);

  switch (def.type) {
    case 'rout': {
      const ignored = (u: UnitInstance): boolean => def.ignoreTags?.some((t) => u.tags.includes(t)) ?? false;
      if (enemies.every(ignored) && !view.hasFutureReinforcements()) return { result: 'won', reason: 'The enemy has been routed.' };
      return null;
    }
    case 'seize':
      return progress.seized ? { result: 'won', reason: 'The position has been seized.' } : null;
    case 'defend': {
      const anchor = def.anchor;
      if (typeof anchor === 'string') {
        if (units.some((u) => matchesKey(u, anchor) && fallen(u))) return { result: 'lost', reason: 'The defended position has fallen.' };
      } else if (anchor && view.phase === 'enemy' && checkpoint !== 'action' && enemies.some((u) => onTile(u, anchor))) {
        return { result: 'lost', reason: 'The enemy has taken the position.' };
      }
      if (checkpoint === 'turnEnd' && view.turn >= def.turns) return { result: 'won', reason: `The line held through turn ${def.turns}.` };
      return null;
    }
    case 'hold-the-pass': {
      const crossing = enemies.filter((u) => def.anchors.some((a) => onTile(u, a)));
      for (const u of crossing) progress.leaked.add(u.id);
      if (def.leakLimit !== undefined && progress.leaked.size > def.leakLimit) return { result: 'lost', reason: 'Too many of the enemy have crossed.' };
      if (def.holdLimit !== undefined && checkpoint === 'phaseEnd' && view.phase === 'enemy') {
        const held = def.anchors.filter((a) => enemies.some((u) => onTile(u, a))).length;
        if (held >= def.holdLimit) return { result: 'lost', reason: `The enemy holds ${held} of the ${def.anchors.length} crossings.` };
      }
      if (checkpoint === 'turnEnd' && def.turns !== undefined && view.turn >= def.turns) return { result: 'won', reason: `The pass held through turn ${def.turns}.` };
      if (enemies.length === 0 && !view.hasFutureReinforcements()) return { result: 'won', reason: 'No enemy is left to cross.' };
      return null;
    }
    case 'escort': {
      const escorts = units.filter((u) => matchesKey(u, def.unit));
      if (escorts.some(fallen)) return { result: 'lost', reason: 'The escort has retreated wounded.' };
      if (escorts.length > 0 && escorts.every((u) => progress.escaped.has(u.id))) return { result: 'won', reason: 'The escort reached safety.' };
      return null;
    }
    case 'survive':
      return checkpoint === 'turnEnd' && view.turn >= def.turns ? { result: 'won', reason: `Survived to the end of turn ${def.turns}.` } : null;
    case 'persuade': {
      const done = def.targets.every((key) => units.some((u) => matchesKey(u, key) && progress.recruited.has(u.id)));
      if (done) return { result: 'won', reason: 'All have been won over.' };
      if (checkpoint === 'turnEnd' && view.turn >= def.turns) return { result: 'lost', reason: 'Time ran out before all were won over.' };
      return null;
    }
  }
}

/** One line for the objective menu. */
export function describeObjective(def: ObjectiveDef): string {
  switch (def.type) {
    case 'rout':
      return 'Defeat all enemies';
    case 'seize':
      return 'Seize the marked position';
    case 'defend':
      return `Defend until the end of turn ${def.turns}`;
    case 'hold-the-pass':
      return def.turns !== undefined ? `Hold the pass until the end of turn ${def.turns}` : 'Hold the pass';
    case 'escort':
      return 'Escort the unit to the exit';
    case 'survive':
      return `Survive until the end of turn ${def.turns}`;
    case 'persuade':
      return `Win over ${def.targets.length} within ${def.turns} turns`;
  }
}

/** A second line of progress, or an empty string when there is nothing to report. */
export function progressText(def: ObjectiveDef, view: ObjectiveView, progress: ObjectiveProgress): string {
  switch (def.type) {
    case 'defend':
    case 'survive':
      return `Turn ${view.turn} of ${def.turns}`;
    case 'persuade':
      return `Won over ${progress.recruited.size} of ${def.targets.length}; turn ${view.turn} of ${def.turns}`;
    case 'hold-the-pass': {
      const parts = [def.turns !== undefined ? `Turn ${view.turn} of ${def.turns}` : '', def.leakLimit !== undefined ? `Crossed ${progress.leaked.size} of ${def.leakLimit + 1}` : ''];
      return parts.filter(Boolean).join('; ');
    }
    case 'rout':
      return `${view.units.filter((u) => u.side === 'enemy' && !u.retreated).length} enemies remain`;
    default:
      return '';
  }
}
