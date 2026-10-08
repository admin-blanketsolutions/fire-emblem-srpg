import { describe, expect, it } from 'vitest';
import { planUnit } from '../src/core/ai';
import { battleOf, openMap, scripted, unit } from './support';

const lordAt = (x: number, y = 0) => unit({ id: 'lord', x, y, tags: ['lord'] });

describe('Seize', () => {
  const map = openMap(9, 1, { objective: { type: 'seize', tiles: [[8, 0]] } });

  it('lets the Lord seize from the marked tile, and wins the chapter', () => {
    const lord = lordAt(8);
    const battle = battleOf([lord, unit({ id: 'e', side: 'enemy', x: 2 })], map);
    expect(battle.canSeize(lord)).toBe(true);
    battle.seize(lord);
    expect(battle.outcome).toMatchObject({ result: 'won' });
    expect(lord).toMatchObject({ acted: true, moved: true });
  });

  it('refuses elsewhere, to other units, and to the other side', () => {
    const away = lordAt(7);
    const pawn = unit({ id: 'pawn', x: 8 });
    const foe = unit({ id: 'foe', side: 'enemy', x: 8 });
    const battle = battleOf([away], map);
    expect(battle.canSeize(away)).toBe(false);
    expect(() => battle.seize(away)).toThrow(/cannot seize/);
    expect(battleOf([pawn], map).canSeize(pawn)).toBe(false);
    expect(battleOf([foe], map).canSeize(foe)).toBe(false);
  });

  it('can be open to any unit, or to a named one', () => {
    const anyone = openMap(9, 1, { objective: { type: 'seize', tiles: [[8, 0]], by: 'any' } });
    const pawn = unit({ id: 'pawn', x: 8 });
    expect(battleOf([pawn], anyone).canSeize(pawn)).toBe(true);
    const named = openMap(9, 1, { objective: { type: 'seize', tiles: [[8, 0]], by: 'pawn' } });
    expect(battleOf([pawn], named).canSeize(pawn)).toBe(true);
    expect(battleOf([lordAt(8)], named).canSeize(lordAt(8))).toBe(false);
  });
});

describe('Escort', () => {
  const map = openMap(9, 1, { objective: { type: 'escort', unit: 'vip', exit: [[8, 0]] } });

  it('lets the escorted unit depart from an exit, and wins', () => {
    const vip = unit({ id: 'vip', x: 8 });
    const battle = battleOf([vip, lordAt(0)], map);
    expect(battle.canDepart(vip)).toBe(true);
    battle.depart(vip);
    expect(vip).toMatchObject({ retreated: true, escaped: true });
    expect(battle.outcome).toMatchObject({ result: 'won' });
  });

  it('does not let anyone else, or the escort away from the exit, depart', () => {
    const vip = unit({ id: 'vip', x: 7 });
    const other = unit({ id: 'other', x: 8 });
    const battle = battleOf([vip, other], map);
    expect(battle.canDepart(vip)).toBe(false);
    expect(battle.canDepart(other)).toBe(false);
    expect(() => battle.depart(vip)).toThrow(/cannot depart/);
  });

  it('is lost if the escort retreats wounded', () => {
    const vip = unit({ id: 'vip', x: 1 });
    vip.hp = 1;
    const foe = unit({ id: 'foe', side: 'enemy', x: 2 });
    const battle = battleOf([vip, foe], map, scripted(0, 99));
    battle.fight(foe, vip);
    expect(battle.outcome).toMatchObject({ result: 'lost' });
  });
});

describe('Talk and Persuade', () => {
  const map = openMap(9, 1, {
    objective: { type: 'persuade', targets: ['mira'], turns: 3 },
    events: [{ id: 'win-her-over', when: { type: 'talk', a: 'lord', b: 'mira' }, then: [{ type: 'recruit', unit: 'mira' }, { type: 'message', text: 'Mira joins you.' }] }],
  });
  const setup = (miraX: number) => {
    const lord = lordAt(3);
    const mira = unit({ id: 'mira', side: 'enemy', x: miraX, ai: { mode: 'stationary' } });
    return { lord, mira, battle: battleOf([lord, mira], map) };
  };

  it('offers a conversation only to the adjacent unit it is waiting for', () => {
    const near = setup(4);
    expect(near.battle.talkTargets(near.lord)).toEqual([near.mira]);
    expect(setup(5).battle.talkTargets(near.lord)).toEqual([]);
    expect(near.battle.talkTargets(near.mira)).toEqual([near.lord]); // either may start it
  });

  it('can be offered from a tile the unit is about to move to', () => {
    const far = setup(6);
    expect(far.battle.talkTargets(far.lord, { x: 5, y: 0 })).toEqual([far.mira]);
  });

  it('wins the other over, plays the scene, and wins the chapter', () => {
    const { lord, mira, battle } = setup(4);
    battle.talk(lord, mira);
    expect(mira).toMatchObject({ side: 'player', ai: null });
    expect(battle.messages).toEqual([{ kind: 'message', text: 'Mira joins you.' }]);
    expect(battle.outcome).toMatchObject({ result: 'won' });
    expect(lord.acted).toBe(true);
    expect(battle.talkTargets(lord)).toEqual([]); // the conversation has happened
  });

  it('loses the chapter when the time runs out first', () => {
    const { battle } = setup(7);
    battle.begin();
    for (let i = 0; i < 8 && !battle.outcome; i++) battle.endPhase();
    expect(battle.outcome).toMatchObject({ result: 'lost' });
    expect(battle.turn).toBe(3);
  });
});

