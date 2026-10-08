import { describe, it } from 'vitest';
import { runCampaign, type BattleReport } from '../src/core/bot';
import { botEnvFor, newCampaignFor, STORIES } from '../src/data/battles';

/**
 * The balance tool (DESIGN §5.7, §17): the computer plays the story many times, over many seeds,
 * and says how each battle goes: how often it is won, how long it lasts, who is lost, and how far
 * the army has levelled. It plays like a careless player, so a win rate here is a floor.
 *
 *   npm run balance                       forty seeds, Classic, the whole slice
 *   SEEDS=200 MODE=casual npm run balance
 *   ONLY=CH-01 npm run balance            report just one battle
 */

const SEEDS = Number(process.env['SEEDS'] ?? 40);
const MODE = process.env['MODE'] === 'casual' ? 'casual' : 'classic';
const ONLY = process.env['ONLY'];
/** `STANCE=defensive` has the army hold its ground and fight what comes, as a careful player would; the default charges. */
const STANCE = process.env['STANCE'] === 'defensive' ? ({ mode: 'defensive', aggroRange: 3 } as const) : undefined;

interface Row {
  runs: number;
  won: number;
  turns: number;
  lost: number;
  /** Why the battles that were lost were lost. */
  reasons: Map<string, number>;
  levels: Map<string, { from: number; to: number; n: number }>;
}

describe('balance', () => {
  it('reports the slice', () => {
    const rows = new Map<string, Row>();
    for (let seed = 1; seed <= SEEDS; seed++) {
      const campaign = newCampaignFor('campaign', MODE, seed * 7919);
      const stance = STANCE ? Object.fromEntries([...STORIES.campaign.chapters.values()].flatMap((c) => c.steps.flatMap((st) => (st.kind === 'battle' ? [[st.battle, STANCE] as const] : [])))) : undefined;
      const report = runCampaign(botEnvFor('campaign'), campaign, { talks: true, keepGoing: true, ...(stance ? { stance } : {}) });
      for (const b of report.battles) add(rows, b);
    }
    const order = [...STORIES.campaign.chapters.values()].flatMap((c) => c.steps.flatMap((s) => (s.kind === 'battle' ? [s.battle] : [])));
    const lines: string[] = [`\nBalance over ${SEEDS} seeds, ${MODE}, careless computer player`, ''];
    for (const id of order) {
      if (ONLY && ONLY !== id) continue;
      const r = rows.get(id);
      if (!r) continue;
      const levels = [...r.levels].map(([u, v]) => `${u} ${(v.from / v.n).toFixed(1)}→${(v.to / v.n).toFixed(1)}`).join(', ');
      lines.push(`${id.padEnd(7)} won ${((100 * r.won) / r.runs).toFixed(0).padStart(3)}%  turns ${(r.turns / r.runs).toFixed(1).padStart(4)}  lost ${(r.lost / r.runs).toFixed(1)}/run   ${levels}`);
      if (r.reasons.size > 0) lines.push(`        defeats: ${[...r.reasons].map(([why, n]) => `${why} ×${n}`).join('; ')}`);
    }
    console.log(lines.join('\n'));
  });
});

function add(rows: Map<string, Row>, b: BattleReport): void {
  const r = rows.get(b.battle) ?? { runs: 0, won: 0, turns: 0, lost: 0, reasons: new Map(), levels: new Map() };
  r.runs += 1;
  r.won += b.result === 'won' ? 1 : 0;
  if (b.result === 'lost') r.reasons.set(b.reason, (r.reasons.get(b.reason) ?? 0) + 1);
  r.turns += b.turns;
  r.lost += b.lost.length;
  for (const [unit, [from, to]] of Object.entries(b.levels)) {
    const l = r.levels.get(unit) ?? { from: 0, to: 0, n: 0 };
    l.from += from;
    l.to += to;
    l.n += 1;
    r.levels.set(unit, l);
  }
  rows.set(b.battle, r);
}
