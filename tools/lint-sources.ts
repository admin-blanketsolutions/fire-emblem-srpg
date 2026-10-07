import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildCharacterTable, type CharacterTable } from '../src/core/characters';
import { buildSceneTable, type SceneTable } from '../src/core/dialogue';
import { hasArabicScript, stringsIn } from '../src/core/sensitive';
import { buildSupportTable } from '../src/core/supports';

/**
 * The source lint (DESIGN §14). The ledger, `docs/SOURCES.md`, is the join between the story
 * and the sources: every character, scene and support in the data names the ledger rows it stands
 * on, and this tool fails if a row is missing, if a documented line has no citation, if the main
 * story cites a row the ledger marks unverified or excluded, or if Arabic script has crept in.
 */

export interface Ledger {
  /** Every id in the first column of a ledger table, with the line it is on. */
  readonly ids: ReadonlyMap<string, number>;
  /** Support rows the ledger marks as part of the vertical slice (bold S). */
  readonly sliceSupports: readonly string[];
  has(id: string): boolean;
}

const ROW_ID = /^\|\s*`([A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9*]+)+(?:\.[A-Za-z0-9]+)*)`(\s*\*\*S\*\*)?/;

/** Read the ids out of the ledger's tables. An id ending in `*` stands for every id that starts the same way. */
export function parseLedger(markdown: string): Ledger {
  const ids = new Map<string, number>();
  const sliceSupports: string[] = [];
  markdown.split('\n').forEach((line, i) => {
    const m = ROW_ID.exec(line);
    if (!m?.[1]) return;
    ids.set(m[1], i + 1);
    if (m[1].startsWith('SUP-') && m[2]) sliceSupports.push(m[1]);
  });
  const wildcards = [...ids.keys()].filter((id) => id.endsWith('*')).map((id) => id.slice(0, -1));
  return {
    ids,
    sliceSupports,
    has: (id) => ids.has(id) || wildcards.some((prefix) => id.startsWith(prefix) && id.length > prefix.length),
  };
}

export interface Issue {
  readonly severity: 'error' | 'warning';
  readonly where: string;
  readonly message: string;
}

export interface JsonFile {
  readonly file: string;
  readonly data: unknown;
}

/** The story data of one group: the real campaign, or the demos and tests that stand in for it. */
export interface StoryFiles {
  readonly characters: readonly JsonFile[];
  readonly scenes: readonly JsonFile[];
  readonly supports: readonly JsonFile[];
}

export interface LintOptions {
  /** Demo and test data: structure is checked, but rows need not be in the ledger. */
  readonly lenient?: boolean;
}

const attempt = <T>(where: string, issues: Issue[], f: () => T): T | null => {
  try {
    return f();
  } catch (error) {
    issues.push({ severity: 'error', where, message: error instanceof Error ? error.message : String(error) });
    return null;
  }
};

/** Check one group of story files against the ledger. */
export function lintStory(ledger: Ledger, story: StoryFiles, options: LintOptions = {}): Issue[] {
  const issues: Issue[] = [];
  const known = options.lenient ? undefined : (id: string): boolean => ledger.has(id);

  // characters
  const characterEntries: unknown[] = [];
  for (const { file, data } of story.characters) {
    if (!Array.isArray(data)) {
      issues.push({ severity: 'error', where: file, message: 'must be a list of characters' });
      continue;
    }
    characterEntries.push(...data);
  }
  const characters: CharacterTable =
    attempt('characters', issues, () => buildCharacterTable(characterEntries)) ?? new Map();
  if (known) {
    for (const c of characters.values()) {
      if (!known(c.ledger)) issues.push({ severity: 'error', where: `character "${c.id}"`, message: `"${c.ledger}" is not in the ledger` });
    }
  }

  // scenes
  const sceneEntries = story.scenes.map((f) => f.data);
  const ctx = { characters, ...(known ? { knownLedgerId: known } : {}) };
  const scenes: SceneTable = attempt('scenes', issues, () => buildSceneTable(sceneEntries, ctx)) ?? new Map();
  for (const scene of scenes.values()) {
    if (!options.lenient && scene.ledger.length === 0) issues.push({ severity: 'error', where: `scene "${scene.id}"`, message: 'stands on no ledger row: it needs at least one in ledger' });
    for (const id of scene.ledger) {
      if (id.startsWith('UNV-') || id.startsWith('EXC-')) issues.push({ severity: 'error', where: `scene "${scene.id}"`, message: `"${id}" is unverified or excluded and cannot back a scene` });
    }
  }

  // supports
  const supportEntries: unknown[] = [];
  for (const { file, data } of story.supports) {
    if (!Array.isArray(data)) {
      issues.push({ severity: 'error', where: file, message: 'must be a list of supports' });
      continue;
    }
    supportEntries.push(...data);
  }
  const supports = attempt('supports', issues, () => buildSupportTable(supportEntries, { scenes, ...(known ? { knownLedgerId: known } : {}) }));

  // the ledger's slice supports with no scene yet are work still to do, not a fault
  if (!options.lenient && supports) {
    const written = new Set([...supports.values()].flatMap((s) => Object.values(s.scenes).map((sc) => sc?.ledger)));
    const missing = ledger.sliceSupports.filter((id) => !written.has(id));
    if (missing.length > 0) issues.push({ severity: 'warning', where: 'supports', message: `${missing.length} support scenes of the slice are not written yet: ${missing.join(', ')}` });
  }
  return issues;
}

