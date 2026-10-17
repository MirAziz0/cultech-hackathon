/* Geometry generator for content/monuments/aghdam-mosque/manifest.json.
   Writes ONLY the geometry keys (exterior.parts, walk.elements, walk.zones, walk.obstacles) and keeps
   every hand-written text in the manifest. Run after changing the layout:
     npx tsx scripts/monuments/aghdam-mosque.ts
   Measurements are estimates (no measured plan is published); see CONTENT_TODO.md.

   Build coordinates (exterior): x east, y north, z up, metres. Walk: x east, y up, z south (z = -y).
   Mosque: prayer hall interior x −9…9, y −10…8 (mihrab on the south wall), front block y 8.9…13.9
   with the entrance iwan facing north, two minarets on the front corners. */
import fs from "node:fs";
import path from "node:path";
import type { El, ExteriorPart, Manifest, Vec2, Zone } from "../../lib/types";

const FILE = path.join(process.cwd(), "content", "monuments", "aghdam-mosque", "manifest.json");
const XIX = "xix", RUIN = "ruin", TODAY = "today";
const ALL = [XIX, RUIN, TODAY];

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/* ---------------- shared layout ---------------- */
const W_OUT = 9.9;           // half width of the building (outer face)
const Y_S = -10.9, Y_N = 13.9; // south / north outer faces (build y)
const Y_HALL_N = 8.9;        // hall north wall outer face = front block back
const WALL_H = 10;
const BAYS_X = [-6, 0, 6], BAYS_Y = [-7, -1, 5]; // dome centres (build coords)
const MINARETS: Vec2[] = [[-8.6, 12.6], [8.6, 12.6]];
const HOLES = [[0, -1], [6, 5]]; // bays with a broken crown in 1993–2020 (photos show the domes standing; holes per soyqirim.az, positions assumed)

/** town blocks around the mosque (19th-century houses / later ruins), deterministic */
function townBlocks() {
  const r = rng(1868);
  const out: { x: number; y: number; w: number; d: number; h: number; roof: boolean }[] = [];
  for (let gx = -4; gx <= 4; gx++)
    for (let gy = -4; gy <= 4; gy++) {
      const x = gx * 11 + (r() - 0.5) * 3, y = gy * 11 + (r() - 0.5) * 3;
      if (Math.abs(x) < 30 && y > -24 && y < 46) continue; // mosque courtyard and square
      if (Math.abs(x) < 4.5 || Math.abs(y - 2) < 3) continue; // streets
      if (Math.hypot(x, y) > 50) continue;
      out.push({ x, y, w: 6 + r() * 3, d: 6 + r() * 3, h: 3.6 + r() * 2.4, roof: r() < 0.55 });
    }
  return out;
}

