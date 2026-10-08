import { describe, expect, it } from 'vitest';
import { planUnit, playPhase } from '../src/core/ai';
import { computeVisible } from '../src/core/fog';
import type { ReachResult } from '../src/core/pathfinding';
import { buildBattle } from '../src/core/setup';
import { buildStructureTable, createStructure } from '../src/core/structures';
import type { UnitDef, UnitTable } from '../src/core/unit';
import { structures, tables, weapons } from '../src/data';
import { battleOf, mapOf, openMap, scripted, unit } from './support';

const legend = { '.': 'plain', g: 'gate', W: 'wall', s: 'steppe', '~': 'river', G: 'grove' };
const map = (rows: string[], extra = {}) => mapOf(rows, extra, legend);
const stops = (r: ReachResult): string[] => r.stops.map((p) => `${p.x},${p.y}`).sort();

describe('the structure table', () => {
  it('describes gates, walls, barricades and mangonels', () => {
    expect([...structures.keys()].sort()).toEqual(['barricade', 'city-gate', 'city-wall', 'gate', 'mangonel', 'pavilion', 'wall-segment']);
    expect(structures.get('gate')).toMatchObject({ hp: 24, grd: 4 });
    expect(structures.get('wall-segment')?.breach).toBe('plain');
    expect(structures.get('mangonel')).toMatchObject({ weapon: 'mangonel-stone', fireWeak: true });
    expect(structures.get('barricade')).toMatchObject({ crossable: ['foot', 'light'], fireWeak: true });
  });

  it('rejects bad data', () => {
    const ok = { id: 'x', name: 'X', hp: 5, grd: 1, tags: [] };
    expect(() => buildStructureTable([{ ...ok, hp: 0 }], weapons)).toThrow(/hp must be at least 1/);
    expect(() => buildStructureTable([{ ...ok, grd: -1 }], weapons)).toThrow(/grd/);
    expect(() => buildStructureTable([{ ...ok, weapon: 'nope' }], weapons)).toThrow(/unknown weapon/);
    expect(() => buildStructureTable([{ ...ok, crossable: ['swim'] }], weapons)).toThrow(/unknown movement type/);
    expect(() => buildStructureTable([ok, ok], weapons)).toThrow(/duplicate/);
    expect(() => buildStructureTable([{ ...ok, tags: undefined }], weapons)).toThrow(/needs tags/);
  });

  it('builds a structure as a unit that is not a soldier', () => {
    const gate = createStructure(structures.get('gate')!, 'gate', 3, 1, 'enemy', tables);
    expect(gate).toMatchObject({ kind: 'structure', hp: 24, side: 'enemy', ai: null, x: 3, y: 1, classId: 'structure', spriteId: 'unit.gate', equipped: -1 });
    expect(gate.stats).toMatchObject({ hp: 24, grd: 4, mov: 0 });
    expect(gate.tags).toEqual(expect.arrayContaining(['gate', 'blocks', 'structure']));
    const engine = createStructure(structures.get('mangonel')!, 'm', 0, 0, 'enemy', tables, ['target']);
    expect(engine.inventory).toEqual([{ id: 'mangonel-stone', uses: 99 }]);
    expect(engine).toMatchObject({ equipped: 0, ai: { mode: 'stationary' } });
    expect(engine.tags).toContain('target');
  });
});

