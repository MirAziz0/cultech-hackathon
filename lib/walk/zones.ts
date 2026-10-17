/* Walkable zones: point-in-shape tests, floor heights (flat / ramp / helix) and level-aware lookup.
   Generalised from reference/walk.js: movement is allowed only inside zones; x and z are tested
   separately so the player slides along walls. Stacked floors work because a zone is accepted only
   if its floor is within MAX_STEP of the player's current floor. */
import type { FloorSpec, Frame, Vec2, Zone } from "../types";

export const MAX_STEP = 0.5;
const D2R = Math.PI / 180;

export interface CZone {
  id: string;
  test: (x: number, z: number) => boolean;
  floor: (x: number, z: number, near: number) => number;
  /** outline for the minimap (polygon or circle) */
  poly?: Vec2[];
  circle?: [number, number, number];
  ring?: [number, number, number, number];
  /** representative height for minimap level filtering */
  y: number;
}

export function inPoly(x: number, z: number, p: Vec2[]) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i], [xj, zj] = p[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

const rect = (x0: number, x1: number, z0: number, z1: number): Vec2[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
function ngon(cx: number, cz: number, r: number, n: number, rot = 0): Vec2[] {
  const p: Vec2[] = [];
  for (let k = 0; k < n; k++) {
    const a = (rot + 180 / n + (k * 360) / n) * D2R;
    p.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
  }
  return p;
}
/** octagon by apothem with faces centred at 0°,45°… (reference octP) */
const octP = (cx: number, cz: number, ap: number) => ngon(cx, cz, ap / Math.cos(22.5 * D2R), 8);

function applyFrame(p: Vec2[], f?: Frame): Vec2[] {
  if (!f) return p;
  const c = Math.cos(f.rot * D2R), s = Math.sin(f.rot * D2R);
  // local x → (cos, sin), local z → (-sin, cos) in world x/z (matches frameMatrix)
  return p.map(([x, z]) => [f.pos[0] + x * c - z * s, f.pos[1] + x * s + z * c]);
}

function floorFn(spec: FloorSpec | undefined, def: number): CZone["floor"] {
  if (spec === undefined) return () => def;
  if (typeof spec === "number") return () => spec;
  if ("ramp" in spec) {
    const { axis, from, to, y0, y1 } = spec.ramp;
    return (x, z) => {
      const t = ((axis === "x" ? x : z) - from) / (to - from);
      return y0 + (y1 - y0) * Math.max(0, Math.min(1, t));
    };
  }
  const { c, a0, y0, y1, risePerTurn, dir = 1 } = spec.helix;
  // a helix covers several turns at the same (x,z): pick the turn closest to the current floor
  return (x, z, near) => {
    let a = Math.atan2(z - c[1], x - c[0]) / D2R;
    a = ((((a - a0) * dir) % 360) + 360) % 360;
    const base = y0 + (a / 360) * risePerTurn;
    let best = base, bd = Infinity;
    for (let k = -1; k <= Math.ceil((y1 - y0) / risePerTurn) + 1; k++) {
      const y = base + k * risePerTurn;
      if (y < y0 - 0.01 || y > y1 + 0.01) continue;
      const d = Math.abs(y - near);
      if (d < bd) { bd = d; best = y; }
    }
    return Math.max(y0, Math.min(y1, best));
  };
}

export function compileZones(zones: Zone[], defaultFloor: number): CZone[] {
  return zones.map((z) => {
    const floor = floorFn(z.floor, defaultFloor);
    const y = typeof z.floor === "number" ? z.floor : z.floor === undefined ? defaultFloor : floor(0, 0, defaultFloor);
    if (z.circle) {
      const [cx, cz, r] = z.frame ? [...applyFrame([[z.circle[0], z.circle[1]]], z.frame)[0], z.circle[2]] : z.circle;
      return { id: z.id, floor, y, circle: [cx, cz, r] as [number, number, number], test: (x: number, zz: number) => Math.hypot(x - cx, zz - cz) < r };
    }
    if (z.ring) {
      const [cx, cz, r0, r1] = z.ring;
      return { id: z.id, floor, y, ring: z.ring, test: (x: number, zz: number) => { const d = Math.hypot(x - cx, zz - cz); return d > r0 && d < r1; } };
    }
    let poly: Vec2[] = [];
    if (z.rect) poly = rect(...z.rect);
    else if (z.oct) poly = octP(z.oct.c[0], z.oct.c[1], z.oct.a);
    else if (z.ngon) poly = ngon(z.ngon.c[0], z.ngon.c[1], z.ngon.r, z.ngon.n, z.ngon.rot ?? 0);
    else if (z.poly) poly = z.poly;
    poly = applyFrame(poly, z.frame);
    return { id: z.id, floor, y, poly, test: (x: number, zz: number) => inPoly(x, zz, poly) };
  });
}

export class ZoneMap {
  zones: CZone[];
  obstacles: [number, number, number][];
  constructor(zones: Zone[], defaultFloor: number, obstacles: [number, number, number][] = []) {
    this.zones = compileZones(zones, defaultFloor);
    this.obstacles = obstacles;
  }
  /** zone at (x,z) reachable from a floor at height `near` (null = blocked) */
  at(x: number, z: number, near: number): { zone: CZone; y: number } | null {
    for (const [ox, oz, r] of this.obstacles) if (Math.hypot(x - ox, z - oz) < r) return null;
    let best: { zone: CZone; y: number } | null = null, bd = Infinity;
    for (const zn of this.zones) {
      if (!zn.test(x, z)) continue;
      const y = zn.floor(x, z, near), d = Math.abs(y - near);
      if (d <= MAX_STEP && d < bd) { bd = d; best = { zone: zn, y }; }
    }
    return best;
  }
}
