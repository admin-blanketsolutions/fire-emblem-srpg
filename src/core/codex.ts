import { deniedWordIn, hasArabicScript, stringsIn } from './sensitive';

/**
 * The Codex (DESIGN §9.4): short entries on the people, places, events and terms of each chapter,
 * on where the sources disagree, and on what the game invents. Every entry is a row of the ledger
 * (`CDX-…` in docs/SOURCES.md), carries its confidence badge and its sources, and shows each
 * position when the sources differ.
 */

export const CODEX_CATEGORIES = ['people', 'places', 'events', 'terms', 'sources', 'game'] as const;
export type CodexCategory = (typeof CODEX_CATEGORIES)[number];

export const CATEGORY_NAMES: Readonly<Record<CodexCategory, string>> = {
  people: 'People',
  places: 'Places',
  events: 'Events',
  terms: 'Terms',
  sources: 'Sources & Disputes',
  game: 'Game vs History',
};

/** The ledger id's letter for each category: `CDX-P-…` is a person, `CDX-G-…` a Game vs History note. */
const PREFIX: Readonly<Record<CodexCategory, string>> = { people: 'P', places: 'L', events: 'E', terms: 'T', sources: 'S', game: 'G' };

/** The ledger's confidence labels that may be shown (SOURCES §1.1); unverified claims never reach the Codex. */
export const CONFIDENCES = ['attested', 'attested-differ', 'inferred', 'fictional'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const BADGES: Readonly<Record<Confidence, string>> = {
  attested: 'Attested',
  'attested-differ': 'Attested, sources differ',
  inferred: 'Reasonably inferred',
  fictional: 'Fictional (game-only)',
};

export interface DifferBlock {
  /** What is disputed. */
  readonly claim: string;
  /** Each source's position, in its own words or a faithful paraphrase. */
  readonly positions: ReadonlyArray<{ readonly source: string; readonly says: string }>;
}

export interface CodexEntry {
  /** The ledger row: `CDX-P-SALAH`. */
  readonly id: string;
  readonly category: CodexCategory;
  readonly title: string;
  /** Unlocked as the chapter starts or once it ends. */
  readonly unlock: { readonly chapter: string; readonly at: 'start' | 'end' };
  /** Short paragraphs. */
  readonly body: readonly string[];
  /** The badge; Game vs History entries have none. */
  readonly confidence: Confidence | null;
  /** Ledger ids of the sources (`SRC-…`, `MOD-…`) and claims (`CH-02.E2`) the entry rests on. */
  readonly sources: readonly string[];
  readonly differ?: readonly DifferBlock[];
  /** Scenes of the chapter that are dramatized, which the entry names as such. */
  readonly dramatized?: readonly string[];
  /** Demo and test entries, which say so on screen. */
  readonly demo?: boolean;
}

export type CodexTable = ReadonlyMap<string, CodexEntry>;

export interface CodexValidation {
  /** Whether a ledger id exists; omitted for demo data, which need not be in the ledger. */
  readonly knownLedgerId?: (id: string) => boolean;
  /** Scene ids that exist, to check `dramatized`. */
  readonly scenes?: ReadonlySet<string>;
}

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string' && s.trim() !== '');

/** Validate Codex entries and index them by id. Throws a descriptive error naming the entry. */
export function buildCodexTable(raw: readonly unknown[], ctx: CodexValidation = {}): CodexTable {
  const table = new Map<string, CodexEntry>();
  raw.forEach((item, i) => {
    const e = item as Partial<CodexEntry> & Record<string, unknown>;
    const where = `codex entry #${i}${typeof e.id === 'string' ? ` "${e.id}"` : ''}`;
    if (typeof e.id !== 'string' || !/^CDX-[A-Z]-[A-Z0-9-]+$/.test(e.id)) throw new Error(`${where}: id must be a ledger row such as CDX-P-SALAH`);
    if (table.has(e.id)) throw new Error(`${where}: duplicate id`);
    if (!CODEX_CATEGORIES.includes(e.category as CodexCategory)) throw new Error(`${where}: category must be one of ${CODEX_CATEGORIES.join(', ')}`);
    const category = e.category as CodexCategory;
    if (e.id.charAt(4) !== PREFIX[category]) throw new Error(`${where}: a ${category} entry's id starts CDX-${PREFIX[category]}-`);
    if (typeof e.title !== 'string' || e.title.trim() === '') throw new Error(`${where}: missing title`);
    const unlock = e.unlock as Record<string, unknown> | undefined;
    if (!unlock || typeof unlock.chapter !== 'string' || !/^CH-[A-Z0-9]+$/.test(unlock.chapter) || (unlock.at !== 'start' && unlock.at !== 'end')) {
      throw new Error(`${where}: unlock must be { chapter: "CH-…", at: "start" | "end" }`);
    }
    if (!isStrings(e.body) || e.body.length === 0) throw new Error(`${where}: body must be a list of paragraphs`);
    if (category === 'game') {
      if (e.confidence !== null && e.confidence !== undefined) throw new Error(`${where}: Game vs History entries carry no confidence badge`);
    } else if (!CONFIDENCES.includes(e.confidence as Confidence)) {
      throw new Error(`${where}: confidence must be one of ${CONFIDENCES.join(', ')} (unverified claims stay out of the Codex)`);
    }
    if (!isStrings(e.sources) || e.sources.length === 0) throw new Error(`${where}: an entry must name its sources`);
    for (const id of e.sources) {
      if (id.startsWith('UNV-') || id.startsWith('EXC-')) throw new Error(`${where}: "${id}" is unverified or excluded and cannot back an entry`);
    }
    const differ = (e.differ ?? []) as unknown[];
    if (!Array.isArray(differ)) throw new Error(`${where}: differ must be a list`);
    differ.forEach((d, j) => {
      const block = d as Partial<DifferBlock>;
      if (typeof block.claim !== 'string' || block.claim.trim() === '') throw new Error(`${where}: differ #${j} needs a claim`);
      const positions = block.positions as unknown[] | undefined;
      if (!Array.isArray(positions) || positions.length < 2) throw new Error(`${where}: differ #${j} must give at least two positions`);
      positions.forEach((p, k) => {
        const pos = p as Record<string, unknown>;
        if (typeof pos.source !== 'string' || pos.source === '' || typeof pos.says !== 'string' || pos.says === '') throw new Error(`${where}: differ #${j} position #${k} needs a source and what it says`);
      });
    });
    if (e.confidence === 'attested-differ' && differ.length === 0) throw new Error(`${where}: an entry whose sources differ must show how (differ)`);
    if (e.dramatized !== undefined) {
      if (!isStrings(e.dramatized)) throw new Error(`${where}: dramatized must be a list of scene ids`);
      for (const scene of e.dramatized) if (ctx.scenes && !ctx.scenes.has(scene)) throw new Error(`${where}: dramatized names unknown scene "${scene}"`);
    }
    if (ctx.knownLedgerId) {
      for (const id of [e.id, ...e.sources]) if (!ctx.knownLedgerId(id)) throw new Error(`${where}: "${id}" is not in the ledger`);
    }
    for (const { path, text } of stringsIn(e)) {
      if (hasArabicScript(text)) throw new Error(`${where}: ${path} contains Arabic script; text is written in Latin letters`);
    }
    // identifiers only: prose may use any ordinary word (see core/sensitive.ts)
    for (const id of [e.id, ...(e.dramatized ?? [])]) {
      const denied = deniedWordIn(id);
      if (denied) throw new Error(`${where}: "${id}" contains "${denied}", which the project never depicts`);
    }
    table.set(e.id, e as CodexEntry);
  });
  return table;
}

/** Entries that unlock as a chapter starts or ends, in table order. */
export function entriesUnlockedAt(table: CodexTable, chapter: string, at: 'start' | 'end'): CodexEntry[] {
  return [...table.values()].filter((e) => e.unlock.chapter === chapter && e.unlock.at === at);
}

/** Unlock entries by id into a campaign's set; returns the ones that are new. Unknown ids are ignored. */
export function unlock(unlocked: Set<string>, table: CodexTable, ids: Iterable<string>): CodexEntry[] {
  const fresh: CodexEntry[] = [];
  for (const id of ids) {
    const entry = table.get(id);
    if (!entry || unlocked.has(id)) continue;
    unlocked.add(id);
    fresh.push(entry);
  }
  return fresh;
}

/** The unlocked entries of a category, in table order. */
export function unlockedIn(table: CodexTable, unlocked: ReadonlySet<string>, category: CodexCategory): CodexEntry[] {
  return [...table.values()].filter((e) => e.category === category && unlocked.has(e.id));
}
