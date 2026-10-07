import { manhattan } from './grid';
import type { SceneTable } from './dialogue';
import type { Point } from './types';

/**
 * Supports (DESIGN §7): the bond that grows between two units who fight side by side. Points
 * gather at the end of each Player Phase; a pair that reaches a threshold may be shown the next
 * scene in camp; the rank takes effect only once the scene has been viewed. A supported pair
 * standing next to each other fight better (Adjacent Aid).
 */

export const RANKS = ['C', 'B', 'A', 'Bond'] as const;
export type Rank = (typeof RANKS)[number];

/** Points a pair needs for the scene of each rank. */
export const THRESHOLDS: Readonly<Record<Rank, number>> = { C: 20, B: 60, A: 120, Bond: 200 };

export type Pace = 'slow' | 'normal' | 'fast';
/** The most a pair can earn on the battlefield in one chapter. */
export const PACE_CAP: Readonly<Record<Pace, number>> = { slow: 20, normal: 30, fast: 40 };

/** Points a conversation in camp adds, once. */
export const TALK_POINTS = 10;
/** Conversations a camp allows. */
export const TALKS_PER_CAMP = 3;

export interface AidBonus {
  readonly hit?: number;
  readonly avoid?: number;
  readonly crit?: number;
  readonly grd?: number;
}

/** What a supporter beside you gives (DESIGN §7.3), unless the pair says otherwise. */
export const DEFAULT_AID: Readonly<Record<Rank, Required<AidBonus>>> = {
  C: { hit: 5, avoid: 5, crit: 0, grd: 0 },
  B: { hit: 10, avoid: 10, crit: 3, grd: 0 },
  A: { hit: 15, avoid: 15, crit: 5, grd: 1 },
  Bond: { hit: 20, avoid: 20, crit: 8, grd: 2 },
};

export interface SupportScene {
  /** The dialogue scene to play. */
  readonly scene: string;
  /** The ledger row for the scene (`SUP-A-B-RANK`). */
  readonly ledger: string;
  /** The chapter from which the scene may be shown, so history keeps its order. */
  readonly availableFrom?: string;
  readonly requiresFlags?: readonly string[];
}

export interface SupportDef {
  readonly id: string;
  /** The unit definitions of the pair. */
  readonly a: string;
  readonly b: string;
  readonly pace: Pace;
  /** Kin or sworn brothers may reach the Bond rank; everyone else stops at A. */
  readonly bondKind?: 'kin' | 'sworn';
  readonly scenes: Readonly<Partial<Record<Rank, SupportScene>>>;
  readonly aid?: Readonly<Partial<Record<Rank, AidBonus>>>;
}

export type SupportTable = ReadonlyMap<string, SupportDef>;

export interface SupportValidation {
  readonly scenes?: SceneTable;
  /** The ledger, to check each support scene's row against. */
  readonly knownLedgerId?: (id: string) => boolean;
  /** Chapter ids in order, to check `availableFrom` against. */
  readonly chapters?: readonly string[];
}

