import { describe, expect, it } from 'vitest';
import { newArmy, type Army } from '../src/core/army';
import type { Action } from '../src/core/input';
import { SupportTracker } from '../src/core/supports';
import { shops, tables } from '../src/data';
import { demoStory, type Story } from '../src/data/story';
import type { Assets } from '../src/engine/assets';
import type { TextRenderer } from '../src/engine/text';
import { CampScene } from '../src/scenes/campScene';
import { unit } from './support';

/** The Majlis screens of the camp, walked with key presses: the talks, the Maydan, the Class screen, the roll and the choice of who deploys. */

const press = (scene: CampScene, ...actions: Action[]): void => {
  for (const a of actions) scene.update(16, new Set<Action>([a]), []);
};
const modeOf = (scene: CampScene): { kind: string; [k: string]: unknown } => (scene as unknown as { mode: { kind: string } }).mode;
const labels = (scene: CampScene): string[] => (scene as unknown as { mainItems(): Array<{ label: string }> }).mainItems().map((i) => i.label);

function entry(scene: CampScene, label: string): void {
  const index = labels(scene).findIndex((l) => l.startsWith(label));
  if (index < 0) throw new Error(`no menu entry "${label}"`);
  modeOf(scene).index = index;
  press(scene, 'confirm');
}

const text = { width: () => 1, wrap: (t: string) => [t] } as unknown as TextRenderer;
const assets = { has: () => false } as unknown as Assets;

function camp(army: Army, extra: { story?: Story; flags?: Set<string>; unlocked?: string[] } = {}): CampScene {
  return new CampScene({
    army,
    tables,
    shops,
    assets,
    text,
    story: extra.story ?? demoStory,
    chapter: 'CH-01',
    chapterOrder: ['CH-00', 'CH-01'],
    flags: extra.flags ?? new Set(),
    onUnlock: (id) => extra.unlocked?.push(id),
  });
}

const army = (): Army => {
  const lord = unit({ id: 'lord', class: 'young-lord', tags: ['lord'], level: 3 });
  const pike = unit({ id: 'pikeman', class: 'pikeman', inventory: ['levy-spear'] });
  return newArmy([lord, pike], 500, { supports: new SupportTracker(demoStory.supports) });
};

/** Press Confirm until the scene being played is over. */
function watch(scene: CampScene): void {
  for (let i = 0; i < 80 && modeOf(scene).kind === 'scene'; i++) press(scene, 'confirm');
}

describe('the Majlis talks', () => {
  it('says how many talks are waiting, and shows none when no pair has the points', () => {
    const a = army();
    const scene = camp(a);
    expect(labels(scene).find((l) => l.startsWith('Majlis'))).toBe('Majlis talks');
    entry(scene, 'Majlis talks');
    expect(modeOf(scene)).toMatchObject({ kind: 'list', which: 'talks' });
    press(scene, 'confirm'); // nothing to hear
    expect(modeOf(scene).kind).toBe('list');
    a.supports!.stateOf('demo-lord-pikeman').points = 25;
    expect(labels(camp(a)).find((l) => l.startsWith('Majlis'))).toBe('Majlis talks  (1)');
  });

  it('plays the scene, then the rank takes effect and the talk is spent', () => {
    const a = army();
    a.supports!.stateOf('demo-lord-pikeman').points = 25;
    const scene = camp(a);
    entry(scene, 'Majlis talks');
    expect(scene).toBeDefined();
    press(scene, 'confirm');
    expect(modeOf(scene).kind).toBe('scene');
    expect(a.supports!.rankOf('demo-lord-pikeman')).toBeNull(); // not until it has been seen
    watch(scene);
    expect(modeOf(scene)).toMatchObject({ kind: 'list', which: 'talks', note: 'lord and pikeman: rank C' });
    expect(a.supports!.rankOf('demo-lord-pikeman')).toBe('C');
    expect(a.camp.talks).toBe(1);
    press(scene, 'confirm'); // nothing more to hear until the next rank
    expect(modeOf(scene).kind).toBe('list');
  });

  it('a scene’s flags reach the campaign, and skipping still raises them', () => {
    const a = army();
    const s = a.supports!.stateOf('demo-lord-pikeman');
    s.points = 70;
    s.viewed.push('C');
    const flags = new Set<string>();
    const scene = camp(a, { flags });
    entry(scene, 'Majlis talks');
    press(scene, 'confirm');
    press(scene, 'menu'); // skip the scene
    expect(flags.has('demo-support-b')).toBe(true);
    expect(modeOf(scene)).toMatchObject({ kind: 'list' });
    expect(a.supports!.rankOf('demo-lord-pikeman')).toBe('B');
  });

  it('says so when the scene has not been written', () => {
    const a = army();
    a.supports!.stateOf('demo-lord-pikeman').points = 25;
    const scene = camp(a, { story: { ...demoStory, scenes: new Map() } });
    entry(scene, 'Majlis talks');
    press(scene, 'confirm');
    expect(modeOf(scene).note).toMatch(/not been written/);
    expect(a.supports!.rankOf('demo-lord-pikeman')).toBeNull();
    expect(a.camp.talks).toBe(0);
  });

  it('goes back to its own entry', () => {
    const scene = camp(army());
    entry(scene, 'Majlis talks');
    press(scene, 'cancel');
    expect(labels(scene)[modeOf(scene).index as number]).toBe('Majlis talks');
  });
});

