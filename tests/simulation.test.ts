import { describe, expect, it } from 'vitest';
import { playPhase } from '../src/core/ai';
import type { BattleState } from '../src/core/battle';
import { OBJECTIVE_TYPES } from '../src/core/objectives';
import type { UnitInstance } from '../src/core/unit';
import { createProvingBattle, PROVING_OBJECTIVES } from '../src/data/proving';

/**
 * The M3 acceptance: the proving-ground map played to victory and to defeat under every objective
 * type. Some scenarios are played by the AI on both sides; others set up the position that the
 * objective turns on and play the actions that decide it.
 */

const unitOf = (battle: BattleState, id: string): UnitInstance => {
  const found = battle.units.find((u) => u.id === id);
  if (!found) throw new Error(`no unit "${id}"`);
  return found;
};

/** Let the AI play every phase, the player's side included, until the chapter is decided. */
function autoplay(battle: BattleState, maxTurns = 60): void {
  for (const u of battle.units) if (u.side === 'player' && !u.ai) u.ai = { mode: 'aggressive' };
  for (let guard = 0; guard < maxTurns * 4 && !battle.outcome && battle.turn <= maxTurns; guard++) {
    playPhase(battle, battle.phase);
    if (battle.outcome) break;
    battle.endPhase();
  }
}

/** Let the turns pass with nobody acting. */
function waitItOut(battle: BattleState, maxPhases = 60): void {
  for (let i = 0; i < maxPhases && !battle.outcome; i++) battle.endPhase();
}

/** Put a foe beside the Lord with so much skill that its first blow cannot miss, and leave the Lord one hit from retreat. */
function endangerLord(battle: BattleState): void {
  const lord = unitOf(battle, 'lord');
  lord.hp = 1;
  const foe = unitOf(battle, 'soldier#1');
  foe.x = lord.x;
  foe.y = lord.y - 1;
  foe.stats.skl = 60;
  foe.stats.mgt = 20;
}

const strengthen = (battle: BattleState): void => {
  for (const u of battle.livingUnits('player')) {
    u.stats.mgt += 14;
    u.stats.hp += 40;
    u.hp = u.stats.hp;
  }
};

describe('every objective type is covered', () => {
  it('has a proving-ground preset for each of the seven', () => {
    expect([...PROVING_OBJECTIVES].sort()).toEqual([...OBJECTIVE_TYPES].sort());
  });
});

describe('Rout', () => {
  it('is won when the AI-led army defeats the enemy', () => {
    const battle = createProvingBattle('rout', { seed: 11 });
    strengthen(battle);
    autoplay(battle);
    expect(battle.outcome).toMatchObject({ result: 'won' });
    expect(battle.livingUnits('enemy')).toHaveLength(0);
  });

  it('is lost when the Lord retreats wounded', () => {
    const battle = createProvingBattle('rout', { seed: 11 });
    endangerLord(battle);
    battle.endPhase(); // the enemy phase
    playPhase(battle, 'enemy');
    expect(battle.outcome).toMatchObject({ result: 'lost', reason: expect.stringMatching(/Lord/) });
  });
});

describe('Seize', () => {
  it('is won by the Lord seizing the marked tile', () => {
    const battle = createProvingBattle('seize');
    const lord = unitOf(battle, 'lord');
    lord.x = 18;
    lord.y = 7;
    expect(battle.canSeize(lord)).toBe(true);
    battle.seize(lord);
    expect(battle.outcome).toMatchObject({ result: 'won' });
  });

  it('is lost when the Lord falls first', () => {
    const battle = createProvingBattle('seize');
    endangerLord(battle);
    battle.endPhase();
    playPhase(battle, 'enemy');
    expect(battle.outcome).toMatchObject({ result: 'lost' });
  });
});

describe('Defend', () => {
  it('is won by holding to the end of the final turn', () => {
    const battle = createProvingBattle('defend');
    waitItOut(battle);
    expect(battle.outcome).toMatchObject({ result: 'won' });
    expect(battle.turn).toBe(6);
  });

  it('is lost when the Lord falls', () => {
    const battle = createProvingBattle('defend');
    endangerLord(battle);
    battle.endPhase();
    playPhase(battle, 'enemy');
    expect(battle.outcome).toMatchObject({ result: 'lost' });
  });
});

