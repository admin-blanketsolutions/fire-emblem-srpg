import { DUTIES, noteFrequency, songTimeline, validateSfx, validateSong, type Instrument, type SfxDef, type Song, type Timeline } from '../core/music';

/**
 * The placeholder sound (DESIGN §13): a small WebAudio synthesiser with two pulse voices, a
 * triangle and noise, an ADSR envelope per note, and a lookahead scheduler for the songs. Real
 * recordings replace any song or sound by id through `assets/override/audio/manifest.json`.
 *
 * Browsers start audio only after the player has pressed something, so nothing is created until
 * `unlock()` is called from the first key press or tap. Until then, and wherever WebAudio is
 * missing (the tests), every call does nothing.
 */

const SONG_MODULES = import.meta.glob<unknown>('../../assets/music/*.song.json', { eager: true, import: 'default' });
const SFX_MODULES = import.meta.glob<unknown>('../../assets/sfx/*.json', { eager: true, import: 'default' });

/** Every song and sound effect, validated once when the module loads. */
export const SONGS: ReadonlyMap<string, Song> = new Map(Object.values(SONG_MODULES).map((raw) => {
  const song = validateSong(raw);
  return [song.id, song] as const;
}));

export const EFFECTS: ReadonlyMap<string, SfxDef> = new Map(
  Object.values(SFX_MODULES)
    .flatMap((list) => (Array.isArray(list) ? list : [list]))
    .map((raw) => {
      const sfx = validateSfx(raw);
      return [sfx.id, sfx] as const;
    }),
);

/** How far ahead notes are handed to WebAudio, and how often the scheduler looks. */
const LOOKAHEAD_S = 0.2;
const TICK_MS = 50;

interface Playing {
  readonly id: string;
  readonly song: Song;
  readonly timeline: Timeline;
  /** Context time at which the current pass through the order began. */
  passStart: number;
  /** The next event of the timeline to schedule. */
  next: number;
  /** A recording from the override manifest, playing instead of the synthesiser. */
  source: AudioBufferSourceNode | null;
}

interface Manifest {
  readonly music?: Readonly<Record<string, string>>;
  readonly sfx?: Readonly<Record<string, string>>;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private music: GainNode | null = null;
  private effects: GainNode | null = null;
  private readonly waves = new Map<number, PeriodicWave>();
  private noise: AudioBuffer | null = null;
  private playing: Playing | null = null;
  /** The song asked for before audio was unlocked, to start once it is. */
  private wanted: string | null = null;
  private volumes = { music: 0.6, sfx: 0.8 };
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly recordings = { music: new Map<string, AudioBuffer>(), sfx: new Map<string, AudioBuffer>() };

  constructor(private readonly overrideBase = 'assets/override/audio/') {}

  /** Create or resume the audio context. Call from a user gesture; safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.music = ctx.createGain();
    this.effects = ctx.createGain();
    this.music.connect(ctx.destination);
    this.effects.connect(ctx.destination);
    this.applyVolumes();
    this.noise = makeNoise(ctx);
    for (const duty of DUTIES) this.waves.set(duty, pulseWave(ctx, duty));
    this.timer = setInterval(() => this.tick(), TICK_MS);
    void this.loadOverrides();
    const wanted = this.wanted;
    this.wanted = null;
    if (wanted) this.playMusic(wanted);
  }

  setVolumes(music: number, sfx: number): void {
    this.volumes = { music, sfx };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (this.music) this.music.gain.value = this.volumes.music;
    if (this.effects) this.effects.gain.value = this.volumes.sfx;
  }

  /** Start a song by id (a song already playing carries on), or stop the music with null. */
  playMusic(id: string | null): void {
    if (!this.ctx) {
      this.wanted = id;
      return;
    }
    if (this.playing?.id === id) return;
    this.stopMusic();
    if (id === null) return;
    const recording = this.recordings.music.get(id);
    const song = SONGS.get(id);
    if (!song && !recording) return;
    const ctx = this.ctx;
    let source: AudioBufferSourceNode | null = null;
    if (recording && this.music) {
      source = ctx.createBufferSource();
      source.buffer = recording;
      source.loop = song?.loopFrom !== undefined;
      source.connect(this.music);
      source.start();
    }
    const fallback: Song = song ?? { id, tempo: 60, stepsPerBeat: 4, instruments: {}, patterns: {}, order: [] };
    this.playing = { id, song: fallback, timeline: song ? songTimeline(song) : { events: [], length: 0, loopStart: null }, passStart: ctx.currentTime + 0.05, next: 0, source };
  }

  private stopMusic(): void {
    const playing = this.playing;
    this.playing = null;
    if (!playing || !this.ctx || !this.music) return;
    playing.source?.stop();
    // notes already handed to WebAudio would ring on: fade the music bus and give the next song a fresh one
    const old = this.music;
    old.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    setTimeout(() => old.disconnect(), 400);
    this.music = this.ctx.createGain();
    this.music.connect(this.ctx.destination);
    this.applyVolumes();
  }