describe('the Maydan', () => {
  it('drills a unit once, and shows who has drilled', () => {
    const a = army();
    const scene = camp(a);
    entry(scene, 'Maydan');
    press(scene, 'down', 'confirm');
    expect(modeOf(scene).note).toMatch(/pikeman: Spear \+4/);
    const rows = (scene as unknown as { listRows(w: string): Array<{ right?: string }> }).listRows('maydan');
    expect(rows.map((r) => r.right)).toEqual(['Sabre', 'drilled']);
    press(scene, 'confirm');
    expect(modeOf(scene).note).toMatch(/has drilled today/);
    expect(a.units[1]!.wexp.spear).toBeGreaterThanOrEqual(4);
  });

  it('announces a grade earned', () => {
    const a = army();
    a.units[1]!.wexp.spear = 14;
    const scene = camp(a);
    entry(scene, 'Maydan');
    press(scene, 'down', 'confirm');
    expect(modeOf(scene).note).toMatch(/grade II!/);
  });
});

describe('the Class screen', () => {
  it('lists those ready for promotion, promotes with the item, and returns to the list', () => {
    const a = army();
    const captain = unit({ id: 'captain', class: 'soldier', level: 10 });
    a.units.push(captain);
    a.convoy.push({ id: 'charter-of-iqta', uses: 1 });
    const scene = camp(a);
    expect(labels(scene).find((l) => l.startsWith('Class'))).toBe('Class  (1)');
    entry(scene, 'Class');
    press(scene, 'confirm');
    expect(modeOf(scene).kind).toBe('promotion');
    expect(captain.classId).toBe('man-at-arms');
    press(scene, 'confirm');
    expect(modeOf(scene)).toMatchObject({ kind: 'list', which: 'class' });
    expect(labels(scene).find((l) => l.startsWith('Class'))).toBe('Class');
  });

  it('explains why a unit cannot be promoted when none can', () => {
    const scene = camp(army());
    entry(scene, 'Class');
    press(scene, 'confirm');
    expect(modeOf(scene).kind).toBe('list');
  });
});

describe('the casualty roll', () => {
  it('appears only once someone has left the army, and lists them with the chapter', () => {
    const a = army();
    expect(labels(camp(a)).some((l) => l.startsWith('Casualty'))).toBe(false);
    const lost = unit({ id: 'lost', class: 'soldier' });
    a.fallen.push(lost);
    a.fallenIn.set('lost', 'CH-01');
    const scene = camp(a);
    expect(labels(scene).some((l) => l.startsWith('Casualty'))).toBe(true);
    entry(scene, 'Casualty roll');
    const rows = (scene as unknown as { listRows(w: string): Array<{ label: string; right?: string }> }).listRows('roll');
    expect(rows).toEqual([{ label: 'lost', right: 'lost in CH-01', dim: true }]);
    press(scene, 'cancel');
    expect(modeOf(scene).kind).toBe('main');
  });
});

describe('the Preparations', () => {
  it('lets the player release and choose units, within the room the map has, and never the Lord', () => {
    const a = army();
    a.units.push(unit({ id: 'third' }));
    a.deployed = new Set(a.units.map((u) => u.id));
    a.deployLimit = 2;
    a.deployed.delete('third');
    const scene = camp(a);
    entry(scene, 'Preparations');
    press(scene, 'confirm'); // the Lord
    expect(modeOf(scene).note).toMatch(/must go/);
    press(scene, 'down', 'confirm'); // release the pikeman
    expect(a.deployed.has('pikeman')).toBe(false);
    press(scene, 'down', 'confirm'); // choose the third
    expect(a.deployed.has('third')).toBe(true);
    press(scene, 'up', 'confirm'); // the pikeman again: the map is full
    expect(modeOf(scene).note).toMatch(/room for only 2/);
    expect(a.deployed.has('pikeman')).toBe(false);
  });
});
