import { describe, expect, it } from 'vitest';
import { BattleState, DEFAULT_RULES } from '../src/core/battle';
import { tileKey } from '../src/core/grid';
import type { UnitInstance } from '../src/core/unit';
import { createRng, type Rng } from '../src/core/rng';
import { balance, mapOf, scripted, tables, unit } from './support';

const legend = { '.': 'plain', s: 'steppe', '~': 'river', W: 'wall', G: 'grove' };
const map = (rows: string[], extra = {}) => mapOf(rows, extra, legend);
const lit = (b: BattleState): string[] => [...b.flames.keys()].map((k) => `${k % 4096},${Math.floor(k / 4096)}`).sort();

/** A battle with the spread chance set, for tests that need fire to spread for certain (or not at all). */
const hot = (units: UnitInstance[], rows: string[], spreadChance: number, rng: Rng = createRng(1), extra = {}) =>
  new BattleState(map(rows, extra), units, { ...tables, balance: { ...balance, spreadChance } }, rng, DEFAULT_RULES);

/** A far-off enemy so the enemy phase is played and a turn can pass. */
const bystander = (x: number, y = 0) => unit({ id: `far${x}`, side: 'enemy', x, y });

describe('lighting flames', () => {
  it('burns two turns on bare ground and three on what burns', () => {
    const battle = hot([unit({ id: 'hero' }), bystander(7)], ['..s.....'], 0);
    expect(battle.ignite(1, 0)).toBe(true);
    expect(battle.ignite(2, 0)).toBe(true);
    expect(battle.flames.get(tileKey(1, 0))).toBe(2);
    expect(battle.flames.get(tileKey(2, 0))).toBe(3);
  });

  it('does not take on water or on a wall', () => {
    const battle = hot([unit({ id: 'hero' })], ['.~W.'], 0);
    expect(battle.ignite(1, 0)).toBe(false);
    expect(battle.ignite(2, 0)).toBe(false);
    expect(battle.ignite(9, 9)).toBe(false);
    expect(battle.flames.size).toBe(0);
  });

  it('lighting a burning tile again keeps the longer burn', () => {
    const battle = hot([unit({ id: 'hero' })], ['.s..'], 0);
    battle.ignite(1, 0);
    battle.flames.set(tileKey(1, 0), 1);
    battle.ignite(1, 0);
    expect(battle.flames.get(tileKey(1, 0))).toBe(3);
  });

  it('burns down once a turn: two turns on bare ground, three on dry grass', () => {
    const battle = hot([unit({ id: 'hero' }), bystander(7)], ['..s.....'], 0);
    battle.ignite(1, 0);
    battle.ignite(2, 0);
    const turnEnds = (): void => {
      battle.endPhase(); // the player's phase ends
      battle.endPhase(); // the enemy's phase ends, and the turn with it
    };
    turnEnds();
    expect(battle.turn).toBe(2);
    expect(lit(battle)).toEqual(['1,0', '2,0']);
    turnEnds();
    expect(lit(battle)).toEqual(['2,0']);
    turnEnds();
    expect(lit(battle)).toEqual([]);
  });
});

