import { describe, expect, it } from 'vitest';
import { runCampaign } from '../src/core/bot';
import { toggleDeploy } from '../src/core/camp';
import { launchBattle } from '../src/core/campaign';
import { hashSeed } from '../src/core/rng';
import { botEnvFor, newCampaignFor } from '../src/data/battles';

/**
 * Bayn al-Qasrayn (CH-03C): the square is held for eight turns, or the fighting is ended at once by
 * burning the Caliph's pavilion at its head. Steel must not be the quick way: the silks turn spears
 * and arrows, and only the Fire Thrower's naphtha, which they do not turn, brings them down.
 */

function squareWithFireThrower() {
  const env = botEnvFor('campaign');
  const campaign = newCampaignFor('campaign', 'casual', 4242);
  runCampaign(env, campaign, { talks: true, keepGoing: true, until: 'CH-03C' });
  const { army } = campaign;
  const thrower = army.units.find((u) => u.defId === 'army-fire-thrower')!;
  if (!army.deployed.has(thrower.id)) {
    // the player's choice: the Fire Thrower goes in place of a spearman
    const spare = army.units.find((u) => u.defId === 'garrison-soldier' && army.deployed.has(u.id))!;
    toggleDeploy(army, spare);
    expect(toggleDeploy(army, thrower)).toEqual({ ok: true });
  }
  const battle = env.battle('CH-03C', { hitMode: 'honest' }, hashSeed(campaign.seed, 'CH-03C'));
  launchBattle(campaign, battle);
  const find = (def: string) => battle.units.find((u) => u.defId === def)!;
  return { battle, thrower: find('army-fire-thrower'), pavilion: find('pavilion') };
}

describe('Bayn al-Qasrayn', () => {
  it('lets steel scratch the pavilion and naphtha burn it down', () => {
    const { battle, pavilion } = squareWithFireThrower();
    let steel = 0;
    let fire = 0;
    for (const unit of battle.units.filter((u) => u.side === 'player' && u.kind === 'unit')) {
      unit.inventory.forEach((stack, slot) => {
        const weapon = battle.tables.weapons.get(stack.id);
        if (!weapon || weapon.range[0] > 2) return;
        const from = { x: pavilion.x, y: pavilion.y + Math.min(weapon.range[1], 2) };
        const strike = battle.forecastFor(unit, pavilion, { from, slot })?.attacker.strike;
        if (!strike) return;
        if (weapon.kind === 'fire') fire = Math.max(fire, strike.damage);
        else steel = Math.max(steel, strike.damage);
      });
    }
    expect(steel, 'the best blow of any spear, sabre, mace or arrow').toBeLessThanOrEqual(6);
    expect(fire, 'a naphtha pot, which does double against silk').toBeGreaterThanOrEqual(pavilion.hp / 3);
  });

  it('ends at once, in a win, when the pavilion burns', () => {
    const { battle, thrower, pavilion } = squareWithFireThrower();
    // two tiles south of the pavilion, behind its guard, with a steady hand
    Object.assign(thrower, { x: pavilion.x, y: pavilion.y + 2 });
    thrower.stats.skl = 60;
    for (let i = 0; i < 6 && pavilion.hp > 0 && !battle.outcome; i++) battle.fight(thrower, pavilion);
    expect(pavilion.hp).toBe(0);
    expect(battle.outcome).toEqual({ result: 'won', reason: 'The regiments lost heart and scattered.' });
    expect(battle.flags.has('pavilion-burned')).toBe(true);
    expect(battle.messages.some((m) => m.kind === 'dialogue' && m.scene === 'ch03.pavilion')).toBe(true);
  });
});
