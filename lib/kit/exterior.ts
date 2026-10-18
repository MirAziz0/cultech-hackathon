/* Exterior maquette from manifest.exterior.parts — TypeScript port of reference/scripts/build_model.py.
   Manifest coordinates follow the Python generator (x east, y north, z up, metres); they are converted
   to three.js Y-up here: (x, y, z) -> (x, z, -y). Angles ("facing") are degrees from +x toward +y.
   DOM-free on purpose: scripts/export-glb.ts runs this in Node to write GLBs for AR. */
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Era, ExteriorPart, ExteriorSpec, Vec3 } from "../types";

const D2R = Math.PI / 180;
const tp = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);

function rng(seed: number) {
  let s = seed;
  const next = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return { random: next, uniform: (a: number, b: number) => a + (b - a) * next() };
}

/** pointed arch outline, from build_model.arch_poly */
function archShape(w: number, hs: number, cRatio = 0.18, n = 10) {
  if (cRatio === 0) n = 14;
  const c = w * cRatio, r = w / 2 + c, top = hs + Math.sqrt(r * r - c * c);
  const left: [number, number][] = [];
  const a0 = Math.PI, a1 = Math.atan2(top - hs, 0 - c);
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    left.push([c + r * Math.cos(a), hs + r * Math.sin(a)]);
  }
  const right = left.map(([px, py]) => [-px, py] as [number, number]).reverse();
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  for (const [px, py] of [...left, ...right.slice(1)]) s.lineTo(px, py);
  s.lineTo(w / 2, 0);
  s.closePath();
  return s;
}

/** metres around a round body (from its own uv.x and radius, before it is moved), so textures wrap a tower
   without the seams of a planar projection */
function arcLength(g: THREE.CylinderGeometry | THREE.LatheGeometry) {
  const prm = g.parameters as { thetaStart?: number; thetaLength?: number; phiStart?: number; phiLength?: number };
  const a0 = prm.thetaStart ?? prm.phiStart ?? 0, len = prm.thetaLength ?? prm.phiLength ?? Math.PI * 2;
  const p = g.attributes.position, uv = g.attributes.uv, out = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) out[i] = (a0 + uv.getX(i) * len) * Math.hypot(p.getX(i), p.getZ(i));
  g.setAttribute("arc", new THREE.BufferAttribute(out, 1));
}

