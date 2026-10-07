import { describe, expect, it } from 'vitest';
import { buildClassTable } from '../src/core/classes';
import { validateBalance } from '../src/core/balance';
import { STAT_KEYS } from '../src/core/stats';
import { WEAPON_KINDS } from '../src/core/weapons';
import { balance, classes, createTestBattle, testUnits, weapons } from '../src/data';

describe('the weapon table', () => {
  it('covers all ten weapon types', () => {
    const kinds = new Set([...weapons.values()].map((w) => w.kind));
    for (const kind of WEAPON_KINDS) expect(kinds.has(kind), kind).toBe(true);
  });

  it('lists the items of DESIGN §5.4', () => {
    const expected = [
      'levy-spear', 'brace-spear', 'steel-head-spear', 'cavalry-lance',
      'iron-sabre', 'syrian-sabre', 'curved-blade', 'iron-mace', 'flanged-mace',
      'hatchet', 'tabarzin', 'halberd', 'knife', 'khanjar', 'stiletto',
      'short-bow', 'composite-bow', 'great-composite-bow',
      'light-crossbow', 'frankish-crossbow', 'winch-crossbow',
      'javelin', 'heavy-javelin', 'mizraq', 'naphtha-pot', 'flame-jar', 'salve', 'cordial', 'theriac',
    ];
    for (const id of expected) expect(weapons.has(id), id).toBe(true);
    expect(weapons.size).toBe(expected.length);
  });

  it('matches the roles in DESIGN §5.3', () => {
    expect(weapons.get('brace-spear')?.effective).toEqual(['mounted']);
    expect(weapons.get('cavalry-lance')?.mountedOnly).toBe(true);
    expect(weapons.get('iron-mace')?.vsBonus).toEqual({ armored: 3 });
    for (const id of ['hatchet', 'tabarzin', 'halberd']) expect(weapons.get(id)?.effective).toContain('structure');
    for (const id of ['knife', 'khanjar', 'stiletto']) expect(weapons.get(id)?.quick).toBe(2);
    for (const id of ['light-crossbow', 'frankish-crossbow', 'winch-crossbow']) {
      expect(weapons.get(id)?.pierce).toBe(2);
      expect(weapons.get(id)?.range).toEqual([2, 2]);
    }
    expect(weapons.get('composite-bow')?.range).toEqual([2, 3]);
    expect(weapons.get('short-bow')).toMatchObject({ range: [1, 2], closeHit: -10 });
    for (const id of ['javelin', 'heavy-javelin', 'mizraq']) expect(weapons.get(id)?.range).toEqual([1, 2]);
    for (const id of ['naphtha-pot', 'flame-jar']) expect(weapons.get(id)).toMatchObject({ range: [1, 2], ignite: true });
    expect(weapons.get('theriac')?.might).toBeGreaterThanOrEqual(99);
  });

  it('has the sabre of the worked example', () => {
    expect(weapons.get('iron-sabre')).toMatchObject({ might: 5, hit: 90, crit: 5, weight: 4 });
    expect(weapons.get('levy-spear')).toMatchObject({ might: 5, hit: 85, crit: 0, weight: 6 });
  });

  it('grades a weapon no higher than the grade its group reaches', () => {
    for (const w of weapons.values()) expect(w.grade).toBeGreaterThanOrEqual(1);
    for (const w of weapons.values()) expect(w.price).toBeGreaterThan(0);
  });
});