describe('Hold the Pass', () => {
  it('is won when the pass holds to the end of the final turn', () => {
    const battle = createProvingBattle('hold-the-pass');
    waitItOut(battle);
    expect(battle.outcome).toMatchObject({ result: 'won' });
    expect(battle.turn).toBe(6);
  });

  it('is lost when more enemies cross than the limit allows', () => {
    const battle = createProvingBattle('hold-the-pass');
    unitOf(battle, 'soldier#1').x = 10;
    unitOf(battle, 'soldier#1').y = 7;
    unitOf(battle, 'soldier#2').x = 11;
    unitOf(battle, 'soldier#2').y = 7;
    battle.check('action');
    expect(battle.outcome).toMatchObject({ result: 'lost', reason: expect.stringMatching(/crossed/) });
  });

  it('is lost when the AI actually pushes across the bridge', () => {
    const battle = createProvingBattle('hold-the-pass', { seed: 3 });
    for (const u of battle.livingUnits('enemy')) {
      u.x = 12 + (u.x % 3); // gather the enemy just east of the bridge
      u.y = 7 + (u.x % 2);
    }
    // keep only fast aggressive attackers on the field, and no player unit near the crossing
    for (const u of battle.livingUnits('player')) {
      u.x = 1;
      u.y = 1 + battle.units.indexOf(u);
    }
    battle.endPhase();
    for (let i = 0; i < 12 && !battle.outcome; i++) {
      playPhase(battle, 'enemy');
      if (!battle.outcome) battle.endPhase();
      if (!battle.outcome) battle.endPhase();
    }
    expect(battle.outcome).toMatchObject({ result: 'lost' });
  });
});

describe('Escort', () => {
  it('is won when the escort reaches the exit and departs', () => {
    const battle = createProvingBattle('escort');
    const healer = unitOf(battle, 'healer');
    healer.x = 19;
    healer.y = 7;
    expect(battle.canDepart(healer)).toBe(true);
    battle.depart(healer);
    expect(battle.outcome).toMatchObject({ result: 'won' });
  });

  it('is lost when the escort retreats wounded', () => {
    const battle = createProvingBattle('escort');
    const healer = unitOf(battle, 'healer');
    healer.hp = 1;
    const foe = unitOf(battle, 'soldier#1');
    foe.x = healer.x;
    foe.y = healer.y + 1;
    foe.stats.skl = 60;
    foe.stats.mgt = 20;
    battle.endPhase();
    playPhase(battle, 'enemy');
    expect(battle.outcome).toMatchObject({ result: 'lost', reason: expect.stringMatching(/escort/) });
  });
});

describe('Survive', () => {
  it('is won by lasting to the end of the final turn', () => {
    const battle = createProvingBattle('survive');
    waitItOut(battle);
    expect(battle.outcome).toMatchObject({ result: 'won' });
    expect(battle.turn).toBe(6);
  });

  it('is lost when the Lord falls', () => {
    const battle = createProvingBattle('survive');
    endangerLord(battle);
    battle.endPhase();
    playPhase(battle, 'enemy');
    expect(battle.outcome).toMatchObject({ result: 'lost' });
  });
});

describe('Persuade', () => {
  it('is won by talking the crossbowman round', () => {
    const battle = createProvingBattle('persuade');
    const lord = unitOf(battle, 'lord');
    lord.x = 16;
    lord.y = 6;
    const target = unitOf(battle, 'crossbowman');
    expect(battle.talkTargets(lord)).toEqual([target]);
    battle.talk(lord, target);
    expect(target.side).toBe('player');
    expect(battle.outcome).toMatchObject({ result: 'won' });
    expect(battle.messages.map((m) => (m.kind === 'message' ? m.text : m.scene))).toEqual(['The crossbowman lowers his weapon and joins you.']);
  });

  it('is lost when the turns run out', () => {
    const battle = createProvingBattle('persuade');
    waitItOut(battle);
    expect(battle.outcome).toMatchObject({ result: 'lost', reason: expect.stringMatching(/Time ran out/) });
    expect(battle.turn).toBe(8);
  });
});

describe('a whole battle played by the AI', () => {
  const play = (seed: number) => {
    const battle = createProvingBattle('rout', { seed });
    autoplay(battle);
    return battle;
  };

  it('always reaches a decision and leaves nobody standing on the same tile', () => {
    for (const seed of [1, 2, 3]) {
      const battle = play(seed);
      expect(battle.outcome, `seed ${seed}`).not.toBeNull();
      const tiles = battle.livingUnits().map((u) => `${u.x},${u.y}`);
      expect(new Set(tiles).size).toBe(tiles.length);
      expect(battle.units.some((u) => u.retreated)).toBe(true);
    }
  });

  it('plays out the same way every time from the same seed, and differently from another', () => {
    const summary = (b: BattleState) => JSON.stringify({ o: b.outcome, t: b.turn, u: b.units.map((u) => [u.id, u.x, u.y, u.hp, u.retreated, u.level, u.exp]) });
    expect(summary(play(5))).toBe(summary(play(5)));
    expect(summary(play(5))).not.toBe(summary(play(6)));
  });
});
