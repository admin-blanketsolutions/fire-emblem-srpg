import { describe, expect, it } from 'vitest';
import { noteFrequency, parseSequence, songTimeline, validateSfx, validateSong } from '../src/core/music';
import { EFFECTS, SONGS } from '../src/engine/audio';

const inst = { voice: 'pulse', duty: 0.25, attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.05, volume: 0.4 };
const song = (over: Record<string, unknown> = {}) => ({
  id: 'test',
  tempo: 120,
  instruments: { lead: inst, bass: { ...inst, voice: 'triangle', duty: undefined } },
  patterns: { a: { lead: 'A4:2 -:2 C5:4', bass: 'A2:8' }, b: { lead: 'E5:8', bass: 'E2:8' } },
  order: ['a', 'b'],
  loopFrom: 1,
  ...over,
});

describe('notes and sequences', () => {
  it('tunes A4 to 440 Hz in equal temperament', () => {
    expect(noteFrequency('A4')).toBeCloseTo(440, 6);
    expect(noteFrequency('A5')).toBeCloseTo(880, 6);
    expect(noteFrequency('C4')).toBeCloseTo(261.626, 2);
    expect(noteFrequency('F#3')).toBeCloseTo(noteFrequency('Gb3'), 9);
    expect(() => noteFrequency('H2')).toThrow(/not a note/);
  });

  it('reads notes, rests, drum hits and bar lines', () => {
    expect(parseSequence('D4:2 -:2 | x:4')).toEqual([
      { note: 'D4', steps: 2 },
      { note: null, steps: 2 },
      { note: 'C4', steps: 4 },
    ]);
    expect(() => parseSequence('D4')).toThrow(/NOTE:steps/);
    expect(() => parseSequence('D4:0')).toThrow(/NOTE:steps/);
  });
});

describe('songs', () => {
  it('times every note, and knows where the loop begins', () => {
    const timeline = songTimeline(validateSong(song()));
    const step = 60 / 120 / 4; // a sixteenth at 120 beats a minute
    expect(timeline.length).toBeCloseTo(16 * step, 9);
    expect(timeline.loopStart).toBeCloseTo(8 * step, 9);
    expect(timeline.events.map((e) => [e.instrument, Math.round(e.time / step), Math.round(e.duration / step)])).toEqual([
      ['bass', 0, 8],
      ['lead', 0, 2],
      ['lead', 4, 4],
      ['bass', 8, 8],
      ['lead', 8, 8],
    ]);
  });

  it('refuses a song that cannot be played as written', () => {
    expect(() => validateSong(song({ patterns: { a: { lead: 'A4:4', bass: 'A2:8' } }, order: ['a'], loopFrom: undefined }))).toThrow(/lasts \d+ steps, the others \d+/);
    expect(() => validateSong(song({ order: ['a', 'c'] }))).toThrow(/unknown pattern "c"/);
    expect(() => validateSong(song({ loopFrom: 5 }))).toThrow(/loopFrom/);
    expect(() => validateSong(song({ instruments: { lead: { ...inst, duty: 0.3 } } }))).toThrow(/duty/);
    expect(() => validateSong(song({ patterns: { a: { drums: 'x:8' } }, order: ['a'], loopFrom: undefined }))).toThrow(/unknown instrument "drums"/);
  });

  it('never synthesises the call to prayer or recitation (DESIGN §13)', () => {
    expect(() => validateSong(song({ id: 'adhan-at-dawn' }))).toThrow(/never synthesised/);
    expect(() => validateSfx({ id: 'takbir', voice: 'noise', volume: 0.5, notes: [{ note: 'C3', dur: 0.2 }] })).toThrow(/never synthesised/);
  });

  it('has every placeholder song the design names, and they loop where they should', () => {
    for (const id of ['title', 'camp', 'player-phase', 'enemy-phase', 'story', 'victory', 'defeat']) expect(SONGS.has(id), id).toBe(true);
    for (const id of ['title', 'camp', 'player-phase', 'enemy-phase', 'story']) expect(SONGS.get(id)?.loopFrom, id).toBeDefined();
    for (const id of ['victory', 'defeat']) expect(SONGS.get(id)?.loopFrom, id).toBeUndefined();
    for (const s of SONGS.values()) expect(songTimeline(s).events.length, s.id).toBeGreaterThan(0);
  });

  it('has every sound effect the game plays', () => {
    const played = ['cursor', 'confirm', 'cancel', 'hit', 'critical', 'miss', 'heal', 'level-up', 'promotion', 'support', 'structure-break', 'defeat'];
    for (const id of played) expect(EFFECTS.has(id), id).toBe(true);
  });
});
