import { DEFAULT_AI, type AiProfile, type TargetTag } from './aiProfile';
import type { BattleState } from './battle';
import type { Forecast, HitMode } from './combat';
import { matchesKey } from './events';
import { manhattan, ring, tileKey } from './grid';
import { pathTo, type ReachResult } from './pathfinding';
import { areFriendly, areHostile, type Point } from './types';
import { maxHp, type UnitInstance } from './unit';

/**
 * Enemy and ally AI (DESIGN §10). Pure: given the battle it returns a plan for one unit (where to
 * stand and what to do there) and changes nothing. The battle applies the plan; the scene plays it.
 */

/** The scoring weights of DESIGN §10.2 (`src/data/ai.json`). */
export interface AiWeights {
  /** Per unit of kill probability (0 to 1). */
  readonly kill: number;
  /** Per point of expected damage dealt. */
  readonly damage: number;
  /** Per unit of target-tag bonus (0 to 1). */
  readonly tag: number;
  /** Per point of expected counter damage taken. */
  readonly counter: number;
  /** The counter weight for units with `avoidCounter`. */
  readonly counterCautious: number;
  /** Per point of the destination's cover. */
  readonly cover: number;
  /** Per point of the destination's avoid. */
  readonly avoid: number;
  /** Per opposing unit that could strike the destination next phase. */
  readonly exposure: number;
  /** Per HP a remedy would restore. */
  readonly heal: number;
}

const WEIGHT_KEYS = ['kill', 'damage', 'tag', 'counter', 'counterCautious', 'cover', 'avoid', 'exposure', 'heal'] as const satisfies ReadonlyArray<keyof AiWeights>;

export function validateAiWeights(raw: unknown): AiWeights {
  if (typeof raw !== 'object' || raw === null) throw new Error('ai weights must be an object');
  const r = raw as Record<string, unknown>;
  const out: Partial<Record<keyof AiWeights, number>> = {};
  for (const key of WEIGHT_KEYS) {
    const v = r[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`ai.${key} must be a non-negative number`);
    out[key] = v;
  }
  return out as AiWeights;
}

/** Guard-mode units stay within this many tiles of what they guard. */
export const GUARD_RADIUS = 2;

export type AiAction =
  | { readonly kind: 'attack'; readonly slot: number; readonly target: UnitInstance }
  | { readonly kind: 'heal'; readonly slot: number; readonly target: UnitInstance }
  | { readonly kind: 'wait' }
  /** Leave the map by the exit the unit stands on. */
  | { readonly kind: 'escape' };

export interface AiPlan {
  readonly unit: UnitInstance;
  /** Where the unit ends its move (its own tile if it stays). */
  readonly to: Point;
  readonly action: AiAction;
  /** A defensive unit wakes with this plan and stays awake. */
  readonly wakes: boolean;
  /** The chosen option's score, when the plan is an attack or a heal. */
  readonly score: number | null;
}

// ------------------------------------------------------------------ expected outcomes

/** The chance a strike shown as `percent` hits under the hit mode (DESIGN §3.3). */
export function hitChance(percent: number, mode: HitMode): number {
  const h = Math.max(0, Math.min(100, Math.round(percent)));
  if (mode === 'honest') return h / 100;
  // Weighted: two rolls in 0..99, averaged; the strike hits when r1 + r2 < 2h.
  let pairs = 0;
  for (let s = 0; s < 2 * h; s++) pairs += s <= 99 ? s + 1 : 199 - s;
  return pairs / 10000;
}

/** Expected results of a fight, over every hit, miss and crit in the forecast's strike order. */
export interface Exchange {
  /** Chance the defender falls. */
  readonly pKill: number;
  /** Chance the attacker falls to the counter. */
  readonly pDie: number;
  /** Expected HP the defender loses. */
  readonly dealt: number;
  /** Expected HP the attacker loses. */
  readonly taken: number;
}

