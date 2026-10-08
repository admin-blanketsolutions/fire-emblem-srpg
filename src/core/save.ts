import type { Army, CampaignMode, Result } from './army';
import type { BattleRules, BattleSnapshot, BattleState, BattleTables } from './battle';
import type { Campaign } from './campaign';
import type { PairState, SupportTracker } from './supports';
import type { UnitInstance } from './unit';

/**
 * Saving and loading (DESIGN §3.9). A save is plain JSON with a schema version; older versions
 * are brought up to date by pure migrations. Reading a save never trusts it: anything malformed
 * is refused with a message saying what and where, and the game carries on.
 *
 * Storage is behind `KeyValueStore`, so this module stays pure; the browser's storage, and the
 * in-memory fallback when there is none, live in `engine/storage.ts`.
 */

/** The current save format. Bump it, and add a migration, whenever the format changes. */
export const SAVE_SCHEMA = 1;

export type SaveKind = 'slot' | 'autosave' | 'suspend';

/** What a save list shows without reading the whole save. */
export interface SaveSummary {
  /** A name for where the campaign stands, such as a chapter title. */
  readonly label: string;
  readonly chapter: string | null;
  readonly mode: CampaignMode;
  readonly units: number;
  /** The turn, for a battle in progress. */
  readonly turn: number | null;
  /** ISO 8601; supplied by the caller, since the core has no clock. */
  readonly savedAt: string;
}

/** A unit as stored: the unit's own fields, as plain data. */
export type UnitJson = Record<string, unknown>;

interface ArmyJson {
  readonly units: readonly number[];
  readonly convoy: ReadonlyArray<{ readonly id: string; readonly uses: number }>;
  readonly dinars: number;
  readonly fallen: readonly number[];
  readonly fallenIn: ReadonlyArray<readonly [string, string]>;
  readonly supports: Record<string, PairState> | null;
  readonly camp: { readonly talks: number; readonly drilled: readonly string[] };
  readonly deployed: readonly string[];
  readonly deployLimit: number;
}

interface CampaignJson {
  readonly mode: CampaignMode;
  readonly seed: number;
  readonly story: string;
  readonly chapter: string | null;
  readonly flags: readonly string[];
  readonly codex: readonly string[];
  readonly army: ArmyJson;
}

/** A battle in progress: how to build it again, and the state to put it back in. */
interface BattleJson {
  /** Whatever the data layer needs to rebuild the battle's map and units (a chapter id, a demo name). */
  readonly source: unknown;
  readonly rules: BattleRules;
  readonly snapshot: BattleSnapshot;
}

export interface SaveFile {
  readonly schemaVersion: number;
  readonly kind: SaveKind;
  readonly summary: SaveSummary;
  /** Every unit the save refers to, once; the army and the battle refer to them by index. */
  readonly units: readonly UnitJson[];
  readonly campaign: CampaignJson;
  readonly battle: BattleJson | null;
}

/** A save that cannot be read, with the reason. */
export class SaveError extends Error {
  override readonly name = 'SaveError';
}

// ------------------------------------------------------------------ writing

/** Numbers each distinct unit object once, so shared units stay shared. */
class UnitPool {
  private readonly index = new Map<UnitInstance, number>();
  readonly list: UnitJson[] = [];

  ref = (unit: UnitInstance): number => {
    let i = this.index.get(unit);
    if (i === undefined) {
      i = this.list.length;
      this.index.set(unit, i);
      this.list.push(JSON.parse(JSON.stringify(unit)) as UnitJson);
    }
    return i;
  };
}

export interface SaveRequest {
  readonly kind: SaveKind;
  readonly campaign: Campaign;
  readonly label: string;
  readonly savedAt: string;
  /** A battle in progress (the suspend-save), and how the data layer rebuilds it. */
  readonly battle?: { readonly state: BattleState; readonly source: unknown };
}

