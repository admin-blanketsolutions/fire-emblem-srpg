import { describe, expect, it } from 'vitest';
import { RepeatTracker, type Action } from '../src/core/input';

const held = (...a: Action[]): Set<Action> => new Set(a);

describe('RepeatTracker', () => {
  it('fires a press once, immediately', () => {
    const t = new RepeatTracker(200, 50);
    expect(t.update(held('confirm'), 16)).toEqual(held('confirm'));
    expect(t.update(held('confirm'), 16).size).toBe(0);
    expect(t.update(held('confirm'), 500).size).toBe(0); // buttons never repeat
  });

  it('repeats a held direction after the delay, then steadily', () => {
    const t = new RepeatTracker(200, 50);
    expect(t.update(held('left'), 0).has('left')).toBe(true); // initial press
    expect(t.update(held('left'), 100).has('left')).toBe(false); // 100ms < 200ms delay
    expect(t.update(held('left'), 110).has('left')).toBe(true); // 210ms crosses the delay
    expect(t.update(held('left'), 20).has('left')).toBe(false); // 230 < 250
    expect(t.update(held('left'), 30).has('left')).toBe(true); // 260 >= 250
  });

  it('fires again on a fresh press after release', () => {
    const t = new RepeatTracker(200, 50);
    t.update(held('up'), 0);
    t.update(held(), 16);
    expect(t.update(held('up'), 16).has('up')).toBe(true);
  });

  it('handles several held actions independently', () => {
    const t = new RepeatTracker(200, 50);
    const first = t.update(held('down', 'cancel'), 0);
    expect(first.has('down') && first.has('cancel')).toBe(true);
    const later = t.update(held('down', 'cancel'), 250);
    expect(later.has('down')).toBe(true);
    expect(later.has('cancel')).toBe(false);
  });

  it('catches up when a frame is long', () => {
    const t = new RepeatTracker(100, 50);
    t.update(held('right'), 0);
    expect(t.update(held('right'), 400).has('right')).toBe(true);
  });
});
