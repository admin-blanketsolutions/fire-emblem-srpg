import type { UnitPlan } from './ai';
import type { AiProfile, AiWeights } from './aiProfile';
import type { Balance } from './balance';
import type { ItemTable } from './items';
import { createStructure, type StructureTable } from './structures';
import { availableActions, performAction, type ClassActionId, type ClassActionOption, type ClassActionReport } from './classActions';
import type { ClassDef, ClassTable } from './classes';
import { defence, forecast, power, resolveStrikes, type Combatant, type Forecast, type HitMode, type StrikeEvent } from './combat';
import { EventRunner, matchesKey, type EventAction, type PhaseSide, type SpawnSpec, type Trigger } from './events';
import { awardExp, expForFight, expForHeal, grantWexp, type ExpResult, type WexpGain } from './exp';
import { computeVisible } from './fog';
import { DIRS4, keyX, keyY, manhattan, neighbors4, ring, tileKey } from './grid';
import type { GameMap } from './map';
import type { TerrainDef, TerrainTable } from './terrain';
import { applyItem, canUseItem, equipWeapon, swapItems, type ItemUseReport } from './inventory';
import { checkPromotion, promote } from './promotion';
import { adjustedCost, movementOf, rangeBonus, skillBonus, type CombatContext, type SkillTable } from './skills';
import { checkObjective, newProgress, type Checkpoint, type ObjectiveProgress, type Outcome } from './objectives';
import { pairKey, type SupportGain, type SupportTracker } from './supports';
import { computeReach, pathTo, type ReachResult } from './pathfinding';
import type { Rng } from './rng';
import { applyStatus, hasExpired, type StatusId } from './status';
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
  readonly items: ItemTable;
  readonly classes: ClassTable;
  readonly balance: Balance;
  /** Unit definitions, for reinforcements and spawn events. */
  readonly units: UnitTable;
  readonly structures: StructureTable;
  readonly terrain: TerrainTable;
  readonly skills: SkillTable;
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
  /** Units that retreat wounded (and structures that are destroyed). */
  readonly defeated: readonly UnitInstance[];
  /** Tiles set alight by the fight. */
  readonly ignited: readonly Point[];
  /** Fire Storm: other enemies beside the target who took half the damage. */
  readonly splash: ReadonlyArray<{ readonly target: UnitInstance; readonly damage: number }>;
}

export type { ItemUseReport } from './inventory';

export interface HealReport {
  readonly healer: UnitInstance;
  readonly target: UnitInstance;
  readonly restored: number;
  readonly cured: readonly StatusId[];
  readonly expAward: ExpAward | null;
}

/** What happened as a phase began: terrain healing and units arriving. */
export interface PhaseReport {
  readonly turn: number;
  readonly phase: Phase;
  readonly healed: ReadonlyArray<{ readonly unit: UnitInstance; readonly amount: number }>;
  /** Units hurt by flames as the previous phase ended. */
  readonly burned: ReadonlyArray<{ readonly unit: UnitInstance; readonly damage: number }>;
  readonly arrived: readonly UnitInstance[];
  /** Support points the Player Phase that has just ended earned. */
  readonly supportGains: readonly SupportGain[];
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
 * Everything about a battle in progress that is not fixed by its map, its tables and its rules,
 * as plain JSON: the suspend-save (DESIGN §3.9). Units are written elsewhere and referred to here
 * by number, so a unit shared with the army stays one unit when the save is read back.
 */
export interface BattleSnapshot {
  readonly rng: number;
  readonly turn: number;
  readonly phase: Phase;
  readonly phaseIndex: number;
  readonly begun: boolean;
  readonly units: readonly number[];
  readonly fired: readonly string[];
  readonly flags: readonly string[];
  readonly progress: { readonly seized: boolean; readonly leaked: readonly string[]; readonly recruited: readonly string[]; readonly escaped: readonly string[] };
  readonly outcome: Outcome | null;
  readonly ransom: number;
  readonly messages: readonly BattleMessage[];
  readonly arrivals: readonly number[];
  readonly unhandled: readonly EventAction[];
  readonly codex: readonly string[];
  readonly explored: readonly number[];
  readonly visible: readonly number[];
  /** Changed tiles: tile key and terrain id. */
  readonly terrain: ReadonlyArray<readonly [number, string]>;
  readonly terrainVersion: number;
  readonly flames: ReadonlyArray<readonly [number, number]>;
  readonly counts: ReadonlyArray<readonly [string, number]>;
  /** Whether the army's supports were with the battle. */
  readonly supports: boolean;
  readonly fought: ReadonlyArray<readonly [string, Point]>;
  readonly aided: readonly string[];
  readonly skippedBurns: ReadonlyArray<{ readonly unit: number; readonly damage: number }>;
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
  /** Dinars of ransom earned this chapter (Clemency). */
  ransom = 0;
  /** Dialogue and messages waiting for the player to read, oldest first. */
  readonly messages: BattleMessage[] = [];
  /** Units that appeared during play (by an event) and have not been shown yet. */
  readonly arrivals: UnitInstance[] = [];
  /** Event actions that need systems from later milestones (gates, flames, the Codex). */
  readonly unhandled: EventAction[] = [];
  /** Codex entries unlocked by events during the battle, for the campaign to keep. */
  readonly codexUnlocks: string[] = [];

