import { describe, expect, it } from 'vitest';
import { playPhase } from '../src/core/ai';
import type { BattleState } from '../src/core/battle';
import type { Action } from '../src/core/input';
import { MemoryStore, SaveSlots } from '../src/core/save';
import { parseSettings } from '../src/core/settings';
import type { Assets } from '../src/engine/assets';
import type { Game, Scene } from '../src/engine/game';
import type { TextRenderer } from '../src/engine/text';
import type { BattleSceneOptions } from '../src/scenes/battleScene';
import { CampScene } from '../src/scenes/campScene';
import { GameFlow } from '../src/scenes/flow';
import { ListScreen } from '../src/scenes/listScreen';
import { NameScene } from '../src/scenes/nameScene';
import { CodexScene, SettingsScene, SlotsScene, TitleScene } from '../src/scenes/menus';

/** A text renderer good enough for layout: every glyph one pixel, no wrapping. */
const text = { width: (s: string) => s.length, wrap: (s: string) => [s], lineHeight: 8 } as unknown as TextRenderer;

interface Harness {
  readonly flow: GameFlow;
  readonly slots: SaveSlots;
  readonly store: MemoryStore;
  scene: () => Scene;
  /** The options the last battle screen was given. */
  battle: () => BattleSceneOptions;
  press: (...actions: Action[]) => void;
}

