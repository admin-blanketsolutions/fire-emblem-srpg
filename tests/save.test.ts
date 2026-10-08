import { describe, expect, it } from 'vitest';
import { playPhase } from '../src/core/ai';
import { newArmy } from '../src/core/army';
import type { BattleState } from '../src/core/battle';
import { changeMode, newCampaign, type Campaign } from '../src/core/campaign';
import { decodeSave, encodeSave, MemoryStore, migrate, SaveError, SaveSlots, SAVE_SCHEMA, type KeyValueStore, type SaveFile } from '../src/core/save';
import { DEFAULT_SETTINGS, parseSettings } from '../src/core/settings';
import { battleFrom, loadEnv, type BattleSource } from '../src/data/battles';

/** Give every player unit an AI so the whole battle can play itself. */
function automate(battle: BattleState): void {
  for (const u of battle.units) if (u.side === 'player' && !u.ai) u.ai = { mode: 'aggressive' };
}

/** Play `phases` phases (or until the chapter is decided), logging every action. */
function play(battle: BattleState, phases: number): string[] {
  const log: string[] = [];
  for (let i = 0; i < phases && !battle.outcome; i++) {
    for (const r of playPhase(battle, battle.phase)) {
      const fight = r.fight ? `${r.fight.defender.id}:${r.fight.events.map((e) => `${e.by}${e.hit ? (e.crit ? 'C' : 'H') : 'M'}${e.damage}`).join('')}` : '';
      log.push(`${battle.turn}/${r.unit.id}@${r.unit.x},${r.unit.y}${fight}`);
    }
    if (battle.outcome) break;
    battle.endPhase();
  }
  log.push(`outcome:${battle.outcome?.result ?? 'none'}@${battle.turn}/${battle.phase}`);
  return log;
}

/** A campaign whose army is the battle's player side, so units are shared as they are in a real chapter. */
function campaignFor(battle: BattleState, mode: Campaign['mode'] = 'classic'): Campaign {
  const supports = loadEnv.supportsFor('demo')!;
  battle.supports = supports;
  const army = newArmy(battle.livingUnits('player').filter((u) => u.kind === 'unit'), 900, { supports });
  return newCampaign({ mode, seed: 7, story: 'demo', army, chapter: 'CH-00' });
}

const suspend = (campaign: Campaign, battle: BattleState, source: BattleSource): SaveFile =>
  encodeSave({ kind: 'suspend', campaign, label: 'Proving Ground', savedAt: '2026-10-08T12:00:00Z', battle: { state: battle, source } });

/** What a save looks like after a trip through storage. */
const throughStorage = (file: SaveFile): unknown => JSON.parse(JSON.stringify(file));

describe('the suspend-save (M6 acceptance)', () => {
  const source: BattleSource = { kind: 'proving', objective: 'rout', fog: false };

  it('resumes a battle that then plays out exactly as it would have', () => {
    const battle = battleFrom(source, {}, 42);
    automate(battle);
    const campaign = campaignFor(battle);
    play(battle, 7); // into the fighting, mid-turn
    const file = suspend(campaign, battle, source);

    const loaded = decodeSave(throughStorage(file), loadEnv);
    const resumed = loaded.battle!;
    expect(resumed.rng.state()).toBe(battle.rng.state());

    const expected = play(battle, 200);
    const actual = play(resumed, 200);
    expect(expected.some((l) => l.includes(':a'))).toBe(true); // fights happened after the save
    expect(actual).toEqual(expected);
    expect(resumed.units.map((u) => [u.id, u.hp, u.x, u.y, u.level, u.exp])).toEqual(battle.units.map((u) => [u.id, u.hp, u.x, u.y, u.level, u.exp]));
  });

  it('writes back exactly what it read', () => {
    const battle = battleFrom(source, {}, 9);
    automate(battle);
    const campaign = campaignFor(battle);
    campaign.flags.add('met-the-scribe');
    campaign.codex.add('people.ayyub');
    play(battle, 5);
    const file = suspend(campaign, battle, source);
    const loaded = decodeSave(throughStorage(file), loadEnv);
    const again = encodeSave({ kind: 'suspend', campaign: loaded.campaign, label: 'Proving Ground', savedAt: '2026-10-08T12:00:00Z', battle: { state: loaded.battle!, source: loaded.source } });
    expect(throughStorage(again)).toEqual(throughStorage(file));
  });

  it('keeps the army and the battle sharing the same units, and the supports with both', () => {
    const battle = battleFrom(source, {}, 3);
    automate(battle);
    const campaign = campaignFor(battle);
    campaign.army.supports!.stateOf('demo-lord-pikeman').points = 17;
    play(battle, 3);
    const points = campaign.army.supports!.stateOf('demo-lord-pikeman').points;
    expect(points).toBeGreaterThanOrEqual(17);
    const { campaign: c, battle: b } = decodeSave(throughStorage(suspend(campaign, battle, source)), loadEnv);
    for (const u of c.army.units) expect(b!.units).toContain(u);
    expect(b!.supports).toBe(c.army.supports);
    expect(c.army.supports!.stateOf('demo-lord-pikeman').points).toBe(points);
    expect(c.army.dinars).toBe(900);
  });

  it('restores breached walls, flames and the counts of the siege', () => {
    const siege: BattleSource = { kind: 'demo', demo: 'siege' };
    const battle = battleFrom(siege, {}, 5);
    automate(battle);
    const campaign = campaignFor(battle, 'casual');
    battle.setTerrain(1, 1, 'plain');
    battle.flames.set(2 + 3 * 4096, 2);
    battle.bump('barricades');
    battle.flags.add('gate-opened');
    play(battle, 2);
    const resumed = decodeSave(throughStorage(suspend(campaign, battle, siege)), loadEnv).battle!;
    expect(resumed.terrainAt(1, 1).id).toBe(battle.terrainAt(1, 1).id);
    expect([...resumed.flames]).toEqual([...battle.flames]);
    expect(resumed.countOf('barricades')).toBe(1);
    expect(resumed.flags.has('gate-opened')).toBe(true);
    expect(play(resumed, 40)).toEqual(play(battle, 40));
  });
});

