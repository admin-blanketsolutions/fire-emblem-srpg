import { describe, expect, it } from 'vitest';
import { classes, structures, terrain } from '../src/data';
import { loadSpriteDefs } from '../tools/sprites/lib';

const sprites = new Map(loadSpriteDefs().map(({ def }) => [def.id, def]));

describe('the placeholder art set', () => {
  it('has a map sprite for every class, so a promoted unit never loses its look', () => {
    for (const c of classes.values()) {
      if (c.id === 'structure') continue;
      expect(sprites.has(`unit.${c.id}`), c.id).toBe(true);
    }
  });

  it('gives every class a look of its own', () => {
    const seen = new Map<string, string>();
    for (const c of classes.values()) {
      const def = sprites.get(`unit.${c.id}`);
      if (!def) continue;
      const key = JSON.stringify(def.frames.idle);
      expect(seen.get(key), `${c.id} looks like ${seen.get(key)}`).toBeUndefined();
      seen.set(key, c.id);
    }
  });

  it('has a sprite for every structure, with the frames a unit needs', () => {
    for (const s of structures.values()) {
      const def = sprites.get(s.sprite ?? `unit.${s.id}`);
      expect(def, s.id).toBeDefined();
      expect(def?.frames.idle?.length, s.id).toBeGreaterThan(0);
    }
  });

  it('has a walk and an idle for every unit that moves', () => {
    for (const c of classes.values()) {
      const def = sprites.get(`unit.${c.id}`);
      if (!def) continue;
      expect(def.frames.idle?.length, c.id).toBeGreaterThan(0);
      expect(def.frames.walk?.length, c.id).toBeGreaterThan(0);
    }
  });

  it('has a tile for every terrain, and the flames that burn on one', () => {
    for (const id of terrain.keys()) expect(sprites.has(`tile.${id}`), id).toBe(true);
    expect(sprites.get('ui.flames')?.frames.burn?.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the flames to their own palette: they never take a faction colour', () => {
    expect(sprites.get('ui.flames')?.slots).toBeUndefined();
  });
});
