import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MapJson, SpawnJson } from '../src/core/map';

/**
 * Print a chapter map as text, with its spawns on it, for designing and reviewing maps without
 * opening the game: `npx tsx tools/mapview.ts ch01-damascus`.
 *
 *   player units are shown as a digit or letter in the key, allies as `a`, enemies as `e`,
 *   structures as `X`, and reinforcement arrival tiles as `*`.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];
if (!name) {
  console.error('usage: tsx tools/mapview.ts <map file name, without .json>');
  process.exit(1);
}
const map = JSON.parse(readFileSync(join(root, 'src', 'data', 'maps', `${name}.json`), 'utf8')) as MapJson;
const [w, h] = map.size;
const grid = map.terrain.map((row) => [...row]);
const mark = (spawns: readonly SpawnJson[] | undefined, glyph: (s: SpawnJson, i: number) => string): void => {
  (spawns ?? []).forEach((s, i) => {
    const row = grid[s.at[1]];
    if (row) row[s.at[0]] = glyph(s, i);
  });
};
mark(map.spawns?.player, (s) => (s.tags?.includes('lord') ? 'L' : s.tags?.includes('slot') ? 's' : 'P'));
mark(map.spawns?.ally, () => 'a');
mark(map.spawns?.enemy, (s) => (s.unit.includes('gate') || s.unit.includes('wall') || s.unit.includes('mangonel') || s.unit.includes('barricade') ? 'X' : s.tags?.includes('leader') ? 'B' : 'e'));
for (const r of map.reinforcements ?? []) for (const u of r.units) {
  const row = grid[u.at[1]];
  if (row && row[u.at[0]] !== undefined && /[.,:]/.test(row[u.at[0]] as string)) row[u.at[0]] = '*';
}
const tens = Array.from({ length: w }, (_, x) => (x % 10 === 0 ? String(Math.floor(x / 10)) : ' ')).join('');
const ones = Array.from({ length: w }, (_, x) => String(x % 10)).join('');
console.log(`${map.id}: ${map.name} (${w}x${h})`);
console.log(`    ${tens}\n    ${ones}`);
grid.forEach((row, y) => console.log(`${String(y).padStart(2)}  ${row.join('')}`));
console.log('\nlegend:', Object.entries(map.legend).map(([k, v]) => `${k}=${v}`).join('  '));
console.log('spawn key: L lord, s open slot, P named player, a ally, e enemy, B leader, X structure, * reinforcement arrival');
const count = (spawns: readonly SpawnJson[] | undefined): number => spawns?.length ?? 0;
console.log(`player ${count(map.spawns?.player)}, ally ${count(map.spawns?.ally)}, enemy ${count(map.spawns?.enemy)}, reinforcement waves ${map.reinforcements?.length ?? 0}`);
