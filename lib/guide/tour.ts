/* Guided tour over manifest.walk.tour.stops.
   walking → (waiting for the visitor) → presenting (turn, point + look at the feature)
   → telling (the UI plays the story and calls storyEnded) → between → next stop.
   Pausing keeps the guide where he is; stop() hands him back to follow mode (free exploring). */
import * as THREE from "three";
import type { TourStop } from "../types";
import type { Guide } from "./guide";
import type { P3 } from "./nav";

export type TourPhase = "idle" | "walking" | "waiting" | "presenting" | "telling" | "between" | "paused" | "done";

export interface TourEvents {
  /** start narrating this stop; call tour.storyEnded() when the speech is over */
  onStory(stop: TourStop, index: number): void;
  onPhase?(phase: TourPhase, stop: TourStop | null, index: number): void;
}

const NEAR = 4.2;        // visitor counts as "here" within this distance of the guide
const BETWEEN = 1.6;     // pause after a story before walking on

export class Tour {
  phase: TourPhase = "idle";
  index = -1;
  /** walk on to the next stop by itself after each story */
  auto = true;
  private t = 0;
  private waitT = 0;
  private resumeTo: TourPhase = "idle";
  private poi = new THREE.Vector3();

  constructor(private guide: Guide, public stops: TourStop[], private ev: TourEvents) {}

  get current(): TourStop | null { return this.stops[this.index] ?? null; }
  get active() { return this.phase !== "idle" && this.phase !== "done"; }

  private set(p: TourPhase) {
    this.phase = p;
    this.t = 0;
    this.ev.onPhase?.(p, this.current, this.index);
  }

  /** start (or jump) to stop i */
  goTo(i: number, single = false) {
    if (i < 0 || i >= this.stops.length) { this.finish(); return; }
    this.index = i;
    this.single = single;
    const s = this.stops[i];
    const stand: P3 = { x: s.stand[0], y: s.stand[1], z: s.stand[2] };
    this.guide.avatar.pointAt(null);
    this.guide.look(null);
    this.guide.marker = stand;
    this.set("walking");
    const d = Math.hypot(this.guide.pos.x - stand.x, this.guide.pos.z - stand.z, this.guide.pos.y - stand.y);
    if (d < 0.35) { this.guide.hold(); this.set("waiting"); return; }
    this.guide.lead(stand, () => { if (this.phase === "walking") { this.guide.hold(); this.set("waiting"); } });
  }

  /** free mode: tell just this stop, then go back to following */
  tellOne(i: number) { this.goTo(i, true); }
  private single = false;
  start(from = 0) { this.goTo(from); }
  next() { this.goTo(this.index + 1); }

  pause() {
    if (!this.active || this.phase === "paused") return;
    this.resumeTo = this.phase === "walking" ? "walking" : this.phase === "telling" ? "telling" : "waiting";
    this.guide.hold();
    this.set("paused");
  }

  resume() {
    if (this.phase !== "paused") return;
    if (this.resumeTo === "walking") this.goTo(this.index);
    else if (this.resumeTo === "telling") this.set("telling");
    else this.set("waiting");
  }

  /** leave the tour: free exploring, the guide follows */
  stop() {
    this.guide.avatar.pointAt(null);
    this.guide.look(null);
    this.guide.marker = null;
    this.guide.follow();
    this.index = -1;
    this.set("idle");
  }

  private finish() {
    this.stop();
    this.set("done");
  }

  /** the UI finished speaking the current stop's story */
  storyEnded() {
    // ignore the "end" of whatever speech was cut off when this story started
    if (this.phase !== "telling" || this.t < 0.4) return;
    this.guide.avatar.pointAt(null);
    this.guide.look(null);
    this.set("between");
  }

  /** point at the stop's feature again (story markers like [point]) */
  pointNow(hold = 3) {
    const s = this.current;
    if (!s?.poi) return;
    this.guide.avatar.pointAt(this.poi.set(...s.poi));
    this.guide.avatar.gesture("point", hold);
    this.guide.look(this.poi);
    this.lookBackAt = this.t + Math.min(2.2, hold);
  }
  private lookBackAt = Infinity;

  update(dt: number) {
    this.t += dt;
    const g = this.guide, s = this.current;
    if (this.t > this.lookBackAt) { g.look(null); this.lookBackAt = Infinity; }
    switch (this.phase) {
      case "waiting": {
        if (!s) return;
        const near = g.distToVisitor() < NEAR;
        if (near) { this.present(s); return; }
        // beckon now and then
        this.waitT -= dt;
        if (this.waitT <= 0 && this.t > 1.5) { g.avatar.gesture("wave"); this.waitT = 6; }
        break;
      }
      case "presenting": {
        if (this.t > 0.7 && !this.toldOnce) {
          this.toldOnce = true;
          if (s?.poi && (s.gesture ?? "point") === "point") this.pointNow(3.2);
          else if (s?.gesture) g.avatar.gesture(s.gesture === "point" ? "talk1" : s.gesture);
          this.set("telling");
          this.ev.onStory(s!, this.index);
        }
        break;
      }
      case "between":
        if (this.t > BETWEEN && this.single) this.stop();
        else if (this.t > BETWEEN && this.auto) this.next();
        break;
      default: break;
    }
  }
  private toldOnce = false;

  private present(s: TourStop) {
    const g = this.guide, v = g.visitorPos;
    // face between the visitor and the feature, so both the arm and the head can reach
    let fx = v.x - g.pos.x, fz = v.z - g.pos.z;
    if (s.poi) {
      const px = s.poi[0] - g.pos.x, pz = s.poi[2] - g.pos.z, lp = Math.hypot(px, pz) || 1, lv = Math.hypot(fx, fz) || 1;
      fx = fx / lv + px / lp; fz = fz / lv + pz / lp;
    }
    g.hold({ x: g.pos.x + fx, y: g.pos.y, z: g.pos.z + fz });
    this.toldOnce = false;
    this.set("presenting");
  }
}
