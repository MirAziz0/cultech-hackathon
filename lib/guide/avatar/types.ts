/* One interface for both guide bodies:
   - Plan B: procedural low-poly builder (procedural.ts), always available;
   - Plan A: VRM avatar (vrm.ts), used when /characters/<id>/avatar.vrm exists.
   Convention: the root sits at the feet and the character faces local +Z. */
import type * as THREE from "three";

export type Gesture =
  | "talk1" | "talk2" | "talk3"
  | "point"        // hold pointAt() target (set separately)
  | "lookUp" | "wave" | "welcome" | "think" | "nod";

export type Expression = "neutral" | "happy" | "surprised" | "serious";

/** VRM mouth shapes, 0..1 each */
export interface MouthShape { aa: number; ih: number; ou: number; ee: number; oh: number }
export const MOUTH_REST: MouthShape = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };

export interface GuideAvatar {
  readonly root: THREE.Object3D;
  readonly kind: "procedural" | "vrm" | "mesh";
  /** triangle count (budget: ≤ 20k) */
  readonly tris: number;
  /** eye height above the feet */
  readonly eyeHeight: number;
  update(dt: number): void;
  /** current ground speed in m/s (drives idle ↔ walk blend) */
  setLocomotion(speed: number, turnRate?: number): void;
  gesture(g: Gesture, holdSec?: number): void;
  /** while true the body adds small talk gestures and nods by itself */
  setTalking(on: boolean): void;
  /** world-space point for the head to look at (null = straight ahead) */
  lookAt(p: THREE.Vector3 | null): void;
  /** world-space point for the arm to point at (null = lower the arm) */
  pointAt(p: THREE.Vector3 | null): void;
  setMouth(m: MouthShape): void;
  setExpression(e: Expression): void;
  dispose(): void;
}

export interface AvatarLook {
  robe?: string;
  sash?: string;
  headwear?: "turban" | "kalpak" | "cap" | "papaq";
  beard?: boolean;
  chokha?: boolean;
  skin?: string;
  turban?: string;
}
