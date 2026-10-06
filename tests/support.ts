import { BattleState, DEFAULT_RULES, type BattleRules } from '../src/core/battle';
import { parseMap, type GameMap, type MapJson } from '../src/core/map';
import { createRng, type Rng } from '../src/core/rng';
import type { Side } from '../src/core/types';
import { createUnit, type UnitDef, type UnitInstance } from '../src/core/unit';
import type { Stats } from '../src/core/stats';
import { balance, classes, tables, terrain, weapons } from '../src/data';

export { balance, classes, tables, terrain, weapons };

export interface UnitSpec {
  readonly id?: string;
  readonly class?: string;
  readonly side?: Side;
  readonly level?: number;
  readonly offset?: Partial<Stats>;
  readonly growth?: Partial<Stats>;
  readonly inventory?: string[];
  readonly weaponGrades?: UnitDef['weaponGrades'];
  readonly boss?: boolean;
  readonly x?: number;
  readonly y?: number;
}

/** A unit built from the real class and weapon tables. Defaults to a Tier I swordsman on the player's side. */
export function unit(spec: UnitSpec = {}): UnitInstance {
  const id = spec.id ?? 'u';
  const def: UnitDef = {
    id,
    name: id,
    side: spec.side ?? 'player',
    class: spec.class ?? 'swordsman',
    level: spec.level ?? 1,
    ...(spec.offset ? { offset: spec.offset } : {}),
    growth: spec.growth ?? {},
    ...(spec.weaponGrades ? { weaponGrades: spec.weaponGrades } : {}),
    ...(spec.boss ? { boss: true } : {}),
    inventory: spec.inventory ?? ['iron-sabre'],
    faction: 'ayyubid',
    skin: 's1',
  };
  return createUnit(def, id, spec.x ?? 0, spec.y ?? 0, classes, weapons);
}

/** A rectangular map of one terrain (default plain), or of explicit rows with the given legend. */
export function arena(width = 9, height = 3, rows?: string[], legend: Record<string, string> = { '.': 'plain', G: 'grove', '~': 'river', '^': 'crag', '+': 'hospice' }): GameMap {
  const terrainRows = rows ?? (Array(height).fill('.'.repeat(width)) as string[]);
  return parseMap(
    { id: 'arena', name: 'Arena', size: [terrainRows[0]?.length ?? width, terrainRows.length], terrain: terrainRows, legend } as MapJson,
    terrain,
  );
}

export function battleOf(units: UnitInstance[], map: GameMap = arena(), seed: number | Rng = 1, rules: Partial<BattleRules> = {}): BattleState {
  const rng = typeof seed === 'number' ? createRng(seed) : seed;
  return new BattleState(map, units, tables, rng, { ...DEFAULT_RULES, ...rules });
}

/** An Rng that returns the given integers in order and throws when they run out. */
export function scripted(...values: number[]): Rng & { readonly drawn: () => number } {
  const queue = [...values];
  let count = 0;
  return {
    next: () => 0,
    int: () => {
      const v = queue.shift();
      if (v === undefined) throw new Error('scripted Rng ran out of values');
      count += 1;
      return v;
    },
    state: () => 0,
    restore: () => undefined,
    drawn: () => count,
  };
}

/** An Rng that counts how many integers were drawn from a seeded stream. */
export function counting(seed: number): Rng & { readonly drawn: () => number } {
  const inner = createRng(seed);
  let count = 0;
  return {
    next: () => inner.next(),
    int: (n) => {
      count += 1;
      return inner.int(n);
    },
    state: () => inner.state(),
    restore: (state) => inner.restore(state),
    drawn: () => count,
  };
}
