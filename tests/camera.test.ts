import { describe, expect, it } from 'vitest';
import { cameraToInclude, clampCamera } from '../src/core/camera';

describe('camera', () => {
  it('clamps to the map bounds', () => {
    expect(clampCamera(-50, -50, 352, 256, 240, 160)).toEqual({ x: 0, y: 0 });
    expect(clampCamera(999, 999, 352, 256, 240, 160)).toEqual({ x: 112, y: 96 });
    expect(clampCamera(40, 30, 352, 256, 240, 160)).toEqual({ x: 40, y: 30 });
  });

  it('centres a map smaller than the view', () => {
    expect(clampCamera(0, 0, 160, 96, 240, 160)).toEqual({ x: -40, y: -32 });
  });

  it('scrolls the minimum needed to include a tile with a margin', () => {
    const cam = { x: 0, y: 0 };
    // Tile (14, 4) is at x = 224..240, inside the view but within the 2-tile margin of the right edge.
    const right = cameraToInclude(cam, 14, 4, 16, 2, 800, 600, 240, 160);
    expect(right.x).toBe((14 + 1) * 16 + 32 - 240);
    expect(right.y).toBe(0);
    // A tile comfortably inside does not move the camera.
    expect(cameraToInclude(cam, 6, 4, 16, 2, 800, 600, 240, 160)).toEqual(cam);
  });

  it('scrolls back when the cursor leaves on the other side', () => {
    const cam = { x: 160, y: 96 };
    const moved = cameraToInclude(cam, 8, 5, 16, 2, 800, 600, 240, 160);
    expect(moved.x).toBe(8 * 16 - 32);
    expect(moved.y).toBe(5 * 16 - 32);
  });

  it('never scrolls past the map edge', () => {
    const far = cameraToInclude({ x: 0, y: 0 }, 21, 15, 16, 2, 352, 256, 240, 160);
    expect(far).toEqual({ x: 112, y: 96 });
  });
});
