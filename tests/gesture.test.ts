import { describe, expect, it } from 'vitest';
import { PointerGesture } from '../src/core/gesture';

describe('telling a tap from a drag', () => {
  it('reports a tap where a still pointer went down', () => {
    const g = new PointerGesture(4);
    g.down(1, { x: 50, y: 60 });
    g.move(1, { x: 52, y: 61 });
    expect(g.up(1)).toEqual({ x: 50, y: 60 });
    expect(g.takePan()).toEqual({ x: 0, y: 0 });
  });

  it('turns a moving pointer into a pan, with no tap', () => {
    const g = new PointerGesture(4);
    g.down(1, { x: 50, y: 60 });
    g.move(1, { x: 58, y: 60 });
    expect(g.takePan()).toEqual({ x: 8, y: 0 });
    g.move(1, { x: 60, y: 55 });
    expect(g.takePan()).toEqual({ x: 2, y: -5 });
    expect(g.up(1)).toBeNull();
  });

  it('follows only the first finger, and forgets a cancelled one', () => {
    const g = new PointerGesture(4);
    g.down(1, { x: 10, y: 10 });
    g.down(2, { x: 100, y: 100 });
    g.move(2, { x: 140, y: 100 });
    expect(g.takePan()).toEqual({ x: 0, y: 0 });
    expect(g.up(2)).toBeNull();
    g.cancel(1);
    expect(g.up(1)).toBeNull();
    g.down(3, { x: 5, y: 5 });
    expect(g.up(3)).toEqual({ x: 5, y: 5 });
  });
});
