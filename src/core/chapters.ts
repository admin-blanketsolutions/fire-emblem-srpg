import type { BattleTables } from './battle';
import type { Campaign } from './campaign';
import type { CodexTable } from './codex';
import { levelUp } from './exp';
import { freshUses } from './inventory';
import { createRng, hashSeed } from './rng';
import { RANKS, THRESHOLDS, type Rank } from './supports';
import { createUnit, type UnitInstance, type UnitTable } from './unit';

/**
 * The shape of a campaign (DESIGN §11): chapters, each an ordered list of steps the game walks
 * through: a title card, scenes, a camp, a battle, and the small changes the story makes to the
 * army between them (someone joins, someone leaves, someone is away, a bond has grown). The
 * flow in `scenes/flow.ts` plays the steps; this module says what they are, checks them against
 * the rest of the data, and carries out the changes. It is pure.
 */

/** A change the story makes to the campaign. Each has one verb; `count`, `atLeast` belong to the verb before them. */
export type StepEffect =
  /** A unit from the campaign's unit table joins the army; `count` of a generic unit joins as `id#1`, `id#2`… */
  | { readonly join: string; readonly count?: number }
  /** A unit leaves the army for good (a historical death, a departure). */
  | { readonly leave: string }
  /** These unit definitions are away from the army until the list changes; `[]` calls everyone back. */
  | { readonly away: readonly string[] }
  /** The story has brought a pair this far: their points rise to the rank's threshold if they are below it. */
  | { readonly grant: string; readonly atLeast: Rank }
  /** Years of service pass: the unit gains levels, as if it had earned the experience (its growths decide what rises). */
  | { readonly train: string; readonly levels: number }
  /** Something goes into the baggage train. */
  | { readonly give: string; readonly count?: number }
  | { readonly dinars: number }
  | { readonly flag: string }
  /** A Codex entry opens. */
  | { readonly unlock: string };

export type Step =
  /** The player names the Recruit. */
  | { readonly kind: 'name' }
  /** A title card: the chapter's own, or an interlude with its own words. */
  | { readonly kind: 'card'; readonly title?: string; readonly date?: string }
  | { readonly kind: 'scenes'; readonly scenes: readonly string[] }
  | { readonly kind: 'apply'; readonly do: readonly StepEffect[] }
  /** The Majlis: the army's camp. `label` is what the way on is called. */
  | { readonly kind: 'camp'; readonly label?: string }
  | { readonly kind: 'battle'; readonly battle: string };

export interface ChapterDef {
  /** `CH-00`, `CH-01`…: the ledger's id. */
  readonly id: string;
  readonly title: string;
  /** Shown on the card: the AH date and the Julian month and year (DECISIONS D-002). */
  readonly date: string;
  readonly steps: readonly Step[];
}

/** Chapters by id, in the order they are played. */
export type ChapterTable = ReadonlyMap<string, ChapterDef>;

/** What the chapters refer to, so a dangling reference is caught when the data loads. Omit a set to skip that check. */
export interface ChapterValidation {
  readonly scenes?: ReadonlySet<string>;
  readonly battles?: ReadonlySet<string>;
  /** Unit definitions that may join. */
  readonly units?: ReadonlySet<string>;
  readonly supports?: ReadonlySet<string>;
  /** Weapon and item ids. */
  readonly items?: ReadonlySet<string>;
  readonly codex?: ReadonlySet<string>;
}

const VERBS = ['join', 'leave', 'away', 'grant', 'train', 'give', 'dinars', 'flag', 'unlock'] as const;
type Verb = (typeof VERBS)[number];
const COMPANIONS: Readonly<Record<Verb, readonly string[]>> = { join: ['count'], leave: [], away: [], grant: ['atLeast'], train: ['levels'], give: ['count'], dinars: [], flag: [], unlock: [] };

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isCount = (v: unknown): boolean => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 12;

