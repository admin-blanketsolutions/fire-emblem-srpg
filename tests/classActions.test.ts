import { describe, expect, it } from 'vitest';
import { ACTION_EXP, ENTRENCH_LIMIT, MEND_USES, SAP_DAMAGE } from '../src/core/classActions';
import type { UnitInstance } from '../src/core/unit';
import { battleOf, mapOf, unit, type UnitSpec } from './support';

const legend = { '.': 'plain', g: 'gate', W: 'wall', '~': 'river' };
const map = (rows: string[], extra = {}) => mapOf(rows, extra, legend);

/** A unit with exactly the given skills, whatever its class would grant. */
const sk = (spec: UnitSpec, ...skills: string[]): UnitInstance => {
  const u = unit(spec);
  u.skills = skills;
  return u;
};

const ids = (u: UnitInstance, battle: ReturnType<typeof battleOf>, from?: { x: number; y: number }): string[] => battle.classActions(u, from).map((o) => o.id);

describe('Sap', () => {
  const setup = (rows = ['.g..']) => {
    const sapper = sk({ id: 'sapper', class: 'sapper', inventory: ['iron-mace'], x: 0 }, 'sap');
    const battle = battleOf([sapper], map(rows));
    return { sapper, battle };
  };

  it('offers a hostile gate or wall beside the sapper, and nothing else', () => {
    const { sapper, battle } = setup(['.g.W']);
    const gate = battle.placeStructure('gate', { x: 1, y: 0 }, 'enemy');
    const wall = battle.placeStructure('wall-segment', { x: 3, y: 0 }, 'enemy');
    battle.placeStructure('barricade', { x: 2, y: 0 }, 'enemy'); // wood needs no sapping
    expect(battle.classActions(sapper)).toEqual([{ id: 'sap', name: 'Sap', targets: [{ x: 1, y: 0 }] }]);
    expect(battle.classActions(sapper, { x: 2, y: 0 }).map((o) => o.targets)).toEqual([[{ x: 1, y: 0 }, { x: 3, y: 0 }]]);
    expect(gate.hp).toBe(24);
    expect(wall.hp).toBe(30);
  });

  it('is not offered against your own gate, or to a unit without the skill', () => {
    const { sapper, battle } = setup();
    battle.placeStructure('gate', { x: 1, y: 0 }, 'player');
    expect(ids(sapper, battle)).toEqual([]);
    const plain = unit({ id: 'plain', x: 2 });
    const other = battleOf([plain], map(['.g..']));
    other.placeStructure('gate', { x: 1, y: 0 }, 'enemy');
    expect(ids(plain, other)).toEqual([]);
  });

  it('deals 8 whatever the gate’s Guard, spends the action and earns 8 EXP', () => {
    const { sapper, battle } = setup();
    const gate = battle.placeStructure('gate', { x: 1, y: 0 }, 'enemy');
    const report = battle.doClassAction(sapper, 'sap', { x: 1, y: 0 });
    expect(SAP_DAMAGE).toBe(8);
    expect(gate.hp).toBe(16);
    expect(report).toMatchObject({ id: 'sap', actor: sapper, target: gate, amount: 8, destroyed: false });
    expect(report.expAward).toMatchObject({ amount: ACTION_EXP, expAfter: 8 });
    expect(sapper.exp).toBe(8);
    expect(sapper.acted).toBe(true);
  });

  it('brings a gate down at 0, and a wall down to a breach', () => {
    const { sapper, battle } = setup(['.W..']);
    const wall = battle.placeStructure('wall-segment', { x: 1, y: 0 }, 'enemy');
    wall.hp = 5;
    const report = battle.doClassAction(sapper, 'sap', { x: 1, y: 0 });
    expect(report).toMatchObject({ amount: 5, destroyed: true });
    expect(wall.retreated).toBe(true);
    expect(battle.terrainAt(1, 0).id).toBe('plain');
  });

  it('refuses a tile that is not a target, and an action the unit cannot take', () => {
    const { sapper, battle } = setup();
    battle.placeStructure('gate', { x: 1, y: 0 }, 'enemy');
    expect(() => battle.doClassAction(sapper, 'sap', { x: 2, y: 0 })).toThrow(/cannot be aimed/);
    expect(() => battle.doClassAction(sapper, 'sap')).toThrow(/cannot be aimed/);
    expect(() => battle.doClassAction(sapper, 'mend', { x: 1, y: 0 })).toThrow(/cannot Mend/);
    expect(sapper.acted).toBe(false);
  });

  it('gives an enemy’s sapper no EXP, and a Tier II engineer 6', () => {
    const foe = sk({ id: 'foe', side: 'enemy', class: 'sapper', inventory: ['iron-mace'], x: 0 }, 'sap');
    const battle = battleOf([foe], map(['.g..']));
    battle.placeStructure('gate', { x: 1, y: 0 }, 'player');
    expect(battle.doClassAction(foe, 'sap', { x: 1, y: 0 }).expAward).toBeNull();
    const engineer = sk({ id: 'engineer', class: 'engineer', inventory: ['iron-mace'], x: 0 }, 'sap');
    const second = battleOf([engineer], map(['.g..']));
    second.placeStructure('gate', { x: 1, y: 0 }, 'enemy');
    expect(second.doClassAction(engineer, 'sap', { x: 1, y: 0 }).expAward?.amount).toBe(6);
  });
});