export function expectedExchange(fc: Forecast, mode: HitMode, critMultiplier: number): Exchange {
  const aStart = fc.attacker.hpNow;
  const dStart = fc.defender.hpNow;
  let pKill = 0;
  let pDie = 0;
  let dealt = 0;
  let taken = 0;
  const walk = (i: number, aHp: number, dHp: number, p: number): void => {
    if (p === 0) return;
    const by = fc.order[i];
    if (by === undefined || aHp <= 0 || dHp <= 0) {
      if (dHp <= 0) pKill += p;
      if (aHp <= 0) pDie += p;
      dealt += p * (dStart - dHp);
      taken += p * (aStart - aHp);
      return;
    }
    const strike = (by === 'a' ? fc.attacker : fc.defender).strike;
    if (!strike) {
      walk(i + 1, aHp, dHp, p);
      return;
    }
    const hit = hitChance(strike.hit, mode);
    const crit = strike.crit / 100;
    const land = (damage: number, q: number): void =>
      by === 'a' ? walk(i + 1, aHp, Math.max(0, dHp - damage), p * q) : walk(i + 1, Math.max(0, aHp - damage), dHp, p * q);
    land(0, 1 - hit);
    land(strike.damage, hit * (1 - crit));
    land(strike.damage * critMultiplier, hit * crit);
  };
  walk(0, aStart, dStart, 1);
  return { pKill, pDie, dealt, taken };
}

// ------------------------------------------------------------------ targets and tags

/** Units with no priority list go for the Lord first (DESIGN §10.2). */
const DEFAULT_PRIORITY: readonly TargetTag[] = ['lord'];

interface TagFacts {
  /** The lowest HP among the targets the unit is weighing. */
  readonly lowestHp: number;
  /** Whether this attack could defeat the target. */
  readonly canKill: boolean;
}

function hasTag(battle: BattleState, target: UnitInstance, tag: TargetTag, facts: TagFacts): boolean {
  switch (tag) {
    case 'lord':
      return target.tags.includes('lord');
    case 'healer':
      return battle.usableRemedies(target).length > 0;
    case 'archer':
      return battle.usableWeapons(target).some(({ weapon }) => weapon.kind === 'bow' || weapon.kind === 'crossbow');
    case 'mounted':
      return target.moveType === 'mounted';
    case 'armored':
      return target.moveType === 'armored';
    case 'lowestHp':
      return target.hp === facts.lowestHp;
    case 'canKill':
      return facts.canKill;
  }
}

/** 1 for the first tag in the priority list, falling linearly; 0 if no tag matches. */
export function tagBonus(battle: BattleState, profile: AiProfile, target: UnitInstance, facts: TagFacts): number {
  const order = profile.priority ?? DEFAULT_PRIORITY;
  const i = order.findIndex((tag) => hasTag(battle, target, tag, facts));
  return i < 0 ? 0 : (order.length - i) / order.length;
}

// ------------------------------------------------------------------ the planner

/** The order units act in: as listed, with leaders (bosses, `leader` tags) last. */
export function aiOrder(units: readonly UnitInstance[]): UnitInstance[] {
  const leader = (u: UnitInstance): number => (u.boss || u.tags.includes('leader') || u.tags.includes('boss') ? 1 : 0);
  return [...units].sort((a, b) => leader(a) - leader(b));
}

const samePoint = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

