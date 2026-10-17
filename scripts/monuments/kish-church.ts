/* Geometry generator for content/monuments/kish-church/manifest.json.
   Writes ONLY the geometry keys (exterior.parts + palette, walk.elements, walk.zones, walk.obstacles) and keeps
   every hand-written text in the manifest. Run after changing the layout:
     npx tsx scripts/monuments/kish-church.ts
   No measured plan has been published: every dimension is estimated from photos (Commons, 2008–2026) —
   see CONTENT_TODO.md. The church is oriented west (door) → east (apse).

   Build coordinates (exterior): x east, y north, z up, metres. Walk: x east, y up, z south (z = −y).
   Church: body x −6.0…4.4, y −4…4 (walls 1 m), eaves 6.6 m, ridge 8.6 m; apse centred on the east wall
   (r 2.9 m outside); drum r 1.85 m over the east bay (x 1.7), cone apex ≈ 14.8 m. */
import fs from "node:fs";
import path from "node:path";
import type { El, ExteriorPart, Manifest, Vec2, Vec3, Zone } from "../../lib/types";

const FILE = path.join(process.cwd(), "content", "monuments", "kish-church", "manifest.json");
const XII = "xii", TODAY = "today";

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/* ---------------- shared layout ---------------- */
const X0 = -6.0, X1 = 4.4, HW = 4.0, EAVE = 6.6, RIDGE = 8.6;
const DX = 1.7;                                  // drum / east-bay centre
const DRUM_R = 1.85, DRUM_Z0 = 9.0, DRUM_Z1 = 12.6, CONE_H = 2.7;
const APSE_C = X1, APSE_R = 2.9, APSE_IN = 2.0, APSE_H = 5.4;
const CROSS = { x0: -0.6, x1: 4.0, ridge: 7.7 };  // north/south cross gables over the east bay
const TER = { x0: -11, x1: 13, y: 10 };           // the raised terrace round the church (0.6 m above the yard)
const LOW = -0.6;
const ENC = { x0: -32, x1: 16, y: 14 };           // the enclosure
const PIT = { x0: -9.4, x1: -7.6, y0: 1.5, y1: 3.1 }; // grave under glass, north of the path to the door (build y)
const BUST: Vec2 = [-9.5, -6.5];

/** houses outside the enclosure: today white walls with red tile roofs, 12th c. river stone with flat earth roofs (hypothesis) */
function houses() {
  const r = rng(1117);
  const out: { x: number; y: number; w: number; d: number; h: number }[] = [];
  for (let gx = -6; gx <= 4; gx++)
    for (let gy = -4; gy <= 4; gy++) {
      const x = gx * 12 + (r() - 0.5) * 4, y = gy * 12 + (r() - 0.5) * 4;
      if (x > ENC.x0 - 9 && x < ENC.x1 + 9 && Math.abs(y) < ENC.y + 9) continue;
      if (Math.abs(y) < 4 && x < ENC.x0) continue; // the village lane to the gate
      if (Math.hypot(x + 8, y) > 62 || r() < 0.25) continue;
      out.push({ x, y, w: 6 + r() * 3, d: 5 + r() * 3, h: 3.2 + r() * 2.2 });
    }
  return out;
}

