import { nextUnitToAct, planUnit } from '../core/ai';
import type { BattleMessage, BattleState, FightReport, HealReport, ItemUseReport, PhaseReport, PlanResult } from '../core/battle';
import { cameraToInclude, clampCamera, type CameraPos } from '../core/camera';
import type { ClassActionId, ClassActionOption, ClassActionReport } from '../core/classActions';
import { dangerZone, threatOf } from '../core/danger';
import { manhattan, tileKey } from '../core/grid';
import type { Action } from '../core/input';
import { describeObjective, progressText } from '../core/objectives';
import { pathTo, type ReachResult } from '../core/pathfinding';
import type { Effect } from '../core/dialogue';
import { DEFAULT_SETTINGS, type Settings } from '../core/settings';
import { areFriendly, type Point } from '../core/types';
import type { UnitInstance } from '../core/unit';
import type { WeaponDef } from '../core/weapons';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/viewport';
import type { Story } from '../data/story';
import { audio } from '../engine/audio';
import type { Assets } from '../engine/assets';
import type { Scene } from '../engine/game';
import type { TextRenderer } from '../engine/text';
import { COLORS } from '../engine/theme';
import { drawGauge, drawMenu, menuSize, type MenuItem } from '../engine/ui';
import {
  actionPromptLines,
  drawActionPrompt,
  drawExpWindow,
  drawFightHud,
  drawForecast,
  drawHealForecast,
  drawHint,
  drawInfoPage,
  drawItemList,
  drawLevelUp,
  drawMessage,
  drawOutcome,
  drawPromotion,
  drawTalkPrompt,
  drawTerrainWindow,
  drawTrade,
  drawUnitWindow,
  drawWeaponSelect,
  type Pen,
  type TradeView,
} from './battleWindows';
import { DialoguePlayer } from './dialoguePlayer';
import { FightPlayer, type FightCue } from './fightPlayer';
import { expSteps, fightSteps, promotionSteps, type ResultStep } from './results';

const TILE = 16;
/** Time a unit takes to cross one tile. */
const STEP_MS = 80;
const BANNER_MS = 850;
const POPUP_MS = 800;
const HEAL_MS = 750;
const EXP_FILL_MS = 700;
const EXP_HOLD_MS = 380;
const MESSAGE_MS = 1300;
/** The verdict is shown this long before it can be dismissed. */
const OUTCOME_LOCK_MS = 700;
/** Camera speed in pixels per millisecond. */
const CAMERA_SPEED = 0.24;
const HEAL_TINT = 'rgba(80, 200, 120, 0.55)';

const PHASE_TITLES = { player: 'Player Phase', ally: 'Ally Phase', enemy: 'Enemy Phase' } as const;

type ActionId = 'attack' | 'heal' | 'item' | 'trade' | 'talk' | 'seize' | 'depart' | 'visit' | ClassActionId | 'wait';
interface ActionItem extends MenuItem {
  readonly id: ActionId;
}

type Purpose = 'attack' | 'heal';

/** A weapon (or remedy) the unit could use now, and whom it would reach. */
interface Choice {
  readonly slot: number;
  readonly weapon: WeaponDef;
  readonly uses: number;
  readonly targets: UnitInstance[];
}

type Mode =
  | { kind: 'banner'; text: string; sub: string; left: number; next: () => void }
  | { kind: 'free' }
  | { kind: 'selected'; unit: UnitInstance; reach: ReachResult; threat: Point[] }
  | { kind: 'moving'; unit: UnitInstance; path: Point[]; elapsed: number; origin: Point; then?: () => void }
  | { kind: 'action'; unit: UnitInstance; origin: Point; items: ActionItem[]; index: number }
  | { kind: 'weapon'; unit: UnitInstance; origin: Point; purpose: Purpose; choices: Choice[]; index: number }
  | {
      kind: 'target';
      unit: UnitInstance;
      origin: Point;
      purpose: Purpose;
      choice: Choice;
      /** Where Back returns to: the weapon list when there was one to choose from. */
      back: Choice[] | null;
      index: number;
      detail: boolean;
    }
  /** Choosing whom to talk or trade with. */
  | { kind: 'talk'; unit: UnitInstance; origin: Point; targets: UnitInstance[]; index: number; trade?: boolean }
  | { kind: 'items'; unit: UnitInstance; origin: Point; index: number; note: string | null }
  | { kind: 'trade'; unit: UnitInstance; origin: Point; other: UnitInstance; view: { col: 0 | 1; row: number; held: TradeView['held']; note: string | null } }
  /** Aiming a class action; Decree has no targets and just waits for a confirmation. */
  | { kind: 'aim'; unit: UnitInstance; origin: Point; option: ClassActionOption; index: number }
  /** The move a unit is owed after attacking (Wheel, Skirmish, Pursuit). */
  | { kind: 'bonus'; unit: UnitInstance; reach: ReachResult }
  | { kind: 'pause'; left: number; next: () => void }
  | { kind: 'fight'; player: FightPlayer }
  | { kind: 'healing'; report: HealReport; hpBefore: number; elapsed: number }
  | { kind: 'results'; steps: ResultStep[]; index: number; elapsed: number }
  | { kind: 'messages'; list: BattleMessage[]; index: number; next: () => void }
  | { kind: 'dialogue'; player: DialoguePlayer; next: () => void }
  | { kind: 'menu'; index: number }
  | { kind: 'ai' }
  | { kind: 'outcome'; elapsed: number };

interface Popup {
  readonly text: string;
  readonly color: string;
  /** World pixel position of the tile's centre top. */
  readonly x: number;
  readonly y: number;
  age: number;
}

/** The player's phase has its own music; the computer's sides share the other. */
const phaseSong = (phase: string): string => (phase === 'player' ? 'player-phase' : 'enemy-phase');

export interface BattleSceneOptions {
  readonly battle: BattleState;
  readonly assets: Assets;
  readonly text: TextRenderer;
  /** Called when the player asks to play the chapter again after its end. */
  readonly onRestart?: () => void;
  /** The people and scenes of the story, to play the scenes the chapter's events call for. */
  readonly story?: Story;
  readonly settings?: Settings;
  /** A scene unlocked a Codex entry. */
  readonly onUnlock?: (id: string) => void;
  /** Offers *Suspend* on the turn menu: save the battle and leave (DESIGN §3.9). */
  readonly onSuspend?: () => void;
  /** Called when the player moves on from the end of the chapter; replaces *play again*. */
  readonly onFinish?: () => void;
  /** What the player named people (the Recruit), for the scenes the chapter plays. */
  readonly names?: Readonly<Record<string, string>>;
}

/**
 * The battle screen: a tile map with a cursor, unit selection, movement, the action menu,
 * weapon choice, the forecast, animated fights, EXP and level-ups, healing, the special actions,
 * the computer's phases, messages from events, fog of war and the end of the chapter. The rules
 * live in `BattleState`; this class is input handling and drawing.
 */