class ExtBuilder {
  buckets = new Map<string, THREE.BufferGeometry[]>();
  constructor(private resolve: (m: string) => string) {}
  add(g: THREE.BufferGeometry, mat: string) {
    const key = this.resolve(mat);
    const ng = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(ng.attributes)) if (name !== "position" && name !== "normal" && name !== "arc") ng.deleteAttribute(name);
    if (!ng.attributes.normal) ng.computeVertexNormals();
    // every geometry needs the same attributes to merge; NaN = "no arc length, project planar"
    if (!ng.attributes.arc) ng.setAttribute("arc", new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count).fill(NaN), 1));
    ng.clearGroups();
    (this.buckets.get(key) ?? this.buckets.set(key, []).get(key)!).push(ng);
  }
  /** box bottom-centred at (x,y,z) in build coords, rotated by `facing` about z */
  box(sx: number, sy: number, sz: number, x: number, y: number, z: number, mat: string, facing = 0) {
    const g = new THREE.BoxGeometry(sx, sz, sy);
    g.rotateY(facing * D2R);
    const p = tp(x, y, z + sz / 2);
    g.translate(p.x, p.y, p.z);
    this.add(g, mat);
  }
  /** arc = [startDeg, lengthDeg] from +x toward +y; three's theta runs from +z toward +x, so θ = angle + 90° */
  cyl(r: number, h: number, x: number, y: number, z: number, mat: string, sides = 16, r2?: number, arc?: [number, number]) {
    const g = arc ? new THREE.CylinderGeometry(r2 ?? r, r, h, sides, 1, false, (arc[0] + 90) * D2R, arc[1] * D2R) : new THREE.CylinderGeometry(r2 ?? r, r, h, sides);
    arcLength(g);
    const p = tp(x, y, z + h / 2);
    g.translate(p.x, p.y, p.z);
    this.add(g, mat);
  }
  lathe(pts: [number, number][], x: number, y: number, z: number, mat: string, sides: number, arc?: [number, number]) {
    const g = arc
      ? new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), sides, (arc[0] + 90) * D2R, arc[1] * D2R)
      : new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), sides);
    arcLength(g);
    const p = tp(x, y, z);
    g.translate(p.x, p.y, p.z);
    this.add(g, mat);
  }
  dome(r: number, h: number, x: number, y: number, z: number, mat: string, sides = 28, pointed = 0.18) {
    const pts: [number, number][] = [];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * (Math.PI / 2);
      pts.push([Math.max(0.0001, r * Math.cos(t)), h * Math.pow(Math.sin(t), 1 - pointed)]);
    }
    pts[pts.length - 1] = [0, h];
    this.lathe(pts, x, y, z, mat, sides);
  }
  /** dark pointed-arch plate standing on a facade, protruding `depth` outward */
  niche(w: number, hs: number, x: number, y: number, z: number, facing: number, mat: string, depth = 0.25, round = false) {
    const g = new THREE.ExtrudeGeometry(archShape(w, hs, round ? 0 : 0.18), { depth, bevelEnabled: false, curveSegments: 6 });
    g.rotateY((facing + 90) * D2R);
    const p = tp(x, y, z);
    g.translate(p.x, p.y, p.z);
    this.add(g, mat);
  }
  portal(w: number, h: number, x: number, y: number, z: number, facing: number, depth: number, stone: string, nicheMat: string) {
    const ca = Math.cos(facing * D2R), sa = Math.sin(facing * D2R);
    const g = new THREE.BoxGeometry(depth, h, w);
    g.rotateY(facing * D2R);
    let p = tp(x + (ca * depth) / 2, y + (sa * depth) / 2, z + h / 2);
    g.translate(p.x, p.y, p.z);
    this.add(g, stone);
    this.niche(w * 0.62, h * 0.55, x + ca * (depth + 0.02), y + sa * (depth + 0.02), z, facing, nicheMat, 0.3);
    const c = new THREE.BoxGeometry(depth + 0.3, 0.35, w + 0.3);
    c.rotateY(facing * D2R);
    p = tp(x + (ca * depth) / 2, y + (sa * depth) / 2, z + h + 0.17);
    c.translate(p.x, p.y, p.z);
    this.add(c, stone);
  }
  tree(x: number, y: number, z: number, s: number, kind: "round" | "cypress" = "round") {
    if (kind === "cypress") {
      this.cyl(0.18 * s, 0.6 * s, x, y, z, "trunk", 6);
      this.lathe([[0.0001, 0], [1.0 * s, 0.8 * s], [0.0001, 6.5 * s]], x, y, z + 0.5 * s, "tree", 8);
      return;
    }
    this.cyl(0.25 * s, 1.6 * s, x, y, z, "trunk", 6);
    const t = new THREE.IcosahedronGeometry(1.5 * s, 1);
    const p = tp(x, y, z + 2.6 * s);
    t.translate(p.x, p.y, p.z);
    this.add(t, "tree");
  }
}

/** flat-roofed town house: walls, a low parapet round an earthen roof, dark windows and a wooden door,
   on some a small rooftop room. Variation comes from the position, so it is stable across builds and eras. */