describe('structures in the way', () => {
  it('a gate stops everyone, its own side included', () => {
    const hero = unit({ id: 'hero', x: 0 });
    const guard = unit({ id: 'guard', side: 'enemy', x: 4 });
    const battle = battleOf([hero, guard], map(['..g..']));
    battle.placeStructure('gate', { x: 2, y: 0 }, 'enemy');
    expect(stops(battle.reachFor(hero))).toEqual(['0,0', '1,0']);
    expect(stops(battle.reachFor(guard))).toEqual(['3,0', '4,0']);
  });

  it('a wall on wall ground blocks, and shows no way through', () => {
    const hero = unit({ id: 'hero', x: 0 });
    const battle = battleOf([hero], map(['..W..']));
    battle.placeStructure('wall-segment', { x: 2, y: 0 }, 'enemy');
    expect(battle.unitAt(2, 0)).toBeDefined(); // placed exactly where the map put it, though no one could stand there
    expect(stops(battle.reachFor(hero))).toEqual(['0,0', '1,0']);
  });

  it('foot and light climb a barricade for one more, but never stop on it; mounted and armored cannot', () => {
    const foot = unit({ id: 'foot', x: 0 });
    const battle = battleOf([foot], map(['.....']));
    battle.placeStructure('barricade', { x: 2, y: 0 }, 'enemy');
    // foot has 5 movement: tile 1 (1), the barricade (1+1), then tile 3 (4) and tile 4 (5)
    expect(stops(battle.reachFor(foot))).toEqual(['0,0', '1,0', '3,0', '4,0']);
    expect(battle.costFor(foot)(2, 0)).toBe(2);
    expect(battle.costFor(foot)(3, 0)).toBe(1);
    // a horse has seven, and would clear it, but the barricade turns it back
    const horse = unit({ id: 'horse', class: 'horseman', inventory: ['levy-spear'], x: 0 });
    const ridden = battleOf([horse], map(['.....']));
    ridden.placeStructure('barricade', { x: 2, y: 0 }, 'enemy');
    expect(stops(ridden.reachFor(horse))).toEqual(['0,0', '1,0']);
    const light = unit({ id: 'light', class: 'skirmisher', inventory: ['javelin'], x: 0 });
    const quick = battleOf([light], map(['.....']));
    quick.placeStructure('barricade', { x: 2, y: 0 }, 'enemy');
    expect(stops(quick.reachFor(light))).toContain('4,0');
  });

  it('a barricade of your own side is climbed over the same way', () => {
    const foot = unit({ id: 'foot', x: 0 });
    const battle = battleOf([foot], map(['....']));
    battle.placeStructure('barricade', { x: 1, y: 0 }, 'player');
    expect(stops(battle.reachFor(foot))).toEqual(['0,0', '2,0', '3,0']);
  });

  it('a structure placed on an occupied tile takes the nearest free one', () => {
    const hero = unit({ id: 'hero', x: 1 });
    const battle = battleOf([hero], map(['.....']));
    const b = battle.placeStructure('barricade', { x: 1, y: 0 }, 'enemy');
    expect([b.x, b.y]).not.toEqual([1, 0]);
    expect(Math.abs(b.x - 1) + Math.abs(b.y)).toBe(1);
  });

  it('numbers structures like units', () => {
    const battle = battleOf([unit({ id: 'hero' })], map(['......']));
    expect(battle.placeStructure('barricade', { x: 3, y: 0 }, 'enemy').id).toBe('barricade#1');
    expect(battle.placeStructure('barricade', { x: 4, y: 0 }, 'enemy').id).toBe('barricade#2');
    expect(() => battle.placeStructure('catapult', { x: 5, y: 0 }, 'enemy')).toThrow(/Unknown structure/);
  });
});

