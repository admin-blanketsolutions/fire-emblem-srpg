import { playPhase } from './ai';
import { matchesKey } from './events';
import { tileKey } from './grid';
import { distanceField } from './pathfinding';
import type { Point } from './types';
import type { UnitInstance } from './unit';
import type { AiProfile } from './aiProfile';
import type { BattleRules, BattleState, BattleTables } from './battle';
import { availableTalks, completeTalk, fitDeployment, promotable, promoteWithItem } from './camp';
import { concludeBattle, deploymentFor, launchBattle, type Campaign } from './campaign';
import { applyEffects, nextBattle, stepAfter, stepAt, type ChapterTable } from './chapters';
import type { CodexTable } from './codex';
import { DialogueRunner, type SceneTable } from './dialogue';
import { hashSeed } from './rng';
import type { SupportGate } from './supports';
import type { UnitTable } from './unit';

/**
 * A player that is a computer: it walks the chapters of a story the way the game does (cards and
 * scenes pass, changes to the army are made, the camp is used, battles are fought) with the army
 * played by the same AI as everyone else. It plays no better than a careless player, so what it
 * achieves is a floor, not a ceiling: the tests use it to prove the whole story can be walked
 * and saved, and the balance tool to see how the chapters feel under many seeds.
 */

export interface BotEnv {
  readonly chapters: ChapterTable;
  readonly scenes: SceneTable;
  readonly units: UnitTable;
  /** Rules, items and classes. */
  readonly tables: BattleTables;
  readonly codex?: CodexTable;
  /** A battle of the story, built but not begun. */
  readonly battle: (battleId: string, rules: Partial<BattleRules>, seed: number) => BattleState;
}

export interface BotOptions {
  /** How the army's units behave in a battle; aggressive unless the battle is named here. */
  readonly stance?: Readonly<Record<string, AiProfile>>;
  /** Hear every conversation a camp allows, so supports advance as they would for a diligent player. */
  readonly talks?: boolean;
  readonly rules?: Partial<BattleRules>;
  /** Stop before this battle is fought. */
  readonly until?: string;
  /** Stop on reaching this chapter, before its first step (the campaign is left standing there). */
  readonly untilChapter?: string;
  /** Play a battle some way other than letting the AI play it out (a council, which is won by talking). */
  readonly plays?: Readonly<Record<string, (battle: BattleState) => void>>;
  /** Called as each battle ends, before the army is settled. */
  readonly onBattle?: (battle: BattleState, battleId: string) => void;
  /** After a lost battle, carry on as if it had been won (for measuring the chapters after it, not for playing). */
  readonly keepGoing?: boolean;
}

export interface BattleReport {
  readonly battle: string;
  readonly result: 'won' | 'lost';
  readonly reason: string;
  readonly turns: number;
  /** Named units' level before and after, by definition id. */
  readonly levels: Readonly<Record<string, readonly [number, number]>>;
  /** Units of the army lost under the Classic rules. */
  readonly lost: readonly string[];
}

export interface RunReport {
  readonly battles: readonly BattleReport[];
  /** Every step was played; the story is over. */
  readonly completed: boolean;
  /** The battle that was lost, if one was. */
  readonly failedAt: string | null;
}

const LORD_STANCE: AiProfile = { mode: 'defensive', aggroRange: 1 };

/** Move a unit as far toward a tile as it can go this turn; it does not move if no reachable tile is nearer. */
function stepToward(battle: BattleState, unit: UnitInstance, goal: Point): void {
  const reach = battle.reachFor(unit);
  const field = distanceField(battle.map, unit.moveType, [goal], battle.costFor(unit));
  const value = (p: Point): number => field.get(tileKey(p.x, p.y)) ?? Number.POSITIVE_INFINITY;
  const best = [...reach.stops].sort((a, b) => value(a) - value(b) || a.y - b.y || a.x - b.x)[0];
  if (best && value(best) < value(unit)) battle.moveUnit(unit, best, reach);
}