function house(b: ExtBuilder, sx: number, sy: number, h: number, x: number, y: number, z: number, wall?: string, flat = true) {
  const r = rng(Math.abs(Math.round(x * 73.1 + y * 19.7 + sx * 7)) % 2147483646 + 1);
  r.random();
  const w = wall ?? ["house", "house2", "house3"][Math.floor(r.random() * 3)];
  b.box(sx, sy, h, x, y, z, w);
  const t = 0.3, ph = 0.4, top = z + h;
  if (flat) {
    // parapet ring (0.3 m thick, 0.4 m high) and the earthen roof inside it
    b.box(sx, t, ph, x, y - sy / 2 + t / 2, top, w);
    b.box(sx, t, ph, x, y + sy / 2 - t / 2, top, w);
    b.box(t, sy - 2 * t, ph, x - sx / 2 + t / 2, y, top, w);
    b.box(t, sy - 2 * t, ph, x + sx / 2 - t / 2, y, top, w);
    b.box(sx - 2 * t, sy - 2 * t, 0.08, x, y, top, "houseRoof");
  }
  // windows on each facade, a door on one
  const door = Math.floor(r.random() * 4), wz = z + Math.min(h - 1.5, Math.max(1.2, h * 0.45));
  const faces: [number, number, number, number][] = [[sx, x, y - sy / 2, 0], [sx, x, y + sy / 2, 0], [sy, x - sx / 2, y, 1], [sy, x + sx / 2, y, 1]];
  faces.forEach(([len, fx, fy, side], i) => {
    const n = Math.max(1, Math.floor(len / 3.4)), d = 0.12;
    for (let k = 0; k < n; k++) {
      if (r.random() < 0.3) continue;
      const u = -len / 2 + (len * (k + 0.5)) / n;
      if (side === 0) b.box(0.8, d, 1.0, fx + u, fy, wz, "window");
      else b.box(d, 0.8, 1.0, fx, fy + u, wz, "window");
    }
    if (i === door) {
      const u = (r.random() - 0.5) * (len - 2.5);
      if (side === 0) b.box(1.1, d + 0.02, 2.0, fx + u, fy, z, "door");
      else b.box(d + 0.02, 1.1, 2.0, fx, fy + u, z, "door");
    }
  });
  // a rooftop room (bala-khana) on about a third of the houses
  if (flat && r.random() < 0.35 && sx > 7 && sy > 7) {
    const rx = sx * (0.32 + r.random() * 0.12), ry = sy * (0.32 + r.random() * 0.12), rh = 2.4;
    const cx = x + (r.random() < 0.5 ? -1 : 1) * (sx / 2 - t - rx / 2), cy = y + (r.random() < 0.5 ? -1 : 1) * (sy / 2 - t - ry / 2);
    b.box(rx, ry, rh, cx, cy, top, w);
    b.box(rx + 0.3, ry + 0.3, 0.15, cx, cy, top + rh, "houseRoof");
    b.box(0.8, 0.12, 0.9, cx, cy - ry / 2, top + 1.1, "window");
  }
}

