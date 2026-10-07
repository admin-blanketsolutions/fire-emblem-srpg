import type { PhaseSide } from './events';

/**
 * Temporary conditions on a unit. A status runs until the end of a named phase of a named turn,
 * so "until the end of the next phase" and "for this phase" are the same thing with different dates.
 */
export const STATUS_IDS = ['burn', 'thirst', 'heat', 'sunder', 'harry', 'counsel', 'decree', 'warcry'] as const;
export type StatusId = (typeof STATUS_IDS)[number];

export interface Status {
  readonly id: StatusId;
  /** The status ends once this phase of this turn is over. */
  readonly until: { readonly turn: number; readonly phase: PhaseSide };
  /** How many times it has stacked (only `sunder` stacks). */
  amount: number;
}

export const STATUS_NAMES: Readonly<Record<StatusId, string>> = {
  burn: 'Burning',
  thirst: 'Thirst',
  heat: 'Heat',
  sunder: 'Sundered',
  harry: 'Harried',
  counsel: 'Counselled',
  decree: 'Decreed',
  warcry: 'Rallied',
};

/** The most a single stacking status can pile up. */
export const MAX_STACKS: Readonly<Partial<Record<StatusId, number>>> = { sunder: 3 };

/** Whether a status has run its course once `phase` of `turn` has ended. */
export function hasExpired(status: Status, turn: number, phase: PhaseSide, order: readonly PhaseSide[]): boolean {
  if (status.until.turn !== turn) return status.until.turn < turn;
  return order.indexOf(status.until.phase) <= order.indexOf(phase);
}

/** Add a status, refreshing the end date if it is already there and stacking if it may. */
export function applyStatus(statuses: Status[], id: StatusId, until: Status['until']): void {
  const known = statuses.find((s) => s.id === id);
  if (!known) {
    statuses.push({ id, until, amount: 1 });
    return;
  }
  const max = MAX_STACKS[id] ?? 1;
  known.amount = Math.min(max, known.amount + 1);
  (known as { until: Status['until'] }).until = until;
}

export const hasStatus = (statuses: readonly Status[], id: StatusId): boolean => statuses.some((s) => s.id === id);
