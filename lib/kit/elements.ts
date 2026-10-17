/* Architecture kit: builds manifest walk elements (lib/types.ts El) into a Builder.
   Generalised from reference/walk.js (wall with pointed-arch openings, octagonal halls, vaults,
   domes, muqarnas, shebeke windows, stairs, furniture). Units: metres, y up. */
import * as THREE from "three";
import type { El, Furniture, Op, Frame } from "../types";
import { Builder, D2R } from "./builder";
import { gallery, kColumn, minaret, patches, rubble, sailVault } from "./karabakh";

/* ---------------- arches ---------------- */
/** pointed (two-centred) arch between a and b springing at yS; from reference archPts */
export function archPts(a: number, b: number, yS: number, n = 10) {
  const w = b - a, m = (a + b) / 2, c = w * 0.16, r = w / 2 + c, rise = Math.sqrt(r * r - c * c), pts: [number, number][] = [];
  const aR = Math.atan2(rise, c);
  for (let i = 0; i <= n; i++) { const t = (aR * i) / n; pts.push([m - c + r * Math.cos(t), yS + r * Math.sin(t)]); }
  const aL = Math.atan2(rise, -c);
  for (let i = 1; i <= n; i++) { const t = aL + ((Math.PI - aL) * i) / n; pts.push([m + c + r * Math.cos(t), yS + r * Math.sin(t)]); }
  return { pts, apex: yS + rise };
}

export function frameMatrix(f: Frame) {
  return new THREE.Matrix4().makeRotationY(-f.rot * D2R).setPosition(f.pos[0], 0, f.pos[1]);
}

/* ---------------- walls ---------------- */
/** wall from (x1,z1) to (x2,z2); interior on local +z. Openings are cut as pointed arches.
   Openings that overlap along the wall are stacked (e.g. lower and upper windows of a two-storey hall). */
export function wall(B: Builder, x1: number, z1: number, x2: number, z2: number, y0: number, h: number, th: number, ops: Op[] = [], mat = "stone") {
  const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz), ang = Math.atan2(dz, dx);
  const m4 = new THREE.Matrix4().makeRotationY(-ang).setPosition(x1, 0, z1);
  const piece = (u0: number, u1: number, ya: number, yb: number) => {
    if (u1 - u0 < 0.001 || yb - ya < 0.001) return;
    const g = new THREE.BoxGeometry(u1 - u0, yb - ya, th);
    g.translate((u0 + u1) / 2, (ya + yb) / 2, 0);
    B.add(g, mat, m4);
  };
  // group openings into columns of overlapping u-ranges
  const cols: { a: number; b: number; ops: Op[] }[] = [];
  for (const op of ops.slice().sort((p, q) => p.u - p.w / 2 - (q.u - q.w / 2))) {
    const a = op.u - op.w / 2, b = op.u + op.w / 2, last = cols[cols.length - 1];
    if (last && a < last.b - 0.001) { last.ops.push(op); last.b = Math.max(last.b, b); }
    else cols.push({ a, b, ops: [op] });
  }
  let cur = 0;
  for (const col of cols) {
    piece(cur, col.a, y0, y0 + h);
    const stack = col.ops.sort((p, q) => p.sill - q.sill);
    let prevTop = y0;
    stack.forEach((op, k) => {
      const a = op.u - op.w / 2, b = op.u + op.w / 2, ys = y0 + op.sill + op.spring;
      const { pts, apex } = archPts(a, b, ys);
      const next = stack[k + 1];
      const top = next ? Math.max(apex + 0.15, y0 + next.sill) : Math.max(y0 + h, apex + 0.15);
      // solid below the opening, and beside it if the column is wider than this opening
      piece(col.a, col.b, prevTop, y0 + op.sill);
      piece(col.a, a, y0 + op.sill, top);
      piece(b, col.b, y0 + op.sill, top);
      const s = new THREE.Shape();
      s.moveTo(a, ys); s.lineTo(a, top); s.lineTo(b, top);
      for (const [px, py] of pts) s.lineTo(px, py);
      const eg = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: false, curveSegments: 4 });
      eg.translate(0, 0, -th / 2);
      B.add(eg, mat, m4);
      // reveal (jamb) faces are part of the extrusion; add a thin sill board for windows
      if (op.kind === "window" || op.kind === "niche") {
        const hs = new THREE.Shape();
        hs.moveTo(a, y0 + op.sill); hs.lineTo(b, y0 + op.sill);
        for (const [px, py] of pts) hs.lineTo(px, py);
        hs.lineTo(a, y0 + op.sill);
        const sg = new THREE.ShapeGeometry(hs, 8);
        if (op.kind === "niche") {
          sg.translate(0, 0, (op.back || -1) * (th / 2 - 0.03));
          B.add(sg, mat === "stone" ? "stoneDS" : mat + (mat.endsWith("DS") ? "" : "DS"), m4);
        } else {
          const fill = op.fill ?? "shebeke";
          if (fill !== "open") B.add(sg, fill === "glass" ? "daylight" : fill === "mirror" ? "mirror" : fill, m4);
        }
      }
      prevTop = top;
    });
    cur = col.b;
  }
  piece(cur, L, y0, y0 + h);
}

