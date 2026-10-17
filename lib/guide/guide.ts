/* The guide in the scene: owns the avatar body and moves it with the nav grid.
   Modes:
   - follow: stays ~1.5–2 m from the visitor, beside and slightly ahead, never in the middle of the
     view, never parked in narrow passages (doorways, stairs) unless there is no other place;
   - lead: walks to a point (a tour stop) at a pace that waits for the visitor;
   - hold: stands still (presenting at a stop) and turns to whatever he is told to face.
   The tour logic (lib/guide/tour.ts) drives lead/hold; this file only does bodies and paths. */
import * as THREE from "three";
import type { ZoneMap } from "../walk/zones";
import type { GuideAvatar } from "./avatar/types";
import { NavGrid, type P3 } from "./nav";

export interface Visitor { x: number; z: number; floor: number; yaw: number }
type Mode = "follow" | "lead" | "hold";

const TAU = Math.PI * 2;
const wrap = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const d3 = (a: P3, b: P3) => Math.hypot(a.x - b.x, (a.y - b.y) * 1.5, a.z - b.z);
const d2 = (a: P3, b: P3) => Math.hypot(a.x - b.x, a.z - b.z);

export class Guide {
  nav: NavGrid;
  pos: P3 = { x: 0, y: 0, z: 0 };
  heading = 0;
  mode: Mode = "follow";
  /** set by the speech layer: face the visitor and look at the camera */
  talking = false;
  /** visible on the minimap: the next tour stop */
  marker: P3 | null = null;
  /** true while walking along a path */
  get moving() { return this.path.length > 0; }

  private path: P3[] = [];
  private speed = 0;
  private turnRate = 0;
  private turning = false;
  private onArrive: (() => void) | null = null;
  private followTimer = 0;
  private lastVisitor: P3 = { x: 0, y: 0, z: 0 };
  private faceTarget: THREE.Vector3 | null = null;
  private lookTarget: THREE.Vector3 | null = null;
  private waitWave = 0;
  private visitor: Visitor = { x: 0, z: 0, floor: 0, yaw: 0 };
  private camPos = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor(private map: ZoneMap, public avatar: GuideAvatar, nav?: NavGrid) {
    this.nav = nav ?? new NavGrid(map);
  }

  /** rebuild the nav grid (e.g. other furniture in another era) */
  setNav(nav: NavGrid) {
    this.nav = nav;
    this.path = [];
  }

  get visitorPos(): P3 { return { x: this.visitor.x, y: this.visitor.floor, z: this.visitor.z }; }
  distToVisitor() { return d3(this.pos, this.visitorPos); }

  /** appear next to the visitor, facing them */
  spawn(v: Visitor) {
    this.visitor = { ...v };
    const f = { x: -Math.sin(v.yaw), z: -Math.cos(v.yaw) }, r = { x: Math.cos(v.yaw), z: -Math.sin(v.yaw) };
    const tries: [number, number][] = [[2.2, 0.9], [2.2, -0.9], [2.0, 1.4], [1.8, 0], [1.6, 1.2], [1.2, -1.2], [-1.5, 1]];
    let n = -1;
    for (const [fw, rt] of tries) {
      n = this.nav.nearest({ x: v.x + f.x * fw + r.x * rt, y: v.floor, z: v.z + f.z * fw + r.z * rt }, 0.6, 0.35, 0.6);
      if (n >= 0 && d2(this.nav.pos(n), this.visitorPos) > 1) break;
    }
    if (n < 0) n = this.nav.nearest(this.visitorPos, 4);
    if (n >= 0) this.pos = this.nav.pos(n);
    this.heading = Math.atan2(v.x - this.pos.x, v.z - this.pos.z);
    this.path = [];
    this.mode = "follow";
    this.lastVisitor = this.visitorPos;
    this.followTimer = 2.5; // let him greet before he starts moving
    this.place();
  }

  /** walk to a point, leading the visitor; onArrive fires once there */
  lead(to: P3, onArrive?: () => void) {
    this.mode = "lead";
    this.faceTarget = null;
    const p = this.nav.path(this.pos, to);
    if (!p) { // unreachable from here (e.g. after a level jump): appear there out of sight
      const n = this.nav.nearest(to, 2);
      if (n >= 0) this.pos = this.nav.pos(n);
      this.path = [];
      onArrive?.();
      return;
    }
    this.path = p;
    this.onArrive = onArrive ?? null;
  }

  /** stand still; optionally turn the body toward a point */
  hold(face?: THREE.Vector3 | P3 | null) {
    this.mode = "hold";
    this.path = [];
    this.onArrive = null;
    this.faceTarget = face ? new THREE.Vector3(face.x, face.y, face.z) : null;
  }

