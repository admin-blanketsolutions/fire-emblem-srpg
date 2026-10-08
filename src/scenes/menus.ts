import type { CampaignMode } from '../core/army';
import { BADGES, CATEGORY_NAMES, CODEX_CATEGORIES, unlockedIn, type CodexCategory, type CodexEntry, type CodexTable } from '../core/codex';
import type { Action } from '../core/input';
import type { SaveListing, SavePlace } from '../core/save';
import { BATTLE_ANIMATIONS, PORTRAIT_MODES, TEXT_SPEEDS, type Settings } from '../core/settings';
import type { Point } from '../core/types';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/viewport';
import type { TextRenderer } from '../engine/text';
import { COLORS } from '../engine/theme';
import { drawPanel } from '../engine/ui';
import { DIM, drawBackdrop, GOLD, ListScreen, PLAIN, type ListContent, type Row } from './listScreen';

/**
 * The screens around the game (DESIGN §16, §3.9, §9.4): the title, the settings, the save slots and
 * the Codex. Each is a list; none owns any game state. What the player chooses goes to callbacks.
 */

const cycle = <T>(list: readonly T[], value: T, delta: -1 | 1): T => list[(list.indexOf(value) + delta + list.length) % list.length] as T;
const MODE_ABOUT: Readonly<Record<CampaignMode, string>> = {
  classic: 'Classic: a unit that retreats wounded leaves the army, unless the sources place it in later events.',
  casual: 'Casual: every unit that retreats wounded returns after the battle.',
};

// ------------------------------------------------------------------ title

export interface TitleOptions {
  readonly text: TextRenderer;
  /** A battle was suspended; offered first. */
  readonly canResume: boolean;
  /** Some slot or the autosave holds a save. */
  readonly canLoad: boolean;
  /** A line under the menu: a warning (saves will not outlast the page, a save could not be opened) or news (battle suspended). */
  readonly notice: { readonly text: string; readonly warning: boolean } | null;
  readonly onResume: () => void;
  readonly onNewGame: (mode: CampaignMode) => void;
  readonly onLoad: () => void;
  readonly onSettings: () => void;
}

export class TitleScene extends ListScreen {
  private choosingMode = false;

  constructor(private readonly options: TitleOptions) {
    super(options.text);
  }

  protected content(): ListContent {
    const o = this.options;
    if (this.choosingMode) {
      return {
        title: 'New game',
        rows: (['classic', 'casual'] as const).map((mode) => ({ label: mode === 'classic' ? 'Classic' : 'Casual', about: MODE_ABOUT[mode], choose: () => o.onNewGame(mode) })),
        hint: 'OK Begin   Back Return',
      };
    }
    const rows: Row[] = [];
    if (o.canResume) rows.push({ label: 'Resume battle', about: 'Return to the battle you suspended.', choose: o.onResume });
    rows.push({ label: 'New game', about: 'Begin a campaign. You choose Classic or Casual next.', choose: () => this.enterModes() });
    rows.push({ label: 'Load', disabled: !o.canLoad, about: o.canLoad ? 'Open a saved campaign.' : 'There are no saves yet.', choose: o.onLoad });
    rows.push({ label: 'Settings', about: 'Text, sound, battle rules and display.', choose: o.onSettings });
    return { title: '', rows, ...(o.notice ? { note: o.notice.text } : {}), hint: 'OK Choose' };
  }

  private enterModes(): void {
    this.choosingMode = true;
    this.index = 0;
  }

  protected back(): void {
    if (this.choosingMode) {
      this.choosingMode = false;
      this.index = 0;
    }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    if (this.choosingMode) {
      super.draw(ctx);
      return;
    }
    drawBackdrop(ctx);
    // a placeholder title card: two banners, and the name
    ctx.fillStyle = '#7a4a12';
    ctx.fillRect(28, 14, 4, 52);
    ctx.fillRect(LOGICAL_WIDTH - 32, 14, 4, 52);
    ctx.fillStyle = '#c2412d';
    ctx.fillRect(32, 16, 18, 22);
    ctx.fillStyle = '#4f7fbf';
    ctx.fillRect(LOGICAL_WIDTH - 50, 16, 18, 22);
    this.text.drawCentered(ctx, 'Sultan of', LOGICAL_WIDTH / 2, 18, { color: COLORS.text, shadow: COLORS.panelInner, scale: 2 });
    this.text.drawCentered(ctx, 'Two Banners', LOGICAL_WIDTH / 2, 38, { color: COLORS.gold, shadow: COLORS.panelInner, scale: 2 });
    const { rows, note } = this.content();
    const w = 120;
    const x = Math.round((LOGICAL_WIDTH - w) / 2);
    const y = 70;
    drawPanel(ctx, x, y, w, rows.length * 11 + 8);
    rows.forEach((row, i) => {
      if (i === this.index) this.text.draw(ctx, '→', x + 6, y + 5 + i * 11, GOLD);
      this.text.draw(ctx, row.label, x + 15, y + 5 + i * 11, row.disabled ? DIM : PLAIN);
    });
    const about = rows[this.index]?.about;
    const lines = [...(about ? this.text.wrap(about, LOGICAL_WIDTH - 24) : []), ...(note ? this.text.wrap(note, LOGICAL_WIDTH - 24) : [])];
    const noteLines = note ? this.text.wrap(note, LOGICAL_WIDTH - 24).length : 0;
    const noteStyle = { color: this.options.notice?.warning ? COLORS.bad : COLORS.gold };
    lines.slice(0, 3).forEach((line, i) => this.text.drawCentered(ctx, line, LOGICAL_WIDTH / 2, 124 + i * 10, i >= lines.length - noteLines ? noteStyle : DIM));
  }

