import type { Balance } from './balance';
import type { ClassDef, ClassTable } from './classes';
import { forecast, NO_BONUS, resolveStrikes, type Combatant, type Forecast, type HitMode, type StrikeEvent } from './combat';
import { awardExp, expForFight, expForHeal, grantWexp, type ExpResult, type WexpGain } from './exp';
import { manhattan, ring, tileKey } from './grid';
import type { GameMap } from './map';
import { computeReach, pathTo, type ReachResult } from './pathfinding';
import type { Rng } from './rng';
import { areFriendly, areHostile, type Point, type Side } from './types';
import { autoEquip, canEquip, equippedWeapon, maxHp, weaponStacks, type UnitInstance } from './unit';
import { canReach, isOffensive, type WeaponDef, type WeaponTable } from './weapons';

export type Phase = 'player' | 'enemy';

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

/**
 * The battle rules: occupancy, movement, attack ranges, forecasts, fights with EXP and
 * durability, healing and the phase flags. Every random draw comes from the battle's seeded Rng.
 */
export class BattleState {
  readonly map: GameMap;
  readonly units: UnitInstance[];
  readonly tables: BattleTables;
  readonly rng: Rng;
  readonly rules: BattleRules;
  turn = 1;
  phase: Phase = 'player';

  constructor(map: GameMap, units: UnitInstance[], tables: BattleTables, rng: Rng, rules: BattleRules = DEFAULT_RULES) {
    this.map = map;
    this.units = units;
    this.tables = tables;
    this.rng = rng;
    this.rules = rules;
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

  // ------------------------------------------------------------------ actions

  /** Move a unit along its cheapest path to `dest`. Returns the path, or null if unreachable. */
  moveUnit(unit: UnitInstance, dest: Point, reach: ReachResult): Point[] | null {
    if (!reach.stops.some((p) => p.x === dest.x && p.y === dest.y)) return null;
    const path = pathTo(reach, dest);
    if (!path) return null;
    unit.x = dest.x;
    unit.y = dest.y;
    unit.moved = true;
    return path;
  }

  /** Mark a unit as finished for the phase. */
  wait(unit: UnitInstance): void {
    unit.moved = true;
    unit.acted = true;
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

    attacker.acted = true;
    attacker.moved = true;
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
    healer.acted = true;
    healer.moved = true;
    return { healer, target, restored, expAward };
  }

  // ------------------------------------------------------------------ phases

  /** True when no unit of the side can still act. */
  isSideSpent(side: Side): boolean {
    return this.livingUnits(side).every((u) => u.acted);
  }

  /** Close the player phase. Enemy behaviour arrives in M3, so the enemy phase is a no-op here. */
  endPlayerPhase(): void {
    this.phase = 'enemy';
  }

  /** Close the enemy phase, advance the turn and ready every unit. */
  endEnemyPhase(): void {
    this.phase = 'player';
    this.turn += 1;
    for (const unit of this.units) {
      unit.moved = false;
      unit.acted = false;
    }
  }
}
