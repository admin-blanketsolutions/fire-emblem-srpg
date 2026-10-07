import { buildCharacterTable, type CharacterTable } from '../core/characters';
import { buildSceneTable, type SceneTable } from '../core/dialogue';
import { buildSupportTable, type SupportTable } from '../core/supports';

/**
 * The story's data: the people, their scenes and their supports. The campaign's own lives in
 * `characters.json`, `scenes/` and `supports.json`; the demos' stand-ins, which say plainly that
 * they are not history, live under `test/`. The source lint (`tools/lint-sources.ts`) checks both
 * against the ledger.
 */

export interface Story {
  readonly characters: CharacterTable;
  readonly scenes: SceneTable;
  readonly supports: SupportTable;
}

const list = (modules: Record<string, unknown>): unknown[] => Object.keys(modules).sort().map((k) => modules[k]);
const flat = (modules: Record<string, unknown>): unknown[] => list(modules).flatMap((m) => (Array.isArray(m) ? m : [m]));

function build(characters: unknown[], scenes: unknown[], supports: unknown[]): Story {
  const table = buildCharacterTable(characters);
  const sceneTable = buildSceneTable(scenes, { characters: table });
  return { characters: table, scenes: sceneTable, supports: buildSupportTable(supports, { scenes: sceneTable }) };
}

const campaignCharacters = import.meta.glob<unknown>('./characters.json', { eager: true, import: 'default' });
const campaignScenes = import.meta.glob<unknown>('./scenes/*.scene.json', { eager: true, import: 'default' });
const campaignSupports = import.meta.glob<unknown>('./supports.json', { eager: true, import: 'default' });
const demoCharacters = import.meta.glob<unknown>('./test/characters.json', { eager: true, import: 'default' });
const demoScenes = import.meta.glob<unknown>('./test/scenes/*.scene.json', { eager: true, import: 'default' });
const demoSupports = import.meta.glob<unknown>('./test/supports.json', { eager: true, import: 'default' });

/** The campaign's story: empty until the chapters are written. */
export const campaignStory: Story = build(flat(campaignCharacters), list(campaignScenes), flat(campaignSupports));

/** The stand-ins the demos play. */
export const demoStory: Story = build(flat(demoCharacters), list(demoScenes), flat(demoSupports));
