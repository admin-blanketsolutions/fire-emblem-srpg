import type { BattleState, ExpAward } from './battle';
import { awardExp } from './exp';
import { DIRS4, manhattan } from './grid';
import { consumeStack } from './inventory';
import { areFriendly, areHostile, type Point } from './types';
import type { UnitInstance } from './unit';

/**
 * The actions a class can take instead of attacking (DESIGN §4.3, §6.5): Sap, Entrench, Mend,
 * Counsel, Dispatch and Decree, and Open for any unit carrying a gate key. Each one spends the
 * unit's action. A player unit earns a little EXP for it, as a healer does for a remedy.
 */

export type ClassActionId = 'sap' | 'entrench' | 'mend' | 'counsel' | 'dispatch' | 'decree' | 'open';

export const ACTION_NAMES: Readonly<Record<ClassActionId, string>> = {
  sap: 'Sap',
  entrench: 'Entrench',
  mend: 'Mend',
  counsel: 'Counsel',
  dispatch: 'Dispatch',
  decree: 'Decree',
  open: 'Open',
};

/** Damage Sap does to a gate or wall, before anything else is considered. */
export const SAP_DAMAGE = 8;
/** Barricades one unit may raise in a chapter. */
export const ENTRENCH_LIMIT = 3;
/** Uses Mend restores to an ally's weapon. */
export const MEND_USES = 10;
export const COUNSEL_RANGE = 3;
export const DISPATCH_RANGE = 2;
/** EXP for a class action, before the tier rate. */
export const ACTION_EXP = 8;

export interface ClassActionOption {
  readonly id: ClassActionId;
  readonly name: string;
  /** Tiles the action can be aimed at; empty for an action that needs no target (Decree). */
  readonly targets: readonly Point[];
}

export interface ClassActionReport {
  readonly id: ClassActionId;
  readonly actor: UnitInstance;
  /** The unit or structure acted on, if any. */
  readonly target: UnitInstance | null;
  /** The tile acted on, if any. */
  readonly tile: Point | null;
  /** What it did, as a number: damage dealt, uses restored, barricades raised, allies affected. */
  readonly amount: number;
  /** A structure fell, or a gate opened. */
  readonly destroyed: boolean;
  readonly expAward: ExpAward | null;
}

const tileOf = (u: Point): Point => ({ x: u.x, y: u.y });
const isAlly = (a: UnitInstance, b: UnitInstance): boolean => b !== a && b.kind === 'unit' && areFriendly(a.side, b.side);

/** Hostile gates and walls beside the tile. */
export function sapTargets(battle: BattleState, unit: UnitInstance, from: Point = unit): UnitInstance[] {
  if (!unit.skills.includes('sap')) return [];
  return battle
    .livingUnits()
    .filter((u) => u.kind === 'structure' && areHostile(unit.side, u.side) && manhattan(from, u) === 1 && (u.tags.includes('gate') || u.tags.includes('wall')));
}

/** Empty tiles beside `from` a barricade could stand on. */
export function entrenchTiles(battle: BattleState, unit: UnitInstance, from: Point = unit): Point[] {
  if (!unit.skills.includes('entrench') || battle.countOf(`entrench:${unit.id}`) >= ENTRENCH_LIMIT || !battle.tables.structures.has('barricade')) return [];
  return DIRS4.map((d) => ({ x: from.x + d.x, y: from.y + d.y })).filter((p) => {
    if (!battle.map.inBounds(p.x, p.y) || battle.unitAt(p.x, p.y) || battle.flameAt(p.x, p.y)) return false;
    return Object.values(battle.terrainAt(p.x, p.y).cost).some((c) => c !== null);
  });
}

/** Adjacent allies whose equipped weapon is worn. */
export function mendTargets(battle: BattleState, unit: UnitInstance, from: Point = unit): UnitInstance[] {
  if (!unit.skills.includes('mend')) return [];
  return battle.livingUnits().filter((u) => {
    if (!isAlly(unit, u) || manhattan(from, u) !== 1 || u.turnFlags.includes('mended')) return false;
    const weapon = battle.weaponOf(u);
    const stack = u.inventory[u.equipped];
    return weapon !== null && stack !== undefined && stack.uses < weapon.uses;
  });
}

/** Allies within three tiles who are not already counselled. */
export function counselTargets(battle: BattleState, unit: UnitInstance, from: Point = unit): UnitInstance[] {
  if (!unit.skills.includes('counsel')) return [];
  return battle.livingUnits().filter((u) => isAlly(unit, u) && manhattan(from, u) <= COUNSEL_RANGE && !u.statuses.some((s) => s.id === 'counsel'));
}

/** Allies within two tiles who have acted, are not Lords, and have not been dispatched this turn. */
export function dispatchTargets(battle: BattleState, unit: UnitInstance, from: Point = unit): UnitInstance[] {
  if (!unit.skills.includes('dispatch')) return [];
  return battle
    .livingUnits()
    .filter((u) => isAlly(unit, u) && manhattan(from, u) <= DISPATCH_RANGE && u.acted && !u.tags.includes('lord') && !u.turnFlags.includes('dispatched'));
}