/** Turn a campaign, and a battle in progress if any, into a save. */
export function encodeSave(req: SaveRequest): SaveFile {
  const { campaign, battle } = req;
  const pool = new UnitPool();
  const army = campaign.army;
  // the battle first, so its units keep the order they have on the board
  const battleJson: BattleJson | null = battle
    ? { source: JSON.parse(JSON.stringify(battle.source)) as unknown, rules: { ...battle.state.rules }, snapshot: battle.state.snapshot(pool.ref) }
    : null;
  const armyJson: ArmyJson = {
    units: army.units.map(pool.ref),
    convoy: army.convoy.map((s) => ({ id: s.id, uses: s.uses })),
    dinars: army.dinars,
    fallen: army.fallen.map(pool.ref),
    fallenIn: [...army.fallenIn],
    supports: army.supports ? army.supports.snapshot() : null,
    camp: { talks: army.camp.talks, drilled: [...army.camp.drilled] },
    deployed: [...army.deployed],
    deployLimit: army.deployLimit,
  };
  return {
    schemaVersion: SAVE_SCHEMA,
    kind: req.kind,
    summary: {
      label: req.label,
      chapter: campaign.chapter,
      mode: campaign.mode,
      units: army.units.length,
      turn: battle ? battle.state.turn : null,
      savedAt: req.savedAt,
    },
    units: pool.list,
    campaign: {
      mode: campaign.mode,
      seed: campaign.seed,
      story: campaign.story,
      chapter: campaign.chapter,
      flags: [...campaign.flags],
      codex: [...campaign.codex],
      army: armyJson,
    },
    battle: battleJson,
  };
}

// ------------------------------------------------------------------ versions

/** Turns a save of version n into version n + 1. Pure. */
export type Migration = (file: Record<string, unknown>) => Record<string, unknown>;

/** Keyed by the version each migration upgrades from. None yet: version 1 is the first. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

/** Bring parsed JSON up to `target`, one version at a time. Refuses saves from a newer game. */
export function migrate(raw: unknown, migrations: Readonly<Record<number, Migration>> = MIGRATIONS, target = SAVE_SCHEMA): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SaveError('The save is not a JSON object.');
  let file = raw as Record<string, unknown>;
  let version = file.schemaVersion;
  if (!Number.isInteger(version) || (version as number) < 1) throw new SaveError('The save has no valid schemaVersion.');
  if ((version as number) > target) throw new SaveError(`The save is from a newer version of the game (format ${String(version)}; this game reads up to ${target}).`);
  while ((version as number) < target) {
    const step = migrations[version as number];
    if (!step) throw new SaveError(`No migration from save format ${String(version)}.`);
    file = step(file);
    const next = file.schemaVersion;
    if (next !== (version as number) + 1) throw new SaveError(`The migration from format ${String(version)} did not produce format ${(version as number) + 1}.`);
    version = next;
  }
  return file;
}

// ------------------------------------------------------------------ reading

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function need<T>(ok: boolean, value: unknown, where: string, what: string): T {
  if (!ok) throw new SaveError(`${where} should be ${what}.`);
  return value as T;
}
const obj = (v: unknown, where: string): Record<string, unknown> => need(isObj(v), v, where, 'an object');
const arr = (v: unknown, where: string): unknown[] => need(Array.isArray(v), v, where, 'a list');
const num = (v: unknown, where: string): number => need(typeof v === 'number' && Number.isFinite(v), v, where, 'a number');
const int = (v: unknown, where: string): number => need(Number.isInteger(v), v, where, 'a whole number');
const str = (v: unknown, where: string): string => need(typeof v === 'string', v, where, 'text');
const bool = (v: unknown, where: string): boolean => need(typeof v === 'boolean', v, where, 'true or false');
const strs = (v: unknown, where: string): string[] => arr(v, where).map((s, i) => str(s, `${where}[${i}]`));
const ints = (v: unknown, where: string): number[] => arr(v, where).map((n, i) => int(n, `${where}[${i}]`));
const MODES: readonly CampaignMode[] = ['classic', 'casual'];
const mode = (v: unknown, where: string): CampaignMode => need(MODES.includes(v as CampaignMode), v, where, '"classic" or "casual"');

