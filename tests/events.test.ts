import { describe, expect, it } from 'vitest';
import { EventRunner, validateEvents, type EventDef, type EventView } from '../src/core/events';
import { unit } from './support';

const view = (units: ReturnType<typeof unit>[], flags: string[] = []): EventView => ({ units, flags: new Set(flags) });

describe('the event runner', () => {
  const warning: EventDef = { id: 'warn', when: { type: 'turnStart', turn: 2, phase: 'enemy' }, then: [{ type: 'message', text: 'Riders!' }] };

  it('fires an event when its trigger arrives, and only once', () => {
    const runner = new EventRunner([warning]);
    const v = view([]);
    expect(runner.run({ type: 'turnStart', turn: 1, phase: 'enemy' }, v)).toEqual([]);
    expect(runner.run({ type: 'turnStart', turn: 2, phase: 'player' }, v)).toEqual([]);
    expect(runner.run({ type: 'turnStart', turn: 2, phase: 'enemy' }, v)).toEqual(warning.then);
    expect(runner.run({ type: 'turnStart', turn: 2, phase: 'enemy' }, v)).toEqual([]);
  });

  it('repeats an event marked once: false', () => {
    const runner = new EventRunner([{ ...warning, once: false }]);
    const t = { type: 'turnStart', turn: 2, phase: 'enemy' } as const;
    expect(runner.run(t, view([]))).toHaveLength(1);
    expect(runner.run(t, view([]))).toHaveLength(1);
  });

  it('matches a talk in either order, by id or by tag, and then stops listing it', () => {
    const lord = unit({ id: 'lord' });
    lord.tags = ['lord'];
    const mira = unit({ id: 'mira', side: 'enemy' });
    const talk: EventDef = { id: 'persuade', when: { type: 'talk', a: 'lord', b: 'mira' }, then: [{ type: 'recruit', unit: 'mira' }] };
    const runner = new EventRunner([talk]);
    expect(runner.pendingTalks()).toEqual([{ id: 'persuade', a: 'lord', b: 'mira' }]);
    expect(runner.run({ type: 'talk', a: mira, b: lord }, view([lord, mira]))).toHaveLength(1);
    expect(runner.pendingTalks()).toEqual([]);
  });

  it('checks defeats, HP and flags against the battle, not just the trigger', () => {
    const g1 = unit({ id: 'g1', side: 'enemy' });
    const g2 = unit({ id: 'g2', side: 'enemy' });
    g1.tags = ['guards'];
    g2.tags = ['guards'];
    const runner = new EventRunner([
      { id: 'cleared', when: { type: 'allDefeated', tag: 'guards' }, then: [{ type: 'flag', name: 'open' }] },
      { id: 'hurt', when: { type: 'hpBelow', unit: 'g2', fraction: 0.5 }, then: [{ type: 'message', text: 'Hurt' }] },
      { id: 'gate', when: { all: [{ type: 'flag', name: 'open' }, { type: 'unitDefeated', unit: 'g1' }] }, then: [{ type: 'endChapter', result: 'won' }] },
    ]);
    const v = view([g1, g2]);
    expect(runner.run({ type: 'update' }, v)).toEqual([]);
    g2.hp = 2;
    expect(runner.run({ type: 'update' }, v)).toEqual([{ type: 'message', text: 'Hurt' }]);
    g1.retreated = true;
    g2.retreated = true;
    expect(runner.run({ type: 'update' }, view([g1, g2]))).toEqual([{ type: 'flag', name: 'open' }]);
    expect(runner.run({ type: 'update' }, view([g1, g2], ['open']))).toEqual([{ type: 'endChapter', result: 'won' }]);
  });

  it('does not treat an empty tag as defeated', () => {
    const runner = new EventRunner([{ id: 'x', when: { type: 'allDefeated', tag: 'nobody' }, then: [{ type: 'flag', name: 'x' }] }]);
    expect(runner.run({ type: 'update' }, view([unit()]))).toEqual([]);
  });

  it('lists visits still to come', () => {
    const runner = new EventRunner([{ id: 'v', when: { type: 'visit', tile: [2, 1] }, then: [{ type: 'message', text: 'Welcome' }] }]);
    expect(runner.pendingVisits()).toEqual([[2, 1]]);
  });
});

describe('validating events', () => {
  const base = { id: 'a', when: { type: 'turnStart', turn: 1 }, then: [{ type: 'flag', name: 'x' }] };

  it('accepts good data and treats a missing list as empty', () => {
    expect(validateEvents([base], 5, 5, 'm')).toHaveLength(1);
    expect(validateEvents(undefined, 5, 5, 'm')).toEqual([]);
  });

  it('rejects bad data with a message naming the event', () => {
    expect(() => validateEvents([{ ...base, then: [] }], 5, 5, 'm')).toThrow(/non-empty/);
    expect(() => validateEvents([base, base], 5, 5, 'm')).toThrow(/duplicate/);
    expect(() => validateEvents([{ id: 'b', when: { type: 'teleport' }, then: base.then }], 5, 5, 'm')).toThrow(/unknown condition/);
    expect(() => validateEvents([{ id: 'c', when: { type: 'visit', tile: [9, 9] }, then: base.then }], 5, 5, 'm')).toThrow(/in-bounds/);
    expect(() => validateEvents([{ id: 'd', when: base.when, then: [{ type: 'explode' }] }], 5, 5, 'm')).toThrow(/unknown action/);
  });
});