describe('Visit and giving items', () => {
  const map = openMap(9, 1, {
    events: [{ id: 'village', when: { type: 'visit', tile: [2, 0] }, then: [{ type: 'giveItem', unit: 'lord', item: 'salve' }, { type: 'message', text: 'The elder gives you a salve.' }] }],
  });

  it('plays the visit once and gives the item', () => {
    const lord = lordAt(2);
    lord.inventory = [];
    const battle = battleOf([lord], map);
    expect(battle.canVisit(lord)).toBe(true);
    battle.visit(lord);
    expect(lord.inventory.map((i) => i.id)).toEqual(['salve']);
    expect(battle.messages).toEqual([{ kind: 'message', text: 'The elder gives you a salve.' }]);
    expect(battle.canVisit(lord)).toBe(false);
  });

  it('is not offered elsewhere or to the enemy', () => {
    const lord = lordAt(3);
    const foe = unit({ id: 'foe', side: 'enemy', x: 2 });
    const battle = battleOf([lord, foe], map);
    expect(battle.canVisit(lord)).toBe(false);
    expect(battle.canVisit(foe)).toBe(false);
  });

  it('keeps an item it cannot give, for later handling', () => {
    const lord = lordAt(2);
    lord.inventory = Array.from({ length: 5 }, () => ({ id: 'knife', uses: 5 }));
    const battle = battleOf([lord], map);
    battle.visit(lord);
    expect(lord.inventory).toHaveLength(5);
    expect(battle.unhandled).toContainEqual({ type: 'giveItem', unit: 'lord', item: 'salve' });
  });
});

describe('events during play', () => {
  it('fires an enter event when a unit ends its action on the tile, not merely as it passes', () => {
    const map = openMap(9, 1, { events: [{ id: 'ford', when: { type: 'unitEntersTile', unit: 'lord', tile: [4, 0] }, then: [{ type: 'flag', name: 'crossed' }] }] });
    const lord = lordAt(0);
    const battle = battleOf([lord], map);
    battle.moveUnit(lord, { x: 4, y: 0 }, battle.reachFor(lord));
    expect(battle.flags.has('crossed')).toBe(false); // the move can still be taken back
    battle.wait(lord);
    expect(battle.flags.has('crossed')).toBe(true);
  });

  it('chains: a defeat sets a flag, the flag ends the chapter', () => {
    const map = openMap(5, 1, {
      events: [
        { id: 'boss-down', when: { type: 'unitDefeated', unit: 'boss' }, then: [{ type: 'flag', name: 'boss-fell' }] },
        { id: 'finish', when: { type: 'flag', name: 'boss-fell' }, then: [{ type: 'endChapter', result: 'won', reason: 'The captain has fallen.' }] },
      ],
    });
    const hero = unit({ id: 'hero', x: 0 });
    const boss = unit({ id: 'boss', side: 'enemy', x: 1 });
    boss.hp = 1;
    const battle = battleOf([hero, boss], map, scripted(0, 99));
    battle.fight(hero, boss);
    expect(battle.outcome).toEqual({ result: 'won', reason: 'The captain has fallen.' });
  });

  it('changes a unit’s orders and brings units in', () => {
    const map = openMap(9, 1, {
      events: [
        { id: 'alarm', when: { type: 'turnStart', turn: 1, phase: 'player' }, then: [{ type: 'setAi', unit: 'guard', ai: { mode: 'stationary' } }, { type: 'spawn', units: [{ def: 'soldier', at: [8, 0] }] }] },
      ],
    });
    const guard = unit({ id: 'guard', side: 'enemy', x: 4 });
    const battle = battleOf([unit({ id: 'p' }), guard], map);
    const report = battle.begin();
    expect(guard.ai).toEqual({ mode: 'stationary' });
    expect(report.arrived.map((u) => u.id)).toEqual(['soldier#1']);
  });

  it('records actions it cannot carry out without failing, and keeps Codex unlocks for the campaign', () => {
    const map = openMap(5, 1, { events: [{ id: 'gate', when: { type: 'turnStart', turn: 1 }, then: [{ type: 'openGate', at: [2, 0] }, { type: 'unlockCodex', id: 'CDX-1' }] }] });
    const battle = battleOf([unit({ id: 'p' })], map);
    battle.begin();
    expect(battle.unhandled.map((a) => a.type)).toEqual(['openGate']);
    expect(battle.codexUnlocks).toEqual(['CDX-1']);
  });

  it('lets an enemy event unit be recruited by an event alone', () => {
    const map = openMap(5, 1, { events: [{ id: 'ally', when: { type: 'turnStart', turn: 1 }, then: [{ type: 'recruit', unit: 'defector' }] }] });
    const defector = unit({ id: 'defector', side: 'enemy', x: 3 });
    battleOf([unit({ id: 'p' }), defector], map).begin();
    expect(defector.side).toBe('player');
  });
});

