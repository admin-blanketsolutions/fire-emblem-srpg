import { buy, CONVOY_SLOTS, sell, store, withdraw, type Army, type Result } from '../core/army';
import type { BattleTables } from '../core/battle';
import type { Action } from '../core/input';
import { applyItem, canUseItem, equipWeapon, priceOf, sellValue, stackName, type InventoryEnv } from '../core/inventory';
import { kindLabel, roman } from '../core/labels';
import type { PromotionResult } from '../core/promotion';
import type { ShopDef, ShopTable } from '../core/shop';
import { INVENTORY_SLOTS, equippedWeapon, type ItemStack, type UnitInstance } from '../core/unit';
import type { Point } from '../core/types';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/viewport';
import type { Assets } from '../engine/assets';
import type { Scene } from '../engine/game';
import type { TextRenderer, TextStyle } from '../engine/text';
import { COLORS } from '../engine/theme';
import { drawMenu, drawPanel, menuSize, type MenuItem } from '../engine/ui';
import { drawInfoPage, drawItemList, drawPromotion, rangeText, type Pen, type UnitSource } from './battleWindows';

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
  | { kind: 'promotion'; result: PromotionResult; back: Mode };

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
  private mode: Mode = { kind: 'main', index: 0 };
  /** The list rows on screen, for taps: filled as the scene is drawn. */
  private hits: Hit[] = [];

  constructor({ army, tables, shops, text, title, onContinue, continueLabel }: CampSceneOptions) {
    this.army = army;
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
    };
  }

  // ---------------------------------------------------------------- update

  update(_dtMs: number, actions: ReadonlySet<Action>, taps: readonly Point[]): void {
    const merged = this.withTaps(actions, taps);
    switch (this.mode.kind) {
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
    return m.kind === 'main' || m.kind === 'units' || m.kind === 'shop' ? m.index : m.kind === 'unit' ? m.slot : m.kind === 'convoy' ? m.row : -1;
  }

  private highlight(index: number): void {
    const m = this.mode;
    if (m.kind === 'main' || m.kind === 'units' || m.kind === 'shop') m.index = index;
    else if (m.kind === 'unit') m.slot = index;
    else if (m.kind === 'convoy') m.row = index;
  }

  private mainItems(): Array<MenuItem & { run: () => void }> {
    const items: Array<MenuItem & { run: () => void }> = [
      { label: 'Units', run: () => (this.mode = { kind: 'units', index: 0 }) },
      { label: `Convoy  ${this.army.convoy.length}/${CONVOY_SLOTS}`, run: () => (this.mode = { kind: 'convoy', unit: 0, col: 0, row: 0, note: null }) },
    ];
    for (const shop of this.shops.values()) items.push({ label: shop.name, run: () => (this.mode = { kind: 'shop', shop, tab: 'buy', index: 0, buyer: 0, note: null }) });
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
    if (actions.has('cancel')) this.mode = { kind: 'main', index: 0 };
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
      this.mode = { kind: 'main', index: 1 };
      return;
    }
    if (!actions.has('confirm')) return;
    const result: Result = mode.col === 0 ? store(this.army, unit, mode.row, this.env) : withdraw(this.army, unit, mode.row, this.env);
    mode.note = result.ok ? null : result.reason;
    const left = mode.col === 0 ? unit.inventory.length : this.army.convoy.length;
    mode.row = Math.max(0, Math.min(left - 1, mode.row));
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
      this.mode = { kind: 'main', index: 2 + Math.max(0, at) };
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
    }
  }

  /** A name cut to fit a width, with a full stop where it was cut. */
  private fit(name: string, max: number): string {
    if (this.text.width(name) <= max) return name;
    let cut = name;
    while (cut.length > 1 && this.text.width(`${cut}.`) > max) cut = cut.slice(0, -1);
    return `${cut}.`;
  }

  private dinars(ctx: CanvasRenderingContext2D): void {
    this.text.drawRight(ctx, `Dinars ${this.army.dinars}`, LOGICAL_WIDTH - 8, 7, GOLD);
  }

  private drawMain(ctx: CanvasRenderingContext2D, mode: Extract<Mode, { kind: 'main' }>): void {
    const items = this.mainItems();
    this.text.drawCentered(ctx, this.title, LOGICAL_WIDTH / 2, 14, { color: COLORS.text, shadow: COLORS.ink, scale: 2 });
    this.dinars(ctx);
    const { w, h } = menuSize(this.text, items);
    const x = Math.round((LOGICAL_WIDTH - w) / 2);
    const y = 46;
    drawMenu(ctx, this.text, items, mode.index, x, y);
    items.forEach((_, i) => this.hits.push({ x, y: y + 5 + i * 11, w, index: i }));
    const living = this.army.units.length;
    this.text.drawCentered(ctx, `${living} ${living === 1 ? 'soldier' : 'soldiers'} in the army`, LOGICAL_WIDTH / 2, y + h + 8, DIM);
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
      this.text.drawRight(ctx, `${this.source.classOf(unit).name}  Lv ${unit.level}`, LOGICAL_WIDTH - 12, y, DIM);
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
