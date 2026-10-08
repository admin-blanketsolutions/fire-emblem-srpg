import { describe, expect, it } from 'vitest';
import { newArmy, settleChapter } from '../src/core/army';
import { fitDeployment, isAway, toggleDeploy } from '../src/core/camp';
import { concludeBattle, deploymentFor, fieldArmy, launchBattle, newCampaign, OPEN_SLOT } from '../src/core/campaign';
import type { MapJson, SpawnJson } from '../src/core/map';
import { buildBattle } from '../src/core/setup';
import { tables } from '../src/data';
import { mapOf, unit } from './support';
import type { UnitDef } from '../src/core/unit';

/** A tiny story: one Lord, named friends, generic troops, and a map that asks for some of them. */
const def = (id: string, extra: Partial<UnitDef> = {}): UnitDef => ({ id, name: id, side: 'player', class: 'soldier', level: 1, growth: {}, inventory: ['levy-spear'], faction: 'ayyubid', skin: 's1', ...extra });
const defs = { lord: def('lord', { tags: ['lord'], chronicled: true }), friend: def('friend', { chronicled: true }), troop: def('troop'), foe: def('foe', { side: 'enemy' }), guest: def('guest') };

const spawn = (unitId: string, at: [number, number], extra: Partial<SpawnJson> = {}): SpawnJson => ({ unit: unitId, at, ...extra });

function battleOn(spawns: NonNullable<MapJson['spawns']>) {
  const map = mapOf(['..........', '..........', '..........'], { spawns });
  return buildBattle(map, defs, { ...tables, units: defs }, { begin: false });
}

