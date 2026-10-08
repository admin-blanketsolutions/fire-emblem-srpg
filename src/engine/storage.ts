import { MemoryStore, type KeyValueStore } from '../core/save';

export interface OpenedStore {
  readonly store: KeyValueStore;
  /** False when saves only last as long as the page (private mode, storage blocked or full). */
  readonly persistent: boolean;
}

/**
 * The browser's `localStorage`, if it works; otherwise a store in memory, so the game goes on and
 * can say that saves will not outlast the page (DESIGN §3.9). Accessing `localStorage` itself can
 * throw (sandboxed frames, blocked cookies), so even the probe is guarded.
 */
export function openBrowserStore(): OpenedStore {
  try {
    const ls = window.localStorage;
    const probe = 's2b:probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return { store: ls === null ? new MemoryStore() : wrap(ls), persistent: true };
  } catch {
    return { store: new MemoryStore(), persistent: false };
  }
}

function wrap(ls: Storage): KeyValueStore {
  return {
    get: (key) => ls.getItem(key),
    set: (key, value) => ls.setItem(key, value),
    remove: (key) => ls.removeItem(key),
  };
}
