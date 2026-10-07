import { describe, expect, it } from 'vitest';
import { checkPromotion, promote } from '../src/core/promotion';
import { STATUS_IDS, applyStatus, hasExpired, type Status } from '../src/core/status';
import { buildItemTable } from '../src/core/items';
import { balance, battleOf, classes, openMap, unit } from './support';

const at = (id: string, level: number, extra: Parameters<typeof unit>[0] = {}) => unit({ class: id, level, ...extra });

describe('checking a promotion', () => {
  it('needs level 10 and a tier above', () => {
    expect(checkPromotion(at('young-lord', 9), classes, balance)).toEqual({ ok: false, reason: 'must reach level 10' });
    const ready = checkPromotion(at('young-lord', 10), classes, balance);
    expect(ready.ok && ready.target.id).toBe('lord');
    expect(checkPromotion(at('sovereign', 20), classes, balance)).toMatchObject({ ok: false, reason: 'is at the top of its line' });
  });
});

describe('promoting', () => {
  it('resets the level and EXP, raises the stats by the line’s gains, restores HP and swaps skills', () => {
    const u = at('young-lord', 12, { offset: { fort: 3 }, weaponGrades: { sabre: 3 } });
    u.exp = 77;
    u.hp = 4;
    u.wexp = { sabre: 55, spear: 15 };
    const before = { ...u.stats };
    const result = promote(u, classes);
    expect(result.from.id).toBe('young-lord');
    expect(result.to.id).toBe('lord');
    expect([u.classId, u.tier, u.level, u.exp]).toEqual(['lord', 2, 1, 0]);
    expect(u.stats).toMatchObject({ hp: before.hp + 11, mgt: before.mgt + 4, skl: before.skl + 4, spd: before.spd + 4, grd: before.grd + 4, nrv: before.nrv + 3, bld: before.bld + 3, mov: 7 });
    expect(u.stats.fort).toBe(3); // Fortune is personal and does not change
    expect(u.hp).toBe(u.stats.hp);
    expect(u.moveType).toBe('mounted');
    expect(u.skills).toEqual(['stand-fast', 'presence']);
    expect(u.wexp).toEqual({ sabre: 55, spear: 15 }); // weapon EXP is kept
    expect(result.before.hp).toBe(before.hp);
    expect(result.after.hp).toBe(u.stats.hp);
    expect(result.levelBefore).toBe(12);
  });

  it('never raises a stat past the new class’s cap', () => {
    const u = at('man-at-arms', 10);
    u.stats.grd = 47; // the Bulwark's cap is 48
    u.stats.mgt = 29; // an ordinary Tier III cap is 40, so this one is fine
    promote(u, classes);
    expect(u.classId).toBe('bulwark');
    expect(u.stats.grd).toBe(48);
    expect(u.stats.mgt).toBe(32);
  });

  it('can take a unit all the way up a line, resetting each time', () => {
    const u = at('pikeman', 10);
    promote(u, classes);
    expect([u.classId, u.level]).toEqual(['spear-knight', 1]);
    u.level = 14;
    promote(u, classes);
    expect([u.classId, u.tier, u.level]).toEqual(['pike-marshal', 3, 1]);
    expect(() => promote(u, classes)).toThrow(/cannot be promoted/);
  });

  it('lets the unit wield the weapons its new grade allows', () => {
    const u = at('swordsman', 10, { inventory: ['iron-sabre', 'curved-blade'] });
    u.wexp = { sabre: 80 }; // grade IV
    const battle = battleOf([u]);
    expect(battle.equip(u, 1)).toBe(true); // the Curved Blade is grade IV and the Swordsman's cap is IV
    const archerKit = at('archer', 10, { inventory: ['short-bow', 'great-composite-bow'] });
    archerKit.wexp = { bow: 200 };
    expect(battleOf([archerKit]).equip(archerKit, 1)).toBe(true);
  });
});