describe('attacking structures', () => {
  it('a gate cannot counter, cannot dodge but for its ground, and is doubled by a quick attacker', () => {
    const hero = unit({ id: 'hero', x: 0 });
    const battle = battleOf([hero], map(['.g']));
    const gate = battle.placeStructure('gate', { x: 1, y: 0 }, 'enemy');
    const fc = battle.forecastFor(hero, gate)!;
    expect(fc.defender.strike).toBeNull();
    expect(fc.defender.strikes).toBe(0);
    expect(fc.defender.evasion).toBe(20); // the gate tile's avoid, nothing else
    // sabre Might 5 + MGT 4, less the gate's Guard 4 and the gate tile's cover 3
    expect(fc.attacker.strike!.damage).toBe(4 + 5 - 4 - 3);
    expect(fc.attacker.strikes).toBe(2);
  });

  it('axes break structures: the hatchet deals double Might', () => {
    const axeman = unit({ id: 'axe', class: 'axeman', inventory: ['hatchet'], x: 0 });
    axeman.skills = []; // Heavy Blow would add to both figures
    const battle = battleOf([axeman], map(['.g']));
    const gate = battle.placeStructure('gate', { x: 1, y: 0 }, 'enemy');
    expect(battle.forecastFor(axeman, gate)!.attacker.strike!.damage).toBe(6 + 7 * 2 - 4 - 3);
    const foe = unit({ id: 'foe', side: 'enemy', x: 1 });
    const open = battleOf([axeman, foe], map(['..']));
    expect(open.forecastFor(axeman, foe)!.attacker.strike!.damage).toBe(6 + 7 - 2);
  });

  it('Siege Bolt gives a crossbow double Might against a structure only', () => {
    const shooter = unit({ id: 'shooter', class: 'crossbowman', inventory: ['light-crossbow'], x: 0 });
    shooter.skills = ['siege-bolt'];
    const battle = battleOf([shooter], map(['..W']));
    const wall = battle.placeStructure('wall-segment', { x: 2, y: 0 }, 'enemy');
    const might = weapons.get('light-crossbow')!.might;
    // Guard 6 and no cover on wall ground, less the crossbow's Pierce 2
    expect(battle.forecastFor(shooter, wall)!.attacker.strike!.damage).toBe(5 + might * 2 - (6 - 2));
    shooter.skills = [];
    expect(battle.forecastFor(shooter, wall)!.attacker.strike!.damage).toBe(5 + might - (6 - 2));
  });

  it('fire ignores a structure’s Guard, and doubles against wood', () => {
    const thrower = unit({ id: 'thrower', class: 'fire-thrower', inventory: ['naphtha-pot'], x: 2 });
    const battle = battleOf([thrower], map(['...g.']));
    const barricade = battle.placeStructure('barricade', { x: 1, y: 0 }, 'enemy');
    const gate = battle.placeStructure('gate', { x: 3, y: 0 }, 'enemy');
    // Fire is Skill 6 + Might 6, and the barricade takes the Might twice; nothing resists it
    expect(battle.forecastFor(thrower, barricade)!.attacker.strike!.damage).toBe(6 + 6 * 2);
    expect(battle.forecastFor(thrower, gate)!.attacker.strike!.damage).toBe(6 + 6);
  });

  it('destroying a structure gives no EXP, though the weapon learns', () => {
    const axeman = unit({ id: 'axe', class: 'axeman', inventory: ['hatchet'], x: 0 });
    const battle = battleOf([axeman], map(['.g']), scripted(0, 99));
    const gate = battle.placeStructure('gate', { x: 1, y: 0 }, 'enemy');
    gate.hp = 1;
    const fight = battle.fight(axeman, gate);
    expect(fight.defeated).toEqual([gate]);
    expect(gate.retreated).toBe(true);
    expect(fight.expAwards).toEqual([]);
    expect(axeman.exp).toBe(0);
    expect(fight.wexpGains).toHaveLength(1);
    expect(fight.wexpGains[0]).toMatchObject({ kind: 'axe', amount: 2 });
  });

  it('a wall segment destroyed leaves a breach that can be crossed', () => {
    const axeman = unit({ id: 'axe', class: 'axeman', inventory: ['hatchet'], x: 1 });
    const battle = battleOf([axeman], map(['..W..']), scripted(0, 99));
    const wall = battle.placeStructure('wall-segment', { x: 2, y: 0 }, 'enemy');
    wall.hp = 1;
    expect(battle.terrainAt(2, 0).id).toBe('wall');
    const version = battle.terrainVersion;
    battle.fight(axeman, wall);
    expect(battle.terrainAt(2, 0).id).toBe('plain');
    expect(battle.terrainVersion).toBe(version + 1);
    expect(stops(battle.reachFor(axeman))).toContain('3,0');
  });

  it('a gate destroyed opens the way but leaves the ground as it was', () => {
    const axeman = unit({ id: 'axe', class: 'axeman', inventory: ['hatchet'], x: 1 });
    const battle = battleOf([axeman], map(['..g..']), scripted(0, 99));
    const gate = battle.placeStructure('gate', { x: 2, y: 0 }, 'enemy');
    gate.hp = 1;
    battle.fight(axeman, gate);
    expect(battle.terrainAt(2, 0).id).toBe('gate');
    expect(battle.unitAt(2, 0)).toBeUndefined();
    expect(stops(battle.reachFor(axeman))).toContain('4,0');
  });

  it('a structure of your own side cannot be attacked', () => {
    const hero = unit({ id: 'hero', x: 0 });
    const battle = battleOf([hero], map(['..']));
    const own = battle.placeStructure('barricade', { x: 1, y: 0 }, 'player');
    expect(battle.targetsFrom(hero, hero)).not.toContain(own);
  });
});

