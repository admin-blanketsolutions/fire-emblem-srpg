import type { UnitPlan } from './ai';
import type { AiWeights } from './aiProfile';
import type { Balance } from './balance';
import type { ClassDef, ClassTable } from './classes';
import { forecast, NO_BONUS, resolveStrikes, type Combatant, type Forecast, type HitMode, type StrikeEvent } from './combat';
import { EventRunner, matchesKey, type EventAction, type PhaseSide, type SpawnSpec, type Trigger } from './events';
import { awardExp, expForFight, expForHeal, grantWexp, type ExpResult, type WexpGain } from './exp';
import { computeVisible } from './fog';
import { manhattan, neighbors4, ring, tileKey } from './grid';
import type { GameMap } from './map';
import { checkObjective, newProgress, type Checkpoint, type ObjectiveProgress, type Outcome } from './objectives';
import { computeReach, pathTo, type ReachResult } from './pathfinding';
import type { Rng } from './rng';
import { areFriendly, areHostile, type Point, type Side } from './types';
import { autoEquip, canEquip, createUnit, equippedWeapon, INVENTORY_SLOTS, maxHp, weaponStacks, type UnitInstance, type UnitTable } from './unit';
import { canReach, isOffensive, type WeaponDef, type WeaponTable } from './weapons';

/** The phases a turn is made of; each is played by one side. */
export type Phase = PhaseSide;

/** Player-facing rule settings that change outcomes (DESIGN §16). */
export interface BattleRules {
  readonly hitMode: HitMode;
  /** A level-up that gains nothing re-rolls the best stat once. */
  readonly guaranteedProgress: boolean;
}

export const DEFAULT_RULES: BattleRules = { hitMode: 'honest', guaranteedProgress: true };

/** Static game data a battle needs. */
export interface BattleTables {
  readonly weapons: WeaponTable;
  readonly classes: ClassTable;
  readonly balance: Balance;
  /** Unit definitions, for reinforcements and spawn events. */
  readonly units: UnitTable;
  readonly ai: AiWeights;
}

/** A weapon the unit could attack with from a tile, and whom it would reach. */
export interface AttackOption {
  readonly slot: number;
  readonly weapon: WeaponDef;
  readonly targets: UnitInstance[];
}

export interface ExpAward extends ExpResult {
  readonly unit: UnitInstance;
  readonly amount: number;
}

export interface FightReport {
  readonly attacker: UnitInstance;
  readonly defender: UnitInstance;
  /** The prediction the fight was played from. */
  readonly forecast: Forecast;
  readonly events: readonly StrikeEvent[];
  readonly hpBefore: { readonly attacker: number; readonly defender: number };
  readonly expAwards: readonly ExpAward[];
  readonly wexpGains: ReadonlyArray<WexpGain & { readonly unit: UnitInstance }>;
  /** Weapons that ran out of uses and were removed. */
  readonly brokenWeapons: ReadonlyArray<{ readonly unit: UnitInstance; readonly weapon: WeaponDef }>;
  /** Units that retreat wounded. */
  readonly defeated: readonly UnitInstance[];
}

export interface HealReport {
  readonly healer: UnitInstance;
  readonly target: UnitInstance;
  readonly restored: number;
  readonly expAward: ExpAward | null;
}

/** What happened as a phase began: terrain healing and units arriving. */
export interface PhaseReport {
  readonly turn: number;
  readonly phase: Phase;
  readonly healed: ReadonlyArray<{ readonly unit: UnitInstance; readonly amount: number }>;
  readonly arrived: readonly UnitInstance[];
}

/** Something for the player to read: a scene to play, or plain text. */
export type BattleMessage = { readonly kind: 'dialogue'; readonly scene: string } | { readonly kind: 'message'; readonly text: string };

/** The result of carrying out a computer-controlled unit's plan. */
export interface PlanResult {
  readonly unit: UnitInstance;
  readonly path: Point[];
  readonly fight: FightReport | null;
  readonly heal: HealReport | null;
  /** The unit left the map by an exit. */
  readonly escaped: boolean;
}

/**
 * The battle rules: occupancy, movement, forecasts, fights with EXP and durability, healing,
 * phases with reinforcements and terrain effects, events, objectives, fog of war, and the
 * special actions (Seize, Depart, Talk, Visit). Every random draw comes from the battle's
 * seeded Rng, so a battle replays exactly from its seed.
 */