export class BattleScene implements Scene {
  private readonly battle: BattleState;
  private readonly assets: Assets;
  private readonly text: TextRenderer;
  private readonly onRestart: (() => void) | undefined;
  private readonly story: Story | undefined;
  private readonly settings: Settings;
  private readonly onUnlock: ((id: string) => void) | undefined;
  private readonly onSuspend: (() => void) | undefined;
  private readonly onFinish: (() => void) | undefined;
  private readonly names: Readonly<Record<string, string>> | undefined;
  private mapLayer: HTMLCanvasElement;
  /** The `terrainVersion` the map layer was drawn from. */
  private mapVersion = 0;
  private readonly mapWidthPx: number;
  private readonly mapHeightPx: number;
  private readonly hatch: HTMLCanvasElement;

  private mode: Mode = { kind: 'free' };
  private cursor: Point;
  private cam: CameraPos;
  private camTarget: CameraPos;
  private clock = 0;
  private inspected: { unit: UnitInstance; active: Set<number>; latent: Set<number> } | null = null;
  private dangerOn = false;
  private dangerCache: ReturnType<typeof dangerZone> | null = null;
  private infoOpen = false;
  /** The unit whose action is being played out; it is not greyed until the sequence ends. */
  private actor: UnitInstance | null = null;
  private readonly popups: Popup[] = [];

  constructor({ battle, assets, text, onRestart, story, settings, onUnlock, onSuspend, onFinish, names }: BattleSceneOptions) {
    this.battle = battle;
    this.names = names;
    this.story = story;
    this.settings = settings ?? DEFAULT_SETTINGS;
    this.onUnlock = onUnlock;
    this.onSuspend = onSuspend;
    this.onFinish = onFinish;
    this.dangerOn = this.settings.dangerZoneDefault;
    this.assets = assets;
    this.text = text;
    this.onRestart = onRestart;
    this.mapWidthPx = battle.map.width * TILE;
    this.mapHeightPx = battle.map.height * TILE;
    this.mapLayer = this.renderMapLayer();
    this.mapVersion = battle.terrainVersion;
    this.hatch = this.renderHatch();
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
    audio.playMusic(phaseSong(battle.phase));
    this.startBanner(PHASE_TITLES[battle.phase], this.phaseSub(battle.turn, battle.phase), () => this.proceed());
  }

  /** Drag the map: the camera follows the finger, within the map's edges, until the cursor next moves. */
  private panCamera(pan: Point): void {
    this.cam = clampCamera(this.cam.x - pan.x, this.cam.y - pan.y, this.mapWidthPx, this.mapHeightPx, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    this.camTarget = this.cam;
  }

  /** Attack ranges in red, or orange with the colour-blind-safe setting (DESIGN §16). */
  private get attackColor(): string {
    return this.settings.colourBlindSafe ? COLORS.attackSafe : COLORS.attack;
  }

  private get dangerColor(): string {
    return this.settings.colourBlindSafe ? COLORS.dangerSafe : COLORS.danger;
  }

  // ---------------------------------------------------------------- update

  update(dtMs: number, actions: ReadonlySet<Action>, taps: readonly Point[], pan: Point = { x: 0, y: 0 }): void {
    if (pan.x !== 0 || pan.y !== 0) this.panCamera(pan);
    this.clock += dtMs;
    this.updatePopups(dtMs);
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
      case 'weapon':
        this.updateWeapon(mode, actions);
        break;
      case 'target':
        this.updateTarget(mode, this.withTaps(actions, taps));
        break;
      case 'talk':
        this.updateTalk(mode, this.withTaps(actions, taps));
        break;
      case 'items':
        this.updateItems(mode, actions);
        break;
      case 'trade':
        this.updateTrade(mode, actions);
        break;
      case 'aim':
        this.updateAim(mode, this.withTaps(actions, taps));
        break;
      case 'bonus':
        this.updateBonus(mode, this.withTaps(actions, taps));
        break;
      case 'pause':
        mode.left -= dtMs;
        if (mode.left <= 0 || actions.has('confirm')) mode.next();
        break;
      case 'fight':
        this.updateFight(mode, dtMs);
        break;
      case 'healing':
        this.updateHealing(mode, dtMs);
        break;
      case 'results':
        this.updateResults(mode, dtMs, actions);
        break;
      case 'messages':
        if (actions.has('confirm')) this.advanceMessages(mode);
        break;
      case 'dialogue':
        mode.player.update(dtMs, actions, taps);
        if (mode.player.done) mode.next();
        break;
      case 'menu':
        this.updateMenu(mode, actions);
        break;
      case 'ai':
        this.updateAi();
        break;
      case 'outcome':
        mode.elapsed += dtMs;
        if (mode.elapsed > OUTCOME_LOCK_MS && actions.has('confirm')) (this.onFinish ?? this.onRestart)?.();
        break;
    }
  }

  private updatePopups(dtMs: number): void {
    for (const p of this.popups) p.age += dtMs;
    for (let i = this.popups.length - 1; i >= 0; i--) if ((this.popups[i]?.age ?? 0) > POPUP_MS) this.popups.splice(i, 1);
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
    const unit = this.unitUnderCursor();
    if (unit && unit.side === 'player' && unit.kind === 'unit' && !unit.acted) {
      this.inspected = null;
      this.infoOpen = false;
      this.select(unit);
    } else if (unit) {
      this.inspected = this.inspected?.unit === unit ? null : { unit, ...threatOf(this.battle, unit) };
    } else {
      this.mode = { kind: 'menu', index: 0 };
    }
  }

  private select(unit: UnitInstance): void {
    const reach = this.battle.reachFor(unit);
    this.mode = { kind: 'selected', unit, reach, threat: this.battle.threatTiles(unit, reach) };
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
    this.cursor = this.walkTile(mode);
    this.followCursor();
    if (mode.elapsed < total) return;
    if (mode.then) mode.then();
    else this.openActionMenu(mode.unit, mode.origin);
  }

  // ---------------------------------------------------------------- the action menu

  private attackChoices(unit: UnitInstance): Choice[] {
    return this.battle.attackOptions(unit).map((o) => ({ slot: o.slot, weapon: o.weapon, uses: unit.inventory[o.slot]?.uses ?? 0, targets: o.targets }));
  }

  private healChoices(unit: UnitInstance): Choice[] {
    return this.battle
      .usableRemedies(unit)
      .map(({ slot, weapon }) => ({ slot, weapon, uses: unit.inventory[slot]?.uses ?? 0, targets: this.battle.healTargets(unit, weapon) }))
      .filter((c) => c.targets.length > 0);
  }

