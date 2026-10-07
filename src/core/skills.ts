import type { BattleState } from './battle';
import { addBonus, NO_BONUS, type Bonus } from './combat';
import { manhattan } from './grid';
import { type Point } from './types';
import { maxHp, type UnitInstance } from './unit';
import type { WeaponDef } from './weapons';

/**
 * Skills (DESIGN §6.5). Their descriptions live in data; what they do lives here, one small
 * function per effect, so a skill can be read, tested and changed on its own.
 */

export type SkillKind = 'passive' | 'aura' | 'trigger' | 'action';

export interface SkillDef {
  readonly id: string;
  readonly name: string;
  readonly kind: SkillKind;
  readonly description: string;
}

export type SkillTable = ReadonlyMap<string, SkillDef>;

export function buildSkillTable(raw: readonly unknown[]): SkillTable {
  const table = new Map<string, SkillDef>();
  const kinds: readonly SkillKind[] = ['passive', 'aura', 'trigger', 'action'];
  raw.forEach((entry, i) => {
    const d = entry as Partial<SkillDef>;
    const where = `skill #${i}${typeof d.id === 'string' ? ` "${d.id}"` : ''}`;
    if (typeof d.id !== 'string' || d.id === '') throw new Error(`${where}: missing id`);
    if (table.has(d.id)) throw new Error(`${where}: duplicate id`);
    if (typeof d.name !== 'string' || typeof d.description !== 'string') throw new Error(`${where}: needs a name and a description`);
    if (!kinds.includes(d.kind as SkillKind)) throw new Error(`${where}: unknown kind "${String(d.kind)}"`);
    table.set(d.id, d as SkillDef);
  });
  return table;
}

/** One side of an exchange, as a skill sees it. */
export interface CombatContext {
  readonly battle: BattleState;
  readonly self: UnitInstance;
  readonly other: UnitInstance;
  readonly role: 'attacker' | 'defender';
  /** Where `self` stands in this exchange. */
  readonly at: Point;
  readonly distance: number;
  /** The weapon `self` fights with, if any. */
  readonly weapon: WeaponDef | null;
  /** True if `self` is where it began the turn and has not moved. */
  readonly stationary: boolean;
  readonly otherIsStructure: boolean;
}

type Effect = (ctx: CombatContext) => Partial<Bonus>;

const isKind = (weapon: WeaponDef | null, ...kinds: WeaponDef['kind'][]): boolean => weapon !== null && kinds.includes(weapon.kind);

/** Effects a unit's own skills have on its side of a fight. */
const OWN: Readonly<Record<string, Effect>> = {
  'stand-fast': ({ self }) => (self.travelled === 0 ? { grd: 1, avoid: 10 } : {}),
  parry: ({ role, distance }) => (role === 'defender' && distance === 1 ? { avoid: 10 } : {}),
  'keen-edge': ({ weapon }) => (isKind(weapon, 'sabre', 'dagger') ? { crit: 15 } : {}),
  'last-stand': ({ self }) => (self.hp * 4 < maxHp(self) ? { avoid: 15, crit: 10 } : {}),
  'heavy-blow': ({ self, other }) => (other.stats.bld < self.stats.bld ? { might: 2 } : {}),
  'steady-aim': ({ weapon, stationary }) => (stationary && isKind(weapon, 'bow', 'crossbow') ? { hit: 10 } : {}),
  'long-draw': ({ weapon, stationary }) => (stationary && isKind(weapon, 'bow') && weapon !== null && weapon.range[1] < 4 ? { range: 1 } : {}),
  deadeye: ({ weapon }) => (isKind(weapon, 'bow') ? { crit: 20 } : {}),
  shock: ({ role, self }) => (role === 'attacker' && self.travelled >= 4 ? { might: 2 } : {}),
  'piercing-bolt': ({ weapon }) => (isKind(weapon, 'crossbow') ? { pierce: 1 } : {}),
  'bolt-volley': ({ weapon, other }) => (isKind(weapon, 'crossbow') && (other.moveType === 'armored' || other.moveType === 'mounted') ? { might: 3 } : {}),
  'siege-bolt': ({ weapon, otherIsStructure }) => (isKind(weapon, 'crossbow') && otherIsStructure && weapon ? { might: weapon.might } : {}),
  elusive: () => ({ avoid: 10 }),
  'counter-charge': ({ role, other }) => (role === 'defender' && other.moveType === 'mounted' ? { alwaysHit: true, might: 3 } : {}),
  bulwark: () => ({ reduction: 2 }),
  highlander: ({ battle, at }) => (['hill', 'crag'].includes(battle.terrainAt(at.x, at.y).id) ? { avoid: 10 } : {}),
  phalanx: ({ battle, self, at }) => {
    const spears = battle.livingUnits(self.side).filter((u) => u !== self && manhattan(u, at) === 1 && battle.weaponOf(u)?.kind === 'spear').length;
    return { grd: Math.min(3, spears) };
  },
};