describe('structures and the chapter', () => {
  it('a structure never holds a rout open', () => {
    const hero = unit({ id: 'hero', tags: ['lord'] });
    const battle = battleOf([hero], openMap(6, 1, { objective: { type: 'rout' } }));
    battle.placeStructure('mangonel', { x: 5, y: 0 }, 'enemy');
    battle.placeStructure('gate', { x: 4, y: 0 }, 'enemy');
    battle.check('action');
    expect(battle.outcome).toMatchObject({ result: 'won' });
  });

  it('a structure of the player’s does not hold the player’s phase open', () => {
    const hero = unit({ id: 'hero' });
    const battle = battleOf([hero], openMap(5, 1));
    battle.placeStructure('barricade', { x: 3, y: 0 }, 'player');
    expect(battle.isSideSpent('player')).toBe(false);
    battle.wait(hero);
    expect(battle.isSideSpent('player')).toBe(true);
  });

  it('structures do not see: they add nothing to the player’s vision', () => {
    const hero = unit({ id: 'hero', x: 0 });
    const battle = battleOf([hero], openMap(14, 1, { fog: true }));
    battle.placeStructure('barricade', { x: 10, y: 0 }, 'player');
    const seen = computeVisible(battle, ['player']);
    expect(seen.has(3)).toBe(true);
    expect(seen.has(9)).toBe(false);
    expect(seen.has(10)).toBe(false);
  });

  it('a remedy cannot reach a structure, nor a conversation', () => {
    const healer = unit({ id: 'healer', class: 'healer', inventory: ['salve'], x: 0 });
    const battle = battleOf([healer], openMap(3, 1));
    const own = battle.placeStructure('barricade', { x: 1, y: 0 }, 'player');
    own.hp = 3;
    const salve = battle.usableRemedies(healer)[0]!.weapon;
    expect(battle.healTargets(healer, salve, healer)).toEqual([]);
  });

  it('hospices and Renewal do not mend structures', () => {
    const medic = unit({ id: 'medic', class: 'healer', inventory: ['salve'], x: 0 });
    medic.skills = ['renewal'];
    const battle = battleOf([medic], map(['..']));
    const own = battle.placeStructure('barricade', { x: 1, y: 0 }, 'player');
    own.hp = 3;
    battle.endPhase();
    battle.endPhase();
    expect(own.hp).toBe(3);
  });
});

describe('the mangonel', () => {
  it('stands where it is and shells what comes within three to five tiles', () => {
    const hero = unit({ id: 'hero', x: 4 });
    const battle = battleOf([hero], openMap(8, 1), scripted(0));
    const engine = battle.placeStructure('mangonel', { x: 0, y: 0 }, 'enemy');
    const plan = planUnit(battle, engine);
    expect(plan.dest).toEqual({ x: 0, y: 0 });
    expect(plan.action).toMatchObject({ kind: 'attack', target: hero });
    const results = playPhase(battle, 'enemy');
    expect(results).toHaveLength(1);
    expect(results[0]!.fight!.events[0]).toMatchObject({ by: 'a', hit: true });
    expect(hero.hp).toBeLessThan(18);
    expect(engine.acted).toBe(true);
    expect([engine.x, engine.y]).toEqual([0, 0]);
  });

  it('does nothing when no one is in range, and does not advance', () => {
    const hero = unit({ id: 'hero', x: 7 });
    const battle = battleOf([hero], openMap(8, 1));
    const engine = battle.placeStructure('mangonel', { x: 0, y: 0 }, 'enemy');
    expect(planUnit(battle, engine).action.kind).toBe('wait');
    expect(planUnit(battle, engine).dest).toEqual({ x: 0, y: 0 });
    expect(playPhase(battle, 'enemy')).toHaveLength(1);
    expect(engine.acted).toBe(true);
  });

  it('cannot hit what is too close, which is why its guards matter', () => {
    const hero = unit({ id: 'hero', x: 2 });
    const battle = battleOf([hero], openMap(8, 1));
    const engine = battle.placeStructure('mangonel', { x: 0, y: 0 }, 'enemy');
    expect(battle.targetsFrom(engine, engine)).toEqual([]);
  });

  it('is a hostile target the player can reach with a blade', () => {
    const hero = unit({ id: 'hero', x: 1 });
    const battle = battleOf([hero], openMap(8, 1));
    const engine = battle.placeStructure('mangonel', { x: 0, y: 0 }, 'enemy');
    expect(battle.targetsFrom(hero, hero)).toEqual([engine]);
    // a mangonel counters nothing at one tile: its stone needs three
    expect(battle.forecastFor(hero, engine)!.defender.strike).toBeNull();
  });

  it('a structure that cannot fire has no plan to make', () => {
    const hero = unit({ id: 'hero', x: 0 });
    const battle = battleOf([hero], openMap(4, 1));
    const gate = battle.placeStructure('gate', { x: 3, y: 0 }, 'enemy');
    expect(gate.ai).toBeNull();
    expect(playPhase(battle, 'enemy')).toEqual([]);
  });
});

