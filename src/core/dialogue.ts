import { NARRATOR, type CharacterTable } from './characters';
import { deniedWordIn, hasArabicScript, stringsIn } from './sensitive';

/**
 * Scenes are data (DESIGN §9.1): a list of commands that put people on the stage, have them
 * speak, and raise flags. Every spoken line says what it is: *documented* (a faithful paraphrase
 * of something a source records, ◆), *dramatized* (original connective dialogue, ◇) or
 * *narration*. A documented line must cite the ledger; the validator refuses one that does not.
 */

export const LINE_KINDS = ['documented', 'dramatized', 'narration'] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export const SLOTS = ['left', 'right', 'center'] as const;
export type Slot = (typeof SLOTS)[number];

export interface SayLine {
  readonly who: string;
  readonly text: string;
  readonly kind: LineKind;
  /** Ledger ids the line stands on. Required for a documented line. */
  readonly src?: readonly string[];
  /** A word for the portrait's expression; placeholders ignore it. */
  readonly mood?: string;
}

export type Cmd =
  | { readonly say: SayLine }
  | { readonly show: { readonly who: string; readonly at: Slot } }
  | { readonly hide: string }
  | { readonly bg: string }
  | { readonly music: string | null }
  | { readonly sfx: string }
  | { readonly wait: number }
  | { readonly flag: string }
  | { readonly unlock: string };

export interface SceneDef {
  readonly id: string;
  readonly title: string;
  /** The ledger rows the whole scene stands on: its chapter claims, or its `SUP-` row. */
  readonly ledger: readonly string[];
  readonly cmds: readonly Cmd[];
}

export type SceneTable = ReadonlyMap<string, SceneDef>;

const COMMANDS = ['say', 'show', 'hide', 'bg', 'music', 'sfx', 'wait', 'flag', 'unlock'] as const;

export interface SceneContext {
  readonly characters: CharacterTable;
  /** When given, every ledger id the scene cites must satisfy it (the lint passes the ledger here). */
  readonly knownLedgerId?: (id: string) => boolean;
}