describe('Entrench', () => {
  const engineer = (x = 1, y = 1) => sk({ id: 'eng', class: 'engineer', inventory: ['iron-mace'], x, y }, 'entrench');

  it('offers the free, passable tiles beside the engineer', () => {
    const eng = engineer();
    const blocker = unit({ id: 'blocker', x: 0, y: 1 });
    const battle = battleOf([eng, blocker], map(['.~.', '...', '...']));
    battle.ignite(2, 1);
    expect(battle.classActions(eng)).toEqual([{ id: 'entrench', name: 'Entrench', targets: [{ x: 1, y: 2 }] }]);
  });

  it('raises a barricade on the engineer’s side, which hinders the enemy’s horse and not its own', () => {
    const eng = engineer(1, 0);
    const battle = battleOf([eng], map(['...', '...']));
    const report = battle.doClassAction(eng, 'entrench', { x: 2, y: 0 });
    const barricade = report.target!;
    expect(barricade).toMatchObject({ kind: 'structure', defId: 'barricade', side: 'player', x: 2, y: 0, hp: 12 });
    expect(battle.unitAt(2, 0)).toBe(barricade);
    expect(report.expAward?.amount).toBe(6); // Tier II
    expect(eng.acted).toBe(true);
    expect(barricade.id).toBe('barricade#1');
  });

  it('allows three in a chapter and no more', () => {
    const eng = engineer(1, 1);
    const battle = battleOf([eng], map(['...', '...', '...']));
    for (const at of [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 1 }]) {
      eng.acted = false;
      battle.doClassAction(eng, 'entrench', at);
    }
    expect(ENTRENCH_LIMIT).toBe(3);
    eng.acted = false;
    expect(ids(eng, battle)).toEqual([]);
    expect(battle.units.filter((u) => u.defId === 'barricade')).toHaveLength(3);
  });

  it('counts for each engineer, and not at all for one who lacks the skill', () => {
    const a = engineer(1, 1);
    const b = sk({ id: 'b', class: 'engineer', inventory: ['iron-mace'], x: 4, y: 1 }, 'entrench');
    const battle = battleOf([a, b], map(['.....', '.....', '.....']));
    for (let i = 0; i < 3; i++) {
      a.acted = false;
      battle.doClassAction(a, 'entrench', battle.classActions(a)[0]!.targets[0]);
    }
    expect(ids(a, battle)).toEqual([]);
    expect(ids(b, battle)).toEqual(['entrench']);
  });
});

