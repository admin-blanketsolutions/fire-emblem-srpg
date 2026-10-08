import { newArmy, type CampaignMode } from '../core/army';
import type { BattleRules, BattleState } from '../core/battle';
import type { BotEnv } from '../core/bot';
import { newCampaign, type Campaign } from '../core/campaign';
import type { LoadEnv } from '../core/save';
import type { UnitTable } from '../core/unit';
import { SupportTracker } from '../core/supports';
import { OBJECTIVE_TYPES, type ObjectiveType } from '../core/objectives';
import { buildBattle } from '../core/setup';
import { campaignBattleIds, campaignMap, campaignTables, campaignUnits } from './campaign';
import { newDemoCampaign, siegeMap, siegeUnits } from './demos';
import { tables } from './index';
import { provingMap } from './proving';
import { campaignStory, demoStory } from './story';

/**
 * Where a battle comes from, as plain data, so a suspend-save can rebuild it: a chapter's map, the
 * proving ground under an objective, or a demo.
 */
export type BattleSource =
  | { readonly kind: 'chapter'; readonly map: string }
  | { readonly kind: 'proving'; readonly objective: ObjectiveType; readonly fog: boolean }
  | { readonly kind: 'demo'; readonly demo: 'siege' };

export function isBattleSource(raw: unknown): raw is BattleSource {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  if (r.kind === 'chapter') return typeof r.map === 'string' && campaignBattleIds.has(r.map);
  if (r.kind === 'proving') return OBJECTIVE_TYPES.includes(r.objective as ObjectiveType) && typeof r.fog === 'boolean';
  return r.kind === 'demo' && r.demo === 'siege';
}

/**
 * Build a battle from its source, as at its start. Supports, if any, are the caller's to attach.
 * With `begin` false the first phase is left unstarted, for the caller to field the army first.
 */
export function battleFrom(source: unknown, rules: Partial<BattleRules> = {}, seed?: number, begin = true): BattleState {
  if (!isBattleSource(source)) throw new Error(`Unknown battle ${JSON.stringify(source)}`);
  const options = { rules, begin, ...(seed === undefined ? {} : { seed }) };
  if (source.kind === 'chapter') return buildBattle(campaignMap(source.map), campaignUnits, campaignTables, options);
  if (source.kind === 'proving') return buildBattle(provingMap(source.objective, source.fog ? { fog: true } : {}), tables.units, tables, options);
  return buildBattle(siegeMap(), siegeUnits, { ...tables, units: siegeUnits }, options);
}

/** The stories a campaign can play, by the id a save records. */
export const STORIES = { campaign: campaignStory, demo: demoStory } as const;
export type StoryId = keyof typeof STORIES;

/** The battle a chapter's `battle` step names, as a source: a chapter map, or the demo's siege. */
export function sourceOf(story: string, battle: string): BattleSource {
  if (story === 'demo') {
    if (battle !== 'siege') throw new Error(`The demo has no battle "${battle}"`);
    return { kind: 'demo', demo: 'siege' };
  }
  return { kind: 'chapter', map: battle };
}

/** What `decodeSave` needs from the data. */
export const loadEnv: LoadEnv = {
  tables: { ...tables, units: { ...tables.units, ...siegeUnits, ...campaignUnits } },
  supportsFor: (story) => {
    const s = STORIES[story as StoryId];
    if (!s) throw new Error(`Unknown story "${story}"`);
    return new SupportTracker(s.supports);
  },
  buildBattle: (source, rules) => battleFrom(source, rules),
};

/** The unit definitions each story's chapters draw on, for units that join the army. */
export const STORY_UNITS: Readonly<Record<StoryId, UnitTable>> = { campaign: campaignUnits, demo: siegeUnits };

/** A new campaign: the story's first chapter, with an army that is yet to be raised by its first steps. */
export function newCampaignFor(story: StoryId, mode: CampaignMode, seed: number): Campaign {
  if (story === 'demo') return newDemoCampaign(mode, seed);
  const first = [...STORIES[story].chapters.keys()][0];
  if (!first) throw new Error(`The story "${story}" has no chapters`);
  return newCampaign({ mode, seed, story, army: newArmy([], 0, { supports: new SupportTracker(STORIES[story].supports) }), chapter: first, step: 0 });
}

/** What the headless player (`core/bot.ts`) needs to walk a story: its chapters, scenes, units and battles. */
export function botEnvFor(story: StoryId): BotEnv {
  const s = STORIES[story];
  return {
    chapters: s.chapters,
    scenes: s.scenes,
    units: STORY_UNITS[story],
    tables: loadEnv.tables,
    codex: s.codex,
    battle: (id, rules, seed) => battleFrom(sourceOf(story, id), rules, seed, false),
  };
}