/** A careless player does not talk. This one does, when the chapter has a conversation waiting: it walks a speaker to the other and talks. */
function talkTurn(battle: BattleState): void {
  for (const pending of battle.events.pendingTalks()) {
    for (const [speakerKey, targetKey] of [[pending.a, pending.b], [pending.b, pending.a]] as const) {
      const speaker = battle.livingUnits('player').find((u) => u.kind === 'unit' && !u.acted && matchesKey(u, speakerKey));
      const target = battle.livingUnits().find((u) => u.kind === 'unit' && u !== speaker && matchesKey(u, targetKey));
      if (!speaker || !target) continue;
      if (!battle.talkTargets(speaker).includes(target)) stepToward(battle, speaker, target);
      if (battle.talkTargets(speaker).includes(target)) battle.talk(speaker, target);
      else battle.wait(speaker);
      break;
    }
  }
}

/** Nor does it seize unless the way is clear: the Lord goes for the tile once it is open and not heavily held. */
function seizeTurn(battle: BattleState): void {
  const objective = battle.map.rules.objective;
  if (!objective || objective.type !== 'seize') return;
  const goal = { x: objective.tiles[0]?.[0] ?? 0, y: objective.tiles[0]?.[1] ?? 0 };
  const by = objective.by ?? 'lord';
  const clear = !battle.unitAt(goal.x, goal.y) && battle.livingUnits('enemy').filter((e) => e.kind === 'unit' && Math.abs(e.x - goal.x) + Math.abs(e.y - goal.y) <= 3).length <= 2;
  if (!clear) return;
  for (const unit of battle.livingUnits('player')) {
    if (unit.kind !== 'unit' || unit.acted || !(by === 'any' || (by === 'lord' ? unit.tags.includes('lord') : matchesKey(unit, by)))) continue;
    const reach = battle.reachFor(unit);
    const stop = reach.stops.find((p) => p.x === goal.x && p.y === goal.y);
    if (stop) {
      battle.moveUnit(unit, stop, reach);
      battle.seize(unit);
    } else {
      stepToward(battle, unit, goal);
    }
  }
}

/** When the chapter is to be survived, not won, the Lord keeps as far from the enemy as the ground allows. */
function lordKeepsAway(battle: BattleState): void {
  const objective = battle.map.rules.objective;
  if (!objective || (objective.type !== 'defend' && objective.type !== 'survive')) return;
  const foes = battle.livingUnits('enemy').filter((e) => e.kind === 'unit');
  if (foes.length === 0) return;
  for (const lord of battle.livingUnits('player').filter((u) => u.kind === 'unit' && u.tags.includes('lord') && !u.acted)) {
    const reach = battle.reachFor(lord);
    const nearest = (p: Point): number => Math.min(...foes.map((e) => Math.abs(e.x - p.x) + Math.abs(e.y - p.y)));
    const best = [...reach.stops].sort((a, b) => nearest(b) - nearest(a) || a.y - b.y || a.x - b.x)[0];
    if (best && nearest(best) > nearest(lord)) battle.moveUnit(lord, best, reach);
  }
}

/** The computer plays every side of the battle until it is decided (or `maxPhases` have passed, which is a loss). */
export function autoPlay(battle: BattleState, stance: AiProfile = { mode: 'aggressive' }, maxPhases = 300): void {
  for (let i = 0; i < maxPhases && !battle.outcome; i++) {
    // units won over, or arrived, since the last phase are played too
    // the Lord, whom the whole chapter hangs on, holds back and fights what comes to him
    for (const u of battle.units) if (u.side === 'player' && u.kind === 'unit' && !u.retreated && !u.ai) u.ai = u.tags.includes('lord') ? LORD_STANCE : stance;
    if (battle.phase === 'player') {
      talkTurn(battle);
      if (!battle.outcome) seizeTurn(battle);
      if (!battle.outcome) lordKeepsAway(battle);
    }
    if (!battle.outcome) playPhase(battle, battle.phase);
    if (!battle.outcome) battle.endPhase();
  }
  if (!battle.outcome) battle.outcome = { result: 'lost', reason: 'The battle went on past all reason.' };
}

const supportGate = (campaign: Campaign, chapters: ChapterTable): SupportGate => ({ chapter: campaign.chapter, chapterOrder: [...chapters.keys()], flags: campaign.flags });