  /** Rows on the title card are taller than the list's; map taps to them. */
  override update(dtMs: number, actions: ReadonlySet<Action>, taps: readonly Point[]): void {
    if (this.choosingMode || taps.length === 0) {
      super.update(dtMs, actions, taps);
      return;
    }
    const merged = new Set(actions);
    const n = this.content().rows.length;
    for (const tap of taps) {
      const i = Math.floor((tap.y - 75) / 11);
      if (tap.x < 60 || tap.x > LOGICAL_WIDTH - 60 || i < 0 || i >= n) continue;
      if (i === this.index) merged.add('confirm');
      else this.index = i;
    }
    super.update(dtMs, merged, []);
  }
}

// ------------------------------------------------------------------ settings

export interface SettingsOptions {
  readonly text: TextRenderer;
  readonly settings: Settings;
  /** Every change, as it is made; the caller keeps and stores it. */
  readonly onChange: (settings: Settings) => void;
  readonly onBack: () => void;
}

const SPEED_NAMES: Readonly<Record<Settings['textSpeed'], string>> = { slow: 'Slow', normal: 'Normal', fast: 'Fast', instant: 'Instant' };
const ANIMATION_NAMES: Readonly<Record<Settings['battleAnimations'], string>> = { scene: 'Scene', map: 'Map', off: 'Off' };
const onOff = (b: boolean): string => (b ? 'On' : 'Off');
const percent = (v: number): string => `${Math.round(v * 100)}%`;
const step = (v: number, delta: -1 | 1): number => Math.round(Math.max(0, Math.min(1, v + delta * 0.1)) * 10) / 10;

export class SettingsScene extends ListScreen {
  private settings: Settings;

  constructor(private readonly options: SettingsOptions) {
    super(options.text);
    this.settings = options.settings;
  }

  private set(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.options.onChange(this.settings);
  }

  protected content(): ListContent {
    const s = this.settings;
    const toggle = (key: 'guaranteedProgress' | 'autoEndTurn' | 'dangerZoneDefault' | 'sourceMarkers' | 'colourBlindSafe'): Pick<Row, 'value' | 'change'> => ({
      value: onOff(s[key]),
      change: () => this.set({ [key]: !s[key] }),
    });
    const rows: Row[] = [
      { label: 'Text speed', value: SPEED_NAMES[s.textSpeed], change: (d) => this.set({ textSpeed: cycle(TEXT_SPEEDS, s.textSpeed, d) }), about: 'How fast dialogue appears.' },
      {
        label: 'Battle animations',
        value: ANIMATION_NAMES[s.battleAnimations],
        change: (d) => this.set({ battleAnimations: cycle(BATTLE_ANIMATIONS.filter((a) => a !== 'scene'), s.battleAnimations === 'scene' ? 'map' : s.battleAnimations, d) }),
        about: 'Map: fights play out on the map. Off: only the results are shown.',
      },
      { label: 'Music volume', value: percent(s.musicVolume), change: (d) => this.set({ musicVolume: step(s.musicVolume, d) }) },
      { label: 'Sound volume', value: percent(s.sfxVolume), change: (d) => this.set({ sfxVolume: step(s.sfxVolume, d) }) },
      {
        label: 'Hit rolls',
        value: s.hitMode === 'honest' ? 'Honest' : 'Weighted',
        change: () => this.set({ hitMode: s.hitMode === 'honest' ? 'weighted' : 'honest' }),
        about: 'Honest: one roll, so 70% hits seven times in ten. Weighted: two rolls averaged, so high chances hit more often. Applies from the next battle.',
      },
      { label: 'Guaranteed progress', ...toggle('guaranteedProgress'), about: 'A level-up that would gain nothing tries again once. Applies from the next battle.' },
      { label: 'End turn when all have acted', ...toggle('autoEndTurn') },
      { label: 'Danger zone at start', ...toggle('dangerZoneDefault'), about: 'Show every enemy’s reach when a battle begins.' },
      { label: 'Source marks in dialogue', ...toggle('sourceMarkers'), about: '◆ marks a documented line, ◇ a dramatized one.' },
      { label: 'Portraits', value: s.portraits === 'illustrated' ? 'Pictures' : 'Names only', change: (d) => this.set({ portraits: cycle(PORTRAIT_MODES, s.portraits, d) }) },
      { label: 'Colour-blind-safe ranges', ...toggle('colourBlindSafe'), about: 'Attack ranges in orange instead of red.' },
    ];
    return { title: 'Settings', rows, hint: '< > Change   Back Return' };
  }

