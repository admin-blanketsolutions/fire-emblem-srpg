import { describe, expect, it } from 'vitest';
import { buildCharacterTable, plateName } from '../src/core/characters';
import { buildSceneTable, DialogueRunner, markFor, paginate, validateScene, type SceneDef } from '../src/core/dialogue';
import { charsPerSecond, DEFAULT_SETTINGS, parseSettings } from '../src/core/settings';
import { deniedWordIn, hasArabicScript, stringsIn } from '../src/core/sensitive';

const characters = buildCharacterTable([
  { id: 'ayyub', name: 'Najm ad-Din Ayyub', short: 'Ayyub', ledger: 'CHR-AYYUB', portrait: 'portrait.ayyub' },
  { id: 'shirkuh', name: 'Asad ad-Din Shirkuh', short: 'Shirkuh', ledger: 'CHR-SHIRKUH', portrait: null },
]);
const ledger = new Set(['CH-00.E5', 'SUP-AYYUB-SHIRKUH-C', 'UNV-01', 'EXC-01']);
const ctx = { characters, knownLedgerId: (id: string) => ledger.has(id) };

const scene = (cmds: unknown[], extra: Record<string, unknown> = {}): unknown => ({ id: 'test.scene', title: 'A test', ledger: ['CH-00.E5'], cmds, ...extra });
const doc = { say: { who: 'ayyub', text: 'Take him to the cell.', kind: 'documented', src: ['CH-00.E5'] } };
const drama = { say: { who: 'shirkuh', text: 'It was a matter of honour.', kind: 'dramatized' } };
const tell = { say: { who: 'narrator', text: 'The gate was shut.', kind: 'narration' } };

describe('characters', () => {
  it('builds a table and names the plate', () => {
    expect(characters.size).toBe(2);
    expect(plateName(characters.get('ayyub')!)).toBe('Ayyub');
  });

  it('rejects bad data', () => {
    const ok = { id: 'x', name: 'X', ledger: 'CHR-X', portrait: null };
    expect(() => buildCharacterTable([{ ...ok, id: 'X Y' }])).toThrow(/lower-case/);
    expect(() => buildCharacterTable([{ ...ok, id: 'narrator' }])).toThrow(/built in/);
    expect(() => buildCharacterTable([ok, ok])).toThrow(/duplicate/);
    expect(() => buildCharacterTable([{ ...ok, ledger: 'X' }])).toThrow(/CHR-/);
    expect(() => buildCharacterTable([{ ...ok, name: '' }])).toThrow(/name/);
    expect(() => buildCharacterTable([{ ...ok, portrait: 1 }])).toThrow(/portrait/);
    expect(() => buildCharacterTable([{ ...ok, name: 'صلاح' }])).toThrow(/Latin/);
  });

  it('never depicts the Prophet or the Companions: identifiers are refused', () => {
    const ok = { name: 'X', ledger: 'CHR-X' };
    expect(() => buildCharacterTable([{ ...ok, id: 'sahaba-one', portrait: null }])).toThrow(/never depicts/);
    expect(() => buildCharacterTable([{ ...ok, id: 'x', portrait: 'portrait.the-prophet' }])).toThrow(/never depicts/);
    // a name is not an identifier: Muhammad is a common name
    expect(buildCharacterTable([{ ...ok, id: 'muhammad-ibn-x', name: 'Muhammad ibn X', portrait: null }]).size).toBe(1);
  });
});

describe('the sensitivity checks', () => {
  it('finds a denied word only as a word of an identifier', () => {
    expect(deniedWordIn('portrait.prophet')).toBe('prophet');
    expect(deniedWordIn('unit.the-companion')).toBe('companion');
    expect(deniedWordIn('unit.prophetic')).toBeNull();
    expect(deniedWordIn('portrait.ayyub')).toBeNull();
  });

  it('finds Arabic script and nothing else', () => {
    expect(hasArabicScript('Salah ad-Din')).toBe(false);
    expect(hasArabicScript('ʿAli ibn ʾAhmad')).toBe(false);
    expect(hasArabicScript('صلاح الدين')).toBe(true);
    expect(hasArabicScript('x ﷺ y')).toBe(true);
  });

  it('walks every string in a value', () => {
    expect([...stringsIn({ a: 'x', b: [{ c: 'y' }, 1], d: null })].map((s) => `${s.path}=${s.text}`)).toEqual(['a=x', 'b[0].c=y']);
  });
});

