/* Kit parts for 19th-century Karabakh mosques (Aghdam Juma, Govhar Agha in Shusha):
   brick minaret with horizontal belts, octagonal stone pillar with a faceted capital,
   domed bay on a square plan (sail vault, optional broken crown), two-storey gallery with
   a balustrade, plus rubble and damaged-plaster patches for the ruin state.
   Walk-mode units: metres, y up. */
import * as THREE from "three";
import { Builder } from "./builder";
import { rnd } from "./textures";

/** cylindrical brick minaret: stone base drum, patterned shaft split by stone belts,
   balcony slab, open timber lantern on posts and a metal cap with a finial */
export function minaret(B: Builder, cx: number, cz: number, y0: number, o: {
  r: number; h: number; base?: { r: number; h: number }; belts?: number; taper?: number;
  lantern?: { h: number; r?: number }; brick?: string; belt?: string; stone?: string; wood?: string; cap?: string; broken?: boolean;
}) {
  const brick = o.brick ?? "minaretBrick", belt = o.belt ?? "c:#d8c8a6", stone = o.stone ?? "stone", wood = o.wood ?? "wood", cap = o.cap ?? "tin";
  let y = y0;
  if (o.base) {
    const g = new THREE.CylinderGeometry(o.base.r, o.base.r * 1.02, o.base.h, 24);
    g.translate(cx, y + o.base.h / 2, cz);
    B.add(g, stone);
    const lip = new THREE.CylinderGeometry(o.base.r + 0.08, o.base.r + 0.08, 0.18, 24);
    lip.translate(cx, y + o.base.h - 0.09, cz);
    B.add(lip, belt);
    y += o.base.h;
  }
  const n = Math.max(1, (o.belts ?? 3) + 1), seg = o.h / n, taper = o.taper ?? 0.1;
  const rAt = (t: number) => o.r * (1 - taper * t);
  for (let i = 0; i < n; i++) {
    const r0 = rAt(i / n), r1 = rAt((i + 1) / n);
    const g = new THREE.CylinderGeometry(r1, r0, seg, 24, 1, true);
    g.translate(cx, y + seg / 2, cz);
    B.add(g, brick);
    if (i < n - 1) {
      const b = new THREE.CylinderGeometry(r1 + 0.07, r1 + 0.07, 0.22, 24);
      b.translate(cx, y + seg, cz);
      B.add(b, belt);
    }
    y += seg;
  }
  const rt = rAt(1);
  // balcony slab and lantern
  const slab = new THREE.CylinderGeometry(rt + 0.35, rt + 0.1, 0.3, 8);
  slab.rotateY(Math.PI / 8);
  slab.translate(cx, y + 0.15, cz);
  B.add(slab, wood);
  y += 0.3;
  const L = o.lantern ?? { h: 2.2 };
  const lr = L.r ?? rt + 0.25;
  if (!o.broken) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const p = new THREE.BoxGeometry(0.12, L.h, 0.12);
      p.translate(cx + Math.cos(a) * lr, y + L.h / 2, cz + Math.sin(a) * lr);
      B.add(p, wood);
    }
    const rail = new THREE.CylinderGeometry(lr + 0.04, lr + 0.04, 0.5, 8, 1, true);
    rail.rotateY(Math.PI / 8);
    rail.translate(cx, y + 0.45, cz);
    B.add(rail, wood + "DS");
  }
  y += L.h;
  const eave = new THREE.CylinderGeometry(lr + 0.4, lr + 0.4, 0.18, 8);
  eave.rotateY(Math.PI / 8);
  eave.translate(cx, y + 0.09, cz);
  B.add(eave, cap);
  y += 0.18;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = (i / 10) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(0.001, (lr + 0.1) * Math.cos(t)), 1.5 * Math.pow(Math.sin(t), 0.8)));
  }
  const dome = new THREE.LatheGeometry(pts, 16);
  dome.translate(cx, y, cz);
  B.add(dome, cap);
  const fin = new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6);
  fin.translate(cx, y + 1.9, cz);
  B.add(fin, cap);
  const ball = new THREE.SphereGeometry(0.13, 10, 8);
  ball.translate(cx, y + 1.85, cz);
  B.add(ball, cap);
  return y + 2.4;
}

/** octagonal stone pillar with a stepped, faceted capital and base (Karabakh mosques) */
export function kColumn(B: Builder, cx: number, cz: number, y0: number, h: number, r: number, mat = "stone") {
  const oct = (rTop: number, rBot: number, hh: number, y: number) => {
    const g = new THREE.CylinderGeometry(rTop / Math.cos(Math.PI / 8), rBot / Math.cos(Math.PI / 8), hh, 8);
    g.rotateY(Math.PI / 8);
    g.translate(cx, y + hh / 2, cz);
    B.add(g, mat);
  };
  const bh = 0.5, ch = 0.7;
  oct(r * 1.05, r * 1.45, bh, y0);
  oct(r, r, h - bh - ch, y0 + bh);
  oct(r * 1.6, r, ch * 0.7, y0 + h - ch);
  oct(r * 1.65, r * 1.65, ch * 0.3, y0 + h - ch * 0.3);
}

/** sail vault over a rectangle: a sphere through the four corners, cut by the walls.
   `rise` scales the height; `hole` breaks the crown open (radius, metres) */