  follow() {
    this.mode = "follow";
    this.faceTarget = null;
    this.onArrive = null;
    this.followTimer = 0;
  }

  /** head look target (null = the visitor's camera when close, else ahead) */
  look(p: THREE.Vector3 | P3 | null) {
    this.lookTarget = p ? new THREE.Vector3(p.x, p.y, p.z) : null;
  }

  /** teleport somewhere near the visitor where he can't be seen popping in */
  private appearNear(v: Visitor) {
    const vp = this.visitorPos;
    for (const clear of [0.45, 0.2])
      for (const ang of [Math.PI, Math.PI * 0.8, -Math.PI * 0.8, Math.PI * 0.6, -Math.PI * 0.6]) {
        const yaw = v.yaw + ang;
        const n = this.nav.nearest({ x: v.x - Math.sin(yaw) * 1.8, y: v.floor, z: v.z - Math.cos(yaw) * 1.8 }, 0.8, clear, 0.6);
        if (n >= 0 && d2(this.nav.pos(n), vp) > 0.9) { this.pos = this.nav.pos(n); this.path = []; return; }
      }
    const n = this.nav.nearest(vp, 3, 0, 0.6);
    if (n >= 0) { this.pos = this.nav.pos(n); this.path = []; }
  }

  /** is the guide standing in the middle of the visitor's view, close by? */
  private blocksView(v: Visitor) {
    const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
    const rx = this.pos.x - v.x, rz = this.pos.z - v.z;
    const along = rx * fx + rz * fz, lat = Math.abs(rx * fz - rz * fx);
    return along > 0 && along < 3.5 && lat < 0.45 + along * 0.1 && Math.abs(this.pos.y - v.floor) < 1;
  }

  /** standing in a doorway / on stairs while the visitor is somewhere roomy: step out of the way */
  private inNarrowSpot(vp: P3) {
    const me = this.nav.nearest(this.pos, 0.3, 0, 0.4), them = this.nav.nearest(vp, 0.3, 0, 0.4);
    return me >= 0 && them >= 0 && this.nav.clear[me] < 0.45 && this.nav.clear[them] >= 0.45;
  }

  /** a good place to stand near the visitor: beside and a little ahead, wide floor, same level */
  private followSpot(v: Visitor): P3 | null {
    const vp = this.visitorPos;
    // angles from the visitor's forward direction (+ = right), distance
    const cands: [number, number][] = [[42, 1.9], [-42, 1.9], [70, 1.7], [-70, 1.7], [110, 1.7], [-110, 1.7], [150, 1.8], [-150, 1.8], [25, 2.4], [-25, 2.4]];
    let best: P3 | null = null, bs = Infinity;
    cands.forEach(([deg, dist], k) => {
      const a = v.yaw - (deg * Math.PI) / 180;
      const p = { x: v.x - Math.sin(a) * dist, y: v.floor, z: v.z - Math.cos(a) * dist };
      const n = this.nav.nearest(p, 0.5, 0.4, 0.6);
      if (n < 0) return;
      const q = this.nav.pos(n);
      if (d2(q, vp) < 1.1 || Math.abs(q.y - v.floor) > 0.9) return;
      const s = k * 0.45 + d2(q, this.pos) * 0.35;
      if (s < bs) { bs = s; best = q; }
    });
    if (best) return best;
    // narrow places (stairs, passages): stand on the visitor's path back toward the guide
    const back = this.nav.path(vp, this.pos);
    if (back?.length) {
      let left = 1.6, q = vp;
      for (const r of back) {
        const L = d3(q, r);
        if (L >= left) { const t = left / L; return { x: q.x + (r.x - q.x) * t, y: q.y + (r.y - q.y) * t, z: q.z + (r.z - q.z) * t }; }
        left -= L; q = r;
      }
      return back[back.length - 1];
    }
    return null;
  }

  private followLogic(dt: number, v: Visitor) {
    this.followTimer -= dt;
    if (this.followTimer > 0) return;
    this.followTimer = 0.25;
    const vp = this.visitorPos, d = d3(this.pos, vp);
    // another storey (level buttons) or far away: floors and walls hide him, so re-appear nearby
    if (Math.abs(this.pos.y - vp.y) > 2 || d > 30) { this.appearNear(v); this.followTimer = 0; return; }
    const need = this.moving ? d2(vp, this.lastVisitor) > 0.5
      : d > 2.4 || d2(this.pos, vp) < 0.8 || Math.abs(this.pos.y - vp.y) > 1.2 || (!this.talking && this.blocksView(v)) || this.inNarrowSpot(vp);
    if (!need) return;
    const spot = this.followSpot(v);
    if (!spot) return;
    if (d2(spot, this.pos) < 0.3 && Math.abs(spot.y - this.pos.y) < 0.3) return;
    const p = this.nav.path(this.pos, spot);
    if (!p || NavGrid.pathLength(this.pos, p) > Math.max(14, d * 3)) { this.appearNear(v); this.followTimer = 0; return; }
    this.path = p;
    this.lastVisitor = vp;
  }