function validateEffect(raw: unknown, ctx: ChapterValidation, where: string): StepEffect {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error(`${where}: an effect must be an object`);
  const e = raw as Record<string, unknown>;
  const verbs = Object.keys(e).filter((k) => (VERBS as readonly string[]).includes(k)) as Verb[];
  if (verbs.length !== 1) throw new Error(`${where}: an effect needs exactly one of ${VERBS.join(', ')} (got ${verbs.join(', ') || 'none'})`);
  const verb = verbs[0] as Verb;
  for (const key of Object.keys(e)) {
    if (key !== verb && !COMPANIONS[verb].includes(key)) throw new Error(`${where}: "${key}" does not belong with "${verb}"`);
  }
  const value = e[verb];
  const known = (set: ReadonlySet<string> | undefined, id: string, what: string): void => {
    if (set && !set.has(id)) throw new Error(`${where}: ${verb} names ${what} "${id}", which does not exist`);
  };
  switch (verb) {
    case 'join':
    case 'leave':
      if (!isText(value)) throw new Error(`${where}: ${verb} needs a unit definition id`);
      known(ctx.units, value, 'the unit');
      if (e.count !== undefined && (verb !== 'join' || !isCount(e.count))) throw new Error(`${where}: count must be a whole number from 1 to 12, on a join`);
      break;
    case 'away':
      if (!Array.isArray(value) || !value.every(isText)) throw new Error(`${where}: away needs a list of unit definition ids`);
      for (const id of value) known(ctx.units, id as string, 'the unit');
      break;
    case 'grant':
      if (!isText(value)) throw new Error(`${where}: grant needs a support id`);
      known(ctx.supports, value, 'the support');
      if (!RANKS.includes(e.atLeast as Rank)) throw new Error(`${where}: grant needs atLeast: ${RANKS.join(', ')}`);
      break;
    case 'train':
      if (!isText(value)) throw new Error(`${where}: train needs a unit definition id`);
      known(ctx.units, value, 'the unit');
      if (!Number.isInteger(e.levels) || (e.levels as number) < 1 || (e.levels as number) > 10) throw new Error(`${where}: train needs levels from 1 to 10`);
      break;
    case 'give':
      if (!isText(value)) throw new Error(`${where}: give needs an item id`);
      known(ctx.items, value, 'the item');
      if (e.count !== undefined && !isCount(e.count)) throw new Error(`${where}: count must be a whole number from 1 to 12`);
      break;
    case 'dinars':
      if (!Number.isInteger(value) || (value as number) === 0) throw new Error(`${where}: dinars needs a whole number other than 0`);
      break;
    case 'flag':
      if (!isText(value)) throw new Error(`${where}: flag needs a name`);
      break;
    case 'unlock':
      if (!isText(value)) throw new Error(`${where}: unlock needs a Codex id`);
      known(ctx.codex, value, 'the Codex entry');
      break;
  }
  return raw as StepEffect;
}

function validateStep(raw: unknown, ctx: ChapterValidation, where: string): Step {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error(`${where}: a step must be an object`);
  const s = raw as Record<string, unknown>;
  const allow = (...keys: string[]): void => {
    for (const key of Object.keys(s)) if (key !== 'kind' && !keys.includes(key)) throw new Error(`${where}: a ${String(s.kind)} step has no "${key}"`);
  };
  switch (s.kind) {
    case 'name':
      allow();
      break;
    case 'card':
      allow('title', 'date');
      if (s.title !== undefined && !isText(s.title)) throw new Error(`${where}: card title must be text`);
      if (s.date !== undefined && !isText(s.date)) throw new Error(`${where}: card date must be text`);
      if (s.date !== undefined && s.title === undefined) throw new Error(`${where}: an interlude card with a date needs a title too`);
      break;
    case 'scenes':
      allow('scenes');
      if (!Array.isArray(s.scenes) || s.scenes.length === 0 || !s.scenes.every(isText)) throw new Error(`${where}: scenes needs a list of scene ids`);
      for (const id of s.scenes as string[]) if (ctx.scenes && !ctx.scenes.has(id)) throw new Error(`${where}: scene "${id}" does not exist`);
      break;
    case 'apply':
      allow('do');
      if (!Array.isArray(s.do) || s.do.length === 0) throw new Error(`${where}: apply needs a list of effects`);
      s.do.forEach((effect, i) => validateEffect(effect, ctx, `${where}, effect #${i}`));
      break;
    case 'camp':
      allow('label');
      if (s.label !== undefined && !isText(s.label)) throw new Error(`${where}: camp label must be text`);
      break;
    case 'battle':
      allow('battle');
      if (!isText(s.battle)) throw new Error(`${where}: battle needs a battle id`);
      if (ctx.battles && !ctx.battles.has(s.battle)) throw new Error(`${where}: battle "${s.battle}" does not exist`);
      break;
    default:
      throw new Error(`${where}: unknown step kind "${String(s.kind)}"`);
  }
  return raw as Step;
}

