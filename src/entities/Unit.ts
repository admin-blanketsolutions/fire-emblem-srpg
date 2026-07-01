export type UnitFaction = 'ally' | 'enemy';
export type UnitClass = 'Lord' | 'Knight' | 'Mage' | 'Healer' | 'Archer' | 'Thief';

export interface UnitStats {
  hp: number;
  maxHp: number;
  str: number;
  mag: number;
  skl: number;
  spd: number;
  lck: number;
  def: number;
  res: number;
  mov: number;
}

export interface UnitData {
  id: string;
  name: string;
  faction: UnitFaction;
  unitClass: UnitClass;
  stats: UnitStats;
  gridX: number;
  gridY: number;
  hasMoved: boolean;
  hasActed: boolean;
}

export function makeUnit(
  id: string,
  name: string,
  faction: UnitFaction,
  unitClass: UnitClass,
  gridX: number,
  gridY: number,
  stats: Partial<UnitStats> = {},
): UnitData {
  const defaults: UnitStats = {
    hp: 20, maxHp: 20,
    str: 7, mag: 0, skl: 8, spd: 7,
    lck: 5, def: 5, res: 2, mov: 5,
  };
  return {
    id, name, faction, unitClass, gridX, gridY,
    hasMoved: false, hasActed: false,
    stats: { ...defaults, ...stats },
  };
}
