import { describe, it, expect } from 'vitest';
import { GridSystem } from '../GridSystem';
import { makeUnit } from '@/entities/Unit';

describe('GridSystem', () => {
  const grid = new GridSystem(10, 10);

  it('returns null for out-of-bounds cells', () => {
    expect(grid.getCell(-1, 0)).toBeNull();
    expect(grid.getCell(10, 0)).toBeNull();
    expect(grid.getCell(0, 10)).toBeNull();
  });

  it('converts pixel coords to grid coords', () => {
    expect(grid.pixelToGrid(0, 0)).toEqual({ x: 0, y: 0 });
    expect(grid.pixelToGrid(32, 32)).toEqual({ x: 1, y: 1 });
    expect(grid.pixelToGrid(63, 63)).toEqual({ x: 1, y: 1 });
  });

  it('converts grid coords to pixel coords', () => {
    expect(grid.gridToPixel(0, 0)).toEqual({ x: 0, y: 0 });
    expect(grid.gridToPixel(2, 3)).toEqual({ x: 64, y: 96 });
  });

  it('flood fill includes origin tile', () => {
    const unit = makeUnit('a1', 'Test', 'ally', 'Lord', 5, 5, { mov: 3 });
    const reachable = grid.getMovementRange(unit, [unit]);
    expect(reachable.has('5,5')).toBe(true);
  });

  it('flood fill respects movement range', () => {
    const unit = makeUnit('a1', 'Test', 'ally', 'Lord', 5, 5, { mov: 1 });
    const reachable = grid.getMovementRange(unit, [unit]);
    // With mov=1 on a plain map, can reach 4 adjacent + origin = 5 cells
    expect(reachable.size).toBe(5);
  });

  it('enemies block movement range', () => {
    const ally = makeUnit('a1', 'Ally', 'ally', 'Lord', 5, 5, { mov: 3 });
    const enemy = makeUnit('e1', 'Enemy', 'enemy', 'Knight', 6, 5);
    const reachable = grid.getMovementRange(ally, [ally, enemy]);
    expect(reachable.has('6,5')).toBe(false);
  });
});