  /** Play a sound effect by id. */
  playSfx(id: string): void {
    const ctx = this.ctx;
    const bus = this.effects;
    if (!ctx || !bus) return;
    const recording = this.recordings.sfx.get(id);
    if (recording) {
      const source = ctx.createBufferSource();
      source.buffer = recording;
      source.connect(bus);
      source.start();
      return;
    }
    const def = EFFECTS.get(id);
    if (!def) return;
    const instrument: Instrument = { voice: def.voice, ...(def.duty === undefined ? {} : { duty: def.duty }), attack: 0.005, decay: 0.02, sustain: 0.9, release: 0.03, volume: def.volume };
    let t = ctx.currentTime;
    if (def.slide && def.notes.length > 1) {
      const total = def.notes.reduce((n, x) => n + x.dur, 0);
      const freqs = def.notes.map((n) => noteFrequency(n.note));
      this.voice(bus, instrument, freqs[0] ?? 440, t, total, freqs);
      return;
    }
    for (const n of def.notes) {
      this.voice(bus, instrument, noteFrequency(n.note), t, n.dur);
      t += n.dur;
    }
  }

  /** Hand WebAudio the notes due in the next moment; loop or end the song at the end of its order. */
  private tick(): void {
    const ctx = this.ctx;
    const p = this.playing;
    const bus = this.music;
    if (!ctx || !p || !bus || p.source) return;
    const horizon = ctx.currentTime + LOOKAHEAD_S;
    const { events, length, loopStart } = p.timeline;
    for (let guard = 0; guard < 2000; guard++) {
      const event = events[p.next];
      if (!event) {
        if (loopStart === null || length <= 0) {
          if (p.passStart + length < ctx.currentTime) this.playing = null;
          return;
        }
        p.passStart += length - loopStart;
        p.next = events.findIndex((e) => e.time >= loopStart);
        if (p.next < 0) return;
        continue;
      }
      const at = p.passStart + event.time;
      if (at > horizon) return;
      const instrument = p.song.instruments[event.instrument];
      if (instrument && at >= ctx.currentTime - 0.01) this.voice(bus, instrument, event.freq, at, event.duration * 0.92);
      p.next += 1;
    }
  }

  /** One note: an oscillator (or noise) through an ADSR envelope. With `glide`, the pitch moves through those frequencies. */
  private voice(bus: GainNode, inst: Instrument, freq: number, at: number, duration: number, glide?: readonly number[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const env = ctx.createGain();
    env.connect(bus);
    const peak = inst.volume;
    const sustainLevel = peak * inst.sustain;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + inst.attack);
    env.gain.linearRampToValueAtTime(Math.max(sustainLevel, 0.0001), at + inst.attack + inst.decay);
    const end = at + Math.max(duration, inst.attack + inst.decay);
    env.gain.setValueAtTime(Math.max(sustainLevel, 0.0001), end);
    env.gain.linearRampToValueAtTime(0, end + inst.release);
    const stopAt = end + inst.release + 0.02;

    if (inst.voice === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.connect(env);
      src.start(at);
      src.stop(stopAt);
      return;
    }
    const osc = ctx.createOscillator();
    if (inst.voice === 'pulse') {
      const wave = this.waves.get(inst.duty ?? 0.5);
      if (wave) osc.setPeriodicWave(wave);
    } else {
      osc.type = 'triangle';
    }
    osc.frequency.setValueAtTime(freq, at);
    if (glide && glide.length > 1) glide.slice(1).forEach((f, i) => osc.frequency.linearRampToValueAtTime(f, at + (duration * (i + 1)) / (glide.length - 1)));
    osc.connect(env);
    osc.start(at);
    osc.stop(stopAt);
  }

  /** Read the override manifest, if there is one, and decode its recordings. Missing files are skipped. */
  private async loadOverrides(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || typeof fetch !== 'function') return;
    let manifest: Manifest;
    try {
      const response = await fetch(`${this.overrideBase}manifest.json`);
      if (!response.ok) return;
      manifest = (await response.json()) as Manifest;
    } catch {
      return;
    }
    for (const kind of ['music', 'sfx'] as const) {
      for (const [id, file] of Object.entries(manifest[kind] ?? {})) {
        try {
          const data = await (await fetch(`${this.overrideBase}${file}`)).arrayBuffer();
          this.recordings[kind].set(id, await ctx.decodeAudioData(data));
        } catch (error) {
          console.warn(`Audio override "${id}" (${file}) could not be loaded`, error);
        }
      }
    }
    // a song already playing switches to its recording
    const id = this.playing?.id ?? null;
    if (id && this.recordings.music.has(id)) {
      this.playing = null;
      this.playMusic(id);
    }
  }

  /** Stop everything (for tearing down). */
  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.ctx?.close();
    this.ctx = null;
  }
}

/** A pulse wave of the given duty cycle, from its Fourier series. */
function pulseWave(ctx: AudioContext, duty: number): PeriodicWave {
  const n = 64;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return ctx.createPeriodicWave(real, imag);
}

/** One second of white noise, looped by each noise note. Random numbers are fine here: this is sound, not game state. */
function makeNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** The game's one audio engine. */
export const audio = new AudioEngine();
