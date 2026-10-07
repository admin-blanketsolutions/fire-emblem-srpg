import { describe, expect, it } from 'vitest';
import { newArmy, settleChapter, type Army } from '../src/core/army';
import { availableTalks, beginCamp, completeTalk, deployedUnits, DRILL_WEXP, drill, fitDeployment, isDeployed, promotable, promoteWithItem, toggleDeploy } from '../src/core/camp';
import { buildSupportTable, SupportTracker, TALKS_PER_CAMP, type SupportGate } from '../src/core/supports';
import { tables } from '../src/data';
import { battleOf, openMap, unit } from './support';

const gate = (): SupportGate => ({ chapter: 'CH-01', chapterOrder: ['CH-00', 'CH-01'], flags: new Set() });
const scene = (r: string) => ({ scene: `test.${r}`, ledger: `SUP-TEST-${r}` });
const pair = (id: string, a: string, b: string) => ({ id, a, b, pace: 'normal', scenes: { C: scene('c'), B: scene('b') } });

function camp(): Army {
  const lord = unit({ id: 'lord', class: 'young-lord', tags: ['lord'], level: 3 });
  const pike = unit({ id: 'pike', class: 'pikeman', inventory: ['levy-spear'] });
  const scribe = unit({ id: 'scribe', class: 'scribe', inventory: ['knife'] });
  const supports = new SupportTracker(buildSupportTable([pair('lord-pike', 'lord', 'pike'), pair('lord-scribe', 'lord', 'scribe'), pair('pike-scribe', 'pike', 'scribe'), pair('lord-ghost', 'lord', 'ghost')]));
  return newArmy([lord, pike, scribe], 500, { supports });
}

describe('the conversations of the Majlis', () => {
  it('offers a scene when a pair has the points and both are in the army', () => {
    const army = camp();
    expect(availableTalks(army, gate())).toEqual([]);
    army.supports!.stateOf('lord-pike').points = 25;
    army.supports!.stateOf('lord-ghost').points = 25; // the ghost is not in the army
    const talks = availableTalks(army, gate());
    expect(talks.map((t) => [t.support.id, t.rank])).toEqual([['lord-pike', 'C']]);
    expect(talks[0]!.a.id).toBe('lord');
    expect(talks[0]!.b.id).toBe('pike');
  });

  it('completing a talk takes effect at once: the rank, the points and one of the camp’s talks', () => {
    const army = camp();
    army.supports!.stateOf('lord-pike').points = 25;
    const [talk] = availableTalks(army, gate());
    completeTalk(army, talk!, gate());
    expect(army.supports!.rankOf('lord-pike')).toBe('C');
    expect(army.supports!.stateOf('lord-pike').points).toBe(35);
    expect(army.camp.talks).toBe(1);
    expect(availableTalks(army, gate())).toEqual([]);
  });

  it('allows three talks a camp, and a new camp allows them again', () => {
    const army = camp();
    for (const id of ['lord-pike', 'lord-scribe', 'pike-scribe']) army.supports!.stateOf(id).points = 25;
    expect(TALKS_PER_CAMP).toBe(3);
    for (const t of availableTalks(army, gate())) completeTalk(army, t, gate());
    expect(army.camp.talks).toBe(3);
    for (const id of ['lord-pike', 'lord-scribe', 'pike-scribe']) army.supports!.stateOf(id).points = 100;
    expect(availableTalks(army, gate())).toEqual([]);
    beginCamp(army);
    expect(availableTalks(army, gate()).map((t) => t.rank)).toEqual(['B', 'B', 'B']);
  });

  it('has nothing to offer an army without supports, and refuses to complete a talk', () => {
    const army = newArmy([unit({ id: 'a' })]);
    expect(availableTalks(army, gate())).toEqual([]);
    const full = camp();
    full.supports!.stateOf('lord-pike').points = 25;
    const [talk] = availableTalks(full, gate());
    expect(() => completeTalk(army, talk!, gate())).toThrow(/no supports/);
  });
});

describe('the Maydan', () => {
  it('drills a unit once a camp, in the kind of weapon it holds', () => {
    const army = camp();
    const pike = army.units[1]!;
    const before = pike.wexp.spear ?? 0;
    const result = drill(army, pike, tables);
    expect(result).toMatchObject({ ok: true, gain: { kind: 'spear', amount: DRILL_WEXP } });
    expect(pike.wexp.spear).toBe(before + DRILL_WEXP);
    expect(drill(army, pike, tables)).toMatchObject({ ok: false, reason: expect.stringMatching(/drilled/) });
    beginCamp(army);
    expect(drill(army, pike, tables).ok).toBe(true);
  });

  it('can earn a grade, and says so', () => {
    const army = camp();
    const pike = army.units[1]!;
    pike.wexp.spear = 13;
    const result = drill(army, pike, tables);
    expect(result).toMatchObject({ ok: true, gain: { gradeUp: 2 } });
  });

  it('cannot drill a unit that has nothing in hand', () => {
    const army = camp();
    const bare = unit({ id: 'bare', inventory: [] });
    army.units.push(bare);
    expect(drill(army, bare, tables)).toMatchObject({ ok: false, reason: expect.stringMatching(/no weapon/) });
    expect(army.camp.drilled.has('bare')).toBe(false);
  });
});

