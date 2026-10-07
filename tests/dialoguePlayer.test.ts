import { describe, expect, it } from 'vitest';
import { buildCharacterTable } from '../src/core/characters';
import { validateScene, type Effect } from '../src/core/dialogue';
import type { Action } from '../src/core/input';
import { DEFAULT_SETTINGS, type Settings } from '../src/core/settings';
import type { Assets } from '../src/engine/assets';
import type { TextRenderer } from '../src/engine/text';
import { DialoguePlayer } from '../src/scenes/dialoguePlayer';

/** The player's rules (typewriter, pages, skipping, the backlog), without a screen: the drawing is looked at in the browser. */

const characters = buildCharacterTable([
  { id: 'a', name: 'Alif', ledger: 'CHR-GEN-A', portrait: null },
  { id: 'b', name: 'Ba', ledger: 'CHR-GEN-B', portrait: null },
]);

const say = (who: string, text: string, kind = 'dramatized') => ({ say: { who, text, kind } });
const make = (cmds: unknown[], options: { settings?: Partial<Settings>; wrap?: (t: string) => string[] } = {}) => {
  const effects: Effect[] = [];
  const scene = validateScene({ id: 'test.scene', title: 'Test', ledger: [], cmds }, { characters });
  const player = new DialoguePlayer({
    scene,
    characters,
    assets: { has: () => false } as unknown as Assets,
    text: { wrap: options.wrap ?? ((t: string) => [t]), width: () => 1 } as unknown as TextRenderer,
    settings: { ...DEFAULT_SETTINGS, textSpeed: 'instant', ...options.settings },
    onEffect: (e) => effects.push(e),
  });
  return { player, effects };
};
const press = (player: DialoguePlayer, ...actions: Action[]): void => {
  for (const a of actions) player.update(16, new Set<Action>([a]), []);
};
const state = (player: DialoguePlayer): { kind: string; page?: number; shown?: number; line?: { text: string } } => (player as unknown as { state: { kind: string } }).state;

describe('reading', () => {
  it('moves from line to line with Confirm, and is done after the last', () => {
    const { player } = make([say('a', 'One.'), say('b', 'Two.')]);
    expect(player.done).toBe(false);
    expect(state(player).line?.text).toBe('One.');
    press(player, 'confirm');
    expect(state(player).line?.text).toBe('Two.');
    press(player, 'confirm');
    expect(player.done).toBe(true);
  });

  it('a tap counts as Confirm', () => {
    const { player } = make([say('a', 'One.'), say('b', 'Two.')]);
    player.update(16, new Set(), [{ x: 10, y: 10 }]);
    expect(state(player).line?.text).toBe('Two.');
  });

  it('the first press completes a line that is still being typed, the second moves on', () => {
    const { player } = make([say('a', 'abcdefghij'), say('b', 'Two.')], { settings: { textSpeed: 'normal' } });
    expect(state(player).shown).toBe(0);
    player.update(100, new Set(), []); // about four characters at 45 a second
    expect(Math.floor(state(player).shown ?? 0)).toBe(4);
    press(player, 'confirm');
    expect(state(player).shown).toBe(10);
    expect(state(player).line?.text).toBe('abcdefghij');
    press(player, 'confirm');
    expect(state(player).line?.text).toBe('Two.');
  });

  it('shows a slow speed more slowly than a fast one', () => {
    const at = (speed: Settings['textSpeed']) => {
      const { player } = make([say('a', 'x'.repeat(200))], { settings: { textSpeed: speed } });
      player.update(500, new Set(), []);
      return state(player).shown ?? 0;
    };
    expect(at('slow')).toBeLessThan(at('normal'));
    expect(at('normal')).toBeLessThan(at('fast'));
    expect(at('instant')).toBe(200);
  });

  it('splits a long line into pages that Confirm turns, with nothing lost', () => {
    const { player } = make([say('a', 'l1|l2|l3|l4|l5'), say('b', 'Next.')], { wrap: (t) => t.split('|') });
    expect(state(player)).toMatchObject({ kind: 'reading', page: 0 });
    press(player, 'confirm'); // completes page one (instant: already complete) and turns it
    expect(state(player)).toMatchObject({ page: 1 });
    press(player, 'confirm');
    expect(state(player).line?.text).toBe('Next.');
  });
});

describe('waiting', () => {
  it('pauses for the time asked and goes on by itself, or at once on Confirm', () => {
    const { player } = make([say('a', 'One.'), { wait: 300 }, say('b', 'Two.')]);
    press(player, 'confirm');
    expect(state(player).kind).toBe('waiting');
    player.update(200, new Set(), []);
    expect(state(player).kind).toBe('waiting');
    player.update(150, new Set(), []);
    expect(state(player).line?.text).toBe('Two.');

    const hasty = make([{ wait: 5000 }, say('b', 'Two.')]).player;
    expect(state(hasty).kind).toBe('waiting');
    press(hasty, 'confirm');
    expect(state(hasty).line?.text).toBe('Two.');
  });
});

describe('effects', () => {
  it('hands on flags and unlocks as the scene reaches them', () => {
    const { player, effects } = make([{ flag: 'first' }, say('a', 'One.'), { unlock: 'CDX-X' }, say('b', 'Two.'), { flag: 'last' }]);
    expect(effects).toEqual([{ flag: 'first' }]);
    press(player, 'confirm');
    expect(effects).toEqual([{ flag: 'first' }, { unlock: 'CDX-X' }]);
    press(player, 'confirm');
    expect(effects).toEqual([{ flag: 'first' }, { unlock: 'CDX-X' }, { flag: 'last' }]);
    expect(player.done).toBe(true);
  });

  it('skipping with Menu ends the scene at once, and still raises everything the rest of it would have', () => {
    const { player, effects } = make([say('a', 'One.'), { flag: 'x' }, say('b', 'Two.'), { unlock: 'CDX-Y' }]);
    press(player, 'menu');
    expect(player.done).toBe(true);
    expect(effects).toEqual([{ flag: 'x' }, { unlock: 'CDX-Y' }]);
  });

  it('a scene that is only effects is over as soon as it is made', () => {
    const { player, effects } = make([{ flag: 'x' }]);
    expect(player.done).toBe(true);
    expect(effects).toEqual([{ flag: 'x' }]);
  });
});

describe('the backlog', () => {
  it('opens with Info, holds the lines shown so far, and closes where it left off', () => {
    const { player } = make([say('a', 'One.'), say('b', 'Two.'), say('a', 'Three.')]);
    press(player, 'confirm', 'confirm');
    expect(player.backlog.map((l) => l.text)).toEqual(['One.', 'Two.', 'Three.']);
    press(player, 'info');
    expect(state(player).kind).toBe('backlog');
    press(player, 'up', 'down', 'cancel');
    expect(state(player)).toMatchObject({ kind: 'reading' });
    expect(state(player).line?.text).toBe('Three.');
    press(player, 'info', 'info');
    expect(state(player).kind).toBe('reading');
  });

  it('does not let a confirm in the backlog move the scene on', () => {
    const { player } = make([say('a', 'One.'), say('b', 'Two.')]);
    press(player, 'info', 'confirm');
    expect(state(player).line?.text).toBe('One.');
  });
});
