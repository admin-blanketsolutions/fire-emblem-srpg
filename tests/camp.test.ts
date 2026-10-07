import { describe, expect, it } from 'vitest';
import { newArmy, type Army } from '../src/core/army';
import type { Action } from '../src/core/input';
import { shops, tables } from '../src/data';
import type { Assets } from '../src/engine/assets';
import type { TextRenderer } from '../src/engine/text';
import { CampScene } from '../src/scenes/campScene';
import { unit } from './support';

/**
 * The camp's rules live in core/army and are tested there; these tests walk the screen itself
 * with key presses, to show that every flow can be reached and does what it says.
 */

const press = (scene: CampScene, ...actions: Action[]): void => {
  for (const a of actions) scene.update(16, new Set<Action>([a]), []);
};

const modeOf = (scene: CampScene): { kind: string; [k: string]: unknown } => (scene as unknown as { mode: { kind: string } }).mode;

/** Choose the entry of the main menu that starts with a label. */
function entry(scene: CampScene, label: string): void {
  const items = (scene as unknown as { mainItems(): Array<{ label: string }> }).mainItems();
  const index = items.findIndex((i) => i.label.startsWith(label));
  if (index < 0) throw new Error(`no menu entry "${label}"`);
  modeOf(scene).index = index;
  press(scene, 'confirm');
}

function camp(army: Army, onContinue?: () => void): CampScene {
  return new CampScene({ army, tables, shops, assets: {} as Assets, text: { width: () => 1 } as unknown as TextRenderer, ...(onContinue ? { onContinue } : {}) });
}

const army = (): Army => {
  const lord = unit({ id: 'lord', class: 'young-lord', level: 3, inventory: ['iron-sabre', 'levy-spear'] });
  const captain = unit({ id: 'captain', class: 'soldier', level: 10, inventory: ['levy-spear', 'bandage', 'charter-of-iqta'] });
  const a = newArmy([lord, captain], 1000);
  a.convoy.push({ id: 'syrian-sabre', uses: 35 }, { id: 'bandage', uses: 3 });
  return a;
};

describe('the camp menu', () => {
  it('opens on the main menu and reaches the units, the convoy and each shop', () => {
    const scene = camp(army());
    expect(modeOf(scene)).toMatchObject({ kind: 'main', index: 0 });
    entry(scene, 'Preparations');
    expect(modeOf(scene)).toMatchObject({ kind: 'list', which: 'prepare' });
    press(scene, 'cancel');
    entry(scene, 'Units');
    expect(modeOf(scene).kind).toBe('units');
    press(scene, 'cancel');
    entry(scene, 'Convoy');
    expect(modeOf(scene).kind).toBe('convoy');
    press(scene, 'cancel');
    entry(scene, 'The Bazaar');
    expect(modeOf(scene)).toMatchObject({ kind: 'shop' });
    expect((modeOf(scene).shop as { id: string }).id).toBe('bazaar');
  });

  it('wraps around, and only offers the way on when it was given one', () => {
    const scene = camp(army());
    press(scene, 'up');
    expect(modeOf(scene).index).toBe(7); // preparations, units, convoy, two shops, talks, Maydan, Class
    let began = 0;
    const withExit = camp(army(), () => (began += 1));
    press(withExit, 'up', 'confirm');
    expect(began).toBe(1);
  });

  it('comes back to the entry it left', () => {
    const scene = camp(army());
    entry(scene, 'Convoy');
    press(scene, 'cancel');
    expect(modeOf(scene)).toMatchObject({ kind: 'main', index: 2 });
  });
});

describe('the units', () => {
  it('shows a unit and lets the player move between units and equip a weapon', () => {
    const a = army();
    const scene = camp(a);
    entry(scene, 'Units');
    press(scene, 'confirm');
    expect(modeOf(scene)).toMatchObject({ kind: 'unit', unit: 0 });
    press(scene, 'right');
    expect(modeOf(scene).unit).toBe(1);
    press(scene, 'right');
    expect(modeOf(scene).unit).toBe(0);
    press(scene, 'confirm'); // open the pack, on the weapon in hand
    expect(modeOf(scene)).toMatchObject({ kind: 'unit', pack: true, slot: 0 });
    press(scene, 'down', 'confirm');
    const lord = a.units[0]!;
    expect(lord.inventory[lord.equipped]?.id).toBe('levy-spear');
    press(scene, 'cancel');
    expect(modeOf(scene).pack).toBe(false);
    press(scene, 'cancel');
    expect(modeOf(scene)).toMatchObject({ kind: 'units', index: 0 });
  });

  it('says why a weapon cannot be wielded', () => {
    const a = army();
    a.units[0]!.inventory.push({ id: 'cavalry-lance', uses: 30 });
    const scene = camp(a);
    entry(scene, 'Units');
    press(scene, 'confirm', 'confirm');
    modeOf(scene).slot = 2;
    press(scene, 'confirm');
    expect(modeOf(scene).note).toMatch(/grade/i);
  });

  it('promotes by item, shows the promotion, and goes back to the unit', () => {
    const a = army();
    const scene = camp(a);
    entry(scene, 'Units');
    press(scene, 'down', 'confirm', 'confirm');
    const captain = a.units[1]!;
    modeOf(scene).slot = 2;
    press(scene, 'confirm');
    expect(modeOf(scene).kind).toBe('promotion');
    expect(captain.classId).toBe('man-at-arms');
    expect(captain.level).toBe(1);
    expect(captain.inventory.map((i) => i.id)).toEqual(['levy-spear', 'bandage']);
    press(scene, 'confirm');
    expect(modeOf(scene)).toMatchObject({ kind: 'unit', pack: true });
    expect(modeOf(scene).slot).toBeLessThan(2);
  });

  it('explains an item that would do nothing', () => {
    const a = army();
    const scene = camp(a);
    entry(scene, 'Units');
    press(scene, 'down', 'confirm', 'confirm');
    modeOf(scene).slot = 1;
    press(scene, 'confirm'); // a bandage for someone with full HP
    expect(modeOf(scene).note).toMatch(/nothing/i);
    expect(a.units[1]!.inventory.map((i) => i.id)).toContain('bandage');
  });
});

