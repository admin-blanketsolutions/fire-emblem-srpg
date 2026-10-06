import { describe, expect, it } from 'vitest';
import { checkObjective, describeObjective, newProgress, validateObjective, type ObjectiveDef, type ObjectiveView } from '../src/core/objectives';
import type { UnitInstance } from '../src/core/unit';
import { unit } from './support';

const tagged = (u: UnitInstance, ...tags: string[]): UnitInstance => {
  u.tags = tags;
  return u;
};
const view = (units: UnitInstance[], turn = 1, phase: ObjectiveView['phase'] = 'player', reinforcements = false): ObjectiveView => ({
  units,
  turn,
  phase,
  hasFutureReinforcements: () => reinforcements,
});
const lord = () => tagged(unit({ id: 'lord' }), 'lord');
const foe = (id = 'foe', x = 5, y = 0) => unit({ id, side: 'enemy', x, y });
const check = (def: ObjectiveDef, v: ObjectiveView, checkpoint: 'action' | 'phaseEnd' | 'turnEnd' = 'action', progress = newProgress()) =>
  checkObjective(v, def, progress, checkpoint)?.result ?? null;

describe('Rout', () => {
  const rout: ObjectiveDef = { type: 'rout' };
  it('is won when no enemy remains, and not before', () => {
    const f = foe();
    expect(check(rout, view([lord(), f]))).toBeNull();
    f.retreated = true;
    expect(check(rout, view([lord(), f]))).toBe('won');
  });
  it('waits for reinforcements and ignores tagged enemies', () => {
    expect(check(rout, view([lord()], 1, 'player', true))).toBeNull();
    const optional = tagged(foe(), 'optional');
    expect(check({ type: 'rout', ignoreTags: ['optional'] }, view([lord(), optional]))).toBe('won');
  });
  it('is lost the moment the Lord retreats, even if the enemy is also gone', () => {
    const l = lord();
    l.retreated = true;
    expect(check(rout, view([l]))).toBe('lost');
  });
});

describe('Seize, Survive and Defend', () => {
  it('Seize is won when the position is seized', () => {
    const progress = newProgress();
    const def: ObjectiveDef = { type: 'seize', tiles: [[8, 0]] };
    expect(check(def, view([lord(), foe()]), 'action', progress)).toBeNull();
    progress.seized = true;
    expect(check(def, view([lord(), foe()]), 'action', progress)).toBe('won');
  });
  it('Survive is won only at the end of the final turn', () => {
    const def: ObjectiveDef = { type: 'survive', turns: 5 };
    expect(check(def, view([lord(), foe()], 5), 'action')).toBeNull();
    expect(check(def, view([lord(), foe()], 4), 'turnEnd')).toBeNull();
    expect(check(def, view([lord(), foe()], 5), 'turnEnd')).toBe('won');
  });
  it('Defend is lost when the defended unit falls and won when the turns are up', () => {
    const keep = unit({ id: 'keep' });
    const def: ObjectiveDef = { type: 'defend', turns: 3, anchor: 'keep' };
    expect(check(def, view([lord(), keep], 3), 'turnEnd')).toBe('won');
    expect(check(def, view([lord(), keep], 2), 'turnEnd')).toBeNull();
    keep.retreated = true;
    expect(check(def, view([lord(), keep], 2))).toBe('lost');
  });
  it('Defend is lost when the enemy stands on the defended tile at the end of its phase', () => {
    const def: ObjectiveDef = { type: 'defend', turns: 4, anchor: [5, 0] };
    expect(check(def, view([lord(), foe()], 2, 'enemy'), 'phaseEnd')).toBe('lost');
    expect(check(def, view([lord(), foe('far', 7)], 2, 'enemy'), 'phaseEnd')).toBeNull();
  });
});

describe('Hold the Pass', () => {
  it('is lost when more enemies than the limit reach an anchor', () => {
    const def: ObjectiveDef = { type: 'hold-the-pass', anchors: [[2, 0]], leakLimit: 1, turns: 8 };
    const progress = newProgress();
    expect(check(def, view([lord(), foe('a', 2)]), 'action', progress)).toBeNull(); // one crossing is allowed
    expect(check(def, view([lord(), foe('a', 2), foe('b', 2)]), 'action', progress)).toBe('lost');
  });
  it('is lost when the enemy holds enough anchors at the end of its phase', () => {
    const def: ObjectiveDef = { type: 'hold-the-pass', anchors: [[2, 0], [3, 0]], holdLimit: 2 };
    const both = view([lord(), foe('a', 2), foe('b', 3)], 3, 'enemy');
    expect(check(def, both, 'action')).toBeNull();
    expect(check(def, both, 'phaseEnd')).toBe('lost');
  });
  it('is won at the end of the final turn, or when no enemy is left', () => {
    const def: ObjectiveDef = { type: 'hold-the-pass', anchors: [[2, 0]], turns: 4 };
    expect(check(def, view([lord(), foe()], 4), 'turnEnd')).toBe('won');
    expect(check(def, view([lord(), foe()], 3), 'turnEnd')).toBeNull();
    const f = foe();
    f.retreated = true;
    expect(check(def, view([lord(), f], 2))).toBe('won');
  });
});

describe('Escort and Persuade', () => {
  it('Escort is won when the escort leaves by an exit and lost if it falls', () => {
    const def: ObjectiveDef = { type: 'escort', unit: 'vip', exit: [[8, 0]] };
    const vip = unit({ id: 'vip' });
    const progress = newProgress();
    expect(check(def, view([lord(), vip]), 'action', progress)).toBeNull();
    vip.retreated = true;
    vip.escaped = true;
    progress.escaped.add('vip');
    expect(check(def, view([lord(), vip]), 'action', progress)).toBe('won');
    const fallen = unit({ id: 'vip' });
    fallen.retreated = true;
    expect(check(def, view([lord(), fallen]))).toBe('lost');
  });
  it('Persuade is won when every target is recruited and lost when the turns run out', () => {
    const def: ObjectiveDef = { type: 'persuade', targets: ['mira'], turns: 3 };
    const mira = unit({ id: 'mira', side: 'enemy' });
    const progress = newProgress();
    expect(check(def, view([lord(), mira], 2), 'turnEnd', progress)).toBeNull();
    expect(check(def, view([lord(), mira], 3), 'turnEnd', progress)).toBe('lost');
    progress.recruited.add('mira');
    expect(check(def, view([lord(), mira], 3), 'turnEnd', progress)).toBe('won');
  });
});

describe('objective data', () => {
  it('describes each objective in a line', () => {
    expect(describeObjective({ type: 'survive', turns: 5 })).toMatch(/5/);
    expect(describeObjective({ type: 'rout' })).toMatch(/Defeat/);
  });
  it('validates objective data', () => {
    expect(validateObjective(undefined, 5, 5, 'm')).toBeNull();
    expect(validateObjective({ type: 'rout' }, 5, 5, 'm')).toEqual({ type: 'rout' });
    expect(() => validateObjective({ type: 'tea' }, 5, 5, 'm')).toThrow(/unknown objective type/);
    expect(() => validateObjective({ type: 'seize', tiles: [[9, 9]] }, 5, 5, 'm')).toThrow(/in-bounds/);
    expect(() => validateObjective({ type: 'survive', turns: 0 }, 5, 5, 'm')).toThrow(/turns/);
    expect(() => validateObjective({ type: 'hold-the-pass', anchors: [[1, 1]] }, 5, 5, 'm')).toThrow(/needs turns/);
  });
});