function part(b: ExtBuilder, p: ExteriorPart, era: Era, r: ReturnType<typeof rng>) {
  const mat = p.matByEra?.[era] ?? p.mat;
  switch (p.t) {
    case "box": b.box(p.size[0], p.size[1], p.size[2], ...p.at, mat ?? "stone"); break;
    case "house": house(b, p.size[0], p.size[1], p.size[2], ...p.at, mat, p.flat ?? true); break;
    case "cyl": b.cyl(p.r, p.h, ...p.at, mat ?? "stone", p.sides ?? 16, p.r2, p.arc); break;
    case "dome": b.dome(p.r, p.h, ...p.at, mat ?? "dome", p.sides ?? 28, p.pointed ?? 0.18); break;
    case "tent": {
      b.lathe([[p.r, 0], [0.0001, p.h]], ...p.at, mat ?? "dome", p.sides ?? 8, p.arc);
      // underside, so the eaves are not see-through from below
      b.lathe([[0.0001, 0.001], [p.r, 0]], ...p.at, mat ?? "dome", p.sides ?? 8, p.arc);
      break;
    }
    case "niche": b.niche(p.w, p.spring, ...p.at, p.facing, mat ?? "niche", p.depth ?? 0.25, p.round); break;
    case "portal": b.portal(p.w, p.h, ...p.at, p.facing, p.depth ?? 1, mat ?? "stone", p.nicheMat ?? "niche"); break;
    case "windowRow":
      for (let i = 0; i < p.n; i++) {
        const t = p.from + ((p.to - p.from) * (i + 0.5)) / p.n;
        const [x, y] = p.along === "x" ? [t, p.at[1]] : [p.at[0], t];
        b.niche(p.w ?? 1.1, p.spring ?? 1.4, x, y, p.z, p.facing, mat ?? "window", 0.15, p.round);
      }
      break;
    case "tree": b.tree(...p.at, p.s ?? 1, p.kind); break;
    case "steps": {
      const len = Math.hypot(...p.dir), dx = p.dir[0] / len, dy = p.dir[1] / len, facing = Math.atan2(dy, dx) / D2R;
      for (let k = 0; k < p.n; k++) {
        const h = p.z0 + ((p.z1 - p.z0) * (p.n - k)) / p.n;
        b.box(p.run, p.width, h, p.from[0] + dx * p.run * k, p.from[1] + dy * p.run * k, 0, mat ?? "path", facing);
      }
      break;
    }
    case "wallLoop": {
      const pts = p.closed === false ? p.pts : [...p.pts, p.pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
        const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.floor(L / 4)), facing = Math.atan2(y1 - y0, x1 - x0) / D2R;
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, xm = x0 + (x1 - x0) * t, ym = y0 + (y1 - y0) * t;
          let h = p.h;
          if (p.ruined && r.random() < p.ruined) h = r.uniform(p.h * 0.2, p.h * 0.62);
          b.box((L / n) * 0.98, p.th, h, xm, ym, 0, mat ?? "stone", facing);
          if (p.merlons && h === p.h && k % 2 === 0) b.box((L / n) * 0.4, p.th, 0.8, xm, ym, h, mat ?? "stone", facing);
        }
      }
      if (p.towers) for (const [x, y] of p.pts) b.cyl(p.towers.r, p.towers.h, x, y, 0, mat ?? "stone", 16);
      break;
    }
    case "rooms": {
      const [bx, by, bz] = p.at, h = p.h ?? 3.6;
      for (const [dx, dy, s] of p.rooms) {
        if (p.mode === "domed") {
          b.box(s, s, h, bx + dx, by + dy, bz, mat ?? "stone");
          b.cyl(s * 0.36, 0.5, bx + dx, by + dy, bz + h, mat ?? "stone", 12);
          b.dome(s * 0.36, s * 0.35, bx + dx, by + dy, bz + h + 0.5, p.domeMat ?? "dome", 16, 0.15);
        } else {
          for (let side = 0; side < 4; side++)
            for (let i = 0; i < 4; i++) {
              const hh = r.random() > 0.2 ? r.uniform(0.3, 2.2) : 0;
              if (!hh) continue;
              const seg = s / 4, t = -s / 2 + seg * (i + 0.5);
              if (side === 0) b.box(seg * 0.95, 0.6, hh, bx + dx + t, by + dy - s / 2, bz, mat ?? "stone_old");
              if (side === 1) b.box(seg * 0.95, 0.6, hh, bx + dx + t, by + dy + s / 2, bz, mat ?? "stone_old");
              if (side === 2) b.box(0.6, seg * 0.95, hh, bx + dx - s / 2, by + dy + t, bz, mat ?? "stone_old");
              if (side === 3) b.box(0.6, seg * 0.95, hh, bx + dx + s / 2, by + dy + t, bz, mat ?? "stone_old");
            }
        }
      }
      break;
    }
    case "scatter":
      for (let i = 0; i < p.n; i++) {
        const s = r.uniform(p.size[0], p.size[1]);
        b.box(s, s * 0.8, s * 0.5, p.at[0] + r.uniform(-p.area[0], p.area[0]), p.at[1] + r.uniform(-p.area[1], p.area[1]), p.at[2], mat ?? "stone_old");
      }
      break;
    case "tube": {
      const sh = new THREE.Shape();
      sh.absarc(0, 0, p.r, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, p.r - p.th, 0, Math.PI * 2, true);
      sh.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(sh, { depth: p.h, bevelEnabled: false, curveSegments: p.sides ?? 32 });
      g.rotateX(-Math.PI / 2);
      const c = tp(p.at[0], p.at[1], p.at[2]);
      g.translate(c.x, c.y, c.z);
      b.add(g, mat ?? "stone");
      break;
    }
    case "prism": {
      const sh = new THREE.Shape(p.pts.map(([x, y]) => new THREE.Vector2(x, y)));
      const g = new THREE.ExtrudeGeometry(sh, { depth: p.h, bevelEnabled: false });
      // shape XY == build XY; extrude along +z(build) then convert: rotate so build-z → three-y
      g.rotateX(-Math.PI / 2);
      g.translate(0, p.z, 0);
      b.add(g, mat ?? "stone");
      break;
    }
    case "water": b.box(p.size[0], p.size[1], 0.25, ...p.at, mat ?? "water"); break;
    case "minaret": {
      const [x, y, z0] = p.at;
      let z = z0;
      if (p.base) { b.cyl(p.base.r, p.base.h, x, y, z, mat ?? "stone", 20); z += p.base.h; }
      // patterned shaft: alternating thin rings in two brick tones, stone belts between bands
      const [ma, mb] = p.brickMats ?? ["brick", "brick2"];
      const bands = (p.belts ?? 3) + 1, seg = p.h / bands, rings = 6;
      for (let i = 0; i < bands; i++) {
        for (let k = 0; k < rings; k++) {
          const t = (i * rings + k) / (bands * rings), r = p.r * (1 - 0.1 * t);
          b.cyl(r, seg / rings, x, y, z + (seg * k) / rings, k % 2 ? mb : ma, 18, p.r * (1 - 0.1 * (t + 1 / (bands * rings))));
        }
        z += seg;
        if (i < bands - 1) b.cyl(p.r * (1 - 0.1 * ((i + 1) / bands)) + 0.08, 0.25, x, y, z - 0.12, "belt", 18);
      }
      const rt = p.r * 0.9, lh = p.lantern ?? 2.2;
      b.cyl(rt + 0.35, 0.3, x, y, z, "lantern", 8);
      z += 0.3;
      if (!p.noLantern) for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        b.box(0.14, 0.14, lh, x + Math.cos(a) * (rt + 0.2), y + Math.sin(a) * (rt + 0.2), z, "lantern");
      }
      z += lh;
      b.cyl(rt + 0.6, 0.2, x, y, z, "cap", 8);
      b.dome(rt + 0.3, 1.6, x, y, z + 0.2, "cap", 16, 0.2);
      b.cyl(0.05, 0.9, x, y, z + 1.7, "cap", 6);
      break;
    }
    case "hipRoof": {
      const [cx, cy, cz] = p.at, [sx, sy] = p.size, h = p.h;
      const long = sx >= sy, half = (long ? sy : sx) / 2, rl = Math.max(0, (long ? sx : sy) / 2 - half);
      // corners (build coords) and ridge ends
      const c = [[-sx / 2, -sy / 2], [sx / 2, -sy / 2], [sx / 2, sy / 2], [-sx / 2, sy / 2]].map(([u, v]) => tp(cx + u, cy + v, cz));
      const r0 = long ? tp(cx - rl, cy, cz + h) : tp(cx, cy - rl, cz + h), r1 = long ? tp(cx + rl, cy, cz + h) : tp(cx, cy + rl, cz + h);
      const tri: THREE.Vector3[] = long
        ? [c[0], c[1], r1, c[0], r1, r0, c[1], c[2], r1, c[2], c[3], r0, c[2], r0, r1, c[3], c[0], r0]
        : [c[1], c[2], r1, c[1], r1, r0, c[2], c[3], r1, c[3], c[0], r0, c[3], r0, r1, c[0], c[1], r0];
      // both windings: the exterior materials are single-sided
      for (const pts of [tri, [...tri].reverse()]) {
        const g = new THREE.BufferGeometry().setFromPoints(pts);
        g.computeVertexNormals();
        b.add(g, mat ?? "roof");
      }
      break;
    }
    case "gableRoof": {
      const [cx, cy, cz] = p.at, [sx, sy] = p.size, h = p.h, alongX = p.axis === "x";
      const L = (alongX ? sx : sy) / 2, W = (alongX ? sy : sx) / 2;
      // local (u along the ridge, v across) → build coords
      const P = (u: number, v: number, z: number) => (alongX ? tp(cx + u, cy + v, cz + z) : tp(cx + v, cy + u, cz + z));
      const slopes = [P(-L, -W, 0), P(L, -W, 0), P(L, 0, h), P(-L, -W, 0), P(L, 0, h), P(-L, 0, h),
        P(L, W, 0), P(-L, W, 0), P(-L, 0, h), P(L, W, 0), P(-L, 0, h), P(L, 0, h)];
      const ends = [P(-L, -W, 0), P(-L, 0, h), P(-L, W, 0), P(L, W, 0), P(L, 0, h), P(L, -W, 0)];
      for (const [pts, m] of [[slopes, mat ?? "roof"], [ends, p.gableMat ?? "stone"]] as [THREE.Vector3[], string][])
        for (const set of [pts, [...pts].reverse()]) {
          const g = new THREE.BufferGeometry().setFromPoints(set);
          g.computeVertexNormals();
          b.add(g, m);
        }
      break;
    }
    case "bush": {
      const s = p.s ?? 1;
      const t = new THREE.IcosahedronGeometry(1.1 * s, 0);
      t.scale(1, 0.7, 1);
      const q = tp(p.at[0], p.at[1], p.at[2] + 0.6 * s);
      t.translate(q.x, q.y, q.z);
      b.add(t, mat ?? "tree");
      break;
    }
  }
}