export class BattleState {
  readonly map: GameMap;
  readonly units: UnitInstance[];
  readonly tables: BattleTables;
  readonly rng: Rng;
  readonly rules: BattleRules;
  turn = 1;
  phase: Phase;
  readonly phaseOrder: readonly Phase[];
  private phaseIndex = 0;
  private begun = false;

  readonly events: EventRunner;
  readonly flags = new Set<string>();
  readonly progress: ObjectiveProgress = newProgress();
  /** Set once the chapter is won or lost. */
  outcome: Outcome | null = null;
  /** Dialogue and messages waiting for the player to read, oldest first. */
  readonly messages: BattleMessage[] = [];
  /** Units that appeared during play (by an event) and have not been shown yet. */
  readonly arrivals: UnitInstance[] = [];
  /** Event actions that need systems from later milestones (gates, flames, the Codex). */
  readonly unhandled: EventAction[] = [];

  /** Tiles the player's side has seen, and tiles it sees now (fog of war). */
  explored = new Set<number>();
  visible = new Set<number>();

  constructor(map: GameMap, units: UnitInstance[], tables: BattleTables, rng: Rng, rules: BattleRules = DEFAULT_RULES) {
    this.map = map;
    this.units = units;
    this.tables = tables;
    this.rng = rng;
    this.rules = rules;
    this.phaseOrder = map.rules.phaseOrder;
    this.phase = this.phaseOrder[0] ?? 'player';
    this.events = new EventRunner(map.rules.events);
    this.updateVisibility();
  }

  // ------------------------------------------------------------------ queries

  /** The unit standing on a tile, if any. */
  unitAt(x: number, y: number): UnitInstance | undefined {
    return this.units.find((u) => !u.retreated && u.x === x && u.y === y);
  }

  livingUnits(side?: Side): UnitInstance[] {
    return this.units.filter((u) => !u.retreated && (side === undefined || u.side === side));
  }

  weaponOf(unit: UnitInstance): WeaponDef | null {
    return equippedWeapon(unit, this.tables.weapons);
  }

  classOf(unit: UnitInstance): ClassDef {
    const classDef = this.tables.classes.get(unit.classId);
    if (!classDef) throw new Error(`Unit "${unit.id}" has unknown class "${unit.classId}"`);
    return classDef;
  }

  /** Where a unit can move this turn, given everyone else on the board. */
  reachFor(unit: UnitInstance): ReachResult {
    return computeReach({
      map: this.map,
      start: { x: unit.x, y: unit.y },
      moveType: unit.moveType,
      mov: unit.stats.mov,
      side: unit.side,
      occupantAt: (x, y) => {
        const other = this.unitAt(x, y);
        return other && other !== unit ? other.side : null;
      },
    });
  }

  /** The offensive weapons the unit can equip right now, in inventory order. */
  usableWeapons(unit: UnitInstance): Array<{ slot: number; weapon: WeaponDef }> {
    const classDef = this.classOf(unit);
    return weaponStacks(unit, this.tables.weapons)
      .filter(({ weapon }) => isOffensive(weapon) && canEquip(unit, weapon, classDef))
      .map(({ slot, weapon }) => ({ slot, weapon }));
  }

  /** Hostile units a weapon would reach from `from`. */
  targetsFor(unit: UnitInstance, weapon: WeaponDef, from: Point): UnitInstance[] {
    return ring(from, weapon.range[0], weapon.range[1], this.map.width, this.map.height)
      .map((p) => this.unitAt(p.x, p.y))
      .filter((u): u is UnitInstance => u !== undefined && u !== unit && areHostile(unit.side, u.side));
  }

  /** Every weapon the unit could use from `from` that reaches at least one hostile unit. */
  attackOptions(unit: UnitInstance, from: Point = unit): AttackOption[] {
    return this.usableWeapons(unit)
      .map(({ slot, weapon }) => ({ slot, weapon, targets: this.targetsFor(unit, weapon, from) }))
      .filter((option) => option.targets.length > 0);
  }

  /** Hostile units the equipped weapon reaches from `from`. */
  targetsFrom(unit: UnitInstance, from: Point): UnitInstance[] {
    const weapon = this.weaponOf(unit);
    return weapon && isOffensive(weapon) ? this.targetsFor(unit, weapon, from) : [];
  }

