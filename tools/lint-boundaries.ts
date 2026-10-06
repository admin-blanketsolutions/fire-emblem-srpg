import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Architecture lint (DESIGN §3). The rules are small and mechanical:
 *  - layers import downwards only: core ← data ← engine ← scenes;
 *  - `core` is pure: no DOM, no storage, no wall clock and no unseeded randomness, so every
 *    battle can be replayed from a seed.
 */

export interface SourceFile {
  /** Path relative to the repository root, with forward slashes, e.g. `src/core/rng.ts`. */
  readonly path: string;
  readonly text: string;
}

const LAYERS = ['core', 'data', 'engine', 'scenes'] as const;
type Layer = (typeof LAYERS)[number];

/** For each layer, the layers it may import from (itself is always allowed). */
const MAY_IMPORT: Readonly<Record<Layer, readonly Layer[]>> = {
  core: [],
  data: ['core'],
  engine: ['core', 'data'],
  scenes: ['core', 'data', 'engine'],
};

const FORBIDDEN_IN_CORE: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bdocument\b/, 'document (the DOM)'],
  [/\bwindow\b/, 'window (the DOM)'],
  [/\blocalStorage\b/, 'localStorage'],
  [/\bsessionStorage\b/, 'sessionStorage'],
  [/\bMath\.random\b/, 'Math.random (use the seeded Rng)'],
  [/\bDate\.now\b/, 'Date.now (inject the time instead)'],
  [/\bnew Date\b/, 'new Date (inject the time instead)'],
  [/\bperformance\.now\b/, 'performance.now'],
  [/\brequestAnimationFrame\b/, 'requestAnimationFrame'],
  [/\bsetTimeout\b/, 'setTimeout'],
  [/\bsetInterval\b/, 'setInterval'],
  [/\bfetch\s*\(/, 'fetch (core does no I/O)'],
];

/** Blank out comments and string contents so words inside them are not flagged. Keeps line numbers. */
export function stripNoise(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text.charAt(i);
    const next = text.charAt(i + 1);
    if (c === '/' && next === '/') {
      while (i < text.length && text.charAt(i) !== '\n') i++;
    } else if (c === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text.charAt(i) === '*' && text.charAt(i + 1) === '/')) {
        out += text.charAt(i) === '\n' ? '\n' : ' ';
        i++;
      }
      i += 2;
    } else if (c === '"' || c === "'" || c === '`') {
      out += c;
      i++;
      while (i < text.length && text.charAt(i) !== c) {
        if (text.charAt(i) === '\\') {
          out += ' ';
          i++;
        }
        out += text.charAt(i) === '\n' ? '\n' : ' ';
        i++;
      }
      out += c;
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function layerOf(path: string): Layer | null {
  const parts = path.split('/');
  if (parts[0] !== 'src') return null;
  return (LAYERS as readonly string[]).includes(parts[1] ?? '') ? (parts[1] as Layer) : null;
}

const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\1/g;

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

export function checkBoundaries(files: readonly SourceFile[]): string[] {
  const problems: string[] = [];
  for (const file of files) {
    const layer = layerOf(file.path);
    if (!layer) continue;

    // Imports are read from the original text: the specifier is a string, which stripNoise blanks.
    const withoutComments = file.text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
    for (const match of withoutComments.matchAll(IMPORT_RE)) {
      const spec = match[2] ?? '';
      if (!spec.startsWith('.')) continue;
      const target = layerOf(posix(relative('.', resolve(dirname(file.path), spec))));
      if (target && target !== layer && !MAY_IMPORT[layer].includes(target)) {
        problems.push(`${file.path}:${lineOf(file.text, match.index ?? 0)}: ${layer} must not import from ${target} ("${spec}")`);
      }
    }

    if (layer === 'core') {
      const code = stripNoise(file.text);
      for (const [pattern, name] of FORBIDDEN_IN_CORE) {
        const hit = pattern.exec(code);
        if (hit) problems.push(`${file.path}:${lineOf(code, hit.index)}: core must not use ${name}`);
      }
    }
  }
  return problems;
}

function posix(p: string): string {
  return p.split(sep).join('/');
}

function collect(dir: string, root: string, out: SourceFile[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, root, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push({ path: posix(relative(root, full)), text: readFileSync(full, 'utf8') });
  }
}

export function loadSourceFiles(root: string): SourceFile[] {
  const files: SourceFile[] = [];
  collect(join(root, 'src'), root, files);
  return files;
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const problems = checkBoundaries(loadSourceFiles(root));
  for (const p of problems) console.log(`ERROR ${p}`);
  console.log(`Layering lint: ${problems.length} problem(s)`);
  process.exit(problems.length > 0 ? 1 : 0);
}