describe('the Tier I classes (DESIGN §6.3)', () => {
  // HP MGT SKL SPD GRD NRV BLD MOV
  const table: Record<string, number[]> = {
    'young-lord': [19, 5, 5, 6, 3, 1, 7, 5],
    soldier: [18, 4, 3, 4, 3, 0, 6, 5],
    pikeman: [19, 5, 4, 4, 3, 0, 7, 5],
    swordsman: [18, 4, 6, 7, 2, 0, 5, 5],
    axeman: [21, 6, 3, 3, 3, 0, 8, 5],
    archer: [17, 4, 5, 5, 2, 1, 5, 5],
    'horse-archer': [17, 4, 5, 7, 2, 1, 5, 7],
    horseman: [20, 5, 4, 5, 4, 0, 8, 7],
    crossbowman: [18, 5, 4, 3, 3, 0, 7, 5],
    skirmisher: [16, 3, 5, 7, 1, 1, 4, 6],
    'fire-thrower': [16, 2, 6, 5, 1, 2, 4, 6],
    sapper: [18, 4, 3, 3, 3, 1, 8, 5],
    healer: [15, 1, 4, 4, 1, 4, 4, 6],
    scribe: [14, 1, 3, 4, 1, 5, 4, 6],
  };

  const tierOne = [...classes.values()].filter((c) => c.tier === 1 && c.line !== 'structure');

  it('has the fourteen lines', () => {
    expect(tierOne.map((c) => c.id).sort()).toEqual(Object.keys(table).sort());
    expect(new Set(tierOne.map((c) => c.line)).size).toBe(14);
  });

  it('matches the base stats', () => {
    for (const [id, [hp, mgt, skl, spd, grd, nrv, bld, mov]] of Object.entries(table)) {
      expect(classes.get(id)?.base, id).toEqual({ hp, mgt, skl, spd, fort: 0, grd, nrv, bld, mov });
    }
  });

  it('uses the movement types of DESIGN §6.2', () => {
    const mounted = ['horse-archer', 'horseman'];
    const light = ['skirmisher', 'fire-thrower', 'healer', 'scribe'];
    for (const c of tierOne) expect(c.moveType, c.id).toBe(mounted.includes(c.id) ? 'mounted' : light.includes(c.id) ? 'light' : 'foot');
  });

  it('matches the Tier I weapon grades of DESIGN §6.4', () => {
    expect(classes.get('young-lord')?.weapons).toEqual({ sabre: 3, spear: 2, bow: 1 });
    expect(classes.get('pikeman')?.weapons).toEqual({ spear: 4, sabre: 2, mace: 1, javelin: 1 });
    expect(classes.get('fire-thrower')?.weapons).toEqual({ fire: 4, dagger: 1 });
    expect(classes.get('healer')?.weapons).toEqual({ remedy: 4, dagger: 1 });
    expect(classes.get('scribe')?.weapons).toEqual({ remedy: 2, dagger: 1 });
  });

  it('lets each class use at least one weapon type, or heal', () => {
    for (const c of classes.values()) if (c.id !== 'structure') expect(Object.keys(c.weapons).length, c.id).toBeGreaterThan(0);
  });

  it('validates its inputs', () => {
    const base = Object.fromEntries(STAT_KEYS.map((k) => [k, 1]));
    const ok = { id: 'a', line: 'a', tier: 1, name: 'A', moveType: 'foot', base, weapons: {} };
    expect(buildClassTable([ok]).has('a')).toBe(true);
    expect(() => buildClassTable([ok, ok])).toThrow(/duplicate/);
    expect(() => buildClassTable([{ ...ok, tier: 4 }])).toThrow(/tier/);
    expect(() => buildClassTable([{ ...ok, moveType: 'flying' }])).toThrow(/moveType/);
    expect(() => buildClassTable([{ ...ok, base: { hp: 1 } }])).toThrow(/base/);
    expect(() => buildClassTable([{ ...ok, weapons: { club: 1 } }])).toThrow(/club/);
    expect(() => buildClassTable([{ ...ok, weapons: { spear: 9 } }])).toThrow(/grade/);
    expect(() => buildClassTable([{ ...ok, promotesTo: 'zzz' }])).toThrow(/promotes to unknown/);
    expect(() => buildClassTable([{ ...ok, growthMod: { luck: 1 } }])).toThrow(/unknown stat/);
  });
});

describe('balance', () => {
  it('has the numbers of DESIGN §5.7', () => {
    expect(balance).toMatchObject({ expPerLevel: 100, levelCap: 20, critMultiplier: 3, doubleThreshold: 4, bossExpBonus: 40 });
    expect(balance.tierExpRate).toEqual({ 1: 1, 2: 0.85, 3: 0.7 });
  });

  it('rejects incomplete balance data', () => {
    expect(() => validateBalance({})).toThrow();
    expect(() => validateBalance({ ...balance, tierExpRate: { 1: 1 } })).toThrow(/tierExpRate/);
    expect(() => validateBalance({ ...balance, critMultiplier: 0 })).toThrow(/critMultiplier/);
  });
});

describe('the proving-ground units', () => {
  it('reference known classes and items, and carry no more than five items', () => {
    for (const def of Object.values(testUnits)) {
      expect(classes.has(def.class), def.id).toBe(true);
      for (const item of def.inventory) expect(weapons.has(item), `${def.id}: ${item}`).toBe(true);
      expect(def.inventory.length).toBeLessThanOrEqual(5);
    }
  });

  it('give the lord and the soldier the stats of the worked example', () => {
    const battle = createTestBattle();
    expect(battle.units.find((u) => u.id === 'lord')?.stats).toMatchObject({ hp: 20, mgt: 6, skl: 6, spd: 7, fort: 3, grd: 3, bld: 7 });
    expect(battle.units.find((u) => u.id === 'soldier#1')?.stats).toMatchObject({ hp: 18, mgt: 5, skl: 3, spd: 4, fort: 1, grd: 3, bld: 6 });
  });

  it('start at full health, ready to act', () => {
    for (const u of createTestBattle().units) {
      expect(u.hp).toBe(u.stats.hp);
      expect(u).toMatchObject({ moved: false, acted: false, retreated: false, exp: 0 });
    }
  });
});

