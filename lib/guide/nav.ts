/* Navigation for the guide, built from the same walkable zones the visitor uses.
   A 0.2 m grid; each cell holds one node per distinct floor height (stacked storeys and the
   turns of a spiral stair share cells). Neighbours connect when their floors are within MAX_STEP,
   so the guide can only go where the visitor can: never through walls, up stairs naturally.
   A* with a clearance penalty keeps him off wall edges; paths are then string-pulled. */
import { MAX_STEP, type ZoneMap } from "../walk/zones";
import { blocked, type Blocker } from "./blockers";

export type P3 = { x: number; y: number; z: number };

const CELL = 0.2;
const MAX_CLEAR = 5; // cells

export class NavGrid {
  readonly x0: number; readonly z0: number; readonly nx: number; readonly nz: number;
  /** nodes of cell c are cellStart[c] .. cellStart[c+1]-1 */
  private cellStart: Int32Array;
  readonly nx_: Float32Array; readonly nz_: Float32Array; readonly ny: Float32Array;
  /** distance (m) to the nearest non-walkable spot on the same level */
  readonly clear: Float32Array;
  /** index into map.zones */
  readonly zoneOf: Int16Array;
  readonly count: number;

  constructor(private map: ZoneMap, blockers: Blocker[] = []) {
    // bounds of all zones
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const zn of map.zones) {
      const pts: [number, number][] = zn.poly ?? (zn.circle ? [[zn.circle[0] - zn.circle[2], zn.circle[1] - zn.circle[2]], [zn.circle[0] + zn.circle[2], zn.circle[1] + zn.circle[2]]]
        : zn.ring ? [[zn.ring[0] - zn.ring[3], zn.ring[1] - zn.ring[3]], [zn.ring[0] + zn.ring[3], zn.ring[1] + zn.ring[3]]] : []);
      for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    }
    this.x0 = x0 - CELL; this.z0 = z0 - CELL;
    this.nx = Math.ceil((x1 - x0) / CELL) + 3; this.nz = Math.ceil((z1 - z0) / CELL) + 3;
    const xs: number[] = [], zs: number[] = [], ys: number[] = [], zi: number[] = [];
    this.cellStart = new Int32Array(this.nx * this.nz + 1);
    const heights: { y: number; zi: number }[] = [];
    for (let j = 0; j < this.nz; j++)
      for (let i = 0; i < this.nx; i++) {
        const c = j * this.nx + i;
        this.cellStart[c] = xs.length;
        const x = this.x0 + (i + 0.5) * CELL, z = this.z0 + (j + 0.5) * CELL;
        if (map.obstacles.some(([ox, oz, r]) => Math.hypot(x - ox, z - oz) < r + 0.15)) continue;
        heights.length = 0;
        map.zones.forEach((zn, k) => {
          if (!zn.test(x, z)) return;
          const lo = zn.floor(x, z, -1e4), hi = zn.floor(x, z, 1e4);
          const push = (y: number) => { if (!heights.some((h) => Math.abs(h.y - y) < 0.12)) heights.push({ y, zi: k }); };
          if (Math.abs(hi - lo) < 0.01) push(lo);
          else for (let n = lo; n <= hi + 0.5; n += 0.75) push(zn.floor(x, z, n));
        });
        for (const h of heights) {
          // the visitor's own collision test must accept this spot at this height
          const hit = map.at(x, z, h.y);
          if (!hit || Math.abs(hit.y - h.y) > 0.05) continue;
          if (blockers.length && blocked(blockers, x, z, hit.y)) continue;
          xs.push(x); zs.push(z); ys.push(hit.y); zi.push(map.zones.indexOf(hit.zone));
        }
      }
    this.cellStart[this.nx * this.nz] = xs.length;
    this.count = xs.length;
    this.nx_ = Float32Array.from(xs); this.nz_ = Float32Array.from(zs); this.ny = Float32Array.from(ys); this.zoneOf = Int16Array.from(zi);
    // clearance: Chebyshev rings until a neighbour cell has no node near this height
    this.clear = new Float32Array(this.count);
    for (let n = 0; n < this.count; n++) {
      const i = Math.floor((xs[n] - this.x0) / CELL), j = Math.floor((zs[n] - this.z0) / CELL), y = ys[n];
      let r = 1;
      outer: for (; r <= MAX_CLEAR; r++)
        for (let dj = -r; dj <= r; dj++)
          for (let di = -r; di <= r; di++) {
            if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
            if (this.nodeAt(i + di, j + dj, y, MAX_STEP + r * 0.06) < 0) break outer;
          }
      this.clear[n] = (r - 0.5) * CELL;
    }
  }

  /** node in cell (i,j) whose floor is within tol of y (closest), or -1 */
  nodeAt(i: number, j: number, y: number, tol = MAX_STEP): number {
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    const c = j * this.nx + i;
    let best = -1, bd = tol;
    for (let n = this.cellStart[c]; n < this.cellStart[c + 1]; n++) {
      const d = Math.abs(this.ny[n] - y);
      if (d <= bd) { bd = d; best = n; }
    }
    return best;
  }

  cellOf(x: number, z: number): [number, number] {
    return [Math.floor((x - this.x0) / CELL), Math.floor((z - this.z0) / CELL)];
  }

  /** nearest node to a point (searching outward up to maxR metres), optionally with min clearance */
  nearest(p: P3, maxR = 1.5, minClear = 0, yTol = 1.2): number {
    const [ci, cj] = this.cellOf(p.x, p.z);
    const R = Math.ceil(maxR / CELL);
    let best = -1, bd = Infinity;
    for (let r = 0; r <= R; r++) {
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
          const c = j * this.nx + i;
          for (let n = this.cellStart[c]; n < this.cellStart[c + 1]; n++) {
            const dy = Math.abs(this.ny[n] - p.y);
            if (dy > yTol || this.clear[n] < minClear) continue;
            const d = Math.hypot(this.nx_[n] - p.x, this.nz_[n] - p.z) + dy * 2;
            if (d < bd) { bd = d; best = n; }
          }
        }
      if (best >= 0 && bd < (r + 1) * CELL) break;
    }
    return best;
  }

  pos(n: number): P3 { return { x: this.nx_[n], y: this.ny[n], z: this.nz_[n] }; }
  zoneId(n: number): string { return this.map.zones[this.zoneOf[n]]?.id ?? ""; }

  /** A* path between two points; returns smoothed world points (start excluded) or null */
  path(from: P3, to: P3, maxNodes = 60000): P3[] | null {
    const s = this.nearest(from, 1.2), g = this.nearest(to, 1.2);
    if (s < 0 || g < 0) return null;
    if (s === g) return [this.pos(g)];
    const gx = this.nx_[g], gy = this.ny[g], gz = this.nz_[g];
    const cost = new Map<number, number>([[s, 0]]);
    const prev = new Map<number, number>();
    const heap = new MinHeap();
    heap.push(s, 0);
    const closed = new Set<number>();
    let found = false, visited = 0;
    while (heap.size) {
      const n = heap.pop();
      if (n === g) { found = true; break; }
      if (closed.has(n)) continue;
      closed.add(n);
      if (++visited > maxNodes) break;
      const i = Math.floor((this.nx_[n] - this.x0) / CELL), j = Math.floor((this.nz_[n] - this.z0) / CELL), y = this.ny[n];
      const base = cost.get(n)!;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const m = this.nodeAt(i + di, j + dj, y);
          if (m < 0 || closed.has(m)) continue;
          // no corner cutting
          if (di && dj && (this.nodeAt(i + di, j, y) < 0 || this.nodeAt(i, j + dj, y) < 0)) continue;
          const cl = this.clear[m];
          const pen = cl < 0.3 ? 2.5 : cl < 0.5 ? 0.6 : 0;
          const step = (di && dj ? 1.4142 : 1) * CELL * (1 + pen) + Math.abs(this.ny[m] - y);
          const nc = base + step;
          if (nc < (cost.get(m) ?? Infinity)) {
            cost.set(m, nc);
            prev.set(m, n);
            heap.push(m, nc + Math.hypot(this.nx_[m] - gx, this.nz_[m] - gz) + Math.abs(this.ny[m] - gy));
          }
        }
    }
    if (!found) return null;
    const raw: number[] = [];
    for (let n = g; n !== s; n = prev.get(n)!) raw.push(n);
    raw.push(s);
    raw.reverse();
    // string-pull: from each anchor jump to the farthest node still in clear line of sight
    const out: P3[] = [];
    let a = 0;
    while (a < raw.length - 1) {
      let b = raw.length - 1;
      while (b > a + 1 && !this.clearLine(raw[a], raw[b])) b--;
      out.push(this.pos(raw[b]));
      a = b;
    }
    return out;
  }

  /** straight walk from node a to node b stays on connected floor with some clearance */
  clearLine(a: number, b: number): boolean {
    const ax = this.nx_[a], az = this.nz_[a], bx = this.nx_[b], bz = this.nz_[b];
    const len = Math.hypot(bx - ax, bz - az);
    if (len > 12) return false;
    const need = Math.min(0.3, this.clear[a], this.clear[b]) - 0.01;
    let y = this.ny[a];
    const steps = Math.ceil(len / (CELL * 0.5));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const [i, j] = this.cellOf(ax + (bx - ax) * t, az + (bz - az) * t);
      const n = this.nodeAt(i, j, y);
      if (n < 0 || this.clear[n] < need) return false;
      y = this.ny[n];
    }
    return Math.abs(y - this.ny[b]) < 0.3;
  }

  /** length of a polyline starting at p */
  static pathLength(p: P3, pts: P3[]) {
    let L = 0, q = p;
    for (const r of pts) { L += Math.hypot(r.x - q.x, r.z - q.z, r.y - q.y); q = r; }
    return L;
  }
}

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() { return this.ids.length; }
  push(id: number, k: number) {
    const a = this.ids, b = this.keys;
    let i = a.length;
    a.push(id); b.push(k);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (b[p] <= k) break;
      a[i] = a[p]; b[i] = b[p]; i = p;
    }
    a[i] = id; b[i] = k;
  }
  pop(): number {
    const a = this.ids, b = this.keys;
    const top = a[0];
    const id = a.pop()!, k = b.pop()!;
    if (a.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mk = k;
        if (l < a.length && b[l] < mk) { m = l; mk = b[l]; }
        if (r < a.length && b[r] < mk) { m = r; }
        if (m === i) break;
        a[i] = a[m]; b[i] = b[m]; i = m;
      }
      a[i] = id; b[i] = k;
    }
    return top;
  }
}