/** Play a scene unseen: what it raises (flags, Codex entries) still happens. */
function passScene(campaign: Campaign, env: BotEnv, id: string): void {
  const scene = env.scenes.get(id);
  if (!scene) throw new Error(`The chapter plays scene "${id}", which does not exist`);
  const runner = new DialogueRunner(scene);
  runner.skip();
  for (const effect of runner.take()) {
    if ('flag' in effect) campaign.flags.add(effect.flag);
    else if ('unlock' in effect && (!env.codex || env.codex.has(effect.unlock))) campaign.codex.add(effect.unlock);
  }
}

/** The camp: size the deployment for the next battle, hear the talks, and promote whoever can be. */
function useCamp(campaign: Campaign, env: BotEnv, options: BotOptions): void {
  const { army } = campaign;
  const upcoming = nextBattle(env.chapters, { chapter: campaign.chapter ?? '', step: campaign.step });
  if (upcoming) {
    const preview = env.battle(upcoming.battle, {}, 1);
    const { limit, required } = deploymentFor(preview, army);
    fitDeployment(army, limit, required);
  }
  for (let guard = 0; options.talks && guard < 12; guard++) {
    const gate = supportGate(campaign, env.chapters);
    const talk = availableTalks(army, gate)[0];
    if (!talk) break;
    completeTalk(army, talk, gate);
  }
  for (const entry of promotable(army, env.tables)) promoteWithItem(army, entry.unit, env.tables);
}

/** Walk the story from where the campaign stands, playing every step, until it ends, a battle is lost, or `until` is reached. */
export function runCampaign(env: BotEnv, campaign: Campaign, options: BotOptions = {}): RunReport {
  const battles: BattleReport[] = [];
  const rules: Partial<BattleRules> = { hitMode: 'honest', guaranteedProgress: true, ...options.rules };
  let at = { chapter: campaign.chapter ?? '', step: campaign.step };
  let failedAt: string | null = null;
  for (let guard = 0; guard < 500; guard++) {
    const step = stepAt(env.chapters, at);
    if (!step) break;
    campaign.chapter = at.chapter;
    campaign.step = at.step;
    if (options.untilChapter === at.chapter) return { battles, completed: false, failedAt };
    switch (step.kind) {
      case 'name':
      case 'card':
        break;
      case 'scenes':
        for (const id of step.scenes) passScene(campaign, env, id);
        break;
      case 'apply':
        applyEffects(campaign, step.do, env);
        break;
      case 'camp':
        useCamp(campaign, env, options);
        break;
      case 'battle': {
        if (options.until === step.battle) return { battles, completed: false, failedAt: null };
        const battle = env.battle(step.battle, rules, hashSeed(campaign.seed, step.battle));
        launchBattle(campaign, battle);
        const before = Object.fromEntries(campaign.army.units.map((u) => [u.defId, u.level] as const));
        const play = options.plays?.[step.battle];
        if (play) play(battle);
        else autoPlay(battle, options.stance?.[step.battle]);
        options.onBattle?.(battle, step.battle);
        const outcome = battle.outcome ?? { result: 'lost' as const, reason: 'Undecided.' };
        let settled = concludeBattle(campaign, battle);
        if (!settled && options.keepGoing) {
          battle.outcome = { result: 'won', reason: 'Carried on after a defeat.' };
          settled = concludeBattle(campaign, battle);
        }
        for (const id of battle.codexUnlocks) if (!env.codex || env.codex.has(id)) campaign.codex.add(id);
        const levels = Object.fromEntries(
          campaign.army.units.filter((u) => before[u.defId] !== undefined && !/#\d+$/.test(u.id)).map((u) => [u.defId, [before[u.defId] as number, u.level] as const] as const),
        );
        battles.push({ battle: step.battle, result: outcome.result, reason: outcome.reason, turns: battle.turn, levels, lost: (settled?.lost ?? []).map((u) => u.id) });
        if (!settled) return { battles, completed: false, failedAt: step.battle };
        if (outcome.result === 'lost') failedAt ??= step.battle;
        break;
      }
    }
    const next = stepAfter(env.chapters, at);
    if (!next) {
      return { battles, completed: true, failedAt };
    }
    at = next;
  }
  return { battles, completed: false, failedAt };
}