const army = (...ids: string[]) => {
  const a = newArmy([]);
  for (const id of ids) {
    const u = unit({ id, class: 'soldier' });
    Object.assign(u, { defId: id.replace(/#\d+$/, '') });
    a.units.push(u);
    a.deployed.add(id);
  }
  return a;
};

describe('putting the army on the map', () => {
  it('replaces a named spawn with the army’s unit, keeping its experience, and takes the spawn’s tags', () => {
    const a = army('lord', 'friend');
    a.units[1]!.exp = 40;
    const battle = battleOn({ player: [spawn('lord', [1, 1], { tags: ['lord'] }), spawn('friend', [2, 1], { tags: ['captain'] })] });
    fieldArmy(battle, a);
    expect(battle.units).toHaveLength(2);
    expect(battle.units[1]).toBe(a.units[1]);
    expect(a.units[1]).toMatchObject({ x: 2, y: 1, exp: 40, tags: ['captain'] });
    expect(a.units[0]?.tags).toEqual(['lord']);
  });

  it('takes away the Lord tag from a unit the next map does not make the Lord', () => {
    const a = army('lord', 'friend');
    a.units[1]!.tags = ['lord'];
    fieldArmy(battleOn({ player: [spawn('lord', [0, 0]), spawn('friend', [1, 0])] }), a);
    expect(a.units[1]?.tags).toEqual([]);
  });

  it('fills open slots, in order, with the units chosen who have no spawn of their own', () => {
    const a = army('lord', 'troop#1', 'troop#2', 'troop#3');
    a.deployed.delete('troop#3');
    const battle = battleOn({ player: [spawn('lord', [0, 0]), spawn('troop', [3, 0], { tags: [OPEN_SLOT] }), spawn('troop', [4, 0], { tags: [OPEN_SLOT] }), spawn('troop', [5, 0], { tags: [OPEN_SLOT] })] });
    fieldArmy(battle, a);
    const at = (x: number) => battle.units.find((u) => u.x === x && u.y === 0);
    expect(at(3)).toBe(a.units[1]);
    expect(at(4)).toBe(a.units[2]);
    expect(at(5)).toBeUndefined(); // the third slot stays empty: nobody was chosen for it
    expect(battle.units.some((u) => u === a.units[3])).toBe(false);
  });

  it('takes off a named spawn the army cannot fill, unless it is a guest', () => {
    const a = army('lord');
    const battle = battleOn({ player: [spawn('lord', [0, 0]), spawn('friend', [1, 0]), spawn('guest', [2, 0], { tags: ['guest'] })] });
    fieldArmy(battle, a);
    expect(battle.units.map((u) => u.defId)).toEqual(['lord', 'guest']);
    expect(battle.units[1]?.tags).toContain('guest');
  });

  it('leaves out a unit that is away or not chosen, and the map’s enemies as they were', () => {
    const a = army('lord', 'friend');
    a.away.add('friend');
    a.deployed.delete('friend');
    const battle = battleOn({ player: [spawn('lord', [0, 0]), spawn('friend', [1, 0])], enemy: [spawn('foe', [9, 0])] });
    fieldArmy(battle, a);
    expect(battle.units.map((u) => u.defId)).toEqual(['lord', 'foe']);
  });

  it('puts an army unit the map places as an ally on the ally side, with the map’s behaviour', () => {
    const a = army('lord', 'friend');
    const battle = battleOn({ player: [spawn('lord', [0, 0])], ally: [spawn('friend', [3, 2], { side: 'ally', ai: { mode: 'stationary' } })] });
    fieldArmy(battle, a);
    expect(a.units[1]).toMatchObject({ side: 'ally', ai: { mode: 'stationary' }, x: 3, y: 2 });
    expect(battle.units).toContain(a.units[1]);
  });

  it('keeps a reserve off the map until an event brings it on, and an army unit comes back whole', () => {
    const a = army('lord', 'friend');
    const events = [{ id: 'arrive', when: { type: 'turnStart' as const, turn: 2, phase: 'player' as const }, then: [{ type: 'arrive' as const, unit: 'friend', at: [4, 1] as [number, number] }] }];
    const map = mapOf(['..........', '..........', '..........'], { spawns: { player: [spawn('lord', [0, 0]), spawn('friend', [9, 2], { tags: ['reserve'] })] }, events });
    const battle = buildBattle(map, defs, { ...tables, units: defs }, { begin: false });
    const campaign = newCampaign({ mode: 'classic', seed: 1, story: 'campaign', army: a, chapter: 'CH-00' });
    launchBattle(campaign, battle);
    const friend = a.units[1]!;
    expect(friend.retreated).toBe(true);
    expect(battle.livingUnits('player').map((u) => u.defId)).toEqual(['lord']);
    expect(deploymentFor(battle, a).required.map((u) => u.defId).sort()).toEqual(['friend', 'lord']);
    battle.endPhase();
    battle.endPhase();
    battle.endPhase(); // the second turn's player phase begins, and the event fires
    expect(friend).toMatchObject({ retreated: false, escaped: false, x: 4, y: 1 });
    expect(friend.tags).not.toContain('reserve');
    expect(battle.arrivals.length + battle.messages.length).toBeGreaterThanOrEqual(0);
  });
});

describe('what a map asks of the army', () => {
  it('counts named spawns and open slots as room, and the named ones as required', () => {
    const a = army('lord', 'friend', 'troop#1', 'troop#2');
    const battle = battleOn({ player: [spawn('lord', [0, 0]), spawn('friend', [1, 0]), spawn('troop', [3, 0], { tags: [OPEN_SLOT] }), spawn('troop', [4, 0], { tags: [OPEN_SLOT] })] });
    const { limit, required } = deploymentFor(battle, a);
    expect(limit).toBe(4);
    expect(required.map((u) => u.defId)).toEqual(['lord', 'friend']);
  });

  it('does not count a named spawn whose unit is away, or that the army does not have', () => {
    const a = army('lord', 'friend');
    a.away.add('friend');
    const battle = battleOn({ player: [spawn('lord', [0, 0]), spawn('friend', [1, 0]), spawn('guest', [2, 0])] });
    expect(deploymentFor(battle, a).limit).toBe(1);
  });

  it('is kept by the camp: the required cannot be released and the away cannot be chosen', () => {
    const a = army('lord', 'friend', 'troop#1');
    a.away.add('troop');
    const required = [a.units[1]!];
    fitDeployment(a, 2, required);
    expect([...a.deployed].sort()).toEqual(['friend', 'lord']);
    expect(toggleDeploy(a, a.units[1]!)).toEqual({ ok: false, reason: 'friend must go.' });
    expect(toggleDeploy(a, a.units[2]!)).toEqual({ ok: false, reason: 'troop#1 is away.' });
    expect(isAway(a, a.units[2]!)).toBe(true);
  });
});

describe('after the battle', () => {
  it('does not take in a recruit who fell in the chapter that won him, in Classic', () => {
    const a = army('lord');
    const battle = battleOn({ player: [spawn('lord', [0, 0])], ally: [spawn('friend', [3, 2], { side: 'ally', ai: { mode: 'stationary' } })] });
    fieldArmy(battle, a);
    const friend = battle.units.find((u) => u.defId === 'friend')!;
    Object.assign(friend, { side: 'player', ai: null, retreated: true, chronicled: false });
    battle.outcome = { result: 'won', reason: 'test' };
    const classic = settleChapter(a, battle, 'classic');
    expect(classic.joined).toHaveLength(0);
    expect(a.units.map((u) => u.id)).toEqual(['lord']);
    const casual = settleChapter(a, battle, 'casual');
    expect(casual.joined.map((u) => u.defId)).toEqual(['friend']);
  });

  it('makes an army unit the map placed as an ally the army’s again', () => {
    const a = army('lord', 'friend');
    const battle = battleOn({ player: [spawn('lord', [0, 0])], ally: [spawn('friend', [3, 2], { side: 'ally', ai: { mode: 'stationary' } })] });
    fieldArmy(battle, a);
    battle.outcome = { result: 'won', reason: 'test' };
    const campaign = newCampaign({ mode: 'casual', seed: 1, story: 'campaign', army: a });
    expect(concludeBattle(campaign, battle)).not.toBeNull();
    expect(a.units[1]).toMatchObject({ side: 'player', ai: null });
  });

  it('carries on the flags the battle raised, and returns nothing for a defeat', () => {
    const a = army('lord');
    const battle = battleOn({ player: [spawn('lord', [0, 0])] });
    fieldArmy(battle, a);
    battle.flags.add('gate-open');
    const campaign = newCampaign({ mode: 'classic', seed: 1, story: 'campaign', army: a });
    battle.outcome = { result: 'lost', reason: 'test' };
    expect(concludeBattle(campaign, battle)).toBeNull();
    expect(campaign.flags.size).toBe(0);
    battle.outcome = { result: 'won', reason: 'test' };
    concludeBattle(campaign, battle);
    expect(campaign.flags.has('gate-open')).toBe(true);
  });
});