  /** Every tile the unit could attack after moving anywhere within its reach (for display). */
  threatTiles(unit: UnitInstance, reach: ReachResult): Point[] {
    const weapons = this.usableWeapons(unit);
    const seen = new Map<number, Point>();
    for (const stop of reach.stops) {
      for (const { weapon } of weapons) {
        for (const p of ring(stop, weapon.range[0], weapon.range[1], this.map.width, this.map.height)) {
          seen.set(tileKey(p.x, p.y), p);
        }
      }
    }
    return [...seen.values()];
  }

  private combatant(unit: UnitInstance, at: Point, slot?: number): Combatant {
    const stack = unit.inventory[slot ?? unit.equipped];
    const weapon = stack && stack.uses > 0 ? (this.tables.weapons.get(stack.id) ?? null) : null;
    return { unit, weapon, usesLeft: stack?.uses ?? 0, terrain: this.map.terrainAt(at.x, at.y), bonus: NO_BONUS };
  }

  /**
   * Predict an attack: damage, hit and crit chances, doubling and the expected HP afterwards.
   * `from` is where the attacker stands (default: where it is); `slot` evaluates a weapon other
   * than the equipped one without equipping it. Null if the attacker cannot attack from there.
   */
  forecastFor(attacker: UnitInstance, defender: UnitInstance, options: { from?: Point; slot?: number } = {}): Forecast | null {
    const from = options.from ?? attacker;
    const a = this.combatant(attacker, from, options.slot);
    const d = this.combatant(defender, defender);
    const fc = forecast(a, d, manhattan(from, defender), this.tables.balance);
    return fc.attacker.strike ? fc : null;
  }

  // ------------------------------------------------------------------ fog of war

  /** Recompute what the player's side can see and remember it. */
  updateVisibility(): void {
    this.visible = computeVisible(this, ['player', 'ally']);
    for (const key of this.visible) this.explored.add(key);
  }

  /** Whether the player can see a tile now; always true without fog. */
  isVisible(x: number, y: number): boolean {
    return !this.map.rules.fog || this.visible.has(tileKey(x, y));
  }

  isExplored(x: number, y: number): boolean {
    return !this.map.rules.fog || this.explored.has(tileKey(x, y));
  }

  /** The units the player can see: its own side, and others standing in sight. */
  visibleUnits(): UnitInstance[] {
    return this.livingUnits().filter((u) => u.side === 'player' || u.side === 'ally' || this.isVisible(u.x, u.y));
  }

  // ------------------------------------------------------------------ actions

  /** Move a unit along its cheapest path to `dest`. Returns the path, or null if unreachable. */
  moveUnit(unit: UnitInstance, dest: Point, reach: ReachResult): Point[] | null {
    if (!reach.stops.some((p) => p.x === dest.x && p.y === dest.y)) return null;
    const path = pathTo(reach, dest);
    if (!path) return null;
    unit.x = dest.x;
    unit.y = dest.y;
    unit.moved = true;
    this.updateVisibility();
    return path;
  }

  /** Mark a unit as finished for the phase. */
  wait(unit: UnitInstance): void {
    this.finishAction(unit);
  }

  /** Equip the weapon in an inventory slot if the unit may wield it. */
  equip(unit: UnitInstance, slot: number): boolean {
    const stack = unit.inventory[slot];
    const weapon = stack ? this.tables.weapons.get(stack.id) : undefined;
    if (!stack || !weapon || stack.uses <= 0 || !canEquip(unit, weapon, this.classOf(unit))) return false;
    unit.equipped = slot;
    return true;
  }

  /**
   * The end of a unit's action: it is spent, what it stands on takes effect, and the state of
   * the battle (events, objectives, what the player can see) is brought up to date.
   */
  private finishAction(unit: UnitInstance): void {
    unit.moved = true;
    unit.acted = true;
    this.settle(unit);
  }

  private settle(unit: UnitInstance): void {
    if (!unit.retreated) this.fire({ type: 'enter', unit, tile: { x: unit.x, y: unit.y } });
    this.afterChange();
  }

  private afterChange(): void {
    this.updateVisibility();
    this.fire({ type: 'update' });
    this.check('action');
  }