describe('structures placed by maps and events', () => {
  const defs: UnitTable = {
    hero: { id: 'hero', name: 'Hero', side: 'player', class: 'swordsman', level: 1, growth: {}, inventory: ['iron-sabre'], faction: 'ayyubid', skin: 's1' } satisfies UnitDef,
  };

  it('a map can place structures on any side, with tags, and number the repeats', () => {
    const battle = buildBattle(
      map(['.......'], {
        spawns: {
          player: [{ unit: 'hero', at: [0, 0] }, { unit: 'barricade', at: [1, 0] }],
          enemy: [{ unit: 'gate', at: [4, 0], tags: ['east-gate'] }, { unit: 'barricade', at: [5, 0] }, { unit: 'mangonel', at: [6, 0], ai: { mode: 'stationary' } }],
        },
      }),
      defs,
      tables,
    );
    expect(battle.units.map((u) => u.id)).toEqual(['hero', 'barricade#1', 'gate', 'barricade#2', 'mangonel']);
    expect(battle.units.map((u) => u.side)).toEqual(['player', 'player', 'enemy', 'enemy', 'enemy']);
    expect(battle.units[2]?.tags).toContain('east-gate');
    expect(battle.units[4]?.ai).toEqual({ mode: 'stationary' });
  });

  it('a structure of the player’s side has no computer plan, even one that fires', () => {
    const battle = buildBattle(map(['....'], { spawns: { player: [{ unit: 'hero', at: [0, 0] }, { unit: 'mangonel', at: [2, 0] }] } }), defs, tables);
    expect(battle.units[1]?.ai).toBeNull();
  });

  it('refuses a unit that is neither a unit nor a structure', () => {
    expect(() => buildBattle(map(['..'], { spawns: { enemy: [{ unit: 'catapult', at: [1, 0] }] } }), defs, tables)).toThrow(/unknown unit "catapult"/);
  });

  it('an event can raise a structure on a side, and open a gate', () => {
    const battle = buildBattle(
      map(['.....'], {
        spawns: { player: [{ unit: 'hero', at: [0, 0] }], enemy: [{ unit: 'gate', at: [3, 0] }] },
        events: [
          { id: 'rampart', when: { type: 'turnStart', turn: 2, phase: 'player' }, then: [{ type: 'spawn', units: [{ def: 'barricade', side: 'player', at: [1, 0] }] }] },
          { id: 'sally', when: { type: 'turnStart', turn: 2, phase: 'player' }, then: [{ type: 'openGate', at: [3, 0] }] },
        ],
      }),
      defs,
      tables,
    );
    battle.endPhase();
    battle.endPhase();
    const raised = battle.units.find((u) => u.id === 'barricade#1');
    expect(raised).toMatchObject({ side: 'player', kind: 'structure', retreated: false });
    expect(battle.unitAt(3, 0)).toBeUndefined();
    expect(battle.unhandled).toEqual([]);
    expect(battle.arrivals).toEqual([]); // arrivals are cleared once the phase report is made
  });

  it('opening a gate that is not there is reported, not ignored', () => {
    const battle = buildBattle(map(['...'], { spawns: { player: [{ unit: 'hero', at: [0, 0] }] }, events: [{ id: 'open', when: { type: 'turnStart', turn: 1 }, then: [{ type: 'openGate', at: [2, 0] }] }] }), defs, tables);
    expect(battle.unhandled).toEqual([{ type: 'openGate', at: [2, 0] }]);
  });
});
