/* Look-around interiors from manifest.interiors (generalised from reference/interior.js:
   octagonal or rectangular hall, niches/doors/windows, inscription band, squinches,
   muqarnas, dome, furniture). Orbit camera stands in the centre. */
import * as THREE from "three";
import type { InteriorSpec } from "../types";
import { Builder, D2R } from "./builder";
import { archPts, dome, furniture, muqarnas } from "./elements";

function archShape(w: number, hs: number) {
  const { pts } = archPts(-w / 2, w / 2, hs, 10);
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2, hs);
  for (const [x, y] of pts) s.lineTo(x, y);
  s.lineTo(w / 2, 0);
  s.closePath();
  return s;
}

/** arched recess at wall point (x,z) facing the room centre */
function niche(B: Builder, w: number, hs: number, x: number, z: number, y: number, rotY: number, mat: string, frameMat?: string) {
  const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
  B.add(new THREE.ExtrudeGeometry(archShape(w, hs), { depth: 0.04, bevelEnabled: false, curveSegments: 10 }), mat, m);
  if (frameMat) {
    const f = new THREE.ExtrudeGeometry(archShape(w + 0.36, hs + 0.1), { depth: 0.02, bevelEnabled: false, curveSegments: 10 });
    f.translate(0, -0.1, -0.01);
    B.add(f, frameMat, m.clone());
  }
}

export function buildInterior(spec: InteriorSpec) {
  const B = new Builder();
  const H = spec.h;
  const wall = "stoneDS", fl = "floor";
  let R = 0, W = 0, D = 0;
  if (spec.shape === "oct") {
    R = spec.size as number;
    const walls = new THREE.CylinderGeometry(R, R, H, 8, 1, true);
    walls.rotateY(Math.PI / 8);
    walls.translate(0, H / 2, 0);
    B.add(walls, wall);
    const f = new THREE.CircleGeometry(R, 8);
    f.rotateX(-Math.PI / 2);
    f.rotateY(Math.PI / 8);
    B.add(f, fl);
  } else {
    [W, D] = spec.size as [number, number];
    for (const [w, x, z, ry] of [[W, 0, -D / 2, 0], [W, 0, D / 2, Math.PI], [D, -W / 2, 0, Math.PI / 2], [D, W / 2, 0, -Math.PI / 2]] as const) {
      const p = new THREE.PlaneGeometry(w, H);
      p.rotateY(ry);
      p.translate(x, H / 2, z);
      B.add(p, wall);
    }
    const f = new THREE.PlaneGeometry(W, D);
    f.rotateX(-Math.PI / 2);
    B.add(f, fl);
    // ceiling with a round opening for the dome
    const sh = new THREE.Shape();
    sh.moveTo(-W / 2, -D / 2); sh.lineTo(W / 2, -D / 2); sh.lineTo(W / 2, D / 2); sh.lineTo(-W / 2, D / 2); sh.closePath();
    if (spec.dome) { const hole = new THREE.Path(); hole.absarc(0, 0, spec.dome.r, 0, Math.PI * 2, false); sh.holes.push(hole); }
    const c = new THREE.ShapeGeometry(sh, 48);
    c.rotateX(Math.PI / 2);
    c.translate(0, H, 0);
    B.add(c, wall);
  }

  // openings: side index (oct) or n/e/s/w (rect)
  for (const o of spec.openings ?? []) {
    let x = 0, z = 0, ry = 0;
    if (spec.shape === "oct") {
      const k = typeof o.side === "number" ? o.side : { e: 0, s: 2, w: 4, n: 6 }[o.side];
      const a = k * 45 * D2R, ap = R * Math.cos(Math.PI / 8) - 0.03;
      x = Math.cos(a) * ap; z = Math.sin(a) * ap; ry = -a - Math.PI / 2;
    } else {
      const side = typeof o.side === "number" ? (["e", "s", "w", "n"] as const)[o.side % 4] : o.side;
      const off = o.offset ?? 0;
      if (side === "n") { x = off; z = -D / 2 + 0.02; ry = 0; }
      if (side === "s") { x = off; z = D / 2 - 0.02; ry = Math.PI; }
      if (side === "w") { x = -W / 2 + 0.02; z = off; ry = Math.PI / 2; }
      if (side === "e") { x = W / 2 - 0.02; z = off; ry = -Math.PI / 2; }
    }
    const mat = o.kind === "niche" ? "niche" : "daylight";
    niche(B, o.w, o.h, x, z, o.sill ?? 0, ry, mat, "mq0");
  }

  const ringR = spec.shape === "oct" ? R : (W / 2) * Math.SQRT2;
  if (spec.band) {
    const n = spec.shape === "oct" ? 8 : 4;
    const g = new THREE.CylinderGeometry(ringR - 0.02, ringR - 0.02, 0.45, n, 1, true);
    g.rotateY(Math.PI / n);
    if (spec.shape === "rect") g.scale(1, 1, D / W);
    g.translate(0, H - 0.45, 0);
    B.add(g, "band");
  }
  if (spec.squinches && spec.shape === "rect") {
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const s = new THREE.ConeGeometry(1.3, 1.5, 4, 1, true);
      s.rotateX(Math.PI);
      s.translate(Math.cos(a) * (W / 2) * 0.88, H - 0.3, Math.sin(a) * (D / 2) * 0.88);
      B.add(s, "c:#d8c39aDS");
    }
  }
  if (spec.dome) {
    const d = spec.dome;
    let y = H;
    if (d.drum) {
      const drum = new THREE.CylinderGeometry(d.r, d.r + 0.25, d.drum, 16, 1, true);
      drum.translate(0, H + d.drum / 2, 0);
      B.add(drum, wall);
      if (d.muqarnas) muqarnas(B, 0, 0, d.r - 0.2, H + 0.1, 3, 16);
      y = H + d.drum;
    }
    dome(B, 0, 0, d.r, y, d.sy, wall);
    if (d.skylights) furniture(B, { kind: "skylights", at: [0, y, 0], r: d.r, n: 10 });
  }
  if (spec.mirrors) {
    // Hall of Mirrors style: mirror-mosaic vault and panels between niches
    const g = new THREE.SphereGeometry((spec.dome?.r ?? 3) - 0.04, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(1, spec.dome?.sy ?? 1, 1);
    g.translate(0, H + (spec.dome?.drum ?? 0), 0);
    B.add(g, "mirror");
  }
  for (const f of spec.furniture ?? []) furniture(B, f);
  const L = spec.light ?? {};
  B.light(0, L.y ?? 3.2, 0, L.intensity ?? 1.2, 25, new THREE.Color(L.color ?? "#ffd7a0").getHex());

  const group = B.finish();
  group.add(new THREE.HemisphereLight(0xfff1dc, 0x5a4632, 0.55 * Math.PI));
  for (const l of B.lights) {
    const p = new THREE.PointLight(l.color, l.intensity * Math.PI, l.distance, 1.6);
    p.position.copy(l.pos);
    group.add(p);
  }
  return { group, eye: spec.eye ?? 1.6, reach: spec.reach ?? Math.max(2.4, (R || Math.min(W, D) / 2) * 0.72) };
}
