/* Solid things the guide must walk around even where the visitor's zones allow walking:
   furniture, columns, tables (boxes). Collected from manifest.walk.elements (with group frames)
   and inflated by the guide's body radius. Only things in body height count (floor slabs,
   carpets, hanging lamps don't). */
import type { El, Frame, Vec2 } from "../types";

export interface Blocker { test(x: number, z: number): boolean; y0: number; y1: number; /** xz bounds for a quick reject */ bb: [number, number, number, number] }

const D2R = Math.PI / 180;
const BODY = 0.28;

type Xf = (x: number, z: number) => Vec2;
const compose = (outer: Xf, f: Frame): Xf => (x, z) => {
  const c = Math.cos(f.rot * D2R), s = Math.sin(f.rot * D2R);
  return outer(f.pos[0] + x * c - z * s, f.pos[1] + x * s + z * c);
};

function circle(xf: Xf, cx: number, cz: number, r: number, y0: number, y1: number): Blocker {
  const [x0, z0] = xf(cx, cz), R = r + BODY;
  return { test: (x, z) => (x - x0) ** 2 + (z - z0) ** 2 < R * R, y0, y1, bb: [x0 - R, x0 + R, z0 - R, z0 + R] };
}

function poly(pts: Vec2[], y0: number, y1: number): Blocker {
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  return {
    y0, y1,
    bb: [Math.min(...xs) - BODY, Math.max(...xs) + BODY, Math.min(...zs) - BODY, Math.max(...zs) + BODY],
    test: (x, z) => {
      // inside, or within BODY of an edge
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, zi] = pts[i], [xj, zj] = pts[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
        const ex = xj - xi, ez = zj - zi, L2 = ex * ex + ez * ez || 1;
        const t = Math.max(0, Math.min(1, ((x - xi) * ex + (z - zi) * ez) / L2));
        if ((x - xi - t * ex) ** 2 + (z - zi - t * ez) ** 2 < BODY * BODY) return true;
      }
      return inside;
    },
  };
}

/** approximate footprint radius of furniture kinds that stand on the floor */
const FURN_R: Record<string, number> = { chest: 0.45, lectern: 0.35, minbar: 0.9, cannon: 0.8, brazier: 0.3, loom: 0.8, jug: 0.2, cypress: 0.45, tray: 0.3, pool: 0 };

export function collectBlockers(els: El[], era?: string): Blocker[] {
  const out: Blocker[] = [];
  const walk = (list: El[], xf: Xf) => {
    for (const e of list) {
      if (e.eras && era && !e.eras.includes(era)) continue;
      switch (e.t) {
        case "group": walk(e.children, compose(xf, e.frame)); break;
        case "box": {
          const [x0, y0, z0] = e.min, [x1, y1, z1] = e.max;
          if (y1 - y0 < 0.25) break;
          out.push(poly([xf(x0, z0), xf(x1, z0), xf(x1, z1), xf(x0, z1)], y0, y1));
          break;
        }
        case "column": out.push(circle(xf, e.c[0], e.c[1], e.r, e.y0, e.y0 + e.h)); break;
        case "kColumn": out.push(circle(xf, e.c[0], e.c[1], e.r, e.y0, e.y0 + e.h)); break;
        case "fountain": out.push(circle(xf, e.c[0], e.c[1], e.r, -1, 1)); break;
        case "well": out.push(circle(xf, e.c[0], e.c[1], e.r, e.y - 1, e.y + 1)); break;
        case "furniture": {
          const [x, y, z] = e.at;
          if (e.kind === "cenotaph" || e.kind === "bench") {
            const [w, h, d] = e.size, c = Math.cos((e.rotY ?? 0) * D2R), s = Math.sin((e.rotY ?? 0) * D2R);
            const corner = (u: number, v: number): Vec2 => xf(x + u * c + v * s, z - u * s + v * c);
            out.push(poly([corner(-w / 2, -d / 2), corner(w / 2, -d / 2), corner(w / 2, d / 2), corner(-w / 2, d / 2)], y, y + h));
          } else if (e.kind === "pool") out.push(circle(xf, x, z, e.r, y - 1, y + 1));
          else if (e.kind === "bush") out.push(circle(xf, x, z, e.r ?? 0.5, y, y + 1));
          else if (FURN_R[e.kind]) out.push(circle(xf, x, z, FURN_R[e.kind] * ("s" in e && typeof e.s === "number" ? Math.max(1, e.s / 0.3) : 1), y, y + 1.2));
          break;
        }
        default: break;
      }
    }
  };
  walk(els, (x, z) => [x, z]);
  return out;
}

/** does a blocker stand in body height above a floor at y? */
export function blocked(bs: Blocker[], x: number, z: number, y: number) {
  for (const b of bs) if (x > b.bb[0] && x < b.bb[1] && z > b.bb[2] && z < b.bb[3] && b.y1 > y + 0.3 && b.y0 < y + 1.7 && b.test(x, z)) return true;
  return false;
}