/** Auras: what a unit gives the allies near it. `range` is in tiles from the ally. */
const AURAS: Readonly<Record<string, { range: number; bonus: Partial<Bonus> }>> = {
  presence: { range: 2, bonus: { hit: 5, avoid: 5 } },
  command: { range: 3, bonus: { hit: 10, avoid: 10 } },
  'shield-wall': { range: 1, bonus: { grd: 1 } },
};

/** What statuses do to a unit's side of a fight. */
function statusBonus(unit: UnitInstance): Partial<Bonus> {
  let bonus: Bonus = NO_BONUS;
  for (const s of unit.statuses) {
    if (s.id === 'sunder') bonus = addBonus(bonus, { grd: -s.amount });
    else if (s.id === 'harry') bonus = addBonus(bonus, { avoid: -10 });
    else if (s.id === 'counsel' || s.id === 'decree') bonus = addBonus(bonus, { hit: 10, avoid: 10 });
    else if (s.id === 'warcry') bonus = addBonus(bonus, { might: 2 });
  }
  return bonus;
}

/**
 * Everything skills, auras and statuses add to one side of a fight. The aura of a skill does not
 * stack with itself from several sources, except that each Presence or Command is its own source.
 */
export function skillBonus(ctx: CombatContext): Bonus {
  let bonus: Bonus = addBonus(NO_BONUS, statusBonus(ctx.self));
  for (const id of ctx.self.skills) bonus = addBonus(bonus, OWN[id]?.(ctx) ?? {});
  let shield = false;
  for (const ally of ctx.battle.livingUnits(ctx.self.side)) {
    if (ally === ctx.self) continue;
    for (const id of ally.skills) {
      const aura = AURAS[id];
      if (!aura || manhattan(ally, ctx.at) > aura.range) continue;
      if (id === 'shield-wall') {
        if (shield) continue; // adjacent shields do not stack
        shield = true;
      }
      bonus = addBonus(bonus, aura.bonus);
    }
  }
  // a supported friend beside the tile lends its rank's bonus (best two count)
  const supports = ctx.battle.supports;
  if (supports && ctx.self.kind === 'unit') {
    const aid = supports.aidFor(ctx.self.defId, ctx.at, ctx.battle.livingUnits(ctx.self.side));
    bonus = addBonus(bonus, { hit: aid.hit, avoid: aid.avoid, crit: aid.crit, grd: aid.grd });
  }
  return bonus;
}

/** Extra reach for a weapon from a tile (Long Draw). */
export function rangeBonus(unit: UnitInstance, weapon: WeaponDef, at: Point): number {
  if (!unit.skills.includes('long-draw')) return 0;
  const stationary = unit.travelled === 0 && at.x === unit.x && at.y === unit.y;
  return stationary && weapon.kind === 'bow' && weapon.range[1] < 4 ? 1 : 0;
}

/** Movement points a unit has: its Move stat, plus Swift. */
export function movementOf(unit: UnitInstance): number {
  return unit.stats.mov + (unit.skills.includes('swift') ? 1 : 0);
}

/** The cost for this unit to enter terrain, given the base cost (null = it cannot). */
export function adjustedCost(unit: UnitInstance, terrainId: string, base: number | null): number | null {
  if (base === null) return null;
  if (unit.skills.includes('lightstep')) return 1;
  if (unit.skills.includes('highlander') && (terrainId === 'hill' || terrainId === 'crag')) return 1;
  return base;
}