  /**
   * Fight: the attacker strikes, the defender counters if it can, and doubling follows
   * (DESIGN §5.2). Applies damage, weapon wear, EXP and weapon EXP, and retreats the fallen.
   * Throws if the attacker cannot attack the defender with its equipped weapon from where it stands.
   */
  fight(attacker: UnitInstance, defender: UnitInstance): FightReport {
    const fc = this.forecastFor(attacker, defender);
    if (!fc) throw new Error(`${attacker.name} cannot attack ${defender.name} from here`);
    const hpBefore = { attacker: attacker.hp, defender: defender.hp };
    // the weapon kinds are read now: a weapon that breaks mid-fight leaves the inventory
    const kinds = { a: this.weaponOf(attacker)?.kind, d: this.weaponOf(defender)?.kind };
    const events = resolveStrikes(fc, attacker.hp, defender.hp, this.rng, this.rules.hitMode, this.tables.balance);

    attacker.hp = this.hpAfter(events, 'a', hpBefore.attacker);
    defender.hp = this.hpAfter(events, 'd', hpBefore.defender);

    const brokenWeapons = [
      ...this.wearWeapon(attacker, events.filter((e) => e.by === 'a').length),
      ...this.wearWeapon(defender, events.filter((e) => e.by === 'd').length),
    ];

    const defeated: UnitInstance[] = [];
    for (const unit of [defender, attacker]) {
      if (unit.hp <= 0) {
        unit.retreated = true;
        defeated.push(unit);
      }
    }

    const expAwards: ExpAward[] = [];
    const wexpGains: Array<WexpGain & { unit: UnitInstance }> = [];
    const sides = [
      { unit: attacker, opponent: defender, key: 'a' as const },
      { unit: defender, opponent: attacker, key: 'd' as const },
    ];
    for (const { unit, opponent, key } of sides) {
      if (unit.side !== 'player' || unit.retreated) continue;
      const mine = events.filter((e) => e.by === key);
      const outcome = { dealtDamage: mine.some((e) => e.hit && e.damage > 0), killed: mine.some((e) => e.killed) };
      const amount = expForFight(unit, opponent, outcome, this.tables.balance);
      expAwards.push({ unit, amount, ...awardExp(unit, amount, this.classOf(unit), this.tables.balance, this.rng, this.rules.guaranteedProgress) });
      const kind = kinds[key];
      if (mine.length > 0 && kind) wexpGains.push({ unit, ...grantWexp(unit, kind, outcome.killed ? 2 : 1) });
    }

    this.finishAction(attacker);
    return { attacker, defender, forecast: fc, events, hpBefore, expAwards, wexpGains, brokenWeapons, defeated };
  }

  /** A unit's HP after the fight: each event records the HP of whoever was struck, so the last strike *against* it decides. */
  private hpAfter(events: readonly StrikeEvent[], who: 'a' | 'd', before: number): number {
    const struck = events.filter((e) => e.by !== who).at(-1);
    return struck ? struck.targetHpAfter : before;
  }

  /** Use up `strikes` uses of the unit's equipped weapon; a weapon at 0 breaks and is removed. */
  private wearWeapon(unit: UnitInstance, strikes: number): Array<{ unit: UnitInstance; weapon: WeaponDef }> {
    if (strikes === 0) return [];
    const stack = unit.inventory[unit.equipped];
    const weapon = stack ? this.tables.weapons.get(stack.id) : undefined;
    if (!stack || !weapon) return [];
    stack.uses = Math.max(0, stack.uses - strikes);
    if (stack.uses > 0) return [];
    unit.inventory.splice(unit.equipped, 1);
    autoEquip(unit, this.tables.weapons, this.tables.classes);
    return [{ unit, weapon }];
  }

  // ------------------------------------------------------------------ healing

  /** Remedies the unit can use, in inventory order. */
  usableRemedies(unit: UnitInstance): Array<{ slot: number; weapon: WeaponDef }> {
    const classDef = this.classOf(unit);
    return weaponStacks(unit, this.tables.weapons)
      .filter(({ weapon }) => weapon.kind === 'remedy' && canEquip(unit, weapon, classDef))
      .map(({ slot, weapon }) => ({ slot, weapon }));
  }

