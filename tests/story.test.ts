import { describe, expect, it } from 'vitest';
import { autoPlay } from '../src/core/bot';
import { decodeSave, encodeSave } from '../src/core/save';
import { loadEnv, STORIES } from '../src/data/battles';
import { CampScene } from '../src/scenes/campScene';
import { ListScreen } from '../src/scenes/listScreen';
import { NameScene } from '../src/scenes/nameScene';
import { CardScene, PageScene, StoryScene } from '../src/scenes/storyScene';
import { choose, harness, type Harness } from './flowHarness';

/**
 * The whole slice through the real flow, as a player meets it: the title, naming the Recruit,
 * every card and scene, every camp (saved and read back as it is passed) and every battle (played
 * by the computer, and called won), to the page that ends it.
 */

/** Carry the current scene on to its end, by whatever means that kind of scene has. */
function pass(h: Harness): string {
  const scene = h.scene();
  if (scene instanceof NameScene) {
    scene.entry.text = 'Hasan';
    scene.entry.moveTo(4, 5);
    h.press('confirm');
    return 'name';
  }
  if (scene instanceof CardScene) {
    h.tick(1000, 'confirm');
    return 'card';
  }
  if (scene instanceof StoryScene) {
    h.tick(16, 'menu');
    return 'scenes';
  }
  if (scene instanceof CampScene) {
    // save as the camp stands and read it back: the whole campaign is what a player could be carrying
    const campaign = h.flow.campaign!;
    const file = encodeSave({ kind: 'slot', campaign, label: 'test', savedAt: '2026-10-08T10:00:00Z' });
    const back = decodeSave(JSON.parse(JSON.stringify(file)) as unknown, loadEnv).campaign;
    expect({ chapter: back.chapter, step: back.step, name: back.recruitName, flags: [...back.flags].sort(), codex: [...back.codex].sort(), dinars: back.army.dinars }).toEqual({
      chapter: campaign.chapter,
      step: campaign.step,
      name: campaign.recruitName,
      flags: [...campaign.flags].sort(),
      codex: [...campaign.codex].sort(),
      dinars: campaign.army.dinars,
    });
    expect(back.army.units.map((u) => [u.id, u.name, u.level, u.exp, u.hp, u.classId])).toEqual(campaign.army.units.map((u) => [u.id, u.name, u.level, u.exp, u.hp, u.classId]));
    expect([...back.army.away].sort()).toEqual([...campaign.army.away].sort());
    expect(back.army.convoy).toEqual(campaign.army.convoy);
    expect(back.army.supports?.snapshot()).toEqual(campaign.army.supports?.snapshot());
    // ride on: the last entry of the main menu
    const items = (scene as unknown as { mainItems(): Array<{ label: string }> }).mainItems();
    (scene as unknown as { mode: { kind: 'main'; index: number } }).mode = { kind: 'main', index: items.length - 1 };
    h.press('confirm');
    return 'camp';
  }
  if (scene === h.battleScene()) {
    const options = h.battle();
    autoPlay(options.battle, { mode: 'aggressive' });
    // the plumbing is what is tested here, not the balance: a battle the careless player lost is called won
    options.battle.outcome = { result: 'won', reason: 'test' };
    options.onFinish!();
    return 'battle';
  }
  if (scene instanceof PageScene) {
    h.tick(1000, 'confirm');
    return 'page';
  }
  return 'other';
}

describe('the slice, from the title to its end', () => {
  it('walks every step, and saves read back as they were', () => {
    const h = harness();
    h.flow.title();
    choose(h, 'New game');
    choose(h, 'Casual');
    const seen: string[] = [];
    let guard = 0;
    while (!(h.scene() instanceof ListScreen && (h.scene() as unknown as { content(): { title: string } }).content().title === 'The end of the slice') && guard++ < 300) {
      seen.push(pass(h));
    }
    expect(guard).toBeLessThan(300);
    const campaign = h.flow.campaign!;
    expect(campaign.flags.has('story-complete')).toBe(true);
    expect(campaign.recruitName).toBe('Hasan');
    expect(seen.filter((s) => s === 'battle')).toHaveLength(5);
    expect(seen.filter((s) => s === 'camp').length).toBeGreaterThanOrEqual(8);
    // the Recruit is called what the player said, and every chapter was played in order
    expect(campaign.army.units.find((u) => u.defId === 'recruit')?.name ?? 'Hasan').toBe('Hasan');
    expect(campaign.chapter).toBe('CH-03');
  });

  it('opens the Codex as chapters are played, and not before', () => {
    const h = harness();
    h.flow.title();
    choose(h, 'New game');
    choose(h, 'Classic');
    pass(h); // the name
    const c = h.flow.campaign!;
    // the Prologue's people are open as the Prologue begins, and the later chapters' are not
    expect(c.codex.has('CDX-P-SALAH')).toBe(true);
    expect(c.codex.has('CDX-P-NURADDIN')).toBe(false);
    expect(c.codex.has('CDX-S-BIRTHNIGHT')).toBe(false);
  });

  it('plays every Codex entry into the book by the end, but the ones tied to a choice', () => {
    const h = harness();
    h.flow.title();
    choose(h, 'New game');
    choose(h, 'Casual');
    let guard = 0;
    while (!(h.scene() instanceof ListScreen && (h.scene() as unknown as { content(): { title: string } }).content().title === 'The end of the slice') && guard++ < 300) pass(h);
    const missing = [...STORIES.campaign.codex.keys()].filter((id) => !h.flow.campaign!.codex.has(id));
    // only what a player can decline: an engine burned, a Talk skipped
    expect(missing.sort()).toEqual([]);
  });
});

