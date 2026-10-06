import { describe, expect, it } from 'vitest';
import { createRng, hashSeed } from '../src/core/rng';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
  });

  it('differs between seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('stays in [0, 1) and int() stays in range', () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const f = rng.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = rng.int(10);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(10);
    }
  });

  it('restores its state so a suspended battle replays identically', () => {
    const rng = createRng(99);
    rng.next();
    rng.next();
    const saved = rng.state();
    const expected = [rng.next(), rng.next(), rng.int(100)];
    const resumed = createRng(0);
    resumed.restore(saved);
    expect([resumed.next(), resumed.next(), resumed.int(100)]).toEqual(expected);
  });

  it('rejects a bad int bound', () => {
    expect(() => createRng(1).int(0)).toThrow(RangeError);
    expect(() => createRng(1).int(2.5)).toThrow(RangeError);
  });

  it('hashes seeds stably and separates parts', () => {
    expect(hashSeed('campaign', 'ch00')).toBe(hashSeed('campaign', 'ch00'));
    expect(hashSeed('campaign', 'ch00')).not.toBe(hashSeed('campaign', 'ch01'));
    expect(hashSeed('ab', 'c')).not.toBe(hashSeed('a', 'bc'));
  });
});