const DEFAULT_OP: Op = { u: 0, w: 1.2, sill: 0, spring: 2.2, kind: "door" };

/** regular n-gon of walls around (cx,cz); face k is centred at angle rot + k*360/n (x toward z) */
export function ngonWalls(B: Builder, cx: number, cz: number, apothem: number, n: number, th: number, y0: number, h: number, faces: (Partial<Op> | null)[] = [], rot = 0, mat = "stone") {
  const half = 180 / n;
  const rc = (apothem + th / 2) / Math.cos(half * D2R);
  for (let k = 0; k < n; k++) {
    const p0 = (rot + k * (360 / n) - half) * D2R, p1 = (rot + k * (360 / n) + half) * D2R;
    const x1 = cx + rc * Math.cos(p0), z1 = cz + rc * Math.sin(p0), x2 = cx + rc * Math.cos(p1), z2 = cz + rc * Math.sin(p1);
    const L = Math.hypot(x2 - x1, z2 - z1), f = faces[k];
    wall(B, x1, z1, x2, z2, y0, h, th, f ? [{ ...DEFAULT_OP, u: L / 2, ...f } as Op] : [], mat);
  }
}

/** barrel vault (half cylinder) with end lunettes; from reference vault() */
export function vault(B: Builder, x0: number, x1: number, z0: number, z1: number, ySpring: number, axis: "x" | "z", scaleY = 1, mat = "stoneDS") {
  const len = axis === "x" ? x1 - x0 : z1 - z0, r = (axis === "x" ? z1 - z0 : x1 - x0) / 2;
  const g = new THREE.CylinderGeometry(r, r, len, 28, 1, true, 0, Math.PI);
  g.rotateZ(Math.PI / 2);
  g.scale(1, scaleY, 1);
  if (axis === "z") g.rotateY(Math.PI / 2);
  g.translate((x0 + x1) / 2, ySpring, (z0 + z1) / 2);
  B.add(g, mat);
  const lun = (x: number, z: number, ry: number) => {
    const c = new THREE.CircleGeometry(r, 24, 0, Math.PI);
    c.scale(1, scaleY, 1);
    c.rotateY(ry);
    c.translate(x, ySpring, z);
    B.add(c, mat);
  };
  if (axis === "x") { lun(x0, (z0 + z1) / 2, Math.PI / 2); lun(x1, (z0 + z1) / 2, Math.PI / 2); }
  else { lun((x0 + x1) / 2, z0, 0); lun((x0 + x1) / 2, z1, 0); }
}

export function dome(B: Builder, cx: number, cz: number, r: number, y: number, sy = 1, mat = "stoneDS", hole = 0) {
  const t0 = hole > 0 ? Math.asin(Math.min(0.99, hole / r)) : 0;
  const g = new THREE.SphereGeometry(r, 32, 14, 0, Math.PI * 2, t0, Math.PI / 2 - t0);
  g.scale(1, sy, 1);
  g.translate(cx, y, cz);
  B.add(g, mat);
}

export function octRing(B: Builder, cx: number, cz: number, a: number, y0: number, h: number, mat: string, n = 8) {
  const R = a / Math.cos(Math.PI / n);
  const g = new THREE.CylinderGeometry(R, R, h, n, 1, true);
  g.rotateY(Math.PI / n);
  g.translate(cx, y0 + h / 2, cz);
  B.add(g, mat);
}

export function ringCap(B: Builder, cx: number, cz: number, r0: number, r1: number, y: number, mat = "stoneDS", n = 32) {
  const c = new THREE.RingGeometry(r0, r1, n);
  c.rotateX(Math.PI / 2);
  c.translate(cx, y, cz);
  B.add(c, mat);
}

/** stepped muqarnas-like tiers of cells facing the centre (reference muqarnas) */
export function muqarnas(B: Builder, cx: number, cz: number, R: number, y: number, tiers = 3, n = 16) {
  for (let tier = 0; tier < tiers; tier++) {
    const r = R - tier * 0.2, cnt = n + tier * 8;
    for (let i = 0; i < cnt; i++) {
      const a = (i / cnt) * Math.PI * 2 + tier * 0.13;
      const g = new THREE.BoxGeometry(0.36, 0.24, 0.28);
      // concave cell face: a small half-cylinder scoop reads as muqarnas under AO
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
      m.setPosition(cx + Math.cos(a) * r, y + tier * 0.24, cz + Math.sin(a) * r);
      B.add(g, tier % 2 ? "mq1" : "mq0", m);
    }
  }
}

/* ---------------- stairs ---------------- */
/** spiral steps around (cx,cz) (reference NW stair "5"); angles in degrees, x toward z */
export function spiralSteps(B: Builder, cx: number, cz: number, rIn: number, rOut: number, y0: number, rise: number, steps: number, a0: number, stepDeg: number, depth = 0.42, mat = "floor") {
  for (let i = 0; i < steps; i++) {
    const a = (a0 + i * stepDeg) * D2R, st = new THREE.BoxGeometry(rOut - rIn, 0.18, depth);
    st.translate((rIn + rOut) / 2, 0, 0);
    st.rotateY(-a);
    st.translate(cx, y0 + i * rise, cz);
    B.add(st, mat);
  }
}