/* ---------------- exterior maquette ---------------- */
function exterior(): ExteriorPart[] {
  const P: ExteriorPart[] = [];
  const r = rng(7);
  // base and ground
  P.push({ t: "box", size: [104, 104, 1.6], at: [0, 0, -1.6], mat: "base" });
  P.push({ t: "box", size: [104, 104, 0.1], at: [0, 0, -0.1], matByEra: { xix: "ground", ruin: "groundWild", today: "groundNew" } });
  // streets (19th c.: hypothesis) / overgrown tracks / new paths
  for (const [sx, sy, w, d] of [[0, 2, 104, 5], [0, 2, 5, 104]] as const) P.push({ t: "box", size: [w, d, 0.06], at: [sx, sy, 0], eras: [XIX, RUIN], matByEra: { xix: "path", ruin: "track" } });

  // --- the mosque body (same massing in every era; skins change by era) ---
  const body = { matByEra: { xix: "wallLime", ruin: "wallMarble", today: "wallStone" } };
  P.push({ t: "box", size: [W_OUT * 2, Y_HALL_N - Y_S, WALL_H], at: [0, (Y_HALL_N + Y_S) / 2, 0], ...body });
  P.push({ t: "box", size: [W_OUT * 2, Y_N - Y_HALL_N, WALL_H], at: [0, (Y_N + Y_HALL_N) / 2, 0], ...body });
  // cornice / parapet
  P.push({ t: "box", size: [W_OUT * 2 + 0.4, Y_N - Y_S + 0.4, 0.45], at: [0, (Y_N + Y_S) / 2, WALL_H - 0.45], eras: [XIX, TODAY], matByEra: { xix: "wallLime", today: "cornice" } });
  P.push({ t: "box", size: [W_OUT * 2 + 0.2, Y_N - Y_S + 0.2, 0.3], at: [0, (Y_N + Y_S) / 2, WALL_H - 0.3], eras: [RUIN], mat: "wallMarble" });
  // iwan (entrance) on the north facade
  P.push({ t: "niche", w: 6, spring: 5.6, at: [0, Y_N + 0.02, 0.2], facing: 90, depth: 0.12, matByEra: { xix: "iwan", ruin: "iwanWorn", today: "iwan" } });
  // two-storey arcades either side of the iwan
  for (const z of [0.5, 5.2])
    for (const [a, b] of [[-9.2, -3.6], [3.6, 9.2]])
      P.push({ t: "windowRow", from: a, to: b, along: "x", at: [0, Y_N + 0.02], z, facing: 90, n: 2, w: 1.9, spring: 2.4, matByEra: { xix: "opening", ruin: "opening", today: "glazed" } });
  // side and back windows, two storeys
  for (const [x, f] of [[W_OUT + 0.02, 0], [-W_OUT - 0.02, 180]] as const)
    for (const z of [1.1, 5.6]) P.push({ t: "windowRow", from: Y_S + 0.6, to: Y_N - 0.6, along: "y", at: [x, 0], z, facing: f, n: 4, w: 1.4, spring: 2.0, matByEra: { xix: "window", ruin: "opening", today: "glazed" } });
  for (const z of [1.1, 5.6]) P.push({ t: "windowRow", from: -9, to: 9, along: "x", at: [0, Y_S - 0.02], z, facing: -90, n: 3, w: 1.4, spring: 2.0, matByEra: { xix: "window", ruin: "opening", today: "glazed" } });
  // roof: nine brick domes (19th c. plastered — hypothesis; 1993–2020 bare brick, weeds) / restored hipped metal roof
  for (const x of BAYS_X)
    for (const y of BAYS_Y) {
      P.push({ t: "cyl", r: 2.75, h: 0.5, at: [x, y, WALL_H], eras: [XIX, RUIN], matByEra: { xix: "domeLime", ruin: "domeBrick" }, sides: 20 });
      P.push({ t: "dome", r: 2.75, h: 1.9, at: [x, y, WALL_H + 0.5], eras: [XIX, RUIN], matByEra: { xix: "domeLime", ruin: "domeBrick" }, sides: 24, pointed: 0.1 });
      if (HOLES.some(([hx, hy]) => hx === x && hy === y)) P.push({ t: "cyl", r: 0.75, h: 0.3, at: [x, y, WALL_H + 2.15], eras: [RUIN], mat: "hole", sides: 10 });
    }
  P.push({ t: "box", size: [W_OUT * 2, Y_N - Y_S, 0.25], at: [0, (Y_N + Y_S) / 2, WALL_H - 0.05], eras: [XIX, RUIN], matByEra: { xix: "roofFlat", ruin: "roofRuin" } });
  for (let i = 0; i < 26; i++) P.push({ t: "bush", at: [(r() - 0.5) * 18, Y_S + 1 + r() * 23, WALL_H + 0.1], s: 0.25 + r() * 0.3, eras: [RUIN], mat: "weed" });
  P.push({ t: "hipRoof", at: [0, (Y_N + Y_S) / 2, WALL_H], size: [W_OUT * 2 + 1.2, Y_N - Y_S + 1.2], h: 4.4, eras: [TODAY], mat: "roof" });
  P.push({ t: "box", size: [2.2, 1.6, 1.4], at: [0, (Y_N + Y_S) / 2 + 9.2, WALL_H + 1.6], eras: [TODAY], mat: "roof" }); // dormer
  // minarets on the front corners (start at the roof)
  for (const [x, y] of MINARETS)
    P.push({ t: "minaret", at: [x, y, WALL_H], r: 1.2, h: 14, base: { r: 1.45, h: 2.6 }, belts: 3, lantern: 2.1, mat: "minaretBase",
      brickMats: ["mBrickA", "mBrickB"] });

  // --- surroundings by era ---
  const town = townBlocks();
  // 19th century: courtyard wall, trees, low houses (all hypothesis)
  P.push({ t: "wallLoop", pts: [[-25, -18], [25, -18], [25, 40], [3, 40]], h: 2.4, th: 0.6, closed: false, eras: [XIX], mat: "wallLime" });
  P.push({ t: "wallLoop", pts: [[-3, 40], [-25, 40], [-25, -18]], h: 2.4, th: 0.6, closed: false, eras: [XIX], mat: "wallLime" });
  P.push({ t: "box", size: [6, 26, 0.08], at: [0, 27, 0.02], eras: [XIX, TODAY], matByEra: { xix: "paving", today: "pathNew" } });
  for (const [x, y, k] of [[-18, 28, "round"], [18, 28, "round"], [-18, 6, "cypress"], [18, 6, "cypress"], [-18, -10, "round"], [18, -10, "round"], [-10, 34, "cypress"], [10, 34, "cypress"]] as const)
    P.push({ t: "tree", at: [x, y, 0], s: k === "round" ? 1.6 : 1.1, kind: k, eras: [XIX] });
  for (const b of town) {
    P.push({ t: "box", size: [b.w, b.d, b.h], at: [b.x, b.y, 0], eras: [XIX], mat: "house" });
    if (b.roof) P.push({ t: "hipRoof", at: [b.x, b.y, b.h], size: [b.w + 0.6, b.d + 0.6], h: 1.6, eras: [XIX], mat: "houseRoof" });
  }
  // 1993–2020: the town reduced to broken wall stubs, rubble and scrub; the mosque stands alone
  for (const b of town) {
    P.push({ t: "rooms", at: [b.x, b.y, 0], rooms: [[0, 0, Math.min(b.w, b.d)]], mode: "ruin", eras: [RUIN], mat: "ruinStone" });
    if (r() < 0.6) P.push({ t: "tree", at: [b.x + (r() - 0.5) * 8, b.y + (r() - 0.5) * 8, 0], s: 0.9 + r() * 0.8, eras: [RUIN], mat: "treeWild" });
  }
  P.push({ t: "scatter", at: [0, 10, 0], area: [48, 48], n: 160, size: [0.4, 1.6], eras: [RUIN], mat: "ruinStone" });
  for (let i = 0; i < 70; i++) {
    const x = (r() - 0.5) * 96, y = (r() - 0.5) * 96;
    if (Math.abs(x) < 11 && y > -12 && y < 15) continue;
    P.push({ t: "bush", at: [x, y, 0], s: 0.6 + r() * 1.1, eras: [RUIN], mat: "treeWild" });
  }
  // today: landscaped square, hedges, lawns, young trees, memorial stone at the path
  P.push({ t: "box", size: [60, 64, 0.08], at: [0, 10, 0.02], eras: [TODAY], mat: "lawn" });
  P.push({ t: "box", size: [26, 3.5, 0.1], at: [0, 15.6, 0.04], eras: [TODAY], mat: "pathNew" });
  for (const s of [-1, 1]) {
    P.push({ t: "box", size: [0.9, 22, 0.9], at: [s * 4.2, 28.5, 0], eras: [TODAY], mat: "hedge" });
    for (let i = 0; i < 5; i++) P.push({ t: "tree", at: [s * 12, 20 + i * 5, 0], s: 0.9, eras: [TODAY], mat: "tree" });
    P.push({ t: "box", size: [3, 30, 0.08], at: [s * 13, -1, 0.04], eras: [TODAY], mat: "pathNew" });
  }
  P.push({ t: "cyl", r: 0.8, r2: 0.45, h: 1.8, sides: 7, at: [5.7, 20.95, 0], eras: [TODAY], mat: "memorial" }); // the restoration stone
  P.push({ t: "box", size: [0.65, 0.06, 0.45], at: [5.7, 21.62, 0.7], eras: [TODAY], mat: "plaque" });            // its bronze plaque, on the side facing the gate
  return P;
}

