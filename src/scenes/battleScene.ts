import type { BattleState, UnitInstance } from '../core/battle';
import { cameraToInclude, clampCamera, type CameraPos } from '../core/camera';
import { tileKey } from '../core/grid';
import type { Action } from '../core/input';
import { pathTo, type ReachResult } from '../core/pathfinding';
import type { Point } from '../core/types';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/viewport';
import type { Assets } from '../engine/assets';
import type { Scene } from '../engine/game';
import type { TextRenderer } from '../engine/text';
import { COLORS } from '../engine/theme';
import { drawGauge, drawMenu, drawPanel, menuSize, type MenuItem } from '../engine/ui';

const TILE = 16;
/** Time a unit takes to cross one tile. */
const STEP_MS = 80;
const BANNER_MS = 850;
const POPUP_MS = 800;
const FLASH_MS = 320;
const GHOST_MS = 600;
/** How long input is locked after an attack so the result can be read. */
const BUSY_MS = 520;
/** Camera speed in pixels per millisecond. */
const CAMERA_SPEED = 0.24;

interface ActionItem extends MenuItem {
  readonly id: 'attack' | 'wait';
}

type Mode =
  | { kind: 'banner'; text: string; sub: string; left: number; next: () => void }
  | { kind: 'free' }
  | { kind: 'selected'; unit: UnitInstance; reach: ReachResult; threat: Point[] }
  | { kind: 'moving'; unit: UnitInstance; path: Point[]; elapsed: number; origin: Point }
  | { kind: 'action'; unit: UnitInstance; origin: Point; items: ActionItem[]; index: number }
  | { kind: 'target'; unit: UnitInstance; origin: Point; targets: UnitInstance[]; index: number }
  | { kind: 'busy'; left: number }
  | { kind: 'menu'; index: number };

interface Popup {
  readonly text: string;
  readonly color: string;
  /** World pixel position of the tile's centre top. */
  readonly x: number;
  readonly y: number;
  age: number;
}

interface Ghost {
  readonly unit: UnitInstance;
  age: number;
}

export interface BattleSceneOptions {
  readonly battle: BattleState;
  readonly assets: Assets;
  readonly text: TextRenderer;
}

/**
 * The battle screen: a tile map with a cursor, unit selection, movement, an action menu and
 * a basic attack. The rules live in `BattleState`; this class is input handling and drawing.
 */
export class BattleScene implements Scene {
  private readonly battle: BattleState;
  private readonly assets: Assets;
  private readonly text: TextRenderer;
  private readonly mapLayer: HTMLCanvasElement;
  private readonly mapWidthPx: number;
  private readonly mapHeightPx: number;

  private mode: Mode = { kind: 'free' };
  private cursor: Point;
  private cam: CameraPos;
  private camTarget: CameraPos;
  private clock = 0;
  private inspected: { unit: UnitInstance; tiles: Set<number> } | null = null;
  private dangerOn = false;
  private dangerCache: Set<number> | null = null;
  private infoOpen = false;
  private readonly popups: Popup[] = [];
  private readonly flashes = new Map<string, number>();
  private readonly ghosts: Ghost[] = [];

  constructor({ battle, assets, text }: BattleSceneOptions) {
    this.battle = battle;
    this.assets = assets;
    this.text = text;
    this.mapWidthPx = battle.map.width * TILE;
    this.mapHeightPx = battle.map.height * TILE;
    this.mapLayer = this.renderMapLayer();
    const first = battle.livingUnits('player')[0];
    this.cursor = first ? { x: first.x, y: first.y } : { x: 0, y: 0 };
    this.cam = clampCamera(
      this.cursor.x * TILE + TILE / 2 - LOGICAL_WIDTH / 2,
      this.cursor.y * TILE + TILE / 2 - LOGICAL_HEIGHT / 2,
      this.mapWidthPx,
      this.mapHeightPx,
      LOGICAL_WIDTH,
      LOGICAL_HEIGHT,
    );
    this.camTarget = this.cam;
    this.startBanner('Player Phase', `Turn ${battle.turn}`, () => {
      this.mode = { kind: 'free' };
    });
  }

  // ---------------------------------------------------------------- update