describe('reading saves safely', () => {
  const good = (): SaveFile => {
    const battle = battleFrom({ kind: 'proving', objective: 'rout', fog: false }, {}, 1);
    return encodeSave({ kind: 'slot', campaign: campaignFor(battle), label: 'Camp', savedAt: 'now' });
  };

  it('loads a camp save with no battle', () => {
    const loaded = decodeSave(throughStorage(good()), loadEnv);
    expect(loaded.battle).toBeNull();
    expect(loaded.campaign.army.units.length).toBeGreaterThan(0);
    expect(loaded.campaign.mode).toBe('classic');
  });

  it('names what is wrong with a damaged save', () => {
    const bad = throughStorage(good()) as { units: Array<Record<string, unknown>> };
    bad.units[2]!.hp = 'lots';
    expect(() => decodeSave(bad, loadEnv)).toThrow(SaveError);
    expect(() => decodeSave(bad, loadEnv)).toThrow('units[2].hp should be a whole number');

    const unknownClass = throughStorage(good()) as { units: Array<Record<string, unknown>> };
    unknownClass.units[0]!.classId = 'dragon-rider';
    expect(() => decodeSave(unknownClass, loadEnv)).toThrow(/dragon-rider/);

    const unknownItem = throughStorage(good()) as { units: Array<{ inventory: Array<{ id: string }> }> };
    unknownItem.units[0]!.inventory[0]!.id = 'excalibur';
    expect(() => decodeSave(unknownItem, loadEnv)).toThrow(/excalibur/);

    const dangling = throughStorage(good()) as { campaign: { army: { units: number[] } } };
    dangling.campaign.army.units.push(999);
    expect(() => decodeSave(dangling, loadEnv)).toThrow(/unit 999/);

    expect(() => decodeSave({ ...(throughStorage(good()) as object), campaign: { ...(throughStorage(good()) as SaveFile).campaign, story: 'fanfic' } }, loadEnv)).toThrow(/fanfic/);
    expect(() => decodeSave('hello', loadEnv)).toThrow(SaveError);
  });

  it('refuses a battle it cannot rebuild', () => {
    const battle = battleFrom({ kind: 'proving', objective: 'rout', fog: false }, {}, 1);
    const file = throughStorage(suspend(campaignFor(battle), battle, { kind: 'proving', objective: 'rout', fog: false })) as { battle: { source: unknown } };
    file.battle.source = { kind: 'chapter', id: 'CH-99' };
    expect(() => decodeSave(file, loadEnv)).toThrow(/could not be rebuilt/);
  });
});