/** Check a stored unit's shape and that its class and items exist, then return it as a unit. */
function readUnit(raw: unknown, where: string, tables: BattleTables): UnitInstance {
  const u = obj(raw, where);
  for (const key of ['id', 'defId', 'name', 'side', 'classId', 'spriteId', 'faction', 'skin', 'kind', 'moveType']) str(u[key], `${where}.${key}`);
  for (const key of ['level', 'exp', 'hp', 'x', 'y', 'equipped', 'tier', 'travelled', 'bonusMove']) int(u[key], `${where}.${key}`);
  for (const key of ['moved', 'acted', 'retreated', 'escaped', 'triggered', 'boss', 'chronicled', 'fictional']) bool(u[key], `${where}.${key}`);
  const stats = obj(u.stats, `${where}.stats`);
  for (const [key, value] of Object.entries(stats)) num(value, `${where}.stats.${key}`);
  obj(u.home, `${where}.home`);
  obj(u.wexp, `${where}.wexp`);
  obj(u.growth, `${where}.growth`);
  obj(u.gradeCaps, `${where}.gradeCaps`);
  strs(u.skills, `${where}.skills`);
  strs(u.tags, `${where}.tags`);
  strs(u.turnFlags, `${where}.turnFlags`);
  arr(u.statuses, `${where}.statuses`);
  if (u.ai !== null) obj(u.ai, `${where}.ai`);
  arr(u.inventory, `${where}.inventory`).forEach((s, i) => {
    const stack = obj(s, `${where}.inventory[${i}]`);
    const id = str(stack.id, `${where}.inventory[${i}].id`);
    int(stack.uses, `${where}.inventory[${i}].uses`);
    if (!tables.weapons.has(id) && !tables.items.has(id)) throw new SaveError(`${where} carries "${id}", which this game does not know.`);
  });
  if (u.kind === 'unit' && !tables.classes.has(u.classId as string)) throw new SaveError(`${where} has class "${String(u.classId)}", which this game does not know.`);
  return JSON.parse(JSON.stringify(u)) as UnitInstance;
}

/** What reading a save needs from the data layer. */
export interface LoadEnv {
  readonly tables: BattleTables;
  /** A fresh support tracker for the story, or null if it has no supports. */
  supportsFor(story: string): SupportTracker | null;
  /**
   * Build the battle a suspend-save came from, as at its start, without the army's supports
   * (they are restored separately). Throws if the source is unknown.
   */
  buildBattle(source: unknown, rules: BattleRules): BattleState;
}

export interface LoadedSave {
  readonly file: SaveFile;
  readonly campaign: Campaign;
  readonly battle: BattleState | null;
  /** The battle's source, to save it again. */
  readonly source: unknown;
}

function readArmy(raw: unknown, unit: (i: number, where: string) => UnitInstance, supports: SupportTracker | null): Army {
  const a = obj(raw, 'campaign.army');
  const camp = obj(a.camp, 'campaign.army.camp');
  if (supports && a.supports !== null) supports.restore(obj(a.supports, 'campaign.army.supports') as Record<string, PairState>);
  return {
    units: ints(a.units, 'campaign.army.units').map((i, n) => unit(i, `campaign.army.units[${n}]`)),
    convoy: arr(a.convoy, 'campaign.army.convoy').map((s, i) => {
      const stack = obj(s, `campaign.army.convoy[${i}]`);
      return { id: str(stack.id, `campaign.army.convoy[${i}].id`), uses: int(stack.uses, `campaign.army.convoy[${i}].uses`) };
    }),
    dinars: int(a.dinars, 'campaign.army.dinars'),
    fallen: ints(a.fallen, 'campaign.army.fallen').map((i, n) => unit(i, `campaign.army.fallen[${n}]`)),
    fallenIn: new Map(
      arr(a.fallenIn, 'campaign.army.fallenIn').map((pair, i) => {
        const [id, chapter] = strs(pair, `campaign.army.fallenIn[${i}]`);
        return [id ?? '', chapter ?? ''] as const;
      }),
    ),
    supports,
    camp: { talks: int(camp.talks, 'campaign.army.camp.talks'), drilled: new Set(strs(camp.drilled, 'campaign.army.camp.drilled')) },
    deployed: new Set(strs(a.deployed, 'campaign.army.deployed')),
    deployLimit: int(a.deployLimit, 'campaign.army.deployLimit'),
  };
}

