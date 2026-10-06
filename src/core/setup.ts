import { BattleState, type UnitInstance, type WeaponInfo } from './battle';
import type { GameMap } from './map';
import type { MoveType, Side } from './types';

/** A unit as authored in data, before it is placed on a map. */
export interface UnitTemplate {
  readonly name: string;
  readonly className: string;
  readonly side: Side;
  readonly level: number;
  readonly moveType: MoveType;
  readonly mov: number;
  readonly mgt: number;
  readonly grd: number;
  readonly maxHp: number;
  readonly weapon: WeaponInfo | null;
  readonly spriteId: string;
  readonly faction: string;
  readonly skin: string;
}

export type UnitTable = Readonly<Record<string, UnitTemplate>>;

export function createUnit(id: string, template: UnitTemplate, x: number, y: number): UnitInstance {
  return {
    id,
    name: template.name,
    side: template.side,
    className: template.className,
    level: template.level,
    moveType: template.moveType,
    mov: template.mov,
    mgt: template.mgt,
    grd: template.grd,
    maxHp: template.maxHp,
    weapon: template.weapon,
    spriteId: template.spriteId,
    faction: template.faction,
    skin: template.skin,
    hp: template.maxHp,
    x,
    y,
    moved: false,
    acted: false,
    retreated: false,
  };
}

/**
 * Place every unit named in the map's spawns. A template used more than once gets numbered
 * instance ids (`soldier#1`, `soldier#2`), so every unit on the board has a unique id.
 */
export function buildBattle(map: GameMap, table: UnitTable): BattleState {
  const spawns = [...(map.spawns.player ?? []), ...(map.spawns.ally ?? []), ...(map.spawns.enemy ?? [])];
  const totals = new Map<string, number>();
  for (const spawn of spawns) totals.set(spawn.unit, (totals.get(spawn.unit) ?? 0) + 1);
  const seen = new Map<string, number>();
  const units = spawns.map((spawn) => {
    const template = table[spawn.unit];
    if (!template) throw new Error(`Map "${map.id}" places unknown unit "${spawn.unit}"`);
    const n = (seen.get(spawn.unit) ?? 0) + 1;
    seen.set(spawn.unit, n);
    const id = (totals.get(spawn.unit) ?? 1) > 1 ? `${spawn.unit}#${n}` : spawn.unit;
    return createUnit(id, template, spawn.at[0], spawn.at[1]);
  });
  return new BattleState(map, units);
}