/* ---------------- exterior maquette ---------------- */
function exterior(): ExteriorPart[] {
  const P: ExteriorPart[] = [];
  const r = rng(5);
  const cx = (ENC.x0 + ENC.x1) / 2;
  // base, lower yard, raised terrace with steps
  P.push({ t: "box", size: [104, 84, 1.6], at: [cx, 0, LOW - 1.6], mat: "base" });
  P.push({ t: "box", size: [104, 84, 0.1], at: [cx, 0, LOW - 0.1], mat: "grass" });
  P.push({ t: "box", size: [ENC.x1 - ENC.x0, ENC.y * 2, 0.06], at: [cx, 0, LOW - 0.04], matByEra: { xii: "earth", today: "paving" } });
  P.push({ t: "box", size: [TER.x1 - TER.x0, TER.y * 2, -LOW], at: [(TER.x0 + TER.x1) / 2, 0, LOW], matByEra: { xii: "earth", today: "paving" } });
  for (let k = 0; k < 4; k++) P.push({ t: "box", size: [0.45 * (4 - k), 8, 0.15 * (k + 1)], at: [TER.x0 - 0.45 * (4 - k) / 2, 0, LOW], matByEra: { xii: "earth", today: "paving" } });
  // flower beds and lawns on the terrace (today)
  for (const s of [-1, 1]) P.push({ t: "box", size: [18, 3.2, 0.12], at: [0, s * 7.6, 0], eras: [TODAY], mat: "lawn" });
  P.push({ t: "box", size: [4, 12, 0.12], at: [10.5, 0, 0], eras: [TODAY], mat: "lawn" });

  // --- the church ---
  const wall = { mat: "wall" };
  P.push({ t: "box", size: [X1 - X0, HW * 2, EAVE], at: [(X0 + X1) / 2, 0, 0], ...wall });
  P.push({ t: "box", size: [X1 - X0 + 0.3, HW * 2 + 0.3, 0.22], at: [(X0 + X1) / 2, 0, EAVE - 0.22], mat: "cornice" });
  P.push({ t: "gableRoof", at: [(X0 + X1) / 2, 0, EAVE], size: [X1 - X0 + 0.3, HW * 2 + 0.3], h: RIDGE - EAVE, axis: "x", mat: "roof", gableMat: "wall" });
  P.push({ t: "gableRoof", at: [DX + (CROSS.x0 + CROSS.x1) / 2 - DX, 0, EAVE], size: [CROSS.x1 - CROSS.x0, HW * 2 + 0.3], h: CROSS.ridge - EAVE, axis: "y", mat: "roof", gableMat: "wall" });
  // apse: half cylinder and half cone
  P.push({ t: "cyl", r: APSE_R, h: APSE_H, at: [APSE_C, 0, 0], arc: [-90, 180], sides: 28, mat: "wall" });
  P.push({ t: "cyl", r: APSE_R + 0.12, h: 0.2, at: [APSE_C, 0, APSE_H - 0.2], arc: [-90, 180], sides: 28, mat: "cornice" });
  P.push({ t: "tent", r: APSE_R + 0.2, h: 1.7, at: [APSE_C, 0, APSE_H], arc: [-90, 180], sides: 28, mat: "roof" });
  // drum on a square base, two bands, cornice, tiled cone
  P.push({ t: "box", size: [4.0, 4.0, DRUM_Z0 - 7.0], at: [DX, 0, 7.0], ...wall });
  P.push({ t: "cyl", r: DRUM_R, h: DRUM_Z1 - DRUM_Z0, at: [DX, 0, DRUM_Z0], sides: 32, mat: "wall" });
  P.push({ t: "cyl", r: DRUM_R + 0.08, h: 0.16, at: [DX, 0, DRUM_Z0 + 0.1], sides: 32, mat: "cornice" });
  P.push({ t: "cyl", r: DRUM_R + 0.2, h: 0.3, at: [DX, 0, DRUM_Z1 - 0.15], sides: 32, mat: "cornice" });
  P.push({ t: "tent", r: DRUM_R + 0.32, h: CONE_H, at: [DX, 0, DRUM_Z1 + 0.15], sides: 32, mat: "roof" });
  // drum windows (six narrow slits) — positions from the south and west photos
  for (let k = 0; k < 6; k++) {
    const a = k * 60, ar = (a * Math.PI) / 180;
    P.push({ t: "niche", w: 0.3, spring: 0.9, at: [DX + Math.cos(ar) * (DRUM_R - 0.02), Math.sin(ar) * (DRUM_R - 0.02), 10.4], facing: a, depth: 0.06, round: true, mat: "window" });
  }
  // west front: double-arched door, narrow window
  P.push({ t: "niche", w: 1.7, spring: 1.75, at: [X0 - 0.01, 0, 0], facing: 180, depth: 0.06, round: true, mat: "trim" });
  P.push({ t: "niche", w: 1.1, spring: 1.6, at: [X0 - 0.03, 0, 0], facing: 180, depth: 0.08, round: true, mat: "door" });
  P.push({ t: "niche", w: 0.34, spring: 0.75, at: [X0 - 0.01, 0, 4.3], facing: 180, depth: 0.06, round: true, mat: "window" });
  // south: a window in each bay (the western one walled up), north: two windows; apse window
  P.push({ t: "niche", w: 0.45, spring: 0.95, at: [-2.8, -HW - 0.01, 2.8], facing: -90, depth: 0.05, round: true, mat: "blocked" });
  P.push({ t: "niche", w: 0.5, spring: 1.1, at: [DX, -HW - 0.01, 3.0], facing: -90, depth: 0.06, round: true, mat: "window" });
  for (const x of [-2.8, DX]) P.push({ t: "niche", w: 0.45, spring: 1.0, at: [x, HW + 0.01, 3.0], facing: 90, depth: 0.06, round: true, mat: "window" });
  P.push({ t: "niche", w: 0.4, spring: 1.0, at: [APSE_C + APSE_R - 0.02, 0, 2.6], facing: 0, depth: 0.06, round: true, mat: "window" });
  // pilaster strips framing the cross gables
  for (const s of [-1, 1]) for (const x of [CROSS.x0 + 0.15, CROSS.x1 - 0.15]) P.push({ t: "box", size: [0.3, 0.08, EAVE - 0.3], at: [x, s * (HW + 0.03), 0], mat: "trim" });

  // --- yard: enclosure wall with the gate, steps, trees ---
  const gate = 2.2;
  for (const [x0, y0, x1, y1] of [[ENC.x0, gate, ENC.x0, ENC.y], [ENC.x0, ENC.y, ENC.x1, ENC.y], [ENC.x1, ENC.y, ENC.x1, -ENC.y], [ENC.x1, -ENC.y, ENC.x0, -ENC.y], [ENC.x0, -ENC.y, ENC.x0, -gate]])
    P.push({ t: "box", size: [Math.abs(x1 - x0) + 0.5, Math.abs(y1 - y0) + 0.5, 2.2], at: [(x0 + x1) / 2, (y0 + y1) / 2, LOW], mat: "fence" });
  // today: stone gate with an arched wooden door and a tiled roof; stalls with tile roofs along the north wall
  P.push({ t: "box", size: [1.6, 6.0, 4.0], at: [ENC.x0, 0, LOW], eras: [TODAY], mat: "fence" });
  P.push({ t: "niche", w: 2.4, spring: 1.8, at: [ENC.x0 - 0.82, 0, LOW], facing: 180, depth: 0.08, round: true, eras: [TODAY], mat: "door" });
  P.push({ t: "gableRoof", at: [ENC.x0, 0, LOW + 4.0], size: [2.2, 6.6], h: 1.1, axis: "y", eras: [TODAY], mat: "roofHouse", gableMat: "fence" });
  for (const [x, w] of [[-28, 5], [-21.5, 6], [-15.5, 4]] as const) {
    P.push({ t: "box", size: [w, 3.2, 2.6], at: [x, ENC.y - 2.0, LOW], eras: [TODAY], mat: "stall" });
    P.push({ t: "gableRoof", at: [x, ENC.y - 2.0, LOW + 2.6], size: [w + 0.6, 3.8], h: 1.0, axis: "x", eras: [TODAY], mat: "roofHouse", gableMat: "stall" });
  }
  // the grave under glass and Heyerdahl's bust (today)
  P.push({ t: "box", size: [PIT.x1 - PIT.x0 + 0.2, PIT.y1 - PIT.y0 + 0.2, 0.1], at: [(PIT.x0 + PIT.x1) / 2, (PIT.y0 + PIT.y1) / 2, 0], eras: [TODAY], mat: "glass" });
  P.push({ t: "box", size: [0.6, 0.6, 1.3], at: [...BUST, 0], eras: [TODAY], mat: "stone" });
  P.push({ t: "box", size: [0.5, 0.35, 0.65], at: [...BUST, 1.3], eras: [TODAY], mat: "bronze" });
  // trees: cypresses and fruit trees round the church (today, from photos); walnuts in the 12th c. (hypothesis)
  for (const [x, y] of [[-10, 8.5], [-10, -8.5], [12, 8.5], [12, -8.5], [6, 9], [-4, -9]] as const) P.push({ t: "tree", at: [x, y, 0], s: 1.2, kind: "cypress", eras: [TODAY] });
  for (const [x, y] of [[-20, 9], [-24, -9], [9, -11.5], [-2, 11.8], [14, 0]] as const) P.push({ t: "tree", at: [x, y, x < TER.x0 || Math.abs(y) > TER.y ? LOW : 0], s: 1.3, kind: "round" });
  for (const [x, y] of [[-16, -5], [10, 11.5], [-6, -12]] as const) P.push({ t: "tree", at: [x, y, LOW], s: 1.6, kind: "round", eras: [XII] });
  for (let i = 0; i < 26; i++) {
    const x = TER.x0 + 1 + r() * (TER.x1 - TER.x0 - 2), y = (r() < 0.5 ? -1 : 1) * (6.4 + r() * 2.6);
    P.push({ t: "bush", at: [x, y, 0.1], s: 0.3 + r() * 0.2, eras: [TODAY], mat: "rose" });
  }
  // --- village beyond the wall ---
  for (const h of houses()) {
    P.push({ t: "box", size: [h.w, h.d, h.h], at: [h.x, h.y, LOW], matByEra: { xii: "riverStone", today: "house" } });
    P.push({ t: "hipRoof", at: [h.x, h.y, LOW + h.h], size: [h.w + 0.6, h.d + 0.6], h: 1.5, eras: [TODAY], mat: "roofHouse" });
    P.push({ t: "box", size: [h.w + 0.3, h.d + 0.3, 0.25], at: [h.x, h.y, LOW + h.h], eras: [XII], mat: "earth" });
    if (r() < 0.5) P.push({ t: "tree", at: [h.x + h.w / 2 + 2, h.y + (r() - 0.5) * 4, LOW], s: 1.2 + r() * 0.5, kind: "round" });
  }
  return P;
}

