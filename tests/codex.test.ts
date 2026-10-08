import { describe, expect, it } from 'vitest';
import { BADGES, buildCodexTable, CATEGORY_NAMES, CODEX_CATEGORIES, entriesUnlockedAt, unlock, unlockedIn, type CodexEntry } from '../src/core/codex';
import { campaignStory, demoStory } from '../src/data/story';

const entry = (over: Partial<Record<keyof CodexEntry, unknown>> = {}): Record<string, unknown> => ({
  id: 'CDX-S-YEAR',
  category: 'sources',
  title: 'Which year?',
  unlock: { chapter: 'CH-02', at: 'start' },
  body: ['The sources disagree.'],
  confidence: 'attested-differ',
  sources: ['SRC-IS', 'SRC-IKH'],
  differ: [{ claim: 'The year', positions: [{ source: 'SRC-IS', says: '558' }, { source: 'SRC-IKH', says: '559' }] }],
  ...over,
});

describe('Codex entries (DESIGN §9.4)', () => {
  it('accepts a well-formed entry with its sources-differ block', () => {
    const table = buildCodexTable([entry()]);
    expect(table.get('CDX-S-YEAR')?.differ?.[0]?.positions).toHaveLength(2);
  });

  it('refuses malformed entries, saying which and why', () => {
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [entry({ id: 'salah' }), /ledger row/],
      [entry({ category: 'heroes' }), /category/],
      [entry({ category: 'people' }), /starts CDX-P-/],
      [entry({ title: '' }), /title/],
      [entry({ unlock: { chapter: 'CH-02', at: 'middle' } }), /unlock/],
      [entry({ body: [] }), /body/],
      [entry({ confidence: 'unverified' }), /unverified claims stay out/],
      [entry({ sources: [] }), /name its sources/],
      [entry({ sources: ['UNV-03'] }), /unverified or excluded/],
      [entry({ differ: [] }), /must show how/],
      [entry({ differ: [{ claim: 'x', positions: [{ source: 'SRC-IS', says: '558' }] }] }), /at least two positions/],
      [entry({ body: ['صلاح'] }), /Arabic script/],
      [entry({ dramatized: ['no-such-scene'] }), /unknown scene/],
    ];
    for (const [raw, message] of cases) expect(() => buildCodexTable([raw], { scenes: new Set() }), String(message)).toThrow(message);
    expect(() => buildCodexTable([entry(), entry()])).toThrow(/duplicate/);
  });

  it('gives Game vs History entries no badge', () => {
    const game = entry({ id: 'CDX-G-CH00', category: 'game', confidence: null, differ: undefined });
    expect(buildCodexTable([game]).get('CDX-G-CH00')?.confidence).toBeNull();
    expect(() => buildCodexTable([{ ...game, confidence: 'attested' }])).toThrow(/no confidence badge/);
  });

  it('checks the ledger when asked', () => {
    const known = (id: string) => id !== 'SRC-IKH';
    expect(() => buildCodexTable([entry()], { knownLedgerId: known })).toThrow(/"SRC-IKH" is not in the ledger/);
  });

  it('names every category and badge for the screen', () => {
    expect(CODEX_CATEGORIES.map((c) => CATEGORY_NAMES[c])).toEqual(['People', 'Places', 'Events', 'Terms', 'Sources & Disputes', 'Game vs History']);
    expect(BADGES['attested-differ']).toBe('Attested, sources differ');
  });
});

describe('unlocking', () => {
  const table = buildCodexTable([
    entry(),
    entry({ id: 'CDX-S-LATER', unlock: { chapter: 'CH-02', at: 'end' } }),
    entry({ id: 'CDX-P-SOMEONE', category: 'people', confidence: 'attested', differ: undefined, unlock: { chapter: 'CH-00', at: 'start' } }),
  ]);

  it('unlocks a chapter’s entries at its start or its end', () => {
    expect(entriesUnlockedAt(table, 'CH-02', 'start').map((e) => e.id)).toEqual(['CDX-S-YEAR']);
    expect(entriesUnlockedAt(table, 'CH-02', 'end').map((e) => e.id)).toEqual(['CDX-S-LATER']);
  });

  it('reports only what is new, and ignores ids it does not know', () => {
    const unlocked = new Set<string>();
    expect(unlock(unlocked, table, ['CDX-S-YEAR', 'CDX-X-NOPE']).map((e) => e.id)).toEqual(['CDX-S-YEAR']);
    expect(unlock(unlocked, table, ['CDX-S-YEAR'])).toEqual([]);
    expect(unlockedIn(table, unlocked, 'sources').map((e) => e.id)).toEqual(['CDX-S-YEAR']);
    expect(unlockedIn(table, unlocked, 'people')).toEqual([]);
  });
});

describe('the Codex data', () => {
  it('has the first campaign entry, showing both years of the first expedition', () => {
    const e = campaignStory.codex.get('CDX-S-EXPEDITION-DATES');
    expect(e?.confidence).toBe('attested-differ');
    expect(e?.differ?.[0]?.positions.map((p) => p.source)).toEqual(['SRC-IS', 'SRC-IKH']);
  });

  it('gives the demos the campaign’s entries and their own, which say they are demos', () => {
    expect(demoStory.codex.has('CDX-S-EXPEDITION-DATES')).toBe(true);
    const demos = [...demoStory.codex.values()].filter((e) => e.demo);
    expect(demos.length).toBeGreaterThan(0);
    for (const e of demos) expect(e.body[0]).toMatch(/^This is a demo entry/);
    for (const e of campaignStory.codex.values()) expect(e.demo).toBeFalsy();
  });
});