describe('the convoy', () => {
  const open = (a: Army): CampScene => {
    const scene = camp(a);
    entry(scene, 'Convoy');
    return scene;
  };

  it('stores a stack from the pack and takes one back', () => {
    const a = army();
    const scene = open(a);
    expect(modeOf(scene)).toMatchObject({ kind: 'convoy', col: 0, row: 0 });
    press(scene, 'down', 'confirm'); // the second thing the lord carries: the levy spear
    expect(a.units[0]!.inventory.map((i) => i.id)).toEqual(['iron-sabre']);
    expect(a.convoy.map((i) => i.id)).toEqual(['syrian-sabre', 'bandage', 'levy-spear']);
    press(scene, 'right');
    expect(modeOf(scene)).toMatchObject({ col: 1, row: 0 });
    press(scene, 'confirm'); // take the syrian sabre
    expect(a.units[0]!.inventory.map((i) => i.id)).toEqual(['iron-sabre', 'syrian-sabre']);
    expect(a.convoy.map((i) => i.id)).toEqual(['bandage', 'levy-spear']);
  });

  it('refuses when the pack is full and says so', () => {
    const a = army();
    a.units[0]!.inventory = Array.from({ length: 5 }, () => ({ id: 'knife', uses: 5 }));
    const scene = open(a);
    press(scene, 'right', 'confirm');
    expect(modeOf(scene).note).toMatch(/cannot carry/);
    expect(a.convoy).toHaveLength(2);
  });

  it('moves on to the next unit', () => {
    const scene = open(army());
    press(scene, 'info');
    expect(modeOf(scene).unit).toBe(1);
  });

  it('keeps the highlight on a stack that is still there', () => {
    const a = army();
    const scene = open(a);
    press(scene, 'right', 'down', 'confirm'); // take the bandage, the last in the convoy
    expect(modeOf(scene).row).toBe(0);
    press(scene, 'confirm');
    press(scene, 'confirm'); // the convoy is empty now: nothing to take, and no crash
    expect(a.convoy).toEqual([]);
  });
});

describe('the shops', () => {
  const open = (a: Army, shop = 'The Bazaar'): CampScene => {
    const scene = camp(a);
    entry(scene, shop);
    return scene;
  };

  it('buys into the buyer’s pack and charges the price', () => {
    const a = army();
    const scene = open(a);
    press(scene, 'down', 'down', 'confirm'); // an iron sabre at 320
    expect(a.dinars).toBe(680);
    expect(a.units[0]!.inventory.map((i) => i.id)).toEqual(['iron-sabre', 'levy-spear', 'iron-sabre']);
    expect(modeOf(scene).note).toMatch(/Bought Iron Sabre for 320/);
  });

  it('goes to the convoy when the pack is full, and refuses when the purse is empty', () => {
    const a = army();
    a.units[0]!.inventory = Array.from({ length: 5 }, () => ({ id: 'knife', uses: 5 }));
    const scene = open(a);
    press(scene, 'confirm');
    expect(a.convoy.at(-1)?.id).toBe('levy-spear');
    a.dinars = 10;
    press(scene, 'confirm');
    expect(modeOf(scene).note).toMatch(/Not enough/);
    expect(a.dinars).toBe(10);
  });

  it('changes the buyer', () => {
    const a = army();
    const scene = open(a);
    press(scene, 'info', 'confirm');
    expect(a.units[1]!.inventory.map((i) => i.id)).toContain('levy-spear');
    expect(a.units[1]!.inventory).toHaveLength(4);
  });

  it('sells from the buyer’s pack and the convoy for half, in proportion to what is left', () => {
    const a = army();
    const scene = open(a);
    press(scene, 'right');
    expect(modeOf(scene)).toMatchObject({ tab: 'sell', index: 0 });
    press(scene, 'confirm'); // the lord's iron sabre, fresh: half of 320
    expect(a.dinars).toBe(1160);
    expect(a.units[0]!.inventory.map((i) => i.id)).toEqual(['levy-spear']);
    expect(modeOf(scene).note).toMatch(/Sold Iron Sabre for 160/);
    // the convoy comes after the pack: the syrian sabre has 35 of its uses left
    press(scene, 'down', 'confirm');
    expect(a.convoy.map((i) => i.id)).toEqual(['bandage']);
    expect(a.dinars).toBeGreaterThan(1160);
  });

  it('will not buy what has no price', () => {
    const a = army();
    a.units[0]!.inventory.push({ id: 'gate-key', uses: 1 });
    const scene = open(a);
    press(scene, 'right');
    modeOf(scene).index = 2;
    press(scene, 'confirm');
    expect(modeOf(scene).note).toMatch(/cannot be sold/);
    expect(a.units[0]!.inventory.map((i) => i.id)).toContain('gate-key');
  });

  it('goes back to the entry it was opened from', () => {
    const scene = open(army(), 'The Armoury');
    expect((modeOf(scene).shop as { id: string }).id).toBe('armoury');
    press(scene, 'cancel');
    expect(modeOf(scene)).toMatchObject({ kind: 'main', index: 4 });
  });
});
