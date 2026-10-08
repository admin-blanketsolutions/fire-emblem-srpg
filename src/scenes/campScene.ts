import { buy, CONVOY_SLOTS, sell, store, withdraw, type Army, type Result } from '../core/army';
import type { BattleTables } from '../core/battle';
import { availableTalks, completeTalk, deployedUnits, drill, isAway, isDeployed, promotable, promoteWithItem, toggleDeploy, type Talk } from '../core/camp';
import type { Effect } from '../core/dialogue';
import type { Action } from '../core/input';
import { applyItem, canUseItem, equipWeapon, priceOf, sellValue, stackName, type InventoryEnv } from '../core/inventory';
import { kindLabel, roman } from '../core/labels';
import { DEFAULT_SETTINGS, type Settings } from '../core/settings';
import type { SupportGate } from '../core/supports';
import type { PromotionResult } from '../core/promotion';
import type { ShopDef, ShopTable } from '../core/shop';
import { INVENTORY_SLOTS, equippedWeapon, type ItemStack, type UnitInstance } from '../core/unit';
import type { Point } from '../core/types';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/viewport';
import { audio } from '../engine/audio';
import type { Assets } from '../engine/assets';
import type { Scene } from '../engine/game';
import type { TextRenderer, TextStyle } from '../engine/text';
import { COLORS } from '../engine/theme';
import { drawMenu, drawPanel, menuSize, type MenuItem } from '../engine/ui';
import type { Story } from '../data/story';
import { drawInfoPage, drawItemList, drawPromotion, rangeText, type Pen, type UnitSource } from './battleWindows';
import { DialoguePlayer } from './dialoguePlayer';

/**
 * The camp between battles: the army's units and their packs, the baggage train (the convoy) and
 * the shops. Nothing here costs anyone an action. The camp of the full game (supports, talks,
 * saving) grows from this screen.
 */

const PLAIN: TextStyle = { color: COLORS.text };
const DIM: TextStyle = { color: COLORS.textDim };
const GOLD: TextStyle = { color: COLORS.gold };
const ROW = 10;

type Mode =
  | { kind: 'main'; index: number }
  | { kind: 'units'; index: number }
  | { kind: 'unit'; unit: number; pack: boolean; slot: number; note: string | null }
  | { kind: 'convoy'; unit: number; col: 0 | 1; row: number; note: string | null }
  | { kind: 'shop'; shop: ShopDef; tab: 'buy' | 'sell'; index: number; buyer: number; note: string | null }
  | { kind: 'promotion'; result: PromotionResult; back: Mode }
  /** The simple list screens: conversations, the Maydan, the Class screen, the roll and the choice of who deploys. */
  | { kind: 'list'; which: ListKind; index: number; note: string | null }
  | { kind: 'scene'; player: DialoguePlayer; then: () => void };

type ListKind = 'talks' | 'maydan' | 'class' | 'roll' | 'prepare';

interface ListRow {
  readonly label: string;
  readonly right?: string;
  readonly dim?: boolean;
}

export interface CampSceneOptions {
  readonly army: Army;
  readonly tables: BattleTables;
  readonly shops: ShopTable;
  readonly assets: Assets;
  readonly text: TextRenderer;
  /** Shown at the top of the main menu. */
  readonly title?: string;
  /** Adds a last entry to the main menu; called when it is chosen. */
  readonly onContinue?: () => void;
  readonly continueLabel?: string;
  /** The people and scenes the camp can show; without it the Majlis has nothing to say. */
  readonly story?: Story;
  readonly settings?: Settings;
  /** The chapter just finished (or about to begin), the chapters in order, and the flags raised so far: what decides which scenes may be shown. */
  readonly chapter?: string | null;
  readonly chapterOrder?: readonly string[];
  readonly flags?: Set<string>;
  /** A scene unlocked a Codex entry. */
  readonly onUnlock?: (id: string) => void;
  /** More entries for the main menu, before the way on: saving, the Codex, settings. */
  readonly extraItems?: () => ReadonlyArray<{ readonly label: string; readonly run: () => void }>;
  /** What the player named people (the Recruit), for the scenes the camp plays. */
  readonly names?: Readonly<Record<string, string>>;
}

/** Where a stack for sale comes from. */
type Source = { readonly unit: UnitInstance; readonly slot: number } | { readonly convoyIndex: number };

interface Hit {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly index: number;
}

const wrap = (n: number, delta: number, size: number): number => (size === 0 ? 0 : (n + delta + size) % size);

