import { describe, expect, it } from 'vitest';
import { buildSceneTable } from '../src/core/dialogue';
import { buildCharacterTable } from '../src/core/characters';
import { buildSupportTable, DEFAULT_AID, maxRank, pairKey, PACE_CAP, SupportTracker, TALK_POINTS, THRESHOLDS, type SupportGate, type SupportDef } from '../src/core/supports';
import { battleOf, openMap, scripted, unit } from './support';

const CHAPTERS = ['CH-00', 'CH-01', 'CH-02', 'CH-03'];
const gate = (chapter: string | null = 'CH-03', flags: string[] = []): SupportGate => ({ chapter, chapterOrder: CHAPTERS, flags: new Set(flags) });
const scenes = (rank: string) => ({ scene: `test.${rank.toLowerCase()}`, ledger: `SUP-TEST-${rank}` });
const def = (extra: Partial<SupportDef> & { id?: string } = {}): unknown => ({
  id: 'lord-pike',
  a: 'lord',
  b: 'pike',
  pace: 'normal',
  scenes: { C: scenes('C'), B: scenes('B'), A: scenes('A') },
  ...extra,
});
const table = (...defs: unknown[]) => buildSupportTable(defs.length > 0 ? defs : [def()]);
const tracker = (...defs: unknown[]) => new SupportTracker(table(...defs));

const at = (defId: string, x: number, y = 0) => ({ defId, x, y });

describe('the support table', () => {
  it('builds a pair with its scenes, and knows how far a pair may go', () => {
    const t = table(def({ bondKind: 'kin', scenes: { C: scenes('C'), B: scenes('B'), A: scenes('A'), Bond: scenes('BOND') } }), def({ id: 'x', a: 'p', b: 'q' }));
    expect(t.size).toBe(2);
    expect(maxRank(t.get('lord-pike')!)).toBe('Bond');
    expect(maxRank(t.get('x')!)).toBe('A');
  });

  it('rejects bad data', () => {
    expect(() => table(def({ a: 'lord', b: 'lord' }))).toThrow(/support itself/);
    expect(() => table(def(), def({ id: 'again', a: 'pike', b: 'lord' }))).toThrow(/already defined/);
    expect(() => table(def(), def())).toThrow(/duplicate/);
    expect(() => table(def({ pace: 'brisk' as never }))).toThrow(/pace/);
    expect(() => table(def({ bondKind: 'friends' as never }))).toThrow(/bondKind/);
    expect(() => table(def({ scenes: { C: scenes('C'), Bond: scenes('B') } as never }))).toThrow(/Bond rank/);
    expect(() => table(def({ scenes: { B: scenes('B') } }))).toThrow(/needs rank C first/);
    expect(() => table(def({ scenes: {} }))).toThrow(/at least one scene/);
    expect(() => table(def({ scenes: { S: scenes('C') } as never }))).toThrow(/unknown rank/);
    expect(() => table(def({ scenes: { C: { scene: 'x', ledger: 'CH-00.E1' } } }))).toThrow(/SUP-/);
    expect(() => table(def({ aid: { C: { hit: 99 } } }))).toThrow(/0 to 30/);
    expect(() => table(def({ aid: { C: { speed: 3 } as never } }))).toThrow(/unknown "speed"/);
    expect(() => table(def({ aid: { S: { hit: 1 } } as never }))).toThrow(/unknown rank/);
  });

  it('checks its scenes, ledger rows and chapters when it is given them to check against', () => {
    const characters = buildCharacterTable([{ id: 'lord', name: 'Lord', ledger: 'CHR-L', portrait: null }]);
    const sceneTable = buildSceneTable([{ id: 'test.c', title: 'C', ledger: [], cmds: [{ say: { who: 'lord', text: 'Hm.', kind: 'dramatized' } }] }], { characters });
    const raw = def({ scenes: { C: scenes('C') } });
    expect(() => buildSupportTable([raw], { scenes: sceneTable })).not.toThrow();
    expect(() => buildSupportTable([def({ scenes: { C: { scene: 'test.zzz', ledger: 'SUP-TEST-C' } } })], { scenes: sceneTable })).toThrow(/does not exist/);
    expect(() => buildSupportTable([raw], { knownLedgerId: () => false })).toThrow(/not in the ledger/);
    expect(() => buildSupportTable([def({ scenes: { C: { ...scenes('C'), availableFrom: 'CH-99' } } })], { chapters: CHAPTERS })).toThrow(/not a chapter/);
  });
});

