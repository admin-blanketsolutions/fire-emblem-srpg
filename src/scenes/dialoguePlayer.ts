import { NARRATOR, plateName, type CharacterTable } from '../core/characters';
import { DialogueRunner, markFor, paginate, type Effect, type SayLine, type SceneDef, type Slot, type Stage } from '../core/dialogue';
import type { Action } from '../core/input';
import { charsPerSecond, type Settings } from '../core/settings';
import type { Point } from '../core/types';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/viewport';
import type { Assets } from '../engine/assets';
import type { TextRenderer, TextStyle } from '../engine/text';
import { COLORS } from '../engine/theme';
import { drawPanel } from '../engine/ui';

/**
 * Plays a scene (DESIGN §9): a backdrop, up to three portraits, a text box of three lines with
 * a typewriter, the name of the speaker, and the mark that says whether the line is documented
 * (◆) or dramatized (◇). Confirm completes the line and then moves on; Menu skips the scene; Info
 * opens the backlog. The player owns no game state: what a scene raises (flags, unlocks, sounds)
 * goes to the callbacks.
 */

export interface DialogueOptions {
  readonly scene: SceneDef;
  readonly characters: CharacterTable;
  readonly assets: Assets;
  readonly text: TextRenderer;
  readonly settings: Settings;
  readonly onEffect?: (effect: Effect) => void;
  /**
   * Names the player chose, by character id: the plate says them, and `{id}` in a line's text is
   * replaced by them (the Recruit is called whatever the player called him).
   */
  readonly names?: Readonly<Record<string, string>>;
}

const BOX = { x: 8, y: 114, w: 224, h: 40 };
const PORTRAIT_SCALE = 2;
const SLOT_X: Readonly<Record<Slot, number>> = { left: 6, center: 88, right: 170 };
const PORTRAIT_Y = 38;

/** Backdrops are placeholders: two colours, top and bottom, by name. */
export const BACKDROPS: Readonly<Record<string, readonly [string, string]>> = {
  'demo-camp': ['#3a2f55', '#7a5a3a'],
  'tikrit-gate': ['#4a5f7a', '#8a7a5a'],
  night: ['#0d0a1e', '#2a2548'],
  desert: ['#c9a064', '#e8d2a0'],
  'tigris-dawn': ['#6a7fa8', '#d8b48a'],
  'tigris-evening': ['#3a3a6a', '#c98a5a'],
  citadel: ['#4a4658', '#9a8f78'],
  'tikrit-night': ['#14122a', '#4a3a3a'],
  'camp-night': ['#16122e', '#5a4030'],
  'road-dust': ['#9a7f5a', '#d8c08a'],
  'ghouta-spring': ['#7fa86a', '#d8d09a'],
  'damascus-wall': ['#8a7a68', '#d8c49a'],
  'damascus-dusk': ['#5a4a6a', '#d8905a'],
  'alexandria-sea': ['#4a7fa8', '#d8d0b0'],
  'alexandria-wall': ['#7a8a98', '#c8b890'],
  'cairo-camp': ['#5a6a8a', '#d0b078'],
  'cairo-palace': ['#3a5a4a', '#c8b070'],
  'cairo-night': ['#10122a', '#3a4a5a'],
  'vizier-hall': ['#2f4a3a', '#a8946a'],
  'sickroom': ['#2a2a3a', '#6a5a48'],
  'council-tent': ['#4a3a4a', '#b09a70'],
  dawn: ['#5a5a8a', '#e8c890'],
};
const DEFAULT_BACKDROP: readonly [string, string] = ['#2c2a45', '#4d4366'];

const PLAIN: TextStyle = { color: COLORS.text };
const DIM: TextStyle = { color: COLORS.textDim };
const GOLD: TextStyle = { color: COLORS.gold };

type State =
  | { kind: 'reading'; line: SayLine; stage: Stage; pages: string[][]; page: number; shown: number }
  | { kind: 'waiting'; left: number }
  | { kind: 'backlog'; scroll: number; back: State }
  | { kind: 'done' };

export class DialoguePlayer {
  private readonly runner: DialogueRunner;
  private readonly options: DialogueOptions;
  private state: State = { kind: 'done' };
  private clock = 0;

  constructor(options: DialogueOptions) {
    this.options = options;
    this.runner = new DialogueRunner(options.scene);
    this.advance();
  }