describe('promotion items', () => {
  it('lets a Tier I unit of level 10 use the Charter of Iqta’, which is used up', () => {
    const u = at('swordsman', 10, { inventory: ['iron-sabre', 'charter-of-iqta'] });
    const battle = battleOf([u]);
    expect(battle.canUseItem(u, 1)).toBe(true);
    const report = battle.useItem(u, 1);
    expect(report.promotion?.to.id).toBe('blademaster');
    expect(u.inventory.map((i) => i.id)).toEqual(['iron-sabre']);
    expect(u.acted).toBe(true);
  });

  it('refuses it below level 10, to a Tier II unit, and the Diploma to a Tier I unit', () => {
    const young = at('swordsman', 9, { inventory: ['charter-of-iqta', 'diploma-of-investiture'] });
    const battle = battleOf([young]);
    expect(battle.canUseItem(young, 0)).toBe(false);
    young.level = 10;
    expect(battle.canUseItem(young, 0)).toBe(true);
    expect(battle.canUseItem(young, 1)).toBe(false);
    const veteran = at('spear-knight', 10, { inventory: ['charter-of-iqta', 'diploma-of-investiture'] });
    const b2 = battleOf([veteran]);
    expect(b2.canUseItem(veteran, 0)).toBe(false);
    expect(b2.canUseItem(veteran, 1)).toBe(true);
    expect(() => b2.useItem(veteran, 0)).toThrow(/cannot use/);
  });

  it('lets a rank event promote a unit, or hand over the Charter if it is not yet ready', () => {
    const map = openMap(5, 1, { events: [{ id: 'rank', when: { type: 'turnStart', turn: 1 }, then: [{ type: 'promote', unit: 'hero' }] }] });
    const ready = at('young-lord', 12, { id: 'hero', inventory: ['iron-sabre'] });
    battleOf([ready], map).begin();
    expect(ready.classId).toBe('lord');
    const early = at('young-lord', 4, { id: 'hero', inventory: ['iron-sabre'] });
    battleOf([early], map).begin();
    expect(early.classId).toBe('young-lord');
    expect(early.inventory.map((i) => i.id)).toEqual(['iron-sabre', 'charter-of-iqta']);
  });
});

describe('consumables', () => {
  it('a bandage restores up to 10 HP, three times, and not at full health', () => {
    const u = at('swordsman', 1, { inventory: ['bandage'] });
    const battle = battleOf([u]);
    expect(battle.canUseItem(u, 0)).toBe(false);
    u.hp = 3;
    expect(battle.useItem(u, 0)).toMatchObject({ restored: 10 });
    expect(u.hp).toBe(13);
    u.acted = false;
    u.hp = u.stats.hp - 4;
    expect(battle.useItem(u, 0).restored).toBe(4); // only what was missing
    expect(u.inventory[0]?.uses).toBe(1);
    u.acted = false;
    u.hp = 1;
    battle.useItem(u, 0);
    expect(u.inventory).toEqual([]);
  });

  it('cures the status it names and nothing else', () => {
    const u = at('swordsman', 1, { inventory: ['water-skin', 'rose-water-sherbet'] });
    const battle = battleOf([u]);
    expect(battle.canUseItem(u, 0)).toBe(false);
    battle.addStatus(u, 'thirst', 2);
    battle.addStatus(u, 'heat', 2);
    expect(battle.canUseItem(u, 0)).toBe(true);
    expect(battle.useItem(u, 0).cured).toEqual(['thirst']);
    expect(u.statuses.map((s) => s.id)).toEqual(['heat']);
    u.hp = 5;
    u.acted = false;
    expect(battle.useItem(u, 1)).toMatchObject({ restored: 10, cured: ['heat'] });
    expect(u.statuses).toEqual([]);
  });

  it('keeps the equipped weapon equipped when an item before it is used up', () => {
    const u = at('swordsman', 1, { inventory: ['bandage', 'iron-sabre'] });
    u.inventory[0]!.uses = 1;
    u.hp = 2;
    const battle = battleOf([u]);
    expect(battle.weaponOf(u)?.id).toBe('iron-sabre');
    battle.useItem(u, 0);
    expect(battle.weaponOf(u)?.id).toBe('iron-sabre');
    expect(u.equipped).toBe(0);
  });

  it('does not offer a key as something to use', () => {
    const u = at('swordsman', 1, { inventory: ['gate-key'] });
    expect(battleOf([u]).canUseItem(u, 0)).toBe(false);
  });
});

