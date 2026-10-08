import type { CharacterTable } from '../core/characters';
import type { Effect, SceneDef } from '../core/dialogue';
import type { Action } from '../core/input';
import type { Settings } from '../core/settings';
import type { Point } from '../core/types';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/viewport';
import type { Assets } from '../engine/assets';
import { audio } from '../engine/audio';
import type { Scene } from '../engine/game';
import type { TextRenderer } from '../engine/text';
import { COLORS } from '../engine/theme';
import { DialoguePlayer } from './dialoguePlayer';
import { DIM, drawBackdrop, GOLD, PLAIN } from './listScreen';

/**
 * The scenes of the story between battles (DESIGN §11): a title card for a chapter or an
 * interlude, a run of dialogue scenes, and a page of words for the end of the slice. None owns any
 * game state: what a scene raises (flags, Codex entries) goes to the callbacks.
 */

// ------------------------------------------------------------------ a title card

export interface CardOptions {
  readonly text: TextRenderer;
  /** A small line above the title: `Chapter 1`, or nothing. */
  readonly kicker?: string;
  readonly title: string;
  /** The date, in AH and the Julian month and year. */
  readonly date?: string;
  readonly onDone: () => void;
}

const CARD_FADE_MS = 700;
/** A card waits this long before it goes on by itself; a press goes on at once after the fade. */
const CARD_HOLD_MS = 4200;

export class CardScene implements Scene {
  private age = 0;
  private done = false;

  constructor(private readonly o: CardOptions) {}

  update(dtMs: number, actions: ReadonlySet<Action>, taps: readonly Point[]): void {
    this.age += dtMs;
    if (this.done) return;
    const press = actions.has('confirm') || actions.has('menu') || taps.length > 0;
    if ((press && this.age > 300) || this.age > CARD_FADE_MS + CARD_HOLD_MS) {
      this.done = true;
      this.o.onDone();
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const { text, kicker, title, date } = this.o;
    drawBackdrop(ctx);
    ctx.globalAlpha = Math.min(1, this.age / CARD_FADE_MS);
    let y = 54;
    if (kicker) {
      text.drawCentered(ctx, kicker, LOGICAL_WIDTH / 2, y, GOLD);
      y += 14;
    }
    // a long title is set in two lines of the large letters if it can be, else in the small
    const scale = text.width(title, 2) <= LOGICAL_WIDTH - 24 ? 2 : 1;
    const lines = scale === 2 ? [title] : text.wrap(title, LOGICAL_WIDTH - 32);
    for (const line of lines) {
      text.drawCentered(ctx, line, LOGICAL_WIDTH / 2, y, { color: COLORS.text, shadow: COLORS.ink, scale });
      y += scale === 2 ? 14 : 11;
    }
    if (date) {
      ctx.fillStyle = COLORS.panelInner;
      ctx.fillRect(LOGICAL_WIDTH / 2 - 40, y + 3, 80, 1);
      text.drawCentered(ctx, date, LOGICAL_WIDTH / 2, y + 10, DIM);
    }
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ a run of scenes

export interface StoryOptions {
  readonly scenes: readonly SceneDef[];
  readonly characters: CharacterTable;
  readonly assets: Assets;
  readonly text: TextRenderer;
  readonly settings: Settings;
  /** What the player named people (the Recruit). */
  readonly names?: Readonly<Record<string, string>>;
  /** A scene raised a flag or opened a Codex entry. */
  readonly onEffect?: (effect: Effect) => void;
  readonly onDone: () => void;
}

/** Plays dialogue scenes one after another; the scenes' own music and sounds are carried out here. */
export class StoryScene implements Scene {
  private index = 0;
  private player: DialoguePlayer | null = null;
  private finished = false;

  constructor(private readonly o: StoryOptions) {
    this.next();
  }

  private next(): void {
    const scene = this.o.scenes[this.index++];
    if (!scene) {
      this.player = null;
      if (!this.finished) {
        this.finished = true;
        this.o.onDone();
      }
      return;
    }
    const { characters, assets, text, settings, names } = this.o;
    this.player = new DialoguePlayer({
      scene,
      characters,
      assets,
      text,
      settings,
      ...(names ? { names } : {}),
      onEffect: (effect) => {
        if ('music' in effect) audio.playMusic(effect.music);
        else if ('sfx' in effect) audio.playSfx(effect.sfx);
        else this.o.onEffect?.(effect);
      },
    });
    if (this.player.done) this.next();
  }

  update(dtMs: number, actions: ReadonlySet<Action>, taps: readonly Point[]): void {
    if (!this.player) return;
    this.player.update(dtMs, actions, taps);
    if (this.player.done) this.next();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.player) this.player.draw(ctx);
    else drawBackdrop(ctx);
  }
}

// ------------------------------------------------------------------ a page of words

export interface PageOptions {
  readonly text: TextRenderer;
  readonly title: string;
  /** Paragraphs; each is wrapped to the page. An empty string leaves a gap. */
  readonly lines: readonly string[];
  readonly hint?: string;
  readonly onDone: () => void;
}

const PAGE_TOP = 30;
const PAGE_BOTTOM = LOGICAL_HEIGHT - 26;

/**
 * The paragraphs wrapped to the page and cut into pages that each fit above the hint. A gap ('')
 * stands for the space between paragraphs, and never opens or closes a page.
 */
export function paginate(text: Pick<TextRenderer, 'wrap'>, paragraphs: readonly string[]): string[][] {
  const pages: string[][] = [[]];
  let y = PAGE_TOP;
  let gap = false;
  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      gap = true;
      continue;
    }
    for (const row of text.wrap(paragraph, LOGICAL_WIDTH - 28)) {
      if (gap && y + 5 <= PAGE_BOTTOM && pages[pages.length - 1]!.length > 0) {
        pages[pages.length - 1]!.push('');
        y += 5;
      }
      gap = false;
      if (y > PAGE_BOTTOM) {
        pages.push([]);
        y = PAGE_TOP;
      }
      pages[pages.length - 1]!.push(row);
      y += 10;
    }
  }
  return pages;
}

/** A page of words on the dark backdrop: the end of the slice, with what to do next. Long words run on to further pages. */
export class PageScene implements Scene {
  private age = 0;
  private done = false;
  private shown = 0;
  private readonly pages: string[][];

  constructor(private readonly o: PageOptions) {
    this.pages = paginate(o.text, o.lines);
  }

  update(dtMs: number, actions: ReadonlySet<Action>, taps: readonly Point[]): void {
    this.age += dtMs;
    if (this.done || this.age < 400) return;
    if (actions.has('confirm') || actions.has('cancel') || taps.length > 0) {
      if (this.shown < this.pages.length - 1) {
        this.shown += 1;
        this.age = 0;
        return;
      }
      this.done = true;
      this.o.onDone();
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const { text, title, hint } = this.o;
    drawBackdrop(ctx);
    text.drawCentered(ctx, title, LOGICAL_WIDTH / 2, 8, { color: COLORS.text, shadow: COLORS.ink, scale: 2 });
    let y = PAGE_TOP;
    for (const row of this.pages[this.shown] ?? []) {
      if (row === '') {
        y += 5;
        continue;
      }
      text.draw(ctx, row, 14, y, PLAIN);
      y += 10;
    }
    const last = this.shown >= this.pages.length - 1;
    text.drawCentered(ctx, last ? (hint ?? 'OK Continue') : 'OK More', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 14, DIM);
    if (this.pages.length > 1) text.drawRight(ctx, `${this.shown + 1}/${this.pages.length}`, LOGICAL_WIDTH - 8, LOGICAL_HEIGHT - 14, DIM);
  }
}
