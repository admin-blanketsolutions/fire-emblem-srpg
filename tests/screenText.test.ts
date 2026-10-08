import { describe, expect, it } from 'vitest';
import fontJson from '../assets/fonts/majlis.font.json';
import { measureText, validateFont, wrapText } from '../src/core/font';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import { LOGICAL_WIDTH } from '../src/core/viewport';
import type { TextRenderer } from '../src/engine/text';
import type { CampScene } from '../src/scenes/campScene';
import type { ListScreen, ListContent } from '../src/scenes/listScreen';
import { SettingsScene, TitleScene } from '../src/scenes/menus';
import { harness, startCampaign } from './flowHarness';

/**
 * The line a list screen shows about the chosen row has room for two rows of the font, above the
 * hint; anything longer is cut off. Every such line the game has is measured here, with the real font.
 */

const font = validateFont(fontJson, 'majlis.font.json');
const text = { width: (s: string) => measureText(font, s), wrap: (s: string, w: number) => wrapText(font, s, w), lineHeight: font.lineHeight } as unknown as TextRenderer;

const contentOf = (screen: unknown): ListContent => (screen as { content(): ListContent }).content();

/** Every row's about-line, and the note under the list, of the screen as it stands. */
function lines(screen: unknown): string[] {
  const { rows, note } = contentOf(screen);
  return [...rows.flatMap((r) => (r.about ? [r.about] : [])), ...(note ? [note] : [])];
}

function fits(where: string, screen: unknown): void {
  const tooLong = lines(screen).filter((line) => wrapText(font, line, LOGICAL_WIDTH - 28).length > 2);
  expect.soft(tooLong, where).toEqual([]);
}

describe('the lines about a chosen row', () => {
  it('fit on the title, in the mode choice and in the settings', () => {
    const title = new TitleScene({ text, canResume: true, canLoad: true, notice: null, onResume: () => undefined, onNewGame: () => undefined, onLoad: () => undefined, onSettings: () => undefined });
    fits('title', title);
    (title as unknown as { enterModes(): void }).enterModes();
    fits('new game', title);
    expect(lines(title).length).toBe(2);
    fits('settings', new SettingsScene({ text, settings: DEFAULT_SETTINGS, onChange: () => undefined, onBack: () => undefined }));
  });

  it('fit in the camp’s records and at the end of the slice, in either mode', () => {
    for (const mode of ['Classic', 'Casual'] as const) {
      const h = harness(undefined, true, text);
      startCampaign(h, mode);
      fits(`records, ${mode}`, h.flow.campOptions(h.scene() as CampScene) as ListScreen);
      fits(`end menu, ${mode}`, (h.flow as unknown as { endMenu(): ListScreen }).endMenu());
    }
  });
});