describe('validating a scene', () => {
  it('accepts a scene of every command', () => {
    const raw = scene([
      { show: { who: 'ayyub', at: 'left' } },
      { bg: 'tikrit-gate' },
      { music: 'story' },
      doc,
      { sfx: 'gate' },
      { wait: 400 },
      drama,
      tell,
      { flag: 'ayyub-wrote' },
      { unlock: 'CDX-P-BIHRUZ' },
      { music: null },
      { hide: 'ayyub' },
    ]);
    expect(validateScene(raw, ctx).cmds).toHaveLength(12);
  });

  it('a documented line must cite the ledger: there are no fabricated quotes', () => {
    const bare = { say: { who: 'ayyub', text: 'He said it.', kind: 'documented' } };
    expect(() => validateScene(scene([bare]), ctx)).toThrow(/must cite the ledger/);
    expect(() => validateScene(scene([{ say: { ...bare.say, src: [] } }]), ctx)).toThrow(/must cite the ledger/);
    // a dramatized line may stand without a citation
    expect(validateScene(scene([drama]), ctx).id).toBe('test.scene');
  });

  it('refuses a citation that is not in the ledger, or is unverified or excluded', () => {
    const cite = (src: string[]) => scene([{ say: { who: 'ayyub', text: 'x', kind: 'documented', src } }]);
    expect(() => validateScene(cite(['CH-99.E1']), ctx)).toThrow(/not in the ledger/);
    expect(() => validateScene(cite(['UNV-01']), ctx)).toThrow(/unverified or excluded/);
    expect(() => validateScene(cite(['EXC-01']), ctx)).toThrow(/unverified or excluded/);
    expect(() => validateScene(scene([drama], { ledger: ['CH-99.E1'] }), ctx)).toThrow(/not in the ledger/);
  });

  it('without a ledger to check against, citations are only required, not looked up', () => {
    expect(validateScene(scene([doc]), { characters }).cmds).toHaveLength(1);
  });

  it('keeps narration to the narrator and speech to people', () => {
    expect(() => validateScene(scene([{ say: { who: 'ayyub', text: 'x', kind: 'narration' } }]), ctx)).toThrow(/narrator/);
    expect(() => validateScene(scene([{ say: { who: 'narrator', text: 'x', kind: 'dramatized' } }]), ctx)).toThrow(/only narrates/);
    expect(() => validateScene(scene([{ say: { who: 'nobody', text: 'x', kind: 'dramatized' } }]), ctx)).toThrow(/not a character/);
  });

  it('rejects malformed commands', () => {
    expect(() => validateScene(scene([{ dance: 1 }]), ctx)).toThrow(/exactly one of/);
    expect(() => validateScene(scene([{ say: drama.say, flag: 'x' }]), ctx)).toThrow(/exactly one of/);
    expect(() => validateScene(scene([{ say: { ...drama.say, text: ' ' } }]), ctx)).toThrow(/text/);
    expect(() => validateScene(scene([{ say: { ...drama.say, kind: 'rumour' } }]), ctx)).toThrow(/kind/);
    expect(() => validateScene(scene([{ show: { who: 'ayyub', at: 'up' } }]), ctx)).toThrow(/at:/);
    expect(() => validateScene(scene([{ show: { who: 'narrator', at: 'left' } }]), ctx)).toThrow(/known character/);
    expect(() => validateScene(scene([{ hide: 'nobody' }]), ctx)).toThrow(/known character/);
    expect(() => validateScene(scene([{ wait: 0 }]), ctx)).toThrow(/wait/);
    expect(() => validateScene(scene([{ wait: 99999 }]), ctx)).toThrow(/wait/);
    expect(() => validateScene(scene([{ bg: '' }]), ctx)).toThrow(/bg needs/);
    expect(() => validateScene(scene([{ music: '' }]), ctx)).toThrow(/music/);
    expect(() => validateScene(scene([]), ctx)).toThrow(/needs commands/);
    expect(() => validateScene({ id: 'Bad Id', title: 'x', ledger: [], cmds: [drama] }, ctx)).toThrow(/id must/);
    expect(() => validateScene({ id: 'x', ledger: [], cmds: [drama] }, ctx)).toThrow(/title/);
    expect(() => validateScene({ id: 'x', title: 'x', ledger: 'CH-00', cmds: [drama] }, ctx)).toThrow(/ledger/);
  });

  it('refuses Arabic script anywhere in a scene', () => {
    expect(() => validateScene(scene([{ say: { ...drama.say, text: 'قال' } }]), ctx)).toThrow(/Arabic script/);
    expect(() => validateScene(scene([drama], { title: 'صلاح' }), ctx)).toThrow(/Arabic script/);
  });

  it('refuses a speaker the project never depicts, even if a table were built to allow one', () => {
    const sneaky = new Map([['companion-x', { id: 'companion-x', name: 'X', ledger: 'CHR-X', portrait: null }]]);
    const line = { say: { who: 'companion-x', text: 'x', kind: 'dramatized' } };
    expect(() => validateScene(scene([line]), { characters: sneaky })).toThrow(/never depicts/);
    expect(() => validateScene(scene([{ show: { who: 'companion-x', at: 'left' } }]), { characters: sneaky })).toThrow(/never depicts/);
  });

  it('builds a table and refuses duplicates', () => {
    const a = scene([drama]);
    expect(buildSceneTable([a], ctx).size).toBe(1);
    expect(() => buildSceneTable([a, a], ctx)).toThrow(/duplicate/);
  });
});

