import { describe, expect, it } from 'vitest';
import type { Action } from '../src/core/input';
import { LOGICAL_HEIGHT } from '../src/core/viewport';
import type { TextRenderer } from '../src/engine/text';
import { PageScene, paginate } from '../src/scenes/storyScene';

/** A page of words never loses one: what does not fit goes on to the next page. */

/** Rows of at most `width` characters, broken at spaces, as the real renderer breaks them by pixels. */
const text = {
  wrap: (s: string, maxPx: number): string[] => {
    const width = Math.floor(maxPx / 6);
    const rows: string[] = [];
    let row = '';
    for (const word of s.split(' ')) {
      if (row !== '' && row.length + 1 + word.length > width) {
        rows.push(row);
        row = word;
      } else row = row === '' ? word : `${row} ${word}`;
    }
    if (row !== '') rows.push(row);
    return rows;
  },
} as unknown as TextRenderer;

const sentence = 'The road goes on from the boats at Tikrit to the streets of Cairo and the Codex says what the sources say. ';
const long = [sentence.repeat(2), '', sentence.repeat(3), '', sentence.repeat(2)];

describe('paginate', () => {
  it('keeps every row, in order, and puts a gap only between rows of one page', () => {
    const pages = paginate(text, long);
    expect(pages.length).toBeGreaterThan(1);
    const rows = pages.flat().filter((r) => r !== '');
    expect(rows).toEqual(long.filter((p) => p !== '').flatMap((p) => text.wrap(p, 212)));
    for (const page of pages) {
      expect(page[0]).not.toBe('');
      expect(page[page.length - 1]).not.toBe('');
    }
  });

  it('fills a page only as far as the hint at its foot', () => {
    for (const page of paginate(text, long)) {
      const height = page.reduce((h, row) => h + (row === '' ? 5 : 10), 0);
      expect(30 + height - 10 + 8, 'the last row ends above the hint').toBeLessThanOrEqual(LOGICAL_HEIGHT - 14);
    }
  });

  it('leaves a short page whole', () => {
    expect(paginate(text, ['A line.', '', 'Another.'])).toEqual([['A line.', '', 'Another.']]);
  });
});

describe('a page scene', () => {
  const press = (scene: PageScene, ms: number, ...actions: Action[]): void => scene.update(ms, new Set(actions), []);

  it('turns the page on each confirm and is done only after the last', () => {
    let done = 0;
    const scene = new PageScene({ text, title: 'The road goes on', lines: long, onDone: () => (done += 1) });
    const pages = paginate(text, long).length;
    press(scene, 100, 'confirm');
    expect(done, 'a press at once is ignored').toBe(0);
    for (let page = 1; page < pages; page++) {
      press(scene, 500, 'confirm');
      expect(done).toBe(0);
    }
    press(scene, 500, 'confirm');
    expect(done).toBe(1);
    press(scene, 500, 'confirm');
    expect(done, 'and only once').toBe(1);
  });

  it('does not turn two pages on one press held down', () => {
    let done = 0;
    const scene = new PageScene({ text, title: 't', lines: long, onDone: () => (done += 1) });
    press(scene, 500, 'confirm');
    press(scene, 16, 'confirm');
    press(scene, 16, 'confirm');
    expect(done).toBe(0);
  });

  it('is taken forward by a tap', () => {
    let done = 0;
    const scene = new PageScene({ text, title: 't', lines: ['One page.'], onDone: () => (done += 1) });
    scene.update(500, new Set(), [{ x: 10, y: 10 }]);
    expect(done).toBe(1);
  });
});
