import type { BattleRules, BattleState } from '../core/battle';
import type { LoadEnv } from '../core/save';
import { SupportTracker } from '../core/supports';
import { OBJECTIVE_TYPES, type ObjectiveType } from '../core/objectives';
import { buildBattle } from '../core/setup';
import { siegeMap, siegeUnits } from './demos';
import { tables } from './index';
import { provingMap } from './proving';
import { campaignStory, demoStory } from './story';

/**
 * Where a battle comes from, as plain data, so a suspend-save can rebuild it: the proving ground
 * under an objective, or a demo. The chapters join this list in M7.
 */
export type BattleSource =
  | { readonly kind: 'proving'; readonly objective: ObjectiveType; readonly fog: boolean }
  | { readonly kind: 'demo'; readonly demo: 'siege' };

export function isBattleSource(raw: unknown): raw is BattleSource {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  if (r.kind === 'proving') return OBJECTIVE_TYPES.includes(r.objective as ObjectiveType) && typeof r.fog === 'boolean';
  return r.kind === 'demo' && r.demo === 'siege';
}

/** Build a battle from its source, as at its start. Supports, if any, are the caller's to attach. */
export function battleFrom(source: unknown, rules: Partial<BattleRules> = {}, seed?: number): BattleState {
  if (!isBattleSource(source)) throw new Error(`Unknown battle ${JSON.stringify(source)}`);
  const options = { rules, ...(seed === undefined ? {} : { seed }) };
  if (source.kind === 'proving') return buildBattle(provingMap(source.objective, source.fog ? { fog: true } : {}), tables.units, tables, options);
  return buildBattle(siegeMap(), siegeUnits, { ...tables, units: siegeUnits }, options);
}

/** The stories a campaign can play, by the id a save records. */
export const STORIES = { campaign: campaignStory, demo: demoStory } as const;

/** What `decodeSave` needs from the data. */
export const loadEnv: LoadEnv = {
  tables: { ...tables, units: { ...tables.units, ...siegeUnits } },
  supportsFor: (story) => {
    const s = STORIES[story as keyof typeof STORIES];
    if (!s) throw new Error(`Unknown story "${story}"`);
    return new SupportTracker(s.supports);
  },
  buildBattle: (source, rules) => battleFrom(source, rules),
};