export class CampScene implements Scene {
  private readonly army: Army;
  private readonly tables: BattleTables;
  private readonly env: InventoryEnv;
  private readonly shops: ShopTable;
  private readonly text: TextRenderer;
  private readonly title: string;
  private readonly onContinue: (() => void) | undefined;
  private readonly continueLabel: string;
  private readonly source: UnitSource;
  private readonly assets: Assets;
  private readonly story: Story | undefined;
  private readonly settings: Settings;
  private readonly chapter: string | null;
  private readonly chapterOrder: readonly string[];
  private readonly flags: Set<string>;
  private readonly onUnlock: ((id: string) => void) | undefined;
  private readonly extraItems: CampSceneOptions['extraItems'];
  private readonly names: Readonly<Record<string, string>> | undefined;
  private mode: Mode = { kind: 'main', index: 0 };
  /** The list rows on screen, for taps: filled as the scene is drawn. */
  private hits: Hit[] = [];

  constructor({ army, tables, shops, assets, text, title, onContinue, continueLabel, story, settings, chapter, chapterOrder, flags, onUnlock, extraItems, names }: CampSceneOptions) {
    this.army = army;
    this.names = names;
    this.extraItems = extraItems;
    this.assets = assets;
    this.story = story;
    this.settings = settings ?? DEFAULT_SETTINGS;
    this.chapter = chapter ?? null;
    this.chapterOrder = chapterOrder ?? [];
    this.flags = flags ?? new Set();
    this.onUnlock = onUnlock;
    this.tables = tables;
    this.env = tables;
    this.shops = shops;
    this.text = text;
    this.title = title ?? 'Camp';
    this.onContinue = onContinue;
    this.continueLabel = continueLabel ?? 'Begin the battle';
    this.source = {
      tables,
      classOf: (u) => {
        const found = tables.classes.get(u.classId);
        if (!found) throw new Error(`Unit "${u.id}" has unknown class "${u.classId}"`);
        return found;
      },
      weaponOf: (u) => equippedWeapon(u, tables.weapons),
      supports: army.supports,
      get units() {
        return army.units;
      },
    };
  }

  // ---------------------------------------------------------------- update

  update(dtMs: number, actions: ReadonlySet<Action>, taps: readonly Point[]): void {
    if (this.mode.kind === 'scene') {
      this.mode.player.update(dtMs, actions, taps);
      if (this.mode.player.done) this.mode.then();
      return;
    }
    const merged = this.withTaps(actions, taps);
    switch (this.mode.kind) {
      case 'list':
        return this.updateList(this.mode, merged);
      case 'main':
        return this.updateMain(this.mode, merged);
      case 'units':
        return this.updateUnits(this.mode, merged);
      case 'unit':
        return this.updateUnit(this.mode, merged);
      case 'convoy':
        return this.updateConvoy(this.mode, merged);
      case 'shop':
        return this.updateShop(this.mode, merged);
      case 'promotion':
        if (merged.has('confirm') || merged.has('cancel')) this.mode = this.mode.back;
        return;
    }
  }

  /** A tap on a list row moves the highlight to it; a tap on the highlighted row confirms. */
  private withTaps(actions: ReadonlySet<Action>, taps: readonly Point[]): ReadonlySet<Action> {
    if (taps.length === 0) return actions;
    const merged = new Set(actions);
    for (const tap of taps) {
      const hit = this.hits.find((h) => tap.x >= h.x && tap.x < h.x + h.w && tap.y >= h.y && tap.y < h.y + ROW);
      if (!hit) continue;
      const current = this.highlighted();
      if (current === hit.index) merged.add('confirm');
      else this.highlight(hit.index);
    }
    return merged;
  }

  private highlighted(): number {
    const m = this.mode;
    return m.kind === 'main' || m.kind === 'units' || m.kind === 'shop' || m.kind === 'list' ? m.index : m.kind === 'unit' ? m.slot : m.kind === 'convoy' ? m.row : -1;
  }

  private highlight(index: number): void {
    const m = this.mode;
    if (m.kind === 'main' || m.kind === 'units' || m.kind === 'shop' || m.kind === 'list') m.index = index;
    else if (m.kind === 'unit') m.slot = index;
    else if (m.kind === 'convoy') m.row = index;
  }

  private gate(): SupportGate {
    return { chapter: this.chapter, chapterOrder: this.chapterOrder, flags: this.flags };
  }