describe('standing in flames', () => {
  it('flames cannot be entered, but a unit in them may walk out', () => {
    const hero = unit({ id: 'hero', x: 0 });
    const battle = hot([hero], ['.....'], 0);
    battle.ignite(2, 0);
    const reach = battle.reachFor(hero).stops.map((p) => p.x).sort();
    expect(reach).toEqual([0, 1]);
    hero.x = 2;
    // it may stay, and leave either way; the flames only bar those who would step in
    expect(battle.reachFor(hero).stops.map((p) => p.x).sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('hurts a unit for 4 at the end of its own phase, and marks it burning', () => {
    const hero = unit({ id: 'hero', x: 1 });
    const battle = hot([hero, bystander(7)], ['........'], 0);
    battle.ignite(1, 0);
    const report = battle.endPhase();
    expect(hero.hp).toBe(14);
    expect(report.burned).toEqual([{ unit: hero, damage: 4 }]);
    expect(hero.statuses.map((s) => s.id)).toContain('burn');
  });

  it('spares a unit that stepped out, and hurts the enemy only when the enemy’s phase ends', () => {
    const hero = unit({ id: 'hero', x: 1 });
    const foe = unit({ id: 'foe', side: 'enemy', x: 2 });
    const battle = hot([hero, foe], ['........'], 0);
    battle.ignite(1, 0);
    battle.ignite(2, 0);
    hero.x = 0;
    battle.endPhase();
    expect(hero.hp).toBe(18);
    expect(foe.hp).toBe(18); // it is the enemy's phase now; the flames wait for its end
    const report = battle.endPhase();
    expect(foe.hp).toBe(14);
    expect(report.burned.map((b) => b.unit.id)).toEqual(['foe']);
  });

  it('can bring a unit down: it retreats wounded', () => {
    const hero = unit({ id: 'hero', x: 1 });
    hero.hp = 3;
    const battle = hot([hero, bystander(7)], ['........'], 0);
    battle.ignite(1, 0);
    const report = battle.endPhase();
    expect(report.burned).toEqual([{ unit: hero, damage: 3 }]);
    expect(hero.retreated).toBe(true);
  });

  it('does more to wood: a barricade takes 8 and a mangonel too, until they fall', () => {
    const hero = unit({ id: 'hero', x: 0 });
    const battle = hot([hero, bystander(1)], ['.....'], 0);
    const barricade = battle.placeStructure('barricade', { x: 3, y: 0 }, 'enemy');
    const gate = battle.placeStructure('gate', { x: 4, y: 0 }, 'enemy');
    battle.ignite(3, 0);
    battle.ignite(4, 0);
    battle.endPhase(); // the player's phase: nothing of the player's is in flames
    expect(barricade.hp).toBe(12);
    const report = battle.endPhase(); // the enemy's phase ends
    expect(barricade.hp).toBe(12 - 8);
    expect(gate.hp).toBe(24 - 4); // stone and iron burn no worse than flesh
    expect(report.burned.map((b) => b.damage).sort()).toEqual([4, 8]);
    expect(barricade.statuses).toEqual([]); // a barricade has no wounds to speak of
    battle.endPhase();
    battle.endPhase();
    expect(barricade.retreated).toBe(true);
  });

  it('a side with nothing that can act has no phase, but its structures still burn when it would have ended', () => {
    const hero = unit({ id: 'hero', x: 0 });
    const battle = hot([hero], ['.....'], 0);
    const barricade = battle.placeStructure('barricade', { x: 3, y: 0 }, 'enemy');
    battle.ignite(3, 0);
    const report = battle.endPhase();
    expect(battle.phase).toBe('player');
    expect(battle.turn).toBe(2);
    expect(barricade.hp).toBe(4);
    expect(report.burned).toEqual([{ unit: barricade, damage: 8 }]);
  });
});

describe('spreading', () => {
  it('lights the dry grass beside it at the start of each phase, never bare ground', () => {
    const battle = hot([unit({ id: 'hero' }), bystander(8)], ['.ssss....'], 1);
    battle.ignite(1, 0);
    expect(lit(battle)).toEqual(['1,0']);
    battle.endPhase();
    expect(lit(battle)).toEqual(['1,0', '2,0']); // the tile on the left is bare and stays dark
    battle.endPhase();
    expect(lit(battle)).toEqual(['1,0', '2,0', '3,0']);
  });

  it('does not spread across a gap, or at all when the chance is nil', () => {
    const gap = hot([unit({ id: 'hero' }), bystander(8)], ['sss.sss..'], 1);
    gap.ignite(0, 0);
    for (let i = 0; i < 4; i++) gap.endPhase();
    expect(lit(gap).every((k) => Number(k.split(',')[0]) <= 3)).toBe(true);
    const none = hot([unit({ id: 'hero' }), bystander(8)], ['ssssss...'], 0);
    none.ignite(0, 0);
    none.endPhase();
    expect(lit(none)).toEqual(['0,0']);
  });

  it('a new fire does not spread until the next phase', () => {
    const battle = hot([unit({ id: 'hero' }), bystander(8)], ['.sssss...'], 1);
    battle.ignite(1, 0);
    battle.endPhase();
    expect(lit(battle)).toEqual(['1,0', '2,0']);
  });

  it('draws once for each dry, unlit neighbour, in a fixed order', () => {
    const draws: number[] = [];
    const rng: Rng = { next: () => (draws.push(0), 0.99), int: () => 0, state: () => 0, restore: () => undefined };
    const battle = hot([unit({ id: 'hero' }), bystander(2, 2)], ['.s.', 'sss', '.s.'], 0.4, rng);
    battle.ignite(1, 1);
    battle.endPhase();
    expect(draws).toHaveLength(4); // north, east, south and west of the centre are all dry
    expect(lit(battle)).toEqual(['1,1']);
  });

  it('the wind carries fire downwind by half again: only that way at these odds', () => {
    // 0.5 beats the downwind chance of 0.6 (0.4 raised by half) but not the plain 0.4
    const steady: Rng = { next: () => 0.5, int: () => 0, state: () => 0, restore: () => undefined };
    const rows = ['sss', 'sss', 'sss'];
    const east = hot([unit({ id: 'hero' }), bystander(2, 2)], rows, 0.4, steady, { wind: 'E' });
    east.ignite(1, 1);
    east.endPhase();
    expect(lit(east)).toEqual(['1,1', '2,1']);
    const south = hot([unit({ id: 'hero' }), bystander(2, 2)], rows, 0.4, steady, { wind: 'S' });
    south.ignite(1, 1);
    south.endPhase();
    expect(lit(south)).toEqual(['1,1', '1,2']);
    const calm = hot([unit({ id: 'hero' }), bystander(2, 2)], rows, 0.4, steady);
    calm.ignite(1, 1);
    calm.endPhase();
    expect(lit(calm)).toEqual(['1,1']);
  });

  it('the stream of draws is the same for the same seed', () => {
    const run = (): string[] => {
      const battle = hot([unit({ id: 'hero' }), bystander(6, 2)], ['sssssss', 'sssssss', 'sssssss'], 0.4, createRng(42));
      battle.ignite(3, 1);
      for (let i = 0; i < 6; i++) battle.endPhase();
      return lit(battle);
    };
    expect(run()).toEqual(run());
  });
});

describe('fire in a fight', () => {
  const thrower = (skills: string[], x = 0) => {
    const u = unit({ id: 'thrower', class: 'fire-thrower', inventory: ['naphtha-pot'], x });
    u.skills = skills;
    return u;
  };
  const foe = (x: number, extra = {}) => unit({ id: `foe${x}`, side: 'enemy', x, ...extra });
  // a hit roll of 0, then a crit roll that does not crit
  const hits = () => scripted(0, 99);

  it('a pot that hits leaves flames on the target’s tile, whoever throws it', () => {
    const a = thrower([]);
    const b = foe(2);
    const battle = hot([a, b], ['.......'], 0, hits());
    const fight = battle.fight(a, b);
    expect(fight.events[0]).toMatchObject({ hit: true });
    expect(lit(battle)).toEqual(['2,0']);
    expect(fight.ignited).toEqual([{ x: 2, y: 0 }]);
  });

  it('a pot that misses leaves nothing', () => {
    const a = thrower(['ignite']);
    const b = foe(2);
    const battle = hot([a, b], ['.......'], 0, scripted(99));
    const fight = battle.fight(a, b);
    expect(fight.events[0]).toMatchObject({ hit: false });
    expect(lit(battle)).toEqual([]);
    expect(fight.ignited).toEqual([]);
  });

  it('burns the ground even when the hit brings the target down', () => {
    const a = thrower([]);
    const b = foe(2);
    b.hp = 1;
    const battle = hot([a, b], ['.......'], 0, hits());
    const fight = battle.fight(a, b);
    expect(fight.defeated).toEqual([b]);
    expect(lit(battle)).toEqual(['2,0']);
  });

  it('a blade leaves no flames', () => {
    const a = unit({ id: 'a', x: 0 });
    a.skills = ['ignite'];
    const b = foe(1);
    const battle = hot([a, b], ['.......'], 0, scripted(0, 99, 0, 99));
    battle.fight(a, b);
    expect(lit(battle)).toEqual([]);
  });

  it('Wildfire lights one dry tile beside the target too, first to the north, east, south, west', () => {
    const a = thrower(['wildfire']);
    const b = foe(2, { y: 1 });
    const battle = hot([a, b], ['.......', '..s.s..', '.......'], 0, hits());
    a.x = 0;
    a.y = 1;
    battle.fight(a, b);
    // the target's own tile burns, and no dry tile lies beside it, so Wildfire has nothing more to light
    expect(lit(battle)).toEqual(['2,1']);
    const c = thrower(['wildfire']);
    const d = foe(2, { y: 1 });
    const second = hot([c, d], ['..s....', '.......', '.......'], 0, hits());
    c.x = 0;
    c.y = 1;
    second.fight(c, d);
    expect(lit(second)).toEqual(['2,0', '2,1']);
  });

  it('Wildfire alone lights the target tile, as Ignite would, and a tile already burning is lit afresh', () => {
    const a = thrower(['wildfire']);
    const b = foe(2);
    const battle = hot([a, b], ['..s....'], 0, scripted(0, 99));
    battle.ignite(2, 0);
    battle.flames.set(tileKey(2, 0), 1);
    battle.fight(a, b);
    expect(battle.flames.get(tileKey(2, 0))).toBe(3);
  });

  it('Fire Storm strikes the neighbour who would take most, for half, and gives no EXP', () => {
    const a = thrower(['ignite', 'fire-storm'], 0);
    const target = foe(2);
    const weak = unit({ id: 'weak', side: 'enemy', x: 3 });
    const warded = unit({ id: 'warded', side: 'enemy', x: 2, y: 1, offset: { nrv: 4 } });
    const battle = hot([a, target, weak, warded], ['.......', '.......'], 0, hits());
    const fight = battle.fight(a, target);
    // Skill 6 + Might 6 = 12 against Nerve 0, half is 6; against Nerve 4 it would be 4
    expect(fight.splash).toEqual([{ target: weak, damage: 6 }]);
    expect(weak.hp).toBe(12);
    expect(warded.hp).toBe(18);
    expect(fight.expAwards.map((e) => e.unit.id)).toEqual(['thrower']);
  });

  it('Fire Storm spares your own side, and does nothing when the pot misses or no one stands beside the target', () => {
    const a = thrower(['fire-storm'], 0);
    const target = foe(2);
    const friend = unit({ id: 'friend', side: 'player', x: 3 });
    const battle = hot([a, target, friend], ['.......'], 0, hits());
    expect(battle.fight(a, target).splash).toEqual([]);
    expect(friend.hp).toBe(18);
    const b = thrower(['fire-storm'], 0);
    const t2 = foe(2);
    const other = foe(3);
    const missed = hot([b, t2, other], ['.......'], 0, scripted(99));
    expect(missed.fight(b, t2).splash).toEqual([]);
  });

  it('Fire Storm can bring the neighbour down', () => {
    const a = thrower(['fire-storm'], 0);
    const target = foe(2);
    const weak = foe(3);
    weak.hp = 5;
    const battle = hot([a, target, weak], ['.......'], 0, hits());
    const fight = battle.fight(a, target);
    expect(weak.retreated).toBe(true);
    expect(fight.defeated).toContain(weak);
  });

  it('a defender who fights back with fire sets the attacker’s tile alight', () => {
    const attacker = unit({ id: 'att', side: 'enemy', class: 'archer', inventory: ['short-bow'], x: 0 });
    const defender = thrower([], 2);
    const battle = hot([attacker, defender], ['.......'], 0, scripted(0, 99, 0, 99, 0, 99));
    battle.fight(attacker, defender);
    expect(lit(battle)).toContain('0,0');
  });
});

describe('events that light fires', () => {
  it('an event lights a tile, and reports one that will not take', () => {
    const battle = hot([unit({ id: 'hero' })], ['..s...~'], 0, createRng(1), {
      events: [
        { id: 'brush', when: { type: 'turnStart', turn: 1 }, then: [{ type: 'ignite', tile: [2, 0] }] },
        { id: 'river', when: { type: 'turnStart', turn: 1 }, then: [{ type: 'ignite', tile: [6, 0] }] },
      ],
    });
    battle.begin();
    expect(lit(battle)).toEqual(['2,0']);
    expect(battle.unhandled).toEqual([{ type: 'ignite', tile: [6, 0] }]);
  });
});
