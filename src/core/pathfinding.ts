import { DIRS4, keyX, keyY, tileKey } from './grid';
import type { GameMap } from './map';
import { areFriendly, type MoveType, type Point, type Side } from './types';

export interface PathRequest {
  readonly map: GameMap;
  readonly start: Point;
  readonly moveType: MoveType;
  /** Movement points. */
  readonly mov: number;
  /** The mover's side, which decides whom it may pass through. */
  readonly side: Side;
  /** The side of whoever stands on a tile (never the mover itself), or null if empty. */
  readonly occupantAt: (x: number, y: number) => Side | null;
}

export interface ReachNode {
  readonly x: number;
  readonly y: number;
  readonly cost: number;
  /** Key of the previous tile on the cheapest path, or null for the start. */
  readonly prev: number | null;
}

export interface ReachResult {
  readonly start: Point;
  /** Every tile the mover can pass through, with the cheapest cost to enter it. */
  readonly nodes: ReadonlyMap<number, ReachNode>;
  /** Tiles where the mover may end its move (reachable and unoccupied), including the start. */
  readonly stops: readonly Point[];
}

/** A small binary min-heap keyed on cost. */
class MinHeap {
  private readonly items: Array<{ cost: number; key: number }> = [];

  get size(): number {
    return this.items.length;
  }

  push(cost: number, key: number): void {
    this.items.push({ cost, key });
    this.siftUp(this.items.length - 1);
  }

  pop(): { cost: number; key: number } | undefined {
    const top = this.items[0];
    if (top === undefined) return undefined;
    const last = this.items.pop();
    if (last !== undefined && this.items.length > 0) {
      this.items[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private costAt(i: number): number {
    return this.items[i]?.cost ?? Number.POSITIVE_INFINITY;
  }

  private swap(i: number, j: number): void {
    const a = this.items[i];
    const b = this.items[j];
    if (!a || !b) return;
    this.items[i] = b;
    this.items[j] = a;
  }

  private siftUp(start: number): void {
    let i = start;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.costAt(parent) <= this.costAt(i)) return;
      this.swap(i, parent);
      i = parent;
    }
  }

  private siftDown(start: number): void {
    let i = start;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < this.items.length && this.costAt(left) < this.costAt(smallest)) smallest = left;
      if (right < this.items.length && this.costAt(right) < this.costAt(smallest)) smallest = right;
      if (smallest === i) return;
      this.swap(i, smallest);
      i = smallest;
    }
  }
}

/**
 * Dijkstra over terrain costs. A mover may pass through friendly units but never stop on an
 * occupied tile, and hostile (or neutral) units block it. There is no zone of control.
 */
export function computeReach(req: PathRequest): ReachResult {
  const { map, start, moveType, mov, side, occupantAt } = req;
  const startKey = tileKey(start.x, start.y);
  const best = new Map<number, ReachNode>();
  best.set(startKey, { x: start.x, y: start.y, cost: 0, prev: null });
  const heap = new MinHeap();
  heap.push(0, startKey);

  while (heap.size > 0) {
    const entry = heap.pop();
    if (!entry) break;
    const node = best.get(entry.key);
    if (!node || entry.cost > node.cost) continue; // stale heap entry
    for (const d of DIRS4) {
      const nx = node.x + d.x;
      const ny = node.y + d.y;
      if (!map.inBounds(nx, ny)) continue;
      const stepCost = map.costFor(nx, ny, moveType);
      if (stepCost === null) continue;
      const occupant = occupantAt(nx, ny);
      if (occupant !== null && !areFriendly(side, occupant)) continue;
      const total = node.cost + stepCost;
      if (total > mov) continue;
      const key = tileKey(nx, ny);
      const known = best.get(key);
      if (known && known.cost <= total) continue;
      best.set(key, { x: nx, y: ny, cost: total, prev: entry.key });
      heap.push(total, key);
    }
  }

  const stops: Point[] = [];
  for (const node of best.values()) {
    if (occupantAt(node.x, node.y) === null) stops.push({ x: node.x, y: node.y });
  }
  return { start, nodes: best, stops };
}

/** The cheapest path from the start to `dest`, inclusive of both, or null if unreachable. */
export function pathTo(result: ReachResult, dest: Point): Point[] | null {
  let key: number | null = tileKey(dest.x, dest.y);
  if (!result.nodes.has(key)) return null;
  const path: Point[] = [];
  while (key !== null) {
    const node = result.nodes.get(key);
    if (!node) return null;
    path.push({ x: keyX(key), y: keyY(key) });
    key = node.prev;
  }
  return path.reverse();
}