  update(dt: number, v: Visitor, cam: THREE.Camera) {
    this.visitor = v;
    cam.getWorldPosition(this.camPos);
    if (this.mode === "follow") this.followLogic(dt, v);
    const dv = this.distToVisitor();

    /* walking */
    const prevHeading = this.heading;
    let want = 0;
    if (this.path.length) {
      const t = this.path[0];
      const dx = t.x - this.pos.x, dz = t.z - this.pos.z;
      const remaining = NavGrid.pathLength(this.pos, this.path);
      if (this.mode === "lead") {
        // lead at a walking pace; slow down and stop to wait if the visitor falls behind
        want = dv > 9 ? 0 : dv > 6 ? 0.6 : 1.5;
        if (want === 0) {
          this.waitWave -= dt;
          if (this.waitWave <= 0) { this.avatar.gesture("wave"); this.waitWave = 5; }
        }
      } else want = dv > 8 ? 4.5 : dv > 5 ? 3.4 : dv > 3 ? 2.4 : 1.6; // keep up with a walking (2 m/s) or running visitor
      want = Math.min(want, 0.5 + remaining * 1.4); // ease into the stop
      const ang = Math.atan2(dx, dz), diff = wrap(ang - this.heading);
      if (Math.abs(diff) > 1.3) want *= 0.15; // turn mostly on the spot first
      this.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * 4.5);
      this.speed += (want - this.speed) * Math.min(1, dt * 6);
      let step = this.speed * dt;
      while (step > 0 && this.path.length) {
        const q = this.path[0];
        const ex = q.x - this.pos.x, ez = q.z - this.pos.z, L = Math.hypot(ex, ez);
        if (L <= step || L < 0.05) { this.pos = { ...q }; this.path.shift(); step -= L; }
        else {
          this.pos.x += (ex / L) * step; this.pos.z += (ez / L) * step;
          this.pos.y += (q.y - this.pos.y) * Math.min(1, step / Math.max(L, 0.01));
          step = 0;
        }
      }
      const hit = this.map.at(this.pos.x, this.pos.z, this.pos.y);
      if (hit) this.pos.y += (hit.y - this.pos.y) * Math.min(1, dt * 14);
      if (!this.path.length) {
        const cb = this.onArrive;
        this.onArrive = null;
        if (this.mode === "lead") this.mode = "hold";
        cb?.();
      }
    } else {
      this.speed += (0 - this.speed) * Math.min(1, dt * 6);
      /* standing: turn toward what he is facing */
      let face: THREE.Vector3 | null = this.faceTarget;
      const toVisitor = wrap(Math.atan2(v.x - this.pos.x, v.z - this.pos.z) - this.heading);
      // an explicit target (presenting a feature) wins, unless the visitor has gone behind him
      if (!face || Math.abs(toVisitor) > 1.7) {
        if (this.talking || this.mode === "hold" || (this.mode === "follow" && dv < 6)) face = this.tmp.set(v.x, v.floor, v.z);
      }
      if (face) {
        const diff = wrap(Math.atan2(face.x - this.pos.x, face.z - this.pos.z) - this.heading);
        const limit = this.talking || this.mode === "hold" ? 0.4 : 1.0;
        if (Math.abs(diff) > limit) this.turning = true;
        if (this.turning) {
          this.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * 2.6);
          if (Math.abs(diff) < 0.08) this.turning = false;
        }
      }
    }
    this.turnRate = wrap(this.heading - prevHeading) / Math.max(dt, 1e-3);
    this.heading = wrap(this.heading);

    /* head: explicit look target, else the visitor's eyes when near, else ahead */
    if (this.lookTarget) this.avatar.lookAt(this.lookTarget);
    else if (dv < 7 && (this.talking || !this.moving)) this.avatar.lookAt(this.camPos);
    else this.avatar.lookAt(null);

    this.avatar.setLocomotion(this.path.length ? this.speed : 0, this.turnRate);
    this.place();
    this.avatar.update(dt);
  }

  private place() {
    this.avatar.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.avatar.root.rotation.set(0, this.heading, 0);
  }

  dispose() { this.avatar.dispose(); }
}
