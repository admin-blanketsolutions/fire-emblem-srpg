import { describe, expect, it } from 'vitest';
import { computeViewport } from '../src/core/viewport';

describe('viewport', () => {
  it('picks the largest integer scale that fits', () => {
    expect(computeViewport(240, 160).deviceScale).toBe(1);
    expect(computeViewport(480, 320).deviceScale).toBe(2);
    expect(computeViewport(1280, 720).deviceScale).toBe(4); // 720/160 = 4.5 -> 4
    expect(computeViewport(1920, 1080).deviceScale).toBe(6); // 1080/160 = 6.75 -> 6
    expect(computeViewport(239, 159).deviceScale).toBe(1); // never below 1
  });

  it('is limited by the tighter dimension', () => {
    expect(computeViewport(2000, 400).deviceScale).toBe(2);
    expect(computeViewport(500, 2000).deviceScale).toBe(2);
  });

  it('centres the canvas', () => {
    const v = computeViewport(1000, 700);
    expect(v.deviceScale).toBe(4);
    expect(v.cssWidth).toBe(960);
    expect(v.cssHeight).toBe(640);
    expect(v.offsetX).toBe(20);
    expect(v.offsetY).toBe(30);
  });

  it('keeps device pixels integral on high-DPI screens', () => {
    const v = computeViewport(1000, 700, 2);
    expect(v.deviceScale).toBe(8);
    expect(v.backingWidth).toBe(240 * 8);
    expect(v.cssWidth).toBe((240 * 8) / 2);
    const fractional = computeViewport(1000, 700, 1.5);
    expect(Number.isInteger(fractional.deviceScale)).toBe(true);
    expect(fractional.backingWidth).toBe(240 * fractional.deviceScale);
  });

  it('ignores a nonsense pixel ratio', () => {
    expect(computeViewport(480, 320, 0).deviceScale).toBe(2);
  });
});
