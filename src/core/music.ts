/**
 * Placeholder music and sound effects as data (DESIGN §13). A song is a tempo, some instruments,
 * patterns written as note names and lengths, and an order list with a loop point; a sound effect
 * is a short run of notes on one voice. This module validates them and works out when each note
 * sounds, so the synthesiser in `engine/audio.ts` only has to play a list of notes.
 */

/** The four voices of the chiptune tradition. */
export const VOICES = ['pulse', 'triangle', 'noise'] as const;
export type Voice = (typeof VOICES)[number];

/** Pulse duty cycles the synthesiser builds. */
export const DUTIES = [0.125, 0.25, 0.5] as const;

export interface Instrument {
  readonly voice: Voice;
  /** Pulse only. */
  readonly duty?: number;
  /** Seconds. */
  readonly attack: number;
  readonly decay: number;
  /** Level held after the decay, 0 to 1. */
  readonly sustain: number;
  readonly release: number;
  /** 0 to 1. */
  readonly volume: number;
}

/** One note or rest of a sequence; `note` is null for a rest. Lengths are in steps. */
export interface Step {
  readonly note: string | null;
  readonly steps: number;
}

export interface Song {
  readonly id: string;
  /** Beats per minute. */
  readonly tempo: number;
  /** Steps in a beat: 4 makes a step a sixteenth note. */
  readonly stepsPerBeat: number;
  readonly instruments: Readonly<Record<string, Instrument>>;
  /** Pattern name → instrument name → sequence. Every sequence in a pattern has the same length. */
  readonly patterns: Readonly<Record<string, Readonly<Record<string, readonly Step[]>>>>;
  readonly order: readonly string[];
  /** The place in the order the song returns to at its end; absent for a song that plays once. */
  readonly loopFrom?: number;
}

export interface SfxDef {
  readonly id: string;
  readonly voice: Voice;
  readonly duty?: number;
  readonly volume: number;
  /** Glide from each note to the next instead of stepping. */
  readonly slide?: boolean;
  /** Notes and their lengths in seconds; a noise voice ignores the pitch. */
  readonly notes: ReadonlyArray<{ readonly note: string; readonly dur: number }>;
}

/** What the project never synthesises or uses as an effect (DESIGN §13, DECISIONS D-004). */
const DENIED_AUDIO_WORDS = ['adhan', 'azan', 'takbir', 'quran', 'recitation', 'tilawa'];

function deniedAudioWord(id: string): string | null {
  const lower = id.toLowerCase();
  return DENIED_AUDIO_WORDS.find((w) => lower.includes(w)) ?? null;
}

// ------------------------------------------------------------------ notes

