import type { Army, CampaignMode, Result } from './army';
import type { BattleState } from './battle';

/**
 * A campaign in progress: what a save slot holds (DESIGN §3.9). The army carries the units, the
 * convoy, the dinars and the supports; the campaign adds the mode, the seed the battles are drawn
 * from, the chapter reached, the story flags and the Codex entries unlocked.
 */
export interface Campaign {
  /** Classic or Casual (DESIGN §16). Classic may become Casual in camp; never the reverse. */
  mode: CampaignMode;
  /** Every battle's seed derives from this and the chapter id. */
  readonly seed: number;
  /** Which story the campaign plays: `campaign`, or a demo's stand-ins. */
  readonly story: string;
  /** The chapter reached: the one just finished or being prepared; null before the first. */
  chapter: string | null;
  readonly flags: Set<string>;
  /** Codex entries unlocked, by id. */
  readonly codex: Set<string>;
  readonly army: Army;
}

export interface CampaignOptions {
  readonly mode: CampaignMode;
  readonly seed: number;
  readonly story: string;
  readonly army: Army;
  readonly chapter?: string | null;
}

export const newCampaign = ({ mode, seed, story, army, chapter = null }: CampaignOptions): Campaign => ({
  mode,
  seed,
  story,
  chapter,
  flags: new Set(),
  codex: new Set(),
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

/**
 * Put the army's units on the field in place of the map's units of the same definition, where the
 * map placed them (DESIGN §8, Preparations). Units the player left out of the deployment are taken
 * off; map units the army does not have (a guest) stay. The map's tags for a spawn (such as `lord`)
 * are kept on the army's unit.
 */
export function fieldArmy(battle: BattleState, army: Army): void {
  for (let i = 0; i < battle.units.length; i++) {
    const placed = battle.units[i];
    if (!placed || placed.side !== 'player' || placed.kind !== 'unit') continue;
    const own = army.units.find((u) => u.defId === placed.defId);
    if (!own || own === placed) continue;
    if (!army.deployed.has(own.id)) {
      battle.units.splice(i, 1);
      i--;
      continue;
    }
    Object.assign(own, { x: placed.x, y: placed.y, home: { x: placed.x, y: placed.y }, moved: false, acted: false, travelled: 0, bonusMove: 0, turnFlags: [] });
    for (const tag of placed.tags) if (!own.tags.includes(tag)) own.tags.push(tag);
    battle.units[i] = own;
  }
  battle.updateVisibility();
}