/* ---------------- walk mode ---------------- */
type Op = { u: number; w: number; sill: number; spring: number; kind: "door" | "window" | "niche"; fill?: "glass" | "open"; back?: number };
const win = (u: number, sill: number, w = 1.3, spring = 1.7): Op => ({ u, w, sill, spring, kind: "window", fill: "glass" });
const door = (u: number, w: number, spring: number, sill = 0): Op => ({ u, w, sill, spring, kind: "door" });

/** wall core in `inMat` plus a 4 cm skin in `outMat` on one side (+1 = the wall's local +z side) */
function wall2(E: El[], a: Vec2, b: Vec2, th: number, h: number, ops: Op[], inMat: string, outMat?: string, outSide: 1 | -1 = 1, eras?: string[]) {
  E.push({ t: "wall", from: a, to: b, y0: 0, h, th, ops, mat: inMat, ...(eras ? { eras } : {}) });
  if (!outMat) return;
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), nx = (-dz / L) * outSide, nz = (dx / L) * outSide, o = th / 2 + 0.02;
  E.push({ t: "wall", from: [a[0] + nx * o, a[1] + nz * o], to: [b[0] + nx * o, b[1] + nz * o], y0: 0, h, th: 0.04, ops, mat: outMat, ...(eras ? { eras } : {}) });
}

