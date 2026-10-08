import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { lintRepository, lintScript, lintStory, loadStory, parseLedger, type StoryFiles } from '../tools/lint-sources';
import { SOURCE_NAMES } from '../src/data/sourceNames';
import { campaignStory } from '../src/data/story';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const real = parseLedger(readFileSync(join(root, 'docs', 'SOURCES.md'), 'utf8'));

const ledger = parseLedger(
  [
    '| ID | Claim |',
    '|---|---|',
    '| `CH-00` | Prologue |',
    '| `CH-00.E3` | Ayyub supplied boats |',
    '| `CHR-AYYUB` | Ayyub |',
    '| `CDX-P-AYYUB` | Najm ad-Din Ayyub |',
    '| `SRC-IKH` | Ibn Khallikan |',
    '| `CHR-GEN-*` | generic troops |',
    '| `SUP-A-B-C` **S** | a scene |',
    '| `SUP-A-B-B` | another |',
    '| `UNV-01` | unverified |',
    '| `EXC-01` | excluded |',
    'prose with `CH-99` in the text, not a row',
  ].join('\n'),
);

const story = (extra: Partial<StoryFiles> = {}): StoryFiles => ({
  characters: [{ file: 'characters.json', data: [{ id: 'ayyub', name: 'Ayyub', ledger: 'CHR-AYYUB', portrait: null }] }],
  scenes: [],
  supports: [],
  codex: [],
  ...extra,
});
const scene = (id: string, cmds: unknown[], ledgerIds: string[] = ['CH-00.E3']) => ({ file: `${id}.scene.json`, data: { id, title: id, ledger: ledgerIds, cmds } });
const doc = (src: string[]) => ({ say: { who: 'ayyub', text: 'He sent boats.', kind: 'documented', src } });
const errors = (issues: ReturnType<typeof lintStory>): string[] => issues.filter((i) => i.severity === 'error').map((i) => i.message);

describe('reading the ledger', () => {
  it('finds the ids in the first column of the tables, and only there', () => {
    expect(ledger.has('CH-00.E3')).toBe(true);
    expect(ledger.has('SUP-A-B-C')).toBe(true);
    expect(ledger.has('CH-99')).toBe(false);
    expect(ledger.sliceSupports).toEqual(['SUP-A-B-C']);
  });

  it('lets a starred row stand for everything that begins the same way', () => {
    expect(ledger.has('CHR-GEN-TIKRIT')).toBe(true);
    expect(ledger.has('CHR-GEN-')).toBe(false);
    expect(ledger.has('CHR-OTHER')).toBe(false);
  });

  it('reads the real ledger: chapters, claims, characters, supports, Codex entries, exclusions and unverified items', () => {
    for (const id of ['CH-00', 'CH-00.E3', 'CH-03.E8', 'CHR-SALAH', 'CHR-AYYUB', 'CHR-RECRUIT', 'SUP-AYYUB-SHIRKUH-C', 'CDX-P-SALAH', 'EXC-01', 'UNV-01', 'SRC-IS', 'SRC-IAT']) {
      expect(real.has(id), id).toBe(true);
    }
    expect(real.has('CHR-GEN-TIKRIT-GARRISON')).toBe(true);
    expect(real.ids.size).toBeGreaterThan(150);
    expect(real.sliceSupports.length).toBeGreaterThanOrEqual(9);
  });
});

describe('the story against the ledger', () => {
  it('passes a character, a scene and a documented line that cite real rows', () => {
    expect(errors(lintStory(ledger, story({ scenes: [scene('a.one', [doc(['CH-00.E3'])])] })))).toEqual([]);
  });

  it('finds a character whose row is missing', () => {
    const bad = story({ characters: [{ file: 'c.json', data: [{ id: 'x', name: 'X', ledger: 'CHR-NOBODY', portrait: null }] }] });
    expect(errors(lintStory(ledger, bad))).toEqual([expect.stringMatching(/CHR-NOBODY.*not in the ledger/)]);
  });

  it('finds a documented line with no citation, and one that cites a row that is not there', () => {
    expect(errors(lintStory(ledger, story({ scenes: [scene('a.one', [doc([])])] })))[0]).toMatch(/must cite the ledger/);
    expect(errors(lintStory(ledger, story({ scenes: [scene('a.one', [doc(['CH-77.E1'])])] })))[0]).toMatch(/CH-77.E1.*not in the ledger/);
  });

  it('keeps the main story off unverified and excluded rows', () => {
    expect(errors(lintStory(ledger, story({ scenes: [scene('a.one', [doc(['UNV-01'])])] })))[0]).toMatch(/unverified or excluded/);
    expect(errors(lintStory(ledger, story({ scenes: [scene('a.one', [doc(['EXC-01'])])] })))[0]).toMatch(/unverified or excluded/);
    const issues = lintStory(ledger, story({ scenes: [scene('a.one', [doc(['CH-00.E3'])], ['UNV-01'])] }));
    expect(errors(issues).some((m) => /UNV-01.*cannot back a scene/.test(m))).toBe(true);
  });

  it('wants every scene of the story to stand on at least one row', () => {
    expect(errors(lintStory(ledger, story({ scenes: [scene('a.one', [doc(['CH-00.E3'])], [])] })))[0]).toMatch(/stands on no ledger row/);
  });

  it('checks a support’s scenes and its ledger rows', () => {
    const scenes = [scene('a.c', [doc(['CH-00.E3'])])];
    const support = (ledgerId: string, sceneId = 'a.c') => ({ file: 's.json', data: [{ id: 'p', a: 'ayyub', b: 'x', pace: 'normal', scenes: { C: { scene: sceneId, ledger: ledgerId } } }] });
    expect(errors(lintStory(ledger, story({ scenes, supports: [support('SUP-A-B-C')] })))).toEqual([]);
    expect(errors(lintStory(ledger, story({ scenes, supports: [support('SUP-NOPE-C')] })))[0]).toMatch(/SUP-NOPE-C.*not in the ledger/);
    expect(errors(lintStory(ledger, story({ scenes, supports: [support('SUP-A-B-C', 'a.zzz')] })))[0]).toMatch(/does not exist/);
  });

  it('reports the slice supports still to write as a warning, not an error', () => {
    const issues = lintStory(ledger, story());
    expect(issues.filter((i) => i.severity === 'warning')).toEqual([expect.objectContaining({ message: expect.stringMatching(/SUP-A-B-C/) })]);
    expect(errors(issues)).toEqual([]);
  });

  it('reports malformed files rather than failing', () => {
    expect(errors(lintStory(ledger, story({ characters: [{ file: 'c.json', data: { not: 'a list' } }] })))[0]).toMatch(/list of characters/);
    expect(errors(lintStory(ledger, story({ supports: [{ file: 's.json', data: 'nope' }] })))[0]).toMatch(/list of supports/);
  });

  it('is lenient about rows for demo and test data, but not about structure', () => {
    const demo = story({
      characters: [{ file: 'c.json', data: [{ id: 'x', name: 'X', ledger: 'CHR-GEN-DEMO', portrait: null }] }],
      scenes: [{ file: 'd.scene.json', data: { id: 'demo.a', title: 'A', ledger: [], cmds: [{ say: { who: 'x', text: 'Hm.', kind: 'dramatized' } }] } }],
    });
    expect(errors(lintStory(ledger, demo, { lenient: true }))).toEqual([]);
    const broken = story({ scenes: [{ file: 'd.scene.json', data: { id: 'demo.a', title: 'A', ledger: [], cmds: [{ say: { who: 'ayyub', text: 'x', kind: 'documented' } }] } }] });
    expect(errors(lintStory(ledger, broken, { lenient: true }))[0]).toMatch(/must cite the ledger/);
  });
});