const PALETTE: Record<string, [number, number, number]> = {
  base: [80, 66, 46], grass: [78, 118, 46], earth: [150, 128, 90], paving: [150, 146, 136], lawn: [70, 122, 44],
  wall: [176, 156, 122], cornice: [192, 176, 146], trim: [198, 184, 156], roof: [158, 44, 14], roofHouse: [150, 52, 26],
  window: [40, 32, 26], door: [100, 62, 30], blocked: [160, 142, 112], fence: [128, 124, 114], stall: [206, 196, 176],
  glass: [150, 186, 200], stone: [130, 126, 120], bronze: [84, 62, 34], rose: [168, 30, 52], tree: [66, 106, 40], trunk: [96, 68, 44],
  house: [214, 206, 190], riverStone: [122, 118, 108],
};

/* ---------------- walk mode ---------------- */
type Op = { u: number; w: number; sill: number; spring: number; kind: "door" | "window" | "niche"; fill?: "glass" | "open"; back?: number; round?: boolean };
const win = (u: number, sill: number, w = 0.45, spring = 1.0): Op => ({ u, w, sill, spring, kind: "window", fill: "glass", round: true });
const door = (u: number, w: number, spring: number, sill = 0): Op => ({ u, w, sill, spring, kind: "door", round: true });

/** wall core in `mat` plus a 4 cm skin in `skinMat` on one side (+1 = the left of the a→b direction) */
function wall2(E: El[], a: Vec2, b: Vec2, th: number, h: number, ops: Op[], mat: string, skinMat?: string, side: 1 | -1 = 1, y0 = 0, eras?: string[]) {
  E.push({ t: "wall", from: a, to: b, y0, h, th, ops, mat, ...(eras ? { eras } : {}) });
  if (!skinMat) return;
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), nx = (-dz / L) * side, nz = (dx / L) * side, o = th / 2 + 0.02;
  E.push({ t: "wall", from: [a[0] + nx * o, a[1] + nz * o], to: [b[0] + nx * o, b[1] + nz * o], y0, h, th: 0.04, ops, mat: skinMat, ...(eras ? { eras } : {}) });
}
const tri = (a: Vec3, b: Vec3, c: Vec3, mat: string, eras?: string[]): El => ({ t: "quad", pts: [a, b, c, c], mat, ...(eras ? { eras } : {}) });

/** cone (or half cone) of triangles: apex above (cx, cz) */
function cone(E: El[], cx: number, cz: number, r: number, y: number, h: number, mat: string, a0 = 0, a1 = 360, n = 32) {
  for (let k = 0; k < n; k++) {
    const p = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180, q = ((a0 + ((a1 - a0) * (k + 1)) / n) * Math.PI) / 180;
    E.push(tri([cx + Math.cos(p) * r, y, cz + Math.sin(p) * r], [cx + Math.cos(q) * r, y, cz + Math.sin(q) * r], [cx, y + h, cz], mat));
  }
}

