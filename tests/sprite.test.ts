import { describe, expect, it } from 'vitest';
import { remapFor } from '../src/core/palettes';
import { allFrames, KIND_SIZES, parseColor, renderFrame, resolvePalette, usedIndices, validateSpriteDef, type SpriteDef } from '../src/core/sprite';
import { lintSprite } from '../src/core/spritelint';
import { loadPalettes, loadSpriteDefs } from '../tools/sprites/lib';
import { compactSprite } from '../tools/sprites/kits/compact';
import { crc32, encodePng, PNG_SIGNATURE, upscale } from '../tools/sprites/png';

const row = (digit: string, n = 16): string => digit.repeat(n);
const frameOf = (digit: string): string[] => Array.from({ length: 16 }, () => row(digit));

function def(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'tile.test',
    kind: 'tile',
    size: [16, 16],
    palette: ['#00000000', '#112233', '#445566'],
    frames: { still: [frameOf('1')] },
    ...overrides,
  };
}

describe('validateSpriteDef', () => {
  it('accepts a well-formed definition', () => {
    expect(validateSpriteDef(def()).id).toBe('tile.test');
  });

  it('rejects more than sixteen palette entries (index 0 plus fifteen colours)', () => {
    const palette = ['#00000000', ...Array.from({ length: 16 }, (_, i) => `#0000${i.toString(16).padStart(2, '0')}`)];
    expect(palette).toHaveLength(17);
    expect(() => validateSpriteDef(def({ palette }))).toThrow(/at most 15 colours/);
    expect(validateSpriteDef(def({ palette: palette.slice(0, 16) }))).toBeTruthy();
  });

  it('requires index 0 to be transparent', () => {
    expect(() => validateSpriteDef(def({ palette: ['#000000', '#112233'] }))).toThrow(/transparent/);
  });

  it('rejects malformed rows and out-of-palette indices', () => {
    expect(() => validateSpriteDef(def({ frames: { still: [frameOf('1').slice(1)] } }))).toThrow(/16 rows/);
    expect(() => validateSpriteDef(def({ frames: { still: [[...frameOf('1').slice(1), row('1', 15)]] } }))).toThrow(/16 digits/);
    expect(() => validateSpriteDef(def({ frames: { still: [frameOf('z')] } }))).toThrow(/hex digits/);
    expect(() => validateSpriteDef(def({ frames: { still: [frameOf('5')] } }))).toThrow(/palette has 3 entries/);
  });

  it('rejects animations that point at missing frame sets or frames', () => {
    expect(() => validateSpriteDef(def({ anim: { walk: { fps: 4 } } }))).toThrow(/missing frame set/);
    expect(() => validateSpriteDef(def({ anim: { still: { fps: 4, frames: [3] } } }))).toThrow(/outside 0\.\.0/);
    expect(() => validateSpriteDef(def({ anim: { still: { fps: 0 } } }))).toThrow(/fps/);
  });

  it('names the source in every error', () => {
    expect(() => validateSpriteDef({}, 'broken.sprite.json')).toThrow(/broken\.sprite\.json/);
  });
});

describe('rendering', () => {
  const sprite = validateSpriteDef({
    id: 'unit.test',
    kind: 'map-unit',
    size: [16, 16],
    palette: ['#00000000', '#101010', '#ff0000', '#00ff00', '#e2b48a'],
    slots: { faction: [2, 3], skin: [4] },
    frames: { idle: [Array.from({ length: 16 }, (_, y) => (y === 0 ? '0123400000000000' : row('0')))] },
  });

  it('renders palette colours and keeps index 0 transparent', () => {
    const img = renderFrame(sprite, 'idle', 0);
    expect(Array.from(img.data.slice(0, 4))).toEqual([0, 0, 0, 0]);
    expect(Array.from(img.data.slice(4, 8))).toEqual([0x10, 0x10, 0x10, 255]);
    expect(Array.from(img.data.slice(8, 12))).toEqual([255, 0, 0, 255]);
  });

  it('replaces faction and skin slots from the ramps', () => {
    const palettes = loadPalettes();
    const ramp = remapFor(palettes, 'frankish', 's3');
    const colors = resolvePalette(sprite, ramp);
    expect(colors[1]).toEqual(parseColor('#101010')); // fixed colours are untouched
    expect(colors[2]).not.toEqual(parseColor('#ff0000'));
    expect(colors[4]).not.toEqual(parseColor('#e2b48a'));
    const img = renderFrame(sprite, 'idle', 0, ramp);
    expect(Array.from(img.data.slice(8, 11))).toEqual([...(colors[2] ?? []).slice(0, 3)]);
  });

  it('throws for a frame that does not exist', () => {
    expect(() => renderFrame(sprite, 'walk', 0)).toThrow(RangeError);
  });

  it('lists frames in definition order for the PNG strip layout', () => {
    const two = validateSpriteDef(def({ frames: { a: [frameOf('1'), frameOf('2')], b: [frameOf('1')] } }));
    expect(allFrames(two)).toEqual([
      { set: 'a', index: 0 },
      { set: 'a', index: 1 },
      { set: 'b', index: 0 },
    ]);
  });
});

