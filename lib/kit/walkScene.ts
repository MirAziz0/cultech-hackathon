/* Builds the full walk-mode scene from manifest.walk. */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { El, Era, WalkSpec } from "../types";
import { Builder, type LightDef } from "./builder";
import { buildEl } from "./elements";
import { Materials } from "./materials";

/** Fixed pool of point lights that follow the nearest lamp positions — the light count never
   changes (no shader recompiles) and mobile GPUs never shade more than `size` point lights. */
export class LightPool {
  readonly lights: THREE.PointLight[] = [];
  private t = 0;
  constructor(scene: THREE.Scene, private defs: LightDef[], size = 6) {
    for (let i = 0; i < Math.min(size, Math.max(1, defs.length)); i++) {
      const l = new THREE.PointLight(0xffcf96, 0, 10, 1.6);
      scene.add(l);
      this.lights.push(l);
    }
  }
  update(dt: number, cam: THREE.Vector3, force = false) {
    this.t -= dt;
    if (!force && this.t > 0) return;
    this.t = 0.35;
    const ranked = this.defs
      .map((d) => ({ d, s: d.pos.distanceTo(cam) - d.distance * 0.35 }))
      .sort((a, b) => a.s - b.s);
    this.lights.forEach((l, i) => {
      const r = ranked[i];
      if (!r) { l.intensity = 0; return; }
      l.position.copy(r.d.pos);
      // legacy (pre-r155) light units were scaled by PI; keep the reference look
      l.intensity = r.d.intensity * Math.PI;
      l.distance = r.d.distance;
      l.color.setHex(r.d.color);
    });
  }
}

export interface WalkWorld {
  scene: THREE.Scene;
  pool: LightPool;
  /** animate extras (dust motes); cheap, skipped on the low tier */
  update(time: number): void;
  materials: Materials;
  stats: { meshes: number; tris: number; lamps: number };
  dispose(): void;
}

/** drop elements (and group children) that belong to other eras */
function forEra(els: El[], era?: Era): El[] {
  if (!era) return els;
  return els
    .filter((e) => !e.eras || e.eras.includes(era))
    .map((e) => (e.t === "group" ? { ...e, children: forEra(e.children, era) } : e));
}

export function buildWalkWorld(spec: WalkSpec, renderer: THREE.WebGLRenderer, opts: { alias?: Record<string, string>; era?: Era } = {}): WalkWorld {
  const look = (opts.era && spec.eraLook?.[opts.era]) || {};
  const scene = new THREE.Scene();
  const sky = new THREE.Color(look.sky ?? spec.sky ?? "#bcd6e8");
  scene.background = sky;
  const fog = look.fog ?? spec.fog;
  scene.fog = new THREE.Fog(sky, fog?.[0] ?? 30, fog?.[1] ?? 90);

  const B = new Builder();
  B.alias = { ...(look.alias ?? {}), ...(opts.alias ?? {}) };
  for (const e of forEra(spec.elements, opts.era)) buildEl(B, e);
  const group = B.finish();
  scene.add(group);

  // image-based ambient: a neutral room environment gives metals/mirrors something to reflect
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.25;
  pmrem.dispose();

  const amb = look.ambient ?? spec.ambient ?? 0.62;
  scene.add(new THREE.HemisphereLight(0xfff3e0, 0x6a5640, amb * Math.PI));
  const sunSpec = look.sun ?? spec.sun;
  const sun = new THREE.DirectionalLight(0xfff0d8, (sunSpec?.intensity ?? 0.8) * Math.PI);
  const d = sunSpec?.dir ?? [-10, 20, 6];
  sun.position.set(d[0], d[1], d[2]);
  scene.add(sun);

  const pool = new LightPool(scene, B.lights, 6);
  let tris = 0;
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) tris += ((o as THREE.Mesh).geometry.attributes.position.count / 3) | 0;
  });
  const animated: ((t: number) => void)[] = [];
  group.traverse((o) => { if (typeof o.userData.update === "function") animated.push(o.userData.update); });
  return {
    scene,
    pool,
    update(time: number) { for (const f of animated) f(time); },
    materials: B.mats,
    stats: { meshes: group.children.length, tris, lamps: B.lights.length },
    dispose() {
      group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      env.dispose();
    },
  };
}