/** a simple house: box walls and a gable roof (quads) */
function house(E: El[], x: number, z: number, w: number, d: number, h: number, y0: number, wallMat: string, roofMat: string | null, eras: string[]) {
  E.push({ t: "box", min: [x - w / 2, y0, z - d / 2], max: [x + w / 2, y0 + h, z + d / 2], mat: wallMat, eras });
  if (!roofMat) { E.push({ t: "box", min: [x - w / 2 - 0.15, y0 + h, z - d / 2 - 0.15], max: [x + w / 2 + 0.15, y0 + h + 0.25, z + d / 2 + 0.15], mat: "c:#8a7556", eras }); return; }
  const rh = Math.min(w, d) * 0.3, along = w >= d, Y = y0 + h, o = 0.3;
  if (along) {
    E.push({ t: "quad", pts: [[x - w / 2 - o, Y, z - d / 2 - o], [x + w / 2 + o, Y, z - d / 2 - o], [x + w / 2 + o, Y + rh, z], [x - w / 2 - o, Y + rh, z]], mat: roofMat, eras });
    E.push({ t: "quad", pts: [[x + w / 2 + o, Y, z + d / 2 + o], [x - w / 2 - o, Y, z + d / 2 + o], [x - w / 2 - o, Y + rh, z], [x + w / 2 + o, Y + rh, z]], mat: roofMat, eras });
    for (const s of [-1, 1]) E.push(tri([x + s * w / 2, Y, z - d / 2], [x + s * w / 2, Y, z + d / 2], [x + s * w / 2, Y + rh, z], wallMat + "DS", eras));
  } else {
    E.push({ t: "quad", pts: [[x - w / 2 - o, Y, z + d / 2 + o], [x - w / 2 - o, Y, z - d / 2 - o], [x, Y + rh, z - d / 2 - o], [x, Y + rh, z + d / 2 + o]], mat: roofMat, eras });
    E.push({ t: "quad", pts: [[x + w / 2 + o, Y, z - d / 2 - o], [x + w / 2 + o, Y, z + d / 2 + o], [x, Y + rh, z + d / 2 + o], [x, Y + rh, z - d / 2 - o]], mat: roofMat, eras });
    for (const s of [-1, 1]) E.push(tri([x - w / 2, Y, z + s * d / 2], [x + w / 2, Y, z + s * d / 2], [x, Y + rh, z + s * d / 2], wallMat + "DS", eras));
  }
}

