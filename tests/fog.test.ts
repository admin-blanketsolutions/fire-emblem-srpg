import { describe, expect, it } from 'vitest';
import { computeVisible, visionRadius, VISION } from '../src/core/fog';
import { tileKey } from '../src/core/grid';
import { battleOf, mapOf, openMap, unit } from './support';

const has = (set: Set<number>, x: number, y: number) => set.has(tileKey(x, y));

describe('vision', () => {
  it('has a radius by movement type: foot 3, light 4, mounted 4, armored 3', () => {
    expect(VISION).toEqual({ foot: 3, light: 4, mounted: 4, armored: 3 });
    const battle = battleOf([unit({ x: 5, y: 5 })], openMap(11, 11));
    expect(visionRadius(battle, battle.units[0]!)).toBe(3);
    const rider = unit({ id: 'r', class: 'horseman', x: 5, y: 5 });
    expect(visionRadius(battleOf([rider], openMap(11, 11)), rider)).toBe(4);
  });

  it('adds one on a hill and loses what the map takes away, but never drops below one', () => {
    const map = mapOf(['.h.']);
    const u = unit({ x: 1 });
    expect(visionRadius(battleOf([u], map), u)).toBe(4);
    const night = mapOf(['...'], { visionPenalty: 3 });
    const v = unit({ x: 1 });
    expect(visionRadius(battleOf([v], night), v)).toBe(1);
  });

  it('is a diamond around each unit of the viewing sides', () => {
    const battle = battleOf([unit({ id: 'p', x: 5, y: 5 }), unit({ id: 'e', side: 'enemy', x: 0, y: 0 })], openMap(11, 11));
    const seen = computeVisible(battle, ['player']);
    expect(has(seen, 5, 5)).toBe(true);
    expect(has(seen, 8, 5)).toBe(true); // three tiles away
    expect(has(seen, 9, 5)).toBe(false);
    expect(has(seen, 7, 7)).toBe(false); // a diamond, not a square
    expect(has(seen, 0, 0)).toBe(false);
    expect(has(computeVisible(battle, ['enemy']), 0, 0)).toBe(true);
  });

  it('clips at the edge of the map', () => {
    const battle = battleOf([unit({ x: 0, y: 0 })], openMap(5, 5));
    expect(computeVisible(battle, ['player']).size).toBe(10); // the quarter diamond: 1 + 2 + 3 + 4
  });
});

describe('fog of war in a battle', () => {
  const fogMap = () => openMap(15, 1, { fog: true });

  it('hides nothing when the map has no fog', () => {
    const battle = battleOf([unit({ id: 'p' }), unit({ id: 'e', side: 'enemy', x: 14 })], openMap(15, 1));
    expect(battle.isVisible(14, 0)).toBe(true);
    expect(battle.visibleUnits()).toHaveLength(2);
  });

  it('hides enemies beyond sight and shows them when they come near', () => {
    const p = unit({ id: 'p', x: 0 });
    const e = unit({ id: 'e', side: 'enemy', x: 10 });
    const battle = battleOf([p, e], fogMap());
    expect(battle.visibleUnits().map((u) => u.id)).toEqual(['p']);
    e.x = 3;
    battle.updateVisibility();
    expect(battle.visibleUnits().map((u) => u.id)).toEqual(['p', 'e']);
  });

  it('shares what allies see', () => {
    const p = unit({ id: 'p', x: 0 });
    const friend = unit({ id: 'f', side: 'ally', x: 9 });
    const e = unit({ id: 'e', side: 'enemy', x: 11 });
    const battle = battleOf([p, friend, e], fogMap());
    expect(battle.visibleUnits().map((u) => u.id)).toContain('e');
  });

  it('remembers ground it has seen but no longer sees', () => {
    const p = unit({ id: 'p', x: 0 });
    const battle = battleOf([p], fogMap());
    expect(battle.isVisible(3, 0)).toBe(true);
    p.x = 10;
    battle.updateVisibility();
    expect(battle.isVisible(3, 0)).toBe(false);
    expect(battle.isExplored(3, 0)).toBe(true);
    expect(battle.isExplored(5, 0)).toBe(false); // never in sight from either place
  });

  it('updates after a unit moves', () => {
    const p = unit({ id: 'p', x: 0 });
    const battle = battleOf([p], fogMap());
    expect(battle.isVisible(8, 0)).toBe(false);
    battle.moveUnit(p, { x: 5, y: 0 }, battle.reachFor(p));
    expect(battle.isVisible(8, 0)).toBe(true);
  });
});
