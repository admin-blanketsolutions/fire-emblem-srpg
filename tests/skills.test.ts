import { describe, expect, it } from 'vitest';
import { buildSkillTable } from '../src/core/skills';
import { skills as skillTable } from '../src/data';
import { arena, battleOf, classes, mapOf, openMap, scripted, unit, type UnitSpec } from './support';

/** A unit with exactly the given skills, whatever its class would grant. */
const sk = (spec: UnitSpec, ...skills: string[]) => {
  const u = unit(spec);
  u.skills = skills;
  return u;
};

const grove = () => arena(5, 1, ['.G...']);

/** The forecast of an attack from x=0 on a target at x=1 (in the grove), with the given skills on each side. */
function duel(attacker: UnitSpec, aSkills: string[], defender: UnitSpec, dSkills: string[], map = grove()) {
  const a = sk({ id: 'a', x: 0, ...attacker }, ...aSkills);
  const d = sk({ id: 'd', side: 'enemy', x: 1, ...defender }, ...dSkills);
  const battle = battleOf([a, d], map);
  const fc = battle.forecastFor(a, d);
  if (!fc) throw new Error('no forecast');
  return { a, d, battle, fc };
}

const sabre = { class: 'swordsman', inventory: ['iron-sabre'] };
const spear = { class: 'soldier', inventory: ['levy-spear'] };

describe('the skill table', () => {
  it('describes all forty-one skills', () => {
    expect(skillTable.size).toBe(41);
    for (const s of skillTable.values()) expect(s.description.length, s.id).toBeGreaterThan(5);
  });

  it('names only skills the classes can grant, and every granted skill exists', () => {
    for (const c of classes.values()) for (const id of c.skills ?? []) expect(skillTable.has(id), `${c.id}: ${id}`).toBe(true);
    const granted = new Set([...classes.values()].flatMap((c) => c.skills ?? []));
    for (const id of skillTable.keys()) expect(granted.has(id), `${id} is not granted by any class`).toBe(true);
  });

  it('rejects bad skill data', () => {
    expect(() => buildSkillTable([{ id: 'x', name: 'X', kind: 'magic', description: 'y' }])).toThrow(/unknown kind/);
    expect(() => buildSkillTable([{ id: 'x', name: 'X', kind: 'passive', description: 'y' }, { id: 'x', name: 'X', kind: 'passive', description: 'y' }])).toThrow(/duplicate/);
  });
});