function walk(): { elements: El[]; zones: Zone[]; obstacles: [number, number, number][] } {
  const E: El[] = [];
  const r = rng(2003);
  const T = 1.0, IN_Z = HW - T; // interior half width (3.0)
  const wOut = "wallOut", wIn = "wallIn";

  // ---- ground: grassland outside, lower yard, raised terrace (floor rects leave the church and the grave pit open) ----
  E.push({ t: "terrain", rect: [-220, 220, -220, 220], y: LOW - 0.04, mat: "grass" });
  E.push({ t: "floor", rect: [ENC.x0, ENC.x1, -ENC.y, ENC.y], y: LOW, mat: "yardFloor" });
  const pz0 = -PIT.y1, pz1 = -PIT.y0; // walk z of the pit
  for (const rect of [
    [TER.x0, TER.x1, -TER.y, -HW], [TER.x0, TER.x1, HW, TER.y], [X1, TER.x1, -HW, HW],
    [TER.x0, X0, -HW, pz0], [TER.x0, X0, pz1, HW], [TER.x0, PIT.x0, pz0, pz1], [PIT.x1, X0, pz0, pz1],
  ] as [number, number, number, number][]) E.push({ t: "floor", rect, y: 0, mat: "terrace" });
  E.push({ t: "floor", rect: [PIT.x0, PIT.x1, pz0, pz1], y: 0, mat: "terrace", eras: [XII] }); // no pit in the 12th c.
  E.push({ t: "furniture", kind: "gravePit", at: [(PIT.x0 + PIT.x1) / 2, 0, (pz0 + pz1) / 2], size: [PIT.x1 - PIT.x0, pz1 - pz0], depth: 0.75, eras: [TODAY] });
  // terrace retaining walls and the steps up from the yard
  for (const [min, max] of [
    [[TER.x0 - 0.3, LOW, -TER.y - 0.3], [TER.x1 + 0.3, 0.02, -TER.y]], [[TER.x0 - 0.3, LOW, TER.y], [TER.x1 + 0.3, 0.02, TER.y + 0.3]],
    [[TER.x1, LOW, -TER.y], [TER.x1 + 0.3, 0.02, TER.y]],
    [[TER.x0 - 0.3, LOW, -TER.y], [TER.x0, 0.02, -4.02]], [[TER.x0 - 0.3, LOW, 4.02], [TER.x0, 0.02, TER.y]],
  ] as [Vec3, Vec3][]) E.push({ t: "box", min, max, mat: "fence" });
  E.push({ t: "stair", from: [TER.x0 - 1.8, 0], dir: [1, 0], width: 8, steps: 4, rise: 0.15, run: 0.45, y0: LOW, mat: "terrace" });

  // ---- the church: outer walls (stone core, paler skin inside) ----
  // west wall with the door and a narrow window; a second, wider arch on the outside makes the double-arched frame
  wall2(E, [X0 + T / 2, -HW], [X0 + T / 2, HW], T, EAVE, [door(HW, 1.1, 1.6), win(HW, 4.3, 0.34, 0.75)], wOut, wIn, -1);
  E.push({ t: "wall", from: [X0 - 0.04, -1.2], to: [X0 - 0.04, 1.2], y0: 0, h: 3.0, th: 0.1, ops: [door(1.2, 1.7, 1.75)], mat: wOut });
  // south (+z) and north (−z) walls; the western south window is walled up (a shallow niche)
  const winX = [-2.8, DX];
  wall2(E, [X0, HW - T / 2], [X1, HW - T / 2], T, EAVE, [{ u: winX[0] - X0, w: 0.45, sill: 2.8, spring: 0.95, kind: "niche", back: -1, round: true }, win(winX[1] - X0, 3.0, 0.5, 1.1)], wOut, wIn, -1);
  wall2(E, [X1, -HW + T / 2], [X0, -HW + T / 2], T, EAVE, winX.map((x) => win(X1 - x, 3.0)), wOut, wIn, -1);
  // east wall: the arch into the apse
  wall2(E, [X1 - T / 2, HW], [X1 - T / 2, -HW], T, EAVE, [door(HW, APSE_IN * 2, 3.4)], wOut, wIn, -1);
  // gable triangles (outside stone, inside pale) and the cross gables on the long walls
  for (const x of [X0, X1]) {
    E.push(tri([x, EAVE, -HW], [x, EAVE, HW], [x, RIDGE, 0], wOut + "DS"));
    E.push(tri([x + (x < 0 ? T : -T), EAVE, -HW + T], [x + (x < 0 ? T : -T), EAVE, HW - T], [x + (x < 0 ? T : -T), RIDGE - 0.5, 0], wIn));
  }
  for (const z of [-HW, HW]) E.push(tri([CROSS.x0, EAVE, z], [CROSS.x1, EAVE, z], [DX, CROSS.ridge, z], wOut + "DS"));
  // cornice along the eaves and over the gable edges
  E.push({ t: "box", min: [X0 - 0.15, EAVE - 0.22, -HW - 0.15], max: [X1 + 0.15, EAVE + 0.06, -HW + 0.2], mat: wOut });
  E.push({ t: "box", min: [X0 - 0.15, EAVE - 0.22, HW - 0.2], max: [X1 + 0.15, EAVE + 0.06, HW + 0.15], mat: wOut });
  // pilaster strips framing the cross gables
  for (const z of [-HW - 0.05, HW + 0.05]) for (const x of [CROSS.x0 + 0.15, CROSS.x1 - 0.15]) E.push({ t: "box", min: [x - 0.15, 0, z - 0.05], max: [x + 0.15, EAVE - 0.2, z + 0.05], mat: wOut });

  // ---- roofs: main gable (E–W ridge), cross gable over the east bay (N–S ridge), tiles ----
  // the drum stands in a square hole [DX ± 2] × [±2] left in the roofs (its base walls close the gap)
  const o = 0.3, rz = HW + o, ry0 = EAVE - (o * (RIDGE - EAVE)) / HW;
  const yAt = (z: number) => RIDGE - ((RIDGE - EAVE) * Math.abs(z)) / HW;
  for (const s of [-1, 1]) {
    const q = (xa: number, xb: number, za: number, zb: number) => E.push({ t: "quad", pts: [[xa, za === s * rz ? ry0 : yAt(za), za], [xb, za === s * rz ? ry0 : yAt(za), za], [xb, yAt(zb), zb], [xa, yAt(zb), zb]], mat: "roof" });
    q(X0 - o, DX - 2, s * rz, 0);
    q(DX + 2, X1 + o, s * rz, 0);
    q(DX - 2, DX + 2, s * rz, s * 2);
  }
  // cross gable slopes, only outside the drum square (inside it the main roof is higher anyway)
  for (const [za, zb] of [[-rz, -2], [2, rz]]) {
    E.push({ t: "quad", pts: [[CROSS.x0 - 0.2, EAVE - 0.08, za], [CROSS.x0 - 0.2, EAVE - 0.08, zb], [DX, CROSS.ridge, zb], [DX, CROSS.ridge, za]], mat: "roof" });
    E.push({ t: "quad", pts: [[CROSS.x1 + 0.2, EAVE - 0.08, za], [CROSS.x1 + 0.2, EAVE - 0.08, zb], [DX, CROSS.ridge, zb], [DX, CROSS.ridge, za]], mat: "roof" });
  }

  // ---- inside: the west bay (barrel vault) and the transverse arch on pilasters ----
  E.push({ t: "floor", rect: [X0 + T, X1 - T, -IN_Z, IN_Z], y: 0, mat: "hallFloor" });
  E.push({ t: "floor", rect: [X0, X0 + T, -0.55, 0.55], y: 0, mat: "hallFloor" });
  E.push({ t: "vault", x: [X0 + T, -0.3], z: [-IN_Z, IN_Z], y: 4.6, axis: "x", scaleY: 0.85, mat: "vault" });
  E.push({ t: "wall", from: [0, -IN_Z], to: [0, IN_Z], y0: 0, h: 7.0, th: 0.6, ops: [door(IN_Z, 3.9, 4.25)], mat: wIn });
  // east bay: crossing square on four arches, pendentives, the drum and its cap
  const SX: Vec2 = [0.3, X1 - T], SZ = 1.5, SPRING = 5.65;
  for (const s of [-1, 1]) {
    // (the wall stands just outside the pendentives, so it never pierces them)
    E.push({ t: "wall", from: [SX[0], s * (SZ + 0.25)], to: [SX[1], s * (SZ + 0.25)], y0: 0, h: 7.3, th: 0.5, ops: [door((SX[1] - SX[0]) / 2, 2.9, 4.2)], mat: wIn });
    // the side arms of the cross: low barrel vaults to the outer walls
    E.push({ t: "vault", x: SX, z: s < 0 ? [-IN_Z, -SZ - 0.5] : [SZ + 0.5, IN_Z], y: 4.2, axis: "z", scaleY: 1, mat: "vault" });
  }
  E.push({ t: "box", min: [-0.3, 7.0, -SZ], max: [0.3, 7.4, SZ], mat: wIn });
  E.push({ t: "sailVault", x: SX, z: [-SZ, SZ], y: SPRING, rise: 1, hole: 1.3, mat: "vault" });
  const ringY = SPRING + Math.sqrt((((SX[1] - SX[0]) / 2) ** 2 + SZ ** 2) - 1.3 ** 2);
  E.push({ t: "cylWall", c: [DX, 0], r: 1.3, y0: ringY - 0.05, h: DRUM_Z0 - 0.4 - (ringY - 0.05), th: DRUM_R - 1.3, mat: wOut });
  E.push({ t: "cylWall", c: [DX, 0], r: 1.28, y0: ringY - 0.05, h: 11.4 - ringY, mat: "vault" });
  E.push({ t: "dome", c: [DX, 0], r: 1.3, y: 11.35, sy: 0.65, mat: "vault" });
  // drum windows: light slits inside, dark slits outside (six, as on the photos)
  for (let k = 0; k < 6; k++) {
    const a = k * 60 * (Math.PI / 180), dx = Math.cos(a), dz = -Math.sin(a), rot = (Math.atan2(dx, dz) * 180) / Math.PI;
    E.push({ t: "plane", at: [DX + dx * 1.26, 9.9, dz * 1.26], size: [0.24, 1.0], rotY: rot, mat: "daylight" });
    E.push({ t: "plane", at: [DX + dx * (DRUM_R + 0.02), 10.95, dz * (DRUM_R + 0.02)], size: [0.28, 1.0], rotY: rot, mat: "c:#2b241dDS" });
  }
  // drum outside: square base on the roofs (its foot stays above the pendentives), bands, cornice, tiled cone
  for (const [min, max] of [[[DX - 2, 7.45, -2], [DX + 2, DRUM_Z0, -1.35]], [[DX - 2, 7.45, 1.35], [DX + 2, DRUM_Z0, 2]], [[DX - 2, 7.45, -1.35], [DX - 1.35, DRUM_Z0, 1.35]], [[DX + 1.35, 7.45, -1.35], [DX + 2, DRUM_Z0, 1.35]]] as [Vec3, Vec3][])
    E.push({ t: "box", min, max, mat: wOut });
  E.push({ t: "cylWall", c: [DX, 0], r: 1.3, y0: DRUM_Z0 - 0.4, h: DRUM_Z1 - DRUM_Z0 + 0.4, th: DRUM_R - 1.3, sides: 40, mat: wOut });
  E.push({ t: "cylWall", c: [DX, 0], r: DRUM_R - 0.05, y0: DRUM_Z0 + 0.1, h: 0.16, th: 0.13, sides: 40, mat: wOut });
  E.push({ t: "cylWall", c: [DX, 0], r: DRUM_R - 0.05, y0: DRUM_Z1 - 0.15, h: 0.3, th: 0.25, sides: 40, mat: wOut });
  E.push({ t: "disc", c: [DX, 0], r: DRUM_R + 0.2, y: DRUM_Z1 + 0.15, mat: wOut + "DS", sides: 40 });
  cone(E, DX, 0, DRUM_R + 0.32, DRUM_Z1 + 0.15, CONE_H, "roof", 0, 360, 40);
  // small tiled skirt round the drum base
  for (const [a, b, c, d] of [[[DX - 2.15, 8.6, -2.15], [DX + 2.15, 8.6, -2.15], [DX + 2, 9.0, -2], [DX - 2, 9.0, -2]], [[DX + 2.15, 8.6, 2.15], [DX - 2.15, 8.6, 2.15], [DX - 2, 9.0, 2], [DX + 2, 9.0, 2]], [[DX - 2.15, 8.6, 2.15], [DX - 2.15, 8.6, -2.15], [DX - 2, 9.0, -2], [DX - 2, 9.0, 2]], [[DX + 2.15, 8.6, -2.15], [DX + 2.15, 8.6, 2.15], [DX + 2, 9.0, 2], [DX + 2, 9.0, -2]]] as [Vec3, Vec3, Vec3, Vec3][])
    E.push({ t: "quad", pts: [a, b, c, d], mat: "roof" });

  // ---- apse: half-ring wall, semi-dome, half-cone roof, east window ----
  E.push({ t: "cylWall", c: [APSE_C, 0], r: APSE_IN, y0: 0, h: APSE_H, th: APSE_R - APSE_IN, arc: [0, 180], sides: 28, mat: wOut });
  E.push({ t: "cylWall", c: [APSE_C, 0], r: APSE_IN - 0.02, y0: 0, h: 3.4, arc: [0, 180], sides: 28, mat: wIn });
  E.push({ t: "dome", c: [APSE_C, 0], r: APSE_IN - 0.02, y: 3.4, sy: 1, arc: [-90, 180], mat: "vault" });
  E.push({ t: "cylWall", c: [APSE_C, 0], r: APSE_R - 0.05, y0: APSE_H - 0.2, h: 0.22, th: 0.2, arc: [0, 180], sides: 28, mat: wOut });
  cone(E, APSE_C, 0, APSE_R + 0.22, APSE_H, 1.75, "roof", -90, 90, 20);
  E.push({ t: "plane", at: [APSE_C + APSE_IN - 0.05, 2.9, 0], size: [0.32, 0.95], rotY: -90, mat: "daylight" });
  E.push({ t: "plane", at: [APSE_C + APSE_R + 0.02, 2.9, 0], size: [0.38, 1.0], rotY: 90, mat: "c:#2b241dDS" });

  // ---- chancel: the floor raised 30–40 cm at first (12th c.), about 1 m later (today) ----
  for (const [h, eras, steps, run] of [[0.35, [XII], 2, 0.3], [1.0, [TODAY], 5, 0.25]] as [number, string[], number, number][]) {
    E.push({ t: "box", min: [SX[1] - 0.4, 0, -APSE_IN], max: [X1, h, APSE_IN], mat: "chancel", eras });
    E.push({ t: "disc", c: [APSE_C, 0], r: APSE_IN, y: h, arc: [-90, 180], mat: "chancel", eras });
    E.push({ t: "stair", from: [SX[1] - 0.4 - steps * run, 0], dir: [1, 0], width: 3.0, steps, rise: h / steps, run, y0: 0, mat: "chancel", eras });
    E.push({ t: "box", min: [APSE_C + 0.55, h, -0.45], max: [APSE_C + 1.15, h + 0.95, 0.45], mat: eras[0] === TODAY ? "c:#e9e1d0" : "c:#c9b994", eras }); // altar stone
  }
  E.push({ t: "box", min: [APSE_C + 0.82, 1.95, -0.02], max: [APSE_C + 0.88, 2.45, 0.02], mat: "iron", eras: [TODAY] });
  E.push({ t: "box", min: [APSE_C + 0.82, 2.25, -0.13], max: [APSE_C + 0.88, 2.3, 0.13], mat: "iron", eras: [TODAY] });

  // ---- furnishing ----
  // today (photos 2018–2024): showcases along the walls, pots on a carpet, an iron ring chandelier, wall sconces
  for (const [x, z, rot, s] of [[-4.0, -2.45, 0, 1], [-1.6, -2.45, 0, 2], [-4.0, 2.45, 180, 3], [-1.6, 2.45, 180, 4], [1.0, -2.45, 0, 5], [2.6, 2.45, 180, 6]] as const)
    E.push({ t: "furniture", kind: "vitrine", at: [x, 0, z], size: [1.1, 1.55, 0.6], rotY: rot, seed: s, eras: [TODAY] });
  E.push({ t: "furniture", kind: "carpet", at: [-4.6, 0.02, 0], size: [0.9, 2.4], pattern: 1, eras: [TODAY] });
  for (const [z, s, c] of [[-0.8, 0.32, "#9a5c38"], [-0.2, 0.26, "#8a5534"], [0.4, 0.36, "#a56a44"], [0.9, 0.22, "#7d5032"]] as const)
    E.push({ t: "furniture", kind: "jug", at: [-4.6, 0.03, z], s, color: c, eras: [TODAY] });
  for (const [x, z] of [[-4.5, -2.9], [-1.0, -2.9], [-4.5, 2.9], [-1.0, 2.9]] as const)
    E.push({ t: "relief", at: [x, 2.2, z + (z < 0 ? 0.03 : -0.03)], size: [0.9, 0.7], rotY: 0, mat: "c:#4d443a", eras: [TODAY] }); // information boards
  E.push({ t: "furniture", kind: "lampRing", at: [DX, 5.2, 0], r: 0.75, n: 10, metal: "iron", eras: [TODAY] });
  E.push({ t: "furniture", kind: "lampRing", at: [-2.6, 4.4, 0], r: 0.6, n: 8, metal: "iron", eras: [TODAY] });
  E.push({ t: "light", at: [DX, 4.6, 0], intensity: 0.9, distance: 9, color: "#ffd9a0", eras: [TODAY] });
  E.push({ t: "light", at: [-2.6, 3.8, 0], intensity: 0.8, distance: 8, color: "#ffd9a0", eras: [TODAY] });
  for (const [x, z, rot] of [[-3.3, -2.97, 180], [-0.9, -2.97, 180], [-3.3, 2.97, 0], [-0.9, 2.97, 0], [3.36, -2.5, 90], [3.36, 2.5, 90]] as const)
    E.push({ t: "furniture", kind: "sconce", at: [x, 2.3, z], rotY: rot, light: x > 0 ? 0.35 : 0, eras: [TODAY] });
  // 12th century (hypothesis): hanging oil lamps, a reed mat by the door
  for (const [x, z] of [[-2.6, 0], [DX, 0], [-4.2, 0]] as const) E.push({ t: "furniture", kind: "lamp", at: [x, 3.6, z], light: 0.7, distance: 8, eras: [XII] });
  E.push({ t: "light", at: [DX, 7.5, 0], intensity: 0.5, distance: 10, color: "#fff0d8" });

  // ---- yard: enclosure, gate, stalls, bust, trees, flower beds ----
  const gz = 2.2;
  for (const [a, b] of [[[ENC.x0, -gz], [ENC.x0, -ENC.y]], [[ENC.x0, -ENC.y], [ENC.x1, -ENC.y]], [[ENC.x1, -ENC.y], [ENC.x1, ENC.y]], [[ENC.x1, ENC.y], [ENC.x0, ENC.y]], [[ENC.x0, ENC.y], [ENC.x0, gz]]] as [Vec2, Vec2][])
    E.push({ t: "wall", from: a, to: b, y0: LOW, h: 2.2, th: 0.5, mat: "fence" });
  // today: stone gate with an arched opening, open wooden leaves and a tile roof
  E.push({ t: "wall", from: [ENC.x0, -3.0], to: [ENC.x0, 3.0], y0: LOW, h: 4.0, th: 1.4, ops: [door(3.0, 2.4, 1.8)], mat: "fence", eras: [TODAY] });
  for (const s of [-1, 1]) E.push({ t: "box", min: [ENC.x0 + 0.72, LOW, s > 0 ? 1.15 : -1.25], max: [ENC.x0 + 1.9, LOW + 2.9, s > 0 ? 1.25 : -1.15], mat: "c:#9a6a3c", eras: [TODAY] });
  house(E, ENC.x0, 0, 2.2, 6.4, 0.01, LOW + 4.0, "fence", "roof", [TODAY]);
  // 12th c.: a plain opening in the river-stone wall
  E.push({ t: "box", min: [ENC.x0 - 0.3, LOW, -gz - 0.4], max: [ENC.x0 + 0.3, LOW + 2.5, -gz], mat: "fence", eras: [XII] });
  E.push({ t: "box", min: [ENC.x0 - 0.3, LOW, gz], max: [ENC.x0 + 0.3, LOW + 2.5, gz + 0.4], mat: "fence", eras: [XII] });
  // stalls with carpets along the north wall (today)
  for (const [x, w] of [[-28, 5], [-21.5, 6], [-15.5, 4]] as const) {
    house(E, x, -ENC.y + 2.0, w, 3.2, 2.6, LOW, "c:#e2d8c4", "roof", [TODAY]);
    for (let k = 0; k < Math.floor(w / 1.3); k++)
      E.push({ t: "plane", at: [x - w / 2 + 0.75 + k * 1.3, LOW + 1.3, -ENC.y + 3.62], size: [1.1, 1.6], mat: `carpet${(k + Math.round(x)) % 3}`, eras: [TODAY] });
  }
  E.push({ t: "furniture", kind: "bust", at: [BUST[0], 0, -BUST[1]], rotY: 90, eras: [TODAY] });
  // flower beds with roses beside the church, lawns (today); scrub in the 12th c.
  for (const s of [-1, 1]) {
    E.push({ t: "box", min: [-9, 0, s > 0 ? 6.2 : -9.2], max: [9, 0.12, s > 0 ? 9.2 : -6.2], mat: "bed", eras: [TODAY] });
    for (const x of [-6, 0, 6]) E.push({ t: "furniture", kind: "roses", at: [x, 0.12, s * 7.7], size: [4.6, 2.2], seed: 7 + x + s, eras: [TODAY] });
  }
  E.push({ t: "box", min: [9.5, 0, -5], max: [12.6, 0.12, 5], mat: "bed", eras: [TODAY] });
  for (const [x, z] of [[-10, 8.5], [-10, -8.5], [12, 8.5], [12, -8.5], [6.5, 9], [-4, -9]] as const) E.push({ t: "furniture", kind: "cypress", at: [x, 0, z], h: 8 + ((x * 3) % 2), eras: [TODAY] });
  for (const [x, z] of [[-20, -9], [-24, 9], [9, 11.8], [-2, -12], [14.5, 0], [-12, 12], [-17, -11.5]] as const) E.push({ t: "furniture", kind: "tree", at: [x, LOW, z], h: 8 + ((x * 7) % 3) });
  for (let i = 0; i < 14; i++) {
    const x = TER.x0 + 2 + r() * (TER.x1 - TER.x0 - 4), z = (r() < 0.5 ? -1 : 1) * (6.6 + r() * 2.4);
    E.push({ t: "furniture", kind: "bush", at: [x, 0, z], r: 0.4 + r() * 0.3, eras: [TODAY] });
    E.push({ t: "furniture", kind: "bush", at: [x + 1.5, 0, -z], r: 0.5 + r() * 0.5, eras: [XII] });
  }
  for (const [x, z] of [[-16, 5], [10, -11], [-6, 12]] as const) E.push({ t: "furniture", kind: "tree", at: [x, LOW, z], h: 11, eras: [XII] }); // old walnuts (hypothesis)

  // ---- the village beyond the wall: red tile roofs today, river stone with flat roofs in the 12th c. ----
  for (const h of houses()) {
    house(E, h.x, -h.y, h.w, h.d, h.h, LOW, "c:#e6dfd0", "roof", [TODAY]);
    house(E, h.x, -h.y, h.w, h.d, h.h * 0.8, LOW, "fence", null, [XII]);
    if (r() < 0.6) E.push({ t: "furniture", kind: "tree", at: [h.x + h.w / 2 + 2.5, LOW, -h.y + (r() - 0.5) * 4], h: 7 + r() * 4 });
  }
  // a ring of forest beyond the village (the foot of the mountains)
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + r() * 0.05, d = 78 + r() * 40;
    E.push({ t: "furniture", kind: "tree", at: [-8 + Math.cos(a) * d, LOW, Math.sin(a) * d], h: 9 + r() * 6 });
  }

  // ---- zones (walk coords; z = −build y). Earlier entries win where two zones share a floor height. ----
  const zones: Zone[] = [
    { id: "altar", rect: [1.0, 1.7, -1.45, 1.45], floor: 0 },
    { id: "dome", rect: [-0.3, 1.0, -1.45, 1.45], floor: 0 },
    { id: "dome", rect: [-0.3, 0.3, -1.9, 1.9], floor: 0 },
    { id: "dome", rect: [0.35, 3.3, 1.45, 2.95], floor: 0 },
    { id: "dome", rect: [0.35, 3.3, -2.95, -1.45], floor: 0 },
    { id: "nave", rect: [X0 + T + 0.05, -0.3, -2.95, 2.95], floor: 0 },
    { id: "portal", rect: [X0 - 0.05, X0 + T + 0.05, -0.5, 0.5], floor: 0 },
    { id: "crypt", rect: [TER.x0 + 0.05, X0 - 0.05, -4.5, -1.4], floor: 0 },
    { id: "portal", rect: [TER.x0 + 0.05, X0 - 0.05, -1.4, 2.6], floor: 0 },
    { id: "court", rect: [TER.x0 + 0.05, TER.x1 - 0.05, -TER.y + 0.05, -HW - 0.2], floor: 0 },
    { id: "court", rect: [TER.x0 + 0.05, TER.x1 - 0.05, HW + 0.2, TER.y - 0.05], floor: 0 },
    { id: "court", rect: [APSE_C + APSE_R + 0.2, TER.x1 - 0.05, -HW - 0.2, HW + 0.2], floor: 0 },
    { id: "court", rect: [TER.x0 + 0.05, X0 - 0.2, -HW - 0.2, HW + 0.2], floor: 0 },
    { id: "yard", rect: [TER.x0 - 1.85, TER.x0 + 0.05, -3.95, 3.95], floor: { ramp: { axis: "x", from: TER.x0 - 1.8, to: TER.x0, y0: LOW, y1: 0 } } },
    { id: "yard", rect: [ENC.x0 + 0.6, TER.x0 - 1.8, -ENC.y + 3.9, ENC.y - 0.5], floor: LOW },
    { id: "yard", rect: [ENC.x0 - 1.0, ENC.x0 + 0.7, -1.15, 1.15], floor: LOW },
  ];
  const obstacles: [number, number, number][] = [[BUST[0], -BUST[1], 0.55]];
  return { elements: E, zones, obstacles };
}

/* ---------------- write ---------------- */
const m = JSON.parse(fs.readFileSync(FILE, "utf8")) as Manifest;
m.exterior.parts = exterior();
m.exterior.palette = PALETTE;
if (m.walk) {
  const w = walk();
  m.walk.elements = w.elements;
  m.walk.zones = w.zones;
  m.walk.obstacles = w.obstacles;
  m.walk.eras = [XII, TODAY];
}
fs.writeFileSync(FILE, JSON.stringify(m, null, 1) + "\n");
console.log(`[kish] ${m.exterior.parts.length} exterior parts, ${m.walk?.elements.length ?? 0} walk elements, ${m.walk?.zones.length ?? 0} zones`);