  /** Tiles the player's side has seen, and tiles it sees now (fog of war). */
  explored = new Set<number>();
  visible = new Set<number>();

  /** Tiles whose terrain has changed during the battle (a wall breached). */
  private readonly overrides = new Map<number, TerrainDef>();
  /** Bumped whenever terrain changes, so a view knows to redraw the map. */
  terrainVersion = 0;
  /** Burning tiles, each with the turns it has left (DESIGN §4.6). */
  readonly flames = new Map<number, number>();
  /** Counts of things done this chapter, for the limits on actions (barricades, decrees). */
  private readonly counts = new Map<string, number>();
  /** The army's supports, if the chapter is played with them: points gather at the end of each Player Phase. */
  supports: SupportTracker | null = null;
  /** Where each unit definition last fought this Player Phase, and who aided whom: what earns support points. */
  private readonly fought = new Map<string, Point>();
  private readonly aided = new Set<string>();
  /** Burns from phases that were skipped, to be reported with the next phase. */
  private readonly skippedBurns: Array<{ unit: UnitInstance; damage: number }> = [];

  countOf(key: string): number {
    return this.counts.get(key) ?? 0;
  }

  bump(key: string): void {
    this.counts.set(key, this.countOf(key) + 1);
  }

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

  /** The terrain on a tile, with any change made during the battle. */
  terrainAt(x: number, y: number): TerrainDef {
    return this.overrides.get(tileKey(x, y)) ?? this.map.terrainAt(x, y);
  }

  /** Change a tile's terrain, as when a wall is breached. */
  setTerrain(x: number, y: number, id: string): void {
    const def = this.tables.terrain.get(id);
    if (!def) throw new Error(`Unknown terrain "${id}"`);
    if (!this.map.inBounds(x, y)) throw new RangeError(`Tile (${x}, ${y}) is outside the map`);
    this.overrides.set(tileKey(x, y), def);
    this.terrainVersion += 1;
  }

  /** The cost for a unit to enter a tile: the terrain's cost, adjusted by its skills; a burning tile cannot be entered. */
  costFor(unit: UnitInstance): (x: number, y: number) => number | null {
    return (x, y) => {
      if (this.flames.has(tileKey(x, y))) return null;
      const terrain = this.terrainAt(x, y);
      const base = adjustedCost(unit, terrain.id, terrain.cost[unit.moveType]);
      if (base === null) return null;
      // climbing over a barricade costs one more
      const blocker = this.unitAt(x, y);
      return blocker && blocker !== unit && blocker.kind === 'structure' && this.crosses(unit, blocker) ? base + 1 : base;
    };
  }

  /** Whether the mover can climb over the structure (a barricade) rather than being stopped by it. */
  private crosses(mover: UnitInstance, structure: UnitInstance): boolean {
    return this.tables.structures.get(structure.defId)?.crossable?.includes(mover.moveType) ?? false;
  }

  // ------------------------------------------------------------------ flames

  flameAt(x: number, y: number): boolean {
    return this.flames.has(tileKey(x, y));
  }

  /** Whether a tile can hold flames: ground someone can walk on that is not water. */
  canBurn(x: number, y: number): boolean {
    const t = this.terrainAt(x, y);
    if (t.flammable) return true;
    return !t.quench && Object.values(t.cost).some((c) => c !== null);
  }

  /** Set a tile alight: two turns, three on flammable ground. */
  ignite(x: number, y: number): boolean {
    if (!this.map.inBounds(x, y) || !this.canBurn(x, y)) return false;
    const turns = this.terrainAt(x, y).flammable ? 3 : 2;
    const key = tileKey(x, y);
    this.flames.set(key, Math.max(this.flames.get(key) ?? 0, turns));
    return true;
  }

  /**
   * At the start of a phase every burning tile may light the flammable tiles beside it, with the
   * map's spread chance, raised by half in the direction of the wind. One draw is made for each
   * flammable, unlit neighbour, in a fixed order; fires lit now do not spread until the next phase.
   */
  private spreadFlames(): void {
    const chance = this.tables.balance.spreadChance;
    const wind = this.map.rules.wind;
    const downwind = wind === 'N' ? { x: 0, y: -1 } : wind === 'E' ? { x: 1, y: 0 } : wind === 'S' ? { x: 0, y: 1 } : wind === 'W' ? { x: -1, y: 0 } : null;
    const lit: number[] = [];
    for (const key of [...this.flames.keys()].sort((a, b) => a - b)) {
      for (const d of DIRS4) {
        const x = keyX(key) + d.x;
        const y = keyY(key) + d.y;
        if (!this.map.inBounds(x, y) || this.flames.has(tileKey(x, y)) || !this.terrainAt(x, y).flammable) continue;
        const p = downwind && downwind.x === d.x && downwind.y === d.y ? Math.min(1, chance * 1.5) : chance;
        if (this.rng.next() < p) lit.push(tileKey(x, y));
      }
    }
    for (const key of lit) this.ignite(keyX(key), keyY(key));
  }