  update(dtMs: number, actions: ReadonlySet<Action>, taps: readonly Point[]): void {
    this.clock += dtMs;
    this.updateEffects(dtMs);
    this.updateCamera(dtMs);
    const mode = this.mode;
    switch (mode.kind) {
      case 'banner':
        mode.left -= dtMs;
        if (mode.left <= 0 || actions.has('confirm')) mode.next();
        break;
      case 'free':
        this.updateFree(this.withTaps(actions, taps));
        break;
      case 'selected':
        this.updateSelected(mode, this.withTaps(actions, taps));
        break;
      case 'moving':
        this.updateMoving(mode, dtMs);
        break;
      case 'action':
        this.updateAction(mode, actions);
        break;
      case 'target':
        this.updateTarget(mode, this.withTaps(actions, taps));
        break;
      case 'busy':
        mode.left -= dtMs;
        if (mode.left <= 0) this.afterAction();
        break;
      case 'menu':
        this.updateMenu(mode, actions);
        break;
    }
  }

  private updateEffects(dtMs: number): void {
    for (const p of this.popups) p.age += dtMs;
    for (let i = this.popups.length - 1; i >= 0; i--) if ((this.popups[i]?.age ?? 0) > POPUP_MS) this.popups.splice(i, 1);
    for (const [id, left] of this.flashes) {
      if (left - dtMs <= 0) this.flashes.delete(id);
      else this.flashes.set(id, left - dtMs);
    }
    for (const g of this.ghosts) g.age += dtMs;
    for (let i = this.ghosts.length - 1; i >= 0; i--) if ((this.ghosts[i]?.age ?? 0) > GHOST_MS) this.ghosts.splice(i, 1);
  }

  private updateCamera(dtMs: number): void {
    const step = CAMERA_SPEED * dtMs;
    const chase = (cur: number, target: number): number => {
      const delta = target - cur;
      return Math.abs(delta) <= step ? target : cur + Math.sign(delta) * step;
    };
    this.cam = { x: chase(this.cam.x, this.camTarget.x), y: chase(this.cam.y, this.camTarget.y) };
  }

  private updateFree(actions: ReadonlySet<Action>): void {
    this.moveCursor(actions);
    if (actions.has('info')) this.infoOpen = !this.infoOpen;
    if (actions.has('danger')) this.toggleDanger();
    if (actions.has('menu')) {
      this.mode = { kind: 'menu', index: 0 };
      return;
    }
    if (actions.has('cancel')) {
      if (this.infoOpen) this.infoOpen = false;
      else this.inspected = null;
    }
    if (actions.has('confirm')) this.confirmFree();
  }

  private confirmFree(): void {
    const unit = this.battle.unitAt(this.cursor.x, this.cursor.y);
    if (unit && unit.side === 'player' && !unit.acted) {
      this.inspected = null;
      this.infoOpen = false;
      this.select(unit);
    } else if (unit) {
      this.inspected = this.inspected?.unit === unit ? null : this.inspect(unit);
    } else {
      this.mode = { kind: 'menu', index: 0 };
    }
  }

  private select(unit: UnitInstance): void {
    const reach = this.battle.reachFor(unit);
    this.mode = { kind: 'selected', unit, reach, threat: this.battle.threatTiles(unit, reach) };
  }

  private inspect(unit: UnitInstance): { unit: UnitInstance; tiles: Set<number> } {
    const reach = this.battle.reachFor(unit);
    const tiles = new Set<number>();
    for (const p of reach.stops) tiles.add(tileKey(p.x, p.y));
    for (const p of this.battle.threatTiles(unit, reach)) tiles.add(tileKey(p.x, p.y));
    return { unit, tiles };
  }

  private updateSelected(mode: Extract<Mode, { kind: 'selected' }>, actions: ReadonlySet<Action>): void {
    this.moveCursor(actions);
    if (actions.has('info')) this.infoOpen = !this.infoOpen;
    if (actions.has('cancel')) {
      if (this.infoOpen) {
        this.infoOpen = false;
        return;
      }
      this.setCursor(mode.unit.x, mode.unit.y);
      this.mode = { kind: 'free' };
      return;
    }
    if (actions.has('confirm')) {
      const dest = this.cursor;
      if (!mode.reach.stops.some((p) => p.x === dest.x && p.y === dest.y)) return;
      const origin = { x: mode.unit.x, y: mode.unit.y };
      const path = this.battle.moveUnit(mode.unit, dest, mode.reach);
      if (!path) return;
      this.dangerCache = null;
      this.infoOpen = false;
      this.mode = { kind: 'moving', unit: mode.unit, path, elapsed: 0, origin };
    }
  }