describe('Mend', () => {
  const setup = () => {
    const mender = sk({ id: 'mender', class: 'master-engineer', inventory: ['iron-mace'], x: 0 }, 'mend');
    const ally = unit({ id: 'ally', x: 1 });
    const battle = battleOf([mender, ally], map(['....']));
    return { mender, ally, battle };
  };

  it('offers an adjacent ally only when the equipped weapon is worn', () => {
    const { mender, ally, battle } = setup();
    expect(ids(mender, battle)).toEqual([]);
    ally.inventory[0]!.uses = 12;
    expect(battle.classActions(mender)).toEqual([{ id: 'mend', name: 'Mend', targets: [{ x: 1, y: 0 }] }]);
  });

  it('restores 10 uses, never past the weapon’s full durability', () => {
    const { mender, ally, battle } = setup();
    ally.inventory[0]!.uses = 12;
    expect(battle.doClassAction(mender, 'mend', { x: 1, y: 0 })).toMatchObject({ amount: MEND_USES });
    expect(ally.inventory[0]!.uses).toBe(22);
    const second = sk({ id: 'second', class: 'master-engineer', inventory: ['iron-mace'], x: 2 }, 'mend');
    const b = battleOf([second, ally], map(['....']));
    ally.x = 1;
    ally.turnFlags = [];
    ally.inventory[0]!.uses = 36;
    expect(b.doClassAction(second, 'mend', { x: 1, y: 0 })).toMatchObject({ amount: 4 });
    expect(ally.inventory[0]!.uses).toBe(40);
  });

  it('mends a given ally once a turn, not oneself, not an enemy', () => {
    const { mender, ally, battle } = setup();
    ally.inventory[0]!.uses = 5;
    mender.inventory[0]!.uses = 5;
    const other = sk({ id: 'other', class: 'master-engineer', inventory: ['iron-mace'], x: 2 }, 'mend');
    battle.units.push(other);
    battle.doClassAction(mender, 'mend', { x: 1, y: 0 });
    expect(ids(other, battle)).toEqual([]); // the ally has been mended this turn
    expect(ids(mender, battle)).toEqual([]); // and the mender cannot mend itself
    battle.endPhase();
    battle.endPhase();
    expect(ids(other, battle)).toEqual(['mend']);
    const foe = unit({ id: 'foe', side: 'enemy', x: 3 });
    foe.inventory[0]!.uses = 5;
    battle.units.push(foe);
    other.x = 4;
    expect(battle.classActions(other, { x: 2, y: 0 }).flatMap((o) => o.targets)).not.toContainEqual({ x: 3, y: 0 });
  });
});

describe('Counsel', () => {
  const setup = (extra: UnitInstance[] = []) => {
    const scribe = sk({ id: 'scribe', class: 'scribe', inventory: ['knife'], x: 0 }, 'counsel');
    const near = unit({ id: 'near', x: 3 });
    const far = unit({ id: 'far', x: 4 });
    const foe = unit({ id: 'foe', side: 'enemy', x: 5 });
    return { scribe, near, far, foe, battle: battleOf([scribe, near, far, foe, ...extra], map(['......'])) };
  };

  it('offers allies within three tiles, never an enemy or oneself', () => {
    const { scribe, battle } = setup();
    expect(battle.classActions(scribe)).toEqual([{ id: 'counsel', name: 'Counsel', targets: [{ x: 3, y: 0 }] }]);
  });

  it('gives +10 accuracy and +10 avoid, and spends the scribe’s action for 8 EXP', () => {
    const { scribe, near, foe, battle } = setup();
    // stand the two side by side so there is a fight to forecast
    near.x = 4;
    foe.x = 5;
    const attacking = battle.forecastFor(near, foe)!.attacker.strike!.hit;
    const defending = battle.forecastFor(foe, near)!.attacker.strike!.hit;
    near.x = 3;
    battle.doClassAction(scribe, 'counsel', { x: 3, y: 0 });
    near.x = 4;
    expect(battle.forecastFor(near, foe)!.attacker.strike!.hit - attacking).toBe(10);
    expect(battle.forecastFor(foe, near)!.attacker.strike!.hit - defending).toBe(-10);
    expect(near.statuses.map((s) => s.id)).toEqual(['counsel']);
    expect(scribe.acted).toBe(true);
    expect(scribe.exp).toBe(8);
  });

  it('lasts through the enemy phase and no longer, with or without an Ally Phase', () => {
    const { scribe, near, battle } = setup();
    battle.doClassAction(scribe, 'counsel', { x: 3, y: 0 });
    battle.endPhase(); // the player's phase ends
    expect(near.statuses.map((s) => s.id)).toEqual(['counsel']);
    battle.endPhase(); // the enemy phase ends
    expect(near.statuses).toEqual([]);

    const friend = unit({ id: 'friend', side: 'ally', x: 2 });
    const withAllies = setup([friend]);
    withAllies.battle.doClassAction(withAllies.scribe, 'counsel', { x: 3, y: 0 });
    withAllies.battle.endPhase(); // player
    withAllies.battle.endPhase(); // ally
    expect(withAllies.near.statuses.map((s) => s.id)).toEqual(['counsel']);
    withAllies.battle.endPhase(); // enemy
    expect(withAllies.near.statuses).toEqual([]);
  });

  it('is not offered again to an ally who is already counselled', () => {
    const { scribe, battle } = setup();
    battle.doClassAction(scribe, 'counsel', { x: 3, y: 0 });
    scribe.acted = false;
    expect(battle.classActions(scribe)).toEqual([]);
  });
});