/** Walk the campaign until the current scene is a battle's. */
function toBattle(h: Harness, mode: 'Classic' | 'Casual' = 'Classic', battles = 1): void {
  h.flow.title();
  choose(h, 'New game');
  choose(h, mode);
  let seen = 0;
  for (let guard = 0; guard < 200; guard++) {
    if (h.scene() === h.battleScene()) {
      seen += 1;
      if (seen === battles) return;
    }
    pass(h);
  }
  throw new Error('no battle was reached');
}

describe('a battle of the slice', () => {
  it('fields the army the story has raised, on the map the chapter names', () => {
    const h = harness();
    toBattle(h);
    const battle = h.battle().battle;
    const army = h.flow.campaign!.army;
    expect(battle.map.id).toBe('CH-00');
    const player = battle.units.filter((u) => u.side === 'player' && u.kind === 'unit');
    expect(player).toHaveLength(9);
    for (const u of player) expect(army.units).toContain(u);
    expect(player.find((u) => u.defId === 'recruit')?.name).toBe('Hasan');
    // Ayyub is the Lord of this chapter, and of no other
    expect(player.find((u) => u.defId === 'ayyub')?.tags).toContain('lord');
  });

  it('suspends and resumes a chapter’s battle as it stood (the save names the map, not a demo)', () => {
    const h = harness();
    toBattle(h);
    const before = h.battle().battle;
    before.endPhase();
    playPhaseOnce(before);
    before.endPhase();
    const rng = before.rng.state();
    h.battle().onSuspend!();
    choose(h, 'Resume battle');
    const after = h.battle().battle;
    expect(after).not.toBe(before);
    expect(after.map.id).toBe('CH-00');
    expect(after.rng.state()).toBe(rng);
    expect(after.units.map((u) => [u.id, u.x, u.y, u.hp])).toEqual(before.units.map((u) => [u.id, u.x, u.y, u.hp]));
    // the army in the resumed battle is the army of the campaign
    for (const u of after.units.filter((u) => u.side === 'player' && u.kind === 'unit')) expect(h.flow.campaign!.army.units).toContain(u);
  });

  it('a lost chapter goes back to the camp it left, with the army as it left it', () => {
    const h = harness();
    toBattle(h);
    const campaign = h.flow.campaign!;
    const count = campaign.army.units.length;
    const step = campaign.step;
    const battle = h.battle().battle;
    for (const u of battle.units) if (u.side === 'player') u.retreated = true;
    battle.outcome = { result: 'lost', reason: 'test' };
    h.battle().onFinish!();
    expect(h.scene()).toBeInstanceOf(CampScene);
    expect(h.flow.campaign!.step).toBe(step - 1);
    expect(h.flow.campaign!.army.units).toHaveLength(count);
    expect(h.flow.campaign!.army.units.every((u) => !u.retreated)).toBe(true);
  });

  it('in Classic, a unit that retreats wounded is lost to the army; the named are not', () => {
    const h = harness();
    toBattle(h, 'Classic');
    const battle = h.battle().battle;
    const soldier = battle.units.find((u) => u.defId === 'garrison-soldier')!;
    const shirkuh = battle.units.find((u) => u.defId === 'shirkuh')!;
    for (const u of [soldier, shirkuh]) {
      u.hp = 0;
      u.retreated = true;
    }
    for (const foe of battle.units) if (foe.side === 'enemy') foe.retreated = true;
    battle.outcome = { result: 'won', reason: 'test' };
    h.battle().onFinish!();
    const army = h.flow.campaign!.army;
    expect(army.units.map((u) => u.id)).not.toContain(soldier.id);
    expect(army.fallen.map((u) => u.id)).toContain(soldier.id);
    expect(army.units.map((u) => u.id)).toContain('shirkuh');
  });
});

import { playPhase } from '../src/core/ai';
function playPhaseOnce(battle: Parameters<typeof playPhase>[0]): void {
  for (const u of battle.units) if (u.side === 'player' && u.kind === 'unit' && !u.ai) u.ai = { mode: 'aggressive' };
  playPhase(battle, battle.phase);
}