/** planar world UVs (metres / size) by the dominant normal axis, as in the walk kit */
function planarUV(geo: THREE.BufferGeometry, size: number) {
  const p = geo.attributes.position, n = geo.attributes.normal, arc = geo.attributes.arc, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const top = ay >= ax && ay >= az, a = arc?.getX(i) ?? NaN;
    // round walls wrap by arc length; flat walls and roofs are projected on their dominant axis
    const [u, v] = top ? [p.getX(i), p.getZ(i)] : !Number.isNaN(a) ? [a, p.getY(i)] : ax >= az ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)];
    uv[i * 2] = u / size;
    uv[i * 2 + 1] = v / size;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

const DEFAULT_PALETTE: Record<string, [number, number, number]> = {
  base: [92, 66, 48], ground: [196, 178, 140], terrace: [184, 164, 126], stone: [214, 192, 150], stone_rs: [230, 211, 168],
  stone_old: [176, 156, 120], dome: [205, 184, 140], niche: [92, 72, 52], window: [70, 56, 42], water: [58, 143, 160],
  tree: [94, 122, 58], trunk: [110, 84, 58], tile: [40, 128, 140], path: [222, 206, 172],
  brick: [158, 92, 64], brick2: [214, 196, 168], belt: [222, 208, 180], lantern: [104, 76, 52], cap: [176, 182, 186], roof: [176, 182, 186],
};

