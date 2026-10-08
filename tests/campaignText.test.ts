import { describe, expect, it } from 'vitest';
import fontJson from '../assets/fonts/majlis.font.json';
import { plateName } from '../src/core/characters';
import { validateFont, wrapText } from '../src/core/font';
import { stringsIn } from '../src/core/sensitive';
import { campaignMapJson } from '../src/data/campaign';
import { STORIES } from '../src/data/battles';

/**
 * The words of the campaign, checked against the screen they are shown on: every character has a
 * glyph in the font (a missing one would be drawn as "?"), every spoken line fits the dialogue box
 * in at most three pages, every plate fits its place, and the messages a chapter's events show fit
 * the window they are shown in.
 */

const font = validateFont(fontJson, 'majlis.font.json');
const story = STORIES.campaign;

/** Width of the dialogue box's text (224 less the margins), and of the battle message window. */
const DIALOGUE_WIDTH = 208;
const MESSAGE_WIDTH = 190;

const everyString = (): Array<{ where: string; text: string }> => {
  const out: Array<{ where: string; text: string }> = [];
  const add = (where: string, value: unknown): void => {
    for (const { path, text } of stringsIn(value)) out.push({ where: `${where} ${path}`, text });
  };
  for (const c of story.characters.values()) add(`character ${c.id}`, [c.name, c.short ?? '']);
  for (const s of story.scenes.values()) add(`scene ${s.id}`, [s.title, ...s.cmds.flatMap((cmd) => ('say' in cmd ? [cmd.say.text] : []))]);
  for (const e of story.codex.values()) add(`codex ${e.id}`, { title: e.title, body: e.body, differ: e.differ ?? [] });
  for (const c of story.chapters.values()) add(`chapter ${c.id}`, [c.title, c.date, ...c.steps.flatMap((s) => (s.kind === 'card' ? [s.title ?? '', s.date ?? ''] : []))]);
  for (const [id, m] of campaignMapJson) {
    add(`map ${id}`, m.name);
    for (const e of m.events ?? []) for (const a of e.then) if (a.type === 'message') add(`map ${id} event ${e.id}`, a.text);
  }
  return out;
};

describe('the words of the campaign', () => {
  it('use only characters the font can draw', () => {
    const missing = new Map<string, string>();
    for (const { where, text } of everyString()) {
      for (const ch of text) if (ch !== ' ' && !(ch in font.glyphs) && !missing.has(ch)) missing.set(ch, where);
    }
    expect([...missing].map(([ch, where]) => `${JSON.stringify(ch)} in ${where}`)).toEqual([]);
  });

  it('fit the dialogue box: no spoken line runs past three pages', () => {
    const long: string[] = [];
    for (const scene of story.scenes.values()) {
      for (const cmd of scene.cmds) {
        if (!('say' in cmd)) continue;
        const lines = wrapText(font, cmd.say.text.replace(/\{[a-z-]+\}/g, 'Wwwwwwwwwwww'), DIALOGUE_WIDTH).length;
        if (lines > 9) long.push(`${scene.id}: ${lines} lines: ${cmd.say.text.slice(0, 50)}…`);
      }
    }
    expect(long).toEqual([]);
  });

  it('keep every speaker’s plate narrow enough to sit in the box', () => {
    for (const c of story.characters.values()) {
      const width = [...plateName(c)].reduce((w, ch) => w + (font.glyphs[ch]?.[0]?.length ?? 0) + 1, 0);
      expect(width, `${c.id}: “${plateName(c)}”`).toBeLessThanOrEqual(100);
    }
  });

  it('show chapter messages that fit the message window', () => {
    for (const [id, m] of campaignMapJson) {
      for (const e of m.events ?? []) {
        for (const a of e.then) {
          if (a.type === 'message') expect(wrapText(font, a.text, MESSAGE_WIDTH).length, `${id} event ${e.id}`).toBeLessThanOrEqual(9);
          if (a.type === 'endChapter' && a.reason) expect(wrapText(font, a.reason, 200).length, `${id} reason`).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('give every title card a title that fits the screen in at most two lines', () => {
    for (const c of story.chapters.values()) {
      expect(wrapText(font, c.title, 208).length, c.id).toBeLessThanOrEqual(2);
      expect(wrapText(font, c.date, 208).length, `${c.id} date`).toBe(1);
    }
  });
});