describe('the Codex against the ledger', () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    id: 'CDX-P-AYYUB',
    category: 'people',
    title: 'Najm ad-Din Ayyub',
    unlock: { chapter: 'CH-00', at: 'start' },
    body: ['Keeper of the citadel of Tikrit.'],
    confidence: 'attested',
    sources: ['SRC-IKH', 'CH-00.E3'],
    ...over,
  });
  const codex = (...entries: unknown[]) => story({ codex: [{ file: 'codex/people.json', data: entries }] });

  it('passes an entry whose id and sources are rows', () => {
    expect(errors(lintStory(ledger, codex(entry())))).toEqual([]);
  });

  it('finds an entry, or a source, that is not in the ledger', () => {
    expect(errors(lintStory(ledger, codex(entry({ id: 'CDX-P-NOBODY' }))))).toEqual([expect.stringContaining('"CDX-P-NOBODY" is not in the ledger')]);
    expect(errors(lintStory(ledger, codex(entry({ sources: ['SRC-NOWHERE'] }))))).toEqual([expect.stringContaining('"SRC-NOWHERE" is not in the ledger')]);
    expect(errors(lintStory(ledger, codex(entry({ sources: ['UNV-01'] }))))).toEqual([expect.stringContaining('unverified or excluded')]);
  });

  it('is lenient about rows for demo entries', () => {
    expect(errors(lintStory(ledger, codex(entry({ id: 'CDX-P-DEMO', sources: ['D-008'] })), { lenient: true }))).toEqual([]);
  });

  it('reports a malformed Codex file rather than failing', () => {
    expect(errors(lintStory(ledger, story({ codex: [{ file: 'codex/x.json', data: { not: 'a list' } }] })))).toEqual(['must be a list of Codex entries']);
  });
});

describe('the Codex’s source names', () => {
  it('names only sources that are rows of the ledger, and every source the campaign’s entries cite', () => {
    for (const id of Object.keys(SOURCE_NAMES)) expect(real.has(id), id).toBe(true);
    for (const entry of campaignStory.codex.values()) {
      for (const id of entry.sources) if (id.startsWith('SRC-') || id.startsWith('MOD-')) expect(SOURCE_NAMES[id], `${entry.id} cites ${id}`).toBeDefined();
      for (const block of entry.differ ?? []) for (const p of block.positions) expect(SOURCE_NAMES[p.source], `${entry.id}: ${p.source}`).toBeDefined();
    }
  });
});

describe('the script', () => {
  it('finds Arabic script anywhere in the data, except in a verified names file', () => {
    const files = [{ file: 'src/data/a.json', data: { x: ['fine', { y: 'قال' }] } }, { file: 'src/data/names.json', data: { z: 'صلاح' } }];
    const issues = lintScript(files);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.where).toBe('src/data/a.json: x[1].y');
  });
});

describe('the repository', () => {
  it('has no source errors: every citation in the data is in the ledger', () => {
    const issues = lintRepository(root);
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('keeps the campaign’s story and the demos’ apart', () => {
    const { campaign, demo, all } = loadStory(root);
    expect(demo.scenes.length).toBeGreaterThanOrEqual(3);
    expect(demo.supports).toHaveLength(1);
    expect(campaign.scenes.every((s) => !s.file.includes('/test/'))).toBe(true);
    expect(all.length).toBeGreaterThan(10);
  });
});