  /** Wounded friends within reach of the remedy, from `from`. */
  healTargets(healer: UnitInstance, weapon: WeaponDef, from: Point = healer): UnitInstance[] {
    return this.units.filter(
      (u) =>
        !u.retreated &&
        u !== healer &&
        areFriendly(healer.side, u.side) &&
        u.hp < maxHp(u) &&
        canReach(weapon, manhattan(from, u)),
    );
  }

  /** Restore HP with the remedy in `slot`. The healer earns EXP and weapon EXP and is done for the turn. */
  heal(healer: UnitInstance, target: UnitInstance, slot: number): HealReport {
    const stack = healer.inventory[slot];
    const weapon = stack ? this.tables.weapons.get(stack.id) : undefined;
    if (!stack || !weapon || weapon.kind !== 'remedy' || stack.uses <= 0) throw new Error(`${healer.name} has no remedy in slot ${slot}`);
    const restored = Math.min(weapon.might, maxHp(target) - target.hp);
    target.hp += restored;
    stack.uses -= 1;
    if (stack.uses <= 0) {
      healer.inventory.splice(slot, 1);
      if (healer.equipped === slot) healer.equipped = -1;
      else if (healer.equipped > slot) healer.equipped -= 1;
    }
    let expAward: ExpAward | null = null;
    if (healer.side === 'player') {
      const amount = expForHeal(healer, restored, this.tables.balance);
      expAward = { unit: healer, amount, ...awardExp(healer, amount, this.classOf(healer), this.tables.balance, this.rng, this.rules.guaranteedProgress) };
      grantWexp(healer, 'remedy', 1);
    }
    this.finishAction(healer);
    return { healer, target, restored, expAward };
  }

  // ------------------------------------------------------------------ Seize, Depart, Talk, Visit

  /** Whether the unit may Seize where it stands (the Seize objective). */
  canSeize(unit: UnitInstance): boolean {
    const o = this.map.rules.objective;
    if (!o || o.type !== 'seize' || unit.side !== 'player' || unit.retreated) return false;
    if (!o.tiles.some((t) => t[0] === unit.x && t[1] === unit.y)) return false;
    const by = o.by ?? 'lord';
    return by === 'any' || (by === 'lord' ? unit.tags.includes('lord') : matchesKey(unit, by));
  }

  seize(unit: UnitInstance): void {
    if (!this.canSeize(unit)) throw new Error(`${unit.name} cannot seize from here`);
    this.progress.seized = true;
    this.finishAction(unit);
  }

  /** Whether the escorted unit stands on an exit and may Depart (the Escort objective). */
  canDepart(unit: UnitInstance): boolean {
    const o = this.map.rules.objective;
    return !!o && o.type === 'escort' && !unit.retreated && matchesKey(unit, o.unit) && o.exit.some((t) => t[0] === unit.x && t[1] === unit.y);
  }

  /** The escorted unit leaves the map, safe. */
  depart(unit: UnitInstance): void {
    if (!this.canDepart(unit)) throw new Error(`${unit.name} cannot depart from here`);
    this.leaveMap(unit);
    this.finishAction(unit);
  }

  private leaveMap(unit: UnitInstance): void {
    unit.escaped = true;
    unit.retreated = true;
    this.progress.escaped.add(unit.id);
  }

  /** Units adjacent to `from` that the unit has a conversation waiting with. */
  talkTargets(unit: UnitInstance, from: Point = unit): UnitInstance[] {
    const pending = this.events.pendingTalks();
    if (pending.length === 0) return [];
    return this.livingUnits().filter(
      (other) =>
        other !== unit &&
        manhattan(from, other) === 1 &&
        pending.some((t) => (matchesKey(unit, t.a) && matchesKey(other, t.b)) || (matchesKey(unit, t.b) && matchesKey(other, t.a))),
    );
  }

  talk(unit: UnitInstance, other: UnitInstance): void {
    this.fire({ type: 'talk', a: unit, b: other });
    this.finishAction(unit);
  }

  /** Whether a visit event waits on the tile the unit stands on. */
  canVisit(unit: UnitInstance): boolean {
    return unit.side === 'player' && this.events.pendingVisits().some((t) => t[0] === unit.x && t[1] === unit.y);
  }

  visit(unit: UnitInstance): void {
    this.fire({ type: 'visit', unit, tile: { x: unit.x, y: unit.y } });
    this.finishAction(unit);
  }

  // ------------------------------------------------------------------ computer-controlled units