  protected back(): void {
    this.options.onBack();
  }
}

// ------------------------------------------------------------------ save slots

export interface SlotsOptions {
  readonly text: TextRenderer;
  readonly purpose: 'save' | 'load';
  /** Read afresh each time the list is shown. */
  readonly listing: () => readonly SaveListing[];
  readonly onPick: (place: SavePlace) => void;
  readonly onBack: () => void;
  /** Shown under the list, such as the result of the last save. */
  readonly note?: () => string | null;
}

const placeName = (place: SavePlace): string => (place.kind === 'slot' ? `Slot ${place.slot}` : place.kind === 'autosave' ? 'Autosave' : 'Suspended');

/** `2026-10-08T09:30:00Z` → `2026-10-08 09:30`. */
const shortTime = (iso: string): string => iso.replace('T', ' ').slice(0, 16);

export class SlotsScene extends ListScreen {
  private confirming: SavePlace | null = null;

  constructor(private readonly options: SlotsOptions) {
    super(options.text);
  }

  protected content(): ListContent {
    const o = this.options;
    if (this.confirming) {
      const place = this.confirming;
      return {
        title: `Overwrite ${placeName(place)}?`,
        rows: [
          { label: 'Yes, save here', choose: () => this.pick(place) },
          { label: 'No', choose: () => this.back() },
        ],
      };
    }
    const listing = o.listing().filter((l) => l.place.kind === 'slot' || (o.purpose === 'load' && l.place.kind === 'autosave'));
    const rows: Row[] = listing.map((l) => {
      const name = placeName(l.place);
      if (l.state === 'empty') return { label: `${name}  —`, disabled: o.purpose === 'load', about: 'Empty.', choose: () => this.pick(l.place) };
      if (l.state === 'damaged') return { label: `${name}  damaged`, disabled: o.purpose === 'load', about: l.reason, choose: () => this.pick(l.place) };
      const s = l.summary;
      return {
        label: `${name}  ${s.label}`,
        value: s.mode === 'classic' ? 'Classic' : 'Casual',
        about: `${s.units} units${s.chapter ? ` · ${s.chapter}` : ''} · saved ${shortTime(s.savedAt)}`,
        choose: () => (o.purpose === 'save' ? this.ask(l.place) : this.pick(l.place)),
      };
    });
    const note = o.note?.();
    return { title: o.purpose === 'save' ? 'Save' : 'Load', rows, ...(note ? { note } : {}) };
  }

  private ask(place: SavePlace): void {
    this.confirming = place;
    this.index = 0;
  }

  private pick(place: SavePlace): void {
    this.confirming = null;
    this.options.onPick(place);
  }

  protected back(): void {
    if (this.confirming) {
      this.confirming = null;
      return;
    }
    this.options.onBack();
  }
}

// ------------------------------------------------------------------ the Codex

export interface CodexOptions {
  readonly text: TextRenderer;
  readonly codex: CodexTable;
  readonly unlocked: ReadonlySet<string>;
  /** A readable name for a source id (`SRC-IS` → Ibn Shaddad). */
  readonly sourceName: (id: string) => string;
  readonly onBack: () => void;
}

type CodexView = { readonly kind: 'categories' } | { readonly kind: 'entries'; readonly category: CodexCategory } | { readonly kind: 'entry'; readonly entry: CodexEntry; scroll: number; readonly back: number };

/** A line of an entry page, with how to draw it. */
interface PageLine {
  readonly text: string;
  readonly style: 'title' | 'badge' | 'body' | 'head' | 'position' | 'meta';
}

const PAGE_TOP = 12;
const PAGE_LINES = 13;

export class CodexScene extends ListScreen {
  private view: CodexView = { kind: 'categories' };
  private categoryIndex = 0;

  constructor(private readonly options: CodexOptions) {
    super(options.text);
  }