/** Validate untrusted data as a scene. Throws a descriptive error naming the scene and the command. */
export function validateScene(raw: unknown, ctx: SceneContext, source = 'scene'): SceneDef {
  const s = raw as Partial<SceneDef> & Record<string, unknown>;
  if (!s || typeof s !== 'object') throw new Error(`${source}: must be an object`);
  const where = `${source}${typeof s.id === 'string' ? ` "${s.id}"` : ''}`;
  if (typeof s.id !== 'string' || !/^[a-z0-9]+([.-][a-z0-9]+)*$/.test(s.id)) throw new Error(`${where}: id must be lower-case words joined by dots or hyphens`);
  if (typeof s.title !== 'string' || s.title === '') throw new Error(`${where}: needs a title`);
  if (!Array.isArray(s.ledger) || !s.ledger.every((id) => typeof id === 'string')) throw new Error(`${where}: ledger must be a list of ledger ids`);
  if (!Array.isArray(s.cmds) || s.cmds.length === 0) throw new Error(`${where}: needs commands`);
  for (const { path, text } of stringsIn(s)) {
    if (hasArabicScript(text)) throw new Error(`${where}: ${path} contains Arabic script; text is written in Latin letters (DECISIONS D-005)`);
  }
  const known = (id: string): boolean => id === NARRATOR || ctx.characters.has(id);
  const checkLedger = (ids: readonly string[], label: string): void => {
    for (const id of ids) {
      if (typeof id !== 'string' || id === '') throw new Error(`${label}: a ledger id must be text`);
      if (ctx.knownLedgerId && !ctx.knownLedgerId(id)) throw new Error(`${label}: "${id}" is not in the ledger`);
    }
  };
  checkLedger(s.ledger, `${where}: ledger`);
  (s.cmds as unknown[]).forEach((cmd, i) => {
    const label = `${where}: command #${i}`;
    if (typeof cmd !== 'object' || cmd === null) throw new Error(`${label} must be an object`);
    const keys = Object.keys(cmd);
    const name = keys[0] as (typeof COMMANDS)[number] | undefined;
    if (keys.length !== 1 || !name || !COMMANDS.includes(name)) throw new Error(`${label} must be exactly one of ${COMMANDS.join(', ')} (got ${keys.join(', ') || 'nothing'})`);
    const arg = (cmd as Record<string, unknown>)[name];
    switch (name) {
      case 'say': {
        const line = arg as Partial<SayLine>;
        if (!line || typeof line !== 'object') throw new Error(`${label}: say needs a line`);
        if (typeof line.who !== 'string' || !known(line.who)) throw new Error(`${label}: "${String(line.who)}" is not a character`);
        if (typeof line.text !== 'string' || line.text.trim() === '') throw new Error(`${label}: say needs text`);
        if (!LINE_KINDS.includes(line.kind as LineKind)) throw new Error(`${label}: kind must be one of ${LINE_KINDS.join(', ')}`);
        if (line.kind === 'narration' && line.who !== NARRATOR) throw new Error(`${label}: narration is spoken by the narrator`);
        if (line.kind !== 'narration' && line.who === NARRATOR) throw new Error(`${label}: the narrator only narrates`);
        if (line.kind === 'documented' && (!Array.isArray(line.src) || line.src.length === 0)) {
          throw new Error(`${label}: a documented line must cite the ledger in src (no fabricated quotes)`);
        }
        if (line.src !== undefined) {
          if (!Array.isArray(line.src)) throw new Error(`${label}: src must be a list`);
          checkLedger(line.src, label);
          const unverified = line.src.find((id) => id.startsWith('UNV-') || id.startsWith('EXC-'));
          if (unverified) throw new Error(`${label}: "${unverified}" is unverified or excluded and cannot back a line`);
        }
        break;
      }
      case 'show': {
        const a = arg as { who?: unknown; at?: unknown };
        if (typeof a?.who !== 'string' || !ctx.characters.has(a.who)) throw new Error(`${label}: show needs a known character`);
        if (!SLOTS.includes(a.at as Slot)) throw new Error(`${label}: show needs at: ${SLOTS.join(', ')}`);
        break;
      }
      case 'hide':
        if (typeof arg !== 'string' || !ctx.characters.has(arg)) throw new Error(`${label}: hide needs a known character`);
        break;
      case 'bg':
      case 'sfx':
      case 'flag':
      case 'unlock':
        if (typeof arg !== 'string' || arg === '') throw new Error(`${label}: ${name} needs a name`);
        break;
      case 'music':
        if (arg !== null && (typeof arg !== 'string' || arg === '')) throw new Error(`${label}: music needs a song name, or null to stop`);
        break;
      case 'wait':
        if (typeof arg !== 'number' || !Number.isFinite(arg) || arg <= 0 || arg > 5000) throw new Error(`${label}: wait needs milliseconds above 0 and up to 5000`);
        break;
    }
    // portraits and speakers are checked by identifier: the project never depicts the Prophet or the Companions
    if (name === 'say' || name === 'show' || name === 'hide') {
      const id = name === 'say' ? (arg as SayLine).who : name === 'show' ? (arg as { who: string }).who : (arg as string);
      const denied = deniedWordIn(id);
      if (denied) throw new Error(`${label}: "${id}" contains "${denied}", which the project never depicts`);
    }
  });
  return s as SceneDef;
}

export function buildSceneTable(raw: readonly unknown[], ctx: SceneContext): SceneTable {
  const table = new Map<string, SceneDef>();
  raw.forEach((entry, i) => {
    const scene = validateScene(entry, ctx, `scene #${i}`);
    if (table.has(scene.id)) throw new Error(`scene "${scene.id}": duplicate id`);
    table.set(scene.id, scene);
  });
  return table;
}