  /** Carry out a plan from `planUnit`: move, then act. Returns what happened, for the scene to show. */
  executePlan(plan: UnitPlan): PlanResult {
    const { unit } = plan;
    const here = { x: unit.x, y: unit.y };
    let path: Point[] = [here];
    if (plan.dest.x !== here.x || plan.dest.y !== here.y) {
      const moved = this.moveUnit(unit, plan.dest, this.reachFor(unit));
      if (!moved) throw new Error(`${unit.name} cannot reach (${plan.dest.x}, ${plan.dest.y})`);
      path = moved;
    }
    unit.moved = true;
    if (plan.wakes) unit.triggered = true;
    if (plan.escape) {
      this.leaveMap(unit);
      unit.acted = true;
      this.afterChange();
      return { unit, path, fight: null, heal: null, escaped: true };
    }
    const action = plan.action;
    if (action.kind === 'attack') {
      this.equip(unit, action.slot);
      return { unit, path, fight: this.fight(unit, action.target), heal: null, escaped: false };
    }
    if (action.kind === 'heal') {
      return { unit, path, fight: null, heal: this.heal(unit, action.target, action.slot), escaped: false };
    }
    this.wait(unit);
    return { unit, path, fight: null, heal: null, escaped: false };
  }

  // ------------------------------------------------------------------ units arriving