/** straight flight: step k occupies [k*run,(k+1)*run] along dir, solid to y0 */
export function stair(B: Builder, fx: number, fz: number, dx: number, dz: number, width: number, steps: number, rise: number, run: number, y0: number, mat = "floor") {
  const ang = Math.atan2(dz, dx);
  const m4 = new THREE.Matrix4().makeRotationY(-ang).setPosition(fx, 0, fz);
  for (let k = 0; k < steps; k++) {
    const top = y0 + (k + 1) * rise, bottom = Math.min(y0, top - 0.25);
    const g = new THREE.BoxGeometry(run, top - bottom, width);
    g.translate(k * run + run / 2, (top + bottom) / 2, 0);
    B.add(g, mat, m4.clone());
  }
}

/** stair running around the inside of a ring wall (Maiden Tower); steps are wedges */
export function ringStair(B: Builder, cx: number, cz: number, r0: number, r1: number, y0: number, a0: number, turnDeg: number, steps: number, rise: number, mat = "floorGrey") {
  const step = turnDeg / steps;
  for (let k = 0; k < steps; k++) {
    const aa = (a0 + k * step) * D2R, ab = (a0 + (k + 1) * step) * D2R;
    const top = y0 + (k + 1) * rise;
    const sh = new THREE.Shape();
    sh.moveTo(r0 * Math.cos(aa), r0 * Math.sin(aa));
    sh.lineTo(r1 * Math.cos(aa), r1 * Math.sin(aa));
    sh.lineTo(r1 * Math.cos(ab), r1 * Math.sin(ab));
    sh.lineTo(r0 * Math.cos(ab), r0 * Math.sin(ab));
    sh.closePath();
    const hgt = Math.min(top - y0 + 0.01, 0.6);
    const g = new THREE.ExtrudeGeometry(sh, { depth: hgt, bevelEnabled: false });
    // shape is in XY, extrude along Z → rotate so XY→XZ and extrusion goes down from `top`
    g.rotateX(Math.PI / 2);
    g.translate(cx, top, cz);
    B.add(g, mat);
  }
}