  private updateMoving(mode: Extract<Mode, { kind: 'moving' }>, dtMs: number): void {
    mode.elapsed += dtMs;
    const total = (mode.path.length - 1) * STEP_MS;
    const at = this.walkTile(mode);
    this.cursor = at;
    this.followCursor();
    if (mode.elapsed >= total) this.openActionMenu(mode.unit, mode.origin);
  }

  private openActionMenu(unit: UnitInstance, origin: Point): void {
    const items: ActionItem[] = [];
    if (this.battle.targetsFrom(unit, unit).length > 0) items.push({ id: 'attack', label: 'Attack' });
    items.push({ id: 'wait', label: 'Wait' });
    this.setCursor(unit.x, unit.y);
    this.mode = { kind: 'action', unit, origin, items, index: 0 };
  }

  private updateAction(mode: Extract<Mode, { kind: 'action' }>, actions: ReadonlySet<Action>): void {
    if (actions.has('up')) mode.index = (mode.index + mode.items.length - 1) % mode.items.length;
    if (actions.has('down')) mode.index = (mode.index + 1) % mode.items.length;
    if (actions.has('cancel')) {
      // take the move back and reselect the unit
      mode.unit.x = mode.origin.x;
      mode.unit.y = mode.origin.y;
      mode.unit.moved = false;
      this.dangerCache = null;
      this.setCursor(mode.origin.x, mode.origin.y);
      this.select(mode.unit);
      return;
    }
    if (!actions.has('confirm')) return;
    const choice = mode.items[mode.index];
    if (choice?.id === 'attack') {
      const targets = this.battle.targetsFrom(mode.unit, mode.unit);
      const first = targets[0];
      if (!first) return;
      this.setCursor(first.x, first.y);
      this.mode = { kind: 'target', unit: mode.unit, origin: mode.origin, targets, index: 0 };
    } else if (choice?.id === 'wait') {
      this.battle.wait(mode.unit);
      this.dangerCache = null;
      this.afterAction();
    }
  }

  private updateTarget(mode: Extract<Mode, { kind: 'target' }>, actions: ReadonlySet<Action>): void {
    const count = mode.targets.length;
    const previous = actions.has('left') || actions.has('up');
    const next = actions.has('right') || actions.has('down');
    if (previous || next) {
      mode.index = (mode.index + (next ? 1 : count - 1)) % count;
      const t = mode.targets[mode.index];
      if (t) this.setCursor(t.x, t.y);
    }
    if (actions.has('cancel')) {
      this.openActionMenu(mode.unit, mode.origin);
      return;
    }
    if (!actions.has('confirm')) return;
    // a tap or cursor move that landed on another target selects it first
    const at = mode.targets.findIndex((t) => t.x === this.cursor.x && t.y === this.cursor.y);
    if (at >= 0 && at !== mode.index) {
      mode.index = at;
      return;
    }
    const target = mode.targets[mode.index];
    if (target) this.performAttack(mode.unit, target);
  }

  private performAttack(attacker: UnitInstance, defender: UnitInstance): void {
    const report = this.battle.attack(attacker, defender);
    this.dangerCache = null;
    this.popup(defender, report.damage > 0 ? String(report.damage) : 'No damage', report.damage > 0 ? COLORS.white : COLORS.textDim);
    this.flashes.set(defender.id, FLASH_MS);
    if (report.counterDamage !== null) {
      this.popup(attacker, report.counterDamage > 0 ? String(report.counterDamage) : 'No damage', report.counterDamage > 0 ? COLORS.white : COLORS.textDim);
      this.flashes.set(attacker.id, FLASH_MS);
    }
    for (const unit of report.defeated) {
      this.ghosts.push({ unit, age: 0 });
      this.popup(unit, 'Retreats', COLORS.bad, 10);
    }
    this.setCursor(attacker.x, attacker.y);
    this.mode = { kind: 'busy', left: BUSY_MS };
  }

  private afterAction(): void {
    this.mode = { kind: 'free' };
    if (this.battle.isSideSpent('player')) this.beginEnemyPhase();
  }