const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function buildSupportTable(raw: readonly unknown[], ctx: SupportValidation = {}): SupportTable {
  const table = new Map<string, SupportDef>();
  const pairs = new Set<string>();
  raw.forEach((entry, i) => {
    const d = entry as Partial<SupportDef> & Record<string, unknown>;
    const where = `support #${i}${typeof d.id === 'string' ? ` "${d.id}"` : ''}`;
    if (typeof d.id !== 'string' || d.id === '') throw new Error(`${where}: missing id`);
    if (table.has(d.id)) throw new Error(`${where}: duplicate id`);
    if (typeof d.a !== 'string' || typeof d.b !== 'string' || d.a === '' || d.b === '') throw new Error(`${where}: needs two units, a and b`);
    if (d.a === d.b) throw new Error(`${where}: a unit cannot support itself`);
    if (pairs.has(pairKey(d.a, d.b))) throw new Error(`${where}: the pair ${d.a} and ${d.b} is already defined`);
    if (!(d.pace === 'slow' || d.pace === 'normal' || d.pace === 'fast')) throw new Error(`${where}: pace must be slow, normal or fast`);
    if (d.bondKind !== undefined && d.bondKind !== 'kin' && d.bondKind !== 'sworn') throw new Error(`${where}: bondKind must be kin or sworn`);
    const scenes = d.scenes;
    if (!scenes || typeof scenes !== 'object') throw new Error(`${where}: needs scenes`);
    const ranks = Object.keys(scenes) as Rank[];
    if (ranks.length === 0) throw new Error(`${where}: needs at least one scene`);
    for (const rank of ranks) {
      if (!RANKS.includes(rank)) throw new Error(`${where}: unknown rank "${rank}"`);
    }
    if (scenes.Bond && !d.bondKind) throw new Error(`${where}: only kin or sworn pairs reach the Bond rank (set bondKind)`);
    // a rank needs the ones before it
    RANKS.forEach((rank, k) => {
      if (scenes[rank] && k > 0 && !scenes[RANKS[k - 1] as Rank]) throw new Error(`${where}: rank ${rank} needs rank ${RANKS[k - 1]} first`);
    });
    for (const rank of ranks) {
      const sc = scenes[rank] as Partial<SupportScene>;
      if (typeof sc.scene !== 'string' || sc.scene === '') throw new Error(`${where}: rank ${rank} needs a scene id`);
      if (ctx.scenes && !ctx.scenes.has(sc.scene)) throw new Error(`${where}: rank ${rank} names scene "${sc.scene}", which does not exist`);
      if (typeof sc.ledger !== 'string' || !sc.ledger.startsWith('SUP-')) throw new Error(`${where}: rank ${rank} needs a SUP- ledger row`);
      if (ctx.knownLedgerId && !ctx.knownLedgerId(sc.ledger)) throw new Error(`${where}: "${sc.ledger}" is not in the ledger`);
      if (sc.availableFrom !== undefined && ctx.chapters && !ctx.chapters.includes(sc.availableFrom)) throw new Error(`${where}: availableFrom "${sc.availableFrom}" is not a chapter`);
      if (sc.requiresFlags !== undefined && !(Array.isArray(sc.requiresFlags) && sc.requiresFlags.every((f) => typeof f === 'string'))) throw new Error(`${where}: requiresFlags must be a list of flags`);
    }
    for (const [rank, aid] of Object.entries(d.aid ?? {})) {
      if (!RANKS.includes(rank as Rank)) throw new Error(`${where}: aid for unknown rank "${rank}"`);
      for (const [key, value] of Object.entries(aid as Record<string, unknown>)) {
        if (!['hit', 'avoid', 'crit', 'grd'].includes(key)) throw new Error(`${where}: aid gives unknown "${key}"`);
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 30) throw new Error(`${where}: aid ${key} must be a whole number from 0 to 30`);
      }
    }
    pairs.add(pairKey(d.a, d.b));
    table.set(d.id, d as SupportDef);
  });
  return table;
}

/** The highest rank this pair may reach. */
export const maxRank = (def: SupportDef): Rank => (def.bondKind ? 'Bond' : 'A');

export interface PairState {
  /** Points earned, on the battlefield and in camp. */
  points: number;
  /** Points earned on the battlefield this chapter, against the pace's cap. */
  chapterPoints: number;
  /** Ranks whose scenes have been viewed. */
  viewed: Rank[];
}

/** What decides whether a scene may be shown now. */
export interface SupportGate {
  /** The chapter reached (the one just finished, or being prepared), or null at the very start. */
  readonly chapter: string | null;
  readonly chapterOrder: readonly string[];
  readonly flags: ReadonlySet<string>;
}

/** What happened during a Player Phase that earns points. */
export interface PhaseSupportInput {
  /** Every player unit still on the field, by unit definition id. */
  readonly units: ReadonlyArray<{ readonly defId: string; readonly x: number; readonly y: number }>;
  /** Where each unit last fought this phase (as attacker or defender), by definition id. */
  readonly fought: ReadonlyMap<string, Point>;
  /** Pairs where one healed, mended or dispatched the other this phase, as `pairKey`s. */
  readonly aided: ReadonlySet<string>;
}

export interface SupportGain {
  readonly support: string;
  readonly added: number;
}

export class SupportTracker {
  private readonly pairs = new Map<string, PairState>();

  constructor(readonly defs: SupportTable) {}

  stateOf(id: string): PairState {
    let state = this.pairs.get(id);
    if (!state) {
      state = { points: 0, chapterPoints: 0, viewed: [] };
      this.pairs.set(id, state);
    }
    return state;
  }

  /** The support between two unit definitions, in either order. */
  between(a: string, b: string): SupportDef | undefined {
    for (const def of this.defs.values()) if ((def.a === a && def.b === b) || (def.a === b && def.b === a)) return def;
    return undefined;
  }

  /** The partner of a unit definition in a support, if it has one. */
  partnerIn(def: SupportDef, unit: string): string | null {
    return def.a === unit ? def.b : def.b === unit ? def.a : null;
  }

  /** The rank in effect: the highest whose scene has been viewed. */
  rankOf(id: string): Rank | null {
    const viewed = this.stateOf(id).viewed;
    return [...RANKS].reverse().find((r) => viewed.includes(r)) ?? null;
  }

  /** Add points from the battlefield, never past the pace's cap for the chapter. Returns what was added. */
  earn(id: string, amount: number): number {
    const def = this.defs.get(id);
    if (!def || amount <= 0) return 0;
    const state = this.stateOf(id);
    const added = Math.max(0, Math.min(amount, PACE_CAP[def.pace] - state.chapterPoints));
    state.points += added;
    state.chapterPoints += added;
    return added;
  }

