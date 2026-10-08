import { describe, expect, it } from 'vitest';
import { newArmy } from '../src/core/army';
import { applyEffects, buildChapterTable, nextBattle, stepAfter, stepAt } from '../src/core/chapters';
import { newCampaign } from '../src/core/campaign';
import { SupportTracker, buildSupportTable } from '../src/core/supports';
import type { UnitDef, UnitTable } from '../src/core/unit';
import { tables } from '../src/data';

const def = (id: string, extra: Partial<UnitDef> = {}): UnitDef => ({
  id,
  name: id,
  side: 'player',
  class: 'soldier',
  level: 1,
  growth: {},
  inventory: ['levy-spear'],
  faction: 'ayyubid',
  skin: 's1',
  ...extra,
});
const units: UnitTable = { lord: def('lord', { name: 'Lord' }), soldier: def('soldier', { name: 'Soldier' }), recruit: def('recruit', { name: 'Recruit', playerNamed: true }) };

const chapters = (raw: unknown[]) => buildChapterTable(raw, { scenes: new Set(['s.one', 's.two']), battles: new Set(['B1', 'B2']), units: new Set(Object.keys(units)), supports: new Set(['pair']), items: new Set(['bandage']), codex: new Set(['CDX-P-X']) });
const ch = (id: string, steps: unknown[]): unknown => ({ id, title: `Chapter ${id}`, date: 'a date', steps });

describe('chapters as data', () => {
  it('reads steps of every kind', () => {
    const table = chapters([
      ch('CH-00', [{ kind: 'name' }, { kind: 'card' }, { kind: 'card', title: 'Later', date: '532 AH' }, { kind: 'scenes', scenes: ['s.one'] }, { kind: 'apply', do: [{ join: 'lord' }, { join: 'soldier', count: 2 }, { flag: 'f' }] }, { kind: 'camp', label: 'Go' }, { kind: 'battle', battle: 'B1' }]),
      ch('CH-01', [{ kind: 'battle', battle: 'B2' }]),
    ]);
    expect([...table.keys()]).toEqual(['CH-00', 'CH-01']);
    expect(table.get('CH-00')?.steps).toHaveLength(7);
  });

  it.each([
    ['an unknown step', [{ kind: 'dance' }], /unknown step kind "dance"/],
    ['a scene that does not exist', [{ kind: 'scenes', scenes: ['nope'] }], /scene "nope" does not exist/],
    ['a battle that does not exist', [{ kind: 'battle', battle: 'nope' }], /battle "nope" does not exist/],
    ['an effect with two verbs', [{ kind: 'apply', do: [{ join: 'lord', flag: 'x' }] }], /exactly one of/],
    ['a count on something that cannot have one', [{ kind: 'apply', do: [{ flag: 'x', count: 2 }] }], /does not belong/],
    ['a unit that does not exist', [{ kind: 'apply', do: [{ join: 'ghost' }] }], /unit "ghost", which does not exist/],
    ['a support that does not exist', [{ kind: 'apply', do: [{ grant: 'nope', atLeast: 'C' }] }], /support "nope"/],
    ['a grant with no rank', [{ kind: 'apply', do: [{ grant: 'pair' }] }], /atLeast/],
    ['a Codex entry that does not exist', [{ kind: 'apply', do: [{ unlock: 'CDX-P-NOPE' }] }], /Codex entry/],
    ['a card with a date and no title', [{ kind: 'card', date: 'x' }], /needs a title/],
    ['an empty list of steps', [], /needs steps/],
    ['leaving before joining', [{ kind: 'apply', do: [{ leave: 'lord' }] }], /leaves before it has joined/],
    ['joining twice', [{ kind: 'apply', do: [{ join: 'lord' }, { join: 'lord' }] }], /joins twice/],
  ])('refuses %s', (_, steps, message) => {
    expect(() => chapters([ch('CH-00', steps as unknown[])])).toThrow(message);
  });

  it('refuses a campaign that names the Recruit twice, and a chapter id that is not a ledger id', () => {
    expect(() => chapters([ch('CH-00', [{ kind: 'name' }]), ch('CH-01', [{ kind: 'name' }])])).toThrow(/only once/);
    expect(() => chapters([ch('chapter one', [{ kind: 'name' }])])).toThrow(/ledger chapter/);
  });
});