describe('playing a scene', () => {
  const play = (cmds: unknown[]): DialogueRunner => new DialogueRunner(validateScene(scene(cmds), ctx) as SceneDef);

  it('puts people on the stage and gives each line with the stage as it stood', () => {
    const run = play([{ show: { who: 'ayyub', at: 'left' } }, { show: { who: 'shirkuh', at: 'right' } }, { bg: 'gate' }, doc, { hide: 'ayyub' }, drama]);
    const first = run.step();
    expect(first).toMatchObject({ kind: 'say', stage: { left: 'ayyub', right: 'shirkuh', bg: 'gate' } });
    const second = run.step();
    expect(second).toMatchObject({ kind: 'say', stage: { left: null, right: 'shirkuh' } });
    expect(run.step()).toBeNull();
    expect(run.done).toBe(true);
  });

  it('stops at a wait and goes on after it', () => {
    const run = play([doc, { wait: 250 }, drama]);
    expect(run.step()).toMatchObject({ kind: 'say' });
    expect(run.step()).toEqual({ kind: 'wait', ms: 250 });
    expect(run.step()).toMatchObject({ kind: 'say' });
  });

  it('collects flags, unlocks and sounds for the caller, in order', () => {
    const run = play([{ flag: 'a' }, { sfx: 'gate' }, doc, { unlock: 'CDX-1' }, { music: 'story' }, { music: null }]);
    run.step();
    expect(run.take()).toEqual([{ flag: 'a' }, { sfx: 'gate' }]);
    expect(run.take()).toEqual([]);
    expect(run.step()).toBeNull();
    expect(run.take()).toEqual([{ unlock: 'CDX-1' }, { music: 'story' }, { music: null }]);
  });

  it('skipping shows no more lines but still raises every flag and unlock', () => {
    const run = play([doc, { flag: 'x' }, drama, { unlock: 'CDX-2' }, { show: { who: 'ayyub', at: 'center' } }]);
    run.step();
    run.skip();
    expect(run.done).toBe(true);
    expect(run.take()).toEqual([{ flag: 'x' }, { unlock: 'CDX-2' }]);
    expect(run.current.center).toBe('ayyub');
    expect(run.backlog).toHaveLength(1);
  });

  it('remembers the lines shown, for the backlog', () => {
    const run = play([doc, tell, drama]);
    run.step();
    run.step();
    expect(run.backlog.map((l) => l.kind)).toEqual(['documented', 'narration']);
  });

  it('a scene of only effects ends at once', () => {
    const run = play([{ flag: 'x' }]);
    expect(run.step()).toBeNull();
    expect(run.take()).toEqual([{ flag: 'x' }]);
  });
});

describe('the marks and the pages', () => {
  it('marks documented lines with a diamond, dramatized with an outline, narration with nothing', () => {
    expect(markFor('documented')).toBe('◆');
    expect(markFor('dramatized')).toBe('◇');
    expect(markFor('narration')).toBe('');
  });

  it('splits a long line into pages of three lines, breaking only between lines', () => {
    const wrap = (t: string): string[] => t.split('|');
    expect(paginate('a|b|c|d|e', wrap)).toEqual([['a', 'b', 'c'], ['d', 'e']]);
    expect(paginate('a', wrap)).toEqual([['a']]);
    expect(paginate('', (t) => (t ? [t] : []))).toEqual([['']]);
    expect(paginate('a|b|c|d', wrap, 2)).toEqual([['a', 'b'], ['c', 'd']]);
  });
});

describe('settings', () => {
  it('defaults are what DESIGN §16 says, and the source markers are on', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ mode: 'classic', sourceMarkers: true, portraits: 'illustrated', classNames: 'common', hitMode: 'honest', guaranteedProgress: true });
  });

  it('keeps what is valid and takes the default for what is not', () => {
    const s = parseSettings({ textSpeed: 'fast', sourceMarkers: false, musicVolume: 3, sfxVolume: -1, mode: 'hardcore', portraits: 7, extra: 'dropped', hitMode: 'weighted' });
    expect(s).toMatchObject({ textSpeed: 'fast', sourceMarkers: false, musicVolume: 1, sfxVolume: 0, mode: 'classic', portraits: 'illustrated', hitMode: 'weighted' });
    expect('extra' in s).toBe(false);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
  });

  it('turns the text speed into characters a second', () => {
    expect(charsPerSecond('slow')).toBeLessThan(charsPerSecond('normal'));
    expect(charsPerSecond('normal')).toBeLessThan(charsPerSecond('fast'));
    expect(charsPerSecond('instant')).toBe(Number.POSITIVE_INFINITY);
  });
});