describe('trading', () => {
  const pair = () => {
    const a = unit({ id: 'a', inventory: ['iron-sabre', 'bandage'], x: 0 });
    const b = unit({ id: 'b', inventory: ['levy-spear'], x: 1 });
    return { a, b, battle: battleOf([a, b]) };
  };

  it('swaps items between adjacent friends and does not spend either unit’s action', () => {
    const { a, b, battle } = pair();
    expect(battle.trade(a, 1, b, 0)).toBe(true);
    expect(a.inventory.map((i) => i.id)).toEqual(['iron-sabre', 'levy-spear']);
    expect(b.inventory.map((i) => i.id)).toEqual(['bandage']);
    expect([a.acted, b.acted]).toEqual([false, false]);
  });

  it('gives an item to a friend with room, and refuses when the pack is full', () => {
    const { a, b, battle } = pair();
    expect(battle.trade(a, 1, b, 1)).toBe(true); // slot 1 of b is one past its end: a gift
    expect(b.inventory.map((i) => i.id)).toEqual(['levy-spear', 'bandage']);
    b.inventory = Array.from({ length: 5 }, () => ({ id: 'knife', uses: 5 }));
    expect(battle.trade(a, 0, b, 5)).toBe(false);
  });

  it('keeps each unit’s equipped weapon valid', () => {
    const { a, b, battle } = pair();
    battle.trade(a, 0, b, 0); // the sabre and the spear change hands
    expect(battle.weaponOf(a)?.id).toBe('levy-spear');
    expect(battle.weaponOf(b)?.id).toBe('iron-sabre');
  });

  it('refuses at a distance, to an enemy, and with nothing on either side', () => {
    const { a, b, battle } = pair();
    b.x = 3;
    expect(battle.trade(a, 0, b, 0)).toBe(false);
    b.x = 1;
    expect(battle.trade(a, 0, a, 1)).toBe(false);
    const foe = unit({ id: 'foe', side: 'enemy', x: 0, y: 1 });
    battle.units.push(foe);
    expect(battle.trade(a, 0, foe, 0)).toBe(false);
    expect(battle.trade(a, 5, b, 5)).toBe(false);
  });
});

describe('statuses', () => {
  it('runs until the end of the phase it names', () => {
    const order = ['player', 'ally', 'enemy'] as const;
    const s: Status = { id: 'harry', until: { turn: 2, phase: 'enemy' }, amount: 1 };
    expect(hasExpired(s, 1, 'enemy', order)).toBe(false);
    expect(hasExpired(s, 2, 'player', order)).toBe(false);
    expect(hasExpired(s, 2, 'enemy', order)).toBe(true);
    expect(hasExpired(s, 3, 'player', order)).toBe(true);
  });

  it('stacks sunder to three, and refreshes the date', () => {
    const list: Status[] = [];
    for (let i = 0; i < 5; i++) applyStatus(list, 'sunder', { turn: i + 1, phase: 'player' });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ amount: 3, until: { turn: 5 } });
    applyStatus(list, 'harry', { turn: 1, phase: 'enemy' });
    applyStatus(list, 'harry', { turn: 1, phase: 'enemy' });
    expect(list.find((x) => x.id === 'harry')?.amount).toBe(1); // not a stacking status
  });

  it('lapses at the end of the right phase in a battle', () => {
    const u = unit({ id: 'u' });
    const battle = battleOf([u, unit({ id: 'e', side: 'enemy', x: 4 })], openMap(5, 1));
    battle.begin();
    battle.addStatus(u, 'counsel', 0); // for the rest of this (player) phase
    battle.addStatus(u, 'decree', 1); // and through the enemy phase
    expect(u.statuses.map((s) => s.id)).toEqual(['counsel', 'decree']);
    battle.endPhase(); // the player phase ends; the enemy phase begins
    expect(u.statuses.map((s) => s.id)).toEqual(['decree']);
    battle.endPhase();
    expect(u.statuses).toEqual([]);
  });

  it('knows its own ids', () => {
    expect(STATUS_IDS).toContain('burn');
  });
});

describe('the item table', () => {
  it('holds the items of DESIGN §5.4', () => {
    const table = buildItemTable([
      { id: 'a', name: 'A', kind: 'consumable', uses: 1, price: 1, description: 'x', heal: 5 },
    ]);
    expect(table.get('a')?.heal).toBe(5);
    expect(() => buildItemTable([{ id: 'a', name: 'A', kind: 'sword', uses: 1, price: 1, description: 'x' }])).toThrow(/unknown kind/);
    expect(() => buildItemTable([{ id: 'p', name: 'P', kind: 'promotion', uses: 1, price: 1, description: 'x' }])).toThrow(/promotes/);
    expect(() => buildItemTable([{ id: 'c', name: 'C', kind: 'consumable', uses: 1, price: 1, description: 'x', cures: ['gout'] }])).toThrow(/unknown status/);
  });
});
