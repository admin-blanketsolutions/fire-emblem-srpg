import type { ExpAward, FightReport } from '../core/battle';
import type { LevelUp } from '../core/exp';
import { kindLabel, roman } from '../core/labels';
import { STAT_KEYS, type MutableStats, type Stats } from '../core/stats';
import type { UnitInstance } from '../core/unit';

/**
 * What the player is shown after a fight or a heal, one step at a time: broken weapons, the EXP
 * bar, each level-up, and weapon grades earned. Built from the report so the scene only plays it.
 */
export type ResultStep =
  | { readonly kind: 'message'; readonly lines: readonly string[] }
  | { readonly kind: 'exp'; readonly unit: UnitInstance; readonly level: number; readonly from: number; readonly to: number; readonly gained: number }
  | { readonly kind: 'levelup'; readonly unit: UnitInstance; readonly levelUp: LevelUp; readonly stats: Stats };

/** The steps for one EXP award: the bar fills, each level-up shows, and the bar fills again. */
export function expSteps(award: ExpAward, perLevel: number): ResultStep[] {
  const { unit, amount, expBefore, expAfter, levelUps } = award;
  if (levelUps.length === 0) {
    if (unit.level >= 20 && expBefore === expAfter) return []; // nothing to earn at the cap
    return [{ kind: 'exp', unit, level: unit.level, from: expBefore, to: expAfter, gained: amount }];
  }
  const steps: ResultStep[] = [];
  const firstLevel = levelUps[0]?.levelBefore ?? unit.level;
  steps.push({ kind: 'exp', unit, level: firstLevel, from: expBefore, to: perLevel, gained: amount });
  // the stats as they stood after each level-up: the final stats minus the gains still to come
  const running: MutableStats = { ...unit.stats };
  const afters: Stats[] = [];
  for (let i = levelUps.length - 1; i >= 0; i--) {
    afters[i] = { ...running };
    for (const key of STAT_KEYS) running[key] -= levelUps[i]?.gains[key] ?? 0;
  }
  levelUps.forEach((levelUp, i) => {
    steps.push({ kind: 'levelup', unit, levelUp, stats: afters[i] ?? unit.stats });
  });
  const last = levelUps.at(-1);
  if (last && unit.level < 20 && expAfter > 0) {
    steps.push({ kind: 'exp', unit, level: last.levelAfter, from: 0, to: expAfter, gained: amount });
  }
  return steps;
}

export function fightSteps(report: FightReport, perLevel: number): ResultStep[] {
  const steps: ResultStep[] = [];
  for (const { unit, weapon } of report.brokenWeapons) steps.push({ kind: 'message', lines: [`${unit.name}'s ${weapon.name} broke!`] });
  for (const award of report.expAwards) steps.push(...expSteps(award, perLevel));
  for (const gain of report.wexpGains) {
    if (gain.gradeUp !== null) steps.push({ kind: 'message', lines: [`${gain.unit.name}: ${kindLabel(gain.kind)} grade ${roman(gain.gradeUp)}`] });
  }
  return steps;
}