describe('objectives during play', () => {
  it('Rout is won by defeating the last enemy in a fight', () => {
    const map = openMap(5, 1, { objective: { type: 'rout' } });
    const hero = unit({ id: 'hero', x: 0, tags: ['lord'] });
    const foe = unit({ id: 'foe', side: 'enemy', x: 1 });
    foe.hp = 1;
    const battle = battleOf([hero, foe], map, scripted(0, 99));
    battle.fight(hero, foe);
    expect(battle.outcome).toMatchObject({ result: 'won', reason: expect.stringMatching(/routed/) });
  });

  it('is lost when the Lord falls, and the phase no longer advances', () => {
    const map = openMap(5, 1, { objective: { type: 'rout' } });
    const lord = lordAt(0);
    lord.hp = 1;
    const foe = unit({ id: 'foe', side: 'enemy', x: 1 });
    const battle = battleOf([lord, foe], map, scripted(0, 99));
    battle.begin();
    battle.endPhase(); // the enemy phase
    battle.fight(foe, lord);
    expect(battle.outcome).toMatchObject({ result: 'lost' });
    const before = [battle.turn, battle.phase];
    battle.endPhase();
    expect([battle.turn, battle.phase]).toEqual(before);
  });

  it('the first decision stands', () => {
    const map = openMap(5, 1, { objective: { type: 'rout' } });
    const hero = unit({ id: 'hero', x: 0, tags: ['lord'] });
    const foe = unit({ id: 'foe', side: 'enemy', x: 1 });
    foe.hp = 1;
    const battle = battleOf([hero, foe], map, scripted(0, 99));
    battle.fight(hero, foe);
    hero.retreated = true;
    battle.check('action');
    expect(battle.outcome?.result).toBe('won');
  });

  it('Hold the Pass counts an enemy that reaches an anchor, as its plan carries it there', () => {
    const map = openMap(9, 1, { objective: { type: 'hold-the-pass', anchors: [[2, 0]], leakLimit: 0, turns: 5 } });
    const lord = lordAt(0);
    lord.stats.hp = 99;
    lord.hp = 99;
    const foe = unit({ id: 'foe', side: 'enemy', x: 5, ai: { mode: 'aggressive' } });
    const battle = battleOf([lord, foe], map);
    expect(battle.progress.leaked.size).toBe(0);
    battle.executePlan(planUnit(battle, foe)); // it advances (and fights) toward the lord, passing the anchor tile or standing on it
    // the anchor was at x = 2; the foe stops beside the lord at x = 1, so it never crossed
    expect(foe.x).toBe(1);
    expect(battle.outcome).toBeNull();
    foe.acted = false;
    foe.x = 2;
    battle.check('action');
    expect(battle.outcome).toMatchObject({ result: 'lost', reason: expect.stringMatching(/crossed/) });
  });

  it('Defend is lost when the enemy holds the anchor at the end of its phase', () => {
    const map = openMap(9, 1, { objective: { type: 'defend', turns: 4, anchor: [8, 0] } });
    const lord = lordAt(0);
    const foe = unit({ id: 'foe', side: 'enemy', x: 8, ai: { mode: 'stationary' } });
    const battle = battleOf([lord, foe], map);
    battle.begin();
    battle.endPhase(); // into the enemy phase
    battle.endPhase(); // the enemy phase ends with its unit on the anchor
    expect(battle.outcome).toMatchObject({ result: 'lost' });
  });
});