/* ---------------- furniture ---------------- */
const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function furniture(B: Builder, f: Furniture) {
  const [x, y, z] = f.at;
  switch (f.kind) {
    case "carpet": {
      const g = new THREE.PlaneGeometry(f.size[0], f.size[1]);
      g.rotateX(-Math.PI / 2);
      g.rotateY((f.rotY ?? 0) * D2R);
      g.translate(x, y + 0.012, z);
      B.add(g, `carpet${(f.pattern ?? 0) % 3}`);
      break;
    }
    case "cushion": {
      const m = new THREE.Matrix4().makeRotationY((f.rotY ?? 0) * D2R).setPosition(x, y + 0.01, z);
      const g = new THREE.BoxGeometry(f.len, 0.18, 0.7);
      g.translate(0, 0.09, 0);
      B.add(g, "c:" + f.color, m);
      const b = new THREE.CylinderGeometry(0.16, 0.16, f.len, 12);
      b.rotateZ(Math.PI / 2);
      b.translate(0, 0.32, -0.27);
      B.add(b, "c:" + f.color, m.clone());
      break;
    }
    case "jug": {
      const pts = [[0, 0], [0.32, 0], [0.42, 0.15], [0.48, 0.45], [0.38, 0.75], [0.18, 0.9], [0.15, 1.12], [0.22, 1.2]].map(([a, b]) => new THREE.Vector2(a * f.s, b * f.s));
      const g = new THREE.LatheGeometry(pts, 18);
      g.translate(x, y, z);
      B.add(g, "cs:" + f.color);
      break;
    }
    case "lamp": {
      const c = new THREE.CylinderGeometry(0.01, 0.01, 1.2, 4);
      c.translate(x, y + 0.6, z);
      B.add(c, "dark");
      const bowl = new THREE.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      bowl.translate(x, y, z);
      B.add(bowl, "copper");
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2, fl = new THREE.SphereGeometry(0.035, 8, 6);
        fl.translate(x + Math.cos(a) * 0.14, y + 0.02, z + Math.sin(a) * 0.14);
        B.add(fl, "glow");
      }
      if (f.light) B.light(x, y - 0.2, z, f.light, f.distance ?? 9);
      break;
    }
    case "chest": {
      const g = new THREE.BoxGeometry(0.9, 0.5, 0.5);
      g.rotateY((f.rotY ?? 0) * D2R);
      g.translate(x, y + 0.25, z);
      B.add(g, "wood");
      const lid = new THREE.BoxGeometry(0.94, 0.06, 0.54);
      lid.rotateY((f.rotY ?? 0) * D2R);
      lid.translate(x, y + 0.53, z);
      B.add(lid, "woodDark");
      break;
    }
    case "tray": {
      const t = new THREE.CylinderGeometry(0.45, 0.45, 0.04, 24); t.translate(x, y + 0.32, z); B.add(t, "copper");
      const l = new THREE.CylinderGeometry(0.25, 0.3, 0.3, 12); l.translate(x, y + 0.15, z); B.add(l, "wood");
      furniture(B, { kind: "jug", at: [x - 0.15, y + 0.34, z - 0.05], s: 0.16, color: "#b87333" });
      furniture(B, { kind: "jug", at: [x + 0.2, y + 0.34, z + 0.1], s: 0.1, color: "#2f7d78" });
      break;
    }
    case "lectern": {
      const m = new THREE.Matrix4().makeRotationY((f.rotY ?? 0) * D2R).setPosition(x, y, z);
      const st = new THREE.BoxGeometry(0.5, 0.35, 0.35); st.translate(0, 0.17, 0); B.add(st, "wood", m);
      const bk = new THREE.BoxGeometry(0.34, 0.05, 0.26); bk.rotateZ(0.25); bk.translate(0, 0.37, 0); B.add(bk, "c:#7a2f22", m.clone());
      break;
    }
    case "loom": {
      // vertical carpet loom with a half-woven carpet (reference R2)
      const m = new THREE.Matrix4().makeRotationY((f.rotY ?? 0) * D2R).setPosition(x, y, z);
      for (const dz of [-0.9, 0.9]) { const p = new THREE.BoxGeometry(0.12, 2.2, 0.12); p.translate(0, 1.1, dz); B.add(p, "wood", m.clone()); }
      for (const yy of [0.35, 2.1]) { const b = new THREE.CylinderGeometry(0.05, 0.05, 2.0, 8); b.rotateX(Math.PI / 2); b.translate(0, yy, 0); B.add(b, "wood", m.clone()); }
      const woven = new THREE.PlaneGeometry(1.7, 0.9); woven.rotateY(Math.PI / 2); woven.translate(0.02, 0.82, 0); B.add(woven, "carpet0", m.clone());
      for (let i = 0; i < 28; i++) { const s = new THREE.BoxGeometry(0.004, 0.85, 0.006); s.translate(0.02, 1.7, -0.84 + i * 0.062); B.add(s, "c:#eee2c8", m.clone()); }
      ["#a33a2b", "#1c2a4a", "#d9a441", "#2f7d78"].forEach((c, i) => { const b = new THREE.SphereGeometry(0.11, 10, 8); b.translate(0.6, 0.11, -0.5 + i * 0.3); B.add(b, "c:" + c, m.clone()); });
      break;
    }
    case "cypress": {
      const h = f.h ?? 5.5, g = new THREE.ConeGeometry(0.55 * (h / 5.5), h, 10);
      g.translate(x, y + h / 2, z);
      B.add(g, "cypress");
      break;
    }
    case "bush": {
      const g = new THREE.SphereGeometry(f.r ?? 0.45, 10, 8);
      g.translate(x, y + (f.r ?? 0.45) * 0.78, z);
      B.add(g, "plant");
      break;
    }
    case "cenotaph": {
      const [sx, sy, sz] = f.size, m = new THREE.Matrix4().makeRotationY((f.rotY ?? 0) * D2R).setPosition(x, y, z);
      const c = new THREE.BoxGeometry(sx, sy, sz); c.translate(0, sy / 2, 0); B.add(c, "c:#cdb791", m);
      const top = new THREE.CylinderGeometry(0.01, sx * 0.52, 0.28, 4, 1); top.rotateY(Math.PI / 4); top.scale(1, 1, sz / sx); top.translate(0, sy + 0.14, 0);
      B.add(top, "c:#cdb791", m.clone());
      break;
    }
    case "mihrab": {
      const w = f.w ?? 1.5, m = new THREE.Matrix4().makeRotationY((f.rotY ?? 0) * D2R).setPosition(x, y, z);
      // archPts runs from the right springing over the apex to the left one
      const { pts } = archPts(-w / 2, w / 2, 2.2);
      const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); for (const [px, py] of pts) s.lineTo(px, py); s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false }); B.add(g, "c:#8c7556", m);
      const fr = new THREE.Shape(); const W = w + 0.36; const { pts: p2 } = archPts(-W / 2, W / 2, 2.3); fr.moveTo(-W / 2, 0); fr.lineTo(W / 2, 0); for (const [px, py] of p2) fr.lineTo(px, py); fr.closePath();
      const fg = new THREE.ExtrudeGeometry(fr, { depth: 0.03, bevelEnabled: false }); fg.translate(0, -0.1, -0.02); B.add(fg, "tile", m.clone());
      for (let i = 0; i < 4; i++) { const st = new THREE.BoxGeometry(1.3 - i * 0.28, 0.16, 0.25); st.translate(0, 2.25 + i * 0.16 + 0.6, 0.12); B.add(st, "mq0", m.clone()); }
      break;
    }
    case "minbar": {
      const n = f.steps ?? 6, m = new THREE.Matrix4().makeRotationY((f.rotY ?? 0) * D2R).setPosition(x, y, z);
      for (let i = 0; i < n; i++) { const st = new THREE.BoxGeometry(0.9, 0.25 * (i + 1), 0.4); st.translate(0, 0.125 * (i + 1), -i * 0.4); B.add(st, "wood", m.clone()); }
      break;
    }
    case "lampRing": {
      const t = new THREE.TorusGeometry(f.r, 0.03, 6, 32); t.rotateX(Math.PI / 2); t.translate(x, y, z); B.add(t, "gold");
      const n = f.n ?? 12;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, l = new THREE.SphereGeometry(0.07, 8, 6); l.translate(x + Math.cos(a) * f.r, y - 0.08, z + Math.sin(a) * f.r); B.add(l, "glow"); }
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2, c = new THREE.CylinderGeometry(0.008, 0.008, 2, 3); c.rotateZ(Math.atan2(f.r, 2) * (i ? 1 : 1)); c.translate(x + Math.cos(a) * f.r * 0.5, y + 1, z + Math.sin(a) * f.r * 0.5); B.add(c, "dark"); }
      break;
    }
    case "bench": {
      const [sx, sy, sz] = f.size, g = new THREE.BoxGeometry(sx, sy, sz);
      g.rotateY((f.rotY ?? 0) * D2R); g.translate(x, y + sy / 2, z); B.add(g, "mq0");
      break;
    }
    case "cannon": {
      const m = new THREE.Matrix4().makeRotationY((f.rotY ?? 0) * D2R).setPosition(x, y, z);
      const barrel = new THREE.CylinderGeometry(0.12, 0.18, 1.8, 12); barrel.rotateZ(Math.PI / 2 - 0.08); barrel.translate(0.3, 0.55, 0); B.add(barrel, "iron", m);
      for (const dz of [-0.28, 0.28]) { const w = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 14); w.rotateX(Math.PI / 2); w.translate(-0.1, 0.32, dz); B.add(w, "woodDark", m.clone()); }
      const c = new THREE.BoxGeometry(1.0, 0.25, 0.4); c.translate(-0.1, 0.42, 0); B.add(c, "wood", m.clone());
      break;
    }
    case "pool": {
      const n = f.sides ?? 8;
      const rim = new THREE.CylinderGeometry(f.r, f.r * 1.04, 0.35, n); rim.rotateY(Math.PI / n); rim.translate(x, y + 0.17, z); B.add(rim, "mq0");
      const w = new THREE.CylinderGeometry(f.r * 0.88, f.r * 0.88, 0.02, n); w.rotateY(Math.PI / n); w.translate(x, y + 0.33, z); B.add(w, "water");
      break;
    }
    case "skylights": {
      const n = f.n ?? 10;
      for (let k = 0; k < 2; k++)
        for (let i = 0; i < (k ? Math.ceil(n * 0.6) : n); i++) {
          const cnt = k ? Math.ceil(n * 0.6) : n, a = (i / cnt) * Math.PI * 2 + k * 0.3, phi = k ? 0.45 : 0.85;
          const sx = Math.sin(phi) * f.r * 0.97, sy = Math.cos(phi) * f.r * 0.82;
          const s = new THREE.CircleGeometry(0.12, 5);
          const m = new THREE.Matrix4().lookAt(P(Math.cos(a) * sx, sy, Math.sin(a) * sx), P(0, -f.r, 0), P(0, 1, 0));
          m.setPosition(x + Math.cos(a) * sx, y + sy, z + Math.sin(a) * sx);
          B.add(s, "daylight", m);
        }
      break;
    }
    case "brazier": {
      const b = new THREE.CylinderGeometry(0.3, 0.18, 0.35, 12); b.translate(x, y + 0.5, z); B.add(b, "copper");
      const l = new THREE.CylinderGeometry(0.04, 0.04, 0.35, 6); l.translate(x, y + 0.17, z); B.add(l, "iron");
      const e = new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); e.translate(x, y + 0.62, z); B.add(e, "glow");
      B.light(x, y + 1, z, 0.6, 6, 0xff9a50);
      break;
    }
  }
}

