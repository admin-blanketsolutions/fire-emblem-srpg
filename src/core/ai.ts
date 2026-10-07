import { DEFAULT_AI, type AiProfile, type TargetTag } from './aiProfile';
import type { BattleState, PlanResult } from './battle';
import { expectOutcome } from './combat';
import { matchesKey } from './events';
import { computeVisible } from './fog';
import { manhattan, tileKey } from './grid';
import { distanceField, type ReachResult } from './pathfinding';
import { areHostile, type Point, type Side } from './types';
import { maxHp, type UnitInstance } from './unit';

/**
 * Computer-controlled units (DESIGN §10). Pure: `planUnit` reads the battle and returns what the
 * unit would do; `BattleState.executePlan` carries it out. Units are planned one at a time, each
 * seeing the result of the one before, so no plan is ever based on a stale board.
 */

export interface UnitPlan {
  readonly unit: UnitInstance;
  /** Where the unit ends its move; its own tile if it stays. */
  readonly dest: Point;
  readonly action:
    | { readonly kind: 'attack'; readonly target: UnitInstance; readonly slot: number }
    | { readonly kind: 'heal'; readonly target: UnitInstance; readonly slot: number }
    | { readonly kind: 'wait' };
  /** The unit leaves the map by the exit it ends on. */
  readonly escape: boolean;
  /** A defensive unit that wakes this turn. */
  readonly wakes: boolean;
  /** The score of the chosen option, for tests and debugging. */
  readonly score: number;
}

const profileOf = (unit: UnitInstance): AiProfile => unit.ai ?? DEFAULT_AI;

/** Which sides' eyes a side's units share, for AI that respects fog. */
const sharedVision = (side: Side): readonly Side[] => (side === 'enemy' ? ['enemy'] : side === 'neutral' ? [] : ['player', 'ally']);

/** Living units hostile to the unit; with `respectsFog` and fog on, only those its side can see. */
export function opponentsOf(battle: BattleState, unit: UnitInstance): UnitInstance[] {
  const all = battle.livingUnits().filter((u) => areHostile(unit.side, u.side));
  if (!profileOf(unit).respectsFog || !battle.map.rules.fog) return all;
  const seen = computeVisible(battle, sharedVision(unit.side));
  return all.filter((u) => seen.has(tileKey(u.x, u.y)));
}

/** Whether the unit acts at all yet (some units wait for a turn or a flag). */
export function isActive(battle: BattleState, unit: UnitInstance): boolean {
  const profile = profileOf(unit);
  if (profile.activateOnTurn !== undefined && battle.turn < profile.activateOnTurn) return false;
  if (profile.activateOnFlag !== undefined && !battle.flags.has(profile.activateOnFlag)) return false;
  return true;
}

/** Whether a defensive unit has woken: it already did, it has been hurt, or an opponent is close. */
function hasWoken(battle: BattleState, unit: UnitInstance): boolean {
  const profile = profileOf(unit);
  if (profile.mode !== 'defensive' || unit.triggered || unit.hp < maxHp(unit)) return true;
  const reach = Math.max(0, ...battle.usableWeapons(unit).map((w) => w.weapon.range[1]));
  const radius = unit.stats.mov + reach + (profile.aggroRange ?? 0);
  return opponentsOf(battle, unit).some((o) => manhattan(unit, o) <= radius);
}

/** True for a unit that will not leave its tile this turn: stationary, or defensive and not yet woken. */
export function isHolding(battle: BattleState, unit: UnitInstance): boolean {
  if (!unit.ai) return false;
  const profile = unit.ai;
  return profile.mode === 'stationary' || (profile.mode === 'defensive' && !hasWoken(battle, unit));
}

const startOnly = (unit: UnitInstance): ReachResult => {
  const start = { x: unit.x, y: unit.y };
  return { start, nodes: new Map([[tileKey(start.x, start.y), { x: start.x, y: start.y, cost: 0, prev: null }]]), stops: [start] };
};

/** Where the unit could end its move: just its own tile if it is holding its post. */
export function unitReach(battle: BattleState, unit: UnitInstance): ReachResult {
  return isHolding(battle, unit) ? startOnly(unit) : battle.reachFor(unit);
}