  /** The nearest free tile to `at` that the unit could stand on, or null if the map is full. */
  private freeTileNear(at: Point, unit: UnitInstance): Point | null {
    const seen = new Set<number>([tileKey(at.x, at.y)]);
    const queue: Point[] = [at];
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i] as Point;
      if (this.map.costFor(p.x, p.y, unit.moveType) !== null && !this.unitAt(p.x, p.y)) return p;
      for (const n of neighbors4(p, this.map.width, this.map.height)) {
        const key = tileKey(n.x, n.y);
        if (!seen.has(key)) {
          seen.add(key);
          queue.push(n);
        }
      }
    }
    return null;
  }

  /** Bring a unit onto the map; if its tile is taken it appears on the nearest free one. */
  spawn(spec: SpawnSpec): UnitInstance {
    const def = this.tables.units[spec.def];
    if (!def) throw new Error(`Cannot spawn unknown unit "${spec.def}"`);
    const taken = new Set(this.units.map((u) => u.id));
    let n = 1;
    while (taken.has(`${spec.def}#${n}`)) n += 1;
    const overrides = { ...(spec.ai ? { ai: spec.ai } : {}), ...(spec.tags ? { tags: spec.tags } : {}) };
    const unit = createUnit(def, `${spec.def}#${n}`, spec.at[0], spec.at[1], this.tables.classes, this.tables.weapons, overrides);
    const tile = this.freeTileNear({ x: spec.at[0], y: spec.at[1] }, unit);
    if (!tile) throw new Error(`No free tile for "${spec.def}" near (${spec.at[0]}, ${spec.at[1]})`);
    unit.x = tile.x;
    unit.y = tile.y;
    this.units.push(unit);
    this.arrivals.push(unit);
    return unit;
  }

  // ------------------------------------------------------------------ events and objectives

  /**
   * Offer a trigger to the events and carry out whatever comes due. Carrying out an action can
   * satisfy another event (a flag, a defeat), so the events are asked again, a few rounds at most.
   */
  fire(trigger: Trigger): void {
    let actions = this.events.run(trigger, { units: this.units, flags: this.flags });
    for (let round = 0; round < 8 && actions.length > 0; round++) {
      for (const action of actions) this.apply(action);
      actions = this.events.run({ type: 'update' }, { units: this.units, flags: this.flags });
    }
  }

  private apply(action: EventAction): void {
    switch (action.type) {
      case 'dialogue':
        this.messages.push({ kind: 'dialogue', scene: action.scene });
        break;
      case 'message':
        this.messages.push({ kind: 'message', text: action.text });
        break;
      case 'spawn':
        for (const spec of action.units) this.spawn(spec);
        break;
      case 'setAi':
        for (const u of this.units) {
          if (!u.retreated && matchesKey(u, action.unit)) {
            u.ai = action.ai;
            u.triggered = false;
          }
        }
        break;
      case 'recruit':
        for (const u of this.units) {
          if (!u.retreated && matchesKey(u, action.unit)) {
            u.side = 'player';
            u.ai = null;
            this.progress.recruited.add(u.id);
          }
        }
        break;
      case 'flag':
        this.flags.add(action.name);
        break;
      case 'giveItem': {
        const weapon = this.tables.weapons.get(action.item);
        const unit = this.units.find((u) => !u.retreated && matchesKey(u, action.unit));
        if (weapon && unit && unit.inventory.length < INVENTORY_SLOTS) {
          unit.inventory.push({ id: weapon.id, uses: weapon.uses });
          if (unit.equipped < 0) autoEquip(unit, this.tables.weapons, this.tables.classes);
        } else {
          this.unhandled.push(action);
        }
        break;
      }
      case 'endChapter':
        this.outcome ??= { result: action.result, reason: action.reason ?? (action.result === 'won' ? 'The chapter is won.' : 'The chapter is lost.') };
        break;
      case 'openGate':
      case 'ignite':
      case 'unlockCodex':
        this.unhandled.push(action);
        break;
    }
  }

  /** Judge the objective at a checkpoint. Once the chapter is decided it stays decided. */
  check(checkpoint: Checkpoint): void {
    const objective = this.map.rules.objective;
    if (this.outcome || !objective) return;
    this.outcome = checkObjective(this, objective, this.progress, checkpoint);
  }

  /** True while reinforcements are still to come. */
  hasFutureReinforcements(): boolean {
    return this.map.rules.reinforcements.some((r) => r.turn > this.turn || (r.turn === this.turn && this.phaseOrder.indexOf(r.phase) > this.phaseIndex));
  }

  private reinforcementsDue(phase: Phase): boolean {
    return this.map.rules.reinforcements.some((r) => r.turn === this.turn && r.phase === phase);
  }

  // ------------------------------------------------------------------ phases

  /** True when no unit of the side can still act. */
  isSideSpent(side: Side): boolean {
    return this.livingUnits(side).every((u) => u.acted);
  }

  /** Begin the battle: the first phase starts, with its reinforcements, terrain effects and events. A second call does nothing. */
  begin(): PhaseReport {
    if (this.begun) return { turn: this.turn, phase: this.phase, healed: [], arrived: [] };
    this.begun = true;
    return this.startPhase();
  }

  /**
   * Close the current phase and start the next one. A side with no units is skipped, the turn
   * advances after the last phase, and the objective is checked at the end of the phase and of
   * the turn. If the chapter is decided, the phase does not advance.
   */
  endPhase(): PhaseReport {
    this.check('phaseEnd');
    if (!this.outcome) this.advancePhase();
    if (this.outcome) return { turn: this.turn, phase: this.phase, healed: [], arrived: [] };
    return this.startPhase();
  }

  private advancePhase(): void {
    const order = this.phaseOrder;
    let i = this.phaseIndex;
    for (let guard = 0; guard < order.length * 2 + 2; guard++) {
      i += 1;
      if (i >= order.length) {
        this.check('turnEnd');
        if (this.outcome) return;
        this.turn += 1;
        i = 0;
      }
      const phase = order[i] as Phase;
      if (phase === 'player' || this.livingUnits(phase).length > 0 || this.reinforcementsDue(phase)) {
        this.phaseIndex = i;
        this.phase = phase;
        return;
      }
    }
  }

  private startPhase(): PhaseReport {
    const { turn, phase } = this;
    for (const unit of this.livingUnits(phase)) {
      unit.moved = false;
      unit.acted = false;
    }
    const before = this.arrivals.length;
    for (const r of this.map.rules.reinforcements) {
      if (r.turn === turn && r.phase === phase) for (const spec of r.units) this.spawn(spec);
    }
    const healed: Array<{ unit: UnitInstance; amount: number }> = [];
    for (const unit of this.livingUnits(phase)) {
      const share = this.map.terrainAt(unit.x, unit.y).heals;
      if (!share) continue;
      const amount = Math.min(Math.ceil(maxHp(unit) * share), maxHp(unit) - unit.hp);
      if (amount > 0) {
        unit.hp += amount;
        healed.push({ unit, amount });
      }
    }
    this.fire({ type: 'turnStart', turn, phase });
    const arrived = this.arrivals.splice(before);
    this.afterChange();
    return { turn, phase, healed, arrived };
  }
}