  private updateMenu(mode: Extract<Mode, { kind: 'menu' }>, actions: ReadonlySet<Action>): void {
    const items = this.menuItems();
    if (actions.has('up')) mode.index = (mode.index + items.length - 1) % items.length;
    if (actions.has('down')) mode.index = (mode.index + 1) % items.length;
    if (actions.has('cancel') || actions.has('menu')) {
      this.mode = { kind: 'free' };
      return;
    }
    if (!actions.has('confirm')) return;
    if (mode.index === 0) {
      this.mode = { kind: 'free' };
      this.beginEnemyPhase();
    } else if (mode.index === 1) {
      this.toggleDanger();
    } else {
      this.mode = { kind: 'free' };
    }
  }

  private menuItems(): MenuItem[] {
    return [{ label: 'End Turn' }, { label: `Danger Zone: ${this.dangerOn ? 'On' : 'Off'}` }, { label: 'Resume' }];
  }

  private beginEnemyPhase(): void {
    this.inspected = null;
    this.infoOpen = false;
    this.battle.endPlayerPhase();
    this.startBanner('Enemy Phase', '', () => {
      // The enemy has no behaviour until milestone M3, so its phase passes at once.
      this.battle.endEnemyPhase();
      this.dangerCache = null;
      const first = this.battle.livingUnits('player')[0];
      if (first) this.setCursor(first.x, first.y);
      this.startBanner('Player Phase', `Turn ${this.battle.turn}`, () => {
        this.mode = { kind: 'free' };
      });
    });
  }

  private startBanner(text: string, sub: string, next: () => void): void {
    this.mode = { kind: 'banner', text, sub, left: BANNER_MS, next };
  }

  private toggleDanger(): void {
    this.dangerOn = !this.dangerOn;
    this.dangerCache = null;
  }

  // ---------------------------------------------------------------- cursor and camera

  /** Apply taps: a tap elsewhere moves the cursor; a tap on the cursor tile counts as Confirm. */
  private withTaps(actions: ReadonlySet<Action>, taps: readonly Point[]): ReadonlySet<Action> {
    if (taps.length === 0) return actions;
    const merged = new Set(actions);
    for (const tap of taps) {
      const tile = this.tileAtScreen(tap);
      if (!tile || !this.battle.map.inBounds(tile.x, tile.y)) continue;
      if (tile.x === this.cursor.x && tile.y === this.cursor.y) merged.add('confirm');
      else this.setCursor(tile.x, tile.y);
    }
    return merged;
  }

  private tileAtScreen(p: Point): Point {
    return { x: Math.floor((p.x + Math.round(this.cam.x)) / TILE), y: Math.floor((p.y + Math.round(this.cam.y)) / TILE) };
  }

  private moveCursor(actions: ReadonlySet<Action>): void {
    const dx = (actions.has('right') ? 1 : 0) - (actions.has('left') ? 1 : 0);
    const dy = (actions.has('down') ? 1 : 0) - (actions.has('up') ? 1 : 0);
    if (dx !== 0 || dy !== 0) this.setCursor(this.cursor.x + dx, this.cursor.y + dy);
  }

  private setCursor(x: number, y: number): void {
    const { width, height } = this.battle.map;
    this.cursor = { x: Math.max(0, Math.min(width - 1, x)), y: Math.max(0, Math.min(height - 1, y)) };
    this.followCursor();
  }

  private followCursor(): void {
    this.camTarget = cameraToInclude(
      this.camTarget,
      this.cursor.x,
      this.cursor.y,
      TILE,
      2,
      this.mapWidthPx,
      this.mapHeightPx,
      LOGICAL_WIDTH,
      LOGICAL_HEIGHT,
    );
  }

  // ---------------------------------------------------------------- helpers

  /** The tile a walking unit is on, from the elapsed time. */
  private walkTile(mode: Extract<Mode, { kind: 'moving' }>): Point {
    const index = Math.min(mode.path.length - 1, Math.floor(mode.elapsed / STEP_MS));
    return mode.path[index] ?? mode.origin;
  }

  /** Pixel position of a unit's tile corner, interpolated while it walks. */
  private unitPixel(unit: UnitInstance): Point {
    const mode = this.mode;
    if (mode.kind === 'moving' && mode.unit === unit) {
      const total = (mode.path.length - 1) * STEP_MS;
      const t = Math.min(mode.elapsed, total) / STEP_MS;
      const i = Math.min(mode.path.length - 1, Math.floor(t));
      const a = mode.path[i] ?? mode.origin;
      const b = mode.path[Math.min(mode.path.length - 1, i + 1)] ?? a;
      const f = t - i;
      return { x: Math.round((a.x + (b.x - a.x) * f) * TILE), y: Math.round((a.y + (b.y - a.y) * f) * TILE) };
    }
    return { x: unit.x * TILE, y: unit.y * TILE };
  }