const NOTE = /^([A-G])(#|b)?(-?\d)$/;
const SEMITONES: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Equal temperament, A4 = 440 Hz. Throws on a name that is not a note. */
export function noteFrequency(name: string): number {
  const m = NOTE.exec(name);
  if (!m) throw new Error(`"${name}" is not a note (try C4, F#3 or Bb2)`);
  const semitone = (SEMITONES[m[1] as string] as number) + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const midi = (Number(m[3]) + 1) * 12 + semitone;
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * Read a sequence written as `NOTE:steps` tokens separated by spaces, with `-` for a rest and `x`
 * for a drum hit (any pitch will do for noise). `|` marks a bar for the reader and is ignored.
 */
export function parseSequence(text: string, where = 'sequence'): Step[] {
  const out: Step[] = [];
  for (const token of text.split(/\s+/).filter((t) => t !== '' && t !== '|')) {
    const [name, length] = token.split(':');
    const steps = Number(length);
    if (!name || !Number.isInteger(steps) || steps < 1) throw new Error(`${where}: "${token}" should be NOTE:steps, such as D4:2 or -:4`);
    if (name === '-') out.push({ note: null, steps });
    else if (name === 'x') out.push({ note: 'C4', steps });
    else {
      noteFrequency(name);
      out.push({ note: name, steps });
    }
  }
  return out;
}

const length = (seq: readonly Step[]): number => seq.reduce((n, s) => n + s.steps, 0);

// ------------------------------------------------------------------ validation

function readInstrument(raw: unknown, where: string): Instrument {
  const r = raw as Partial<Instrument> & Record<string, unknown>;
  if (typeof raw !== 'object' || raw === null) throw new Error(`${where} must be an object`);
  if (!VOICES.includes(r.voice as Voice)) throw new Error(`${where}.voice must be one of ${VOICES.join(', ')}`);
  if (r.voice === 'pulse' && !DUTIES.includes(r.duty as (typeof DUTIES)[number])) throw new Error(`${where}.duty must be one of ${DUTIES.join(', ')}`);
  for (const key of ['attack', 'decay', 'release'] as const) {
    const v = r[key];
    if (typeof v !== 'number' || v < 0 || v > 2) throw new Error(`${where}.${key} must be seconds between 0 and 2`);
  }
  for (const key of ['sustain', 'volume'] as const) {
    const v = r[key];
    if (typeof v !== 'number' || v < 0 || v > 1) throw new Error(`${where}.${key} must be between 0 and 1`);
  }
  return r as Instrument;
}

/** Validate a song from JSON. Patterns may be written as strings; they are parsed here. Throws a descriptive error. */
export function validateSong(raw: unknown): Song {
  const r = raw as Record<string, unknown>;
  if (typeof raw !== 'object' || raw === null) throw new Error('A song must be an object');
  const where = `Song "${String(r.id)}"`;
  if (typeof r.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(r.id)) throw new Error(`${where}: id must be lower-case words joined by hyphens`);
  const denied = deniedAudioWord(r.id);
  if (denied) throw new Error(`${where}: "${denied}" is never synthesised (DECISIONS D-004)`);
  if (typeof r.tempo !== 'number' || r.tempo < 30 || r.tempo > 300) throw new Error(`${where}: tempo must be 30 to 300 beats a minute`);
  const stepsPerBeat = r.stepsPerBeat ?? 4;
  if (!Number.isInteger(stepsPerBeat) || (stepsPerBeat as number) < 1) throw new Error(`${where}: stepsPerBeat must be a whole number`);
  const instruments: Record<string, Instrument> = {};
  for (const [name, def] of Object.entries((r.instruments ?? {}) as Record<string, unknown>)) instruments[name] = readInstrument(def, `${where}: instrument "${name}"`);
  if (Object.keys(instruments).length === 0) throw new Error(`${where}: needs at least one instrument`);
  if (Object.keys(instruments).length > 4) throw new Error(`${where}: four voices at most`);
  const patterns: Record<string, Record<string, Step[]>> = {};
  for (const [name, tracks] of Object.entries((r.patterns ?? {}) as Record<string, Record<string, unknown>>)) {
    const parsed: Record<string, Step[]> = {};
    let bars: number | null = null;
    for (const [instrument, seq] of Object.entries(tracks)) {
      if (!instruments[instrument]) throw new Error(`${where}: pattern "${name}" plays unknown instrument "${instrument}"`);
      if (typeof seq !== 'string') throw new Error(`${where}: pattern "${name}" track "${instrument}" must be a string of notes`);
      const steps = parseSequence(seq, `${where}: pattern "${name}" track "${instrument}"`);
      const n = length(steps);
      if (bars !== null && n !== bars) throw new Error(`${where}: pattern "${name}" track "${instrument}" lasts ${n} steps, the others ${bars}`);
      bars = n;
      parsed[instrument] = steps;
    }
    if (bars === null) throw new Error(`${where}: pattern "${name}" is empty`);
    patterns[name] = parsed;
  }
  const order = r.order as unknown[];
  if (!Array.isArray(order) || order.length === 0) throw new Error(`${where}: order must list the patterns to play`);
  for (const p of order) if (typeof p !== 'string' || !patterns[p]) throw new Error(`${where}: order names unknown pattern "${String(p)}"`);
  if (r.loopFrom !== undefined && (!Number.isInteger(r.loopFrom) || (r.loopFrom as number) < 0 || (r.loopFrom as number) >= order.length)) {
    throw new Error(`${where}: loopFrom must be a place in the order`);
  }
  return {
    id: r.id,
    tempo: r.tempo,
    stepsPerBeat: stepsPerBeat as number,
    instruments,
    patterns,
    order: order as string[],
    ...(r.loopFrom === undefined ? {} : { loopFrom: r.loopFrom as number }),
  };
}

export function validateSfx(raw: unknown): SfxDef {
  const r = raw as Partial<SfxDef> & Record<string, unknown>;
  if (typeof raw !== 'object' || raw === null) throw new Error('A sound effect must be an object');
  const where = `Sound "${String(r.id)}"`;
  if (typeof r.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(r.id)) throw new Error(`${where}: id must be lower-case words joined by hyphens`);
  const denied = deniedAudioWord(r.id);
  if (denied) throw new Error(`${where}: "${denied}" is never synthesised (DECISIONS D-004)`);
  if (!VOICES.includes(r.voice as Voice)) throw new Error(`${where}: voice must be one of ${VOICES.join(', ')}`);
  if (r.voice === 'pulse' && !DUTIES.includes(r.duty as (typeof DUTIES)[number])) throw new Error(`${where}: duty must be one of ${DUTIES.join(', ')}`);
  if (typeof r.volume !== 'number' || r.volume < 0 || r.volume > 1) throw new Error(`${where}: volume must be between 0 and 1`);
  if (!Array.isArray(r.notes) || r.notes.length === 0) throw new Error(`${where}: needs notes`);
  for (const n of r.notes) {
    noteFrequency(String(n.note));
    if (typeof n.dur !== 'number' || n.dur <= 0 || n.dur > 3) throw new Error(`${where}: each note lasts between 0 and 3 seconds`);
  }
  return r as SfxDef;
}

// ------------------------------------------------------------------ timing

/** One note to play: when (seconds from the start of the pass), on which instrument, how high and how long. */
export interface NoteEvent {
  readonly time: number;
  readonly instrument: string;
  readonly freq: number;
  readonly duration: number;
}

export interface Timeline {
  readonly events: readonly NoteEvent[];
  /** Seconds the whole order lasts. */
  readonly length: number;
  /** Where a looping song goes back to, in seconds; null if it plays once. */
  readonly loopStart: number | null;
}

/** Every note of one pass through the order, in time order. */
export function songTimeline(song: Song): Timeline {
  const stepSeconds = 60 / song.tempo / song.stepsPerBeat;
  const events: NoteEvent[] = [];
  let t = 0;
  let loopStart: number | null = null;
  song.order.forEach((name, index) => {
    if (index === song.loopFrom) loopStart = t;
    const pattern = song.patterns[name] ?? {};
    let patternSteps = 0;
    for (const [instrument, steps] of Object.entries(pattern)) {
      let at = 0;
      for (const step of steps) {
        if (step.note !== null) events.push({ time: t + at * stepSeconds, instrument, freq: noteFrequency(step.note), duration: step.steps * stepSeconds });
        at += step.steps;
      }
      patternSteps = at;
    }
    t += patternSteps * stepSeconds;
  });
  events.sort((a, b) => a.time - b.time || a.instrument.localeCompare(b.instrument));
  return { events, length: t, loopStart };
}
