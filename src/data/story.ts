import { buildChapterTable, type ChapterTable, type ChapterValidation } from '../core/chapters';
import { buildCharacterTable, type CharacterTable } from '../core/characters';
import { buildCodexTable, type CodexTable } from '../core/codex';
import { buildSceneTable, type SceneTable } from '../core/dialogue';
import { buildSupportTable, type SupportTable } from '../core/supports';
import { campaignBattleIds, campaignUnitIds } from './campaign';
import { items, weapons } from './index';
import siegeUnitsJson from './test/siege-units.json';
import testUnitsJson from './test/units.json';

/**
 * The story's data: the people, their scenes and their supports, the Codex and the order of the
 * chapters. The campaign's own lives in `characters.json`, `scenes/`, `supports.json`, `codex/`
 * and `chapters.json`; the demos' stand-ins, which say plainly that they are not history, live
 * under `test/`. The source lint (`tools/lint-sources.ts`) checks both against the ledger.
 */

export interface Story {
  readonly characters: CharacterTable;
  readonly scenes: SceneTable;
  readonly supports: SupportTable;
  readonly codex: CodexTable;
  /** The chapters, in the order they are played, each a list of steps. */
  readonly chapters: ChapterTable;
}

const list = (modules: Record<string, unknown>): unknown[] => Object.keys(modules).sort().map((k) => modules[k]);
const flat = (modules: Record<string, unknown>): unknown[] => list(modules).flatMap((m) => (Array.isArray(m) ? m : [m]));

function build(characters: unknown[], scenes: unknown[], supports: unknown[], codex: unknown[], chapters: unknown[], known: Pick<ChapterValidation, 'battles' | 'units'>): Story {
  const table = buildCharacterTable(characters);
  const sceneTable = buildSceneTable(scenes, { characters: table });
  const supportTable = buildSupportTable(supports, { scenes: sceneTable });
  const codexTable = buildCodexTable(codex, { scenes: new Set(sceneTable.keys()) });
  return {
    characters: table,
    scenes: sceneTable,
    supports: supportTable,
    codex: codexTable,
    chapters: buildChapterTable(chapters, {
      ...known,
      scenes: new Set(sceneTable.keys()),
      supports: new Set(supportTable.keys()),
      items: new Set([...weapons.keys(), ...items.keys()]),
      codex: new Set(codexTable.keys()),
    }),
  };
}

const campaignCharacters = import.meta.glob<unknown>('./characters.json', { eager: true, import: 'default' });
const campaignScenes = import.meta.glob<unknown>('./scenes/*.scene.json', { eager: true, import: 'default' });
const campaignSupports = import.meta.glob<unknown>('./supports.json', { eager: true, import: 'default' });
const campaignChapters = import.meta.glob<unknown>('./chapters.json', { eager: true, import: 'default' });
const demoCharacters = import.meta.glob<unknown>('./test/characters.json', { eager: true, import: 'default' });
const demoScenes = import.meta.glob<unknown>('./test/scenes/*.scene.json', { eager: true, import: 'default' });
const demoSupports = import.meta.glob<unknown>('./test/supports.json', { eager: true, import: 'default' });
const demoChapters = import.meta.glob<unknown>('./test/chapters.json', { eager: true, import: 'default' });
const campaignCodex = import.meta.glob<unknown>('./codex/*.json', { eager: true, import: 'default' });
const demoCodex = import.meta.glob<unknown>('./test/codex.json', { eager: true, import: 'default' });

/** The campaign: the Prologue and Chapters 1 to 3. */
export const campaignStory: Story = build(
  flat(campaignCharacters),
  list(campaignScenes),
  flat(campaignSupports),
  flat(campaignCodex),
  flat(campaignChapters),
  { battles: campaignBattleIds, units: campaignUnitIds },
);

/** The stand-ins the demos play; their Codex also holds the campaign's entries, so those can be read. */
export const demoStory: Story = build(
  flat(demoCharacters),
  list(demoScenes),
  flat(demoSupports),
  [...flat(campaignCodex), ...flat(demoCodex)],
  flat(demoChapters),
  { battles: new Set(['siege']), units: new Set([...Object.keys(testUnitsJson), ...Object.keys(siegeUnitsJson)]) },
);