export function sailVault(B: Builder, x0: number, x1: number, z0: number, z1: number, ySpring: number, o: { rise?: number; hole?: number; mat?: string; n?: number; outside?: string; shell?: number } = {}) {
  const n = o.n ?? 18, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hw = (x1 - x0) / 2, hd = (z1 - z0) / 2;
  const R = Math.hypot(hw, hd), rise = o.rise ?? 1;
  // corners sit on the springing line; edge midpoints rise by half the other side; crown by R
  const yAt = (x: number, z: number, extra = 0) => ySpring + rise * Math.sqrt(Math.max(0, (R + extra) * (R + extra) - x * x - z * z));
  const build = (extra: number, mat: string, flip: boolean) => {
    const pos: number[] = [];
    const v = (i: number, j: number) => {
      const x = -hw + (2 * hw * i) / n, z = -hd + (2 * hd * j) / n;
      return [cx + x, yAt(x, z, extra), cz + z];
    };
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const mx = -hw + (2 * hw * (i + 0.5)) / n, mz = -hd + (2 * hd * (j + 0.5)) / n;
        if (o.hole && Math.hypot(mx, mz) < o.hole) continue;
        const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
        if (flip) pos.push(...a, ...c, ...b, ...a, ...d, ...c);
        else pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    B.add(g, mat);
  };
  build(0, o.mat ?? "limeDS", false);
  if (o.outside) build(o.shell ?? 0.35, o.outside, true);
}

/** gallery floor slab with a balustrade on the given edges ("n" = z0 side, "s" = z1, "w" = x0, "e" = x1) */
export function gallery(B: Builder, x0: number, x1: number, z0: number, z1: number, y: number, o: { th?: number; rail?: ("n" | "s" | "e" | "w")[]; railH?: number; railMat?: string; slabMat?: string; broken?: boolean; seed?: number } = {}) {
  const th = o.th ?? 0.35;
  const slab = new THREE.BoxGeometry(x1 - x0, th, z1 - z0);
  slab.translate((x0 + x1) / 2, y - th / 2, (z0 + z1) / 2);
  B.add(slab, o.slabMat ?? "stone");
  const rh = o.railH ?? 1.0, mat = o.railMat ?? "woodDark", r = rnd(o.seed ?? 5);
  for (const side of o.rail ?? []) {
    const [ax, az, bx, bz] = side === "n" ? [x0, z0, x1, z0] : side === "s" ? [x0, z1, x1, z1] : side === "w" ? [x0, z0, x0, z1] : [x1, z0, x1, z1];
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    const along = Math.abs(ux) > 0.5;
    if (!o.broken) {
      const top = new THREE.BoxGeometry(along ? L : 0.09, 0.08, along ? 0.09 : L);
      top.translate((ax + bx) / 2, y + rh, (az + bz) / 2);
      B.add(top, mat);
      const bot = new THREE.BoxGeometry(along ? L : 0.07, 0.06, along ? 0.07 : L);
      bot.translate((ax + bx) / 2, y + 0.08, (az + bz) / 2);
      B.add(bot, mat);
    }
    for (let t = 0.1; t < L; t += 0.16) {
      if (o.broken && r() < 0.8) continue;
      const hh = o.broken ? rh * (0.3 + r() * 0.5) : rh - 0.08;
      const b = new THREE.BoxGeometry(0.045, hh, 0.045);
      b.translate(ax + ux * t, y + 0.05 + hh / 2, az + uz * t);
      B.add(b, mat);
    }
  }
}

/** random fallen stones and debris on a floor rectangle */
export function rubble(B: Builder, x0: number, x1: number, z0: number, z1: number, y: number, n: number, o: { size?: [number, number]; seed?: number; mat?: string } = {}) {
  const r = rnd(o.seed ?? 11), [s0, s1] = o.size ?? [0.08, 0.45];
  for (let i = 0; i < n; i++) {
    const s = s0 + (s1 - s0) * Math.pow(r(), 2.2);
    const g = new THREE.BoxGeometry(s * (0.8 + r() * 0.6), s * (0.4 + r() * 0.4), s * (0.7 + r() * 0.6));
    g.rotateY(r() * Math.PI);
    g.rotateX((r() - 0.5) * 0.6);
    g.translate(x0 + r() * (x1 - x0), y + s * 0.15, z0 + r() * (z1 - z0));
    B.add(g, o.mat ?? "rubble");
  }
  // a dust layer, slightly lifted so it does not flicker with the floor
  const d = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  d.rotateX(-Math.PI / 2);
  d.translate((x0 + x1) / 2, y + 0.015, (z0 + z1) / 2);
  B.add(d, "dust");
}

/** patches of fallen plaster on a wall face (exposes the rubble stone behind) */
export function patches(B: Builder, ax: number, az: number, bx: number, bz: number, y0: number, h: number, n: number, o: { seed?: number; mat?: string; side?: 1 | -1 } = {}) {
  const r = rnd(o.seed ?? 21), L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
  // normal toward the room (left of a→b when looking down, matching wall()'s interior side)
  const nx = -uz * (o.side ?? 1), nz = ux * (o.side ?? 1);
  for (let i = 0; i < n; i++) {
    const w = 0.4 + r() * 1.6, hh = 0.3 + r() * 1.2, t = r() * (L - w) + w / 2, y = y0 + r() * (h - hh) + hh / 2;
    const g = new THREE.PlaneGeometry(w, hh);
    g.rotateY(Math.atan2(nx, nz));
    g.translate(ax + ux * t + nx * 0.03, y, az + uz * t + nz * 0.03);
    B.add(g, o.mat ?? "c:#a99574");
  }
}
