import { describe, expect, it } from 'vitest';
import { buy, CONVOY_SLOTS, newArmy, sell, settleChapter, store, withdraw } from '../src/core/army';
import { sellValue } from '../src/core/inventory';
import { buildShopTable } from '../src/core/shop';
import { items, shops, tables, weapons } from '../src/data';
import { battleOf, openMap, unit } from './support';

const env = tables;
const bazaar = shops.get('bazaar')!;

describe('the convoy', () => {
  it('takes a stack out of a pack and gives it back', () => {
    const u = unit({ inventory: ['iron-sabre', 'bandage'] });
    const army = newArmy([u]);
    expect(store(army, u, 1, env)).toEqual({ ok: true });
    expect(u.inventory.map((i) => i.id)).toEqual(['iron-sabre']);
    expect(army.convoy.map((i) => i.id)).toEqual(['bandage']);
    expect(withdraw(army, u, 0, env)).toEqual({ ok: true });
    expect(u.inventory.map((i) => i.id)).toEqual(['iron-sabre', 'bandage']);
    expect(army.convoy).toEqual([]);
  });

  it('keeps the stack’s remaining uses', () => {
    const u = unit({ inventory: ['iron-sabre'] });
    u.inventory[0]!.uses = 7;
    const army = newArmy([u]);
    store(army, u, 0, env);
    expect(army.convoy[0]?.uses).toBe(7);
  });

  it('keeps a unit armed: storing the equipped weapon equips the next, and storing another keeps the first', () => {
    const u = unit({ class: 'young-lord', inventory: ['iron-sabre', 'levy-spear'] });
    expect(u.inventory[u.equipped]?.id).toBe('iron-sabre');
    const army = newArmy([u]);
    store(army, u, 1, env);
    expect(u.inventory[u.equipped]?.id).toBe('iron-sabre');
    store(army, u, 0, env);
    expect(u.equipped).toBe(-1);
    withdraw(army, u, 0, env);
    expect(u.inventory[u.equipped]?.id).toBeDefined();
  });

  it('refuses when there is nothing to store or withdraw, a full pack, or a full convoy', () => {
    const u = unit({ inventory: ['iron-sabre'] });
    const army = newArmy([u]);
    expect(store(army, u, 4, env)).toMatchObject({ ok: false });
    expect(withdraw(army, u, 0, env)).toMatchObject({ ok: false });
    army.convoy.push({ id: 'bandage', uses: 3 });
    u.inventory = Array.from({ length: 5 }, () => ({ id: 'knife', uses: 5 }));
    expect(withdraw(army, u, 0, env)).toMatchObject({ ok: false, reason: expect.stringMatching(/cannot carry/) });
    army.convoy = Array.from({ length: CONVOY_SLOTS }, () => ({ id: 'bandage', uses: 3 }));
    expect(store(army, u, 0, env)).toMatchObject({ ok: false, reason: expect.stringMatching(/full/) });
    expect(army.convoy).toHaveLength(CONVOY_SLOTS);
  });
});

describe('buying', () => {
  it('takes the price in dinars and puts the goods in the named unit’s pack', () => {
    const u = unit({ inventory: ['iron-sabre'] });
    const army = newArmy([u], 1000);
    const price = weapons.get('levy-spear')!.price;
    expect(buy(army, bazaar, 'levy-spear', u, env)).toEqual({ ok: true });
    expect(army.dinars).toBe(1000 - price);
    expect(u.inventory.map((i) => i.id)).toEqual(['iron-sabre', 'levy-spear']);
    expect(u.inventory[1]?.uses).toBe(weapons.get('levy-spear')!.uses);
  });

  it('sends the goods to the convoy when no unit is named or the pack is full', () => {
    const u = unit({ inventory: ['iron-sabre'] });
    u.inventory = Array.from({ length: 5 }, () => ({ id: 'knife', uses: 5 }));
    const army = newArmy([u], 1000);
    buy(army, bazaar, 'bandage', null, env);
    buy(army, bazaar, 'bandage', u, env);
    expect(army.convoy.map((i) => i.id)).toEqual(['bandage', 'bandage']);
    expect(army.convoy[0]?.uses).toBe(items.get('bandage')!.uses);
  });

  it('refuses without the money, what the shop does not stock, and when there is nowhere to put it', () => {
    const army = newArmy([], 10);
    expect(buy(army, bazaar, 'levy-spear', null, env)).toEqual({ ok: false, reason: 'Not enough dinars.' });
    army.dinars = 99999;
    expect(buy(army, bazaar, 'halberd', null, env)).toMatchObject({ ok: false, reason: expect.stringMatching(/does not sell/) });
    expect(buy(army, bazaar, 'charter-of-iqta', null, env)).toMatchObject({ ok: false });
    army.convoy = Array.from({ length: CONVOY_SLOTS }, () => ({ id: 'bandage', uses: 3 }));
    expect(buy(army, bazaar, 'bandage', null, env)).toMatchObject({ ok: false, reason: expect.stringMatching(/nowhere/) });
    expect(army.dinars).toBe(99999); // nothing was taken
  });

  it('is never cheaper to buy and sell back: selling fetches half', () => {
    const u = unit({ inventory: [] });
    const army = newArmy([u], 1000);
    buy(army, bazaar, 'iron-sabre', u, env);
    const spent = 1000 - army.dinars;
    expect(sell(army, { unit: u, slot: 0 }, env)).toEqual({ ok: true });
    expect(army.dinars - (1000 - spent)).toBe(Math.floor(spent / 2));
    expect(u.inventory).toEqual([]);
  });
});