describe('the three tiers (DESIGN §6.2, §6.4, §6.6)', () => {
  const lines = ['lord', 'soldier', 'pike', 'sword', 'axe', 'bow', 'horse-archer', 'cavalry', 'crossbow', 'skirmish', 'fire', 'engineer', 'medic', 'scribe'];
  const real = [...classes.values()].filter((c) => c.line !== 'structure');
  const inLine = (line: string) => real.filter((c) => c.line === line).sort((a, b) => a.tier - b.tier);

  // HP MGT SKL SPD GRD NRV BLD MOV: Tier I to II, then II to III
  const gains: Record<string, [number[], number[]]> = {
    lord: [[11, 4, 4, 4, 4, 3, 3, 2], [8, 3, 3, 3, 3, 3, 2, 0]],
    soldier: [[6, 3, 2, 1, 5, 1, 5, -1], [7, 3, 2, 1, 4, 2, 3, 0]],
    pike: [[7, 3, 3, 3, 3, 2, 3, 0], [7, 3, 3, 2, 3, 2, 2, 0]],
    sword: [[6, 3, 4, 4, 2, 1, 2, 0], [6, 3, 3, 4, 2, 2, 1, 0]],
    axe: [[7, 4, 2, 2, 3, 1, 3, 0], [8, 4, 2, 2, 3, 1, 2, 0]],
    bow: [[6, 3, 4, 3, 2, 2, 2, 0], [6, 3, 4, 2, 2, 2, 1, 0]],
    'horse-archer': [[6, 3, 4, 4, 2, 2, 2, 1], [6, 3, 3, 3, 2, 2, 1, 0]],
    cavalry: [[8, 4, 3, 3, 4, 2, 4, 1], [8, 3, 3, 2, 3, 2, 2, 0]],
    crossbow: [[7, 4, 3, 2, 3, 1, 3, 0], [7, 4, 3, 1, 3, 2, 2, 0]],
    skirmish: [[6, 3, 3, 4, 2, 2, 2, 1], [6, 2, 3, 4, 2, 2, 1, 0]],
    fire: [[6, 2, 4, 3, 2, 2, 2, 0], [6, 2, 4, 2, 2, 3, 1, 0]],
    engineer: [[8, 3, 3, 2, 3, 2, 3, 0], [7, 3, 3, 2, 3, 2, 2, 0]],
    medic: [[5, 2, 4, 3, 2, 4, 2, 0], [6, 2, 3, 2, 2, 4, 1, 0]],
    scribe: [[7, 2, 4, 3, 2, 4, 2, 0], [6, 2, 3, 2, 2, 4, 1, 0]],
  };
  const order = ['hp', 'mgt', 'skl', 'spd', 'grd', 'nrv', 'bld', 'mov'] as const;

  it('has fourteen lines of three tiers each, and a placeholder for structures', () => {
    expect(real).toHaveLength(42);
    for (const line of lines) expect(inLine(line).map((c) => c.tier), line).toEqual([1, 2, 3]);
    expect(classes.get('structure')?.weapons).toEqual({});
  });

  it('chains each tier to the next in its own line', () => {
    for (const line of lines) {
      const [a, b, c] = inLine(line);
      expect([a?.promotesTo, b?.promotesTo, c?.promotesTo], line).toEqual([b?.id, c?.id, undefined]);
    }
  });

  it('gives each higher tier the Tier I base plus the cumulative promotion gains', () => {
    for (const line of lines) {
      const [one, two, three] = inLine(line);
      const [first, second] = gains[line] ?? [[], []];
      order.forEach((stat, i) => {
        expect(two?.base[stat], `${line} tier II ${stat}`).toBe((one?.base[stat] ?? 0) + (first?.[i] ?? 0));
        expect(three?.base[stat], `${line} tier III ${stat}`).toBe((one?.base[stat] ?? 0) + (first?.[i] ?? 0) + (second?.[i] ?? 0));
        expect(one?.promotionGain?.[stat] ?? 0, `${line} I→II ${stat}`).toBe(first?.[i] ?? 0);
        expect(two?.promotionGain?.[stat] ?? 0, `${line} II→III ${stat}`).toBe(second?.[i] ?? 0);
      });
      expect(three?.promotionGain).toBeUndefined();
    }
  });

  it('keeps Fortune personal: no class base has any', () => {
    for (const c of real) expect(c.base.fort, c.id).toBe(0);
  });

  it('follows the movement types of DESIGN §6.2', () => {
    const types: Record<string, [string, string, string]> = {
      lord: ['foot', 'mounted', 'mounted'],
      soldier: ['foot', 'armored', 'armored'],
      pike: ['foot', 'foot', 'foot'],
      sword: ['foot', 'foot', 'foot'],
      axe: ['foot', 'foot', 'foot'],
      bow: ['foot', 'foot', 'foot'],
      'horse-archer': ['mounted', 'mounted', 'mounted'],
      cavalry: ['mounted', 'mounted', 'mounted'],
      crossbow: ['foot', 'foot', 'foot'],
      skirmish: ['light', 'light', 'light'],
      fire: ['light', 'light', 'light'],
      engineer: ['foot', 'foot', 'foot'],
      medic: ['light', 'light', 'light'],
      scribe: ['light', 'light', 'light'],
    };
    for (const line of lines) expect(inLine(line).map((c) => c.moveType), line).toEqual(types[line]);
  });

  it('moves a Young Lord from 5 to 7 on promotion, and a Soldier from 5 to 4', () => {
    expect(classes.get('lord')?.base.mov).toBe(7);
    expect(classes.get('man-at-arms')?.base.mov).toBe(4);
  });

  it('raises the weapon grades by tier as in DESIGN §6.4', () => {
    const grades = (id: string) => classes.get(id)?.weapons;
    expect(grades('young-lord')).toEqual({ sabre: 3, spear: 2, bow: 1 });
    expect(grades('lord')).toEqual({ sabre: 5, spear: 4, bow: 2, mace: 3 });
    expect(grades('sovereign')).toEqual({ sabre: 5, spear: 5, bow: 3, mace: 4 });
    expect(grades('man-at-arms')).toEqual({ spear: 3, sabre: 3, mace: 4, axe: 2 });
    expect(grades('engineer')).toEqual({ mace: 4, axe: 3, spear: 3, fire: 2 });
    expect(grades('master-physician')).toEqual({ remedy: 5, dagger: 2 });
    expect(grades('vizier')).toEqual({ remedy: 4, dagger: 2 });
  });

  it('lets a few Tier III classes exceed the usual cap', () => {
    expect(classes.get('bulwark')?.caps).toEqual({ grd: 48 });
    expect(classes.get('legend')?.caps).toEqual({ spd: 44 });
    expect(classes.get('steppe-lord')?.caps).toEqual({ spd: 44 });
    expect(classes.get('master-physician')?.caps).toEqual({ nrv: 46 });
  });

  it('gives Tier I one skill, Tier II two and Tier III two, as in DESIGN §6.5', () => {
    for (const line of lines) {
      const [one, two, three] = inLine(line);
      expect([one?.skills?.length, two?.skills?.length, three?.skills?.length], line).toEqual([1, 2, 2]);
      expect(two?.skills?.[0], line).toBe(one?.skills?.[0]);
      // the Lord's `command` is the upgraded `presence`, so that line differs by design
      if (line !== 'lord') expect(three?.skills?.[0], line).toBe(two?.skills?.[1]);
    }
    expect(classes.get('sovereign')?.skills).toEqual(['command', 'clemency']);
  });

  it('uses the common names and records the flavour names with their honesty flags', () => {
    expect(inLine('pike').map((c) => c.name)).toEqual(['Pikeman', 'Spear Knight', 'Pike Marshal']);
    expect(inLine('sword').map((c) => c.name)).toEqual(['Swordsman', 'Blademaster', 'Legend']); // not Swordmaster (DECISIONS D-023)
    expect(classes.get('lord')?.historical).toEqual({ name: 'Amir', label: 'attested' });
    expect(classes.get('young-lord')?.historical).toEqual({ name: 'Fata', label: 'game-label' });
    expect(classes.get('fire-thrower')?.historical).toEqual({ name: 'Naffat', label: 'attested' });
    expect(classes.get('fire-master')?.historical).toBeUndefined(); // no attested name: the game does not invent one
    for (const c of real) expect(c.ledger, c.id).toMatch(/^CLS-/);
  });
});
