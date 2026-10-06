import { manhattan, ring, tileKey } from './grid';
import type { GameMap } from './map';
import { computeReach, pathTo, type ReachResult } from './pathfinding';
import { areHostile, type MoveType, type Point, type Side } from './types';

export interface WeaponInfo {
  readonly name: string;
  readonly might: number;
  readonly rangeMin: number;
  readonly rangeMax: number;
}

/** A unit on the battlefield. Static traits are readonly; the rest is battle state. */
export interface UnitInstance {
  readonly id: string;
  readonly name: string;
  readonly side: Side;
  readonly className: string;
  readonly level: number;
  readonly moveType: MoveType;
  readonly mov: number;
  readonly mgt: number;
  readonly grd: number;
  readonly maxHp: number;
  /** Null for units that cannot attack. */
  readonly weapon: WeaponInfo | null;
  readonly spriteId: string;
  readonly faction: string;
  readonly skin: string;
  hp: number;
  x: number;
  y: number;
  moved: boolean;
  acted: boolean;
  /** Set when a unit "retreats wounded"; such units leave the map. */
  retreated: boolean;
}

export type Phase = 'player' | 'enemy';

export interface AttackReport {
  readonly damage: number;
  /** Null when the defender could not or did not counter. */
  readonly counterDamage: number | null;
  readonly defeated: readonly UnitInstance[];
}

/**
 * The battle rules available at milestone M1: occupancy, movement, attack ranges, a basic attack
 * and the phase flags. Full combat (hit, crit, doubling, the triangle, EXP) arrives in M2 and
 * replaces `attack` without changing its callers.
 */
export class BattleState {
  readonly map: GameMap;
  readonly units: UnitInstance[];
  turn = 1;
  phase: Phase = 'player';

  constructor(map: GameMap, units: UnitInstance[]) {
    this.map = map;
    this.units = units;
  }

  /** The unit standing on a tile, if any. */
  unitAt(x: number, y: number): UnitInstance | undefined {
    return this.units.find((u) => !u.retreated && u.x === x && u.y === y);
  }

  livingUnits(side?: Side): UnitInstance[] {
    return this.units.filter((u) => !u.retreated && (side === undefined || u.side === side));
  }

  /** Where a unit can move this turn, given everyone else on the board. */
  reachFor(unit: UnitInstance): ReachResult {
    return computeReach({
      map: this.map,
      start: { x: unit.x, y: unit.y },
      moveType: unit.moveType,
      mov: unit.mov,
      side: unit.side,
      occupantAt: (x, y) => {
        const other = this.unitAt(x, y);
        return other && other !== unit ? other.side : null;
      },
    });
  }

  /** Hostile units within the unit's weapon range if it stood at `from`. */
  targetsFrom(unit: UnitInstance, from: Point): UnitInstance[] {
    const weapon = unit.weapon;
    if (!weapon) return [];
    return ring(from, weapon.rangeMin, weapon.rangeMax, this.map.width, this.map.height)
      .map((p) => this.unitAt(p.x, p.y))
      .filter((u): u is UnitInstance => u !== undefined && areHostile(unit.side, u.side));
  }

  /** Every tile the unit could attack after moving anywhere within its reach (for display). */
  threatTiles(unit: UnitInstance, reach: ReachResult): Point[] {
    const weapon = unit.weapon;
    if (!weapon) return [];
    const seen = new Map<number, Point>();
    for (const stop of reach.stops) {
      for (const p of ring(stop, weapon.rangeMin, weapon.rangeMax, this.map.width, this.map.height)) {
        seen.set(tileKey(p.x, p.y), p);
      }
    }
    return [...seen.values()];
  }

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

  /** M1 placeholder combat: fixed damage, one counterattack if the defender can reach. */
  attack(attacker: UnitInstance, defender: UnitInstance): AttackReport {
    const hit = this.strike(attacker, defender);
    const defeated: UnitInstance[] = [];
    let counterDamage: number | null = null;
    if (defender.hp <= 0) {
      this.retreat(defender);
      defeated.push(defender);
    } else if (this.canReach(defender, attacker)) {
      counterDamage = this.strike(defender, attacker);
      if (attacker.hp <= 0) {
        this.retreat(attacker);
        defeated.push(attacker);
      }
    }
    attacker.acted = true;
    attacker.moved = true;
    return { damage: hit, counterDamage, defeated };
  }

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

  private canReach(from: UnitInstance, to: UnitInstance): boolean {
    const weapon = from.weapon;
    if (!weapon) return false;
    const distance = manhattan(from, to);
    return distance >= weapon.rangeMin && distance <= weapon.rangeMax;
  }

  private strike(from: UnitInstance, to: UnitInstance): number {
    const weapon = from.weapon;
    if (!weapon) return 0;
    const cover = this.map.terrainAt(to.x, to.y).cover;
    const damage = Math.max(0, from.mgt + weapon.might - to.grd - cover);
    to.hp = Math.max(0, to.hp - damage);
    return damage;
  }

  private retreat(unit: UnitInstance): void {
    unit.retreated = true;
  }
}