  private mainItems(): Array<MenuItem & { run: () => void }> {
    const list = (which: ListKind, index = 0): (() => void) => () => (this.mode = { kind: 'list', which, index, note: null });
    const talks = availableTalks(this.army, this.gate()).length;
    const ready = promotable(this.army, this.env).length;
    const items: Array<MenuItem & { run: () => void }> = [
      { label: 'Preparations', run: list('prepare') },
      { label: 'Units', run: () => (this.mode = { kind: 'units', index: 0 }) },
      { label: `Convoy  ${this.army.convoy.length}/${CONVOY_SLOTS}`, run: () => (this.mode = { kind: 'convoy', unit: 0, col: 0, row: 0, note: null }) },
    ];
    for (const shop of this.shops.values()) items.push({ label: shop.name, run: () => (this.mode = { kind: 'shop', shop, tab: 'buy', index: 0, buyer: 0, note: null }) });
    items.push({ label: `Majlis talks${talks > 0 ? `  (${talks})` : ''}`, run: list('talks') });
    items.push({ label: 'Maydan', run: list('maydan') });
    items.push({ label: `Class${ready > 0 ? `  (${ready})` : ''}`, run: list('class') });
    if (this.army.fallen.length > 0) items.push({ label: 'Casualty roll', run: list('roll') });
    for (const extra of this.extraItems?.() ?? []) items.push({ label: extra.label, run: extra.run });
    const next = this.onContinue;
    if (next) items.push({ label: this.continueLabel, run: next });
    return items;
  }

  private updateMain(mode: Extract<Mode, { kind: 'main' }>, actions: ReadonlySet<Action>): void {
    const items = this.mainItems();
    if (actions.has('up')) mode.index = wrap(mode.index, -1, items.length);
    if (actions.has('down')) mode.index = wrap(mode.index, 1, items.length);
    if (actions.has('confirm')) items[mode.index]?.run();
  }

  private updateUnits(mode: Extract<Mode, { kind: 'units' }>, actions: ReadonlySet<Action>): void {
    const n = this.army.units.length;
    if (actions.has('up')) mode.index = wrap(mode.index, -1, n);
    if (actions.has('down')) mode.index = wrap(mode.index, 1, n);
    if (actions.has('cancel')) this.mode = { kind: 'main', index: 1 };
    else if (actions.has('confirm') && n > 0) this.mode = { kind: 'unit', unit: mode.index, pack: false, slot: 0, note: null };
  }

  private updateUnit(mode: Extract<Mode, { kind: 'unit' }>, actions: ReadonlySet<Action>): void {
    const unit = this.army.units[mode.unit];
    if (!unit) {
      this.mode = { kind: 'units', index: 0 };
      return;
    }
    if (!mode.pack) {
      const n = this.army.units.length;
      if (actions.has('left') || actions.has('up')) mode.unit = wrap(mode.unit, -1, n);
      if (actions.has('right') || actions.has('down')) mode.unit = wrap(mode.unit, 1, n);
      if (actions.has('cancel')) this.mode = { kind: 'units', index: mode.unit };
      else if (actions.has('confirm')) {
        mode.pack = true;
        mode.slot = Math.max(0, Math.min(unit.inventory.length - 1, unit.equipped));
        mode.note = null;
      }
      return;
    }
    const n = unit.inventory.length;
    if (actions.has('cancel') || n === 0) {
      mode.pack = false;
      mode.note = null;
      return;
    }
    if (actions.has('up')) {
      mode.slot = wrap(mode.slot, -1, n);
      mode.note = null;
    }
    if (actions.has('down')) {
      mode.slot = wrap(mode.slot, 1, n);
      mode.note = null;
    }
    if (!actions.has('confirm')) return;
    const stack = unit.inventory[mode.slot];
    if (!stack) return;
    if (this.tables.weapons.has(stack.id)) {
      if (mode.slot === unit.equipped) mode.note = 'Already in hand';
      else mode.note = equipWeapon(unit, mode.slot, this.env) ? null : 'Too high a grade to wield';
    } else if (canUseItem(unit, mode.slot, this.env)) {
      const report = applyItem(unit, mode.slot, this.env);
      mode.slot = Math.max(0, Math.min(unit.inventory.length - 1, mode.slot));
      mode.note = report.restored > 0 ? `Restored ${report.restored} HP` : report.cured.length > 0 ? 'Cured' : null;
      if (report.promotion) this.mode = { kind: 'promotion', result: report.promotion, back: mode };
    } else {
      mode.note = this.tables.items.get(stack.id)?.kind === 'key' ? 'Used at a gate in battle' : 'It would do nothing now';
    }
  }

