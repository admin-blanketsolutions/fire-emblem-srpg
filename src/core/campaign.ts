import type { Army, CampaignMode, Result } from './army';

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