  /** A new chapter: every pair may earn up to its cap again. */
  startChapter(): void {
    for (const state of this.pairs.values()) state.chapterPoints = 0;
  }

  /** The rank whose scene could be shown now, or null: points reached, scene defined, chapter and flags satisfied. */
  available(id: string, gate: SupportGate): Rank | null {
    const def = this.defs.get(id);
    if (!def) return null;
    const state = this.stateOf(id);
    const next = RANKS.find((r) => !state.viewed.includes(r) && def.scenes[r] !== undefined && (r !== 'Bond' || def.bondKind));
    if (!next || state.points < THRESHOLDS[next]) return null;
    const scene = def.scenes[next] as SupportScene;
    if (scene.availableFrom !== undefined) {
      const need = gate.chapterOrder.indexOf(scene.availableFrom);
      const have = gate.chapter === null ? -1 : gate.chapterOrder.indexOf(gate.chapter);
      if (need < 0 || have < need) return null;
    }
    if (scene.requiresFlags?.some((f) => !gate.flags.has(f))) return null;
    return next;
  }

  /** Every pair with a scene to show now. */
  availableAll(gate: SupportGate): Array<{ support: SupportDef; rank: Rank; scene: SupportScene }> {
    const out: Array<{ support: SupportDef; rank: Rank; scene: SupportScene }> = [];
    for (const support of this.defs.values()) {
      const rank = this.available(support.id, gate);
      if (rank) out.push({ support, rank, scene: support.scenes[rank] as SupportScene });
    }
    return out;
  }

  /** The scene has been viewed: the rank takes effect, and the talk adds its points. Throws if it was not available. */
  view(id: string, rank: Rank, gate: SupportGate): void {
    if (this.available(id, gate) !== rank) throw new Error(`The ${rank} scene of "${id}" is not available`);
    const state = this.stateOf(id);
    state.viewed.push(rank);
    state.points += TALK_POINTS;
  }

  /** The points a Player Phase earns for every pair (DESIGN §7.1); applies them and reports each gain. */
  tickPhase(input: PhaseSupportInput): SupportGain[] {
    const gains: SupportGain[] = [];
    const at = new Map(input.units.map((u) => [u.defId, u]));
    for (const def of this.defs.values()) {
      const a = at.get(def.a);
      const b = at.get(def.b);
      if (!a || !b) continue;
      const d = manhattan(a, b);
      let points = d === 1 ? 2 : d <= 3 ? 1 : 0;
      const fa = input.fought.get(def.a);
      const fb = input.fought.get(def.b);
      if (fa && fb && manhattan(fa, fb) <= 2) points += 1;
      if (input.aided.has(pairKey(def.a, def.b))) points += 2;
      const added = this.earn(def.id, points);
      if (added > 0) gains.push({ support: def.id, added });
    }
    return gains;
  }

  /**
   * What the supporters beside a unit give it in a fight at `at` (DESIGN §7.3): each adjacent
   * unit it has a supported rank with adds that rank's bonus, and only the best two count.
   */
  aidFor(unitDef: string, at: Point, others: ReadonlyArray<{ readonly defId: string; readonly x: number; readonly y: number }>): Required<AidBonus> {
    const found: Array<{ rank: Rank; aid: Required<AidBonus> }> = [];
    for (const other of others) {
      if (other.defId === unitDef || manhattan(other, at) !== 1) continue;
      const def = this.between(unitDef, other.defId);
      const rank = def ? this.rankOf(def.id) : null;
      if (!def || !rank) continue;
      found.push({ rank, aid: { ...DEFAULT_AID[rank], ...(def.aid?.[rank] ?? {}) } });
    }
    found.sort((x, y) => RANKS.indexOf(y.rank) - RANKS.indexOf(x.rank) || y.aid.hit + y.aid.avoid - (x.aid.hit + x.aid.avoid));
    const best = found.slice(0, 2);
    const sum = (key: keyof AidBonus): number => best.reduce((n, { aid }) => n + aid[key], 0);
    return { hit: sum('hit'), avoid: sum('avoid'), crit: sum('crit'), grd: sum('grd') };
  }

  snapshot(): Record<string, PairState> {
    return Object.fromEntries([...this.pairs].map(([id, s]) => [id, { points: s.points, chapterPoints: s.chapterPoints, viewed: [...s.viewed] }]));
  }

  restore(data: Record<string, PairState>): void {
    this.pairs.clear();
    for (const [id, s] of Object.entries(data)) {
      if (!this.defs.has(id)) continue;
      this.pairs.set(id, { points: Math.max(0, s.points | 0), chapterPoints: Math.max(0, s.chapterPoints | 0), viewed: s.viewed.filter((r) => RANKS.includes(r)) });
    }
  }
}

export { pairKey };
