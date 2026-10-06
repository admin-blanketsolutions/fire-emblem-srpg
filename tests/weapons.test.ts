import { describe, expect, it } from 'vitest';
import { weapons } from '../src/data';
import { buildWeaponTable, canReach, gradeFromWexp, GRADE_THRESHOLDS, triangle, wexpForGrade, WEAPON_KINDS, type WeaponKind } from '../src/core/weapons';

describe('the Three Postures', () => {
  it('has spear beat mace, mace beat sabre and sabre beat spear', () => {
    expect(triangle('spear', 'mace')).toBe(1);
    expect(triangle('mace', 'sabre')).toBe(1);
    expect(triangle('sabre', 'spear')).toBe(1);
  });

  it('is the mirror image for the loser', () => {
    expect(triangle('mace', 'spear')).toBe(-1);
    expect(triangle('sabre', 'mace')).toBe(-1);
    expect(triangle('spear', 'sabre')).toBe(-1);
  });

  it('has no effect between equal kinds', () => {
    for (const kind of ['spear', 'sabre', 'mace'] as const) expect(triangle(kind, kind)).toBe(0);
  });

  it('leaves every other weapon type outside the triangle', () => {
    const outside: WeaponKind[] = ['axe', 'dagger', 'bow', 'crossbow', 'javelin', 'fire', 'remedy'];
    for (const kind of outside) {
      for (const other of WEAPON_KINDS) {
        expect(triangle(kind, other), `${kind} vs ${other}`).toBe(0);
        expect(triangle(other, kind), `${other} vs ${kind}`).toBe(0);
      }
    }
  });

  it('is antisymmetric across all ten types', () => {
    for (const a of WEAPON_KINDS) for (const b of WEAPON_KINDS) expect(triangle(a, b)).toBe(-triangle(b, a) || 0);
  });
});

describe('weapon grades', () => {
  it('maps weapon EXP to grades at the thresholds 0, 15, 40, 80, 140', () => {
    expect(GRADE_THRESHOLDS).toEqual([0, 15, 40, 80, 140]);
    const cases: Array<[number, number]> = [[0, 1], [14, 1], [15, 2], [39, 2], [40, 3], [79, 3], [80, 4], [139, 4], [140, 5], [999, 5]];
    for (const [wexp, grade] of cases) expect(gradeFromWexp(wexp), `wexp ${wexp}`).toBe(grade);
  });

  it('gives the EXP at which a grade starts, clamped to I..V', () => {
    expect([1, 2, 3, 4, 5].map(wexpForGrade)).toEqual([0, 15, 40, 80, 140]);
    expect(wexpForGrade(0)).toBe(0);
    expect(wexpForGrade(9)).toBe(140);
  });
});

describe('weapon ranges', () => {
  it('reaches inside its range only', () => {
    const bow = weapons.get('composite-bow')!; // range 2-3
    expect([1, 2, 3, 4].map((d) => canReach(bow, d))).toEqual([false, true, true, false]);
  });
});

describe('validating weapon data', () => {
  const good = { id: 'x', name: 'X', kind: 'spear', grade: 1, might: 5, hit: 80, crit: 0, weight: 5, range: [1, 1], uses: 10, price: 100 };

  it('accepts a well-formed weapon', () => {
    expect(buildWeaponTable([good]).get('x')?.name).toBe('X');
  });

  it('rejects bad data with a message naming the weapon', () => {
    expect(() => buildWeaponTable([good, good])).toThrow(/duplicate/);
    expect(() => buildWeaponTable([{ ...good, kind: 'pike' }])).toThrow(/unknown kind "pike"/);
    expect(() => buildWeaponTable([{ ...good, grade: 6 }])).toThrow(/grade/);
    expect(() => buildWeaponTable([{ ...good, might: -1 }])).toThrow(/might/);
    expect(() => buildWeaponTable([{ ...good, range: [3, 2] }])).toThrow(/range/);
    expect(() => buildWeaponTable([{ ...good, range: [0, 1] }])).toThrow(/range/);
    expect(() => buildWeaponTable([{ ...good, effective: ['dragon'] }])).toThrow(/dragon/);
    expect(() => buildWeaponTable([{ ...good, vsBonus: { dragon: 2 } }])).toThrow(/dragon/);
    expect(() => buildWeaponTable([{ ...good, id: '' }])).toThrow(/missing id/);
  });
});