  private updateConvoy(mode: Extract<Mode, { kind: 'convoy' }>, actions: ReadonlySet<Action>): void {
    const unit = this.army.units[mode.unit];
    if (!unit) {
      this.mode = { kind: 'main', index: 0 };
      return;
    }
    const rows = mode.col === 0 ? unit.inventory.length : this.army.convoy.length;
    if (actions.has('up')) mode.row = wrap(mode.row, -1, rows);
    if (actions.has('down')) mode.row = wrap(mode.row, 1, rows);
    if (actions.has('left') || actions.has('right')) {
      mode.col = mode.col === 0 ? 1 : 0;
      mode.row = 0;
      mode.note = null;
    }
    if (actions.has('info')) {
      mode.unit = wrap(mode.unit, 1, this.army.units.length);
      mode.row = 0;
      mode.note = null;
    }
    if (actions.has('cancel')) {
      this.mode = { kind: 'main', index: 2 };
      return;
    }
    if (!actions.has('confirm')) return;
    const result: Result = mode.col === 0 ? store(this.army, unit, mode.row, this.env) : withdraw(this.army, unit, mode.row, this.env);
    mode.note = result.ok ? null : result.reason;
    const left = mode.col === 0 ? unit.inventory.length : this.army.convoy.length;
    mode.row = Math.max(0, Math.min(left - 1, mode.row));
  }

  // ---------------------------------------------------------------- the list screens

  private mainIndexOf(which: ListKind): number {
    const base = 3 + this.shops.size;
    return which === 'prepare' ? 0 : which === 'talks' ? base : which === 'maydan' ? base + 1 : which === 'class' ? base + 2 : base + 3;
  }

  private listRows(which: ListKind): ListRow[] {
    const { army } = this;
    switch (which) {
      case 'talks':
        return availableTalks(army, this.gate()).map((t) => ({ label: `${t.a.name} and ${t.b.name}`, right: `Rank ${t.rank}` }));
      case 'maydan':
        return army.units.map((u) => {
          const weapon = equippedWeapon(u, this.tables.weapons);
          const drilled = army.camp.drilled.has(u.id);
          const away = isAway(army, u);
          return { label: u.name, right: away ? 'away' : drilled ? 'drilled' : weapon ? kindLabel(weapon.kind) : 'no weapon', dim: away || drilled || !weapon };
        });
      case 'class':
        return promotable(army, this.env).map((p) => ({ label: p.unit.name, right: `to ${p.targetName}` }));
      case 'roll':
        return army.fallen.map((u) => ({ label: u.name, right: `lost in ${army.fallenIn.get(u.id) ?? 'battle'}`, dim: true }));
      case 'prepare':
        return army.units.map((u) => {
          // the font has no tick: a bullet marks who goes, and "must" those the map cannot do without
          const away = isAway(army, u);
          const must = !away && (army.required.has(u.id) || u.tags.includes('lord'));
          return {
            label: `${away || !isDeployed(army, u) ? '  ' : '•'} ${u.name}`,
            right: away ? 'away' : must ? 'must go' : `${this.source.classOf(u).name}  Lv ${u.level}`,
            dim: away || !isDeployed(army, u),
          };
        });
    }
  }

  private updateList(mode: Extract<Mode, { kind: 'list' }>, actions: ReadonlySet<Action>): void {
    const rows = this.listRows(mode.which);
    if (actions.has('up')) mode.index = wrap(mode.index, -1, rows.length);
    if (actions.has('down')) mode.index = wrap(mode.index, 1, rows.length);
    if (actions.has('cancel')) {
      this.mode = { kind: 'main', index: this.mainIndexOf(mode.which) };
      return;
    }
    if (!actions.has('confirm') || rows.length === 0) return;
    mode.index = Math.min(mode.index, rows.length - 1);
    const { army } = this;
    switch (mode.which) {
      case 'talks': {
        const talk = availableTalks(army, this.gate())[mode.index];
        if (talk) this.startTalk(talk, mode);
        return;
      }
      case 'maydan': {
        const unit = army.units[mode.index];
        if (!unit) return;
        const result = drill(army, unit, this.env);
        mode.note = result.ok ? `${unit.name}: ${kindLabel(result.gain.kind)} +${result.gain.amount}${result.gain.gradeUp ? `, grade ${roman(result.gain.gradeUp)}!` : ''}` : result.reason;
        return;
      }
      case 'class': {
        const entry = promotable(army, this.env)[mode.index];
        if (!entry) return;
        const outcome = promoteWithItem(army, entry.unit, this.env);
        if (outcome.ok) {
          mode.index = 0;
          this.mode = { kind: 'promotion', result: outcome.result, back: mode };
        } else mode.note = outcome.reason;
        return;
      }
      case 'roll':
        return;
      case 'prepare': {
        const unit = army.units[mode.index];
        if (!unit) return;
        const result = toggleDeploy(army, unit);
        mode.note = result.ok ? null : result.reason;
        return;
      }
    }
  }

