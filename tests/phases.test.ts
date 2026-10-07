import { describe, expect, it } from 'vitest';
import { battleOf, mapOf, openMap, unit } from './support';

describe('phase order', () => {
  it('runs player, ally, enemy, then the next turn', () => {
    const battle = battleOf([unit({ id: 'p' }), unit({ id: 'a', side: 'ally', x: 1 }), unit({ id: 'e', side: 'enemy', x: 5 })], openMap(9, 1));
    battle.begin();
    const seen: Array<[number, string]> = [[battle.turn, battle.phase]];
    for (let i = 0; i < 4; i++) {
      battle.endPhase();
      seen.push([battle.turn, battle.phase]);
    }
    expect(seen).toEqual([[1, 'player'], [1, 'ally'], [1, 'enemy'], [2, 'player'], [2, 'ally']]);
  });

  it('skips a side that has no units', () => {
    const battle = battleOf([unit({ id: 'p' }), unit({ id: 'e', side: 'enemy', x: 5 })], openMap(9, 1));
    battle.begin();
    battle.endPhase();
    expect(battle.phase).toBe('enemy');
  });

  it('follows the order the map gives, and begins with its first phase', () => {
    const map = openMap(9, 1, { phaseOrder: ['enemy', 'player'] });
    const battle = battleOf([unit({ id: 'p' }), unit({ id: 'e', side: 'enemy', x: 5 })], map);
    expect(battle.phase).toBe('enemy');
    battle.endPhase();
    expect([battle.phase, battle.turn]).toEqual(['player', 1]);
    battle.endPhase();
    expect([battle.phase, battle.turn]).toEqual(['enemy', 2]);
  });

  it('rejects a phase order without the player or with repeats', () => {
    expect(() => openMap(5, 1, { phaseOrder: ['enemy'] })).toThrow(/phaseOrder/);
    expect(() => openMap(5, 1, { phaseOrder: ['player', 'player'] })).toThrow(/phaseOrder/);
  });
});

describe('the start of a phase', () => {
  it('readies only the units of the side whose phase it is', () => {
    const p = unit({ id: 'p' });
    const e = unit({ id: 'e', side: 'enemy', x: 5 });
    const battle = battleOf([p, e], openMap(9, 1));
    p.acted = true;
    e.acted = true;
    battle.endPhase(); // the enemy phase begins
    expect(e.acted).toBe(false);
    expect(p.acted).toBe(true); // the player's units are readied at the start of their own phase
    battle.endPhase();
    expect(p.acted).toBe(false);
  });

  it('heals units standing on healing ground at the start of their own phase', () => {
    const map = mapOf(['.+.']);
    const mine = unit({ id: 'mine', x: 1 });
    const theirs = unit({ id: 'theirs', side: 'enemy', x: 1, y: 0 });
    theirs.x = 1;
    mine.hp = 10;
    const battle = battleOf([mine], map);
    const report = battle.begin();
    expect(report.healed).toEqual([{ unit: mine, amount: 2 }]); // 10% of 18 HP, rounded up
    expect(mine.hp).toBe(12);
    void theirs;
  });

  it('does not heal past full or heal units on other sides', () => {
    const map = mapOf(['.++']);
    const full = unit({ id: 'full', x: 1 });
    const foe = unit({ id: 'foe', side: 'enemy', x: 2 });
    foe.hp = 3;
    const battle = battleOf([full, foe], map);
    expect(battle.begin().healed).toEqual([]);
    battle.endPhase(); // the enemy phase
    expect(foe.hp).toBeGreaterThan(3);
  });

  it('fires turn-start events with the turn and phase', () => {
    const map = openMap(5, 1, {
      events: [
        { id: 'warn', when: { type: 'turnStart', turn: 2, phase: 'enemy' }, then: [{ type: 'message', text: 'Riders on the road!' }] },
        { id: 'open', when: { type: 'turnStart', turn: 1 }, then: [{ type: 'flag', name: 'begun' }] },
      ],
    });
    const battle = battleOf([unit({ id: 'p' }), unit({ id: 'e', side: 'enemy', x: 4 })], map);
    battle.begin();
    expect(battle.flags.has('begun')).toBe(true);
    expect(battle.messages).toEqual([]);
    battle.endPhase(); // enemy, turn 1
    battle.endPhase(); // player, turn 2
    expect(battle.messages).toEqual([]);
    battle.endPhase(); // enemy, turn 2
    expect(battle.messages).toEqual([{ kind: 'message', text: 'Riders on the road!' }]);
  });
});