  protected content(): ListContent {
    const o = this.options;
    if (this.view.kind === 'entries') {
      const category = this.view.category;
      const entries = unlockedIn(o.codex, o.unlocked, category);
      return {
        title: `Codex · ${CATEGORY_NAMES[category]}`,
        rows: entries.map((entry, i) => ({ label: entry.title, ...(entry.demo ? { value: 'demo' } : {}), choose: () => (this.view = { kind: 'entry', entry, scroll: 0, back: i }) })),
        ...(entries.length === 0 ? { note: 'Nothing here yet.' } : {}),
      };
    }
    return {
      title: 'Codex',
      rows: CODEX_CATEGORIES.map((category) => {
        const n = unlockedIn(o.codex, o.unlocked, category).length;
        return { label: CATEGORY_NAMES[category], value: String(n), disabled: n === 0, choose: () => this.open(category) };
      }),
      note: 'Entries unlock as the chapters begin and end. Each carries its sources, and shows every position where they differ.',
    };
  }

  private open(category: CodexCategory): void {
    this.categoryIndex = this.index;
    this.view = { kind: 'entries', category };
    this.index = 0;
  }

  protected back(): void {
    if (this.view.kind === 'entries') {
      this.view = { kind: 'categories' };
      this.index = this.categoryIndex;
    } else {
      this.options.onBack();
    }
  }

  /** The entry laid out as lines: title, badge, paragraphs, each disputed claim with every position, and the sources. */
  pageLines(entry: CodexEntry): PageLine[] {
    const width = LOGICAL_WIDTH - 28;
    const wrap = (s: string, style: PageLine['style'], indent = ''): PageLine[] => this.text.wrap(s, width - this.text.width(indent)).map((line) => ({ text: indent + line, style }));
    const out: PageLine[] = wrap(entry.title, 'title');
    const badge = entry.demo ? 'Demo entry' : entry.confidence ? BADGES[entry.confidence] : 'What the game invents';
    out.push({ text: badge, style: 'badge' });
    for (const paragraph of entry.body) out.push({ text: '', style: 'body' }, ...wrap(paragraph, 'body'));
    for (const block of entry.differ ?? []) {
      out.push({ text: '', style: 'body' }, ...wrap(`Sources differ: ${block.claim}`, 'head'));
      for (const p of block.positions) out.push(...wrap(`${this.options.sourceName(p.source)}: ${p.says}`, 'position', '  '));
    }
    if (entry.dramatized && entry.dramatized.length > 0) out.push({ text: '', style: 'body' }, ...wrap(`Dramatized in this chapter: ${entry.dramatized.join(', ')}`, 'meta'));
    out.push({ text: '', style: 'body' }, ...wrap(`Sources: ${entry.sources.map((s) => this.options.sourceName(s)).join('; ')}`, 'meta'));
    return out;
  }

  override update(dtMs: number, actions: ReadonlySet<Action>, taps: readonly Point[]): void {
    const view = this.view;
    if (view.kind !== 'entry') {
      super.update(dtMs, actions, taps);
      return;
    }
    const max = Math.max(0, this.pageLines(view.entry).length - PAGE_LINES);
    if (actions.has('down')) view.scroll = Math.min(max, view.scroll + 1);
    if (actions.has('up')) view.scroll = Math.max(0, view.scroll - 1);
    if (actions.has('cancel') || actions.has('confirm') || taps.length > 0) {
      if (actions.has('confirm') && view.scroll < max) {
        view.scroll = Math.min(max, view.scroll + PAGE_LINES - 1);
        return;
      }
      const category = view.entry.category;
      this.view = { kind: 'entries', category };
      this.index = view.back;
    }
  }

  override draw(ctx: CanvasRenderingContext2D): void {
    const view = this.view;
    if (view.kind !== 'entry') {
      super.draw(ctx);
      return;
    }
    drawBackdrop(ctx);
    drawPanel(ctx, 4, 4, LOGICAL_WIDTH - 8, LOGICAL_HEIGHT - 8);
    const lines = this.pageLines(view.entry);
    const styles: Readonly<Record<PageLine['style'], { color: string }>> = {
      title: GOLD as { color: string },
      badge: { color: view.entry.confidence === 'attested-differ' ? COLORS.hpLow : COLORS.good },
      body: PLAIN as { color: string },
      head: { color: COLORS.gold },
      position: PLAIN as { color: string },
      meta: DIM as { color: string },
    };
    lines.slice(view.scroll, view.scroll + PAGE_LINES).forEach((line, i) => this.text.draw(ctx, line.text, 12, PAGE_TOP + i * 10, styles[line.style]));
    const more = view.scroll + PAGE_LINES < lines.length;
    this.text.draw(ctx, more ? '▼ OK More   Back Return' : 'Back Return', 12, LOGICAL_HEIGHT - 16, DIM);
  }

  /** The view, for tests. */
  get current(): CodexView {
    return this.view;
  }
}