function walk(): { elements: El[]; zones: Zone[]; obstacles: [number, number, number][] } {
  const E: El[] = [];
  const r = rng(1993);
  // pillars 5 m, arches spring at 5 m (apex ≈ 8.9); sail vaults: corners 6.46, edge middles 8.86, crowns 9.85 (below the roof slab)
  const H = WALL_H, GY = 4.6, PIL_H = 5.0, SPRING = 6.46, RISE = 0.8;
  const wIn = "wallIn", wOut = "wallOut";

  // ---- ground and courtyard ----
  E.push({ t: "terrain", rect: [-160, 160, -160, 160], y: -0.03, mat: "court" });
  E.push({ t: "floor", rect: [-9, 9, -8, 10], y: 0, mat: "hallFloor" });
  E.push({ t: "floor", rect: [-0.8, 0.8, 9.9, 10.9], y: 0.002, mat: "hallFloor" });
  // the historic stone pavement at the entrance (found in the 2022 excavations)
  E.push({ t: "floor", rect: [-3, 3, -13.9, -8.9], y: 0.01, mat: "setts" });
  E.push({ t: "floor", rect: [-4, 4, -17, -13.9], y: 0.03, mat: "setts" }); // 3 cm above the today paving (2 mm flickered)
  E.push({ t: "floor", rect: [-9, -3.6, -13.1, -8.9], y: 0.005, mat: "floorGrey" });
  E.push({ t: "floor", rect: [3.6, 9, -13.1, -8.9], y: 0.005, mat: "floorGrey" });

  // ---- outer walls (west/east run the full length; front block z −13.9…−8.9) ----
  const hallZ = [-5, 1, 7];
  wall2(E, [-9.45, -13.9], [-9.45, 10.9], 0.9, H, [
    win(2.5, 1.0), win(2.5, 5.5, 1.1, 1.4),
    ...hallZ.map((z) => win(z + 13.9, 1.0)), ...hallZ.map((z) => win(z + 13.9, 5.7, 1.2, 1.5)),
  ], wIn, wOut, 1);
  wall2(E, [9.45, 10.9], [9.45, -13.9], 0.9, H, [
    win(22.3, 1.0), win(22.3, 5.5, 1.1, 1.4),
    ...hallZ.map((z) => win(10.9 - z, 1.0)), ...hallZ.map((z) => win(10.9 - z, 5.7, 1.2, 1.5)),
  ], wIn, wOut, 1);
  // south (qibla) wall; the mihrab is a niche in its middle
  wall2(E, [-9.9, 10.45], [9.9, 10.45], 0.9, H, [win(3.9, 1.0), win(15.9, 1.0), win(3.9, 5.7, 1.2, 1.5), { u: 9.9, w: 1.5, sill: 0, spring: 2.1, kind: "niche", back: 1 }, win(9.9, 6.3, 1.0, 1.3), win(15.9, 5.7, 1.2, 1.5)], wIn, wOut, 1);
  // hall north wall: main door, gallery door from the stair; iwan face on its north side
  E.push({ t: "wall", from: [-9, -8.45], to: [9, -8.45], y0: 0, h: H, th: 0.9, ops: [door(9, 1.6, 2.5), door(5.05, 0.9, 2.0, GY)], mat: wIn });
  E.push({ t: "wall", from: [-3, -8.92], to: [3, -8.92], y0: 0, h: H, th: 0.04, ops: [door(3, 1.6, 2.5)], mat: "iwan" });
  // front facade either side of the iwan: two-storey arcades
  const arc = (u: number): Op[] => [{ u, w: 1.7, sill: 0.5, spring: 2.1, kind: "window", fill: "glass" }, { u, w: 1.7, sill: 5.0, spring: 2.0, kind: "window", fill: "glass" }];
  wall2(E, [-9.9, -13.45], [-3.3, -13.45], 0.9, H, [...arc(2.3), ...arc(4.7)], wIn, wOut, -1);
  wall2(E, [3.3, -13.45], [9.9, -13.45], 0.9, H, [...arc(1.9), ...arc(4.3)], wIn, wOut, -1);
  // iwan: framing arch, side walls with doors to the side rooms, pointed vault
  wall2(E, [-3.3, -13.6], [3.3, -13.6], 0.6, H, [door(3.3, 6.0, 5.6)], wOut, "iwan", 1);
  wall2(E, [-3.3, -13.6], [-3.3, -8.9], 0.6, H, [door(2.6, 1.0, 2.1)], wIn, "iwan", -1); // starts inside the facade wall: no coplanar end face
  wall2(E, [3.3, -8.9], [3.3, -13.6], 0.6, H, [door(2.1, 1.0, 2.1)], wIn, "iwan", -1);
  E.push({ t: "vault", x: [-3, 3], z: [-13.3, -8.92], y: 5.6, axis: "z", scaleY: 1.3, mat: "iwan" });
  // side rooms: barrel vaults; roof over the front block
  E.push({ t: "vault", x: [-9, -3.6], z: [-13.0, -8.9], y: 7.6, axis: "x", scaleY: 0.8, mat: "vault" });
  E.push({ t: "vault", x: [3.6, 9], z: [-13.0, -8.9], y: 7.6, axis: "x", scaleY: 0.8, mat: "vault" });
  E.push({ t: "box", min: [-9.9, H, -13.9], max: [9.9, H + 0.3, -8.0], mat: "roofSlab" });
  // cornice
  for (const [a, b] of [[[-10.1, -14.1], [10.1, -13.7]], [[-10.1, 10.7], [10.1, 11.1]], [[-10.1, -14.1], [-9.7, 11.1]], [[9.7, -14.1], [10.1, 11.1]]] as [Vec2, Vec2][])
    E.push({ t: "box", min: [a[0], H - 0.1, a[1]], max: [b[0], H + 0.45, b[1]], mat: wOut });

  // ---- stair to the women's gallery (west side room; position is a hypothesis) ----
  E.push({ t: "stair", from: [-4.3, -12.5], dir: [-1, 0], width: 1.2, steps: 8, rise: GY / 2 / 8, run: 3.7 / 8, y0: 0, mat: "stone" });
  E.push({ t: "box", min: [-9.0, 0, -13.1], max: [-8.0, GY / 2, -8.9], mat: "stone" });
  E.push({ t: "stair", from: [-8.0, -9.5], dir: [1, 0], width: 1.2, steps: 8, rise: GY / 2 / 8, run: 3.7 / 8, y0: GY / 2, mat: "stone" });
  E.push({ t: "box", min: [-8.0, 0, -10.1], max: [-4.3, GY / 2, -8.9], mat: "stone" });
  E.push({ t: "box", min: [-4.3, GY - 0.3, -10.1], max: [-3.6, GY, -8.9], mat: "stone" });

  // ---- prayer hall: four octagonal stone pillars, pointed arches, nine domed bays ----
  const PIL: Vec2[] = [[-3, -2], [3, -2], [-3, 4], [3, 4]];
  for (const c of PIL) E.push({ t: "kColumn", c, y0: 0, h: PIL_H, r: 0.36, mat: "pillar" });
  const archWall = (a: Vec2, b: Vec2) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    E.push({ t: "wall", from: a, to: b, y0: PIL_H, h: H - PIL_H, th: 0.7, ops: [{ u: L / 2, w: L - 0.05, sill: 0, spring: 0.02, kind: "door" }], mat: "vault" });
  };
  for (const z of [-2, 4]) for (const [x0, x1] of [[-9, -3], [-3, 3], [3, 9]]) archWall([x0, z], [x1, z]);
  for (const x of [-3, 3]) for (const [z0, z1] of [[-8, -2], [-2, 4], [4, 10]]) archWall([x, z0], [x, z1]);
  const holeAt = (x: number, z: number) => HOLES.some(([hx, hy]) => hx === x && -hy === z);
  for (const x of BAYS_X)
    for (const y of BAYS_Y) {
      const z = -y, holed = holeAt(x, z);
      const bay = { x: [x - 3, x + 3] as Vec2, z: [z - 3, z + 3] as Vec2, y: SPRING, rise: RISE, mat: "vault" };
      if (holed) {
        E.push({ t: "sailVault", ...bay, eras: [XIX, TODAY] });
        E.push({ t: "sailVault", ...bay, hole: 0.9, eras: [RUIN] });
      } else E.push({ t: "sailVault", ...bay });
      // roof slab around the dome and the dome shell on the roof (covered by the metal roof today)
      E.push({ t: "box", min: [x - 3, H, z - 3], max: [x + 3, H + 0.3, z + 3], mat: "roofSlab", eras: holed ? [XIX, TODAY] : undefined });
      if (holed) {
        const h = 0.9;
        E.push({ t: "box", min: [x - 3, H, z - 3], max: [x - h, H + 0.3, z + 3], mat: "roofSlab", eras: [RUIN] });
        E.push({ t: "box", min: [x + h, H, z - 3], max: [x + 3, H + 0.3, z + 3], mat: "roofSlab", eras: [RUIN] });
        E.push({ t: "box", min: [x - h, H, z - 3], max: [x + h, H + 0.3, z - h], mat: "roofSlab", eras: [RUIN] });
        E.push({ t: "box", min: [x - h, H, z + h], max: [x + h, H + 0.3, z + 3], mat: "roofSlab", eras: [RUIN] });
      }
      E.push({ t: "dome", c: [x, z], r: 2.75, y: H + 0.3, sy: 0.7, outside: true, mat: "domeOut", eras: holed ? [XIX] : [XIX, RUIN] });
      if (holed) E.push({ t: "dome", c: [x, z], r: 2.75, y: H + 0.3, sy: 0.7, outside: true, hole: 0.9, mat: "domeOut", eras: [RUIN] });
    }

  // ---- women's gallery (U-shaped, along the north, west and east walls) ----
  const G: [Vec2, Vec2, ("n" | "s" | "e" | "w")[]][] = [
    [[-6.95, 6.95], [-8, -5.95], ["s"]], [[-9, -6.95], [-8, -5.95], []], [[6.95, 9], [-8, -5.95], []],
    [[-9, -6.95], [-5.95, 7.4], ["e", "s"]], [[6.95, 9], [-5.95, 7.4], ["w", "s"]],
  ];
  for (const [x, z, rail] of G) {
    E.push({ t: "gallery", x, z, y: GY, rail, railMat: "rail", mat: "galFloor", eras: [XIX, TODAY] });
    E.push({ t: "gallery", x, z, y: GY, rail, railMat: "rail", mat: "galFloor", broken: true, seed: Math.round(x[0] * 10 + z[0]), eras: [RUIN] });
  }
  const PIERS: Vec2[] = [[-3, -5.95], [3, -5.95], [-6.95, -5.95], [6.95, -5.95], [-6.95, -2], [6.95, -2], [-6.95, 4], [6.95, 4], [-6.95, 7.4], [6.95, 7.4]];
  for (const c of PIERS) E.push({ t: "kColumn", c, y0: 0, h: GY - 0.35, r: 0.24, mat: "pillar" });

  // ---- mihrab (south wall): niche framed by a decorated band (the 1913 painting is not in the 19th-c. state) ----
  for (const [min, max] of [[[-1.25, 0, 9.94], [-0.85, 3.9, 10.0]], [[0.85, 0, 9.94], [1.25, 3.9, 10.0]], [[-1.25, 3.9, 9.94], [1.25, 4.35, 10.0]]] as [[number, number, number], [number, number, number]][]) {
    E.push({ t: "box", min, max, mat: "c:#d6c8a8", eras: [XIX] });
    E.push({ t: "box", min, max, mat: "tile", eras: [RUIN, TODAY] });
  }

  // ---- minarets on the front corners ----
  for (const [x, y] of MINARETS)
    E.push({ t: "minaret", c: [x, -y], y0: H + 0.3, r: 1.2, h: 14, base: { r: 1.45, h: 2.6 }, belts: 3, lantern: { h: 2.1 }, brick: "mBrick", stone: "minaretBase", wood: "wood", cap: "tin" });

  // ---- restored roof (2022–24): hipped sheet-metal roof over the whole building ----
  {
    const x0 = -10.5, x1 = 10.5, z0 = -14.5, z1 = 11.5, y = H + 0.3, top = y + 4.4, rz0 = -4.5, rz1 = 1.5;
    const quads: [number, number, number][][] = [
      [[x0, y, z0], [x1, y, z0], [0, top, rz0], [0, top, rz0]],
      [[x1, y, z1], [x0, y, z1], [0, top, rz1], [0, top, rz1]],
      [[x0, y, z1], [x0, y, z0], [0, top, rz0], [0, top, rz1]],
      [[x1, y, z0], [x1, y, z1], [0, top, rz1], [0, top, rz0]],
    ];
    for (const q of quads) E.push({ t: "quad", pts: q as never, mat: "metalRoof", eras: [TODAY] });
    E.push({ t: "box", min: [-1.1, top - 2.2, -9], max: [1.1, top - 0.8, -7.4], mat: "metalRoof", eras: [TODAY] });
  }

  // ---- era furnishing ----
  // 19th century: carpets, oil lamps (hypothesis)
  for (const [x, z, w, d, p] of [[0, 1, 5.6, 16, 0], [-6, 1.5, 4.2, 14, 1], [6, 1.5, 4.2, 14, 2]] as const)
    E.push({ t: "furniture", kind: "carpet", at: [x, 0, z], size: [w, d], pattern: p, eras: [XIX] });
  for (const [x, z] of [[0, -5], [0, 1], [0, 7], [-6, 1], [6, 1]]) E.push({ t: "furniture", kind: "lamp", at: [x, 4.4, z], light: 0.9, distance: 9, eras: [XIX] });
  // today (photos 2024): carpets wall to wall, chandeliers, lectern, daylight
  // rows that touch but never overlap (front strip z −7.7…−2.7, then −2.5…2.5, 2.7…7.3, 7.5…9.8); a hair of height each so none flickers
  const carpets: [number, number, number, number, number][] = [[0, -5.2, 17, 5, 1],
    [-6, 0, 5.6, 5, 1], [0, 0, 5.6, 5, 0], [6, 0, 5.6, 5, 2],
    [-6, 5, 5.6, 4.6, 2], [0, 5, 5.6, 4.6, 1], [6, 5, 5.6, 4.6, 0],
    [-6, 8.65, 5.6, 2.3, 0], [0, 8.65, 5.6, 2.3, 2], [6, 8.65, 5.6, 2.3, 1]];
  carpets.forEach(([x, z, w, d, p], i) => E.push({ t: "furniture", kind: "carpet", at: [x, 0.002 * (i % 3), z], size: [w, d], pattern: p, eras: [TODAY] }));
  for (const z of [1, 7]) {
    E.push({ t: "furniture", kind: "lampRing", at: [0, 6.9, z], r: 0.95, n: 14, eras: [TODAY] });
    E.push({ t: "light", at: [0, 6.4, z], intensity: 1.2, distance: 13, color: "#fff1d6", eras: [TODAY] });
  }
  E.push({ t: "light", at: [0, 3.6, -4.5], intensity: 0.8, distance: 10, color: "#fff1d6", eras: [TODAY] });
  E.push({ t: "furniture", kind: "lectern", at: [-1.6, 0, 8.6], rotY: 180, eras: [TODAY] });
  E.push({ t: "shaft", at: [8.9, 6.4, 1], to: [4.8, 0, 2.2], w: 0.9, eras: [TODAY] });
  E.push({ t: "shaft", at: [-8.9, 6.4, 7], to: [-4.8, 0, 6.2], w: 0.9, eras: [TODAY] });
  // 1993–2020: rubble, dust, fallen plaster, light through the broken crowns
  E.push({ t: "rubble", rect: [-8.8, 8.8, -7.8, 9.8], y: 0, n: 160, seed: 3, eras: [RUIN] });
  for (const [x, z] of HOLES.map(([hx, hy]) => [hx, -hy])) {
    E.push({ t: "rubble", rect: [x - 1.4, x + 1.4, z - 1.4, z + 1.4], y: 0, n: 70, size: [0.15, 0.6], seed: 17 + x, eras: [RUIN] });
    E.push({ t: "shaft", at: [x, H + 0.4, z], to: [x + 1.0, 0, z + 0.9], w: 1.6, eras: [RUIN] });
    E.push({ t: "light", at: [x + 0.4, 3, z + 0.4], intensity: 0.9, distance: 9, color: "#fff4dc", eras: [RUIN] });
  }
  for (const [a, b, seed] of [[[-9, -8], [-9, 10], 1], [[9, 10], [9, -8], 2], [[-9, 10], [9, 10], 3], [[9, -8], [-9, -8], 4]] as [Vec2, Vec2, number][])
    E.push({ t: "patches", from: a, to: b, y0: 0.4, h: 8.5, n: 5, seed, side: -1, mat: "c:#c4b494", eras: [RUIN] });
  E.push({ t: "rubble", rect: [-3, 3, -13.6, -9], y: 0.01, n: 30, size: [0.08, 0.3], seed: 9, eras: [RUIN] });

  // ---- surroundings ----
  const town = townBlocks();
  // 19th century: courtyard wall with a gate, trees, low houses beyond (hypothesis)
  for (const [a, b] of [[[-25, -40], [-3, -40]], [[3, -40], [25, -40]], [[25, -40], [25, 18]], [[25, 18], [-25, 18]], [[-25, 18], [-25, -40]]] as [Vec2, Vec2][])
    E.push({ t: "wall", from: a, to: b, y0: 0, h: 2.4, th: 0.6, mat: "lime", eras: [XIX] });
  E.push({ t: "floor", rect: [-3, 3, -40, -17], y: 0.008, mat: "floor", eras: [XIX] });
  for (const [x, z, k] of [[-18, -28, "c"], [18, -28, "c"], [-18, -6, "c"], [18, -6, "c"], [-18, 10, "b"], [18, 10, "b"], [-10, -34, "b"], [10, -34, "b"]] as const)
    E.push(k === "c" ? { t: "furniture", kind: "cypress", at: [x, 0, z], h: 9, eras: [XIX] } : { t: "furniture", kind: "bush", at: [x, 0, z], r: 2.4, eras: [XIX] });
  for (const b of town) E.push({ t: "box", min: [b.x - b.w / 2, 0, -b.y - b.d / 2], max: [b.x + b.w / 2, b.h, -b.y + b.d / 2], mat: "c:#d9c8a2", eras: [XIX] });
  // 1993–2020: the town in ruins and overgrown; the mosque stands alone
  for (const b of town) {
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = -b.y - b.d / 2, z1 = -b.y + b.d / 2;
    for (const [a, c] of [[[x0, z0], [x1, z0]], [[x1, z0], [x1, z1]], [[x1, z1], [x0, z1]], [[x0, z1], [x0, z0]]] as [Vec2, Vec2][]) {
      if (r() < 0.25) continue;
      E.push({ t: "wall", from: a, to: c, y0: 0, h: 0.4 + r() * 2.6, th: 0.5, mat: "c:#a89a7e", eras: [RUIN] });
    }
    E.push({ t: "furniture", kind: "bush", at: [b.x + (r() - 0.5) * 6, 0, -b.y + (r() - 0.5) * 6], r: 1.2 + r() * 1.6, eras: [RUIN] });
  }
  for (let i = 0; i < 60; i++) {
    const x = (r() - 0.5) * 48, z = -40 + r() * 58;
    if (Math.abs(x) < 10.5 && z > -14.5 && z < 11.5) continue;
    if (Math.abs(x) < 5 && z < -14) continue; // keep the approach to the door open
    E.push({ t: "furniture", kind: "bush", at: [x, 0, z], r: 0.4 + r() * 1.1, eras: [RUIN] });
  }
  E.push({ t: "rubble", rect: [-24, 24, -40, -15], y: 0, n: 90, size: [0.2, 0.9], seed: 31, eras: [RUIN] });
  // today: landscaped square, path to the door, hedges, young trees, the memorial stone
  E.push({ t: "floor", rect: [-3, 3, -46, -17], y: 0.008, mat: "floorGrey", eras: [TODAY] });
  E.push({ t: "floor", rect: [-13, 13, -17.5, -14.1], y: 0.008, mat: "floorGrey", eras: [TODAY] });
  for (const s of [-1, 1]) {
    E.push({ t: "box", min: [s * 4.2 - 0.45, 0, -40], max: [s * 4.2 + 0.45, 0.9, -18], mat: "hedgePH", eras: [TODAY] });
    for (let i = 0; i < 5; i++) {
      E.push({ t: "furniture", kind: "tree", at: [s * 12, 0, -36 + i * 5], h: 5.5, seed: i + (s > 0 ? 1 : 0), eras: [TODAY] });
    }
  }
  // the 2024 restoration stone: granite boulder with a bronze plaque, facing the path to the door (photo: today_press)
  E.push({ t: "furniture", kind: "plaqueStone", at: [5.7, 0, -20.95], rotY: -18, h: 1.8, eras: [TODAY] });
  // today: the textured model of the restored mosque (content/models/aghdam-mosque) replaces the kit's outside
  // fitted to the kit's footprint (x ±9.9, z −13.9…10.9); the kit's outer surfaces are hidden in this era
  E.push({ t: "model", src: "aghdam-mosque", at: [0, -1.16, -1.5], rotY: 180, scale: [0.985, 1, 1.214], cut: [[-0.95, 0.95, -1.3, 2.6, -10.8, -7.9]], eras: [TODAY], replaces: { types: ["minaret"], mats: ["metalRoof", "domeOut", "wallOut", "iwan", "roofSlab"] } });
  // closed surroundings: perimeter wall with a gate to the road, trees along it, a tree line beyond
  for (const [a, b] of [[[-30, -50], [-4.5, -50]], [[4.5, -50], [30, -50]], [[30, -50], [30, 24]], [[30, 24], [-30, 24]], [[-30, 24], [-30, -50]]] as [Vec2, Vec2][])
    E.push({ t: "wall", from: a, to: b, y0: 0, h: 2.6, th: 0.5, mat: "fence", eras: [TODAY] });
  E.push({ t: "floor", rect: [-3, 3, -51, -46], y: 0.008, mat: "floorGrey", eras: [TODAY] });
  E.push({ t: "floor", rect: [-90, 90, -62, -53], y: 0.006, mat: "road", eras: [TODAY] });
  E.push({ t: "floor", rect: [-90, 90, -53, -51], y: 0.012, mat: "floorGrey", eras: [TODAY] });
  for (let x = -27; x <= 27; x += 6) for (const z of [-47, 21]) if (Math.abs(x) > 6) E.push({ t: "furniture", kind: "tree", at: [x, 0, z], h: 6 + ((x * 7) % 3), eras: [TODAY] });
  for (let z = -41; z <= 15; z += 6) for (const x of [-27, 27]) E.push({ t: "furniture", kind: "tree", at: [x, 0, z], h: 6.5, eras: [TODAY] });
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + 0.3 * r(), d = 62 + r() * 30;
    E.push({ t: "furniture", kind: "tree", at: [Math.cos(a) * d, 0, Math.sin(a) * d - 13], h: 7 + r() * 4, eras: [TODAY] });
  }

  // ---- zones (walk coords) ----
  const zones: Zone[] = [
    { id: "mihrab", rect: [-2.5, 2.5, 7, 9.85], floor: 0 },
    { id: "galleryView", rect: [-3, 3, -6.6, -5.95], floor: GY },
    { id: "gallery", rect: [-9, 9, -8, -5.95], floor: GY },
    { id: "gallery", rect: [-9, -6.95, -5.95, 7.4], floor: GY },
    { id: "gallery", rect: [6.95, 9, -5.95, 7.4], floor: GY },
    { id: "gallery", rect: [-4.45, -3.5, -8.95, -7.95], floor: GY },
    { id: "stairs", rect: [-4.3, -3.6, -10.1, -8.9], floor: GY },
    { id: "stairs", rect: [-8.0, -4.3, -10.1, -8.9], floor: { ramp: { axis: "x", from: -8.0, to: -4.3, y0: GY / 2, y1: GY } } },
    { id: "stairs", rect: [-9.0, -8.0, -13.1, -8.9], floor: GY / 2 },
    { id: "stairs", rect: [-8.0, -4.3, -13.1, -11.9], floor: { ramp: { axis: "x", from: -4.3, to: -8.0, y0: 0, y1: GY / 2 } } },
    { id: "stairs", rect: [-8.0, -3.6, -11.9, -10.1], floor: 0 },
    { id: "stairs", rect: [-3.65, -2.95, -11.5, -10.5], floor: 0 },
    { id: "hall", rect: [-0.8, 0.8, -9.0, -7.95], floor: 0 },
    { id: "entrance", rect: [-3, 3, -17, -8.9], floor: 0 },
    { id: "hall", rect: [-9, 9, -8, 10], floor: 0 },
    { id: "courtyard", rect: [-25, 25, -40, -13.95] },
    { id: "courtyard", rect: [-25, -9.95, -13.95, 17.5] },
    { id: "courtyard", rect: [9.95, 25, -13.95, 17.5] },
    { id: "courtyard", rect: [-25, 25, 10.95, 17.5] },
  ];
  const obstacles: [number, number, number][] = [...PIL.map(([x, z]) => [x, z, 0.65] as [number, number, number]), ...PIERS.map(([x, z]) => [x, z, 0.4] as [number, number, number])];
  return { elements: E, zones, obstacles };
}

/* ---------------- write ---------------- */
const m = JSON.parse(fs.readFileSync(FILE, "utf8")) as Manifest;
m.exterior.parts = exterior();
if (m.walk) {
  const w = walk();
  m.walk.elements = w.elements;
  m.walk.zones = w.zones;
  m.walk.obstacles = w.obstacles;
  m.walk.eras = ALL;
}
fs.writeFileSync(FILE, JSON.stringify(m, null, 1) + "\n");
console.log(`[aghdam] ${m.exterior.parts.length} exterior parts, ${m.walk?.elements.length ?? 0} walk elements, ${m.walk?.zones.length ?? 0} zones`);