/** build one era of the maquette; returns a Group already scaled & converted to Y-up */
export function buildExterior(spec: ExteriorSpec & { eraMat?: Partial<Record<Era, Record<string, string>>> }, era: Era,
  opts: { /** photo texture loader (browser only); without it every surface keeps its flat palette colour */ texture?: (name: string, color: boolean) => THREE.Texture } = {}): THREE.Group {
  const palette = { ...DEFAULT_PALETTE, ...spec.palette };
  const alias = spec.eraMat?.[era] ?? {};
  const b = new ExtBuilder((m) => alias[m] ?? m);
  const r = rng(spec.seed ?? 7);
  for (const p of spec.parts) if (!p.eras || p.eras.includes(era)) part(b, p, era, r);

  const group = new THREE.Group();
  group.name = `exterior-${era}`;
  for (const [key, geos] of b.buckets) {
    const flat = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!flat) continue;
    const tx = opts.texture ? spec.textures?.[key] : undefined;
    if (tx) planarUV(flat, tx.size); // in metres, before the maquette scale
    flat.deleteAttribute("arc");
    // weld identical vertices back into an indexed mesh (≈4× smaller GLBs)
    const merged = mergeVertices(flat);
    flat.dispose();
    merged.scale(spec.scale, spec.scale, spec.scale);
    merged.computeBoundingSphere();
    const c = palette[key] ?? [200, 200, 200];
    if (tx && opts.texture) {
      const t = tx.tint ?? [255, 255, 255];
      const mat = new THREE.MeshStandardMaterial({
        name: key, roughness: 0.9, metalness: 0,
        color: new THREE.Color(t[0] / 255, t[1] / 255, t[2] / 255),
        map: opts.texture(`${tx.tex}_diff`, true), normalMap: opts.texture(`${tx.tex}_nor`, false), normalScale: new THREE.Vector2(0.7, 0.7),
      });
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = key;
      mesh.castShadow = key !== "base" && key !== "ground";
      mesh.receiveShadow = true;
      group.add(mesh);
      continue;
    }
    const mat = new THREE.MeshStandardMaterial({
      name: key,
      // the Python generator wrote palette/255 into glTF linear baseColorFactor; keep that for parity
      color: new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.LinearSRGBColorSpace),
      roughness: key === "water" ? 0.35 : 0.92,
      metalness: 0,
      flatShading: key === "tree" || key.startsWith("tree") || key === "bush",
    });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = key;
    mesh.castShadow = key !== "base" && key !== "ground";
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** label anchor (build coords → maquette world) */
export function anchor(spec: ExteriorSpec, pos: Vec3) {
  return tp(pos[0], pos[1], pos[2]).multiplyScalar(spec.scale);
}
