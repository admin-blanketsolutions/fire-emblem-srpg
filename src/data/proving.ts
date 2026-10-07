import type { AiProfile } from '../core/aiProfile';
import type { BattleState } from '../core/battle';
import type { EventDef } from '../core/events';
import { parseMap, type GameMap, type MapJson, type Reinforcement, type SpawnJson } from '../core/map';
import type { ObjectiveDef, ObjectiveType } from '../core/objectives';
import { buildBattle, type BattleOptions } from '../core/setup';
import m1TestMapJson from './maps/m1-test.json';
import { testUnits, tables, terrain } from './index';

/**
 * The proving ground under each of the seven objective types, so every one can be played and
 * tested on the same map. Test data only: the campaign's chapters define their own objectives.
 */

export const provingJson = m1TestMapJson as unknown as MapJson;

interface Preset {
  readonly objective: ObjectiveDef;
  readonly events?: readonly EventDef[];
  readonly reinforcements?: readonly Reinforcement[];
  /** Replace the behaviour of these placed units (by unit id). */
  readonly ai?: Readonly<Record<string, AiProfile>>;
}

const lateRider: Reinforcement = { turn: 3, phase: 'enemy', units: [{ def: 'enemy-horseman', at: [21, 12] }] };

export const PROVING_PRESETS: Readonly<Record<ObjectiveType, Preset>> = {
  rout: { objective: { type: 'rout' } },
  seize: { objective: { type: 'seize', tiles: [[18, 7]] } },
  defend: { objective: { type: 'defend', turns: 6 }, reinforcements: [lateRider] },
  'hold-the-pass': { objective: { type: 'hold-the-pass', anchors: [[10, 7], [11, 7]], leakLimit: 1, turns: 6 }, reinforcements: [lateRider] },
  escort: { objective: { type: 'escort', unit: 'healer', exit: [[19, 7]] } },
  survive: { objective: { type: 'survive', turns: 6 }, reinforcements: [lateRider] },
  persuade: {
    objective: { type: 'persuade', targets: ['crossbowman'], turns: 8 },
    ai: { crossbowman: { mode: 'stationary' } },
    events: [
      {
        id: 'win-over',
        when: { type: 'talk', a: 'lord', b: 'crossbowman' },
        then: [{ type: 'recruit', unit: 'crossbowman' }, { type: 'message', text: 'The crossbowman lowers his weapon and joins you.' }],
      },
    ],
  },
};

export const PROVING_OBJECTIVES = Object.keys(PROVING_PRESETS) as ObjectiveType[];

/** The proving-ground map with an objective's rules, and any extra map rules. */
export function provingMap(name: ObjectiveType = 'rout', extra: Partial<MapJson> = {}): GameMap {
  const preset = PROVING_PRESETS[name];
  const retarget = (list: readonly SpawnJson[] | undefined): SpawnJson[] | undefined =>
    list?.map((s) => (preset.ai?.[s.unit] ? { ...s, ai: preset.ai[s.unit] as AiProfile } : s));
  const spawns = provingJson.spawns ?? {};
  const json: MapJson = {
    ...provingJson,
    spawns: { ...spawns, ...(spawns.enemy ? { enemy: retarget(spawns.enemy) as SpawnJson[] } : {}) },
    objective: preset.objective,
    ...(preset.events ? { events: preset.events } : {}),
    ...(preset.reinforcements ? { reinforcements: preset.reinforcements } : {}),
    ...extra,
  };
  return parseMap(json, terrain);
}

export function createProvingBattle(name: ObjectiveType = 'rout', options?: BattleOptions, extra?: Partial<MapJson>): BattleState {
  return buildBattle(provingMap(name, extra), testUnits, tables, options);
}