/** How many units hostile to `unit` could strike each tile in their next phase. */
export function exposureMap(battle: BattleState, unit: UnitInstance): Map<number, number> {
  const counts = new Map<number, number>();
  for (const other of battle.livingUnits()) {
    if (!areHostile(unit.side, other.side)) continue;
    for (const p of battle.threatTiles(other, battle.reachFor(other))) {
      const key = tileKey(p.x, p.y);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/** Whether a defensive unit wakes: an opponent stands within its move, weapon range and `aggroRange`. */
export function isTriggered(battle: BattleState, unit: UnitInstance, profile: AiProfile, reach: ReachResult = battle.reachFor(unit)): boolean {
  const threat = battle.threatTiles(unit, reach);
  const slack = profile.aggroRange ?? 0;
  return battle
    .livingUnits()
    .filter((other) => areHostile(unit.side, other.side))
    .some((other) => threat.some((p) => manhattan(p, other) <= slack));
}

/** The tile a guard-mode unit protects: the guarded unit's position, or a fixed tile. Null if the unit is gone. */
function guardPoint(battle: BattleState, profile: AiProfile): Point | null {
  const g = profile.guard as string | Point | readonly [number, number] | undefined;
  if (g === undefined) return null;
  if (typeof g === 'string') {
    const ward = battle.units.find((u) => !u.retreated && matchesKey(u, g));
    return ward ? { x: ward.x, y: ward.y } : null;
  }
  if (Array.isArray(g)) return { x: g[0] as number, y: g[1] as number };
  return g as Point;
}

interface Option {
  readonly to: Point;
  readonly action: Extract<AiAction, { kind: 'attack' | 'heal' }>;
  readonly score: number;
  readonly exposure: number;
  readonly moveCost: number;
}

/** Scores are compared to a millionth, so float noise never decides between equal options. */
const settle = (n: number): number => Math.round(n * 1e6) / 1e6;

function compareOptions(a: Option, b: Option): number {
  return (
    settle(b.score) - settle(a.score) ||
    a.exposure - b.exposure ||
    a.moveCost - b.moveCost ||
    (a.action.target.id < b.action.target.id ? -1 : a.action.target.id > b.action.target.id ? 1 : 0) ||
    tileKey(a.to.x, a.to.y) - tileKey(b.to.x, b.to.y) ||
    a.action.slot - b.action.slot
  );
}

/** Every attack and remedy the unit could make from the given tiles, scored (DESIGN §10.2). */
export function scoreOptions(battle: BattleState, unit: UnitInstance, profile: AiProfile, stops: readonly Point[], reach: ReachResult): Option[] {
  const w = battle.tables.ai;
  const exposure = exposureMap(battle, unit);
  const counterWeight = profile.avoidCounter ? w.counterCautious : w.counter;
  const weapons = battle.usableWeapons(unit);
  const remedies = battle.usableRemedies(unit);

  const attacks: Array<{ to: Point; slot: number; target: UnitInstance; fc: Forecast }> = [];
  const heals: Option[] = [];
  const place = (p: Point): { value: number; exposure: number; moveCost: number } => {
    const terrain = battle.map.terrainAt(p.x, p.y);
    const exp = exposure.get(tileKey(p.x, p.y)) ?? 0;
    return {
      value: w.cover * terrain.cover + w.avoid * terrain.avoid - w.exposure * exp,
      exposure: exp,
      moveCost: reach.nodes.get(tileKey(p.x, p.y))?.cost ?? 0,
    };
  };

  for (const to of stops) {
    for (const { slot, weapon } of weapons) {
      for (const target of battle.targetsFor(unit, weapon, to)) {
        const fc = battle.forecastFor(unit, target, { from: to, slot });
        if (fc) attacks.push({ to, slot, target, fc });
      }
    }
    for (const { slot, weapon } of remedies) {
      for (const target of battle.healTargets(unit, weapon, to)) {
        const restored = Math.min(weapon.might, maxHp(target) - target.hp);
        const at = place(to);
        heals.push({ to, action: { kind: 'heal', slot, target }, score: w.heal * restored + at.value, exposure: at.exposure, moveCost: at.moveCost });
      }
    }
  }

  const lowestHp = Math.min(...attacks.map((a) => a.target.hp));
  const { hitMode } = battle.rules;
  const { critMultiplier } = battle.tables.balance;
  const scored = attacks.map(({ to, slot, target, fc }): Option => {
    const ex = expectedExchange(fc, hitMode, critMultiplier);
    const at = place(to);
    const tag = tagBonus(battle, profile, target, { lowestHp, canKill: ex.pKill > 0 });
    const score = w.kill * ex.pKill + w.damage * ex.dealt + w.tag * tag - counterWeight * ex.taken + at.value;
    return { to, action: { kind: 'attack', slot, target }, score, exposure: at.exposure, moveCost: at.moveCost };
  });
  return [...scored, ...heals].sort(compareOptions);
}

/**
 * Walk toward the nearest of `goals` (by path cost, ignoring this turn's MOV) and stop at the
 * furthest free tile on the way that the unit can reach this turn and `allowed` accepts.
 */
function approach(battle: BattleState, unit: UnitInstance, goals: readonly Point[], allowed: (p: Point) => boolean): Point {
  const here = { x: unit.x, y: unit.y };
  const full = battle.reachFor(unit, Number.POSITIVE_INFINITY);
  const free = (p: Point): boolean => {
    const other = battle.unitAt(p.x, p.y);
    return other === undefined || other === unit;
  };
  let goal: { p: Point; cost: number } | null = null;
  for (const p of goals) {
    const node = full.nodes.get(tileKey(p.x, p.y));
    if (!node || !free(p)) continue;
    if (!goal || node.cost < goal.cost || (node.cost === goal.cost && tileKey(p.x, p.y) < tileKey(goal.p.x, goal.p.y))) goal = { p, cost: node.cost };
  }
  if (!goal) return here;
  let to = here;
  for (const p of pathTo(full, goal.p) ?? []) {
    const cost = full.nodes.get(tileKey(p.x, p.y))?.cost ?? Number.POSITIVE_INFINITY;
    if (cost > unit.stats.mov) break;
    if (free(p) && allowed(p)) to = p;
  }
  return to;
}

/** Tiles from which `unit` could strike `target` with any of its weapons. */
function strikeTiles(battle: BattleState, unit: UnitInstance, target: UnitInstance): Point[] {
  const { width, height } = battle.map;
  return battle.usableWeapons(unit).flatMap(({ weapon }) => ring(target, weapon.range[0], weapon.range[1], width, height));
}

/** With nothing to attack this turn, where the unit moves (DESIGN §10.2, "movement by mode"). */
function moveWithoutOption(battle: BattleState, unit: UnitInstance, profile: AiProfile, allowed: (p: Point) => boolean): Point {
  const here = { x: unit.x, y: unit.y };
  if (profile.mode === 'stationary') return here;

  const ward = profile.mode === 'guard' ? guardPoint(battle, profile) : null;
  if (ward) {
    if (manhattan(here, ward) <= GUARD_RADIUS) return here;
    // out of position: walk back, held only by the leash
    const leash = profile.leash;
    const leashed = (p: Point): boolean => leash === undefined || manhattan(p, unit.home) <= leash;
    return approach(battle, unit, ring(ward, 0, GUARD_RADIUS, battle.map.width, battle.map.height), leashed);
  }

  // A unit with no weapon (a healer) follows the nearest wounded friend instead.
  if (battle.usableWeapons(unit).length === 0) {
    const remedies = battle.usableRemedies(unit);
    const wounded = battle.livingUnits().filter((u) => u !== unit && areFriendly(unit.side, u.side) && u.hp < maxHp(u));
    const goals = wounded.flatMap((u) => remedies.flatMap(({ weapon }) => ring(u, weapon.range[0], weapon.range[1], battle.map.width, battle.map.height)));
    return approach(battle, unit, goals, allowed);
  }

  // Choose a target: the nearest by path cost; in priority mode, the best-ranked first.
  const full = battle.reachFor(unit, Number.POSITIVE_INFINITY);
  const hostiles = battle.livingUnits().filter((u) => areHostile(unit.side, u.side));
  const lowestHp = Math.min(...hostiles.map((u) => u.hp));
  let best: { target: UnitInstance; rank: number; cost: number; goals: Point[] } | null = null;
  for (const target of hostiles) {
    const goals = strikeTiles(battle, unit, target);
    const costs = goals
      .filter((p) => {
        const other = battle.unitAt(p.x, p.y);
        return other === undefined || other === unit;
      })
      .map((p) => full.nodes.get(tileKey(p.x, p.y))?.cost)
      .filter((c): c is number => c !== undefined);
    if (costs.length === 0) continue;
    const cost = Math.min(...costs);
    const rank = profile.mode === 'priority' ? tagBonus(battle, profile, target, { lowestHp, canKill: false }) : 0;
    const better = !best || rank > best.rank || (rank === best.rank && (cost < best.cost || (cost === best.cost && target.id < best.target.id)));
    if (better) best = { target, rank, cost, goals };
  }
  return best ? approach(battle, unit, best.goals, allowed) : here;
}

function planFlee(battle: BattleState, unit: UnitInstance, reach: ReachResult, exits: readonly Point[]): AiPlan {
  const here = { x: unit.x, y: unit.y };
  const isExit = (p: Point): boolean => exits.some((e) => samePoint(e, p));
  if (isExit(here)) return { unit, to: here, action: { kind: 'escape' }, wakes: false, score: null };
  if (exits.length > 0) {
    const to = approach(battle, unit, exits, () => true);
    return { unit, to, action: isExit(to) ? { kind: 'escape' } : { kind: 'wait' }, wakes: false, score: null };
  }
  // No exit on this map: put as much distance as possible between the unit and its foes.
  const hostiles = battle.livingUnits().filter((u) => areHostile(unit.side, u.side));
  const safety = (p: Point): number => Math.min(Number.POSITIVE_INFINITY, ...hostiles.map((h) => manhattan(p, h)));
  let to = here;
  for (const p of reach.stops) {
    const gain = safety(p) - safety(to);
    const cheaper = (reach.nodes.get(tileKey(p.x, p.y))?.cost ?? 0) < (reach.nodes.get(tileKey(to.x, to.y))?.cost ?? 0);
    if (gain > 0 || (gain === 0 && cheaper)) to = p;
  }
  return { unit, to, action: { kind: 'wait' }, wakes: false, score: null };
}

/** Decide one computer-controlled unit's move and action. Pure: the battle is not changed. */
export function planUnit(battle: BattleState, unit: UnitInstance): AiPlan {
  const profile = unit.ai ?? DEFAULT_AI;
  const here = { x: unit.x, y: unit.y };
  const stay = (wakes = false): AiPlan => ({ unit, to: here, action: { kind: 'wait' }, wakes, score: null });

  if (profile.activateOnTurn !== undefined && battle.turn < profile.activateOnTurn) return stay();
  if (profile.activateOnFlag !== undefined && !battle.flags.has(profile.activateOnFlag)) return stay();

  const reach = battle.reachFor(unit);
  if (profile.mode === 'flee') return planFlee(battle, unit, reach, battle.exits);

  let wakes = false;
  if (profile.mode === 'defensive' && !unit.triggered) {
    if (!isTriggered(battle, unit, profile, reach)) return stay();
    wakes = true;
  }

  const ward = profile.mode === 'guard' ? guardPoint(battle, profile) : null;
  const leash = profile.leash;
  const allowed = (p: Point): boolean =>
    (ward === null || manhattan(p, ward) <= GUARD_RADIUS) && (leash === undefined || manhattan(p, unit.home) <= leash);
  const stops = profile.mode === 'stationary' ? [here] : reach.stops.filter(allowed);

  const best = scoreOptions(battle, unit, profile, stops, reach)[0];
  if (best) return { unit, to: best.to, action: best.action, wakes, score: best.score };
  return { unit, to: moveWithoutOption(battle, unit, profile, allowed), action: { kind: 'wait' }, wakes, score: null };
}