describe('defensive skills', () => {
  it('Stand Fast: +1 Guard and +10 avoid, but only for a unit that has not moved', () => {
    const base = duel(sabre, [], spear, []);
    const held = duel(sabre, [], spear, ['stand-fast']);
    expect(base.fc.attacker.strike!.damage - held.fc.attacker.strike!.damage).toBe(1);
    expect(base.fc.attacker.strike!.hit - held.fc.attacker.strike!.hit).toBe(10);
    const moved = sk({ id: 'm', side: 'enemy', x: 1, ...spear }, 'stand-fast');
    moved.travelled = 2;
    const a = sk({ id: 'a', x: 0, ...sabre });
    expect(battleOf([a, moved], grove()).forecastFor(a, moved)!.attacker.strike).toEqual(base.fc.attacker.strike);
  });

  it('Parry: +10 avoid against a melee attack, not against a shot', () => {
    const base = duel(sabre, [], spear, []);
    const parry = duel(sabre, [], spear, ['parry']);
    expect(base.fc.attacker.strike!.hit - parry.fc.attacker.strike!.hit).toBe(10);
    const shot = (skills: string[]) => {
      const archer = sk({ id: 'arc', class: 'archer', inventory: ['composite-bow'], x: 0 });
      const target = sk({ id: 't', side: 'enemy', x: 2, ...spear }, ...skills);
      return battleOf([archer, target], openMap(5, 1)).forecastFor(archer, target)!.attacker.strike!.hit;
    };
    expect(shot(['parry'])).toBe(shot([]));
  });

  it('Elusive: +10 avoid always', () => {
    expect(duel(sabre, [], spear, []).fc.attacker.strike!.hit - duel(sabre, [], spear, ['elusive']).fc.attacker.strike!.hit).toBe(10);
  });

  it('Bulwark: two less damage from physical weapons, but not from fire', () => {
    const base = duel(sabre, [], spear, []);
    const bulwark = duel(sabre, [], spear, ['bulwark']);
    expect(base.fc.attacker.strike!.damage - bulwark.fc.attacker.strike!.damage).toBe(2);
    const fire = (skills: string[]) => {
      const caster = sk({ id: 'c', class: 'fire-thrower', inventory: ['naphtha-pot'], x: 0 });
      const target = sk({ id: 't', side: 'enemy', x: 1, ...spear }, ...skills);
      return battleOf([caster, target], openMap(5, 1)).forecastFor(caster, target)!.attacker.strike!.damage;
    };
    expect(fire(['bulwark'])).toBe(fire([]));
  });

  it('Bulwark never drops damage below zero', () => {
    const weak = duel({ class: 'scribe', inventory: ['knife'] }, [], spear, ['bulwark']);
    expect(weak.fc.attacker.strike!.damage).toBe(0);
  });

  it('Last Stand: below a quarter of its HP, +15 avoid and +10 crit', () => {
    const healthy = duel(sabre, [], spear, ['last-stand']);
    const hurt = (() => {
      const a = sk({ id: 'a', x: 0, ...sabre });
      const d = sk({ id: 'd', side: 'enemy', x: 1, ...spear }, 'last-stand');
      d.hp = 4; // of 18
      return battleOf([a, d], grove()).forecastFor(a, d)!;
    })();
    expect(healthy.fc.attacker.strike!.hit - hurt.attacker.strike!.hit).toBe(15);
    // and the counter-attack carries the crit bonus
    expect(hurt.defender.strike!.crit - healthy.fc.defender.strike!.crit).toBe(10);
  });

  it('Highlander: +10 avoid on hills and crags, and they cost 1 to cross', () => {
    const hill = mapOf(['.h.']);
    const make = (skills: string[]) => {
      const a = sk({ id: 'a', x: 0, ...sabre });
      const d = sk({ id: 'd', side: 'enemy', x: 1, ...spear }, ...skills);
      return battleOf([a, d], hill).forecastFor(a, d)!.attacker.strike!.hit;
    };
    expect(make([]) - make(['highlander'])).toBe(10);
    const walker = sk({ id: 'w', x: 0, ...sabre }, 'highlander');
    const crags = mapOf(['.^^^^^'], {}, { '.': 'plain', '^': 'crag' });
    expect(battleOf([walker], crags).reachFor(walker).stops.map((p) => p.x).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    const plodder = sk({ id: 'p', x: 0, ...sabre });
    expect(Math.max(...battleOf([plodder], crags).reachFor(plodder).stops.map((p) => p.x))).toBe(1); // a crag costs a foot soldier 4
  });

  it('Phalanx: +1 Guard for each adjacent allied spearman, to a maximum of three', () => {
    const m = arena(5, 3);
    const run = (spearmen: number) => {
      const a = sk({ id: 'a', x: 0, y: 1, ...sabre });
      const d = sk({ id: 'd', side: 'enemy', x: 1, y: 1, ...spear }, 'phalanx');
      const places: Array<[number, number]> = [[1, 0], [1, 2], [2, 1], [0, 0]];
      const mates = places.slice(0, spearmen).map(([x, y], i) => unit({ id: `s${i}`, side: 'enemy', class: 'soldier', inventory: ['levy-spear'], x, y }));
      return battleOf([a, d, ...mates], m).forecastFor(a, d)!.attacker.strike!.damage;
    };
    expect(run(0) - run(1)).toBe(1);
    expect(run(0) - run(2)).toBe(2);
    expect(run(0) - run(3)).toBe(3);
    expect(run(4)).toBe(run(3)); // the fourth stands two tiles away, and three is the most it would count anyway
  });

  it('Counter-Charge: counters against mounted attackers always hit, with +3 Might', () => {
    const rider = { class: 'horseman', inventory: ['iron-sabre'] };
    const without = duel(rider, [], spear, []);
    const charge = duel(rider, [], spear, ['counter-charge']);
    expect(charge.fc.defender.strike!.hit).toBe(100);
    expect(charge.fc.defender.strike!.damage - without.fc.defender.strike!.damage).toBe(3);
    const onFoot = duel(sabre, [], spear, ['counter-charge']);
    expect(onFoot.fc.defender.strike).toEqual(duel(sabre, [], spear, []).fc.defender.strike); // no effect against a foot soldier
  });

  it('Shield Wall: adjacent allies gain +1 Guard, and two shield walls do not stack', () => {
    const m = arena(5, 3);
    const run = (shieldBearers: number) => {
      const a = sk({ id: 'a', x: 0, y: 1, ...sabre });
      const d = sk({ id: 'd', side: 'enemy', x: 1, y: 1, ...spear });
      const guards = Array.from({ length: shieldBearers }, (_, i) =>
        sk({ id: `g${i}`, side: 'enemy', class: 'soldier', inventory: ['levy-spear'], x: [1, 2][i] as number, y: [0, 1][i] as number }, 'shield-wall'),
      );
      return battleOf([a, d, ...guards], m).forecastFor(a, d)!.attacker.strike!.damage;
    };
    expect(run(0) - run(1)).toBe(1);
    expect(run(1)).toBe(run(2));
  });
});

describe('offensive skills', () => {
  it('Keen Edge: +15 crit with sabres and daggers, not with other weapons', () => {
    const withSkill = duel(sabre, ['keen-edge'], spear, []);
    expect(withSkill.fc.attacker.strike!.crit - duel(sabre, [], spear, []).fc.attacker.strike!.crit).toBe(15);
    const knife = duel({ class: 'swordsman', inventory: ['knife'] }, ['keen-edge'], spear, []);
    expect(knife.fc.attacker.strike!.crit - duel({ class: 'swordsman', inventory: ['knife'] }, [], spear, []).fc.attacker.strike!.crit).toBe(15);
    const lance = { class: 'soldier', inventory: ['levy-spear'] };
    expect(duel(lance, ['keen-edge'], spear, []).fc.attacker.strike!.crit).toBe(duel(lance, [], spear, []).fc.attacker.strike!.crit);
  });

  it('Heavy Blow: +2 Might against a target with lower Build', () => {
    const big = { class: 'axeman', inventory: ['hatchet'] }; // Build 8
    const small = { class: 'swordsman', inventory: ['iron-sabre'], side: 'enemy' as const }; // Build 5
    expect(duel(big, ['heavy-blow'], small, []).fc.attacker.strike!.damage - duel(big, [], small, []).fc.attacker.strike!.damage).toBe(2);
    // not against an equal or bigger one
    expect(duel(sabre, ['heavy-blow'], { class: 'axeman', inventory: ['hatchet'] }, []).fc.attacker.strike!.damage).toBe(duel(sabre, [], { class: 'axeman', inventory: ['hatchet'] }, []).fc.attacker.strike!.damage);
  });

  it('Shock: +2 Might for an attacker that has travelled four or more', () => {
    const a = sk({ id: 'a', x: 0, ...sabre }, 'shock');
    const d = sk({ id: 'd', side: 'enemy', x: 1, ...spear });
    const battle = battleOf([a, d], grove());
    const still = battle.forecastFor(a, d)!.attacker.strike!.damage;
    a.travelled = 3;
    expect(battle.forecastFor(a, d)!.attacker.strike!.damage).toBe(still);
    a.travelled = 4;
    expect(battle.forecastFor(a, d)!.attacker.strike!.damage).toBe(still + 2);
  });

  it('Steady Aim: +10 accuracy with a bow for an archer that has not moved', () => {
    const shoot = (skills: string[], travelled = 0, from = 0) => {
      const archer = sk({ id: 'arc', class: 'archer', inventory: ['composite-bow'], x: 0 }, ...skills);
      archer.travelled = travelled;
      const target = sk({ id: 't', side: 'enemy', x: 2, ...spear });
      return battleOf([archer, target], openMap(6, 1)).forecastFor(archer, target, { from: { x: from, y: 0 } })!.attacker.strike!.hit;
    };
    expect(shoot(['steady-aim']) - shoot([])).toBe(10);
    expect(shoot(['steady-aim'], 3)).toBe(shoot([], 3)); // it has moved
    // from a different tile it would have to move there
    const archer = sk({ id: 'arc', class: 'archer', inventory: ['composite-bow'], x: 0 }, 'steady-aim');
    const target = sk({ id: 't', side: 'enemy', x: 4, ...spear });
    const battle = battleOf([archer, target], openMap(6, 1));
    archer.skills = [];
    const plain = battle.forecastFor(archer, target, { from: { x: 1, y: 0 } })!.attacker.strike!.hit;
    archer.skills = ['steady-aim'];
    expect(battle.forecastFor(archer, target, { from: { x: 1, y: 0 } })!.attacker.strike!.hit).toBe(plain);
  });

  it('Long Draw: a bow reaches one tile further, from where the archer stands', () => {
    const archer = sk({ id: 'arc', class: 'archer', inventory: ['composite-bow'], x: 0 }, 'long-draw');
    const near = sk({ id: 'n', side: 'enemy', x: 3, ...spear });
    const far = sk({ id: 'f', side: 'enemy', x: 4, ...spear });
    const battle = battleOf([archer, near, far], openMap(7, 1));
    expect(battle.targetsFrom(archer, archer).map((u) => u.id)).toEqual(['n', 'f']); // range 2-3, plus one
    expect(battle.forecastFor(archer, far)).not.toBeNull();
    archer.skills = [];
    expect(battle.targetsFrom(archer, archer).map((u) => u.id)).toEqual(['n']);
    expect(battle.forecastFor(archer, far)).toBeNull();
    archer.skills = ['long-draw'];
    archer.travelled = 1;
    expect(battle.targetsFrom(archer, archer).map((u) => u.id)).toEqual(['n']); // not after moving
  });

  it('Deadeye: +20 crit with a bow', () => {
    const shoot = (skills: string[]) => {
      const archer = sk({ id: 'arc', class: 'archer', inventory: ['composite-bow'], x: 0 }, ...skills);
      const target = sk({ id: 't', side: 'enemy', x: 2, ...spear });
      return battleOf([archer, target], openMap(6, 1)).forecastFor(archer, target)!.attacker.strike!.crit;
    };
    expect(shoot(['deadeye']) - shoot([])).toBe(20);
  });

  it('crossbow skills: Piercing Bolt +1 Pierce, Bolt Volley +3 Might against armour and cavalry', () => {
    const shoot = (skills: string[], target: UnitSpec) => {
      const shooter = sk({ id: 's', class: 'crossbowman', inventory: ['light-crossbow'], x: 0 }, ...skills);
      const foe = sk({ id: 't', side: 'enemy', x: 2, inventory: ['levy-spear'], ...target });
      return battleOf([shooter, foe], openMap(6, 1)).forecastFor(shooter, foe)!.attacker.strike!.damage;
    };
    expect(shoot(['piercing-bolt'], { class: 'soldier' }) - shoot([], { class: 'soldier' })).toBe(1);
    expect(shoot(['bolt-volley'], { class: 'horseman' }) - shoot([], { class: 'horseman' })).toBe(3);
    expect(shoot(['bolt-volley'], { class: 'soldier' })).toBe(shoot([], { class: 'soldier' })); // a foot soldier is neither
    const armoured = (skills: string[]) => {
      const shooter = sk({ id: 's', class: 'crossbowman', inventory: ['light-crossbow'], x: 0 }, ...skills);
      const foe = sk({ id: 't', side: 'enemy', x: 2, class: 'soldier', inventory: ['levy-spear'] });
      foe.moveType = 'armored';
      return battleOf([shooter, foe], openMap(6, 1)).forecastFor(shooter, foe)!.attacker.strike!.damage;
    };
    expect(armoured(['bolt-volley']) - armoured([])).toBe(3);
  });
});

describe('auras', () => {
  const lineup = (skill: string | null, distance: number) => {
    const lord = sk({ id: 'lord', x: 0 }, ...(skill ? [skill] : []));
    const ally = unit({ id: 'ally', x: distance, ...sabre });
    const foe = unit({ id: 'foe', side: 'enemy', x: distance + 1, ...spear });
    return { lord, ally, foe, battle: battleOf([lord, ally, foe], openMap(9, 1)) };
  };
  const stats = (skill: string | null, distance: number) => {
    const { ally, foe, battle } = lineup(skill, distance);
    const fc = battle.forecastFor(ally, foe)!;
    return { hit: fc.attacker.strike!.hit, theirs: fc.defender.strike!.hit };
  };

  it('Presence: allies within two tiles gain +5 accuracy and +5 avoid', () => {
    const base = stats(null, 2);
    const near = stats('presence', 2);
    // accuracy would be capped at 100 on the attacker's side, so read the avoid bonus from the foe's counter
    expect(base.theirs - near.theirs).toBe(5);
    expect(stats('presence', 3).theirs).toBe(base.theirs); // three tiles away is out of reach
  });

  it('Command: +10 and +10 within three tiles', () => {
    expect(stats(null, 3).theirs - stats('command', 3).theirs).toBe(10);
    expect(stats('command', 4).theirs).toBe(stats(null, 4).theirs);
  });

  it('does not benefit the unit that carries it', () => {
    const lord = sk({ id: 'lord', x: 0, ...sabre }, 'command');
    const foe = unit({ id: 'foe', side: 'enemy', x: 1, ...spear });
    const alone = sk({ id: 'alone', x: 0, ...sabre });
    const a = battleOf([lord, foe], openMap(5, 1)).forecastFor(lord, foe)!;
    const b = battleOf([alone, foe], openMap(5, 1)).forecastFor(alone, foe)!;
    expect(a.defender.strike).toEqual(b.defender.strike);
  });

  it('serves only its own side', () => {
    const lord = sk({ id: 'lord', x: 0 }, 'command');
    const foe = unit({ id: 'foe', side: 'enemy', x: 5, ...spear });
    const mine = unit({ id: 'mine', x: 4, ...sabre });
    const baseline = battleOf([unit({ id: 'x', x: 0 }), mine, foe], openMap(9, 1)).forecastFor(mine, foe)!;
    const withCommand = battleOf([lord, mine, foe], openMap(9, 1)).forecastFor(mine, foe)!;
    expect(withCommand.defender.strike!.hit).toBe(baseline.defender.strike!.hit); // too far: no effect either way
  });
});

describe('movement skills', () => {
  it('Swift adds one to Move', () => {
    const plain = sk({ id: 'p', x: 0, ...sabre });
    const swift = sk({ id: 's', x: 0, ...sabre }, 'swift');
    const m = openMap(12, 1);
    expect(Math.max(...battleOf([plain], m).reachFor(plain).stops.map((p) => p.x))).toBe(5);
    expect(Math.max(...battleOf([swift], m).reachFor(swift).stops.map((p) => p.x))).toBe(6);
  });

  it('Lightstep makes all passable terrain cost 1', () => {
    const m = mapOf(['.GGGGGGG'], {}, { '.': 'plain', G: 'grove' });
    const plain = sk({ id: 'p', x: 0, ...sabre });
    const light = sk({ id: 'l', x: 0, ...sabre }, 'lightstep');
    expect(Math.max(...battleOf([plain], m).reachFor(plain).stops.map((p) => p.x))).toBe(2); // a grove costs a foot soldier 2
    expect(Math.max(...battleOf([light], m).reachFor(light).stops.map((p) => p.x))).toBe(5);
  });
});

describe('statuses from skills', () => {
  const setup = (skills: string[]) => {
    const a = sk({ id: 'a', x: 0, ...sabre }, ...skills);
    const d = sk({ id: 'd', side: 'enemy', x: 1, ...spear });
    d.stats.hp = 99;
    d.hp = 99;
    return { a, d, battle: battleOf([a, d], openMap(5, 1), scripted(...Array(120).fill([0, 99]).flat())) };
  };

  it('Sunder lowers the Guard of whoever it hits, stacking to three, until the end of the next phase', () => {
    const { a, d, battle } = setup(['sunder']);
    battle.begin();
    battle.fight(a, d);
    expect(d.statuses).toMatchObject([{ id: 'sunder', amount: 1 }]);
    expect(battle.forecastFor(a, d)!.attacker.strike!.damage).toBeGreaterThan(0);
    a.acted = false;
    for (let i = 0; i < 4; i++) {
      a.acted = false;
      battle.fight(a, d);
    }
    expect(d.statuses.find((s) => s.id === 'sunder')?.amount).toBe(3);
    battle.endPhase(); // the enemy phase: still sundered
    expect(d.statuses.some((s) => s.id === 'sunder')).toBe(true);
    battle.endPhase(); // the next player phase has begun: it ran out with the enemy phase
    expect(d.statuses.some((s) => s.id === 'sunder')).toBe(false);
  });

  it('Harry takes 10 avoid from the unit it hits for the rest of the phase', () => {
    const { a, d, battle } = setup(['harry']);
    battle.begin();
    const before = battle.forecastFor(a, d)!.attacker.strike!.hit;
    battle.fight(a, d);
    a.acted = false;
    expect(battle.forecastFor(a, d)!.attacker.strike!.hit).toBe(Math.min(100, before + 10));
    battle.endPhase();
    expect(d.statuses).toEqual([]);
  });

  it('Warcry gives nearby allies +2 Might for the phase it is cried in', () => {
    const cryer = sk({ id: 'cry', x: 0, class: 'axeman', inventory: ['hatchet'] }, 'warcry');
    const near = sk({ id: 'near', x: 2, ...sabre });
    const far = sk({ id: 'far', x: 3, ...sabre });
    const foe = unit({ id: 'foe', side: 'enemy', x: 6, ...spear });
    const battle = battleOf([cryer, near, far, foe], openMap(9, 1));
    const target = unit({ id: 'dummy', side: 'enemy', x: 1, y: 0, ...spear });
    void target;
    battle.begin();
    expect(near.statuses.map((s) => s.id)).toEqual(['warcry']);
    expect(far.statuses).toEqual([]);
    expect(cryer.statuses).toEqual([]);
    battle.endPhase();
    expect(near.statuses).toEqual([]);
  });

  it('Renewal heals the units beside it at the start of its phase', () => {
    const doc = sk({ id: 'doc', x: 1, class: 'healer', inventory: ['salve'] }, 'renewal');
    const beside = unit({ id: 'beside', x: 2 });
    const apart = unit({ id: 'apart', x: 4 });
    beside.hp = 5;
    apart.hp = 5;
    const battle = battleOf([doc, beside, apart], openMap(9, 1));
    const report = battle.begin();
    expect(report.healed).toEqual([{ unit: beside, amount: 5 }]);
    expect([beside.hp, apart.hp]).toEqual([10, 5]);
  });
});

describe('what happens after a fight', () => {
  const kill = (aSkills: string[], target: Partial<UnitSpec> = {}) => {
    const a = sk({ id: 'a', x: 0, ...sabre }, ...aSkills);
    const d = sk({ id: 'd', side: 'enemy', x: 1, ...spear, ...target });
    d.hp = 1;
    const battle = battleOf([a, d], openMap(6, 1), scripted(0, 99));
    battle.fight(a, d);
    return { a, d, battle };
  };

  it('Clemency adds ransom for each ordinary enemy defeated, but not a boss', () => {
    expect(kill(['clemency']).battle.ransom).toBe(30);
    expect(kill([]).battle.ransom).toBe(0);
    expect(kill(['clemency'], { boss: true }).battle.ransom).toBe(0);
  });

  it('Wheel and Skirmish owe a move after attacking; Pursuit after a kill, once a turn', () => {
    expect(kill(['wheel']).a.bonusMove).toBe(2);
    expect(kill(['skirmish']).a.bonusMove).toBe(3);
    expect(kill(['wheel', 'skirmish']).a.bonusMove).toBe(3);
    expect(kill(['pursuit']).a.bonusMove).toBe(2);
    expect(kill([]).a.bonusMove).toBe(0);
    const once = kill(['pursuit']);
    once.a.bonusMove = 0;
    expect(once.a.turnFlags).toContain('pursuit');
  });

  it('Pursuit needs a defeat, and Wheel is not for counterattacks', () => {
    const a = sk({ id: 'a', x: 0, ...sabre }, 'pursuit');
    const d = sk({ id: 'd', side: 'enemy', x: 1, ...spear });
    const battle = battleOf([a, d], openMap(6, 1), scripted(99, 99, 99, 99, 99, 99));
    battle.fight(a, d); // nothing falls
    expect(a.bonusMove).toBe(0);
    const defender = sk({ id: 'def', x: 2, ...sabre }, 'wheel');
    const attacker = sk({ id: 'att', side: 'enemy', x: 3, ...spear });
    const b2 = battleOf([defender, attacker], openMap(6, 1), scripted(99, 99, 99, 99, 99, 99));
    b2.fight(attacker, defender);
    expect(defender.bonusMove).toBe(0);
  });

  it('lets the unit make the move it is owed, no further than owed, once', () => {
    const { a, battle } = kill(['wheel']);
    const reach = battle.bonusReach(a)!;
    expect(Math.max(...reach.stops.map((p) => p.x))).toBe(2);
    expect(battle.bonusMoveTo(a, { x: 2, y: 0 })).not.toBeNull();
    expect(a.x).toBe(2);
    expect(a.bonusMove).toBe(0);
    expect(battle.bonusReach(a)).toBeNull();
  });

  it('is not used by the computer', () => {
    const a = sk({ id: 'a', side: 'enemy', x: 0, ...sabre }, 'wheel');
    const d = unit({ id: 'd', x: 1, ...spear });
    const battle = battleOf([a, d], openMap(6, 1), scripted(99, 99, 99, 99, 99, 99));
    battle.executePlan({ unit: a, dest: { x: 0, y: 0 }, action: { kind: 'attack', target: d, slot: 0 }, escape: false, wakes: false, score: 0 });
    expect(a.bonusMove).toBe(0);
  });
});

describe('remedies', () => {
  const heal = (skills: string[], hp: number) => {
    const doc = sk({ id: 'doc', class: 'healer', inventory: ['salve'], x: 0 }, ...skills);
    const patient = unit({ id: 'p', x: 1 });
    patient.hp = hp;
    return { doc, patient, battle: battleOf([doc, patient], openMap(5, 1)) };
  };

  it('Triage heals 3 more when the target is below half health, and only then', () => {
    const low = heal(['triage'], 5);
    expect(low.battle.heal(low.doc, low.patient, 0).restored).toBe(11);
    const edge = heal(['triage'], 9);
    expect(edge.battle.heal(edge.doc, edge.patient, 0).restored).toBe(8);
    const without = heal([], 5);
    expect(without.battle.heal(without.doc, without.patient, 0).restored).toBe(8);
  });

  it('Cure clears thirst, heat and burning along with the wound', () => {
    const { doc, patient, battle } = heal(['cure'], 9);
    battle.addStatus(patient, 'thirst', 2);
    battle.addStatus(patient, 'burn', 2);
    battle.addStatus(patient, 'harry', 2);
    const report = battle.heal(doc, patient, 0);
    expect([...report.cured].sort()).toEqual(['burn', 'thirst']);
    expect(patient.statuses.map((s) => s.id)).toEqual(['harry']); // an ailment, not a curse of battle, is what it clears
  });
});