describe('Dispatch', () => {
  const setup = () => {
    const counselor = sk({ id: 'counselor', class: 'counselor', inventory: ['knife'], x: 0 }, 'dispatch');
    const ally = unit({ id: 'ally', x: 2 });
    const battle = battleOf([counselor, ally], map(['.....']));
    return { counselor, ally, battle };
  };

  it('offers only allies that have already acted, within two tiles', () => {
    const { counselor, ally, battle } = setup();
    expect(ids(counselor, battle)).toEqual([]);
    ally.acted = true;
    expect(battle.classActions(counselor)).toEqual([{ id: 'dispatch', name: 'Dispatch', targets: [{ x: 2, y: 0 }] }]);
    ally.x = 3;
    expect(ids(counselor, battle)).toEqual([]);
  });

  it('lets the ally move and act again, once a turn', () => {
    const { counselor, ally, battle } = setup();
    ally.acted = true;
    ally.moved = true;
    ally.travelled = 4;
    battle.doClassAction(counselor, 'dispatch', { x: 2, y: 0 });
    expect(ally).toMatchObject({ acted: false, moved: false, travelled: 0 });
    expect(counselor.acted).toBe(true);
    ally.acted = true;
    const second = sk({ id: 'second', class: 'counselor', inventory: ['knife'], x: 1 }, 'dispatch');
    battle.units.push(second);
    // the first counselor has acted too, so it may be dispatched, but the ally may not be sent twice in one turn
    expect(battle.classActions(second)).toEqual([{ id: 'dispatch', name: 'Dispatch', targets: [{ x: 0, y: 0 }] }]);
    battle.endPhase();
    battle.endPhase();
    ally.acted = true;
    expect(battle.classActions(second)).toEqual([{ id: 'dispatch', name: 'Dispatch', targets: [{ x: 2, y: 0 }] }]);
  });

  it('never a Lord, and never oneself', () => {
    const { counselor, ally, battle } = setup();
    ally.acted = true;
    ally.tags.push('lord');
    counselor.acted = true;
    expect(ids(counselor, battle)).toEqual([]);
  });
});

