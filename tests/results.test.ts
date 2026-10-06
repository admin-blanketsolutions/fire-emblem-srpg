import { describe, expect, it } from 'vitest';
import { expSteps, fightSteps } from '../src/scenes/results';
import { arena, balance, battleOf, scripted, unit } from './support';

const perLevel = balance.expPerLevel;

describe('result steps', () => {
  it('shows one EXP bar step when no level is gained', () => {
    const a = unit({ id: 'a', x: 0 });
    const e = unit({ id: 'e', side: 'enemy', x: 1 });
    const report = battleOf([a, e], arena(), scripted(0, 99, 99)).fight(a, e);
    const steps = fightSteps(report, perLevel);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ kind: 'exp', unit: a, from: 0, level: 1 });
  });

  it('splits a level-up into fill, level-up and the remainder', () => {
    const a = unit({ id: 'a', level: 3, growth: { hp: 100, mgt: 100 }, x: 0 });
    a.exp = 95;
    const e = unit({ id: 'e', side: 'enemy', level: 3, x: 1 });
    const report = battleOf([a, e], arena(), scripted(0, 99, 99, ...Array(7).fill(0))).fight(a, e);
    const steps = fightSteps(report, perLevel);
    expect(steps.map((s) => s.kind)).toEqual(['exp', 'levelup', 'exp']);
    expect(steps[0]).toMatchObject({ from: 95, to: 100, level: 3 });
    expect(steps[1]).toMatchObject({ kind: 'levelup', levelUp: { levelBefore: 3, levelAfter: 4 } });
    expect(steps[2]).toMatchObject({ from: 0, to: 5, level: 4 });
  });

  it('shows each level of a multi-level award with the stats as they stood then', () => {
    const a = unit({ id: 'a', level: 3, growth: { hp: 100, mgt: 100, skl: 100, spd: 100, fort: 100, grd: 100, nrv: 100 }, x: 0 });
    const base = { ...a.stats };
    const e = unit({ id: 'e', side: 'enemy', x: 1 });
    const award = {
      unit: a,
      amount: 250,
      expBefore: 0,
      expAfter: 50,
      levelUps: [
        { levelBefore: 3, levelAfter: 4, gains: { hp: 1, mgt: 1 } },
        { levelBefore: 4, levelAfter: 5, gains: { mgt: 1, skl: 1 } },
      ],
    };
    a.stats = { ...a.stats, hp: base.hp + 1, mgt: base.mgt + 2, skl: base.skl + 1 }; // the final stats after both
    a.level = 5;
    void e;
    const steps = expSteps(award, perLevel);
    expect(steps.map((s) => s.kind)).toEqual(['exp', 'levelup', 'levelup', 'exp']);
    const [, first, second] = steps as Array<{ kind: 'levelup'; stats: typeof base }>;
    expect(first?.stats.mgt).toBe(base.mgt + 1);
    expect(second?.stats.mgt).toBe(base.mgt + 2);
    expect(first?.stats.skl).toBe(base.skl);
    expect(second?.stats.skl).toBe(base.skl + 1);
  });

  it('announces a weapon that broke and a grade that was earned', () => {
    const a = unit({ id: 'a', x: 0 });
    a.inventory[0]!.uses = 1;
    a.wexp = { sabre: 14 };
    const e = unit({ id: 'e', side: 'enemy', x: 1 });
    const report = battleOf([a, e], arena(), scripted(99, 99)).fight(a, e);
    const lines = fightSteps(report, perLevel).flatMap((s) => (s.kind === 'message' ? s.lines : []));
    expect(lines).toContain("a's Iron Sabre broke!");
    expect(lines).toContain('a: Sabre grade II');
  });

  it('shows nothing for a unit at the level cap', () => {
    const a = unit({ id: 'a', level: 20 });
    expect(expSteps({ unit: a, amount: 0, expBefore: 0, expAfter: 0, levelUps: [] }, perLevel)).toEqual([]);
  });
});