  get done(): boolean {
    return this.state.kind === 'done';
  }

  /** The lines shown so far, oldest first. */
  get backlog(): readonly SayLine[] {
    return this.runner.backlog;
  }

  // ---------------------------------------------------------------- update

  update(dtMs: number, actions: ReadonlySet<Action>, taps: readonly Point[]): void {
    this.clock += dtMs;
    const state = this.state;
    const confirm = actions.has('confirm') || taps.length > 0;
    switch (state.kind) {
      case 'reading': {
        if (actions.has('menu')) return this.skip();
        if (actions.has('info')) {
          this.state = { kind: 'backlog', scroll: 0, back: state };
          return;
        }
        const total = this.pageLength(state);
        const rate = charsPerSecond(this.options.settings.textSpeed);
        state.shown = Math.min(total, state.shown + (rate === Number.POSITIVE_INFINITY ? total : (dtMs / 1000) * rate));
        if (!confirm) return;
        if (state.shown < total) state.shown = total; // the first press completes the page
        else if (state.page + 1 < state.pages.length) {
          state.page += 1;
          state.shown = 0;
        } else this.advance();
        return;
      }
      case 'waiting':
        state.left -= dtMs;
        if (state.left <= 0 || confirm) this.advance();
        if (actions.has('menu')) this.skip();
        return;
      case 'backlog': {
        const n = this.runner.backlog.length;
        if (actions.has('up')) state.scroll = Math.min(Math.max(0, n - 1), state.scroll + 1);
        if (actions.has('down')) state.scroll = Math.max(0, state.scroll - 1);
        if (actions.has('cancel') || actions.has('info') || actions.has('confirm')) this.state = state.back;
        return;
      }
      case 'done':
        return;
    }
  }

  private pageLength(state: Extract<State, { kind: 'reading' }>): number {
    return (state.pages[state.page] ?? []).join('').length;
  }

  /** Go on to whatever the scene does next, handing on what it raised. */
  private advance(): void {
    const beat = this.runner.step();
    this.deliver();
    if (!beat) {
      this.state = { kind: 'done' };
    } else if (beat.kind === 'wait') {
      this.state = { kind: 'waiting', left: beat.ms };
    } else {
      const { text } = this.options;
      const pages = paginate(this.say(beat.line.text), (t) => text.wrap(t, BOX.w - 16), 3);
      this.state = { kind: 'reading', line: beat.line, stage: beat.stage, pages, page: 0, shown: 0 };
    }
  }

  private skip(): void {
    this.runner.skip();
    this.deliver();
    this.state = { kind: 'done' };
  }

  /** A line's text with the player's names put in. */
  private say(text: string): string {
    const { names } = this.options;
    return names ? text.replace(/\{([a-z][a-z0-9-]*)\}/g, (whole, id: string) => names[id] ?? whole) : text;
  }

  /** What a character's plate says: the name the player gave, or the character's own. */
  private plate(id: string): string {
    const given = this.options.names?.[id];
    if (given) return given;
    const character = this.options.characters.get(id);
    return character ? plateName(character) : id;
  }

  private deliver(): void {
    for (const effect of this.runner.take()) this.options.onEffect?.(effect);
  }

  // ---------------------------------------------------------------- draw