  private popup(unit: UnitInstance, text: string, color: string, lift = 0): void {
    this.popups.push({ text, color, x: unit.x * TILE + TILE / 2, y: unit.y * TILE - lift, age: 0 });
  }

  private dangerSet(): Set<number> {
    if (this.dangerCache) return this.dangerCache;
    const tiles = new Set<number>();
    for (const enemy of this.battle.livingUnits('enemy')) {
      const reach = this.battle.reachFor(enemy);
      for (const p of reach.stops) tiles.add(tileKey(p.x, p.y));
      for (const p of this.battle.threatTiles(enemy, reach)) tiles.add(tileKey(p.x, p.y));
    }
    this.dangerCache = tiles;
    return tiles;
  }

  /** The unit the information windows describe: the selected or acting unit, else the one under the cursor. */
  private focusUnit(): UnitInstance | undefined {
    const mode = this.mode;
    if (mode.kind === 'selected' || mode.kind === 'action') return mode.unit;
    if (mode.kind === 'target') return mode.targets[mode.index];
    return this.battle.unitAt(this.cursor.x, this.cursor.y);
  }

  // ---------------------------------------------------------------- drawing

  private renderMapLayer(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.mapWidthPx;
    canvas.height = this.mapHeightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    const { map } = this.battle;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const id = `tile.${map.terrainAt(x, y).id}`;
        if (this.assets.has(id)) {
          ctx.drawImage(this.assets.frame(id, 'still', 0), x * TILE, y * TILE);
        } else {
          ctx.fillStyle = '#ff00ff'; // missing art is loud, not fatal
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        }
      }
    }
    return canvas;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    const camX = Math.round(this.cam.x);
    const camY = Math.round(this.cam.y);
    ctx.drawImage(this.mapLayer, -camX, -camY);
    this.drawOverlays(ctx, camX, camY);
    this.drawUnits(ctx, camX, camY);
    this.drawCursor(ctx, camX, camY);
    this.drawPopups(ctx, camX, camY);
    this.drawInterface(ctx, camX, camY);
  }

  private fillTile(ctx: CanvasRenderingContext2D, x: number, y: number, camX: number, camY: number, color: string): void {
    ctx.fillStyle = color;
    ctx.fillRect(x * TILE - camX, y * TILE - camY, TILE, TILE);
  }

  private fillKeys(ctx: CanvasRenderingContext2D, keys: Iterable<number>, camX: number, camY: number, color: string): void {
    for (const key of keys) this.fillTile(ctx, key % 4096, Math.floor(key / 4096), camX, camY, color);
  }

  private drawOverlays(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    if (this.dangerOn) this.fillKeys(ctx, this.dangerSet(), camX, camY, COLORS.danger);
    if (this.inspected) this.fillKeys(ctx, this.inspected.tiles, camX, camY, COLORS.attack);
    const mode = this.mode;
    if (mode.kind === 'selected') {
      const stops = new Set(mode.reach.stops.map((p) => tileKey(p.x, p.y)));
      for (const p of mode.threat) if (!stops.has(tileKey(p.x, p.y))) this.fillTile(ctx, p.x, p.y, camX, camY, COLORS.attack);
      this.fillKeys(ctx, stops, camX, camY, COLORS.reach);
      const path = pathTo(mode.reach, this.cursor);
      if (path && path.length > 1) {
        ctx.fillStyle = COLORS.path;
        for (const p of path.slice(1)) ctx.fillRect(p.x * TILE - camX + 6, p.y * TILE - camY + 6, 4, 4);
      }
    } else if (mode.kind === 'target') {
      for (const t of mode.targets) this.fillTile(ctx, t.x, t.y, camX, camY, COLORS.attack);
    }
  }

  private drawUnits(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const drawables: Array<{ unit: UnitInstance; alpha: number }> = [
      ...this.battle.livingUnits().map((unit) => ({ unit, alpha: 1 })),
      ...this.ghosts.map((g) => ({ unit: g.unit, alpha: Math.max(0, 1 - g.age / GHOST_MS) })),
    ];
    drawables.sort((a, b) => a.unit.y - b.unit.y || a.unit.x - b.unit.x);
    const showBarsFor = this.mode.kind === 'target' ? new Set(this.mode.targets) : null;
    for (const { unit, alpha } of drawables) {
      const flashLeft = this.flashes.get(unit.id);
      if (flashLeft !== undefined && Math.floor(flashLeft / 60) % 2 === 1) continue;
      const pos = this.unitPixel(unit);
      const x = pos.x - camX;
      const y = pos.y - camY;
      if (x <= -TILE || y <= -TILE || x >= LOGICAL_WIDTH || y >= LOGICAL_HEIGHT) continue;
      const walking = this.mode.kind === 'moving' && this.mode.unit === unit;
      const spent = unit.side === 'player' && unit.acted && alpha === 1;
      const look = { faction: unit.faction, skin: unit.skin, spent };
      const phase = this.battle.units.indexOf(unit) * 350;
      const frame = spent
        ? this.assets.frame(unit.spriteId, 'idle', 0, look)
        : this.assets.animFrame(unit.spriteId, walking ? 'walk' : 'idle', this.clock + phase, look);
      ctx.globalAlpha = alpha;
      ctx.drawImage(frame, x, y);
      ctx.globalAlpha = 1;
      if (alpha === 1 && (unit.hp < unit.maxHp || showBarsFor?.has(unit))) drawGauge(ctx, x + 2, y + 13, 12, unit.hp, unit.maxHp, 2);
    }
  }

  private drawCursor(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const mode = this.mode;
    if (mode.kind === 'banner' || mode.kind === 'moving' || mode.kind === 'busy') return;
    ctx.drawImage(this.assets.animFrame('ui.cursor', 'blink', this.clock), this.cursor.x * TILE - camX, this.cursor.y * TILE - camY);
  }

  private drawPopups(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    for (const p of this.popups) {
      const rise = Math.min(p.age / 80, 6);
      const x = Math.round(p.x - camX - this.text.width(p.text) / 2);
      const y = Math.round(p.y - camY - 9 - rise);
      this.text.draw(ctx, p.text, x, y, { color: p.color, shadow: COLORS.ink });
    }
  }

  private drawInterface(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const mode = this.mode;
    switch (mode.kind) {
      case 'banner':
        this.drawBanner(ctx, mode.text, mode.sub);
        return;
      case 'menu': {
        const items = this.menuItems();
        const title = `Turn ${this.battle.turn}`;
        const { w, h } = menuSize(this.text, items, title);
        drawMenu(ctx, this.text, items, mode.index, Math.round((LOGICAL_WIDTH - w) / 2), Math.round((LOGICAL_HEIGHT - h) / 2), title);
        return;
      }
      case 'action': {
        const { w, h } = menuSize(this.text, mode.items);
        const unitX = mode.unit.x * TILE - camX;
        const x = unitX + TILE + 2 + w <= LOGICAL_WIDTH ? unitX + TILE + 2 : unitX - w - 2;
        const y = Math.max(2, Math.min(LOGICAL_HEIGHT - h - 2, mode.unit.y * TILE - camY));
        drawMenu(ctx, this.text, mode.items, mode.index, x, y);
        return;
      }
      case 'moving':
      case 'busy':
        return;
      default:
        break;
    }
    const unit = this.focusUnit();
    if (this.infoOpen && unit) {
      this.drawInfoPage(ctx, unit, camX);
      return;
    }
    const cursorX = this.cursor.x * TILE - camX;
    const onRight = cursorX < LOGICAL_WIDTH / 2; // windows sit on the side away from the cursor
    if (unit) this.drawUnitWindow(ctx, unit, onRight);
    this.drawTerrainWindow(ctx, onRight);
  }

  private drawBanner(ctx: CanvasRenderingContext2D, title: string, sub: string): void {
    const top = 58;
    ctx.fillStyle = 'rgba(27, 20, 38, 0.88)';
    ctx.fillRect(0, top, LOGICAL_WIDTH, 44);
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(0, top, LOGICAL_WIDTH, 1);
    ctx.fillRect(0, top + 43, LOGICAL_WIDTH, 1);
    this.text.drawCentered(ctx, title, LOGICAL_WIDTH / 2, top + 9, { color: COLORS.text, shadow: COLORS.ink, scale: 2 });
    if (sub) this.text.drawCentered(ctx, sub, LOGICAL_WIDTH / 2, top + 30, { color: COLORS.textDim });
  }

  private drawUnitWindow(ctx: CanvasRenderingContext2D, unit: UnitInstance, onRight: boolean): void {
    const hpText = `${unit.hp}/${unit.maxHp}`;
    const w = Math.max(88, this.text.width(unit.name) + 10, this.text.width(`${unit.className}  Lv ${unit.level}`) + 10);
    const h = 36;
    const x = onRight ? LOGICAL_WIDTH - w - 2 : 2;
    const y = 2;
    drawPanel(ctx, x, y, w, h);
    this.text.draw(ctx, unit.name, x + 6, y + 5, { color: COLORS.text });
    this.text.draw(ctx, `${unit.className}  Lv ${unit.level}`, x + 6, y + 14, { color: COLORS.textDim });
    this.text.draw(ctx, 'HP', x + 6, y + 24, { color: COLORS.gold });
    drawGauge(ctx, x + 20, y + 25, w - 60, unit.hp, unit.maxHp, 4);
    this.text.drawRight(ctx, hpText, x + w - 5, y + 24, { color: COLORS.text });
  }

  private drawTerrainWindow(ctx: CanvasRenderingContext2D, onRight: boolean): void {
    const t = this.battle.map.terrainAt(this.cursor.x, this.cursor.y);
    const detail = t.heals ? `Cover ${t.cover}  Avoid ${t.avoid}  Heals ${Math.round(t.heals * 100)}%` : `Cover ${t.cover}  Avoid ${t.avoid}`;
    const w = Math.max(this.text.width(t.name), this.text.width(detail)) + 12;
    const h = 25;
    const x = onRight ? LOGICAL_WIDTH - w - 2 : 2;
    const y = LOGICAL_HEIGHT - h - 2;
    drawPanel(ctx, x, y, w, h);
    this.text.draw(ctx, t.name, x + 6, y + 5, { color: COLORS.text });
    this.text.draw(ctx, detail, x + 6, y + 14, { color: COLORS.textDim });
  }

  private drawInfoPage(ctx: CanvasRenderingContext2D, unit: UnitInstance, camX: number): void {
    const w = 168;
    const h = 108;
    const cursorX = this.cursor.x * TILE - camX;
    const x = cursorX < LOGICAL_WIDTH / 2 ? LOGICAL_WIDTH - w - 4 : 4;
    const y = Math.round((LOGICAL_HEIGHT - h) / 2);
    drawPanel(ctx, x, y, w, h);
    const left = x + 8;
    const right = x + w - 8;
    const gold = { color: COLORS.gold };
    const plain = { color: COLORS.text };
    this.text.draw(ctx, unit.name, left, y + 7, plain);
    this.text.drawRight(ctx, `Lv ${unit.level}`, right, y + 7, plain);
    this.text.draw(ctx, unit.className, left, y + 17, { color: COLORS.textDim });
    this.text.draw(ctx, 'HP', left, y + 30, gold);
    drawGauge(ctx, left + 16, y + 31, 70, unit.hp, unit.maxHp, 4);
    this.text.drawRight(ctx, `${unit.hp}/${unit.maxHp}`, right, y + 30, plain);
    const rows: ReadonlyArray<readonly [string, string, string, string]> = [
      ['Might', String(unit.mgt), 'Guard', String(unit.grd)],
      ['Move', String(unit.mov), 'Type', unit.moveType],
    ];
    rows.forEach(([a, av, b, bv], i) => {
      const ry = y + 45 + i * 11;
      this.text.draw(ctx, a, left, ry, gold);
      this.text.draw(ctx, av, left + 36, ry, plain);
      this.text.draw(ctx, b, left + 78, ry, gold);
      this.text.draw(ctx, bv, left + 112, ry, plain);
    });
    const weapon = unit.weapon;
    this.text.draw(ctx, 'Weapon', left, y + 70, gold);
    if (weapon) {
      this.text.draw(ctx, weapon.name, left + 44, y + 70, plain);
      const range = weapon.rangeMin === weapon.rangeMax ? `${weapon.rangeMax}` : `${weapon.rangeMin}-${weapon.rangeMax}`;
      this.text.draw(ctx, `Might ${weapon.might}   Range ${range}`, left + 44, y + 80, { color: COLORS.textDim });
    } else {
      this.text.draw(ctx, 'none', left + 44, y + 70, { color: COLORS.textDim });
    }
    this.text.drawCentered(ctx, 'Info or Back to close', x + w / 2, y + h - 13, { color: COLORS.textDim });
  }
}