  /** Flames at the end of a phase hurt what the side has standing in them: 4 damage, 8 to a structure that burns. */
  private burnUnits(side: Side): Array<{ unit: UnitInstance; damage: number }> {
    const burned: Array<{ unit: UnitInstance; damage: number }> = [];
    for (const unit of this.livingUnits(side)) {
      if (!this.flames.has(tileKey(unit.x, unit.y))) continue;
      const burns = unit.kind === 'structure' && this.tables.structures.get(unit.defId)?.fireWeak === true;
      const damage = Math.min(burns ? 8 : 4, unit.hp);
      unit.hp -= damage;
      if (unit.kind === 'unit') this.addStatus(unit, 'burn', 1);
      burned.push({ unit, damage });
      if (unit.hp <= 0) this.defeat(unit);
    }
    return burned;
  }

  /** Flames burn down once a turn. */
  private burnDown(): void {
    for (const [key, left] of [...this.flames]) {
      if (left <= 1) this.flames.delete(key);
      else this.flames.set(key, left - 1);
    }
  }

  /** A unit falls: it retreats wounded, and a structure is destroyed, perhaps leaving a breach where it stood. */
  defeat(unit: UnitInstance): void {
    unit.retreated = true;
    if (unit.kind !== 'structure') return;
    const breach = this.tables.structures.get(unit.defId)?.breach;
    if (breach) this.setTerrain(unit.x, unit.y, breach);
  }