describe('earning points on the battlefield', () => {
  const tick = (t: SupportTracker, units: Array<{ defId: string; x: number; y?: number }>, extra: { fought?: Array<[string, number, number]>; aided?: string[] } = {}) =>
    t.tickPhase({
      units: units.map((u) => ({ defId: u.defId, x: u.x, y: u.y ?? 0 })),
      fought: new Map((extra.fought ?? []).map(([id, x, y]) => [id, { x, y }])),
      aided: new Set(extra.aided ?? []),
    });

  it('+2 for standing next to each other, +1 within three tiles, nothing farther', () => {
    const t = tracker();
    expect(tick(t, [at('lord', 0), at('pike', 1)])).toEqual([{ support: 'lord-pike', added: 2 }]);
    expect(tick(t, [at('lord', 0), at('pike', 3)])).toEqual([{ support: 'lord-pike', added: 1 }]);
    expect(tick(t, [at('lord', 0), at('pike', 4)])).toEqual([]);
    expect(t.stateOf('lord-pike').points).toBe(3);
  });

  it('both must be on the field', () => {
    const t = tracker();
    expect(tick(t, [at('lord', 0)])).toEqual([]);
    expect(tick(t, [])).toEqual([]);
  });

  it('+1 if both fought within two tiles of each other, and +2 for aid, once each', () => {
    const t = tracker();
    const gained = (extra: Parameters<typeof tick>[2]) => tick(t, [at('lord', 0), at('pike', 6)], extra)[0]?.added ?? 0;
    expect(gained({ fought: [['lord', 1, 1], ['pike', 2, 2]] })).toBe(1);
    expect(gained({ fought: [['lord', 1, 1], ['pike', 6, 6]] })).toBe(0);
    expect(gained({ fought: [['lord', 1, 1]] })).toBe(0);
    expect(gained({ aided: [pairKey('pike', 'lord')] })).toBe(2);
    expect(gained({ fought: [['lord', 0, 0], ['pike', 1, 0]], aided: [pairKey('lord', 'pike')] })).toBe(3);
  });

  it('stops at the cap of the pace for the chapter, and starts again with the next', () => {
    const t = tracker(def({ pace: 'slow' }));
    for (let i = 0; i < 15; i++) tick(t, [at('lord', 0), at('pike', 1)]);
    expect(PACE_CAP.slow).toBe(20);
    expect(t.stateOf('lord-pike').points).toBe(20);
    expect(tick(t, [at('lord', 0), at('pike', 1)])).toEqual([]);
    t.startChapter();
    expect(tick(t, [at('lord', 0), at('pike', 1)])).toEqual([{ support: 'lord-pike', added: 2 }]);
    expect(t.stateOf('lord-pike').points).toBe(22);
    expect(PACE_CAP.normal).toBe(30);
    expect(PACE_CAP.fast).toBe(40);
  });

  it('a partial gain at the cap is trimmed, not refused', () => {
    const t = tracker(def({ pace: 'slow' }));
    t.earn('lord-pike', 19);
    expect(t.earn('lord-pike', 5)).toBe(1);
    expect(t.earn('nobody', 5)).toBe(0);
    expect(t.earn('lord-pike', 0)).toBe(0);
  });
});

