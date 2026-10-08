import { playPhase } from '../src/core/ai';
import type { BattleState } from '../src/core/battle';
import type { Action } from '../src/core/input';
import { MemoryStore, SaveSlots } from '../src/core/save';
import type { Assets } from '../src/engine/assets';
import type { Game, Scene } from '../src/engine/game';
import type { TextRenderer } from '../src/engine/text';
import type { BattleSceneOptions } from '../src/scenes/battleScene';
import { CampScene } from '../src/scenes/campScene';
import { GameFlow } from '../src/scenes/flow';
import type { ListScreen } from '../src/scenes/listScreen';

/** The harness the flow tests share: a game with no canvas, a flow over a memory store, and a way to press keys. */

/** A text renderer good enough for layout: every glyph one pixel, no wrapping. */
const text = { width: (s: string) => s.length, wrap: (s: string) => [s], lineHeight: 8 } as unknown as TextRenderer;

export interface Harness {
  /** The last battle screen the flow built (the stand-in), to tell whether the current scene is a battle. */
  battleScene: () => Scene | null;
  /** Let time pass on the current scene, with these actions held. */
  tick: (dtMs: number, ...actions: Action[]) => void;
  readonly flow: GameFlow;
  readonly slots: SaveSlots;
  readonly store: MemoryStore;
  scene: () => Scene;
  /** The options the last battle screen was given. */
  battle: () => BattleSceneOptions;
  press: (...actions: Action[]) => void;
}

export function harness(store = new MemoryStore(), persistent = true): Harness {
  let current: Scene | null = null;
  let lastBattle: BattleSceneOptions | null = null;
  let lastBattleScene: Scene | null = null;
  const game = { setScene: (s: Scene) => (current = s), run: (s: Scene) => (current = s) } as unknown as Game;
  const slots = new SaveSlots(store);
  const flow = new GameFlow({
    game,
    assets: {} as Assets,
    text,
    slots,
    persistent,
    now: () => '2026-10-08T10:00:00Z',
    newSeed: () => 1234,
    battleScene: (options) => {
      lastBattle = options;
      lastBattleScene = { update: () => undefined, draw: () => undefined };
      return lastBattleScene;
    },
  });
  return {
    flow,
    slots,
    store,
    battleScene: () => lastBattleScene,
    tick: (dtMs, ...actions) => current?.update(dtMs, new Set(actions), []),
    scene: () => {
      if (!current) throw new Error('no scene');
      return current;
    },
    battle: () => {
      if (!lastBattle) throw new Error('no battle');
      return lastBattle;
    },
    press: (...actions) => {
      for (const a of actions) current?.update(16, new Set([a]), []);
    },
  };
}

/** Choose the row with this label on the current list screen. */
export function choose(h: Harness, label: string): void {
  const scene = h.scene() as ListScreen & { content(): { rows: Array<{ label: string }> } };
  const rows = (scene as unknown as { content(): { rows: Array<{ label: string }> } }).content().rows;
  const i = rows.findIndex((r) => r.label.startsWith(label));
  if (i < 0) throw new Error(`no row "${label}" in ${rows.map((r) => r.label).join(', ')}`);
  scene.index = i;
  h.press('confirm');
}

/** A campaign of the demo story: one camp, the siege, and a last camp. (The real campaign starts by naming the Recruit.) */
export function startCampaign(h: Harness, mode: 'Classic' | 'Casual' = 'Classic'): void {
  h.flow.title();
  h.flow.newGame(mode === 'Classic' ? 'classic' : 'casual', 'demo');
}

/** From camp, take the way on: the last entry of the main menu. */
export function ride(h: Harness): void {
  const camp = h.scene() as CampScene;
  const items = (camp as unknown as { mainItems(): Array<{ label: string }> }).mainItems();
  (camp as unknown as { mode: { kind: 'main'; index: number } }).mode = { kind: 'main', index: items.length - 1 };
  h.press('confirm');
}

/** From camp, open the records menu. */
export function records(h: Harness): void {
  const camp = h.scene() as CampScene;
  const items = (camp as unknown as { mainItems(): Array<{ label: string }> }).mainItems();
  (camp as unknown as { mode: { kind: 'main'; index: number } }).mode = { kind: 'main', index: items.findIndex((i) => i.label.startsWith('Codex and saves')) };
  h.press('confirm');
}

export const battleOf = (h: Harness): BattleState => h.battle().battle;

/** Let both sides fight until the battle ends. */
export function playOut(battle: BattleState): void {
  for (const u of battle.units) if (u.side === 'player' && !u.ai) u.ai = { mode: 'aggressive' };
  for (let i = 0; i < 400 && !battle.outcome; i++) {
    playPhase(battle, battle.phase);
    if (!battle.outcome) battle.endPhase();
  }
}