describe('selling', () => {
  it('pays in proportion to the uses left', () => {
    expect(sellValue({ id: 'iron-sabre', uses: 40 }, env)).toBe(Math.floor(weapons.get('iron-sabre')!.price / 2));
    expect(sellValue({ id: 'iron-sabre', uses: 20 }, env)).toBe(Math.floor(weapons.get('iron-sabre')!.price / 4));
    expect(sellValue({ id: 'iron-sabre', uses: 0 }, env)).toBe(0);
  });

  it('sells from the convoy too, and will not sell what has no price', () => {
    const army = newArmy([], 0);
    army.convoy.push({ id: 'bandage', uses: 3 }, { id: 'gate-key', uses: 1 });
    expect(sell(army, { convoyIndex: 1 }, env)).toMatchObject({ ok: false, reason: expect.stringMatching(/cannot be sold/) });
    expect(sell(army, { convoyIndex: 0 }, env)).toEqual({ ok: true });
    expect(army.dinars).toBe(75);
    expect(army.convoy.map((i) => i.id)).toEqual(['gate-key']);
    expect(sell(army, { convoyIndex: 5 }, env)).toMatchObject({ ok: false });
  });
});

describe('the shops', () => {
  it('sell only things that exist and have a price', () => {
    expect(shops.size).toBeGreaterThanOrEqual(2);
    for (const shop of shops.values()) for (const id of shop.stock) expect(weapons.has(id) || items.has(id), id).toBe(true);
  });

  it('keep the rare promotion items out of the ordinary stock', () => {
    for (const shop of shops.values()) {
      expect(shop.stock).not.toContain('charter-of-iqta');
      expect(shop.stock).not.toContain('diploma-of-investiture');
    }
  });

  it('are validated', () => {
    expect(() => buildShopTable([{ id: 's', name: 'S', stock: ['dragon-egg'] }], env)).toThrow(/unknown item/);
    expect(() => buildShopTable([{ id: 's', name: 'S', stock: ['gate-key'] }], env)).toThrow(/no price/);
    expect(() => buildShopTable([{ id: 's', name: 'S', stock: [] }], env)).toThrow(/needs stock/);
  });
});

describe('settling a chapter', () => {
  const setup = () => {
    const lord = unit({ id: 'lord', tags: ['lord'] });
    const pawn = unit({ id: 'pawn', x: 1 });
    const hero = unit({ id: 'hero', x: 2 });
    (hero as { chronicled: boolean }).chronicled = true;
    const runner = unit({ id: 'runner', x: 3 });
    const army = newArmy([lord, pawn, hero, runner], 100);
    const battle = battleOf([lord, pawn, hero, runner, unit({ id: 'foe', side: 'enemy', x: 5 })], openMap(8, 1));
    return { army, battle, lord, pawn, hero, runner };
  };

  it('Classic: an ordinary unit that retreated wounded is lost, a chronicled one returns', () => {
    const { army, battle, pawn, hero } = setup();
    pawn.retreated = true;
    hero.retreated = true;
    const result = settleChapter(army, battle, 'classic');
    expect(result.lost).toEqual([pawn]);
    expect(army.units.map((u) => u.id)).toEqual(['lord', 'hero', 'runner']);
    expect(army.fallen).toEqual([pawn]);
    expect(hero.retreated).toBe(false);
  });

  it('Casual: everyone returns', () => {
    const { army, battle, pawn, hero } = setup();
    pawn.retreated = true;
    hero.retreated = true;
    expect(settleChapter(army, battle, 'casual').lost).toEqual([]);
    expect(army.units).toHaveLength(4);
  });

  it('a unit that left by an exit is not lost', () => {
    const { army, battle, runner } = setup();
    runner.retreated = true;
    runner.escaped = true;
    expect(settleChapter(army, battle, 'classic').lost).toEqual([]);
    expect(runner.escaped).toBe(false); // and is back on the books
  });

  it('heals everyone, clears conditions and readies them for the next chapter', () => {
    const { army, battle, pawn } = setup();
    pawn.hp = 1;
    battle.addStatus(pawn, 'sunder', 3);
    pawn.acted = true;
    pawn.travelled = 4;
    pawn.turnFlags = ['pursuit'];
    settleChapter(army, battle, 'classic');
    expect(pawn).toMatchObject({ hp: pawn.stats.hp, statuses: [], acted: false, travelled: 0, turnFlags: [] });
  });

  it('adds the ransom to the dinars, and recruits to the roster', () => {
    const { army, battle } = setup();
    const foe = battle.units.find((u) => u.id === 'foe')!;
    foe.side = 'player'; // won over by a Talk event
    battle.ransom = 60;
    const result = settleChapter(army, battle, 'classic');
    expect(army.dinars).toBe(160);
    expect(result.ransom).toBe(60);
    expect(result.joined).toEqual([foe]);
    expect(army.units).toContain(foe);
    expect(settleChapter(army, battle, 'classic').joined).toEqual([]); // not added twice
  });

  it('does not enlist structures', () => {
    const { army, battle } = setup();
    const gate = unit({ id: 'gate', x: 6 });
    (gate as { kind: 'unit' | 'structure' }).kind = 'structure';
    battle.units.push(gate);
    expect(settleChapter(army, battle, 'classic').joined).toEqual([]);
  });
});
