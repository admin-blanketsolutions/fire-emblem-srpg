import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkBoundaries, loadSourceFiles, stripNoise } from '../tools/lint-boundaries';

const file = (path: string, text: string) => ({ path, text });

describe('layering lint', () => {
  it('passes on the real source tree', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const files = loadSourceFiles(root);
    expect(files.some((f) => f.path.startsWith('src/core/'))).toBe(true);
    expect(checkBoundaries(files)).toEqual([]);
  });

  it('forbids core from importing upwards', () => {
    const problems = checkBoundaries([file('src/core/a.ts', "import { x } from '../engine/display';\n")]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/core must not import from engine/);
    expect(problems[0]).toMatch(/src\/core\/a\.ts:1/);
  });

  it('allows downward imports and imports within a layer', () => {
    expect(
      checkBoundaries([
        file('src/scenes/b.ts', "import { rng } from '../core/rng';\nimport { d } from '../engine/display';\nimport { s } from './other';\n"),
        file('src/engine/c.ts', "import { t } from '../data/index';\nimport { r } from '../core/rng';\n"),
      ]),
    ).toEqual([]);
  });

  it('forbids the engine from importing scenes and data from importing the engine', () => {
    expect(checkBoundaries([file('src/engine/c.ts', "import { s } from '../scenes/battleScene';\n")])).toHaveLength(1);
    expect(checkBoundaries([file('src/data/d.ts', "export { x } from '../engine/assets';\n")])).toHaveLength(1);
    expect(checkBoundaries([file('src/core/e.ts', "const m = await import('../scenes/x');\n")])).toHaveLength(1);
  });

  it('forbids DOM, storage, clocks and unseeded randomness in core code', () => {
    for (const snippet of ['const w = window.innerWidth;', 'localStorage.getItem("k");', 'const r = Math.random();', 'const t = Date.now();', 'const t = performance.now();', 'requestAnimationFrame(tick);', 'const d = new Date();']) {
      expect(checkBoundaries([file('src/core/x.ts', `${snippet}\n`)]), snippet).toHaveLength(1);
    }
  });

  it('does not flag those words in comments or strings', () => {
    const text = "// never call Math.random() here\n/* window and document */\nconst label = 'Date.now is banned';\nconst ok = 1;\n";
    expect(checkBoundaries([file('src/core/x.ts', text)])).toEqual([]);
  });

  it('allows the same calls outside core', () => {
    expect(checkBoundaries([file('src/engine/x.ts', 'const t = performance.now(); const w = window.innerWidth;\n')])).toEqual([]);
  });

  it('reports the line of a violation', () => {
    const problems = checkBoundaries([file('src/core/x.ts', 'const a = 1;\n\nconst r = Math.random();\n')]);
    expect(problems[0]).toMatch(/src\/core\/x\.ts:3/);
  });

  it('stripNoise keeps line numbers and blanks comment and string contents', () => {
    const out = stripNoise("a // c\n/* x\ny */ b 'str'");
    expect(out.split('\n')).toHaveLength(3);
    expect(out).not.toMatch(/str|\bc\b|\bx\b/);
    expect(out).toMatch(/a/);
  });
});