  /** Show a support scene; when it is over the rank takes effect. */
  private startTalk(talk: Talk, back: Extract<Mode, { kind: 'list' }>): void {
    const scene = this.story?.scenes.get(talk.scene.scene);
    if (!this.story || !scene) {
      back.note = 'That scene has not been written yet.';
      return;
    }
    const player = new DialoguePlayer({
      scene,
      characters: this.story.characters,
      assets: this.assets,
      text: this.text,
      settings: this.settings,
      ...(this.names ? { names: this.names } : {}),
      onEffect: (effect) => this.apply(effect),
    });
    audio.playMusic('story');
    this.mode = {
      kind: 'scene',
      player,
      then: () => {
        audio.playMusic('camp');
        audio.playSfx('support');
        completeTalk(this.army, talk, this.gate());
        back.index = 0;
        back.note = `${talk.a.name} and ${talk.b.name}: rank ${talk.rank}`;
        this.mode = back;
      },
    };
  }

  private apply(effect: Effect): void {
    if ('flag' in effect) this.flags.add(effect.flag);
    else if ('unlock' in effect) this.onUnlock?.(effect.unlock);
  }

  /** What the Sell tab offers: the buyer's pack, then the convoy. */
  private sellable(buyer: UnitInstance | undefined): Array<{ from: Source; stack: ItemStack }> {
    const out: Array<{ from: Source; stack: ItemStack }> = [];
    buyer?.inventory.forEach((stack, slot) => out.push({ from: { unit: buyer, slot }, stack }));
    this.army.convoy.forEach((stack, convoyIndex) => out.push({ from: { convoyIndex }, stack }));
    return out;
  }

  private updateShop(mode: Extract<Mode, { kind: 'shop' }>, actions: ReadonlySet<Action>): void {
    const buyer = this.army.units[mode.buyer];
    const rows = mode.tab === 'buy' ? mode.shop.stock.length : this.sellable(buyer).length;
    if (actions.has('up')) mode.index = wrap(mode.index, -1, rows);
    if (actions.has('down')) mode.index = wrap(mode.index, 1, rows);
    if (actions.has('left') || actions.has('right')) {
      mode.tab = mode.tab === 'buy' ? 'sell' : 'buy';
      mode.index = 0;
      mode.note = null;
    }
    if (actions.has('info') && this.army.units.length > 0) {
      mode.buyer = wrap(mode.buyer, 1, this.army.units.length);
      mode.index = mode.tab === 'sell' ? 0 : mode.index;
      mode.note = null;
    }
    if (actions.has('cancel')) {
      const at = [...this.shops.values()].indexOf(mode.shop);
      this.mode = { kind: 'main', index: 3 + Math.max(0, at) };
      return;
    }
    if (!actions.has('confirm')) return;
    if (mode.tab === 'buy') {
      const id = mode.shop.stock[mode.index];
      if (!id) return;
      const result = buy(this.army, mode.shop, id, buyer ?? null, this.env);
      mode.note = result.ok ? `Bought ${stackName(id, this.env)} for ${priceOf(id, this.env)}` : result.reason;
    } else {
      const choice = this.sellable(buyer)[mode.index];
      if (!choice) return;
      const value = sellValue(choice.stack, this.env);
      const name = stackName(choice.stack.id, this.env);
      const result = sell(this.army, choice.from, this.env);
      mode.note = result.ok ? `Sold ${name} for ${value}` : result.reason;
      mode.index = Math.max(0, Math.min(this.sellable(buyer).length - 1, mode.index));
    }
  }

  // ---------------------------------------------------------------- drawing