describe('promotion in the Class screen', () => {
  const ready = (): Army => {
    const army = camp();
    const captain = unit({ id: 'captain', class: 'soldier', level: 10, inventory: ['levy-spear'] });
    army.units.push(captain);
    return army;
  };

  it('lists a unit that has reached the level and holds, or the convoy holds, the Charter', () => {
    const army = ready();
    expect(promotable(army, tables)).toEqual([]);
    army.convoy.push({ id: 'charter-of-iqta', uses: 1 });
    const found = promotable(army, tables);
    expect(found).toEqual([{ unit: army.units[3], item: 'charter-of-iqta', from: 'convoy', targetName: 'Man-at-Arms' }]);
    army.units[3]!.inventory.push({ id: 'charter-of-iqta', uses: 1 });
    expect(promotable(army, tables)[0]?.from).toBe('pack');
  });

  it('does not list a unit below the level, or at the top of its line, or without the right item', () => {
    const army = ready();
    army.convoy.push({ id: 'charter-of-iqta', uses: 1 });
    army.units[3]!.level = 9;
    expect(promotable(army, tables)).toEqual([]);
    army.units[3]!.level = 10;
    army.convoy.length = 0;
    army.convoy.push({ id: 'diploma-of-investiture', uses: 1 }); // a Tier II item for a Tier I unit
    expect(promotable(army, tables)).toEqual([]);
  });

  it('promotes with the item from the convoy, and the item is used up', () => {
    const army = ready();
    army.convoy.push({ id: 'charter-of-iqta', uses: 1 });
    const captain = army.units[3]!;
    const outcome = promoteWithItem(army, captain, tables);
    expect(outcome).toMatchObject({ ok: true, result: { to: { id: 'man-at-arms' } } });
    expect(captain.classId).toBe('man-at-arms');
    expect(captain.level).toBe(1);
    expect(army.convoy).toEqual([]);
    expect(captain.inventory.map((i) => i.id)).toEqual(['levy-spear']);
    expect(promotable(army, tables)).toEqual([]);
  });

  it('says so when the unit has no room for the item, or cannot be promoted', () => {
    const army = ready();
    army.convoy.push({ id: 'charter-of-iqta', uses: 1 });
    const captain = army.units[3]!;
    captain.inventory = Array.from({ length: 5 }, () => ({ id: 'knife', uses: 5 }));
    expect(promoteWithItem(army, captain, tables)).toMatchObject({ ok: false, reason: expect.stringMatching(/no room/) });
    expect(army.convoy).toHaveLength(1);
    expect(promoteWithItem(army, army.units[1]!, tables)).toMatchObject({ ok: false, reason: expect.stringMatching(/cannot be promoted/) });
  });

  it('promotes a Tier II unit with the Diploma', () => {
    const army = camp();
    const mat = unit({ id: 'mat', class: 'man-at-arms', level: 12, inventory: ['iron-mace', 'diploma-of-investiture'] });
    army.units.push(mat);
    expect(promoteWithItem(army, mat, tables)).toMatchObject({ ok: true, result: { to: { id: 'bulwark' } } });
  });
});

describe('who takes the field', () => {
  it('starts with everyone chosen, and lets the player release anyone but the Lord', () => {
    const army = camp();
    expect(deployedUnits(army).map((u) => u.id)).toEqual(['lord', 'pike', 'scribe']);
    expect(toggleDeploy(army, army.units[1]!)).toEqual({ ok: true });
    expect(isDeployed(army, army.units[1]!)).toBe(false);
    expect(toggleDeploy(army, army.units[0]!)).toMatchObject({ ok: false, reason: expect.stringMatching(/must go/) });
    expect(toggleDeploy(army, army.units[1]!)).toEqual({ ok: true });
    expect(isDeployed(army, army.units[1]!)).toBe(true);
  });

  it('allows no more than the map has room for', () => {
    const army = camp();
    fitDeployment(army, 2);
    expect(deployedUnits(army).map((u) => u.id)).toEqual(['lord', 'pike']);
    expect(toggleDeploy(army, army.units[2]!)).toMatchObject({ ok: false, reason: expect.stringMatching(/room for only 2/) });
    toggleDeploy(army, army.units[1]!);
    expect(toggleDeploy(army, army.units[2]!)).toEqual({ ok: true });
    expect(deployedUnits(army).map((u) => u.id)).toEqual(['lord', 'scribe']);
  });

  it('keeps the Lord first when the limit shrinks, then those already chosen', () => {
    const army = camp();
    army.units.reverse(); // the Lord joined last in this order
    fitDeployment(army, 1);
    expect(deployedUnits(army).map((u) => u.id)).toEqual(['lord']);
  });

  it('will not choose someone who is not in the army', () => {
    const army = camp();
    expect(toggleDeploy(army, unit({ id: 'stranger' }))).toMatchObject({ ok: false, reason: expect.stringMatching(/not in the army/) });
  });
});

describe('the casualty roll', () => {
  it('records the chapter each lost unit fell in, and takes them off the field', () => {
    const army = camp();
    const battle = battleOf([...army.units], openMap(5, 1));
    army.units[1]!.retreated = true;
    const settlement = settleChapter(army, battle, 'classic', 'CH-01');
    expect(settlement.lost.map((u) => u.id)).toEqual(['pike']);
    expect(army.fallenIn.get('pike')).toBe('CH-01');
    expect(army.deployed.has('pike')).toBe(false);
    expect(army.units.map((u) => u.id)).toEqual(['lord', 'scribe']);
  });
});