export const canDecree = (battle: BattleState, unit: UnitInstance): boolean => unit.skills.includes('decree') && battle.countOf(`decree:${unit.id}`) === 0;

/** The slot of a key the unit carries, or -1. */
const keySlot = (battle: BattleState, unit: UnitInstance): number => unit.inventory.findIndex((s) => battle.tables.items.get(s.id)?.kind === 'key' && s.uses > 0);

/** Closed gates beside the tile, if the unit has a key to open them with. */
export function openTargets(battle: BattleState, unit: UnitInstance, from: Point = unit): UnitInstance[] {
  if (keySlot(battle, unit) < 0) return [];
  return battle.livingUnits().filter((u) => u.kind === 'structure' && u.tags.includes('gate') && manhattan(from, u) === 1);
}

/** Every action the unit could take from `from`, each with the tiles it could be aimed at. */
export function availableActions(battle: BattleState, unit: UnitInstance, from: Point = unit): ClassActionOption[] {
  if (unit.kind !== 'unit' || unit.retreated) return [];
  const out: ClassActionOption[] = [];
  const add = (id: ClassActionId, targets: readonly Point[]): void => {
    if (targets.length > 0) out.push({ id, name: ACTION_NAMES[id], targets });
  };
  add('sap', sapTargets(battle, unit, from).map(tileOf));
  add('entrench', entrenchTiles(battle, unit, from));
  add('mend', mendTargets(battle, unit, from).map(tileOf));
  add('counsel', counselTargets(battle, unit, from).map(tileOf));
  add('dispatch', dispatchTargets(battle, unit, from).map(tileOf));
  if (canDecree(battle, unit)) out.push({ id: 'decree', name: ACTION_NAMES.decree, targets: [] });
  add('open', openTargets(battle, unit, from).map(tileOf));
  return out;
}

/**
 * Carry out an action. `at` is the tile aimed at (omitted for Decree). Throws if the action is
 * not open to the unit from where it stands or the tile is not a valid target.
 */
export function performAction(battle: BattleState, unit: UnitInstance, id: ClassActionId, at?: Point): ClassActionReport {
  const option = availableActions(battle, unit).find((o) => o.id === id);
  if (!option) throw new Error(`${unit.name} cannot ${ACTION_NAMES[id]} from here`);
  const aimed = at && option.targets.find((t) => t.x === at.x && t.y === at.y);
  if (id !== 'decree' && !aimed) throw new Error(`${ACTION_NAMES[id]} cannot be aimed at that tile`);
  const victim = aimed ? battle.unitAt(aimed.x, aimed.y) ?? null : null;

  let target: UnitInstance | null = null;
  let tile: Point | null = null;
  let amount = 0;
  let destroyed = false;

  switch (id) {
    case 'sap': {
      target = victim as UnitInstance;
      amount = Math.min(SAP_DAMAGE, target.hp);
      target.hp -= amount;
      if (target.hp <= 0) {
        battle.defeat(target);
        destroyed = true;
      }
      break;
    }
    case 'entrench': {
      tile = aimed as Point;
      target = battle.placeStructure('barricade', tile, unit.side, [], undefined, unit.faction);
      battle.bump(`entrench:${unit.id}`);
      amount = 1;
      break;
    }
    case 'mend': {
      target = victim as UnitInstance;
      const stack = target.inventory[target.equipped];
      const weapon = battle.weaponOf(target);
      if (stack && weapon) {
        amount = Math.min(MEND_USES, weapon.uses - stack.uses);
        stack.uses += amount;
      }
      target.turnFlags.push('mended');
      break;
    }
    case 'counsel': {
      target = victim as UnitInstance;
      battle.addStatusThrough(target, 'counsel', 'enemy');
      amount = 1;
      break;
    }
    case 'dispatch': {
      target = victim as UnitInstance;
      target.acted = false;
      target.moved = false;
      target.travelled = 0;
      target.bonusMove = 0;
      target.turnFlags.push('dispatched');
      amount = 1;
      break;
    }
    case 'decree': {
      for (const u of battle.livingUnits()) {
        if (u.kind === 'unit' && areFriendly(unit.side, u.side)) {
          battle.addStatusThrough(u, 'decree', 'enemy');
          amount += 1;
        }
      }
      battle.bump(`decree:${unit.id}`);
      break;
    }
    case 'open': {
      target = victim as UnitInstance;
      consumeStack(unit, keySlot(battle, unit), battle.tables);
      battle.defeat(target);
      destroyed = true;
      amount = 1;
      break;
    }
  }

  let expAward: ExpAward | null = null;
  if (unit.side === 'player' && id !== 'open') {
    const gain = Math.max(1, Math.floor(ACTION_EXP * battle.tables.balance.tierExpRate[unit.tier]));
    expAward = { unit, amount: gain, ...awardExp(unit, gain, battle.classOf(unit), battle.tables.balance, battle.rng, battle.rules.guaranteedProgress) };
  }
  battle.wait(unit);
  return { id, actor: unit, target, tile, amount, destroyed, expAward };
}
