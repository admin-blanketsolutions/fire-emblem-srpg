/** Logical game actions, independent of the device that produced them. */
export type Action = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'info' | 'danger' | 'menu' | 'pause';

export const DIRECTION_ACTIONS: readonly Action[] = ['up', 'down', 'left', 'right'];

/**
 * Turns "held" state into "triggered" actions. Every action triggers when first pressed;
 * directions then repeat after an initial delay, so a held arrow moves the cursor steadily.
 */
export class RepeatTracker {
  private readonly heldFor = new Map<Action, number>();
  private readonly nextAt = new Map<Action, number>();

  constructor(
    private readonly delayMs = 220,
    private readonly intervalMs = 70,
  ) {}

  /** Advance by `dtMs` with the currently held actions; returns the actions to fire this frame. */
  update(held: ReadonlySet<Action>, dtMs: number): Set<Action> {
    const fired = new Set<Action>();
    for (const action of [...this.heldFor.keys()]) {
      if (!held.has(action)) {
        this.heldFor.delete(action);
        this.nextAt.delete(action);
      }
    }
    for (const action of held) {
      const before = this.heldFor.get(action);
      if (before === undefined) {
        this.heldFor.set(action, 0);
        this.nextAt.set(action, this.delayMs);
        fired.add(action);
        continue;
      }
      const now = before + dtMs;
      this.heldFor.set(action, now);
      if (!DIRECTION_ACTIONS.includes(action)) continue;
      let due = this.nextAt.get(action) ?? this.delayMs;
      while (now >= due) {
        fired.add(action);
        due += this.intervalMs;
      }
      this.nextAt.set(action, due);
    }
    return fired;
  }
}