describe('the scenes', () => {
  it('opens a scene at each threshold, one at a time, and the rank takes effect only once it is viewed', () => {
    const t = tracker();
    expect(THRESHOLDS).toEqual({ C: 20, B: 60, A: 120, Bond: 200 });
    expect(t.available('lord-pike', gate())).toBeNull();
    t.stateOf('lord-pike').points = 19;
    expect(t.available('lord-pike', gate())).toBeNull();
    t.stateOf('lord-pike').points = 20;
    expect(t.available('lord-pike', gate())).toBe('C');
    expect(t.rankOf('lord-pike')).toBeNull(); // the points are in, but the scene has not been seen
    t.view('lord-pike', 'C', gate());
    expect(t.rankOf('lord-pike')).toBe('C');
    expect(t.stateOf('lord-pike').points).toBe(20 + TALK_POINTS);
    expect(t.available('lord-pike', gate())).toBeNull(); // 30 points: B needs 60
    t.stateOf('lord-pike').points = 60;
    expect(t.available('lord-pike', gate())).toBe('B');
  });

  it('will not show a scene that is not available', () => {
    const t = tracker();
    expect(() => t.view('lord-pike', 'C', gate())).toThrow(/not available/);
    t.stateOf('lord-pike').points = 500;
    expect(() => t.view('lord-pike', 'B', gate())).toThrow(/not available/); // C first
  });

  it('keeps history in order: a scene waits for its chapter and its flags', () => {
    const t = tracker(def({ scenes: { C: { ...scenes('C'), availableFrom: 'CH-02', requiresFlags: ['rebuked'] } } }));
    t.stateOf('lord-pike').points = 100;
    expect(t.available('lord-pike', gate('CH-01', ['rebuked']))).toBeNull();
    expect(t.available('lord-pike', gate(null, ['rebuked']))).toBeNull();
    expect(t.available('lord-pike', gate('CH-02'))).toBeNull();
    expect(t.available('lord-pike', gate('CH-02', ['rebuked']))).toBe('C');
    expect(t.available('lord-pike', gate('CH-03', ['rebuked']))).toBe('C');
  });

  it('stops at A for friends and goes on to Bond for kin and sworn brothers', () => {
    const friends = tracker();
    friends.stateOf('lord-pike').viewed.push('C', 'B', 'A');
    friends.stateOf('lord-pike').points = 999;
    expect(friends.available('lord-pike', gate())).toBeNull();
    const kin = tracker(def({ bondKind: 'kin', scenes: { C: scenes('C'), B: scenes('B'), A: scenes('A'), Bond: scenes('BOND') } }));
    kin.stateOf('lord-pike').viewed.push('C', 'B', 'A');
    kin.stateOf('lord-pike').points = 199;
    expect(kin.available('lord-pike', gate())).toBeNull();
    kin.stateOf('lord-pike').points = 200;
    expect(kin.available('lord-pike', gate())).toBe('Bond');
  });

  it('lists every pair with a scene to show', () => {
    const t = tracker(def(), def({ id: 'two', a: 'p', b: 'q' }));
    t.stateOf('two').points = 25;
    expect(t.availableAll(gate()).map((s) => [s.support.id, s.rank, s.scene.scene])).toEqual([['two', 'C', 'test.c']]);
  });

  it('a pair advances from C to B in play: two chapters of fighting side by side, and two scenes in camp', () => {
    const t = tracker();
    const lord = unit({ id: 'lord', x: 1, y: 1, class: 'young-lord' });
    const pike = unit({ id: 'pike', x: 2, y: 1, class: 'pikeman', inventory: ['levy-spear'] });
    const foe = unit({ id: 'foe', side: 'enemy', x: 9, y: 1 });
    const play = (turns: number) => {
      const battle = battleOf([lord, pike, foe], openMap(10, 3));
      battle.supports = t;
      battle.begin();
      for (let i = 0; i < turns; i++) {
        battle.endPhase(); // the player's
        battle.endPhase(); // the enemy's
      }
    };
    play(20); // two points a phase, but the cap for a chapter is 30
    expect(t.stateOf('lord-pike').points).toBe(30);
    expect(t.available('lord-pike', gate())).toBe('C');
    t.view('lord-pike', 'C', gate());
    expect(t.rankOf('lord-pike')).toBe('C');
    expect(t.stateOf('lord-pike').points).toBe(40);
    play(20); // the next chapter earns another 30
    expect(t.stateOf('lord-pike').points).toBe(70);
    expect(t.available('lord-pike', gate())).toBe('B');
    t.view('lord-pike', 'B', gate());
    expect(t.rankOf('lord-pike')).toBe('B');
  });
});