describe('Decree', () => {
  const setup = () => {
    const vizier = sk({ id: 'vizier', class: 'vizier', inventory: ['knife'], x: 0 }, 'decree');
    const a = unit({ id: 'a', x: 5 });
    const ally = unit({ id: 'ally', side: 'ally', x: 6 });
    const foe = unit({ id: 'foe', side: 'enemy', x: 7 });
    return { vizier, a, ally, foe, battle: battleOf([vizier, a, ally, foe], map(['........'])) };
  };

  it('is offered with no target, to the unit that has the skill', () => {
    const { vizier, battle } = setup();
    expect(battle.classActions(vizier)).toEqual([{ id: 'decree', name: 'Decree', targets: [] }]);
  });

  it('lifts every friendly unit, the vizier too, through the enemy phase, and not the enemy', () => {
    const { vizier, a, ally, foe, battle } = setup();
    const report = battle.doClassAction(vizier, 'decree');
    expect(report.amount).toBe(3);
    for (const u of [vizier, a, ally]) expect(u.statuses.map((s) => s.id), u.id).toEqual(['decree']);
    expect(foe.statuses).toEqual([]);
    expect(vizier.acted).toBe(true);
    battle.endPhase();
    battle.endPhase();
    battle.endPhase();
    expect(a.statuses).toEqual([]);
  });

  it('only once in a chapter', () => {
    const { vizier, battle } = setup();
    battle.doClassAction(vizier, 'decree');
    vizier.acted = false;
    expect(ids(vizier, battle)).toEqual([]);
    battle.endPhase();
    battle.endPhase();
    expect(ids(vizier, battle)).toEqual([]);
  });
});

describe('Open', () => {
  const setup = (inventory = ['iron-sabre', 'gate-key']) => {
    const hero = unit({ id: 'hero', inventory, x: 0 });
    const battle = battleOf([hero], map(['.g..']));
    const gate = battle.placeStructure('gate', { x: 1, y: 0 }, 'enemy');
    return { hero, gate, battle };
  };

  it('needs a key and a gate beside the unit', () => {
    const { hero, battle } = setup(['iron-sabre']);
    expect(ids(hero, battle)).toEqual([]);
    const keyed = setup();
    expect(keyed.battle.classActions(keyed.hero)).toEqual([{ id: 'open', name: 'Open', targets: [{ x: 1, y: 0 }] }]);
    keyed.hero.x = 3;
    expect(ids(keyed.hero, keyed.battle)).toEqual([]);
  });

  it('spends the key, opens the gate, and gives no EXP', () => {
    const { hero, gate, battle } = setup();
    const report = battle.doClassAction(hero, 'open', { x: 1, y: 0 });
    expect(report).toMatchObject({ destroyed: true, target: gate, expAward: null });
    expect(gate.retreated).toBe(true);
    expect(hero.inventory.map((i) => i.id)).toEqual(['iron-sabre']);
    expect(hero.equipped).toBe(0);
    expect(hero.acted).toBe(true);
    expect(battle.unitAt(1, 0)).toBeUndefined();
  });

  it('opens a gate of either side, but never a wall', () => {
    const hero = unit({ id: 'hero', inventory: ['iron-sabre', 'gate-key'], x: 0 });
    const battle = battleOf([hero], map(['.W..']));
    battle.placeStructure('wall-segment', { x: 1, y: 0 }, 'enemy');
    expect(ids(hero, battle)).toEqual([]);
    const friendly = setup();
    friendly.gate.side = 'player';
    expect(ids(friendly.hero, friendly.battle)).toEqual(['open']);
  });
});

describe('who may act', () => {
  it('offers nothing to a structure, or to a unit that has fallen', () => {
    const sapper = sk({ id: 'sapper', class: 'sapper', inventory: ['iron-mace'], x: 0 }, 'sap');
    const battle = battleOf([sapper], map(['.g..']));
    const gate = battle.placeStructure('gate', { x: 1, y: 0 }, 'enemy');
    expect(battle.classActions(gate)).toEqual([]);
    sapper.retreated = true;
    expect(battle.classActions(sapper)).toEqual([]);
  });

  it('a menu lists every action the unit can take, in a fixed order', () => {
    const eng = sk({ id: 'eng', class: 'master-engineer', inventory: ['iron-mace', 'gate-key'], x: 1, y: 1 }, 'sap', 'entrench', 'mend');
    const ally = unit({ id: 'ally', x: 0, y: 1 });
    ally.inventory[0]!.uses = 3;
    const battle = battleOf([eng, ally], map(['.g.', '...', '...']));
    battle.placeStructure('gate', { x: 1, y: 0 }, 'enemy');
    expect(ids(eng, battle)).toEqual(['sap', 'entrench', 'mend', 'open']);
  });
});
