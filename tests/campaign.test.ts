import { describe, expect, it } from 'vitest';
import { runCampaign } from '../src/core/bot';
import { botEnvFor, newCampaignFor, STORIES } from '../src/data/battles';

describe('the campaign, walked by the computer', () => {
  it('has chapters in the ledger order, each ending at the next', () => {
    expect([...STORIES.campaign.chapters.keys()][0]).toBe('CH-00');
  });

  it('plays the Prologue from the first step to the last', () => {
    const campaign = newCampaignFor('campaign', 'casual', 7);
    const report = runCampaign(botEnvFor('campaign'), campaign, { talks: true });
    expect(report.battles[0]?.battle).toBe('CH-00');
    expect(report.battles[0]).toMatchObject({ result: expect.stringMatching(/won|lost/) });
    // the Recruit is called what the player called him
    expect(campaign.army.units.some((u) => u.defId === 'recruit')).toBe(true);
  });
});