// ------------------------------------------------------------------ playing a scene

/** Who stands where, and what is behind them. */
export interface Stage {
  readonly left: string | null;
  readonly right: string | null;
  readonly center: string | null;
  readonly bg: string | null;
  readonly music: string | null;
}

/** Something the scene asked for that is not on the stage: the player of the scene carries it out. */
export type Effect = { readonly flag: string } | { readonly unlock: string } | { readonly sfx: string } | { readonly music: string | null };

/** What the scene is doing now. */
export type Beat = { readonly kind: 'say'; readonly line: SayLine; readonly stage: Stage } | { readonly kind: 'wait'; readonly ms: number };

/**
 * Steps through a scene. `step` carries out commands until one needs the player's eyes (a line to
 * read, a pause) and returns it; flags, unlocks and sounds go to `effects` for the caller to apply.
 * It holds no clock and no canvas, so a scene can be played, skipped or tested the same way.
 */
export class DialogueRunner {
  private index = 0;
  private stage: Stage = { left: null, right: null, center: null, bg: null, music: null };
  /** Effects raised since the caller last took them. */
  readonly effects: Effect[] = [];
  /** Every line shown so far, oldest first (the backlog). */
  readonly backlog: SayLine[] = [];

  constructor(readonly scene: SceneDef) {}

  get done(): boolean {
    return this.index >= this.scene.cmds.length;
  }

  get current(): Stage {
    return this.stage;
  }

  step(): Beat | null {
    while (this.index < this.scene.cmds.length) {
      const cmd = this.scene.cmds[this.index++] as Cmd;
      if ('say' in cmd) {
        this.backlog.push(cmd.say);
        return { kind: 'say', line: cmd.say, stage: this.stage };
      }
      if ('wait' in cmd) return { kind: 'wait', ms: cmd.wait };
      this.apply(cmd);
    }
    return null;
  }

  /** Skip to the end: the lines are not shown, but every flag and unlock the rest of the scene raises still is. */
  skip(): void {
    while (this.index < this.scene.cmds.length) {
      const cmd = this.scene.cmds[this.index++] as Cmd;
      if (!('say' in cmd) && !('wait' in cmd)) this.apply(cmd);
    }
  }

  /** Take the effects raised so far. */
  take(): Effect[] {
    return this.effects.splice(0);
  }

  private apply(cmd: Cmd): void {
    if ('show' in cmd) this.stage = { ...this.stage, [cmd.show.at]: cmd.show.who };
    else if ('hide' in cmd) {
      const next = { ...this.stage };
      for (const slot of SLOTS) if (next[slot] === cmd.hide) next[slot] = null;
      this.stage = next;
    } else if ('bg' in cmd) this.stage = { ...this.stage, bg: cmd.bg };
    else if ('music' in cmd) {
      this.stage = { ...this.stage, music: cmd.music };
      this.effects.push({ music: cmd.music });
    } else if ('sfx' in cmd) this.effects.push({ sfx: cmd.sfx });
    else if ('flag' in cmd) this.effects.push({ flag: cmd.flag });
    else if ('unlock' in cmd) this.effects.push({ unlock: cmd.unlock });
  }
}

/** The mark shown in a line's corner: ◆ documented, ◇ dramatized, none for narration. */
export const markFor = (kind: LineKind): string => (kind === 'documented' ? '◆' : kind === 'dramatized' ? '◇' : '');

/**
 * Split a line into pages of at most `lines` wrapped lines each. `wrap` breaks text to the width of the
 * box (the text renderer knows the font); a page break only ever falls between two lines.
 */
export function paginate(text: string, wrap: (text: string) => string[], lines = 3): string[][] {
  const wrapped = wrap(text);
  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += lines) pages.push(wrapped.slice(i, i + lines));
  return pages.length > 0 ? pages : [['']];
}
