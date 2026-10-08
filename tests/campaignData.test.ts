import { describe, expect, it } from 'vitest';
import factions from '../assets/palettes/factions.json';
import skins from '../assets/palettes/skins.json';
import type { EventAction, EventDef } from '../src/core/events';
import { parseMap, type MapJson, type SpawnJson } from '../src/core/map';
import { campaignMapJson, campaignUnits } from '../src/data/campaign';
import { STORIES } from '../src/data/battles';
import { classes, items, structures, terrain, weapons } from '../src/data';

/**
 * The campaign's data, checked as a whole (what the loaders cannot see one file at a time): every
 * unit has colours and a sprite, every map is playable, every event points at something that
 * exists, and every chapter's pieces are all used.
 */

const story = STORIES.campaign;
const SPRITES = Object.keys(import.meta.glob('../assets/sprites/*.sprite.json')).map((p) => /([^/]+)\.sprite\.json$/.exec(p)?.[1] ?? '');
const sprites = new Set(SPRITES);

const mapsById = [...campaignMapJson.entries()];
const spawnsOf = (m: MapJson): Array<{ side: string; spawn: SpawnJson }> =>
  (['player', 'ally', 'enemy'] as const).flatMap((side) => (m.spawns?.[side] ?? []).map((spawn) => ({ side, spawn })));
const eventActions = (m: MapJson): EventAction[] => (m.events ?? []).flatMap((e: EventDef) => [...e.then]);

describe('the campaign’s units', () => {
  it.each(Object.values(campaignUnits).map((u) => [u.id, u] as const))('%s has a class, items, colours and a sprite', (_, def) => {
    expect(classes.has(def.class), `class ${def.class}`).toBe(true);
    for (const id of def.inventory) expect(weapons.has(id) || items.has(id), `item ${id}`).toBe(true);
    expect(Object.keys(factions), `faction ${def.faction}`).toContain(def.faction);
    expect(Object.keys(skins), `skin ${def.skin}`).toContain(def.skin);
    expect(sprites.has(def.sprite ?? `unit.${def.class}`), `sprite of ${def.id}`).toBe(true);
  });

  it('keeps the Recruit the only invented person who may be named, and never calls a unit a Prophet or a Companion', () => {
    expect(Object.values(campaignUnits).filter((u) => u.playerNamed).map((u) => u.id)).toEqual(['recruit']);
    for (const def of Object.values(campaignUnits)) expect(def.id + def.name).not.toMatch(/prophet|sahab|companion/i);
  });
});

describe('the cast', () => {
  it.each([...story.characters.values()].map((c) => [c.id, c] as const))('%s has a portrait and colours', (_, c) => {
    if (c.portrait) expect(sprites.has(c.portrait), c.portrait).toBe(true);
    if (c.faction) expect(Object.keys(factions)).toContain(c.faction);
    if (c.skin) expect(Object.keys(skins)).toContain(c.skin);
  });
});

describe('the maps', () => {
  it('are all used by a battle, and every battle has a map', () => {
    const used = new Set([...story.chapters.values()].flatMap((c) => c.steps.flatMap((s) => (s.kind === 'battle' ? [s.battle] : []))));
    expect([...campaignMapJson.keys()].sort()).toEqual([...used].sort());
  });

  it.each(mapsById)('%s parses, and puts every spawn on ground it can stand on', (id, json) => {
    const map = parseMap(json, terrain);
    const taken = new Map<string, string>();
    for (const { side, spawn } of spawnsOf(json)) {
      const def = campaignUnits[spawn.unit];
      const structure = structures.get(spawn.unit);
      expect(def ?? structure, `${id}: ${side} spawn "${spawn.unit}"`).toBeDefined();
      const [x, y] = spawn.at;
      if (def) {
        expect(map.costFor(x, y, (classes.get(def.class) as { moveType: 'foot' }).moveType), `${id}: ${spawn.unit} at ${x},${y} stands on ${map.terrainAt(x, y).id}`).not.toBeNull();
      }
      if (!spawn.tags?.includes('reserve')) {
        const key = `${x},${y}`;
        expect(taken.get(key), `${id}: ${spawn.unit} and ${taken.get(key)} share ${key}`).toBeUndefined();
        taken.set(key, spawn.unit);
      }
      // the side a spawn is listed under is the side the unit plays on, unless the spawn says otherwise
      const played = spawn.side ?? def?.side ?? side;
      if (side === 'enemy') expect(played, `${id}: ${spawn.unit} is listed as an enemy`).toBe('enemy');
      if (side === 'player' && def) expect(spawn.side ?? def.side, `${id}: ${spawn.unit} is listed as the player's`).toBe('player');
    }
  });

  it.each(mapsById)('%s: reinforcements, events and the objective point at things that exist', (id, json) => {
    for (const r of json.reinforcements ?? []) for (const u of r.units) expect(campaignUnits[u.def] ?? structures.get(u.def), `${id}: reinforcement ${u.def}`).toBeDefined();
    for (const a of eventActions(json)) {
      if (a.type === 'dialogue') expect(story.scenes.has(a.scene), `${id}: scene ${a.scene}`).toBe(true);
      if (a.type === 'unlockCodex') expect(story.codex.has(a.id), `${id}: Codex ${a.id}`).toBe(true);
      if (a.type === 'giveItem') expect(items.has(a.item) || weapons.has(a.item), `${id}: item ${a.item}`).toBe(true);
      if (a.type === 'spawn') for (const u of a.units) expect(campaignUnits[u.def] ?? structures.get(u.def), `${id}: spawned ${u.def}`).toBeDefined();
      if (a.type === 'arrive') expect(spawnsOf(json).some(({ spawn }) => spawn.tags?.includes('reserve') && (spawn.unit === a.unit)), `${id}: ${a.unit} is a reserve`).toBe(true);
    }
    expect(json.objective, `${id} has an objective`).toBeDefined();
  });
});

describe('the story', () => {
  it('opens only Codex entries that exist, from scenes and from chapters', () => {
    for (const scene of story.scenes.values()) {
      for (const cmd of scene.cmds) if ('unlock' in cmd) expect(story.codex.has(cmd.unlock), `${scene.id} unlocks ${cmd.unlock}`).toBe(true);
    }
  });

  it('opens the Codex only at chapters there are', () => {
    for (const entry of story.codex.values()) expect(story.chapters.has(entry.unlock.chapter), `${entry.id}`).toBe(true);
  });

  it('gives each support scene a chapter it can be shown from, and units the campaign has', () => {
    for (const support of story.supports.values()) {
      expect(campaignUnits[support.a], support.id).toBeDefined();
      expect(campaignUnits[support.b], support.id).toBeDefined();
      for (const scene of Object.values(support.scenes)) if (scene?.availableFrom) expect(story.chapters.has(scene.availableFrom), `${support.id} from ${scene.availableFrom}`).toBe(true);
    }
  });

  it('plays every scene it has: none is orphaned', () => {
    const played = new Set<string>();
    for (const c of story.chapters.values()) for (const s of c.steps) if (s.kind === 'scenes') s.scenes.forEach((id) => played.add(id));
    for (const [, json] of mapsById) for (const a of eventActions(json)) if (a.type === 'dialogue') played.add(a.scene);
    for (const support of story.supports.values()) for (const scene of Object.values(support.scenes)) if (scene) played.add(scene.scene);
    const orphans = [...story.scenes.keys()].filter((id) => !played.has(id));
    expect(orphans).toEqual([]);
  });
});