describe('supports in the battle', () => {
  const setup = (extra: unknown[] = []) => {
    const t = tracker(...[def(), ...extra]);
    const lord = unit({ id: 'lord', x: 1, y: 1, class: 'young-lord' });
    const pike = unit({ id: 'pike', x: 2, y: 1, class: 'pikeman', inventory: ['levy-spear'] });
    const foe = unit({ id: 'foe', side: 'enemy', x: 1, y: 0, inventory: ['iron-sabre'] });
    const battle = battleOf([lord, pike, foe], openMap(6, 3), scripted(0, 99, 0, 99, 0, 99));
    battle.supports = t;
    return { t, lord, pike, foe, battle };
  };

  it('earns points only at the end of the player’s phase', () => {
    const { t, battle } = setup();
    battle.begin();
    battle.endPhase();
    expect(t.stateOf('lord-pike').points).toBe(2);
    battle.endPhase(); // the enemy's phase ends: no points
    expect(t.stateOf('lord-pike').points).toBe(2);
  });

  it('reports what the phase earned', () => {
    const { battle } = setup();
    battle.begin();
    expect(battle.endPhase().supportGains).toEqual([{ support: 'lord-pike', added: 2 }]);
    expect(battle.endPhase().supportGains).toEqual([]);
  });

  it('counts a fight, and a remedy, toward the pair', () => {
    const { t, lord, foe, battle } = setup();
    const healer = unit({ id: 'pike', class: 'healer', inventory: ['salve'], x: 2, y: 1 });
    battle.units.splice(1, 1, healer);
    battle.begin();
    battle.fight(lord, foe);
    lord.hp = 5;
    battle.heal(healer, lord, 0);
    battle.endPhase();
    // adjacent (2) + the healer healed the lord (2); the healer did not fight, so no fighting point
    expect(t.stateOf('lord-pike').points).toBe(4);
  });

  it('gives a supported friend’s bonus to a unit fighting beside it, by rank, and only once the scene is seen', () => {
    const { t, lord, foe, battle } = setup();
    const base = battle.forecastFor(lord, foe)!;
    expect(DEFAULT_AID.C).toEqual({ hit: 5, avoid: 5, crit: 0, grd: 0 });
    t.stateOf('lord-pike').points = 500; // enough points, but no scene viewed
    expect(battle.forecastFor(lord, foe)!.attacker.accuracy).toBe(base.attacker.accuracy);
    t.stateOf('lord-pike').viewed.push('C');
    const c = battle.forecastFor(lord, foe)!;
    expect(c.attacker.accuracy - base.attacker.accuracy).toBe(5);
    expect(c.attacker.evasion - base.attacker.evasion).toBe(5);
    t.stateOf('lord-pike').viewed.push('B');
    const b = battle.forecastFor(lord, foe)!;
    expect(b.attacker.accuracy - base.attacker.accuracy).toBe(10);
    expect(b.attacker.strike!.crit - base.attacker.strike!.crit).toBe(3);
    t.stateOf('lord-pike').viewed.push('A');
    const a = battle.forecastFor(lord, foe)!;
    expect(a.defender.strike!.damage).toBe(base.defender.strike!.damage - 1); // A adds a point of Guard
  });

  it('only counts a supporter that stands next to the tile, and gives it to the supporter too', () => {
    const { t, lord, pike, foe, battle } = setup();
    t.stateOf('lord-pike').viewed.push('C');
    const base = battleOf([lord, pike, foe], openMap(6, 3)).forecastFor(lord, foe)!;
    pike.x = 4; // two tiles away
    expect(battle.forecastFor(lord, foe)!.attacker.accuracy).toBe(base.attacker.accuracy);
    pike.x = 2;
    expect(battle.forecastFor(lord, foe)!.attacker.accuracy).toBe(base.attacker.accuracy + 5);
    // the lord is beside the pikeman too
    foe.x = 3;
    foe.y = 1;
    const fc = battle.forecastFor(pike, foe)!;
    const without = battleOf([lord, pike, foe], openMap(6, 3)).forecastFor(pike, foe)!;
    expect(fc.attacker.accuracy - without.attacker.accuracy).toBe(5);
  });

  it('uses the best two supporters of a unit, and a pair’s own aid overrides the default', () => {
    const t = tracker(
      def(),
      def({ id: 'lord-a', a: 'lord', b: 'ally-a', scenes: { C: scenes('C'), B: scenes('B') } }),
      def({ id: 'lord-b', a: 'lord', b: 'ally-b', scenes: { C: scenes('C') }, aid: { C: { hit: 30, avoid: 0, grd: 2 } } }),
    );
    const here = { x: 1, y: 1 };
    const near = [at('pike', 1, 0), at('ally-a', 0, 1), at('ally-b', 2, 1)];
    t.stateOf('lord-pike').viewed.push('C'); // C
    t.stateOf('lord-a').viewed.push('C', 'B'); // B
    t.stateOf('lord-b').viewed.push('C'); // C, overridden
    // B first, then the better of the two C pairs; Pike's C is the third and does not count
    expect(t.aidFor('lord', here, near)).toEqual({ hit: DEFAULT_AID.B.hit + 30, avoid: DEFAULT_AID.B.avoid + 0, crit: DEFAULT_AID.B.crit, grd: 2 });
    expect(t.aidFor('lord', here, [at('pike', 3, 3)])).toEqual({ hit: 0, avoid: 0, crit: 0, grd: 0 });
    expect(t.aidFor('stranger', here, near)).toEqual({ hit: 0, avoid: 0, crit: 0, grd: 0 });
  });

  it('is not given to enemy units, who have no supports', () => {
    const { t, foe, battle, lord } = setup();
    t.stateOf('lord-pike').viewed.push('C');
    const fc = battle.forecastFor(foe, lord)!;
    const bare = battleOf([lord, foe], openMap(6, 3)).forecastFor(foe, lord)!;
    expect(fc.attacker.accuracy).toBe(bare.attacker.accuracy);
  });
});

describe('saving a support', () => {
  it('round-trips through a snapshot, and drops what the table no longer knows', () => {
    const t = tracker();
    t.stateOf('lord-pike').points = 44;
    t.stateOf('lord-pike').chapterPoints = 12;
    t.stateOf('lord-pike').viewed.push('C');
    const copy = tracker();
    copy.restore({ ...t.snapshot(), gone: { points: 9, chapterPoints: 9, viewed: ['C'] } });
    expect(copy.snapshot()).toEqual(t.snapshot());
    expect(copy.rankOf('lord-pike')).toBe('C');
    expect(Object.keys(copy.snapshot())).toEqual(['lord-pike']);
  });

  it('finds a pair in either order', () => {
    const t = tracker();
    expect(t.between('lord', 'pike')?.id).toBe('lord-pike');
    expect(t.between('pike', 'lord')?.id).toBe('lord-pike');
    expect(t.between('pike', 'x')).toBeUndefined();
    expect(t.partnerIn(t.between('lord', 'pike')!, 'lord')).toBe('pike');
    expect(t.partnerIn(t.between('lord', 'pike')!, 'x')).toBeNull();
  });
});