/** Arabic script appears nowhere in the data but in names that have been verified (none in the slice). */
export function lintScript(files: readonly JsonFile[], allowed: readonly string[] = ['names.json']): Issue[] {
  const issues: Issue[] = [];
  for (const { file, data } of files) {
    if (allowed.some((a) => file.endsWith(a))) continue;
    for (const { path, text } of stringsIn(data)) {
      if (hasArabicScript(text)) issues.push({ severity: 'error', where: `${file}: ${path}`, message: 'contains Arabic script; text is written in Latin letters (DECISIONS D-005)' });
    }
  }
  return issues;
}

// ------------------------------------------------------------------ reading the repository

const posix = (p: string): string => p.split(sep).join('/');

function jsonIn(dir: string, root: string, suffix = '.json'): JsonFile[] {
  if (!existsSync(dir)) return [];
  const out: JsonFile[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...jsonIn(full, root, suffix));
    else if (name.endsWith(suffix)) out.push({ file: posix(relative(root, full)), data: JSON.parse(readFileSync(full, 'utf8')) as unknown });
  }
  return out;
}

function one(path: string, root: string): JsonFile[] {
  return existsSync(path) ? [{ file: posix(relative(root, path)), data: JSON.parse(readFileSync(path, 'utf8')) as unknown }] : [];
}

/** Read the story data of the repository: the campaign's, and the demos'. */
export function loadStory(root: string): { campaign: StoryFiles; demo: StoryFiles; all: JsonFile[] } {
  const data = join(root, 'src', 'data');
  const campaign: StoryFiles = {
    characters: one(join(data, 'characters.json'), root),
    scenes: jsonIn(join(data, 'scenes'), root, '.scene.json'),
    supports: one(join(data, 'supports.json'), root),
  };
  const demo: StoryFiles = {
    characters: one(join(data, 'test', 'characters.json'), root),
    scenes: jsonIn(join(data, 'test', 'scenes'), root, '.scene.json'),
    supports: one(join(data, 'test', 'supports.json'), root),
  };
  return { campaign, demo, all: jsonIn(data, root) };
}

/** Everything the lint checks, over a repository root. */
export function lintRepository(root: string): Issue[] {
  const ledger = parseLedger(readFileSync(join(root, 'docs', 'SOURCES.md'), 'utf8'));
  const { campaign, demo, all } = loadStory(root);
  return [...lintStory(ledger, campaign), ...lintStory(ledger, demo, { lenient: true }), ...lintScript(all)];
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const issues = lintRepository(root);
  for (const i of issues) console.log(`${i.severity === 'error' ? 'ERROR' : 'warn '} ${i.where}: ${i.message}`);
  const errors = issues.filter((i) => i.severity === 'error').length;
  console.log(`Source lint: ${errors} error(s), ${issues.length - errors} warning(s)`);
  process.exit(errors > 0 ? 1 : 0);
}
