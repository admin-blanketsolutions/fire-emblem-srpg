/** A tiny indexed-colour canvas the sprite kits draw on. Index 0 is transparent. */
export class Pix {
  readonly cells: number[];

  constructor(
    readonly width: number,
    readonly height: number,
    fill = 0,
  ) {
    this.cells = new Array<number>(width * height).fill(fill);
  }

  set(x: number, y: number, index: number): void {
    if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.cells[y * this.width + x] = index;
  }

  get(x: number, y: number): number {
    return x >= 0 && y >= 0 && x < this.width && y < this.height ? (this.cells[y * this.width + x] ?? 0) : 0;
  }

  fill(index: number): void {
    this.cells.fill(index);
  }

  rect(x: number, y: number, w: number, h: number, index: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, index);
  }

  hline(x: number, y: number, len: number, index: number): void {
    for (let i = 0; i < len; i++) this.set(x + i, y, index);
  }

  vline(x: number, y: number, len: number, index: number): void {
    for (let j = 0; j < len; j++) this.set(x, y + j, index);
  }

  line(x0: number, y0: number, x1: number, y1: number, index: number): void {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x, y, index);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, index: number): void {
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) this.set(cx + x, cy + y, index);
      }
    }
  }

  /** Surround every filled cell with `index` on the transparent cells that touch it (4-neighbourhood). */
  outline(index: number): void {
    const edge: number[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y) !== 0) continue;
        if (this.get(x + 1, y) !== 0 || this.get(x - 1, y) !== 0 || this.get(x, y + 1) !== 0 || this.get(x, y - 1) !== 0) {
          edge.push(y * this.width + x);
        }
      }
    }
    for (const i of edge) this.cells[i] = index;
  }

  /** Scatter `count` pixels of `index`, only over cells that currently hold one of `over`. */
  scatter(rand: () => number, index: number, count: number, over?: readonly number[]): void {
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 20; tries++) {
      const x = Math.floor(rand() * this.width);
      const y = Math.floor(rand() * this.height);
      if (over && !over.includes(this.get(x, y))) continue;
      this.set(x, y, index);
      placed++;
    }
  }

  /** One string of hex digits per row. */
  rows(): string[] {
    const out: string[] = [];
    for (let y = 0; y < this.height; y++) {
      let row = '';
      for (let x = 0; x < this.width; x++) row += (this.cells[y * this.width + x] ?? 0).toString(16);
      out.push(row);
    }
    return out;
  }
}