/** How many opposing units could strike each tile, from where they are and as they would move. */
function threatCounts(battle: BattleState, unit: UnitInstance): Map<number, number> {
  const counts = new Map<number, number>();
  for (const other of battle.livingUnits()) {
    if (!areHostile(unit.side, other.side)) continue;
    for (const p of battle.threatTiles(other, unitReach(battle, other))) {
      const key = tileKey(p.x, p.y);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/** A unit whose loss decides the chapter: a Lord, the unit being escorted, or the unit being defended. */
export function isCritical(battle: BattleState, unit: UnitInstance): boolean {
  if (unit.tags.includes('lord')) return true;
  const objective = battle.map.rules.objective;
  if (objective?.type === 'escort') return matchesKey(unit, objective.unit);
  if (objective?.type === 'defend' && typeof objective.anchor === 'string') return matchesKey(unit, objective.anchor);
  return false;
}

function matchesTag(battle: BattleState, u: UnitInstance, tag: TargetTag, pKill: number, lowest: boolean): boolean {
  switch (tag) {
    case 'lord':
      return u.tags.includes('lord');
    case 'healer':
      return battle.usableRemedies(u).length > 0;
    case 'archer': {
      const kind = battle.weaponOf(u)?.kind;
      return kind === 'bow' || kind === 'crossbow';
    }
    case 'mounted':
      return u.moveType === 'mounted';
    case 'armored':
      return u.moveType === 'armored';
    case 'lowestHp':
      return lowest;
    case 'canKill':
      return pKill >= 0.5;
  }
}

/** 0 to 1: how strongly the unit's priority list favours this target (the first tag counts most). */
function tagBonus(battle: BattleState, target: UnitInstance, priority: readonly TargetTag[], pKill: number, lowest: boolean): number {
  const n = priority.length;
  let best = 0;
  priority.forEach((tag, i) => {
    if (matchesTag(battle, target, tag, pKill, lowest)) best = Math.max(best, (n - i) / n);
  });
  return best;
}

/** The point a guard unit stays close to: the guarded unit, the guarded tile, or its own post. */
function guardPoint(battle: BattleState, unit: UnitInstance, profile: AiProfile): Point {
  const guard = profile.guard;
  if (typeof guard === 'string') {
    const target = battle.livingUnits().find((u) => u !== unit && matchesKey(u, guard));
    if (target) return { x: target.x, y: target.y };
  } else if (guard) {
    return guard;
  }
  return unit.home;
}

interface Choice {
  readonly dest: Point;
  readonly action: UnitPlan['action'];
  readonly score: number;
  readonly exposure: number;
  readonly cost: number;
}

const EPS = 1e-9;

/** Best first: score, then less exposure, then a shorter move, then a stable position order. */
function better(a: Choice, b: Choice): number {
  if (Math.abs(a.score - b.score) > EPS) return b.score - a.score;
  return a.exposure - b.exposure || a.cost - b.cost || a.dest.y - b.dest.y || a.dest.x - b.dest.x;
}

/** The targets a unit heads for when nothing is in reach: all opponents, or its priority list's first non-empty group. */
function advanceTargets(battle: BattleState, opponents: readonly UnitInstance[], profile: AiProfile): UnitInstance[] {
  if (profile.mode !== 'priority') return [...opponents];
  const lowestFrac = Math.min(...opponents.map((o) => o.hp / maxHp(o)));
  for (const tag of profile.priority ?? ['lord']) {
    const group = opponents.filter((o) => matchesTag(battle, o, tag, 0, o.hp / maxHp(o) <= lowestFrac + EPS));
    if (group.length > 0) return group;
  }
  return [...opponents];
}

/** What the unit does this turn. */
export function planUnit(battle: BattleState, unit: UnitInstance): UnitPlan {
  const profile = profileOf(unit);
  const here: Point = { x: unit.x, y: unit.y };
  const stay = (wakes = false): UnitPlan => ({ unit, dest: here, action: { kind: 'wait' }, escape: false, wakes, score: 0 });
  if (!isActive(battle, unit)) return stay();

  const opponents = opponentsOf(battle, unit);
  const holding = isHolding(battle, unit);
  const wakes = profile.mode === 'defensive' && !unit.triggered && !holding;
  const reach = holding ? startOnly(unit) : battle.reachFor(unit);
  const { ai: weights, balance } = battle.tables;

  // a leash and a guard post limit where the unit may stand
  let stops = reach.stops;
  const post = profile.mode === 'guard' ? guardPoint(battle, unit, profile) : null;
  if (profile.leash !== undefined) {
    const leash = profile.leash;
    const near = stops.filter((p) => manhattan(p, unit.home) <= leash);
    if (near.length > 0) stops = near;
  }
  if (post) {
    const near = stops.filter((p) => manhattan(p, post) <= weights.guardRadius);
    if (near.length > 0) stops = near;
  }

  // every (tile, weapon, target) the unit could do, scored
  const threat = threatCounts(battle, unit);
  const priority = profile.priority ?? ['lord'];
  const counterWeight = profile.avoidCounter ? weights.counterAvoid : weights.counter;
  const lowestFrac = Math.min(...opponents.map((o) => o.hp / maxHp(o)));
  const weapons = battle.usableWeapons(unit);
  const remedies = battle.usableRemedies(unit);
  const choices: Choice[] = [];
  for (const stop of stops) {
    const key = tileKey(stop.x, stop.y);
    const terrain = battle.map.terrainAt(stop.x, stop.y);
    const exposure = threat.get(key) ?? 0;
    const position = weights.cover * terrain.cover + weights.avoid * terrain.avoid - weights.exposure * exposure;
    const cost = reach.nodes.get(key)?.cost ?? 0;
    for (const { slot, weapon } of weapons) {
      for (const target of battle.targetsFor(unit, weapon, stop)) {
        if (!opponents.includes(target)) continue;
        const fc = battle.forecastFor(unit, target, { from: stop, slot });
        if (!fc) continue;
        const e = expectOutcome(fc, unit.hp, target.hp, balance);
        const bonus = tagBonus(battle, target, priority, e.pKill, target.hp / maxHp(target) <= lowestFrac + EPS);
        const critical = isCritical(battle, target) ? weights.criticalKill * e.pKill : 0;
        const score = weights.kill * e.pKill + critical + weights.damage * e.damageDealt + weights.tag * bonus - counterWeight * e.damageTaken - weights.death * e.pDeath + position;
        choices.push({ dest: stop, action: { kind: 'attack', target, slot }, score, exposure, cost });
      }
    }
    for (const { slot, weapon } of remedies) {
      for (const target of battle.healTargets(unit, weapon, stop)) {
        const restored = Math.min(weapon.might, maxHp(target) - target.hp);
        if (restored < weights.healMin) continue;
        const score = weights.heal * restored * (target.tags.includes('lord') ? 1.5 : 1) + position;
        choices.push({ dest: stop, action: { kind: 'heal', target, slot }, score, exposure, cost });
      }
    }
  }
  const best = choices.sort(better)[0];
  if (best) return { unit, dest: best.dest, action: best.action, escape: false, wakes, score: best.score };

  // nothing to do from any reachable tile: move by mode
  if (holding) return stay(wakes);
  const toward = (sources: readonly Point[]): UnitPlan => {
    if (sources.length === 0) return stay(wakes);
    const field = distanceField(battle.map, unit.moveType, sources);
    const value = (p: Point): number => field.get(tileKey(p.x, p.y)) ?? Number.POSITIVE_INFINITY;
    const ranked = stops
      .map((p) => ({ dest: p, score: -value(p), exposure: threat.get(tileKey(p.x, p.y)) ?? 0, cost: reach.nodes.get(tileKey(p.x, p.y))?.cost ?? 0 }))
      .sort((a, b) => b.score - a.score || a.exposure - b.exposure || a.cost - b.cost || a.dest.y - b.dest.y || a.dest.x - b.dest.x);
    const first = ranked[0];
    if (!first || value(first.dest) >= value(here)) return stay(wakes);
    return { unit, dest: first.dest, action: { kind: 'wait' }, escape: false, wakes, score: first.score };
  };

  if (profile.mode === 'flee') {
    const exits = battle.map.rules.exits.map(([x, y]) => ({ x, y }));
    const exit = stops.find((p) => exits.some((e) => e.x === p.x && e.y === p.y));
    if (exit) return { unit, dest: exit, action: { kind: 'wait' }, escape: true, wakes, score: 0 };
    return toward(exits);
  }
  if (post) return manhattan(here, post) > weights.guardRadius ? toward([post]) : stay(wakes);
  if (profile.leash !== undefined && manhattan(here, unit.home) > profile.leash) return toward([unit.home]);
  return toward(advanceTargets(battle, opponents, profile).map((t) => ({ x: t.x, y: t.y })));
}

/** The next unit of the side that has not acted: leaders last, otherwise in the order they were placed. */
export function nextUnitToAct(battle: BattleState, side: Side): UnitInstance | null {
  const rank = (u: UnitInstance): number => (u.tags.includes('leader') || u.tags.includes('boss') ? 1 : 0);
  let best: UnitInstance | null = null;
  for (const u of battle.units) {
    if (u.retreated || u.side !== side || u.acted || !u.ai) continue;
    if (!best || rank(u) < rank(best)) best = u;
  }
  return best;
}

/** Play out a whole phase for a computer-controlled side, stopping early if the chapter is decided. */
export function playPhase(battle: BattleState, side: Side): PlanResult[] {
  const results: PlanResult[] = [];
  for (let guard = 0; guard < 500 && !battle.outcome; guard++) {
    const unit = nextUnitToAct(battle, side);
    if (!unit) break;
    results.push(battle.executePlan(planUnit(battle, unit)));
  }
  return results;
}
