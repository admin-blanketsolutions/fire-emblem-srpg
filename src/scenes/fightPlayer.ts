import type { FightReport } from '../core/battle';
import type { StrikeEvent } from '../core/combat';
import { manhattan } from '../core/grid';
import type { Point } from '../core/types';
import type { UnitInstance } from '../core/unit';

/**
 * Plays back a resolved fight as map animation: the striker lunges, the target flashes or
 * sidesteps, its HP bar drains, the fallen fade out. The fight has already happened in the core;
 * this only decides what is on screen at each moment, so it has no canvas and is easy to test.
 */

/** Time from the start of a strike to its impact. */
export const IMPACT_MS = 150;
/** One strike, start to finish. */
export const STRIKE_MS = 560;
export const DRAIN_MS = 300;
export const FLASH_MS = 260;
const RETURN_MS = 150;
export const FADE_MS = 600;
const TAIL_MS = 200;
const BLINK_MS = 60;

export interface FightFrame {
  /** Pixel offset of a unit from its tile (lunge or sidestep), by unit id. */
  readonly offsets: ReadonlyMap<string, Point>;
  /** The HP bar value to show, by unit id. */
  readonly hp: ReadonlyMap<string, number>;
  /** Units hidden this instant while they flash. */
  readonly blink: ReadonlySet<string>;
  /** Opacity of units that are fading out, by unit id. */
  readonly alpha: ReadonlyMap<string, number>;
}

export type FightCue =
  | { readonly kind: 'strike'; readonly event: StrikeEvent; readonly actor: UnitInstance; readonly target: UnitInstance }
  | { readonly kind: 'defeat'; readonly unit: UnitInstance };

interface Planned {
  readonly event: StrikeEvent;
  readonly actor: UnitInstance;
  readonly target: UnitInstance;
  readonly start: number;
  readonly hpBefore: number;
}

export class FightPlayer {
  private time = 0;
  private readonly planned: Planned[] = [];
  private readonly firedStrikes = new Set<number>();
  private readonly firedDefeats = new Set<string>();
  private readonly fadeStart = new Map<string, number>();
  readonly duration: number;

  constructor(readonly report: FightReport) {
    const hp = new Map<string, number>([
      [report.attacker.id, report.hpBefore.attacker],
      [report.defender.id, report.hpBefore.defender],
    ]);
    let last = 0;
    report.events.forEach((event, i) => {
      const actor = event.by === 'a' ? report.attacker : report.defender;
      const target = event.by === 'a' ? report.defender : report.attacker;
      const start = i * STRIKE_MS;
      this.planned.push({ event, actor, target, start, hpBefore: hp.get(target.id) ?? 0 });
      hp.set(target.id, event.targetHpAfter);
      if (event.killed) this.fadeStart.set(target.id, start + IMPACT_MS + DRAIN_MS);
      last = start + STRIKE_MS;
    });
    const fades = this.fadeStart.size > 0 ? FADE_MS : 0;
    this.duration = last + fades + TAIL_MS;
  }

  get done(): boolean {
    return this.time >= this.duration;
  }

  /** Advance the clock; returns the cues that came due (impacts and defeats), in order. */
  update(dtMs: number): FightCue[] {
    this.time += dtMs;
    const cues: FightCue[] = [];
    this.planned.forEach((p, i) => {
      if (!this.firedStrikes.has(i) && this.time >= p.start + IMPACT_MS) {
        this.firedStrikes.add(i);
        cues.push({ kind: 'strike', event: p.event, actor: p.actor, target: p.target });
      }
    });
    for (const [id, at] of this.fadeStart) {
      if (!this.firedDefeats.has(id) && this.time >= at) {
        this.firedDefeats.add(id);
        const unit = [this.report.attacker, this.report.defender].find((u) => u.id === id);
        if (unit) cues.push({ kind: 'defeat', unit });
      }
    }
    return cues;
  }

  frame(): FightFrame {
    const offsets = new Map<string, Point>();
    const hp = new Map<string, number>([
      [this.report.attacker.id, this.report.hpBefore.attacker],
      [this.report.defender.id, this.report.hpBefore.defender],
    ]);
    const blink = new Set<string>();
    const alpha = new Map<string, number>();

    for (const p of this.planned) {
      const t = this.time - p.start;
      if (t < 0) break;
      const struck = p.target.id;
      // the bar drains from the value before this strike to the value after it
      const drain = Math.max(0, Math.min(1, (t - IMPACT_MS) / DRAIN_MS));
      hp.set(struck, Math.round(p.hpBefore + (p.event.targetHpAfter - p.hpBefore) * drain));

      const toward = direction(p.actor, p.target);
      const reach = manhattan(p.actor, p.target) === 1 ? 7 : 3;
      if (t < IMPACT_MS) offsets.set(p.actor.id, scale(toward, (reach * t) / IMPACT_MS));
      else if (t < IMPACT_MS + RETURN_MS) offsets.set(p.actor.id, scale(toward, reach * (1 - (t - IMPACT_MS) / RETURN_MS)));

      if (t >= IMPACT_MS && t < IMPACT_MS + FLASH_MS) {
        if (p.event.hit) {
          if (Math.floor((t - IMPACT_MS) / BLINK_MS) % 2 === 1) blink.add(struck);
        } else {
          // a miss: the target sidesteps and returns
          const k = 1 - (t - IMPACT_MS) / FLASH_MS;
          offsets.set(struck, scale({ x: -toward.y || 1, y: toward.x }, 4 * k));
        }
      }
    }

    for (const [id, at] of this.fadeStart) {
      alpha.set(id, Math.max(0, Math.min(1, 1 - (this.time - at) / FADE_MS)));
    }
    return { offsets, hp, blink, alpha };
  }
}

/** The unit vector along the dominant axis from one unit to another. */
function direction(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
}

const scale = (p: Point, k: number): Point => ({ x: Math.round(p.x * k), y: Math.round(p.y * k) });