  private openActionMenu(unit: UnitInstance, origin: Point): void {
    const items: ActionItem[] = [];
    if (this.battle.canSeize(unit)) items.push({ id: 'seize', label: 'Seize' });
    if (this.battle.canDepart(unit)) items.push({ id: 'depart', label: 'Depart' });
    if (this.attackChoices(unit).length > 0) items.push({ id: 'attack', label: 'Attack' });
    if (this.healChoices(unit).length > 0) items.push({ id: 'heal', label: 'Heal' });
    if (unit.inventory.length > 0) items.push({ id: 'item', label: 'Item' });
    if (this.tradePartners(unit).length > 0) items.push({ id: 'trade', label: 'Trade' });
    if (this.battle.talkTargets(unit).length > 0) items.push({ id: 'talk', label: 'Talk' });
    if (this.battle.canVisit(unit)) items.push({ id: 'visit', label: 'Visit' });
    for (const option of this.battle.classActions(unit)) items.push({ id: option.id, label: option.name });
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
      this.battle.updateVisibility();
      this.dangerCache = null;
      this.setCursor(mode.origin.x, mode.origin.y);
      this.select(mode.unit);
      return;
    }
    if (!actions.has('confirm')) return;
    const { unit, origin } = mode;
    switch (mode.items[mode.index]?.id) {
      case 'attack':
        this.chooseWeapon(unit, origin, 'attack', this.attackChoices(unit));
        break;
      case 'heal':
        this.chooseWeapon(unit, origin, 'heal', this.healChoices(unit));
        break;
      case 'talk': {
        const targets = this.battle.talkTargets(unit);
        const first = targets[0];
        if (!first) break;
        this.setCursor(first.x, first.y);
        this.mode = { kind: 'talk', unit, origin, targets, index: 0 };
        break;
      }
      case 'item':
        this.mode = { kind: 'items', unit, origin, index: Math.max(0, unit.equipped), note: null };
        break;
      case 'trade': {
        const targets = this.tradePartners(unit);
        const first = targets[0];
        if (!first) break;
        this.setCursor(first.x, first.y);
        this.mode = { kind: 'talk', unit, origin, targets, index: 0, trade: true };
        break;
      }
      case 'sap':
      case 'entrench':
      case 'mend':
      case 'counsel':
      case 'dispatch':
      case 'decree':
      case 'open': {
        const id = mode.items[mode.index]?.id;
        const option = this.battle.classActions(unit).find((o) => o.id === id);
        if (option) this.startAim(unit, origin, option);
        break;
      }
      case 'seize':
        this.battle.seize(unit);
        this.proceed();
        break;
      case 'depart':
        this.battle.depart(unit);
        this.popup(unit, 'Safe!', COLORS.good);
        this.proceed();
        break;
      case 'visit':
        this.battle.visit(unit);
        this.proceed();
        break;
      case 'wait':
        this.battle.wait(unit);
        this.proceed();
        break;
    }
  }

  /** With one weapon to choose go straight to the targets; with several, show the list. */
  private chooseWeapon(unit: UnitInstance, origin: Point, purpose: Purpose, choices: Choice[]): void {
    const only = choices[0];
    if (!only) return;
    if (choices.length === 1) this.startTargets(unit, origin, purpose, only, null);
    else this.mode = { kind: 'weapon', unit, origin, purpose, choices, index: 0 };
  }

  private updateWeapon(mode: Extract<Mode, { kind: 'weapon' }>, actions: ReadonlySet<Action>): void {
    const n = mode.choices.length;
    if (actions.has('up')) mode.index = (mode.index + n - 1) % n;
    if (actions.has('down')) mode.index = (mode.index + 1) % n;
    if (actions.has('cancel')) {
      this.openActionMenu(mode.unit, mode.origin);
      return;
    }
    const choice = mode.choices[mode.index];
    if (actions.has('confirm') && choice) this.startTargets(mode.unit, mode.origin, mode.purpose, choice, mode.choices);
  }

  private startTargets(unit: UnitInstance, origin: Point, purpose: Purpose, choice: Choice, back: Choice[] | null): void {
    if (purpose === 'attack') this.battle.equip(unit, choice.slot);
    const first = choice.targets[0];
    if (first) this.setCursor(first.x, first.y);
    this.mode = { kind: 'target', unit, origin, purpose, choice, back, index: 0, detail: false };
  }

  private updateTarget(mode: Extract<Mode, { kind: 'target' }>, actions: ReadonlySet<Action>): void {
    const targets = mode.choice.targets;
    const previous = actions.has('left') || actions.has('up');
    const next = actions.has('right') || actions.has('down');
    if (previous || next) {
      mode.index = (mode.index + (next ? 1 : targets.length - 1)) % targets.length;
      const t = targets[mode.index];
      if (t) this.setCursor(t.x, t.y);
    }
    if (actions.has('info')) mode.detail = !mode.detail;
    if (actions.has('cancel')) {
      if (mode.detail) mode.detail = false;
      else if (mode.back) this.mode = { kind: 'weapon', unit: mode.unit, origin: mode.origin, purpose: mode.purpose, choices: mode.back, index: Math.max(0, mode.back.indexOf(mode.choice)) };
      else this.openActionMenu(mode.unit, mode.origin);
      return;
    }
    if (!actions.has('confirm') || mode.detail) return;
    // a tap or cursor move that landed on another target selects it first
    const at = targets.findIndex((t) => t.x === this.cursor.x && t.y === this.cursor.y);
    if (at >= 0 && at !== mode.index) {
      mode.index = at;
      return;
    }
    const target = targets[mode.index];
    if (!target) return;
    if (mode.purpose === 'attack') this.playFight(this.battle.fight(mode.unit, target), mode.unit);
    else this.playHeal(this.battle.heal(mode.unit, target, mode.choice.slot), mode.unit);
  }

  private updateTalk(mode: Extract<Mode, { kind: 'talk' }>, actions: ReadonlySet<Action>): void {
    const n = mode.targets.length;
    const previous = actions.has('left') || actions.has('up');
    const next = actions.has('right') || actions.has('down');
    if (previous || next) {
      mode.index = (mode.index + (next ? 1 : n - 1)) % n;
      const t = mode.targets[mode.index];
      if (t) this.setCursor(t.x, t.y);
    }
    if (actions.has('cancel')) {
      this.openActionMenu(mode.unit, mode.origin);
      return;
    }
    const at = mode.targets.findIndex((t) => t.x === this.cursor.x && t.y === this.cursor.y);
    if (actions.has('confirm') && at >= 0 && at !== mode.index) {
      mode.index = at;
      return;
    }
    const target = mode.targets[mode.index];
    if (!actions.has('confirm') || !target) return;
    if (mode.trade) {
      this.mode = { kind: 'trade', unit: mode.unit, origin: mode.origin, other: target, view: { col: 0, row: 0, held: null, note: null } };
      return;
    }
    this.battle.talk(mode.unit, target);
    this.proceed();
  }

  /** Friends on the next tile who could swap items with the unit: it or they must be carrying something. */
  private tradePartners(unit: UnitInstance): UnitInstance[] {
    return this.battle
      .livingUnits()
      .filter((u) => u !== unit && u.kind === 'unit' && areFriendly(unit.side, u.side) && manhattan(unit, u) === 1 && (unit.inventory.length > 0 || u.inventory.length > 0));
  }

  // ---------------------------------------------------------------- items and trading

  private updateItems(mode: Extract<Mode, { kind: 'items' }>, actions: ReadonlySet<Action>): void {
    const { unit } = mode;
    const n = unit.inventory.length;
    if (n === 0 || actions.has('cancel')) {
      if (n === 0 || actions.has('cancel')) this.openActionMenu(unit, mode.origin);
      return;
    }
    if (actions.has('up')) {
      mode.index = (mode.index + n - 1) % n;
      mode.note = null;
    }
    if (actions.has('down')) {
      mode.index = (mode.index + 1) % n;
      mode.note = null;
    }
    if (!actions.has('confirm')) return;
    const slot = mode.index;
    const stack = unit.inventory[slot];
    if (!stack) return;
    if (this.battle.tables.weapons.has(stack.id)) {
      if (slot === unit.equipped) mode.note = 'Already in hand';
      else if (!this.battle.equip(unit, slot)) mode.note = 'Too high a grade to wield';
      else mode.note = null;
    } else if (this.battle.canUseItem(unit, slot)) {
      this.playItemUse(this.battle.useItem(unit, slot));
    } else {
      mode.note = this.battle.tables.items.get(stack.id)?.kind === 'key' ? 'Used at a gate: choose Open' : 'It would do nothing now';
    }
  }

  /** Show what an item did: HP restored, ailments cured, or a promotion. */
  private playItemUse(report: ItemUseReport): void {
    this.dangerCache = null;
    this.actor = report.unit;
    if (report.restored > 0) this.popup(report.unit, `+${report.restored}`, COLORS.good);
    if (report.cured.length > 0) this.popup(report.unit, 'Cured', COLORS.good, 10);
    if (report.promotion) {
      this.startResults(promotionSteps(report.promotion));
      return;
    }
    this.mode = { kind: 'pause', left: HEAL_MS, next: () => this.proceed() };
  }

  private updateTrade(mode: Extract<Mode, { kind: 'trade' }>, actions: ReadonlySet<Action>): void {
    const v = mode.view;
    if (actions.has('up')) {
      v.row = (v.row + 4) % 5;
      v.note = null;
    }
    if (actions.has('down')) {
      v.row = (v.row + 1) % 5;
      v.note = null;
    }
    if (actions.has('left') || actions.has('right')) {
      v.col = v.col === 0 ? 1 : 0;
      v.note = null;
    }
    if (actions.has('cancel')) {
      if (v.held) v.held = null;
      else this.openActionMenu(mode.unit, mode.origin);
      v.note = null;
      return;
    }
    if (!actions.has('confirm')) return;
    const pack = v.col === 0 ? mode.unit : mode.other;
    const stack = pack.inventory[v.row];
    if (!v.held) {
      if (stack) v.held = { col: v.col, row: v.row };
      else v.note = 'Nothing there to pick up';
      return;
    }
    if (v.held.col === v.col) {
      v.held = stack ? { col: v.col, row: v.row } : null;
      return;
    }
    if (!stack && v.row !== pack.inventory.length) {
      v.note = 'Use the first free slot';
      return;
    }
    const slotA = v.held.col === 0 ? v.held.row : v.row;
    const slotB = v.held.col === 0 ? v.row : v.held.row;
    if (this.battle.trade(mode.unit, slotA, mode.other, slotB)) {
      v.held = null;
      v.note = null;
      this.dangerCache = null;
    } else {
      v.note = 'That pack is full';
    }
  }

  // ---------------------------------------------------------------- class actions

  private startAim(unit: UnitInstance, origin: Point, option: ClassActionOption): void {
    const first = option.targets[0];
    this.setCursor(first?.x ?? unit.x, first?.y ?? unit.y);
    this.mode = { kind: 'aim', unit, origin, option, index: 0 };
  }

  private updateAim(mode: Extract<Mode, { kind: 'aim' }>, actions: ReadonlySet<Action>): void {
    const targets = mode.option.targets;
    const previous = actions.has('left') || actions.has('up');
    const next = actions.has('right') || actions.has('down');
    if (targets.length > 0 && (previous || next)) {
      mode.index = (mode.index + (next ? 1 : targets.length - 1)) % targets.length;
      const t = targets[mode.index];
      if (t) this.setCursor(t.x, t.y);
    }
    if (actions.has('cancel')) {
      this.openActionMenu(mode.unit, mode.origin);
      return;
    }
    if (!actions.has('confirm')) return;
    const at = targets.findIndex((t) => t.x === this.cursor.x && t.y === this.cursor.y);
    if (at >= 0 && at !== mode.index) {
      mode.index = at;
      return;
    }
    const target = targets[mode.index];
    if (targets.length > 0 && !target) return;
    this.playAction(this.battle.doClassAction(mode.unit, mode.option.id, target));
  }

  /** Show what a class action did, then its EXP. */
  private playAction(report: ClassActionReport): void {
    this.dangerCache = null;
    this.actor = report.actor;
    const { target } = report;
    switch (report.id) {
      case 'sap':
        if (target) this.popup(target, `-${report.amount}`, COLORS.white);
        if (target && report.destroyed) this.popup(target, 'Destroyed', COLORS.bad, 10);
        break;
      case 'entrench':
        if (target) this.popup(target, 'Barricade', COLORS.gold);
        break;
      case 'mend':
        if (target) this.popup(target, `+${report.amount} uses`, COLORS.good);
        break;
      case 'counsel':
        if (target) this.popup(target, 'Counselled', COLORS.good);
        break;
      case 'dispatch':
        if (target) this.popup(target, 'Ready', COLORS.good);
        break;
      case 'decree':
        this.popup(report.actor, 'Decree', COLORS.gold);
        break;
      case 'open':
        if (target) this.popup(target, 'Opened', COLORS.good);
        break;
    }
    const award = report.expAward;
    this.mode = { kind: 'pause', left: HEAL_MS, next: () => this.startResults(award ? expSteps(award, this.battle.tables.balance.expPerLevel) : []) };
  }

  // ---------------------------------------------------------------- the move owed after an attack

  private startBonus(unit: UnitInstance): void {
    const reach = this.battle.bonusReach(unit);
    if (!reach) {
      unit.bonusMove = 0;
      this.proceed();
      return;
    }
    this.setCursor(unit.x, unit.y);
    this.mode = { kind: 'bonus', unit, reach };
  }

  private updateBonus(mode: Extract<Mode, { kind: 'bonus' }>, actions: ReadonlySet<Action>): void {
    this.moveCursor(actions);
    if (actions.has('cancel')) {
      mode.unit.bonusMove = 0;
      this.proceed();
      return;
    }
    if (!actions.has('confirm')) return;
    const dest = this.cursor;
    if (!mode.reach.stops.some((p) => p.x === dest.x && p.y === dest.y)) return;
    const origin = { x: mode.unit.x, y: mode.unit.y };
    const path = this.battle.bonusMoveTo(mode.unit, dest);
    if (!path) {
      this.proceed();
      return;
    }
    this.dangerCache = null;
    this.mode = { kind: 'moving', unit: mode.unit, path, elapsed: 0, origin, then: () => this.proceed() };
  }

  // ---------------------------------------------------------------- fights, healing and their results

  /** Play back a fight that has already been resolved by the rules. */
  private playFight(report: FightReport, actor: UnitInstance): void {
    this.dangerCache = null;
    this.actor = actor;
    this.setCursor(report.attacker.x, report.attacker.y);
    const player = new FightPlayer(report);
    this.mode = { kind: 'fight', player };
    // with battle animations off, the fight is over at once and only its results are shown
    if (this.settings.battleAnimations === 'off') for (const cue of player.update(player.duration)) this.applyCue(cue);
  }

  private updateFight(mode: Extract<Mode, { kind: 'fight' }>, dtMs: number): void {
    for (const cue of mode.player.update(dtMs)) this.applyCue(cue);
    if (!mode.player.done) return;
    // Fire Storm reaches past the target: show who else was burned
    for (const { target, damage } of mode.player.report.splash) {
      this.popup(target, `-${damage}`, '#f29b2b');
      if (target.retreated) this.popup(target, 'Retreats', COLORS.bad, 10);
    }
    this.startResults(fightSteps(mode.player.report, this.battle.tables.balance.expPerLevel));
  }

  private applyCue(cue: FightCue): void {
    if (cue.kind === 'defeat') {
      this.popup(cue.unit, cue.unit.kind === 'structure' ? 'Destroyed' : 'Retreats', COLORS.bad, 10);
      audio.playSfx(cue.unit.kind === 'structure' ? 'structure-break' : 'defeat');
      return;
    }
    const { event, target } = cue;
    audio.playSfx(!event.hit ? 'miss' : event.crit ? 'critical' : 'hit');
    if (!event.hit) this.popup(target, 'Miss', COLORS.textDim);
    else if (event.damage === 0) this.popup(target, 'No damage', COLORS.textDim);
    else this.popup(target, event.crit ? `${event.damage}!` : String(event.damage), event.crit ? COLORS.gold : COLORS.white);
  }

  private playHeal(report: HealReport, actor: UnitInstance): void {
    this.actor = actor;
    this.popup(report.target, `+${report.restored}`, COLORS.good);
    audio.playSfx('heal');
    this.mode = { kind: 'healing', report, hpBefore: report.target.hp - report.restored, elapsed: 0 };
  }

  private updateHealing(mode: Extract<Mode, { kind: 'healing' }>, dtMs: number): void {
    mode.elapsed += dtMs;
    if (mode.elapsed < HEAL_MS) return;
    const award = mode.report.expAward;
    this.startResults(award ? expSteps(award, this.battle.tables.balance.expPerLevel) : []);
  }

  private startResults(steps: ResultStep[]): void {
    if (steps.length === 0) this.proceed();
    else this.mode = { kind: 'results', steps, index: 0, elapsed: 0 };
  }

  private updateResults(mode: Extract<Mode, { kind: 'results' }>, dtMs: number, actions: ReadonlySet<Action>): void {
    const step = mode.steps[mode.index];
    if (!step) {
      this.proceed();
      return;
    }
    if (mode.elapsed === 0 && (step.kind === 'levelup' || step.kind === 'promotion')) audio.playSfx(step.kind === 'levelup' ? 'level-up' : 'promotion');
    mode.elapsed += dtMs;
    const confirm = actions.has('confirm');
    const finished =
      step.kind === 'levelup' || step.kind === 'promotion'
        ? confirm
        : step.kind === 'exp'
          ? confirm || mode.elapsed >= EXP_FILL_MS + EXP_HOLD_MS
          : confirm || mode.elapsed >= MESSAGE_MS;
    if (!finished) return;
    mode.index += 1;
    mode.elapsed = 0;
    if (mode.index >= mode.steps.length) this.proceed();
  }

  // ---------------------------------------------------------------- what happens after an action

  /**
   * Everything that follows an action, the player's or the computer's: show what the events have
   * to say, announce the end of the chapter, hand the turn to the next side, or give the cursor
   * back. Every action sequence ends here.
   */
  private proceed(): void {
    this.actor = null;
    this.dangerCache = null;
    for (const arrived of this.battle.arrivals.splice(0)) this.popup(arrived, 'Arrives', COLORS.gold);
    if (this.battle.messages.length > 0) {
      this.showMessages(this.battle.messages.splice(0), () => this.proceed());
      return;
    }
    if (this.battle.outcome) {
      this.mode = { kind: 'outcome', elapsed: 0 };
      audio.playMusic(this.battle.outcome.result === 'won' ? 'victory' : 'defeat');
      return;
    }
    if (this.battle.phase !== 'player') {
      this.mode = { kind: 'ai' };
      return;
    }
    // a unit that attacked with Wheel, Skirmish or Pursuit still has a move to make
    const owed = this.battle.livingUnits('player').find((u) => u.bonusMove > 0);
    if (owed) {
      this.startBonus(owed);
      return;
    }
    this.mode = { kind: 'free' };
    if (this.settings.autoEndTurn && this.battle.isSideSpent('player')) this.changePhase();
  }

  private showMessages(list: BattleMessage[], next: () => void): void {
    this.runMessages(list, 0, next);
  }

  /** Show the messages from `index` on: a scene is played if the story has it, plain text is read. */
  private runMessages(list: BattleMessage[], index: number, next: () => void): void {
    const message = list[index];
    if (!message) {
      next();
      return;
    }
    const scene = message.kind === 'dialogue' ? this.story?.scenes.get(message.scene) : undefined;
    if (scene && this.story) {
      const player = new DialoguePlayer({
        scene,
        characters: this.story.characters,
        assets: this.assets,
        text: this.text,
        settings: this.settings,
        ...(this.names ? { names: this.names } : {}),
        onEffect: (effect) => this.applyEffect(effect),
      });
      this.mode = { kind: 'dialogue', player, next: () => this.runMessages(list, index + 1, next) };
    } else {
      this.mode = { kind: 'messages', list, index, next };
    }
  }

  private applyEffect(effect: Effect): void {
    if ('flag' in effect) this.battle.flags.add(effect.flag);
    else if ('unlock' in effect) this.onUnlock?.(effect.unlock);
    else if ('sfx' in effect) audio.playSfx(effect.sfx);
  }

  private advanceMessages(mode: Extract<Mode, { kind: 'messages' }>): void {
    this.runMessages(mode.list, mode.index + 1, mode.next);
  }

  // ---------------------------------------------------------------- phases

  private phaseSub(turn: number, phase: keyof typeof PHASE_TITLES): string {
    const objective = this.battle.map.rules.objective;
    return phase === 'player' && objective ? `Turn ${turn}  ·  ${describeObjective(objective)}` : `Turn ${turn}`;
  }

  /** End the current phase and announce the next. */
  private changePhase(): void {
    this.inspected = null;
    this.infoOpen = false;
    const report = this.battle.endPhase();
    if (this.battle.outcome) {
      this.proceed();
      return;
    }
    audio.playMusic(phaseSong(report.phase));
    this.startBanner(PHASE_TITLES[report.phase], this.phaseSub(report.turn, report.phase), () => {
      this.applyReport(report);
      this.proceed();
    });
  }

  /** Show what happened as the phase began: healing on good ground, and units arriving. */
  private applyReport(report: PhaseReport): void {
    for (const { unit, amount } of report.healed) this.popup(unit, `+${amount}`, COLORS.good);
    for (const { unit, damage } of report.burned) {
      this.popup(unit, `-${damage}`, '#f29b2b');
      if (unit.retreated) this.popup(unit, unit.kind === 'structure' ? 'Destroyed' : 'Retreats', COLORS.bad, 10);
    }
    for (const unit of report.arrived) this.popup(unit, 'Arrives', COLORS.gold);
    const arrival = report.arrived.find((u) => this.battle.isVisible(u.x, u.y));
    if (arrival) this.setCursor(arrival.x, arrival.y);
    else if (report.phase === 'player') {
      const first = this.battle.livingUnits('player')[0];
      if (first) this.setCursor(first.x, first.y);
    }
  }

  private updateAi(): void {
    const unit = nextUnitToAct(this.battle, this.battle.phase);
    if (!unit) {
      this.changePhase();
      return;
    }
    this.playPlan(this.battle.executePlan(planUnit(this.battle, unit)));
  }

  /** Show what a computer-controlled unit has just done, if the player is in a position to see it. */
  private playPlan(result: PlanResult): void {
    const { unit, path } = result;
    const involvesPlayer = result.fight?.defender.side === 'player' || result.fight?.attacker.side === 'player';
    const seen = involvesPlayer || path.some((p) => this.battle.isVisible(p.x, p.y));
    if (!seen) {
      this.proceed();
      return;
    }
    this.actor = unit;
    const finish = (): void => {
      if (result.fight) this.playFight(result.fight, unit);
      else if (result.heal) this.playHeal(result.heal, unit);
      else {
        if (result.escaped) this.popup(unit, 'Escapes', COLORS.good);
        this.proceed();
      }
    };
    const origin = path[0];
    if (path.length > 1 && origin) {
      this.setCursor(origin.x, origin.y);
      this.mode = { kind: 'moving', unit, path, elapsed: 0, origin, then: finish };
    } else {
      this.setCursor(unit.x, unit.y);
      finish();
    }
  }

  // ---------------------------------------------------------------- the turn menu

  private updateMenu(mode: Extract<Mode, { kind: 'menu' }>, actions: ReadonlySet<Action>): void {
    const items = this.menuItems();
    if (actions.has('up')) mode.index = (mode.index + items.length - 1) % items.length;
    if (actions.has('down')) mode.index = (mode.index + 1) % items.length;
    if (actions.has('cancel') || actions.has('menu')) {
      this.mode = { kind: 'free' };
      return;
    }
    if (!actions.has('confirm')) return;
    switch (items[mode.index]?.label.split(':')[0]) {
      case 'End Turn':
        this.mode = { kind: 'free' };
        this.changePhase();
        break;
      case 'Suspend':
        this.onSuspend?.();
        break;
      case 'Danger Zone':
        this.toggleDanger();
        break;
      case 'Objective':
        this.showMessages([{ kind: 'message', text: this.objectiveText() }], () => {
          this.mode = { kind: 'menu', index: mode.index };
        });
        break;
      default:
        this.mode = { kind: 'free' };
    }
  }

  private menuItems(): MenuItem[] {
    const items: MenuItem[] = [{ label: 'End Turn' }];
    if (this.battle.map.rules.objective) items.push({ label: 'Objective' });
    items.push({ label: `Danger Zone: ${this.dangerOn ? 'On' : 'Off'}` });
    if (this.onSuspend) items.push({ label: 'Suspend' });
    items.push({ label: 'Resume' });
    return items;
  }

  private objectiveText(): string {
    const objective = this.battle.map.rules.objective;
    if (!objective) return 'No objective.';
    const progress = progressText(objective, this.battle, this.battle.progress);
    return progress ? `${describeObjective(objective)}. ${progress}.` : `${describeObjective(objective)}.`;
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
      if (!this.battle.map.inBounds(tile.x, tile.y)) continue;
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
    this.camTarget = cameraToInclude(this.camTarget, this.cursor.x, this.cursor.y, TILE, 2, this.mapWidthPx, this.mapHeightPx, LOGICAL_WIDTH, LOGICAL_HEIGHT);
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

  private danger(): ReturnType<typeof dangerZone> {
    this.dangerCache ??= dangerZone(this.battle);
    return this.dangerCache;
  }

  /** The unit on the cursor tile, if the player can see it. */
  private unitUnderCursor(): UnitInstance | undefined {
    return this.battle.visibleUnits().find((u) => u.x === this.cursor.x && u.y === this.cursor.y);
  }

  /** The unit the information windows describe: the selected or acting unit, else the one under the cursor. */
  private focusUnit(): UnitInstance | undefined {
    const mode = this.mode;
    if (mode.kind === 'selected' || mode.kind === 'action') return mode.unit;
    return this.unitUnderCursor();
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
        const id = `tile.${this.battle.terrainAt(x, y).id}`;
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

  /** Diagonal stripes for the danger that sleeps: a pattern, so it does not rely on colour alone. */
  private renderHatch(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = TILE;
    canvas.height = TILE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.fillStyle = COLORS.latent;
    ctx.fillRect(0, 0, TILE, TILE);
    ctx.fillStyle = 'rgba(240, 200, 60, 0.6)';
    for (let i = -TILE; i < TILE; i += 4) for (let k = 0; k < TILE; k++) ctx.fillRect(k, k + i, 1, 1);
    return canvas;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.mode.kind === 'dialogue') {
      this.mode.player.draw(ctx);
      return;
    }
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    const camX = Math.round(this.cam.x);
    const camY = Math.round(this.cam.y);
    // a breach changes the ground: draw the map again
    if (this.mapVersion !== this.battle.terrainVersion) {
      this.mapLayer = this.renderMapLayer();
      this.mapVersion = this.battle.terrainVersion;
    }
    ctx.drawImage(this.mapLayer, -camX, -camY);
    this.drawObjectiveMarks(ctx, camX, camY);
    this.drawOverlays(ctx, camX, camY);
    this.drawFlames(ctx, camX, camY, false);
    this.drawFog(ctx, camX, camY);
    this.drawUnits(ctx, camX, camY);
    this.drawStructureTints(ctx, camX, camY);
    this.drawFlames(ctx, camX, camY, true);
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

  private hatchKeys(ctx: CanvasRenderingContext2D, keys: Iterable<number>, camX: number, camY: number): void {
    for (const key of keys) ctx.drawImage(this.hatch, (key % 4096) * TILE - camX, Math.floor(key / 4096) * TILE - camY);
  }

  /** Outline the tiles the chapter's objective turns on, so they can be found at a glance. */
  private drawObjectiveMarks(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const objective = this.battle.map.rules.objective;
    if (!objective) return;
    const mark = (tiles: ReadonlyArray<readonly [number, number]>, color: string): void => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      for (const [x, y] of tiles) ctx.strokeRect(x * TILE - camX + 0.5, y * TILE - camY + 0.5, TILE - 1, TILE - 1);
    };
    if (objective.type === 'seize') mark(objective.tiles, COLORS.gold);
    else if (objective.type === 'hold-the-pass') mark(objective.anchors, '#78b4dc');
    else if (objective.type === 'escort') mark(objective.exit, COLORS.good);
    else if (objective.type === 'defend' && Array.isArray(objective.anchor)) mark([objective.anchor as readonly [number, number]], COLORS.gold);
  }

  /** The tiles the current mode is asking the player to choose among, and the colour they wear. */
  private chosenTiles(): { tiles: readonly Point[]; color: string } | null {
    const mode = this.mode;
    if (mode.kind === 'target') return { tiles: mode.choice.targets, color: mode.purpose === 'attack' ? this.attackColor : HEAL_TINT };
    if (mode.kind === 'weapon') return { tiles: mode.choices[mode.index]?.targets ?? [], color: mode.purpose === 'attack' ? this.attackColor : HEAL_TINT };
    if (mode.kind === 'talk') return { tiles: mode.targets, color: COLORS.talk };
    if (mode.kind === 'aim') return { tiles: mode.option.targets, color: mode.option.id === 'sap' ? this.attackColor : mode.option.id === 'entrench' ? COLORS.talk : HEAL_TINT };
    return null;
  }

  /** A structure fills its tile, so the tint under it cannot be seen: lay it over the structure too. */
  private drawStructureTints(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const chosen = this.chosenTiles();
    if (!chosen) return;
    for (const t of chosen.tiles) if (this.battle.unitAt(t.x, t.y)?.kind === 'structure') this.fillTile(ctx, t.x, t.y, camX, camY, chosen.color);
  }

  private drawOverlays(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    if (this.dangerOn) {
      const zone = this.danger();
      this.hatchKeys(ctx, zone.latent, camX, camY);
      this.fillKeys(ctx, zone.active, camX, camY, this.dangerColor);
    }
    if (this.inspected) {
      this.hatchKeys(ctx, this.inspected.latent, camX, camY);
      this.fillKeys(ctx, this.inspected.active, camX, camY, this.attackColor);
    }
    const mode = this.mode;
    if (mode.kind === 'selected') {
      const stops = new Set(mode.reach.stops.map((p) => tileKey(p.x, p.y)));
      for (const p of mode.threat) if (!stops.has(tileKey(p.x, p.y))) this.fillTile(ctx, p.x, p.y, camX, camY, this.attackColor);
      this.fillKeys(ctx, stops, camX, camY, COLORS.reach);
      const path = pathTo(mode.reach, this.cursor);
      if (path && path.length > 1) {
        ctx.fillStyle = COLORS.path;
        for (const p of path.slice(1)) ctx.fillRect(p.x * TILE - camX + 6, p.y * TILE - camY + 6, 4, 4);
      }
    } else if (mode.kind === 'target') {
      const color = mode.purpose === 'attack' ? this.attackColor : HEAL_TINT;
      for (const t of mode.choice.targets) this.fillTile(ctx, t.x, t.y, camX, camY, color);
    } else if (mode.kind === 'weapon') {
      const choice = mode.choices[mode.index];
      const color = mode.purpose === 'attack' ? this.attackColor : HEAL_TINT;
      for (const t of choice?.targets ?? []) this.fillTile(ctx, t.x, t.y, camX, camY, color);
    } else if (mode.kind === 'talk') {
      for (const t of mode.targets) this.fillTile(ctx, t.x, t.y, camX, camY, COLORS.talk);
    } else if (mode.kind === 'aim') {
      for (const t of mode.option.targets) this.fillTile(ctx, t.x, t.y, camX, camY, mode.option.id === 'sap' ? this.attackColor : mode.option.id === 'entrench' ? COLORS.talk : HEAL_TINT);
    } else if (mode.kind === 'bonus') {
      this.fillKeys(ctx, mode.reach.stops.map((p) => tileKey(p.x, p.y)), camX, camY, COLORS.reach);
      const path = pathTo(mode.reach, this.cursor);
      if (path && path.length > 1) {
        ctx.fillStyle = COLORS.path;
        for (const p of path.slice(1)) ctx.fillRect(p.x * TILE - camX + 6, p.y * TILE - camY + 6, 4, 4);
      }
    }
  }

  /**
   * Flames over the burning tiles the player can see. Drawn before the units, so a unit stands in
   * front of them, and again after, over its feet only, so it can be seen to be standing in fire.
   */
  private drawFlames(ctx: CanvasRenderingContext2D, camX: number, camY: number, feetOnly: boolean): void {
    if (this.battle.flames.size === 0 || !this.assets.has('ui.flames')) return;
    for (const key of this.battle.flames.keys()) {
      const x = key % 4096;
      const y = Math.floor(key / 4096);
      if (!this.battle.isVisible(x, y)) continue;
      const occupied = this.battle.unitAt(x, y) !== undefined;
      if (feetOnly && !occupied) continue;
      const frame = this.assets.animFrame('ui.flames', 'burn', this.clock + key * 97);
      if (feetOnly) ctx.drawImage(frame, 0, 10, TILE, 6, x * TILE - camX, y * TILE - camY + 10, TILE, 6);
      else ctx.drawImage(frame, x * TILE - camX, y * TILE - camY);
    }
  }

  /** Darken what the player cannot see now; ground never seen is black. */
  private drawFog(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    if (!this.battle.map.rules.fog) return;
    const { width, height } = this.battle.map;
    const x0 = Math.max(0, Math.floor(camX / TILE));
    const y0 = Math.max(0, Math.floor(camY / TILE));
    const x1 = Math.min(width - 1, Math.floor((camX + LOGICAL_WIDTH) / TILE));
    const y1 = Math.min(height - 1, Math.floor((camY + LOGICAL_HEIGHT) / TILE));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (this.battle.isVisible(x, y)) continue;
        this.fillTile(ctx, x, y, camX, camY, this.battle.isExplored(x, y) ? COLORS.fogSeen : COLORS.fogUnseen);
      }
    }
  }

  private drawUnits(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const mode = this.mode;
    const frame = mode.kind === 'fight' ? mode.player.frame() : null;
    const fighters = mode.kind === 'fight' ? [mode.player.report.attacker, mode.player.report.defender] : [];
    // a unit leaving the map is still drawn on its way out
    const leaving = mode.kind === 'moving' && mode.unit.retreated ? [mode.unit] : [];
    const drawables = [...this.battle.visibleUnits(), ...fighters.filter((f) => f.retreated), ...leaving];
    drawables.sort((a, b) => a.y - b.y || a.x - b.x);
    const showBarsFor = mode.kind === 'target' ? new Set(mode.choice.targets) : null;
    for (const unit of drawables) {
      const alpha = frame?.alpha.get(unit.id) ?? 1;
      if (alpha <= 0 || frame?.blink.has(unit.id)) continue;
      const base = this.unitPixel(unit);
      const offset = frame?.offsets.get(unit.id) ?? { x: 0, y: 0 };
      const x = base.x + offset.x - camX;
      const y = base.y + offset.y - camY;
      if (x <= -TILE || y <= -TILE || x >= LOGICAL_WIDTH || y >= LOGICAL_HEIGHT) continue;
      const walking = mode.kind === 'moving' && mode.unit === unit;
      const spent = unit.side === 'player' && unit.acted && unit !== this.actor && alpha === 1 && this.battle.phase === 'player';
      const look = { faction: unit.faction, skin: unit.skin, spent };
      const phase = this.battle.units.indexOf(unit) * 350;
      const sprite = spent
        ? this.assets.frame(unit.spriteId, 'idle', 0, look)
        : this.assets.animFrame(unit.spriteId, walking ? 'walk' : 'idle', this.clock + phase, look);
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, x, y);
      ctx.globalAlpha = 1;
      const healing = mode.kind === 'healing' && mode.report.target === unit;
      const shown = frame?.hp.get(unit.id) ?? (healing ? this.healHp(mode) : unit.hp);
      if (alpha === 1 && (shown < unit.stats.hp || showBarsFor?.has(unit) || frame?.hp.has(unit.id))) drawGauge(ctx, x + 2, y + 13, 12, shown, unit.stats.hp, 2);
    }
  }

  /** The healed unit's HP bar while it fills. */
  private healHp(mode: Extract<Mode, { kind: 'healing' }>): number {
    const k = Math.min(1, mode.elapsed / (HEAL_MS * 0.8));
    return Math.round(mode.hpBefore + mode.report.restored * k);
  }

  private drawCursor(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const kind = this.mode.kind;
    if (kind === 'banner' || kind === 'moving' || kind === 'fight' || kind === 'healing' || kind === 'results' || kind === 'ai' || kind === 'outcome' || kind === 'items' || kind === 'trade' || kind === 'pause') return;
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
    const pen: Pen = { ctx, text: this.text };
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
      case 'weapon':
        drawWeaponSelect(pen, mode.choices, mode.choices.map((c) => c.uses), mode.index, mode.purpose === 'attack' ? 'Attack with' : 'Heal with');
        return;
      case 'target': {
        const target = mode.choice.targets[mode.index];
        if (!target) return;
        const atTop = target.y * TILE - camY > LOGICAL_HEIGHT / 2;
        if (mode.purpose === 'attack') {
          const fc = this.battle.forecastFor(mode.unit, target);
          if (fc) drawForecast(pen, this.battle, fc, mode.unit, target, mode.detail, atTop);
        } else {
          drawHealForecast(pen, mode.unit, target, mode.choice.weapon, atTop);
        }
        return;
      }
      case 'talk': {
        const target = mode.targets[mode.index];
        if (!target) return;
        const atTop = target.y * TILE - camY > LOGICAL_HEIGHT / 2;
        if (mode.trade) drawActionPrompt(pen, [`${mode.unit.name} trades with ${target.name}`, 'Swap or give items; it costs nothing'], atTop);
        else drawTalkPrompt(pen, mode.unit, target, atTop);
        return;
      }
      case 'items':
        drawItemList(pen, this.battle, mode.unit, mode.index, mode.note);
        return;
      case 'trade':
        drawTrade(pen, this.battle, mode.unit, mode.other, mode.view);
        return;
      case 'aim': {
        const t = mode.option.targets[mode.index];
        const target = t ? this.battle.unitAt(t.x, t.y) : undefined;
        const atTop = (t?.y ?? mode.unit.y) * TILE - camY > LOGICAL_HEIGHT / 2;
        const lines = actionPromptLines(this.battle, mode.unit, mode.option, target);
        if (lines.length > 0) drawActionPrompt(pen, lines, atTop);
        return;
      }
      case 'bonus':
        drawHint(pen, [`${mode.unit.name} may move ${mode.unit.bonusMove} more`, 'OK to go   Back to stay']);
        return;
      case 'fight':
        drawFightHud(pen, mode.player.report.attacker, mode.player.report.defender, mode.player.frame().hp);
        return;
      case 'results':
        this.drawResultStep(pen, mode);
        return;
      case 'messages': {
        const message = mode.list[mode.index];
        if (!message) return;
        const body = message.kind === 'message' ? message.text : `[scene: ${message.scene}]`;
        drawMessage(pen, this.text.wrap(body, 190));
        return;
      }
      case 'outcome':
        if (this.battle.outcome) {
          const prompt = this.onFinish ? 'OK to continue' : this.onRestart ? 'OK to play again' : null;
          drawOutcome(pen, this.battle.outcome.result, this.battle.outcome.reason, mode.elapsed > OUTCOME_LOCK_MS ? prompt : null);
        }
        return;
      case 'moving':
      case 'healing':
      case 'pause':
      case 'ai':
        return;
      default:
        break;
    }
    const unit = this.focusUnit();
    const onRight = this.cursor.x * TILE - camX < LOGICAL_WIDTH / 2; // windows sit on the side away from the cursor
    if (this.infoOpen && unit) {
      drawInfoPage(pen, this.battle, unit, onRight);
      return;
    }
    if (unit) drawUnitWindow(pen, this.battle, unit, onRight);
    if (this.battle.isExplored(this.cursor.x, this.cursor.y)) {
      drawTerrainWindow(pen, this.battle.terrainAt(this.cursor.x, this.cursor.y), onRight, this.battle.flameAt(this.cursor.x, this.cursor.y));
    }
  }

  private drawResultStep(pen: Pen, mode: Extract<Mode, { kind: 'results' }>): void {
    const step = mode.steps[mode.index];
    if (!step) return;
    if (step.kind === 'message') drawMessage(pen, step.lines);
    else if (step.kind === 'levelup') drawLevelUp(pen, step.unit, step.levelUp, step.stats);
    else if (step.kind === 'promotion') drawPromotion(pen, step.result);
    else {
      const k = Math.min(1, mode.elapsed / EXP_FILL_MS);
      const eased = 1 - (1 - k) * (1 - k);
      const shown = step.from + (step.to - step.from) * eased;
      drawExpWindow(pen, { ...step.unit, level: step.level }, shown, this.battle.tables.balance.expPerLevel, step.gained);
    }
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
}