describe('versions', () => {
  it('upgrades one version at a time with pure migrations', () => {
    const migrations = {
      1: (f: Record<string, unknown>) => ({ ...f, schemaVersion: 2, renamed: f.old }),
      2: (f: Record<string, unknown>) => ({ ...f, schemaVersion: 3, added: true }),
    };
    const v1 = { schemaVersion: 1, old: 'x' };
    expect(migrate(v1, migrations, 3)).toEqual({ schemaVersion: 3, old: 'x', renamed: 'x', added: true });
    expect(v1).toEqual({ schemaVersion: 1, old: 'x' }); // the input is not changed
  });

  it('refuses saves from a newer game, saves with no version, and gaps in the migrations', () => {
    expect(() => migrate({ schemaVersion: SAVE_SCHEMA + 1 })).toThrow(/newer version/);
    expect(() => migrate({})).toThrow(/schemaVersion/);
    expect(() => migrate({ schemaVersion: 1 }, {}, 2)).toThrow(/No migration from save format 1/);
    expect(() => migrate({ schemaVersion: 1 }, { 1: (f) => ({ ...f, schemaVersion: 5 }) }, 2)).toThrow(/did not produce format 2/);
  });
});

describe('save slots', () => {
  const file = (mode: Campaign['mode'] = 'classic', kind: SaveFile['kind'] = 'slot'): SaveFile => {
    const battle = battleFrom({ kind: 'proving', objective: 'rout', fog: false }, {}, 1);
    const campaign = campaignFor(battle, mode);
    return kind === 'suspend'
      ? suspend(campaign, battle, { kind: 'proving', objective: 'rout', fog: false })
      : encodeSave({ kind, campaign, label: 'Camp before Damascus', savedAt: '2026-10-08T09:30:00Z' });
  };

  it('lists three slots, the autosave and the suspend-save, empty or with a summary', () => {
    const slots = new SaveSlots(new MemoryStore());
    expect(slots.list().map((l) => l.state)).toEqual(['empty', 'empty', 'empty', 'empty', 'empty']);
    expect(slots.write({ kind: 'slot', slot: 2 }, file()).ok).toBe(true);
    const listing = slots.list()[1]!;
    expect(listing).toMatchObject({ state: 'ok', summary: { label: 'Camp before Damascus', chapter: 'CH-00', mode: 'classic', turn: null } });
    expect(slots.write({ kind: 'slot', slot: 4 }, file()).ok).toBe(false);
    slots.remove({ kind: 'slot', slot: 2 });
    expect(slots.list()[1]!.state).toBe('empty');
  });

  it('lists a damaged save as damaged instead of failing', () => {
    const store = new MemoryStore();
    store.set('s2b:v1:slot1', '{not json');
    store.set('s2b:v1:slot3', JSON.stringify({ schemaVersion: 99 }));
    const listing = new SaveSlots(store).list();
    expect(listing[0]).toMatchObject({ state: 'damaged', reason: 'The save is not valid JSON.' });
    expect(listing[2]).toMatchObject({ state: 'damaged' });
  });

  it('reports a storage failure instead of throwing', () => {
    const broken: KeyValueStore = {
      get: () => {
        throw new Error('SecurityError');
      },
      set: () => {
        throw new Error('QuotaExceededError');
      },
      remove: () => {
        throw new Error('SecurityError');
      },
    };
    const slots = new SaveSlots(broken);
    expect(slots.write({ kind: 'slot', slot: 1 }, file())).toMatchObject({ ok: false, reason: expect.stringContaining('QuotaExceededError') });
    expect(slots.list().every((l) => l.state === 'damaged')).toBe(true);
    expect(() => slots.remove({ kind: 'autosave' })).not.toThrow();
    expect(slots.readSettings()).toBeNull();
    expect(slots.writeSettings(DEFAULT_SETTINGS).ok).toBe(false);
  });

  it('keeps settings, reading them tolerantly', () => {
    const slots = new SaveSlots(new MemoryStore());
    expect(parseSettings(slots.readSettings())).toEqual(DEFAULT_SETTINGS);
    slots.writeSettings({ ...DEFAULT_SETTINGS, textSpeed: 'fast', musicVolume: 7 });
    expect(parseSettings(slots.readSettings())).toMatchObject({ textSpeed: 'fast', musicVolume: 1 });
  });
});

describe('the campaign mode', () => {
  it('may go from Classic to Casual but not back', () => {
    const battle = battleFrom({ kind: 'proving', objective: 'rout', fog: false }, {}, 1);
    const campaign = campaignFor(battle);
    expect(changeMode(campaign, 'casual').ok).toBe(true);
    expect(campaign.mode).toBe('casual');
    expect(changeMode(campaign, 'classic')).toMatchObject({ ok: false });
    expect(campaign.mode).toBe('casual');
  });
});