/** Validate untrusted data as the campaign's chapters. Throws a descriptive error naming the chapter and step. */
export function buildChapterTable(raw: readonly unknown[], ctx: ChapterValidation = {}): ChapterTable {
  const table = new Map<string, ChapterDef>();
  const joined = new Set<string>();
  let named = 0;
  raw.forEach((entry, i) => {
    const c = entry as Partial<ChapterDef> & Record<string, unknown>;
    const where = `chapter #${i}${typeof c.id === 'string' ? ` "${c.id}"` : ''}`;
    if (typeof c.id !== 'string' || !/^CH-[A-Z0-9]+$/.test(c.id)) throw new Error(`${where}: id must be a ledger chapter such as CH-01`);
    if (table.has(c.id)) throw new Error(`${where}: duplicate id`);
    if (!isText(c.title)) throw new Error(`${where}: needs a title`);
    if (!isText(c.date)) throw new Error(`${where}: needs a date`);
    if (!Array.isArray(c.steps) || c.steps.length === 0) throw new Error(`${where}: needs steps`);
    const steps = c.steps.map((step, k) => validateStep(step, ctx, `${where}, step #${k}`));
    steps.forEach((step, k) => {
      if (step.kind === 'name') named += 1;
      if (step.kind !== 'apply') return;
      step.do.forEach((effect) => {
        if ('join' in effect) {
          if (joined.has(effect.join)) throw new Error(`${where}, step #${k}: "${effect.join}" joins twice`);
          joined.add(effect.join);
        } else if ('leave' in effect && !joined.has(effect.leave)) {
          throw new Error(`${where}, step #${k}: "${effect.leave}" leaves before it has joined`);
        }
      });
    });
    table.set(c.id, { id: c.id, title: c.title, date: c.date, steps });
  });
  if (named > 1) throw new Error('chapters: the Recruit can be named only once');
  return table;
}

// ------------------------------------------------------------------ walking the chapters

export interface StepRef {
  readonly chapter: string;
  readonly step: number;
}

/** The step after this one: the next in the chapter, or the first of the next chapter, or null at the very end. */
export function stepAfter(table: ChapterTable, at: StepRef): StepRef | null {
  const chapter = table.get(at.chapter);
  if (!chapter) return null;
  if (at.step + 1 < chapter.steps.length) return { chapter: at.chapter, step: at.step + 1 };
  const ids = [...table.keys()];
  const next = ids[ids.indexOf(at.chapter) + 1];
  return next === undefined ? null : { chapter: next, step: 0 };
}

/** The first battle at or after a step: where the army is going next, to size its deployment. */
export function nextBattle(table: ChapterTable, from: StepRef): (StepRef & { readonly battle: string }) | null {
  let at: StepRef | null = from;
  while (at) {
    const step: Step | undefined = table.get(at.chapter)?.steps[at.step];
    if (step?.kind === 'battle') return { ...at, battle: step.battle };
    at = stepAfter(table, at);
  }
  return null;
}

/** The chapter's step, or undefined if it has none there. */
export const stepAt = (table: ChapterTable, at: StepRef): Step | undefined => table.get(at.chapter)?.steps[at.step];

