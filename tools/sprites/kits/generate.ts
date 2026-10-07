import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateSpriteDef } from '../../../src/core/sprite';
import { formatSpriteJson, SPRITES_DIR } from '../lib';
import { compactSprite } from './compact';
import { flameSprites, structureSprites } from './structures';
import { terrainSprites } from './terrain';
import { uiSprites } from './ui';
import { unitSprites } from './units';

/**
 * Compose the placeholder sprites from the kits and write them as ordinary sprite definitions.
 * The JSON files are the source of truth: edit them by hand, or replace them with real art.
 */
mkdirSync(SPRITES_DIR, { recursive: true });
const all = [...terrainSprites(), ...unitSprites(), ...structureSprites(), ...uiSprites(), ...flameSprites()];
for (const composed of all) {
  const def = compactSprite(composed);
  validateSpriteDef(def, def.id); // fail loudly if a kit produces something invalid
  writeFileSync(join(SPRITES_DIR, `${def.id}.sprite.json`), formatSpriteJson(def));
}
console.log(`Wrote ${all.length} sprite definitions to ${SPRITES_DIR}`);
