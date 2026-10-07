import type { AiProfile } from './aiProfile';
import type { ClassDef, ClassTable } from './classes';
import type { ItemTable } from './items';
import type { Status } from './status';
import { addStats, TIER_CAPS, type MutableStats, type Stat, type Stats, type Tier } from './stats';
import type { MoveType, Point, Side } from './types';
import { gradeFromWexp, wexpForGrade, type WeaponDef, type WeaponKind, type WeaponTable } from './weapons';

/** Units carry at most this many items. */
export const INVENTORY_SLOTS = 5;

export interface ItemStack {
  /** A weapon id or an item id. */
  readonly id: string;
  /** Remaining uses; a weapon at 0 breaks and is removed, and a used-up item is removed too. */
  uses: number;
}

/** The data a unit is built from. */
export interface UnitCatalog {
  readonly classes: ClassTable;
  readonly weapons: WeaponTable;
  readonly items: ItemTable;
}

/** A unit as authored in data (DESIGN §3.6). */
export interface UnitDef {
  readonly id: string;
  readonly name: string;
  readonly side: Side;
  readonly class: string;
  readonly level: number;
  /** Personal additions to the class base stats (this is where Fortune lives). */
  readonly offset?: Readonly<Partial<Stats>>;
  /** Growth rates in percent per level-up; missing stats grow 0. */
  readonly growth: Readonly<Partial<Stats>>;
  /** Starting weapon grade per kind, and personal caps that replace the class's. */
  readonly weaponGrades?: Readonly<Partial<Record<WeaponKind, number>>>;
  readonly inventory: readonly string[];
  readonly skills?: readonly string[];
  /** Story-critical: retreats wounded and always returns. */
  readonly chronicled?: boolean;
  /** An invented character, flagged as such in the game and the ledger. */
  readonly fictional?: boolean;
  /** Earns bonus EXP when defeated. */
  readonly boss?: boolean;
  readonly sprite?: string;
  readonly faction: string;
  readonly skin: string;
  /** Behaviour when the computer controls the unit; enemies default to aggressive. */
  readonly ai?: AiProfile;
  /** Labels the objectives, events and AI refer to: `lord`, `boss`, `leader`, and so on. */
  readonly tags?: readonly string[];
}

export type UnitTable = Readonly<Record<string, UnitDef>>;

/** A unit on the battlefield. Identity and growth are fixed; the rest changes in play. */
export interface UnitInstance {
  /** Unique on the board (`soldier#2` when a definition is placed more than once). */
  readonly id: string;
  readonly defId: string;
  readonly name: string;
  /** Changes when a unit is won over (Talk, recruit). */
  side: Side;
  readonly spriteId: string;
  readonly faction: string;
  readonly skin: string;
  readonly growth: Readonly<Partial<Stats>>;
  /** Personal weapon-grade caps that replace the class's. */
  readonly gradeCaps: Readonly<Partial<Record<WeaponKind, number>>>;
  readonly boss: boolean;
  readonly chronicled: boolean;
  readonly fictional: boolean;
  /** Gates, barricades and siege engines are units too, but never act as soldiers do. */
  readonly kind: 'unit' | 'structure';
  /** Where the unit started: its post, for leashes and defensive behaviour. */
  readonly home: Point;

  classId: string;
  tier: Tier;
  moveType: MoveType;
  level: number;
  exp: number;
  /** Current stats; `stats.hp` is the maximum. */
  stats: MutableStats;
  wexp: Partial<Record<WeaponKind, number>>;
  inventory: ItemStack[];
  /** Index into `inventory` of the equipped weapon, or -1. */
  equipped: number;
  skills: string[];
  hp: number;
  x: number;
  y: number;
  moved: boolean;
  acted: boolean;
  /** Set when a unit "retreats wounded"; such units leave the map. */
  retreated: boolean;
  /** Left the map by an exit (a fleeing unit or an escort) rather than falling. */
  escaped: boolean;
  /** How the computer plays this unit; null for units the player controls. */
  ai: AiProfile | null;
  tags: string[];
  /** A defensive unit that has woken and stays awake. */
  triggered: boolean;
  statuses: Status[];
  /** Movement cost spent so far this turn; zero means the unit has not moved. */
  travelled: number;
  /** Tiles of movement still owed after an attack (Wheel, Skirmish, Pursuit). */
  bonusMove: number;
  /** Things this unit has already done this turn, for once-a-turn skills. */
  turnFlags: string[];
}

export const maxHp = (unit: UnitInstance): number => unit.stats.hp;

/** The stat cap for a unit's class and tier. */
export function statCap(classDef: ClassDef, stat: Stat): number {
  return classDef.caps?.[stat] ?? TIER_CAPS[classDef.tier][stat];
}

