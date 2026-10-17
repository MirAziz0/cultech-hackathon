/* First-person walker: keys / touch pad / drag-to-look, zone collision with sliding, smooth floor height.
   Port of the player section of reference/walk.js. */
import * as THREE from "three";
import type { WalkSpec } from "../types";
import { ZoneMap, type CZone } from "./zones";

export type Keys = Partial<Record<"f" | "b" | "l" | "r" | "tl" | "tr" | "run", boolean>>;

export class Walker {
  x = 0; z = 0; yaw = 0; pitch = 0; y = 1.62;
  /** floor height under the player (not smoothed) */
  floor = 0;
  keys: Keys = {};
  zone: CZone | null = null;
  /** analog stick input (-1..1) from touch joystick */
  stick = { x: 0, y: 0 };
  readonly eye: number;
  private start: WalkSpec["start"];
  constructor(public map: ZoneMap, spec: WalkSpec) {
    this.eye = spec.eye ?? 1.62;
    this.start = spec.start;
    this.reset();
  }
  reset() {
    const s = this.start;
    this.x = s.x; this.z = s.z;
    this.yaw = (s.yaw * Math.PI) / 180;
    this.pitch = s.pitch ?? 0.08;
    const hit = this.map.at(s.x, s.z, s.y ?? 0);
    this.floor = hit?.y ?? s.y ?? 0;
    this.y = this.floor + this.eye;
    this.zone = null;
    this.keys = {};
  }
  teleport(x: number, z: number, floor: number, yawDeg?: number, pitch?: number) {
    this.x = x; this.z = z; this.floor = floor; this.y = floor + this.eye;
    if (yawDeg !== undefined) this.yaw = (yawDeg * Math.PI) / 180;
    if (pitch !== undefined) this.pitch = pitch;
  }
  /** returns the zone id when it changes */
  update(dt: number, cam: THREE.PerspectiveCamera): string | null {
    const k = this.keys, sp = 2.0 * dt * (k.run ? 1.8 : 1);
    let f = (k.f ? 1 : 0) - (k.b ? 1 : 0) + -this.stick.y, s = (k.r ? 1 : 0) - (k.l ? 1 : 0);
    if (k.tl) this.yaw += 1.6 * dt;
    if (k.tr) this.yaw -= 1.6 * dt;
    this.yaw -= this.stick.x * 1.8 * dt;
    if (f || s) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      const len = Math.max(1, Math.hypot(f, s));
      f /= len; s /= len;
      const dx = (fx * f + rx * s) * sp, dz = (fz * f + rz * s) * sp;
      const a = this.map.at(this.x + dx, this.z, this.floor);
      if (a) { this.x += dx; this.floor = a.y; }
      const b = this.map.at(this.x, this.z + dz, this.floor);
      if (b) { this.z += dz; this.floor = b.y; }
    }
    const hit = this.map.at(this.x, this.z, this.floor);
    if (hit) this.floor = hit.y;
    const target = this.floor + this.eye;
    this.y += (target - this.y) * Math.min(1, dt * 10);
    cam.position.set(this.x, this.y, this.z);
    cam.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    if (hit && hit.zone.id !== this.zone?.id) {
      this.zone = hit.zone;
      return hit.zone.id;
    }
    return null;
  }
  /** feet position + heading, for the guide */
  floorPos() { return { x: this.x, z: this.z, floor: this.floor, yaw: this.yaw }; }
  look(dx: number, dy: number) {
    this.yaw -= dx * 0.0042;
    this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - dy * 0.0042));
  }
  clearKeys() {
    this.keys = {};
    this.stick.x = this.stick.y = 0;
  }
}

/** extra minimap marker: a dot (guide) or a diamond (next stop); faded when on another level */
export interface MapMark { x: number; z: number; y: number; color: string; kind: "dot" | "diamond" }

/** minimap: draws zones near the player's level and the player arrow (reference drawMap) */
export function drawMap(
  ctx: CanvasRenderingContext2D, w: number, h: number, spec: WalkSpec, map: ZoneMap, me: Walker,
  colors: { bg: string; floor: string; me: string; other: string },
  marks: MapMark[] = [],
) {
  const [x0, x1, z0, z1] = spec.map.bounds;
  const sc = Math.min(w / (x1 - x0), h / (z1 - z0));
  const X = (x: number) => (x - x0) * sc + (w - (x1 - x0) * sc) / 2;
  const Z = (z: number) => (z - z0) * sc + (h - (z1 - z0) * sc) / 2;
  const hide = new Set(spec.map.hide ?? []);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, w, h);
  const levelOf = (y: number) => Math.abs(y - me.floor) < 1.6;
  for (const zn of map.zones) {
    if (hide.has(zn.id)) continue;
    const y = zn.floor(me.x, me.z, me.floor);
    ctx.fillStyle = levelOf(y) ? (zn.id === me.zone?.id ? colors.other : colors.floor) : "rgba(205,185,143,.18)";
    ctx.beginPath();
    if (zn.circle) ctx.arc(X(zn.circle[0]), Z(zn.circle[1]), zn.circle[2] * sc, 0, Math.PI * 2);
    else if (zn.ring) {
      ctx.arc(X(zn.ring[0]), Z(zn.ring[1]), zn.ring[3] * sc, 0, Math.PI * 2);
      ctx.arc(X(zn.ring[0]), Z(zn.ring[1]), zn.ring[2] * sc, 0, Math.PI * 2, true);
    } else zn.poly!.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z))));
    ctx.closePath();
    ctx.fill("evenodd");
  }
  for (const mk of marks) {
    ctx.globalAlpha = Math.abs(mk.y - me.floor) < 1.6 ? 1 : 0.35;
    ctx.fillStyle = mk.color;
    ctx.strokeStyle = "rgba(20,17,14,.9)";
    ctx.lineWidth = 1.5;
    const mx = X(mk.x), mz = Z(mk.z);
    ctx.beginPath();
    if (mk.kind === "dot") ctx.arc(mx, mz, 4.5, 0, Math.PI * 2);
    else { ctx.moveTo(mx, mz - 6); ctx.lineTo(mx + 5, mz); ctx.lineTo(mx, mz + 6); ctx.lineTo(mx - 5, mz); ctx.closePath(); }
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const px = X(me.x), pz = Z(me.z);
  ctx.fillStyle = colors.me;
  ctx.beginPath();
  ctx.arc(px, pz, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = colors.me;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, pz);
  ctx.lineTo(px - Math.sin(me.yaw) * 12, pz - Math.cos(me.yaw) * 12);
  ctx.stroke();
}