  draw(ctx: CanvasRenderingContext2D): void {
    const { text, settings } = this.options;
    const state = this.state;
    if (state.kind === 'done') return;
    if (state.kind === 'backlog') {
      this.drawBackground(ctx, (state.back.kind === 'reading' ? state.back.stage.bg : null) ?? null);
      this.drawBacklog(ctx, state);
      return;
    }
    const stage = state.kind === 'reading' ? state.stage : this.runner.current;
    this.drawBackground(ctx, stage.bg);
    const speaker = state.kind === 'reading' ? state.line.who : null;
    if (settings.portraits === 'illustrated') {
      for (const slot of ['left', 'center', 'right'] as const) {
        const who = stage[slot];
        if (who) this.drawPortrait(ctx, who, slot, speaker === null || speaker === who);
      }
    }
    if (state.kind !== 'reading') return;

    // the speaker's plate, on the side of the box the speaker stands on
    const { line } = state;
    const name = line.who === NARRATOR ? '' : this.plate(line.who);
    const side: Slot | null = (['left', 'center', 'right'] as const).find((s) => stage[s] === line.who) ?? null;
    drawPanel(ctx, BOX.x, BOX.y, BOX.w, BOX.h);
    if (name) {
      const w = text.width(name) + 14;
      const x = side === 'right' ? BOX.x + BOX.w - w - 6 : BOX.x + 6;
      drawPanel(ctx, x, BOX.y - 11, w, 14);
      text.draw(ctx, name, x + 7, BOX.y - 8, GOLD);
    }
    // the text, revealed a character at a time
    let left = Math.floor(state.shown);
    const page = state.pages[state.page] ?? [];
    page.forEach((row, i) => {
      const shown = row.slice(0, Math.max(0, left));
      left -= row.length;
      text.draw(ctx, shown, BOX.x + 8, BOX.y + 7 + i * 10, line.kind === 'narration' ? DIM : PLAIN);
    });
    // the mark, if they are switched on, and the prompt to go on
    const mark = settings.sourceMarkers ? markFor(line.kind) : '';
    if (mark) text.draw(ctx, mark, BOX.x + BOX.w - 14, BOX.y + 4, line.kind === 'documented' ? GOLD : DIM);
    const complete = state.shown >= this.pageLength(state);
    if (complete && Math.floor(this.clock / 350) % 2 === 0) text.draw(ctx, state.page + 1 < state.pages.length ? '▼' : '→', BOX.x + BOX.w - 14, BOX.y + BOX.h - 12, GOLD);
  }

  private drawBackground(ctx: CanvasRenderingContext2D, bg: string | null): void {
    const [top, bottom] = (bg ? BACKDROPS[bg] : null) ?? DEFAULT_BACKDROP;
    const gradient = ctx.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
    gradient.addColorStop(0, top);
    gradient.addColorStop(1, bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    ctx.fillStyle = 'rgba(13, 10, 20, 0.35)';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, 10);
    ctx.fillRect(0, LOGICAL_HEIGHT - 6, LOGICAL_WIDTH, 6);
  }

  private drawPortrait(ctx: CanvasRenderingContext2D, who: string, slot: Slot, lit: boolean): void {
    const { assets, characters } = this.options;
    const character = characters.get(who);
    if (!character) return;
    const x = SLOT_X[slot];
    const size = 32 * PORTRAIT_SCALE;
    ctx.globalAlpha = lit ? 1 : 0.55;
    if (character.portrait && assets.has(character.portrait)) {
      const frame = assets.frame(character.portrait, 'still', 0, { faction: character.faction ?? 'neutral', skin: character.skin ?? 's2' });
      ctx.drawImage(frame, x, PORTRAIT_Y, size, size);
    } else {
      // no portrait: a plain plate with the initial, so a missing picture is never a missing person
      ctx.fillStyle = COLORS.panel;
      ctx.fillRect(x, PORTRAIT_Y, size, size);
      this.options.text.drawCentered(ctx, this.plate(who).charAt(0), x + size / 2, PORTRAIT_Y + size / 2 - 8, { color: COLORS.gold, scale: 2 });
    }
    ctx.globalAlpha = 1;
  }

  private drawBacklog(ctx: CanvasRenderingContext2D, state: Extract<State, { kind: 'backlog' }>): void {
    const { text, settings } = this.options;
    drawPanel(ctx, 6, 6, LOGICAL_WIDTH - 12, LOGICAL_HEIGHT - 12);
    text.draw(ctx, `Backlog: ${this.options.scene.title}`, 14, 11, GOLD);
    // the newest lines that fit, from `scroll` lines back
    const rows: Array<{ text: string; style: TextStyle }> = [];
    for (const line of this.runner.backlog.slice(0, this.runner.backlog.length - state.scroll)) {
      const who = line.who === NARRATOR ? '' : `${this.plate(line.who)}: `;
      const mark = settings.sourceMarkers ? markFor(line.kind) : '';
      const wrapped = text.wrap(`${mark ? `${mark} ` : ''}${who}${this.say(line.text)}`, LOGICAL_WIDTH - 36);
      wrapped.forEach((row, i) => rows.push({ text: i === 0 ? row : `  ${row}`, style: line.kind === 'narration' ? DIM : PLAIN }));
    }
    const visible = rows.slice(-12);
    visible.forEach((row, i) => text.draw(ctx, row.text, 14, 24 + i * 10, row.style));
    text.drawCentered(ctx, 'Up/Down scroll   Back to return', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 17, DIM);
  }
}