// ------------------------------------------------------------------ carrying out the changes

/** What a campaign needs to carry out a step's changes. */
export interface EffectEnv {
  readonly units: UnitTable;
  readonly tables: BattleTables;
  /** The Codex, to ignore an `unlock` that names nothing. */
  readonly codex?: CodexTable;
}

export interface EffectReport {
  readonly joined: readonly UnitInstance[];
  readonly left: readonly UnitInstance[];
}

/** The first `base#n` not already an id in the army. */
function freshId(base: string, taken: ReadonlySet<string>): string {
  let n = 1;
  while (taken.has(`${base}#${n}`)) n += 1;
  return `${base}#${n}`;
}

/** Carry out a step's changes on the campaign. Throws if the data names something that does not exist. */
export function applyEffects(campaign: Campaign, effects: readonly StepEffect[], env: EffectEnv): EffectReport {
  const { army } = campaign;
  const joined: UnitInstance[] = [];
  const left: UnitInstance[] = [];
  for (const effect of effects) {
    if ('join' in effect) {
      const def = env.units[effect.join];
      if (!def) throw new Error(`Cannot join unknown unit "${effect.join}"`);
      const count = effect.count ?? 1;
      for (let n = 0; n < count; n++) {
        const taken = new Set(army.units.map((u) => u.id));
        const id = count > 1 || taken.has(def.id) ? freshId(def.id, taken) : def.id;
        // a troop of the same kind is told apart by a number; the Recruit is whatever the player called him
        const number = /#(\d+)$/.exec(id)?.[1];
        const name = def.playerNamed ? campaign.recruitName : number ? `${def.name} ${number}` : undefined;
        const unit = createUnit(def, id, 0, 0, env.tables, name ? { name } : {});
        army.units.push(unit);
        army.deployed.add(unit.id);
        joined.push(unit);
      }
    } else if ('leave' in effect) {
      for (const unit of army.units.filter((u) => u.defId === effect.leave)) {
        left.push(unit);
        army.deployed.delete(unit.id);
      }
      army.units = army.units.filter((u) => u.defId !== effect.leave);
      army.away.delete(effect.leave);
    } else if ('away' in effect) {
      const before = army.away;
      army.away = new Set(effect.away);
      for (const unit of army.units) {
        if (army.away.has(unit.defId)) army.deployed.delete(unit.id);
        else if (before.has(unit.defId)) army.deployed.add(unit.id); // back with the army, and going unless it is left out
      }
    } else if ('grant' in effect) {
      if (!army.supports) throw new Error('The army has no supports to grant points in');
      const state = army.supports.stateOf(effect.grant);
      state.points = Math.max(state.points, THRESHOLDS[effect.atLeast]);
    } else if ('train' in effect) {
      const rng = createRng(hashSeed(campaign.seed, 'train', effect.train, campaign.chapter ?? '', campaign.step));
      for (const unit of army.units.filter((u) => u.defId === effect.train)) {
        const classDef = env.tables.classes.get(unit.classId);
        if (!classDef) throw new Error(`Unit "${unit.id}" has unknown class "${unit.classId}"`);
        for (let n = 0; n < effect.levels && unit.level < env.tables.balance.levelCap; n++) levelUp(unit, classDef, rng, true);
      }
    } else if ('give' in effect) {
      const uses = freshUses(effect.give, env.tables);
      if (uses === null) throw new Error(`Cannot give unknown item "${effect.give}"`);
      for (let n = 0; n < (effect.count ?? 1); n++) army.convoy.push({ id: effect.give, uses });
    } else if ('dinars' in effect) {
      army.dinars = Math.max(0, army.dinars + effect.dinars);
    } else if ('flag' in effect) {
      campaign.flags.add(effect.flag);
    } else if ('unlock' in effect) {
      if (!env.codex || env.codex.has(effect.unlock)) campaign.codex.add(effect.unlock);
    }
  }
  return { joined, left };
}