  /** Where a unit can move this turn, given everyone else on the board. */
  reachFor(unit: UnitInstance, mov: number = movementOf(unit)): ReachResult {
    return computeReach({
      map: this.map,
      start: { x: unit.x, y: unit.y },
      moveType: unit.moveType,
      mov,
      side: unit.side,
      costFor: this.costFor(unit),
      occupantAt: (x, y) => {
        const other = this.unitAt(x, y);
        if (!other || other === unit) return null;
        // a structure stops everyone, whoever owns it, unless the mover can climb over it
        if (other.kind === 'structure') return this.crosses(unit, other) ? unit.side : 'neutral';
        return other.side;
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
    return ring(from, weapon.range[0], weapon.range[1] + rangeBonus(unit, weapon, from), this.map.width, this.map.height)
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
        for (const p of ring(stop, weapon.range[0], weapon.range[1] + rangeBonus(unit, weapon, stop), this.map.width, this.map.height)) {
          seen.set(tileKey(p.x, p.y), p);
        }
      }
    }
    return [...seen.values()];
  }

  /** One side of an exchange: the unit's weapon, its ground, and what its skills, auras and statuses add. */
  private combatant(unit: UnitInstance, at: Point, other: UnitInstance, role: 'attacker' | 'defender', distance: number, slot?: number): Combatant {
    const stack = unit.inventory[slot ?? unit.equipped];
    const weapon = stack && stack.uses > 0 ? (this.tables.weapons.get(stack.id) ?? null) : null;
    const context: CombatContext = {
      battle: this,
      self: unit,
      other,
      role,
      at,
      distance,
      weapon,
      stationary: unit.travelled === 0 && at.x === unit.x && at.y === unit.y,
      otherIsStructure: other.kind === 'structure',
    };
    return {
      unit,
      weapon,
      usesLeft: stack?.uses ?? 0,
      terrain: this.terrainAt(at.x, at.y),
      bonus: skillBonus(context),
      ...(unit.kind === 'structure' ? { structure: true } : {}),
      ...(unit.kind === 'structure' && this.tables.structures.get(unit.defId)?.fireWeak ? { fireWeak: true } : {}),
    };
  }

  /**
   * Predict an attack: damage, hit and crit chances, doubling and the expected HP afterwards.
   * `from` is where the attacker stands (default: where it is); `slot` evaluates a weapon other
   * than the equipped one without equipping it. Null if the attacker cannot attack from there.
   */
  forecastFor(attacker: UnitInstance, defender: UnitInstance, options: { from?: Point; slot?: number } = {}): Forecast | null {
    const from = options.from ?? attacker;
    const distance = manhattan(from, defender);
    const a = this.combatant(attacker, from, defender, 'attacker', distance, options.slot);
    const d = this.combatant(defender, defender, attacker, 'defender', distance);
    const fc = forecast(a, d, distance, this.tables.balance);
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
    unit.travelled += reach.nodes.get(tileKey(dest.x, dest.y))?.cost ?? 0;
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
    return equipWeapon(unit, slot, this.tables);
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
    // the weapons are read now: one that breaks mid-fight leaves the inventory
    const used = { a: this.weaponOf(attacker), d: this.weaponOf(defender) };
    const kinds = { a: used.a?.kind, d: used.d?.kind };
    const events = resolveStrikes(fc, attacker.hp, defender.hp, this.rng, this.rules.hitMode, this.tables.balance);

    attacker.hp = this.hpAfter(events, 'a', hpBefore.attacker);
    defender.hp = this.hpAfter(events, 'd', hpBefore.defender);

    // fire burns where it lands, and may strike the one beside; this reads the weapons before they wear
    const defeated: UnitInstance[] = [];
    const { ignited, splash } = this.fireEffects(attacker, defender, events, used);
    for (const s of splash) if (s.target.hp <= 0 && !s.target.retreated) defeated.push(s.target);

    const brokenWeapons = [
      ...this.wearWeapon(attacker, events.filter((e) => e.by === 'a').length),
      ...this.wearWeapon(defender, events.filter((e) => e.by === 'd').length),
    ];

    for (const unit of [defender, attacker]) {
      if (unit.hp <= 0) defeated.push(unit);
    }
    for (const unit of defeated) this.defeat(unit);

    const expAwards: ExpAward[] = [];
    const wexpGains: Array<WexpGain & { unit: UnitInstance }> = [];
    const sides = [
      { unit: attacker, opponent: defender, key: 'a' as const },
      { unit: defender, opponent: attacker, key: 'd' as const },
    ];
    for (const { unit, opponent, key } of sides) {
      if (unit.side !== 'player' || unit.retreated || unit.kind !== 'unit') continue;
      const mine = events.filter((e) => e.by === key);
      const outcome = { dealtDamage: mine.some((e) => e.hit && e.damage > 0), killed: mine.some((e) => e.killed) };
      // there is no glory in a gate: structures give no EXP, though the weapon still learns
      if (opponent.kind !== 'structure') {
        const amount = expForFight(unit, opponent, outcome, this.tables.balance);
        expAwards.push({ unit, amount, ...awardExp(unit, amount, this.classOf(unit), this.tables.balance, this.rng, this.rules.guaranteedProgress) });
      }
      const kind = kinds[key];
      if (mine.length > 0 && kind) wexpGains.push({ unit, ...grantWexp(unit, kind, outcome.killed ? 2 : 1) });
    }

    this.noteFought(attacker, defender);
    this.applyFightEffects(attacker, defender, events);
    this.finishAction(attacker);
    return { attacker, defender, forecast: fc, events, hpBefore, expAwards, wexpGains, brokenWeapons, defeated, ignited, splash };
  }

  /**
   * Fire (DESIGN §4.6). A fire strike that hits leaves flames on the target's tile when the
   * weapon is incendiary or its wielder has Ignite (Wildfire carries Ignite on); Wildfire lights
   * one flammable tile beside it too. Fire Storm strikes the neighbour of the target who would
   * take most, for half the damage. Splash gives no EXP.
   */
  private fireEffects(
    attacker: UnitInstance,
    defender: UnitInstance,
    events: readonly StrikeEvent[],
    used: { readonly a: WeaponDef | null; readonly d: WeaponDef | null },
  ): { ignited: Point[]; splash: Array<{ target: UnitInstance; damage: number }> } {
    const ignited: Point[] = [];
    const splash: Array<{ target: UnitInstance; damage: number }> = [];
    for (const [unit, foe, key] of [[attacker, defender, 'a'], [defender, attacker, 'd']] as const) {
      const weapon = used[key];
      if (!weapon || weapon.kind !== 'fire' || !events.some((e) => e.by === key && e.hit)) continue;
      if (weapon.ignite || unit.skills.includes('ignite') || unit.skills.includes('wildfire')) {
        if (this.ignite(foe.x, foe.y)) ignited.push({ x: foe.x, y: foe.y });
        if (unit.skills.includes('wildfire')) {
          const next = DIRS4.map((d) => ({ x: foe.x + d.x, y: foe.y + d.y })).find((p) => this.map.inBounds(p.x, p.y) && this.terrainAt(p.x, p.y).flammable && !this.flameAt(p.x, p.y));
          if (next && this.ignite(next.x, next.y)) ignited.push(next);
        }
      }
      if (unit.skills.includes('fire-storm')) {
        let best: { target: UnitInstance; damage: number } | null = null;
        for (const d of DIRS4) {
          const other = this.unitAt(foe.x + d.x, foe.y + d.y);
          if (!other || other === foe || !areHostile(unit.side, other.side)) continue;
          const a = this.combatant(unit, unit, other, 'attacker', manhattan(unit, other));
          const b = this.combatant(other, other, unit, 'defender', manhattan(unit, other));
          const damage = Math.floor(Math.max(0, power(a, b, 0) - defence(weapon, b, a.bonus?.pierce ?? 0)) / 2);
          if (damage > 0 && (!best || damage > best.damage)) best = { target: other, damage };
        }
        if (best) {
          best.target.hp = Math.max(0, best.target.hp - best.damage);
          splash.push(best);
        }
      }
    }
    return { ignited, splash };
  }

  /** Two player units that fight this phase, each where it stood, may earn support points if they were near each other. */
  private noteFought(attacker: UnitInstance, defender: UnitInstance): void {
    if (this.phase !== 'player') return;
    for (const u of [attacker, defender]) if (u.side === 'player' && u.kind === 'unit') this.fought.set(u.defId, { x: u.x, y: u.y });
  }

  /** One unit healed, mended or sent on another: it counts toward their support this phase. */
  noteAid(actor: UnitInstance, target: UnitInstance): void {
    if (actor.side === 'player' && target.side === 'player') this.aided.add(pairKey(actor.defId, target.defId));
  }

  /** What skills do once a fight is over: statuses on those hit, ransom, and movement owed after an attack. */
  private applyFightEffects(attacker: UnitInstance, defender: UnitInstance, events: readonly StrikeEvent[]): void {
    for (const [unit, foe, key] of [[attacker, defender, 'a'], [defender, attacker, 'd']] as const) {
      const mine = events.filter((e) => e.by === key);
      const hits = mine.filter((e) => e.hit).length;
      const killed = mine.some((e) => e.killed);
      if (hits > 0 && !foe.retreated) {
        if (unit.skills.includes('sunder')) for (let i = 0; i < hits; i++) this.addStatus(foe, 'sunder', 1);
        if (unit.skills.includes('harry')) this.addStatus(foe, 'harry', 0);
      }
      if (killed && !foe.boss && unit.skills.includes('clemency')) this.ransom += 30;
      if (key === 'a' && !unit.retreated) {
        const pursues = killed && unit.skills.includes('pursuit') && !unit.turnFlags.includes('pursuit');
        const owed = Math.max(unit.skills.includes('wheel') ? 2 : 0, unit.skills.includes('skirmish') ? 3 : 0, pursues ? 2 : 0);
        if (owed > 0) unit.bonusMove = owed;
        if (pursues) unit.turnFlags.push('pursuit');
      }
    }
  }

  /** Where a unit that owes a move after attacking (Wheel, Skirmish, Pursuit) may go; null if it owes none. */
  bonusReach(unit: UnitInstance): ReachResult | null {
    return unit.bonusMove > 0 && !unit.retreated ? this.reachFor(unit, unit.bonusMove) : null;
  }

  /** Make the move owed after an attack; the unit has used it up either way. */
  bonusMoveTo(unit: UnitInstance, dest: Point): Point[] | null {
    const reach = this.bonusReach(unit);
    unit.bonusMove = 0;
    if (!reach) return null;
    const path = this.moveUnit(unit, dest, reach);
    if (path) this.settle(unit);
    return path;
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
        u.kind === 'unit' &&
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
    // Triage heals more when the target is badly hurt
    const triage = healer.skills.includes('triage') && target.hp * 2 < maxHp(target) ? 3 : 0;
    const restored = Math.min(weapon.might + triage, maxHp(target) - target.hp);
    target.hp += restored;
    // Cure clears the ailments a remedy cannot reach by itself
    const ailments: readonly StatusId[] = ['thirst', 'heat', 'burn'];
    const cured = healer.skills.includes('cure') ? target.statuses.filter((s) => ailments.includes(s.id)).map((s) => s.id) : [];
    if (cured.length > 0) target.statuses = target.statuses.filter((s) => !cured.includes(s.id));
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
    this.noteAid(healer, target);
    this.finishAction(healer);
    return { healer, target, restored, cured, expAward };
  }

  // ------------------------------------------------------------------ items

  /** Whether using the item in `slot` would do anything for the unit right now. */
  canUseItem(unit: UnitInstance, slot: number): boolean {
    return canUseItem(unit, slot, this.tables);
  }

  /** Use an item: it takes effect, loses a use, and spends the unit's action. */
  useItem(unit: UnitInstance, slot: number): ItemUseReport {
    const report = applyItem(unit, slot, this.tables);
    this.finishAction(unit);
    return report;
  }

  /** Whether the unit may be promoted by an item or a rank event at all. */
  canPromote(unit: UnitInstance): boolean {
    return checkPromotion(unit, this.tables.classes, this.tables.balance).ok;
  }

  /** Swap items between two adjacent friends; free, and it does not end either unit's action. */
  trade(a: UnitInstance, slotA: number, b: UnitInstance, slotB: number): boolean {
    if (a === b || manhattan(a, b) !== 1 || !areFriendly(a.side, b.side)) return false;
    return swapItems(a, slotA, b, slotB, this.tables);
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
        other.kind === 'unit' &&
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

  // ------------------------------------------------------------------ gates and class actions

  /** Open a closed gate at a tile (by key or by event): it is removed, and the way is clear. */
  openGateAt(x: number, y: number): boolean {
    const gate = this.units.find((u) => !u.retreated && u.kind === 'structure' && u.tags.includes('gate') && u.x === x && u.y === y);
    if (!gate) return false;
    this.defeat(gate);
    this.afterChange();
    return true;
  }

  /** The class actions (Sap, Entrench, Mend, Counsel, Dispatch, Decree) and Open the unit could take from `from`, with their targets. */
  classActions(unit: UnitInstance, from: Point = unit): ClassActionOption[] {
    return availableActions(this, unit, from);
  }

  /** Carry out a class action aimed at a tile (not needed for Decree). The unit's action is spent. */
  doClassAction(unit: UnitInstance, id: ClassActionId, at?: Point): ClassActionReport {
    return performAction(this, unit, id, at);
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
      const fight = this.fight(unit, action.target);
      unit.bonusMove = 0; // the computer does not use the move owed after an attack
      return { unit, path, fight, heal: null, escaped: false };
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
      if (this.terrainAt(p.x, p.y).cost[unit.moveType] !== null && !this.unitAt(p.x, p.y) && !this.flameAt(p.x, p.y)) return p;
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

  /** The first unused `def#n` id. */
  private freshId(def: string): string {
    const taken = new Set(this.units.map((u) => u.id));
    let n = 1;
    while (taken.has(`${def}#${n}`)) n += 1;
    return `${def}#${n}`;
  }

  /**
   * Put a structure on the map. It stands exactly where it is put, even on ground nobody could
   * walk on (a wall), unless something is already there, when it takes the nearest free tile.
   */
  placeStructure(defId: string, at: Point, side: Side, tags: readonly string[] = [], ai?: AiProfile, faction?: string): UnitInstance {
    const def = this.tables.structures.get(defId);
    if (!def) throw new Error(`Unknown structure "${defId}"`);
    const unit = createStructure(def, this.freshId(defId), at.x, at.y, side, this.tables, tags, faction);
    // only the computer plays a structure that fires
    if (unit.ai) unit.ai = side === 'player' ? null : (ai ?? unit.ai);
    const tile = this.unitAt(at.x, at.y) ? this.freeTileNear(at, unit) : at;
    if (!tile) throw new Error(`No free tile for "${defId}" near (${at.x}, ${at.y})`);
    unit.x = tile.x;
    unit.y = tile.y;
    this.units.push(unit);
    return unit;
  }

  /** Bring a unit or a structure onto the map; if its tile is taken it appears on the nearest free one. */
  spawn(spec: SpawnSpec): UnitInstance {
    const def = this.tables.units[spec.def];
    if (!def && this.tables.structures.has(spec.def)) {
      const built = this.placeStructure(spec.def, { x: spec.at[0], y: spec.at[1] }, spec.side ?? 'enemy', spec.tags ?? [], spec.ai, spec.faction);
      this.arrivals.push(built);
      return built;
    }
    if (!def) throw new Error(`Cannot spawn unknown unit "${spec.def}"`);
    const overrides = { ...(spec.ai ? { ai: spec.ai } : {}), ...(spec.tags ? { tags: spec.tags } : {}) };
    const unit = createUnit(def, this.freshId(spec.def), spec.at[0], spec.at[1], this.tables, overrides);
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
      case 'promote':
        for (const u of this.units) {
          if (u.retreated || !matchesKey(u, action.unit)) continue;
          if (this.canPromote(u)) {
            const result = promote(u, this.tables.classes);
            this.messages.push({ kind: 'message', text: `${u.name} is promoted: ${result.from.name} to ${result.to.name}.` });
          } else if (this.tables.items.has('charter-of-iqta') && u.inventory.length < INVENTORY_SLOTS && this.classOf(u).promotesTo) {
            u.inventory.push({ id: 'charter-of-iqta', uses: 1 });
          }
        }
        break;
      case 'flag':
        this.flags.add(action.name);
        break;
      case 'giveItem': {
        const given = this.tables.weapons.get(action.item) ?? this.tables.items.get(action.item);
        const unit = this.units.find((u) => !u.retreated && matchesKey(u, action.unit));
        if (given && unit && unit.inventory.length < INVENTORY_SLOTS) {
          unit.inventory.push({ id: given.id, uses: given.uses });
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
        if (!this.openGateAt(action.at[0], action.at[1])) this.unhandled.push(action);
        break;
      case 'ignite':
        if (!this.ignite(action.tile[0], action.tile[1])) this.unhandled.push(action);
        break;
      case 'unlockCodex':
        if (!this.codexUnlocks.includes(action.id)) this.codexUnlocks.push(action.id);
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

  /** The living units of a side that can take an action: soldiers, and structures that fire. */
  actors(side: Side): UnitInstance[] {
    return this.livingUnits(side).filter((u) => u.kind === 'unit' || u.ai !== null);
  }

  /** True when no unit of the side can still act. */
  isSideSpent(side: Side): boolean {
    return this.actors(side).every((u) => u.acted);
  }

  /** Begin the battle: the first phase starts, with its reinforcements, terrain effects and events. A second call does nothing. */
  begin(): PhaseReport {
    if (this.begun) return { turn: this.turn, phase: this.phase, healed: [], burned: [], arrived: [], supportGains: [] };
    this.begun = true;
    this.supports?.startChapter();
    return this.startPhase();
  }

  /**
   * Close the current phase and start the next one. A side with no units is skipped, the turn
   * advances after the last phase, and the objective is checked at the end of the phase and of
   * the turn. If the chapter is decided, the phase does not advance.
   */
  endPhase(): PhaseReport {
    const burned = this.burnUnits(this.phase);
    const supportGains = this.phase === 'player' ? this.tickSupports() : [];
    this.expireStatuses();
    this.check('phaseEnd');
    if (!this.outcome) this.advancePhase();
    burned.push(...this.skippedBurns.splice(0));
    if (this.outcome) return { turn: this.turn, phase: this.phase, healed: [], burned, arrived: [], supportGains };
    return { ...this.startPhase(), burned, supportGains };
  }

  /** At the end of a Player Phase: the points every supported pair on the field has earned (DESIGN §7.1). */
  private tickSupports(): SupportGain[] {
    const gains = this.supports
      ? this.supports.tickPhase({
          units: this.livingUnits('player').filter((u) => u.kind === 'unit'),
          fought: this.fought,
          aided: this.aided,
        })
      : [];
    this.fought.clear();
    this.aided.clear();
    return gains;
  }

  /** Remove the statuses whose time has run out with this phase. */
  private expireStatuses(): void {
    for (const unit of this.units) {
      if (unit.statuses.length > 0) unit.statuses = unit.statuses.filter((s) => !hasExpired(s, this.turn, this.phase, this.phaseOrder));
    }
  }

  /** Put a status on a unit for the rest of this phase and `phases` more after it. */
  addStatus(unit: UnitInstance, id: StatusId, phasesAfterThis = 0): void {
    let turn = this.turn;
    let index = this.phaseIndex;
    for (let i = 0; i < phasesAfterThis; i++) {
      index += 1;
      if (index >= this.phaseOrder.length) {
        index = 0;
        turn += 1;
      }
    }
    applyStatus(unit.statuses, id, { turn, phase: this.phaseOrder[index] ?? this.phase });
  }

  /** Put a status on a unit that lasts to the end of the next time `through` is played: this turn if it is still to come, otherwise next turn. */
  addStatusThrough(unit: UnitInstance, id: StatusId, through: Phase): void {
    const at = this.phaseOrder.indexOf(through);
    applyStatus(unit.statuses, id, { turn: at > this.phaseIndex ? this.turn : this.turn + 1, phase: through });
  }

  private advancePhase(): void {
    const order = this.phaseOrder;
    let i = this.phaseIndex;
    for (let guard = 0; guard < order.length * 2 + 2; guard++) {
      i += 1;
      if (i >= order.length) {
        this.check('turnEnd');
        if (this.outcome) return;
        this.burnDown();
        this.turn += 1;
        i = 0;
      }
      const phase = order[i] as Phase;
      if (phase === 'player' || this.actors(phase).length > 0 || this.reinforcementsDue(phase)) {
        this.phaseIndex = i;
        this.phase = phase;
        return;
      }
      // a side with nothing that can act has no phase to play, but the phase still ends: its flames still burn
      this.skippedBurns.push(...this.burnUnits(phase));
    }
  }

  private startPhase(): PhaseReport {
    const { turn, phase } = this;
    for (const unit of this.livingUnits(phase)) {
      unit.moved = false;
      unit.acted = false;
      unit.travelled = 0;
      unit.bonusMove = 0;
      unit.turnFlags = [];
    }
    const before = this.arrivals.length;
    this.spreadFlames();
    for (const r of this.map.rules.reinforcements) {
      if (r.turn === turn && r.phase === phase) for (const spec of r.units) this.spawn(spec);
    }
    const healed: Array<{ unit: UnitInstance; amount: number }> = [];
    for (const unit of this.livingUnits(phase)) {
      if (unit.kind !== 'unit') continue;
      const share = this.terrainAt(unit.x, unit.y).heals;
      if (!share) continue;
      const amount = Math.min(Math.ceil(maxHp(unit) * share), maxHp(unit) - unit.hp);
      if (amount > 0) {
        unit.hp += amount;
        healed.push({ unit, amount });
      }
    }
    // Warcry rallies nearby allies for the phase; Renewal binds the wounds of those beside it
    for (const unit of this.livingUnits(phase)) {
      if (unit.skills.includes('warcry')) {
        for (const ally of this.livingUnits(phase)) if (ally !== unit && ally.kind === 'unit' && manhattan(unit, ally) <= 2) this.addStatus(ally, 'warcry', 0);
      }
      if (unit.skills.includes('renewal')) {
        for (const ally of this.livingUnits(phase)) {
          if (ally === unit || ally.kind !== 'unit' || manhattan(unit, ally) !== 1) continue;
          const amount = Math.min(5, maxHp(ally) - ally.hp);
          if (amount > 0) {
            ally.hp += amount;
            healed.push({ unit: ally, amount });
          }
        }
      }
    }
    this.fire({ type: 'turnStart', turn, phase });
    const arrived = this.arrivals.splice(before);
    this.afterChange();
    return { turn, phase, healed, burned: [], arrived, supportGains: [] };
  }

  // ------------------------------------------------------------------ suspend and resume

  /** The battle's changing state as plain data; `ref` numbers each unit. */
  snapshot(ref: (unit: UnitInstance) => number): BattleSnapshot {
    return {
      rng: this.rng.state(),
      turn: this.turn,
      phase: this.phase,
      phaseIndex: this.phaseIndex,
      begun: this.begun,
      units: this.units.map(ref),
      fired: [...this.events.fired],
      flags: [...this.flags],
      progress: {
        seized: this.progress.seized,
        leaked: [...this.progress.leaked],
        recruited: [...this.progress.recruited],
        escaped: [...this.progress.escaped],
      },
      outcome: this.outcome ? { ...this.outcome } : null,
      ransom: this.ransom,
      messages: this.messages.map((m) => ({ ...m })),
      arrivals: this.arrivals.map(ref),
      unhandled: structuredClone(this.unhandled),
      codex: [...this.codexUnlocks],
      explored: [...this.explored],
      visible: [...this.visible],
      terrain: [...this.overrides].map(([key, def]) => [key, def.id] as const),
      terrainVersion: this.terrainVersion,
      flames: [...this.flames],
      counts: [...this.counts],
      supports: this.supports !== null,
      fought: [...this.fought].map(([id, p]) => [id, { x: p.x, y: p.y }] as const),
      aided: [...this.aided],
      skippedBurns: this.skippedBurns.map(({ unit, damage }) => ({ unit: ref(unit), damage })),
    };
  }

  /**
   * Put a battle built from the same map, tables and rules back into a saved state. `unit` turns a
   * unit's number back into the unit; `supports` is the army's tracker, given back if the battle
   * had it. Nothing is re-run: no phase starts and no event fires, so the next random draw is the
   * one the suspended battle would have made.
   */
  restore(snap: BattleSnapshot, unit: (ref: number) => UnitInstance, supports: SupportTracker | null): void {
    if (!this.phaseOrder.includes(snap.phase)) throw new Error(`Saved phase "${snap.phase}" is not played on map "${this.map.id}"`);
    this.rng.restore(snap.rng);
    this.turn = snap.turn;
    this.phase = snap.phase;
    this.phaseIndex = snap.phaseIndex;
    this.begun = snap.begun;
    this.units.splice(0, this.units.length, ...snap.units.map(unit));
    const refill = <T>(set: Set<T>, values: readonly T[]): void => {
      set.clear();
      for (const v of values) set.add(v);
    };
    refill(this.events.fired, snap.fired);
    refill(this.flags, snap.flags);
    this.progress.seized = snap.progress.seized;
    refill(this.progress.leaked, snap.progress.leaked);
    refill(this.progress.recruited, snap.progress.recruited);
    refill(this.progress.escaped, snap.progress.escaped);
    this.outcome = snap.outcome ? { ...snap.outcome } : null;
    this.ransom = snap.ransom;
    this.messages.splice(0, this.messages.length, ...snap.messages.map((m) => ({ ...m })));
    this.arrivals.splice(0, this.arrivals.length, ...snap.arrivals.map(unit));
    this.unhandled.splice(0, this.unhandled.length, ...structuredClone(snap.unhandled));
    this.codexUnlocks.splice(0, this.codexUnlocks.length, ...snap.codex);
    this.explored = new Set(snap.explored);
    this.visible = new Set(snap.visible);
    this.overrides.clear();
    for (const [key, id] of snap.terrain) {
      const def = this.tables.terrain.get(id);
      if (!def) throw new Error(`Saved terrain "${id}" is unknown`);
      this.overrides.set(key, def);
    }
    this.terrainVersion = snap.terrainVersion;
    this.flames.clear();
    for (const [key, turns] of snap.flames) this.flames.set(key, turns);
    this.counts.clear();
    for (const [key, n] of snap.counts) this.counts.set(key, n);
    this.supports = snap.supports ? supports : null;
    this.fought.clear();
    for (const [id, p] of snap.fought) this.fought.set(id, { x: p.x, y: p.y });
    refill(this.aided, snap.aided);
    this.skippedBurns.splice(0, this.skippedBurns.length, ...snap.skippedBurns.map((b) => ({ unit: unit(b.unit), damage: b.damage })));
  }
}