/** The highest grade the unit can currently use in a weapon kind: 0 if its class cannot use it. */
export function currentGrade(unit: UnitInstance, classDef: ClassDef, kind: WeaponKind): number {
  const cap = unit.gradeCaps[kind] ?? classDef.weapons[kind] ?? 0;
  if (cap === 0) return 0;
  return Math.min(cap, gradeFromWexp(unit.wexp[kind] ?? 0));
}

export function canEquip(unit: UnitInstance, weapon: WeaponDef, classDef: ClassDef): boolean {
  if (weapon.mountedOnly && unit.moveType !== 'mounted') return false;
  return weapon.grade <= currentGrade(unit, classDef, weapon.kind);
}

/** The equipped weapon, or null if none is equipped or it has no uses left. */
export function equippedWeapon(unit: UnitInstance, weapons: WeaponTable): WeaponDef | null {
  const stack = unit.inventory[unit.equipped];
  if (!stack || stack.uses <= 0) return null;
  return weapons.get(stack.id) ?? null;
}

/** Inventory slots holding a weapon, with its definition. */
export function weaponStacks(unit: UnitInstance, weapons: WeaponTable): Array<{ slot: number; stack: ItemStack; weapon: WeaponDef }> {
  const out: Array<{ slot: number; stack: ItemStack; weapon: WeaponDef }> = [];
  unit.inventory.forEach((stack, slot) => {
    const weapon = weapons.get(stack.id);
    if (weapon && stack.uses > 0) out.push({ slot, stack, weapon });
  });
  return out;
}

/** Equip the first weapon the unit can wield (offensive weapons first), or none. */
export function autoEquip(unit: UnitInstance, weapons: WeaponTable, classes: ClassTable): void {
  const classDef = classes.get(unit.classId);
  unit.equipped = -1;
  if (!classDef) return;
  const usable = weaponStacks(unit, weapons).filter((w) => canEquip(unit, w.weapon, classDef));
  const pick = usable.find((w) => w.weapon.kind !== 'remedy') ?? usable[0];
  if (pick) unit.equipped = pick.slot;
}

/** Build a unit from its definition. Throws a descriptive error for unknown classes or items. */
export interface UnitOverrides {
  readonly ai?: AiProfile;
  readonly tags?: readonly string[];
}

export function createUnit(def: UnitDef, id: string, x: number, y: number, catalog: UnitCatalog, overrides: UnitOverrides = {}): UnitInstance {
  const { classes, weapons, items } = catalog;
  const classDef = classes.get(def.class);
  if (!classDef) throw new Error(`Unit "${def.id}" has unknown class "${def.class}"`);
  const stats = addStats(classDef.base, def.offset ?? {});

  const inventory: ItemStack[] = def.inventory.map((itemId) => {
    const found = weapons.get(itemId) ?? items.get(itemId);
    if (!found) throw new Error(`Unit "${def.id}" carries unknown item "${itemId}"`);
    return { id: itemId, uses: found.uses };
  });
  if (inventory.length > INVENTORY_SLOTS) throw new Error(`Unit "${def.id}" carries more than ${INVENTORY_SLOTS} items`);

  // Weapon EXP starts at the explicit grades, and at least enough to wield the starting kit.
  const wexp: Partial<Record<WeaponKind, number>> = {};
  for (const [kind, grade] of Object.entries(def.weaponGrades ?? {})) wexp[kind as WeaponKind] = wexpForGrade(grade);
  const gradeCaps = def.weaponGrades ?? {};
  for (const { id: itemId } of inventory) {
    const weapon = weapons.get(itemId);
    if (!weapon) continue;
    const cap = gradeCaps[weapon.kind] ?? classDef.weapons[weapon.kind] ?? 0;
    if (cap >= weapon.grade) wexp[weapon.kind] = Math.max(wexp[weapon.kind] ?? 0, wexpForGrade(weapon.grade));
  }

  const unit: UnitInstance = {
    id,
    defId: def.id,
    name: def.name,
    side: def.side,
    spriteId: def.sprite ?? `unit.${classDef.id}`,
    faction: def.faction,
    skin: def.skin,
    growth: def.growth,
    gradeCaps,
    boss: def.boss ?? false,
    chronicled: def.chronicled ?? false,
    fictional: def.fictional ?? false,
    kind: 'unit',
    home: { x, y },
    classId: classDef.id,
    tier: classDef.tier,
    moveType: classDef.moveType,
    level: def.level,
    exp: 0,
    stats,
    wexp,
    inventory,
    equipped: -1,
    skills: [...(def.skills ?? classDef.skills ?? [])],
    hp: stats.hp,
    x,
    y,
    moved: false,
    acted: false,
    retreated: false,
    escaped: false,
    // enemies and allies are played by the computer unless the data says otherwise
    ai: overrides.ai ?? def.ai ?? (def.side === 'player' ? null : { mode: 'aggressive' }),
    tags: [...(overrides.tags ?? def.tags ?? [])],
    triggered: false,
    statuses: [],
    travelled: 0,
    bonusMove: 0,
    turnFlags: [],
  };
  autoEquip(unit, weapons, classes);
  return unit;
}