function harness(store = new MemoryStore(), persistent = true): Harness {
  let current: Scene | null = null;
  let lastBattle: BattleSceneOptions | null = null;
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
      return { update: () => undefined, draw: () => undefined };
    },
  });
  return {
    flow,
    slots,
    store,
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
function choose(h: Harness, label: string): void {
  const scene = h.scene() as ListScreen & { content(): { rows: Array<{ label: string }> } };
  const rows = (scene as unknown as { content(): { rows: Array<{ label: string }> } }).content().rows;
  const i = rows.findIndex((r) => r.label.startsWith(label));
  if (i < 0) throw new Error(`no row "${label}" in ${rows.map((r) => r.label).join(', ')}`);
  scene.index = i;
  h.press('confirm');
}

/** A campaign of the demo story: one camp, the siege, and a last camp. (The real campaign starts by naming the Recruit.) */
function startCampaign(h: Harness, mode: 'Classic' | 'Casual' = 'Classic'): void {
  h.flow.title();
  h.flow.newGame(mode === 'Classic' ? 'classic' : 'casual', 'demo');
}

/** From camp, take the way on: the last entry of the main menu. */
function ride(h: Harness): void {
  const camp = h.scene() as CampScene;
  const items = (camp as unknown as { mainItems(): Array<{ label: string }> }).mainItems();
  (camp as unknown as { mode: { kind: 'main'; index: number } }).mode = { kind: 'main', index: items.length - 1 };
  h.press('confirm');
}

/** From camp, open the records menu. */
function records(h: Harness): void {
  const camp = h.scene() as CampScene;
  const items = (camp as unknown as { mainItems(): Array<{ label: string }> }).mainItems();
  (camp as unknown as { mode: { kind: 'main'; index: number } }).mode = { kind: 'main', index: items.findIndex((i) => i.label.startsWith('Codex and saves')) };
  h.press('confirm');
}

const battleOf = (h: Harness): BattleState => h.battle().battle;

/** Let both sides fight until the battle ends. */
function playOut(battle: BattleState): void {
  for (const u of battle.units) if (u.side === 'player' && !u.ai) u.ai = { mode: 'aggressive' };
  for (let i = 0; i < 400 && !battle.outcome; i++) {
    playPhase(battle, battle.phase);
    if (!battle.outcome) battle.endPhase();
  }
}

describe('the title', () => {
  it('offers a new game, and Load only once there is a save', () => {
    const h = harness();
    h.flow.title();
    const rows = (h.scene() as unknown as { content(): { rows: Array<{ label: string; disabled?: boolean }> } }).content().rows;
    expect(rows.map((r) => [r.label, !!r.disabled])).toEqual([
      ['New game', false],
      ['Load', true],
      ['Settings', false],
    ]);
  });

  it('says when saves will not outlast the page', () => {
    const h = harness(new MemoryStore(), false);
    const title = h.flow.title();
    expect((title as unknown as { content(): { note?: string } }).content().note).toMatch(/not available/);
  });

  it('asks Classic or Casual for a new game, and the campaign begins by naming the Recruit', () => {
    const h = harness();
    h.flow.title();
    choose(h, 'New game');
    choose(h, 'Casual');
    expect(h.scene()).toBeInstanceOf(NameScene);
    expect(h.flow.campaign).toMatchObject({ mode: 'casual', story: 'campaign', chapter: 'CH-00', step: 0 });
  });

  it('starts the demo story in camp', () => {
    const h = harness();
    startCampaign(h, 'Casual');
    expect(h.scene()).toBeInstanceOf(CampScene);
    expect(h.flow.campaign?.mode).toBe('casual');
  });
});

describe('saving and loading in camp', () => {
  it('saves to a slot, asks before overwriting, and loads it back', () => {
    const h = harness();
    startCampaign(h);
    h.flow.campaign!.army.dinars = 4321;
    records(h);
    choose(h, 'Save');
    expect(h.scene()).toBeInstanceOf(SlotsScene);
    choose(h, 'Slot 1');
    expect(h.slots.list()[0]).toMatchObject({ state: 'ok', summary: { label: 'Prologue · The Siege Demo', mode: 'classic' } });
    choose(h, 'Slot 1');
    expect((h.scene() as unknown as { content(): { title: string } }).content().title).toBe('Overwrite Slot 1?');
    choose(h, 'Yes');

    h.flow.campaign!.army.dinars = 0;
    h.flow.title();
    choose(h, 'Load');
    choose(h, 'Slot 1');
    expect(h.scene()).toBeInstanceOf(CampScene);
    expect(h.flow.campaign!.army.dinars).toBe(4321);
  });

  it('turns Classic into Casual in camp, and never back', () => {
    const h = harness();
    startCampaign(h);
    records(h);
    choose(h, 'Mode');
    expect(h.flow.campaign!.mode).toBe('casual');
    choose(h, 'Mode');
    expect(h.flow.campaign!.mode).toBe('casual');
  });

  it('keeps settings between sessions', () => {
    const store = new MemoryStore();
    const h = harness(store);
    h.flow.title();
    choose(h, 'Settings');
    const settings = h.scene() as SettingsScene;
    expect(settings).toBeInstanceOf(SettingsScene);
    choose(h, 'Text speed');
    choose(h, 'Hit rolls');
    expect(parseSettings(new SaveSlots(store).readSettings())).toMatchObject({ textSpeed: 'fast', hitMode: 'weighted' });
    expect(harness(store).flow.settings.hitMode).toBe('weighted');
  });
});

describe('battles, suspend and the end of a chapter', () => {
  it('autosaves as the chapter begins, and fields the army’s own units', () => {
    const h = harness();
    startCampaign(h);
    ride(h);
    expect(h.slots.list().find((l) => l.place.kind === 'autosave')).toMatchObject({ state: 'ok', summary: { label: 'Prologue · The Siege Demo' } });
    const battle = battleOf(h);
    const army = h.flow.campaign!.army;
    const fielded = battle.units.filter((u) => u.side === 'player' && u.kind === 'unit');
    expect(fielded.length).toBeGreaterThan(0);
    for (const u of fielded) expect(army.units).toContain(u);
    expect(fielded.find((u) => u.defId === 'lord')?.tags).toContain('lord');
    expect(battle.supports).toBe(h.flow.campaign!.army.supports);
  });

  it('suspends to the title and resumes the same battle, used up in Classic (M6 acceptance)', () => {
    const h = harness();
    startCampaign(h);
    ride(h);
    const before = battleOf(h);
    before.endPhase();
    playPhase(before, before.phase);
    before.endPhase();
    const rng = before.rng.state();
    h.battle().onSuspend!();
    expect(h.scene()).toBeInstanceOf(TitleScene);
    choose(h, 'Resume battle');
    const after = battleOf(h);
    expect(after).not.toBe(before);
    expect(after.rng.state()).toBe(rng);
    expect(after.turn).toBe(before.turn);
    expect(after.units.map((u) => [u.id, u.x, u.y, u.hp])).toEqual(before.units.map((u) => [u.id, u.x, u.y, u.hp]));
    expect(h.slots.list().find((l) => l.place.kind === 'suspend')?.state).toBe('empty');
  });

  it('keeps the suspend-save in Casual', () => {
    const h = harness();
    startCampaign(h, 'Casual');
    ride(h);
    h.battle().onSuspend!();
    choose(h, 'Resume battle');
    expect(h.slots.list().find((l) => l.place.kind === 'suspend')?.state).toBe('ok');
  });

  /** Win the siege with one ordinary unit fallen along the way. */
  function winWithACasualty(h: Harness): string {
    ride(h);
    const battle = battleOf(h);
    const army = h.flow.campaign!.army;
    const fallen = army.units.find((u) => !u.chronicled && !u.tags.includes('lord') && battle.units.includes(u))!;
    fallen.hp = 0;
    fallen.retreated = true;
    for (const foe of battle.units) if (foe.side === 'enemy') foe.retreated = true;
    battle.outcome = { result: 'won', reason: 'test' };
    h.battle().onFinish!();
    return fallen.id;
  }

  it('in Classic, an ordinary unit that retreated wounded leaves the army', () => {
    const h = harness();
    startCampaign(h, 'Classic');
    const id = winWithACasualty(h);
    const army = h.flow.campaign!.army;
    expect(army.units.map((u) => u.id)).not.toContain(id);
    expect(army.fallen.map((u) => u.id)).toContain(id);
    expect(h.scene()).toBeInstanceOf(CampScene);
  });

  it('in Casual, the wounded return for the next chapter (M6 acceptance)', () => {
    const h = harness();
    startCampaign(h, 'Casual');
    const id = winWithACasualty(h);
    const army = h.flow.campaign!.army;
    const back = army.units.find((u) => u.id === id);
    expect(back).toBeDefined();
    expect(back!.retreated).toBe(false);
    expect(back!.hp).toBe(back!.stats.hp);
    expect(army.fallen).toHaveLength(0);
  });

  it('a lost chapter goes back to its start', () => {
    const h = harness();
    startCampaign(h);
    const army = h.flow.campaign!.army;
    const count = army.units.length;
    ride(h);
    const battle = battleOf(h);
    playOut(battle);
    for (const u of battle.units) if (u.side === 'player') u.retreated = true;
    battle.outcome = { result: 'lost', reason: 'test' };
    h.battle().onFinish!();
    expect(h.scene()).toBeInstanceOf(CampScene);
    expect(h.flow.campaign!.army.units).toHaveLength(count);
    expect(h.flow.campaign!.army.units.every((u) => !u.retreated)).toBe(true);
  });
});

describe('the Codex screen (M6 acceptance)', () => {
  it('opens on the categories, lists the unlocked entries, and shows where the sources differ', () => {
    const h = harness();
    startCampaign(h);
    records(h);
    choose(h, 'Codex');
    const codex = h.scene() as CodexScene;
    expect(codex).toBeInstanceOf(CodexScene);
    choose(h, 'Sources & Disputes');
    choose(h, 'The first Egyptian expedition');
    expect(codex.current.kind).toBe('entry');
    const lines = codex.pageLines((codex.current as { entry: Parameters<CodexScene['pageLines']>[0] }).entry).map((l) => l.text);
    expect(lines).toContain('Attested, sources differ');
    expect(lines).toContain('Sources differ: The year the first expedition set out');
    expect(lines).toContain('  Ibn Shaddad: 558 AH');
    expect(lines.some((l) => l.startsWith('  Ibn Khallikan: 559 AH'))).toBe(true);
    expect(lines.at(-1)).toBe('Sources: Ibn Shaddad; Ibn Khallikan; ledger CH-02.E2');
    h.press('cancel');
    expect(codex.current.kind).toBe('entries');
  });
});

describe('damaged saves', () => {
  it('keeps a Classic suspend-save that cannot be opened, rather than using it up', () => {
    const store = new MemoryStore();
    store.set('s2b:v1:suspend', JSON.stringify({ schemaVersion: 1, kind: 'suspend', summary: {}, units: [], campaign: { mode: 'classic' } }));
    const h = harness(store);
    h.flow.resume();
    expect(h.scene()).toBeInstanceOf(TitleScene);
    expect(store.get('s2b:v1:suspend')).not.toBeNull();
  });

  it('reports a save that cannot be opened on the title, and carries on', () => {
    const store = new MemoryStore();
    store.set('s2b:v1:slot2', JSON.stringify({ schemaVersion: 1, kind: 'slot', summary: { label: 'x', chapter: null, mode: 'classic', units: 0, turn: null, savedAt: 'now' }, units: [], campaign: {} }));
    const h = harness(store);
    h.flow.load({ kind: 'slot', slot: 2 });
    expect(h.scene()).toBeInstanceOf(TitleScene);
    expect((h.scene() as unknown as { content(): { note?: string } }).content().note).toMatch(/could not be opened: campaign\.story/);
  });
});