/**
 * Read a save: migrate it, check it, and rebuild the campaign (and the battle in progress, for a
 * suspend-save). Throws `SaveError` with a readable reason if anything is wrong.
 */
export function decodeSave(raw: unknown, env: LoadEnv): LoadedSave {
  const file = migrate(raw);
  const kind = str(file.kind, 'kind');
  if (kind !== 'slot' && kind !== 'autosave' && kind !== 'suspend') throw new SaveError(`kind "${kind}" is not a kind of save.`);
  const pool = arr(file.units, 'units');
  const units = new Map<number, UnitInstance>();
  const unit = (i: number, where: string): UnitInstance => {
    let u = units.get(i);
    if (!u) {
      if (i < 0 || i >= pool.length) throw new SaveError(`${where} refers to unit ${i}, which the save does not have.`);
      u = readUnit(pool[i], `units[${i}]`, env.tables);
      units.set(i, u);
    }
    return u;
  };

  const c = obj(file.campaign, 'campaign');
  const story = str(c.story, 'campaign.story');
  let supports: SupportTracker | null;
  try {
    supports = env.supportsFor(story);
  } catch (error) {
    throw new SaveError(`campaign.story: ${error instanceof Error ? error.message : String(error)}`);
  }
  const army = readArmy(c.army, unit, supports);
  const campaign: Campaign = {
    mode: mode(c.mode, 'campaign.mode'),
    seed: int(c.seed, 'campaign.seed'),
    story,
    chapter: c.chapter === null ? null : str(c.chapter, 'campaign.chapter'),
    flags: new Set(strs(c.flags, 'campaign.flags')),
    codex: new Set(strs(c.codex, 'campaign.codex')),
    army,
  };

  let battle: BattleState | null = null;
  let source: unknown = null;
  if (file.battle !== null && file.battle !== undefined) {
    const b = obj(file.battle, 'battle');
    source = b.source;
    const rules = obj(b.rules, 'battle.rules') as unknown as BattleRules;
    const snap = obj(b.snapshot, 'battle.snapshot') as unknown as BattleSnapshot;
    for (const key of ['rng', 'turn', 'phaseIndex', 'ransom', 'terrainVersion']) int((snap as unknown as Record<string, unknown>)[key], `battle.snapshot.${key}`);
    ints(snap.units, 'battle.snapshot.units');
    try {
      battle = env.buildBattle(source, rules);
    } catch (error) {
      throw new SaveError(`The battle could not be rebuilt: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      battle.restore(snap, (i) => unit(i, 'battle.snapshot'), supports);
    } catch (error) {
      if (error instanceof SaveError) throw error;
      throw new SaveError(`The battle could not be restored: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  obj(file.summary, 'summary');
  return { file: file as unknown as SaveFile, campaign, battle, source };
}

// ------------------------------------------------------------------ storage

/** A place to keep strings by key: the browser's storage, or memory. Calls may throw (quota, privacy modes). */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** A store that lives as long as the page: the fallback, and the one tests use. */
export class MemoryStore implements KeyValueStore {
  private readonly data = new Map<string, string>();
  get(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.data.set(key, value);
  }
  remove(key: string): void {
    this.data.delete(key);
  }
}

export const SLOT_COUNT = 3;
const PREFIX = 's2b:v1:';

/** Where a save lives: one of three manual slots, the chapter-start autosave, or the suspend-save. */
export type SavePlace = { readonly kind: 'slot'; readonly slot: number } | { readonly kind: 'autosave' } | { readonly kind: 'suspend' };

export const placeKey = (place: SavePlace): string =>
  place.kind === 'slot' ? `${PREFIX}slot${place.slot}` : place.kind === 'autosave' ? `${PREFIX}auto` : `${PREFIX}suspend`;
export const SETTINGS_KEY = `${PREFIX}settings`;

/** A save as a save list shows it. */
export type SaveListing =
  | { readonly place: SavePlace; readonly state: 'empty' }
  | { readonly place: SavePlace; readonly state: 'ok'; readonly summary: SaveSummary }
  | { readonly place: SavePlace; readonly state: 'damaged'; readonly reason: string };

export type ReadResult = { readonly ok: true; readonly raw: unknown } | { readonly ok: false; readonly reason: string; readonly empty: boolean };

/** The save slots over a key-value store. Every storage call is caught: a failure is reported, never thrown. */
export class SaveSlots {
  constructor(private readonly store: KeyValueStore) {}

  static places(): SavePlace[] {
    const slots: SavePlace[] = Array.from({ length: SLOT_COUNT }, (_, i) => ({ kind: 'slot', slot: i + 1 }));
    return [...slots, { kind: 'autosave' }, { kind: 'suspend' }];
  }

  write(place: SavePlace, file: SaveFile): Result {
    if (place.kind === 'slot' && !(place.slot >= 1 && place.slot <= SLOT_COUNT)) return { ok: false, reason: `There is no slot ${place.slot}.` };
    try {
      this.store.set(placeKey(place), JSON.stringify(file));
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: `The save could not be written (${error instanceof Error ? error.message : String(error)}).` };
    }
  }

  /** The parsed JSON of a save, not yet checked (see `decodeSave`). */
  read(place: SavePlace): ReadResult {
    let text: string | null;
    try {
      text = this.store.get(placeKey(place));
    } catch (error) {
      return { ok: false, empty: false, reason: `Storage could not be read (${error instanceof Error ? error.message : String(error)}).` };
    }
    if (text === null) return { ok: false, empty: true, reason: 'There is no save here.' };
    try {
      return { ok: true, raw: JSON.parse(text) as unknown };
    } catch {
      return { ok: false, empty: false, reason: 'The save is not valid JSON.' };
    }
  }

  remove(place: SavePlace): void {
    try {
      this.store.remove(placeKey(place));
    } catch {
      // nothing to do: the save stays, and the next write replaces it
    }
  }

  /** Every place, with what is in it. A save that cannot be read is listed as damaged, not hidden. */
  list(): SaveListing[] {
    return SaveSlots.places().map((place): SaveListing => {
      const read = this.read(place);
      if (!read.ok) return read.empty ? { place, state: 'empty' } : { place, state: 'damaged', reason: read.reason };
      try {
        const file = migrate(read.raw);
        const s = obj(file.summary, 'summary');
        const summary: SaveSummary = {
          label: str(s.label, 'summary.label'),
          chapter: s.chapter === null ? null : str(s.chapter, 'summary.chapter'),
          mode: mode(s.mode, 'summary.mode'),
          units: int(s.units, 'summary.units'),
          turn: s.turn === null ? null : int(s.turn, 'summary.turn'),
          savedAt: str(s.savedAt, 'summary.savedAt'),
        };
        return { place, state: 'ok', summary };
      } catch (error) {
        return { place, state: 'damaged', reason: error instanceof Error ? error.message : String(error) };
      }
    });
  }

  /**
   * Read the suspend-save for resuming. In Classic mode it is consumed: resuming removes it, so a
   * battle cannot be replayed from the same moment (DESIGN §3.9). Casual keeps it.
   */
  takeSuspend(): ReadResult {
    const read = this.read({ kind: 'suspend' });
    if (read.ok && isObj(read.raw) && isObj(read.raw.campaign) && read.raw.campaign.mode !== 'casual') this.remove({ kind: 'suspend' });
    return read;
  }

  readSettings(): unknown {
    try {
      const text = this.store.get(SETTINGS_KEY);
      return text === null ? null : (JSON.parse(text) as unknown);
    } catch {
      return null;
    }
  }

  writeSettings(settings: unknown): Result {
    try {
      this.store.set(SETTINGS_KEY, JSON.stringify(settings));
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: `Settings could not be saved (${error instanceof Error ? error.message : String(error)}).` };
    }
  }
}