describe('walking the chapters', () => {
  const table = chapters([
    ch('CH-00', [{ kind: 'card' }, { kind: 'camp' }, { kind: 'battle', battle: 'B1' }]),
    ch('CH-01', [{ kind: 'scenes', scenes: ['s.one'] }, { kind: 'battle', battle: 'B2' }]),
  ]);

  it('goes to the next step, then the next chapter, then ends', () => {
    expect(stepAfter(table, { chapter: 'CH-00', step: 0 })).toEqual({ chapter: 'CH-00', step: 1 });
    expect(stepAfter(table, { chapter: 'CH-00', step: 2 })).toEqual({ chapter: 'CH-01', step: 0 });
    expect(stepAfter(table, { chapter: 'CH-01', step: 1 })).toBeNull();
  });

  it('finds the next battle, even in the next chapter', () => {
    expect(nextBattle(table, { chapter: 'CH-00', step: 1 })).toEqual({ chapter: 'CH-00', step: 2, battle: 'B1' });
    expect(nextBattle(table, { chapter: 'CH-01', step: 2 })).toBeNull();
    expect(nextBattle(table, { chapter: 'CH-01', step: 0 })).toEqual({ chapter: 'CH-01', step: 1, battle: 'B2' });
    expect(stepAt(table, { chapter: 'CH-00', step: 1 })).toEqual({ kind: 'camp' });
  });
});

describe('what a step does to the army', () => {
  const env = { units, tables };
  const fresh = () => {
    const supports = new SupportTracker(buildSupportTable([{ id: 'pair', a: 'lord', b: 'soldier', pace: 'normal', scenes: { C: { scene: 's', ledger: 'SUP-X-C' } } }]));
    return newCampaign({ mode: 'classic', seed: 1, story: 'campaign', army: newArmy([], 0, { supports }), chapter: 'CH-00', recruitName: 'Hasan' });
  };

  it('joins units, numbering a troop of one kind and naming the Recruit what the player said', () => {
    const c = fresh();
    const report = applyEffects(c, [{ join: 'lord' }, { join: 'soldier', count: 3 }, { join: 'recruit' }], env);
    expect(c.army.units.map((u) => [u.id, u.name])).toEqual([['lord', 'Lord'], ['soldier#1', 'Soldier 1'], ['soldier#2', 'Soldier 2'], ['soldier#3', 'Soldier 3'], ['recruit', 'Hasan']]);
    expect(report.joined).toHaveLength(5);
    expect([...c.army.deployed]).toHaveLength(5);
  });

  it('lets a unit leave, for good', () => {
    const c = fresh();
    applyEffects(c, [{ join: 'lord' }, { join: 'soldier' }], env);
    const report = applyEffects(c, [{ leave: 'lord' }], env);
    expect(report.left.map((u) => u.id)).toEqual(['lord']);
    expect(c.army.units.map((u) => u.id)).toEqual(['soldier']);
    expect(c.army.deployed.has('lord')).toBe(false);
  });

  it('sends units away, and gives them back to the field when they return', () => {
    const c = fresh();
    applyEffects(c, [{ join: 'lord' }, { join: 'soldier' }, { away: ['soldier'] }], env);
    expect([...c.army.away]).toEqual(['soldier']);
    expect(c.army.deployed.has('soldier')).toBe(false);
    applyEffects(c, [{ away: [] }], env);
    expect(c.army.away.size).toBe(0);
    expect(c.army.deployed.has('soldier')).toBe(true);
  });

  it('raises a support to a rank, never lowers it', () => {
    const c = fresh();
    applyEffects(c, [{ grant: 'pair', atLeast: 'C' }], env);
    expect(c.army.supports?.stateOf('pair').points).toBe(20);
    c.army.supports!.stateOf('pair').points = 45;
    applyEffects(c, [{ grant: 'pair', atLeast: 'C' }], env);
    expect(c.army.supports?.stateOf('pair').points).toBe(45);
  });

  it('gives items and dinars, raises flags and opens Codex entries', () => {
    const c = fresh();
    applyEffects(c, [{ give: 'bandage', count: 2 }, { dinars: 150 }, { dinars: -50 }, { flag: 'seen' }, { unlock: 'CDX-P-X' }], env);
    expect(c.army.convoy.map((s) => s.id)).toEqual(['bandage', 'bandage']);
    expect(c.army.dinars).toBe(100);
    expect(c.flags.has('seen')).toBe(true);
    expect(c.codex.has('CDX-P-X')).toBe(true);
  });

  it('refuses to join or give what does not exist', () => {
    expect(() => applyEffects(fresh(), [{ join: 'ghost' }], env)).toThrow(/unknown unit/);
    expect(() => applyEffects(fresh(), [{ give: 'nonsense' }], env)).toThrow(/unknown item/);
  });
});