/* ---------------- element dispatcher ---------------- */
export function buildEl(B: Builder, e: El) {
  const mat = e.mat;
  switch (e.t) {
    case "group":
      B.push(frameMatrix(e.frame));
      e.children.forEach((c) => buildEl(B, c));
      B.pop();
      break;
    case "floor": {
      const [x0, x1, z0, z1] = e.rect;
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      g.rotateX(-Math.PI / 2);
      g.translate((x0 + x1) / 2, e.y, (z0 + z1) / 2);
      B.add(g, mat ?? "floor");
      break;
    }
    case "quad": {
      const [a, b, c, d] = e.pts;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
      g.computeVertexNormals();
      B.add(g, mat ?? "earthDS");
      break;
    }
    case "terrain": {
      const [x0, x1, z0, z1] = e.rect;
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      g.rotateX(-Math.PI / 2);
      g.translate((x0 + x1) / 2, e.y, (z0 + z1) / 2);
      B.add(g, mat ?? (e.color ? "c:" + e.color : "ground"));
      break;
    }
    case "disc": {
      const n = e.sides ?? 32;
      // arc is given from +x toward +z; Ring/Circle angles run the other way after rotateX(-90°)
      const [ts, tl] = e.arc ? [-(e.arc[0] + e.arc[1]) * D2R, e.arc[1] * D2R] : [0, Math.PI * 2];
      const g = e.hole ? new THREE.RingGeometry(e.hole, e.r, n, 1, ts, tl) : new THREE.CircleGeometry(e.r, n, ts, tl);
      g.rotateX(-Math.PI / 2);
      if (n <= 16 && !e.arc) g.rotateY(Math.PI / n);
      g.translate(e.c[0], e.y, e.c[1]);
      B.add(g, mat ?? "floor");
      break;
    }
    case "box": {
      const [x0, y0, z0] = e.min, [x1, y1, z1] = e.max;
      const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
      g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      B.add(g, mat ?? "stone");
      break;
    }
    case "wall":
      wall(B, e.from[0], e.from[1], e.to[0], e.to[1], e.y0, e.h, e.th, e.ops ?? [], mat ?? "stone");
      break;
    case "octWalls":
      ngonWalls(B, e.c[0], e.c[1], e.a, 8, e.th, e.y0, e.h, e.faces, 0, mat ?? "stone");
      break;
    case "ngonWalls":
      ngonWalls(B, e.c[0], e.c[1], e.r, e.n, e.th, e.y0, e.h, e.faces ?? [], e.rot ?? 0, mat ?? "stone");
      break;
    case "room": {
      const [x0, x1] = e.x, [z0, z1] = e.z, t = e.th / 2, ops = e.ops ?? {}, m = mat ?? "stone";
      wall(B, x0 - t, z0 - t, x1 + t, z0 - t, e.y0, e.h, e.th, ops.n ?? [], m);
      wall(B, x1 + t, z0 - t, x1 + t, z1 + t, e.y0, e.h, e.th, ops.e ?? [], m);
      wall(B, x1 + t, z1 + t, x0 - t, z1 + t, e.y0, e.h, e.th, ops.s ?? [], m);
      wall(B, x0 - t, z1 + t, x0 - t, z0 - t, e.y0, e.h, e.th, ops.w ?? [], m);
      const v = e.vault ?? "x";
      if (v === "x" || v === "z") vault(B, x0 - t, x1 + t, z0 - t, z1 + t, e.y0 + e.h, v, e.vaultScale ?? 0.85, e.ceilingMat ?? (m === "stone" ? "stoneDS" : m + "DS"));
      else if (v === "flat") {
        const g = new THREE.PlaneGeometry(x1 - x0 + e.th, z1 - z0 + e.th);
        g.rotateX(Math.PI / 2);
        g.translate((x0 + x1) / 2, e.y0 + e.h, (z0 + z1) / 2);
        B.add(g, e.ceilingMat ?? "plaster");
      }
      break;
    }
    case "vault":
      vault(B, e.x[0], e.x[1], e.z[0], e.z[1], e.y, e.axis, e.scaleY ?? 1, mat ?? "stoneDS");
      break;
    case "dome":
      dome(B, e.c[0], e.c[1], e.r, e.y, e.sy ?? 1, mat ?? "stoneDS", e.hole ?? 0);
      break;
    case "octRing":
      octRing(B, e.c[0], e.c[1], e.a, e.y0, e.h, mat ?? "stoneDS", e.n ?? 8);
      break;
    case "ringCap":
      ringCap(B, e.c[0], e.c[1], e.r0, e.r1, e.y, mat ?? "stoneDS", e.n ?? 32);
      break;
    case "muqarnas":
      muqarnas(B, e.c[0], e.c[1], e.r, e.y, e.tiers ?? 3, e.n ?? 16);
      break;
    case "drumLights": {
      for (let k = 0; k < e.n; k++) {
        const a = (22.5 + (k * 360) / e.n) * D2R, g = new THREE.CircleGeometry(0.18, 12);
        g.rotateY(-a + Math.PI / 2);
        g.translate(e.c[0] + Math.cos(a) * e.r, e.y, e.c[1] + Math.sin(a) * e.r);
        B.add(g, mat ?? "shebeke");
      }
      break;
    }
    case "cylWall": {
      const n = e.sides ?? 24, th = e.th ?? 0;
      if (th > 0) {
        // thick ring wall (towers): extruded annulus
        const sh = new THREE.Shape();
        sh.absarc(0, 0, e.r + th, 0, Math.PI * 2, false);
        const hole = new THREE.Path();
        hole.absarc(0, 0, e.r, 0, Math.PI * 2, true);
        sh.holes.push(hole);
        const g = new THREE.ExtrudeGeometry(sh, { depth: e.h, bevelEnabled: false, curveSegments: n });
        g.rotateX(-Math.PI / 2);
        g.translate(e.c[0], e.y0, e.c[1]);
        B.add(g, mat ?? "stone");
      } else {
        const [s, len] = e.arc ? [e.arc[0] * D2R, e.arc[1] * D2R] : [0, Math.PI * 2];
        const g = new THREE.CylinderGeometry(e.r, e.r, e.h, n, 1, true, s, len);
        g.translate(e.c[0], e.y0 + e.h / 2, e.c[1]);
        B.add(g, mat ?? "stoneDS");
      }
      break;
    }
    case "column": {
      const g = new THREE.CylinderGeometry(e.r, e.r * 1.08, e.h, e.sides ?? 10);
      g.translate(e.c[0], e.y0 + e.h / 2, e.c[1]);
      B.add(g, mat ?? "stone");
      if (e.capital) {
        for (let k = 0; k < 3; k++) {
          const c = new THREE.CylinderGeometry(e.r * (1.3 + k * 0.35), e.r * (1.0 + k * 0.35), 0.16, e.sides ?? 10);
          c.translate(e.c[0], e.y0 + e.h - 0.5 + k * 0.17, e.c[1]);
          B.add(c, mat ?? "stone");
        }
        const b = new THREE.CylinderGeometry(e.r * 1.4, e.r * 1.6, 0.22, e.sides ?? 10);
        b.translate(e.c[0], e.y0 + 0.11, e.c[1]);
        B.add(b, mat ?? "stone");
      }
      break;
    }
    case "spiralStair": {
      const rise = (e.y1 - e.y0) / e.steps;
      if (e.shell) buildEl(B, { t: "cylWall", c: e.c, r: e.r + 0.05, y0: e.y0 - 0.6, h: e.y1 - e.y0 + 2.4, arc: [80, 290] });
      if (e.column) buildEl(B, { t: "column", c: e.c, r: e.column, y0: e.y0 - 0.6, h: e.y1 - e.y0 + 2.4 });
      spiralSteps(B, e.c[0], e.c[1], e.column ?? 0.15, e.r, e.y0, rise, e.steps, e.a0, e.turnDeg / e.steps, 0.42, mat ?? "floor");
      if (e.dome) dome(B, e.c[0], e.c[1], e.r + 0.05, e.y1 + 1.8, 0.7);
      break;
    }
    case "stair":
      stair(B, e.from[0], e.from[1], e.dir[0], e.dir[1], e.width, e.steps, e.rise, e.run, e.y0, mat ?? "floor");
      break;
    case "ringStair":
      ringStair(B, e.c[0], e.c[1], e.r0, e.r1, e.y0, e.a0, e.turnDeg, e.steps, e.rise, mat ?? "floorGrey");
      break;
    case "band": {
      const n = e.n ?? 8, R = e.r / Math.cos(Math.PI / n);
      const g = new THREE.CylinderGeometry(R, R, e.h, n, 1, true);
      g.rotateY(Math.PI / n);
      g.translate(e.c[0], e.y + e.h / 2, e.c[1]);
      B.add(g, mat ?? "band");
      break;
    }
    case "plane": {
      const g = new THREE.PlaneGeometry(e.size[0], e.size[1]);
      if (e.rotX) g.rotateX(e.rotX * D2R);
      if (e.rotY) g.rotateY(e.rotY * D2R);
      g.translate(...e.at);
      B.add(g, mat ?? "band");
      break;
    }
    case "fountain": {
      const n = e.n ?? 8;
      const b = new THREE.CylinderGeometry(e.r, e.r * 1.07, 0.45, n); b.translate(e.c[0], 0.225, e.c[1]); B.add(b, mat ?? "c:#d8c39a");
      const w = new THREE.CylinderGeometry(e.r * 0.9, e.r * 0.9, 0.04, n); w.translate(e.c[0], 0.44, e.c[1]); B.add(w, "water");
      break;
    }
    case "pool": {
      const [x0, x1, z0, z1] = e.rect;
      const rim = 0.3;
      for (const [a, b, c, d] of [[x0 - rim, x1 + rim, z0 - rim, z0], [x0 - rim, x1 + rim, z1, z1 + rim], [x0 - rim, x0, z0, z1], [x1, x1 + rim, z0, z1]])
        buildEl(B, { t: "box", min: [a, e.y, c], max: [b, e.y + 0.25, d], mat: "mq0" });
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      g.rotateX(-Math.PI / 2);
      g.translate((x0 + x1) / 2, e.y + 0.12, (z0 + z1) / 2);
      B.add(g, "water");
      break;
    }
    case "well": {
      // open shaft with a low parapet; the shaft walls go `depth` down and end in dark water
      const sh = new THREE.CylinderGeometry(e.r, e.r, e.depth, 20, 1, true);
      sh.translate(e.c[0], e.y - e.depth / 2, e.c[1]);
      B.add(sh, mat ?? "stoneGreyDS");
      const bottom = new THREE.CircleGeometry(e.r, 20); bottom.rotateX(-Math.PI / 2); bottom.translate(e.c[0], e.y - e.depth + 0.5, e.c[1]); B.add(bottom, "c:#16302f");
      const par = new THREE.Shape(); par.absarc(0, 0, e.r + 0.25, 0, Math.PI * 2, false); const hole = new THREE.Path(); hole.absarc(0, 0, e.r, 0, Math.PI * 2, true); par.holes.push(hole);
      const pg = new THREE.ExtrudeGeometry(par, { depth: 0.75, bevelEnabled: false, curveSegments: 20 }); pg.rotateX(-Math.PI / 2); pg.translate(e.c[0], e.y, e.c[1]); B.add(pg, mat ?? "stoneGrey");
      break;
    }
    case "relief": {
      const g = new THREE.BoxGeometry(e.size[0], e.size[1], 0.06);
      g.rotateY(e.rotY * D2R);
      g.translate(...e.at);
      B.add(g, mat ?? (e.pattern === "kufic" ? "reliefKufic" : e.pattern === "rosette" ? "reliefRosette" : "relief"));
      break;
    }
    case "mirrorWall": {
      const dx = e.to[0] - e.from[0], dz = e.to[1] - e.from[1], L = Math.hypot(dx, dz), ang = Math.atan2(dz, dx);
      const m4 = new THREE.Matrix4().makeRotationY(-ang).setPosition(e.from[0], 0, e.from[1]);
      const [cu, cv] = e.cells ?? [Math.max(1, Math.round(L / 1.1)), 1];
      const cw = L / cu, chh = e.h / cv;
      for (let i = 0; i < cu; i++)
        for (let j = 0; j < cv; j++) {
          // recessed pointed-arch mirror panel framed by gilded strip
          const a = i * cw + 0.12, b = (i + 1) * cw - 0.12, y0 = e.y0 + j * chh + 0.1, sp = y0 + chh * 0.62;
          const { pts } = archPts(a, b, sp, 8);
          // archPts runs from the right springing (b) to the left (a)
          const s = new THREE.Shape(); s.moveTo(a, y0); s.lineTo(b, y0); for (const [px, py] of pts) s.lineTo(px, py); s.closePath();
          const g = new THREE.ShapeGeometry(s, 6); g.translate(0, 0, 0.02); B.add(g, mat ?? "mirror", m4.clone());
          const fr = new THREE.BoxGeometry(cw, 0.06, 0.05); fr.translate(i * cw + cw / 2, y0 - 0.07, 0.03); B.add(fr, "gold", m4.clone());
        }
      break;
    }
    case "painting": {
      const g = new THREE.PlaneGeometry(e.size[0], e.size[1]);
      g.rotateY(e.rotY * D2R);
      g.translate(...e.at);
      B.add(g, e.motif === "hunt" ? "paintHunt" : e.motif === "portrait" ? "paintPortrait" : "paintFloral");
      const fr = new THREE.BoxGeometry(e.size[0] + 0.12, e.size[1] + 0.12, 0.03);
      fr.translate(0, 0, -0.025);
      fr.rotateY(e.rotY * D2R);
      fr.translate(...e.at);
      B.add(fr, "gold");
      break;
    }
    case "light":
      B.light(e.at[0], e.at[1], e.at[2], e.intensity ?? 1, e.distance ?? 10, e.color ? new THREE.Color(e.color).getHex() : 0xffcf96);
      break;
    case "shaft": {
      // fake volumetric light shaft: two crossed additive quads from window to floor
      const a = new THREE.Vector3(...e.at), b = new THREE.Vector3(...e.to), mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
      const dir = b.clone().sub(a).normalize();
      for (const k of [0, 1]) {
        const g = new THREE.PlaneGeometry(e.w, len);
        g.rotateY((k * Math.PI) / 2);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
        g.applyQuaternion(q);
        g.translate(mid.x, mid.y, mid.z);
        B.add(g, "shaft");
      }
      // dust motes drifting in the beam (animated by WalkWorld.update)
      const n = 40, pos = new Float32Array(n * 3), seed = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = Math.random();
        pos[i * 3] = a.x + (b.x - a.x) * t + (Math.random() - 0.5) * e.w * 0.6;
        pos[i * 3 + 1] = a.y + (b.y - a.y) * t + (Math.random() - 0.5) * 0.4;
        pos[i * 3 + 2] = a.z + (b.z - a.z) * t + (Math.random() - 0.5) * e.w * 0.6;
        seed[i] = Math.random() * 100;
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xfff1d0, size: 0.025, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
      const base = pos.slice();
      pts.userData.update = (time: number) => {
        for (let i = 0; i < n; i++) {
          const s = seed[i];
          pos[i * 3] = base[i * 3] + Math.sin(time * 0.21 + s) * 0.12;
          pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(time * 0.13 + s * 1.7) * 0.18;
          pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(time * 0.17 + s) * 0.12;
        }
        pg.attributes.position.needsUpdate = true;
      };
      B.extra(pts);
      break;
    }
    case "furniture":
      furniture(B, e as Furniture);
      break;
    case "minaret":
      minaret(B, e.c[0], e.c[1], e.y0, e);
      break;
    case "kColumn":
      kColumn(B, e.c[0], e.c[1], e.y0, e.h, e.r, mat ?? "stone");
      break;
    case "sailVault":
      sailVault(B, e.x[0], e.x[1], e.z[0], e.z[1], e.y, { rise: e.rise, hole: e.hole, mat: mat ?? "limeDS", outside: e.outside, shell: e.shell });
      break;
    case "gallery":
      gallery(B, e.x[0], e.x[1], e.z[0], e.z[1], e.y, { th: e.th, rail: e.rail, railH: e.railH, railMat: e.railMat, slabMat: mat, broken: e.broken, seed: e.seed });
      break;
    case "rubble":
      rubble(B, ...e.rect, e.y, e.n, { size: e.size, seed: e.seed, mat });
      break;
    case "patches":
      patches(B, e.from[0], e.from[1], e.to[0], e.to[1], e.y0, e.h, e.n, { seed: e.seed, mat, side: e.side });
      break;
  }
}
