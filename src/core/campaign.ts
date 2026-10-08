import { settleChapter, type Army, type CampaignMode, type ChapterSettlement, type Result } from './army';
import type { BattleState } from './battle';
import type { Point } from './types';
import type { UnitInstance } from './unit';

/**
 * A campaign in progress: what a save slot holds (DESIGN §3.9). The army carries the units, the
 * convoy, the dinars and the supports; the campaign adds the mode, the seed the battles are drawn
 * from, where in the story it stands (a chapter and a step of it), the story flags, the Codex
 * entries unlocked and the name the player gave the Recruit.
 */
export interface Campaign {
  /** Classic or Casual (DESIGN §16). Classic may become Casual in camp; never the reverse. */
  mode: CampaignMode;
  /** Every battle's seed derives from this and the battle's id. */
  readonly seed: number;
  /** Which story the campaign plays: `campaign`, or a demo's stand-ins. */
  readonly story: string;
  /** The chapter being played; null before the first. */
  chapter: string | null;
  /** The step of the chapter the campaign has reached: the one to play next, or the one in progress. */
  step: number;
  readonly flags: Set<string>;
  /** Codex entries unlocked, by id. */
  readonly codex: Set<string>;
  /** What the player named the Recruit. */
  recruitName: string;
  readonly army: Army;
}

export interface CampaignOptions {
  readonly mode: CampaignMode;
  readonly seed: number;
  readonly story: string;
  readonly army: Army;
  readonly chapter?: string | null;
  readonly step?: number;
  readonly recruitName?: string;
}

/** What the Recruit is called until the player says otherwise. */
export const DEFAULT_RECRUIT_NAME = 'Recruit';

export const newCampaign = ({ mode, seed, story, army, chapter = null, step = 0, recruitName = DEFAULT_RECRUIT_NAME }: CampaignOptions): Campaign => ({
  mode,
  seed,
  story,
  chapter,
  step,
  flags: new Set(),
  codex: new Set(),
  recruitName,
  army,
});

/**
 * Change the mode. Classic → Casual is allowed at any camp; Casual → Classic is refused, since it
 * would condemn after the fact the units that Casual brought back.
 */
export function changeMode(campaign: Campaign, to: CampaignMode): Result {
  if (campaign.mode === to) return { ok: true };
  if (to === 'classic') return { ok: false, reason: 'A Casual campaign cannot become Classic.' };
  campaign.mode = to;
  return { ok: true };
}

// ------------------------------------------------------------------ deployment

const isArmys = (u: UnitInstance): boolean => u.kind === 'unit' && (u.side === 'player' || u.side === 'ally');

/** A spawn the map leaves open: any unit the player chooses may stand there. */
export const OPEN_SLOT = 'slot';

/**
 * What a map asks of the army (DESIGN §8, Preparations). The map's player spawns are of two
 * kinds: a named one (`ayyub`) is that unit and no other, and an open one, tagged `slot`, is a
 * place for any unit the player chooses. An ally spawn of a unit the army has (a father inside
 * the walls) is the army's unit too. `limit` is how many units the map takes; `required` are the
 * army's units a named spawn calls for, who must go.
 */
export function deploymentFor(battle: BattleState, army: Army): { limit: number; required: UnitInstance[] } {
  const claimed = new Set<UnitInstance>();
  const required: UnitInstance[] = [];
  let limit = 0;
  for (const placed of battle.units) {
    if (!isArmys(placed)) continue;
    if (placed.tags.includes(OPEN_SLOT)) {
      limit += 1;
      continue;
    }
    const own = army.units.find((u) => u.defId === placed.defId && !claimed.has(u) && !army.away.has(u.defId));
    if (own) {
      claimed.add(own);
      required.push(own);
      limit += 1;
    }
  }
  return { limit, required };
}

/**
 * Put the army on the field in place of the map's own units (DESIGN §8). A named spawn is
 * replaced by the army's unit of that definition, if the unit is going; if it is not (it was
 * left out, it is away, or the army has lost it) the spawn is taken off, unless it is a guest
 * (`guest`) or an ally the army never had. The open slots are filled, in order, by the other
 * units the player chose. Each unit keeps its own experience and takes the tags, the side and the
 * behaviour the map gives its spawn; the Lord of one chapter is not the Lord of the next.
 */
export function fieldArmy(battle: BattleState, army: Army): void {
  const claimed = new Set<UnitInstance>();
  const open: Point[] = [];
  const going = (u: UnitInstance): boolean => army.deployed.has(u.id) && !army.away.has(u.defId);

  for (let i = 0; i < battle.units.length; i++) {
    const placed = battle.units[i];
    if (!placed || !isArmys(placed)) continue;
    if (placed.tags.includes(OPEN_SLOT)) {
      open.push({ x: placed.x, y: placed.y });
      battle.units.splice(i, 1);
      i--;
      continue;
    }
    const own = army.units.find((u) => u.defId === placed.defId && !claimed.has(u));
    if (!own) {
      // the army has no such unit: an ally of the map's own, or a guest, stays; a player spawn the army cannot fill goes
      if (placed.side === 'player' && !placed.tags.includes('guest')) {
        battle.units.splice(i, 1);
        i--;
      }
      continue;
    }
    claimed.add(own);
    if (!going(own)) {
      battle.units.splice(i, 1);
      i--;
      continue;
    }
    if (own !== placed) battle.units[i] = own;
    place(own, { x: placed.x, y: placed.y, side: placed.side, ai: placed.ai }, placed.tags.filter((t) => t !== 'guest'));
  }

  // the open slots, filled by the units chosen who have no spawn of their own
  const waiting = army.units.filter((u) => !claimed.has(u) && going(u));
  waiting.slice(0, open.length).forEach((unit, k) => {
    const spot = open[k] as Point;
    battle.units.push(unit);
    place(unit, { x: spot.x, y: spot.y, side: 'player', ai: null }, []);
  });
  battle.updateVisibility();
}

/** Put an army unit where the map put its spawn, as the map says: tile, side, behaviour and tags. */
function place(unit: UnitInstance, at: { x: number; y: number; side: UnitInstance['side']; ai: UnitInstance['ai'] }, tags: readonly string[]): void {
  Object.assign(unit, {
    x: at.x,
    y: at.y,
    home: { x: at.x, y: at.y },
    side: at.side,
    ai: at.ai,
    moved: false,
    acted: false,
    travelled: 0,
    bonusMove: 0,
    turnFlags: [],
    triggered: false,
  });
  unit.tags = tags.filter((t) => t !== OPEN_SLOT);
}

// ------------------------------------------------------------------ a battle's beginning and end

/** Start a battle for the campaign: the army's supports go in, its units take the field, and the first phase begins. */
export function launchBattle(campaign: Campaign, battle: BattleState): void {
  if (campaign.army.supports) battle.supports = campaign.army.supports;
  fieldArmy(battle, campaign.army);
  battle.begin();
}

/**
 * The battle is over. A victory brings the army home under the campaign's rules (Classic or
 * Casual) and keeps the flags the battle raised; the result says who was lost and who joined. A
 * defeat changes nothing and returns null: the campaign goes back to where it was saved.
 */
export function concludeBattle(campaign: Campaign, battle: BattleState): ChapterSettlement | null {
  if (battle.outcome?.result !== 'won') return null;
  const settled = settleChapter(campaign.army, battle, campaign.mode, campaign.chapter ?? undefined);
  for (const flag of battle.flags) campaign.flags.add(flag);
  return settled;
}