  draw(ctx: CanvasRenderingContext2D): void {
    this.hits = [];
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    // a band of the camp's colours along the top and bottom
    ctx.fillStyle = COLORS.panelInner;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, 3);
    ctx.fillRect(0, LOGICAL_HEIGHT - 3, LOGICAL_WIDTH, 3);
    const pen: Pen = { ctx, text: this.text };
    const mode = this.mode;
    switch (mode.kind) {
      case 'main':
        this.drawMain(ctx, mode);
        break;
      case 'units':
        this.drawUnits(ctx, mode);
        break;
      case 'unit': {
        const unit = this.army.units[mode.unit];
        if (!unit) break;
        drawInfoPage(pen, this.source, unit, false, '');
        this.text.drawCentered(ctx, `${mode.unit + 1} of ${this.army.units.length}`, LOGICAL_WIDTH / 2, 6, DIM);
        if (mode.pack) drawItemList(pen, this.source, unit, mode.slot, mode.note);
        else this.text.drawCentered(ctx, mode.note ?? 'OK Items   L/R Unit   Back', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 12, DIM);
        break;
      }
      case 'convoy':
        this.drawConvoy(ctx, mode);
        break;
      case 'shop':
        this.drawShop(ctx, mode);
        break;
      case 'promotion':
        drawPromotion(pen, mode.result);
        break;
      case 'list':
        this.drawList(ctx, mode);
        break;
      case 'scene':
        mode.player.draw(ctx);
        break;
    }
  }

  /** A name cut to fit a width, with a full stop where it was cut. */
  private fit(name: string, max: number): string {
    if (this.text.width(name) <= max) return name;
    let cut = name;
    while (cut.length > 1 && this.text.width(`${cut}.`) > max) cut = cut.slice(0, -1);
    return `${cut}.`;
  }

  private drawList(ctx: CanvasRenderingContext2D, mode: Extract<Mode, { kind: 'list' }>): void {
    const rows = this.listRows(mode.which);
    const titles: Record<ListKind, string> = { talks: 'Majlis talks', maydan: 'The Maydan', class: 'Class', roll: 'Casualty roll', prepare: 'Preparations' };
    drawPanel(ctx, 4, 14, LOGICAL_WIDTH - 8, 132);
    this.text.draw(ctx, titles[mode.which], 12, 19, GOLD);
    const header =
      mode.which === 'talks'
        ? `Talks left ${Math.max(0, 3 - this.army.camp.talks)}`
        : mode.which === 'prepare'
          ? `Deployed ${deployedUnits(this.army).length}/${Math.min(this.army.deployLimit, this.army.units.length)}`
          : mode.which === 'roll'
            ? 'Those who left the army'
            : `Dinars ${this.army.dinars}`;
    this.text.drawRight(ctx, header, LOGICAL_WIDTH - 12, 19, mode.which === 'roll' ? DIM : GOLD);
    ctx.fillStyle = COLORS.panelInner;
    ctx.fillRect(10, 30, LOGICAL_WIDTH - 20, 1);
    const visible = 10;
    const top = Math.max(0, Math.min(rows.length - visible, mode.index - Math.floor(visible / 2)));
    rows.slice(top, top + visible).forEach((row, i) => {
      const index = top + i;
      const y = 35 + i * ROW;
      if (index === mode.index && mode.which !== 'roll') this.text.draw(ctx, '→', 9, y, GOLD);
      this.text.draw(ctx, row.label, 18, y, row.dim ? DIM : PLAIN);
      if (row.right) this.text.drawRight(ctx, row.right, LOGICAL_WIDTH - 12, y, row.dim ? DIM : { color: COLORS.good });
      this.hits.push({ x: 8, y, w: LOGICAL_WIDTH - 16, index });
    });
    if (rows.length === 0) {
      const empty: Record<ListKind, string[]> = {
        talks: ['No one has anything to say yet.', 'Friends who fight side by side talk more.'],
        maydan: ['There is no one to drill.'],
        class: ['No one is ready for promotion.', 'A unit needs level 10 and a Charter or a Diploma.'],
        roll: ['No one has left the army.'],
        prepare: ['There is no one to choose.'],
      };
      empty[mode.which].forEach((line, i) => this.text.draw(ctx, line, 18, 38 + i * 11, DIM));
    }
    const hint: Record<ListKind, string> = { talks: 'OK Hear the talk   Back', maydan: 'OK Drill   Back', class: 'OK Promote   Back', roll: 'Back', prepare: 'OK Choose or release   Back' };
    this.text.drawCentered(ctx, mode.note ?? hint[mode.which], LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 12, mode.note ? { color: COLORS.good } : DIM);
  }

  private dinars(ctx: CanvasRenderingContext2D): void {
    this.text.drawRight(ctx, `Dinars ${this.army.dinars}`, LOGICAL_WIDTH - 8, 7, GOLD);
  }

  private drawMain(ctx: CanvasRenderingContext2D, mode: Extract<Mode, { kind: 'main' }>): void {
    const items = this.mainItems();
    this.text.drawCentered(ctx, this.title, LOGICAL_WIDTH / 2, 8, { color: COLORS.text, shadow: COLORS.ink, scale: 2 });
    this.text.drawRight(ctx, `Dinars ${this.army.dinars}`, LOGICAL_WIDTH - 8, 26, GOLD);
    const { w } = menuSize(this.text, items);
    const x = Math.round((LOGICAL_WIDTH - w) / 2);
    const y = 36;
    drawMenu(ctx, this.text, items, mode.index, x, y);
    items.forEach((_, i) => this.hits.push({ x, y: y + 5 + i * 11, w, index: i }));
  }

  private drawUnits(ctx: CanvasRenderingContext2D, mode: Extract<Mode, { kind: 'units' }>): void {
    drawPanel(ctx, 4, 14, LOGICAL_WIDTH - 8, 132);
    this.text.draw(ctx, 'Units', 12, 19, GOLD);
    this.dinars(ctx);
    const visible = 11;
    const top = Math.max(0, Math.min(this.army.units.length - visible, mode.index - Math.floor(visible / 2)));
    this.army.units.slice(top, top + visible).forEach((unit, i) => {
      const index = top + i;
      const y = 31 + i * ROW;
      if (index === mode.index) this.text.draw(ctx, '→', 9, y, GOLD);
      this.text.draw(ctx, unit.name, 18, y, PLAIN);
      this.text.drawRight(ctx, isAway(this.army, unit) ? 'away' : `${this.source.classOf(unit).name}  Lv ${unit.level}`, LOGICAL_WIDTH - 12, y, DIM);
      this.hits.push({ x: 8, y, w: LOGICAL_WIDTH - 16, index });
    });
    if (this.army.units.length === 0) this.text.draw(ctx, 'No one is in the army.', 18, 31, DIM);
    this.text.drawCentered(ctx, 'OK Look at a unit   Back', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 12, DIM);
  }

  private drawConvoy(ctx: CanvasRenderingContext2D, mode: Extract<Mode, { kind: 'convoy' }>): void {
    const unit = this.army.units[mode.unit];
    drawPanel(ctx, 4, 14, LOGICAL_WIDTH - 8, 132);
    this.text.draw(ctx, 'Convoy', 12, 19, GOLD);
    this.dinars(ctx);
    const mid = 118;
    ctx.fillStyle = COLORS.panelInner;
    ctx.fillRect(mid, 30, 1, 78);
    ctx.fillRect(10, 109, LOGICAL_WIDTH - 20, 1);
    // the unit's pack on the left
    this.text.draw(ctx, this.fit(`${unit?.name ?? 'No one'}  ${unit?.inventory.length ?? 0}/${INVENTORY_SLOTS}`, mid - 16), 12, 31, PLAIN);
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const stack = unit?.inventory[i];
      const y = 43 + i * ROW;
      if (mode.col === 0 && mode.row === i) this.text.draw(ctx, '→', 9, y, GOLD);
      if (stack) {
        this.text.draw(ctx, this.fit(stackName(stack.id, this.env), mid - 36), 18, y, i === unit?.equipped ? GOLD : PLAIN);
        this.hits.push({ x: 8, y, w: mid - 12, index: i });
      } else {
        this.text.draw(ctx, '—', 18, y, DIM);
      }
    }
    // the convoy on the right
    this.text.draw(ctx, `Baggage  ${this.army.convoy.length}/${CONVOY_SLOTS}`, mid + 8, 31, PLAIN);
    const visible = 7;
    const top = Math.max(0, Math.min(this.army.convoy.length - visible, mode.col === 1 ? mode.row - Math.floor(visible / 2) : 0));
    this.army.convoy.slice(top, top + visible).forEach((stack, i) => {
      const index = top + i;
      const y = 43 + i * ROW;
      if (mode.col === 1 && mode.row === index) this.text.draw(ctx, '→', mid + 5, y, GOLD);
      this.text.draw(ctx, this.fit(stackName(stack.id, this.env), LOGICAL_WIDTH - mid - 40), mid + 14, y, PLAIN);
      this.text.drawRight(ctx, String(stack.uses), LOGICAL_WIDTH - 12, y, DIM);
      this.hits.push({ x: mid + 4, y, w: LOGICAL_WIDTH - mid - 12, index });
    });
    if (this.army.convoy.length === 0) this.text.draw(ctx, 'Nothing in the baggage', mid + 14, 43, DIM);
    // the whole name of what is highlighted, with its uses
    const pointed = mode.col === 0 ? unit?.inventory[mode.row] : this.army.convoy[mode.row];
    if (pointed) this.text.draw(ctx, `${stackName(pointed.id, this.env)}  ${pointed.uses} uses${mode.col === 0 && mode.row === unit?.equipped ? '  (in hand)' : ''}`, 12, 113, DIM);
    this.text.drawCentered(ctx, mode.note ?? (mode.col === 0 ? 'OK Store   R Baggage   A Unit   Back' : 'OK Take   L Pack   A Unit   Back'), LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 12, mode.note ? { color: COLORS.bad } : DIM);
  }

  private drawShop(ctx: CanvasRenderingContext2D, mode: Extract<Mode, { kind: 'shop' }>): void {
    const buyer = this.army.units[mode.buyer];
    drawPanel(ctx, 4, 14, LOGICAL_WIDTH - 8, 132);
    this.text.draw(ctx, mode.shop.name, 12, 19, GOLD);
    this.dinars(ctx);
    // tabs
    this.text.draw(ctx, 'Buy', 12, 31, mode.tab === 'buy' ? PLAIN : DIM);
    this.text.draw(ctx, 'Sell', 40, 31, mode.tab === 'sell' ? PLAIN : DIM);
    this.text.drawRight(ctx, `${mode.tab === 'buy' ? 'To' : 'From'} ${buyer?.name ?? 'the convoy'}  ${buyer?.inventory.length ?? 0}/${INVENTORY_SLOTS}`, LOGICAL_WIDTH - 12, 31, DIM);
    ctx.fillStyle = COLORS.panelInner;
    ctx.fillRect(10, 41, LOGICAL_WIDTH - 20, 1);

    const rows: Array<{ id: string; name: string; price: number; uses: number | null; ok: boolean }> =
      mode.tab === 'buy'
        ? mode.shop.stock.map((id) => ({ id, name: stackName(id, this.env), price: priceOf(id, this.env), uses: null, ok: this.army.dinars >= priceOf(id, this.env) }))
        : this.sellable(buyer).map(({ stack }) => ({ id: stack.id, name: stackName(stack.id, this.env), price: sellValue(stack, this.env), uses: stack.uses, ok: priceOf(stack.id, this.env) > 0 }));
    const visible = 7;
    const top = Math.max(0, Math.min(rows.length - visible, mode.index - Math.floor(visible / 2)));
    rows.slice(top, top + visible).forEach((row, i) => {
      const index = top + i;
      const y = 46 + i * ROW;
      if (index === mode.index) this.text.draw(ctx, '→', 9, y, GOLD);
      this.text.draw(ctx, row.name, 18, y, row.ok ? PLAIN : DIM);
      if (row.uses !== null) this.text.draw(ctx, `(${row.uses})`, 120, y, DIM);
      this.text.drawRight(ctx, String(row.price), LOGICAL_WIDTH - 12, y, row.ok ? { color: COLORS.good } : DIM);
      this.hits.push({ x: 8, y, w: LOGICAL_WIDTH - 16, index });
    });
    if (rows.length === 0) this.text.draw(ctx, mode.tab === 'buy' ? 'Nothing for sale' : 'Nothing to sell', 18, 46, DIM);
    else this.text.draw(ctx, `${mode.index + 1}/${rows.length}`, 74, 31, DIM);

    // what the highlighted thing is
    const row = rows[mode.index];
    const weapon = row ? this.tables.weapons.get(row.id) : undefined;
    const item = row ? this.tables.items.get(row.id) : undefined;
    const detail = weapon
      ? weapon.kind === 'remedy'
        ? `Heals ${weapon.might}  Range ${rangeText(weapon)}  ${weapon.uses} uses`
        : `${kindLabel(weapon.kind)} ${roman(weapon.grade)}  Might ${weapon.might}  Hit ${weapon.hit}  Wt ${weapon.weight}  Rng ${rangeText(weapon)}`
      : (item?.description ?? '');
    ctx.fillRect(10, 119, LOGICAL_WIDTH - 20, 1);
    this.text.draw(ctx, detail, 12, 123, DIM);
    this.text.drawCentered(ctx, mode.note ?? (mode.tab === 'buy' ? 'OK Buy   L/R Sell   A Buyer   Back' : 'OK Sell   L/R Buy   A Unit   Back'), LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 12, mode.note ? { color: COLORS.good } : DIM);
  }
}
