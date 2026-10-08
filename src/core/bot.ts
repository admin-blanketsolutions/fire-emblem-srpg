import { playPhase } from './ai';
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

/** The computer plays every side of the battle until it is decided (or `maxPhases` have passed, which is a loss). */
export function autoPlay(battle: BattleState, stance: AiProfile = { mode: 'aggressive' }, maxPhases = 300): void {
  for (let i = 0; i < maxPhases && !battle.outcome; i++) {
    // units won over, or arrived, since the last phase are played too
    for (const u of battle.units) if (u.side === 'player' && u.kind === 'unit' && !u.retreated && !u.ai) u.ai = stance;
    playPhase(battle, battle.phase);
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