describe('reinforcements', () => {
  const map = openMap(9, 1, { reinforcements: [{ turn: 2, phase: 'enemy', units: [{ def: 'soldier', at: [8, 0] }] }] });
  const setup = () => battleOf([unit({ id: 'p' }), unit({ id: 'e', side: 'enemy', x: 5 })], map);

  it('arrive at the start of their phase, ready to act', () => {
    const battle = setup();
    battle.begin();
    battle.endPhase(); // enemy, turn 1
    expect(battle.units).toHaveLength(2);
    battle.endPhase(); // player, turn 2
    expect(battle.units).toHaveLength(2);
    const report = battle.endPhase(); // enemy, turn 2
    expect(report.arrived.map((u) => u.id)).toEqual(['soldier#1']);
    expect(battle.units).toHaveLength(3);
    const arrived = report.arrived[0]!;
    expect(arrived).toMatchObject({ side: 'enemy', x: 8, y: 0, acted: false });
    expect(battle.arrivals).toEqual([]); // the report carries them; they are not announced twice
  });

  it('appear on the nearest free tile when theirs is taken', () => {
    const battle = setup();
    const blocker = unit({ id: 'blocker', x: 8 });
    battle.units.push(blocker);
    battle.begin();
    battle.endPhase();
    battle.endPhase();
    const arrived = battle.endPhase().arrived[0]!;
    expect(arrived.x).toBe(7);
  });

  it('are counted as still to come until they have arrived', () => {
    const battle = setup();
    battle.begin();
    expect(battle.hasFutureReinforcements()).toBe(true);
    battle.endPhase();
    battle.endPhase();
    expect(battle.hasFutureReinforcements()).toBe(true);
    battle.endPhase(); // they arrive
    expect(battle.hasFutureReinforcements()).toBe(false);
  });

  it('bring the enemy phase back even when no enemy is left on the field', () => {
    const lone = unit({ id: 'p' });
    const battle = battleOf([lone], map);
    battle.begin();
    expect(battle.endPhase().phase).toBe('player'); // turn 1: no enemy, so the phase is skipped
    expect(battle.turn).toBe(2);
    expect(battle.endPhase()).toMatchObject({ phase: 'enemy', turn: 2 }); // reinforcements are due
  });

  it('reject a unit the game does not know', () => {
    const bad = openMap(5, 1, { reinforcements: [{ turn: 1, phase: 'enemy', units: [{ def: 'dragon', at: [4, 0] }] }] });
    const battle = battleOf([unit({ id: 'p' })], bad);
    expect(() => battle.begin()).not.toThrow(); // the player phase has none due
    expect(() => battle.endPhase()).toThrow(/unknown unit "dragon"/);
  });
});

describe('the end of a turn', () => {
  it('decides the chapter at the end of the last turn and stops there', () => {
    const map = openMap(5, 1, { objective: { type: 'survive', turns: 1 } });
    const battle = battleOf([unit({ id: 'p', tags: ['lord'] }), unit({ id: 'e', side: 'enemy', x: 4, ai: { mode: 'stationary' } })], map);
    battle.begin();
    battle.endPhase(); // enemy
    expect(battle.outcome).toBeNull();
    battle.endPhase(); // the turn ends
    expect(battle.outcome).toMatchObject({ result: 'won' });
    expect(battle.turn).toBe(1); // the chapter ended on turn 1; the counter did not advance
  });
});