describe('lintSprite', () => {
  const errors = (d: Record<string, unknown>): string[] =>
    lintSprite(validateSpriteDef(d)).filter((i) => i.severity === 'error').map((i) => i.message);

  it('is silent for a clean tile', () => {
    expect(lintSprite(validateSpriteDef(def()))).toEqual([{ severity: 'warning', message: 'palette entry 2 (#445566) is never used' }]);
  });

  it('checks the id prefix against the kind', () => {
    expect(errors(def({ id: 'unit.wrong' })).join()).toMatch(/must start with "tile\."/);
  });

  it('refuses ids that name the Prophet or the Companions', () => {
    expect(errors(def({ id: 'tile.prophet' })).join()).toMatch(/never depicts/);
    expect(errors(def({ id: 'tile.sahaba-camp' })).join()).toMatch(/never depicts/);
  });

  it('allows ordinary names that merely contain the letters', () => {
    expect(errors(def({ id: 'tile.companionway' }))).toEqual([]);
  });

  it('enforces the frame size for each kind', () => {
    const wide = Array.from({ length: 8 }, () => row('1', 32));
    expect(errors(def({ size: [32, 8], frames: { still: [wide] } })).join()).toMatch(/not allowed for tile/);
  });

  it('requires tiles to be opaque and map units to have an idle set', () => {
    expect(errors(def({ frames: { still: [[row('0'), ...frameOf('1').slice(1)]] } })).join()).toMatch(/fully opaque/);
    expect(errors(def({ id: 'unit.t', kind: 'map-unit', frames: { stand: [frameOf('1')] } })).join()).toMatch(/idle/);
  });

  it('reports duplicate colours and a recolour group that is never drawn', () => {
    const d = validateSpriteDef(def({ palette: ['#00000000', '#112233', '#112233', '#778899'], slots: { faction: [3] }, frames: { still: [frameOf('1')] } }));
    const messages = lintSprite(d).map((i) => i.message).join('\n');
    expect(messages).toMatch(/both #112233/);
    expect(messages).toMatch(/no faction slot is drawn/);
  });
});

describe('compactSprite', () => {
  const wide: SpriteDef = validateSpriteDef({
    id: 'unit.wide',
    kind: 'map-unit',
    size: [16, 16],
    palette: ['#00000000', '#111111', '#222222', '#333333', '#444444', '#555555'],
    slots: { faction: [3, 4], skin: [5] },
    frames: { idle: [Array.from({ length: 16 }, (_, y) => (y === 0 ? '0135000000000000' : row('0')))] },
  });

  it('drops unused entries, renumbers frames and trims trailing unused slots', () => {
    const small = compactSprite(wide);
    expect(small.palette).toEqual(['#00000000', '#111111', '#333333', '#555555']);
    expect(small.slots).toEqual({ faction: [2], skin: [3] });
    expect(small.frames['idle']?.[0]?.[0]).toBe('0123000000000000');
    expect(validateSpriteDef(small)).toBeTruthy();
  });

  it('renders the same picture after compaction', () => {
    const before = renderFrame(wide, 'idle', 0);
    const after = renderFrame(compactSprite(wide), 'idle', 0);
    expect(Array.from(after.data)).toEqual(Array.from(before.data));
  });

  it('keeps an unused slot in the middle of a ramp so positions stay aligned', () => {
    const gap = validateSpriteDef({ ...wide, slots: { faction: [3, 4, 5] }, frames: { idle: [Array.from({ length: 16 }, (_, y) => (y === 0 ? '0135000000000000' : row('0')))] } });
    const small = compactSprite(gap);
    expect(small.slots?.faction).toHaveLength(3);
    expect(usedIndices(small).size).toBe(3);
  });
});

describe('PNG encoding', () => {
  it('writes a valid header and dimensions', () => {
    const png = encodePng(3, 2, new Uint8Array(3 * 2 * 4));
    expect(Array.from(png.slice(0, 8))).toEqual(Array.from(PNG_SIGNATURE));
    const view = new DataView(png.buffer, png.byteOffset);
    expect(view.getUint32(16)).toBe(3);
    expect(view.getUint32(20)).toBe(2);
  });

  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('rejects data of the wrong length', () => {
    expect(() => encodePng(2, 2, new Uint8Array(3))).toThrow(RangeError);
  });

  it('upscales by repeating pixels', () => {
    const out = upscale(2, 1, Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8), 2);
    expect(out.width).toBe(4);
    expect(out.height).toBe(2);
    expect(Array.from(out.data.slice(0, 8))).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
  });
});

describe('the committed sprite definitions', () => {
  const sprites = loadSpriteDefs();

  it('are all valid, correctly named and lint-clean', () => {
    expect(sprites.length).toBeGreaterThan(30);
    for (const { def: d } of sprites) {
      const issues = lintSprite(d);
      expect(issues, `${d.id}: ${issues.map((i) => i.message).join('; ')}`).toEqual([]);
    }
  });

  it('use at most fifteen colours each and only allowed sizes', () => {
    for (const { def: d } of sprites) {
      expect(d.palette.length - 1, d.id).toBeLessThanOrEqual(15);
      expect(KIND_SIZES[d.kind].some(([w, h]) => w === d.size[0] && h === d.size[1]), d.id).toBe(true);
    }
  });

  it('cover every sprite id the data refers to', async () => {
    const { createTestBattle, terrain } = await import('../src/data');
    const ids = new Set(sprites.map(({ def: d }) => d.id));
    for (const u of createTestBattle().units) expect(ids.has(u.spriteId), u.spriteId).toBe(true);
    for (const id of terrain.keys()) expect(ids.has(`tile.${id}`), `tile.${id}`).toBe(true);
  });
});
