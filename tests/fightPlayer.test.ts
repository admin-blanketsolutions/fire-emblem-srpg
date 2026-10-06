import { describe, expect, it } from 'vitest';
import { DRAIN_MS, FADE_MS, FightPlayer, IMPACT_MS, STRIKE_MS } from '../src/scenes/fightPlayer';
import { arena, battleOf, scripted, unit } from './support';

/** A fight with scripted rolls: [hit?, crit?]... per strike, and the units involved. */
function fightOf(rolls: number[], tweak: (a: ReturnType<typeof unit>, e: ReturnType<typeof unit>) => void = () => undefined) {
  const a = unit({ id: 'a', x: 0, y: 0 });
  const e = unit({ id: 'e', side: 'enemy', x: 1, y: 0 });
  tweak(a, e);
  const battle = battleOf([a, e], arena(), scripted(...rolls));
  return { a, e, report: battle.fight(a, e) };
}

describe('the fight player', () => {
  it('runs one strike after another and ends after the last', () => {
    const { report } = fightOf([0, 99, 0, 99]); // both hit, neither crits
    expect(report.events).toHaveLength(2);
    const player = new FightPlayer(report);
    expect(player.done).toBe(false);
    player.update(2 * STRIKE_MS - 1);
    expect(player.done).toBe(false);
    player.update(1000);
    expect(player.done).toBe(true);
  });

  it('fires each strike cue once, at the moment of impact, in order', () => {
    const { report, a, e } = fightOf([0, 99, 99]); // the attacker hits; the counter misses
    const player = new FightPlayer(report);
    expect(player.update(IMPACT_MS - 1)).toEqual([]);
    const first = player.update(1);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ kind: 'strike', actor: a, target: e });
    expect(player.update(100)).toEqual([]); // not again
    const second = player.update(STRIKE_MS);
    expect(second[0]).toMatchObject({ kind: 'strike', actor: e, target: a });
  });

  it('drains the target’s HP bar from its old value to its new one', () => {
    const { report, e } = fightOf([0, 99, 99]);
    const player = new FightPlayer(report);
    const before = report.hpBefore.defender;
    const after = e.hp;
    expect(after).toBeLessThan(before);
    expect(player.frame().hp.get(e.id)).toBe(before);
    player.update(IMPACT_MS + DRAIN_MS / 2);
    const mid = player.frame().hp.get(e.id)!;
    expect(mid).toBeLessThan(before);
    expect(mid).toBeGreaterThan(after);
    player.update(DRAIN_MS);
    expect(player.frame().hp.get(e.id)).toBe(after);
  });

  it('lunges the striker toward its target and back', () => {
    const { report, a } = fightOf([0, 99, 99]);
    const player = new FightPlayer(report);
    player.update(IMPACT_MS - 1);
    expect(player.frame().offsets.get(a.id)?.x).toBeGreaterThan(0); // the target is to the right
    player.update(IMPACT_MS * 2);
    expect(player.frame().offsets.get(a.id)).toBeUndefined();
  });

  it('flashes a unit that was hit and sidesteps one that was missed', () => {
    const hit = new FightPlayer(fightOf([0, 99, 99]).report);
    const seen = new Set<boolean>();
    for (let t = 0; t < 400; t += 20) {
      hit.update(20);
      seen.add(hit.frame().blink.has('e'));
    }
    expect(seen.has(true)).toBe(true);

    const miss = fightOf([99, 99]); // the attacker misses; so does the counter
    const player = new FightPlayer(miss.report);
    player.update(IMPACT_MS + 20);
    expect(player.frame().blink.size).toBe(0);
    expect(player.frame().offsets.get('e')).not.toBeUndefined();
  });

  it('fades the fallen after the blow and cues the defeat', () => {
    const { report, e } = fightOf([0, 99], (_a, foe) => {
      foe.hp = 1;
    });
    const player = new FightPlayer(report);
    expect(report.events[0]?.killed).toBe(true);
    expect(player.frame().alpha.get(e.id)).toBe(1);
    const cues = player.update(IMPACT_MS + DRAIN_MS);
    expect(cues.map((c) => c.kind)).toEqual(['strike', 'defeat']);
    player.update(FADE_MS / 2);
    const alpha = player.frame().alpha.get(e.id)!;
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(1);
    player.update(FADE_MS);
    expect(player.frame().alpha.get(e.id)).toBe(0);
    expect(player.done).toBe(false); // a short pause follows the fade
    player.update(200);
    expect(player.done).toBe(true);
  });

});
