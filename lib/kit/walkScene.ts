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
  /** sky dome that follows the camera (null = flat sky colour) */
  sky: THREE.Mesh | null;
  /** [x, y, z, height, seed, width] of trees to place as instanced models (width = crown scale relative to height) */
  treeSpots: [number, number, number, number, number, number][];
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
  B.alias = { ...(spec.alias ?? {}), ...(look.alias ?? {}), ...(opts.alias ?? {}) };
  // a textured model shown in this era can replace kit parts (e.g. the scene's own minarets)
  const models = forEra(spec.elements, opts.era).filter((e) => e.t === "model") as Extract<El, { t: "model" }>[];
  const hideT = new Set(models.flatMap((m) => m.replaces?.types ?? [])), hideM = new Set(models.flatMap((m) => m.replaces?.mats ?? []));
  // with imported tree models, tree furniture becomes instanced models (placed by the viewer)
  const treeSpots: [number, number, number, number, number, number][] = [];
  for (const e of forEra(spec.elements, opts.era)) {
    // with a tree pack, every tree-like furniture becomes an instanced model: cypress → slim, bush → low and wide
    if (spec.trees && e.t === "furniture") {
      const n = treeSpots.length;
      if (e.kind === "tree") { treeSpots.push([e.at[0], e.at[1], e.at[2], e.h ?? 6, e.seed ?? n, 0.85]); continue; }
      if (e.kind === "cypress") { treeSpots.push([e.at[0], e.at[1], e.at[2], e.h ?? 5.5, n, 0.42]); continue; }
      if (e.kind === "bush") { const r = e.r ?? 0.45; treeSpots.push([e.at[0], e.at[1], e.at[2], r * 2.2, n, 1.5]); continue; }
    }
    if (!hideT.has(e.t) && !(e.mat && hideM.has(e.mat))) buildEl(B, e);
  }
  const group = B.finish();
  scene.add(group);
  const clouds = look.clouds ?? spec.clouds;
  const skyDome = clouds ? makeSky(clouds, look.sky ?? spec.sky ?? "#bcd6e8", look.mountains ?? spec.mountains) : null;
  if (skyDome) scene.add(skyDome);

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
    sky: skyDome,
    treeSpots,
    update(time: number) { for (const f of animated) f(time); },
    materials: B.mats,
    stats: { meshes: group.children.length, tris, lamps: B.lights.length },
    dispose() {
      group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      env.dispose();
    },
  };
}

/** sky dome: zenith → horizon gradient with soft clouds (canvas texture), drawn behind everything */
function makeSky(zenith: string, horizon: string, mountains?: string): THREE.Mesh {
  // mountains need a sharper canvas (their outline sits right at the horizon)
  const W = mountains ? 2048 : 1024, H = W / 2, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, 0, H / 2);
  g.addColorStop(0, zenith); g.addColorStop(1, horizon);
  x.fillStyle = g; x.fillRect(0, 0, W, H / 2);
  x.fillStyle = horizon; x.fillRect(0, H / 2, W, H / 2);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 38; i++) {
    const cx = rnd() * W, cy = H * (0.12 + rnd() * 0.3), r = (18 + rnd() * 46) * (W / 1024);
    for (let k = 0; k < 6; k++) {
      const px = cx + (rnd() - 0.5) * r * 2.4, py = cy + (rnd() - 0.5) * r * 0.5, pr = r * (0.5 + rnd() * 0.6);
      const rg = x.createRadialGradient(px, py, 0, px, py, pr);
      rg.addColorStop(0, "rgba(255,255,255,.38)"); rg.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = rg;
      // repeat across the left/right edge so the dome's wrap-around has no seam
      for (const dx of [-W, 0, W]) {
        x.save(); x.translate(dx, 0);
        x.beginPath(); x.ellipse(px, py, pr * 1.6, pr * 0.7, 0, 0, Math.PI * 2); x.fill();
        x.restore();
      }
    }
  }
  if (mountains) paintMountains(x, W, H, mountains, horizon);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  const m = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

/** two forested ridges around the horizon (far one hazy): smooth periodic noise, so the dome wraps without a seam */
function paintMountains(x: CanvasRenderingContext2D, W: number, H: number, near: string, horizon: string) {
  const ridge = (amp: number, base: number, k: number[], ph: number[]) => (u: number) =>
    base + amp * k.reduce((a, kk, i) => a + Math.sin((u / W) * Math.PI * 2 * kk + ph[i]) / (i + 1.4), 0);
  const far = ridge(H * 0.035, H * 0.075, [3, 7, 13, 23], [0.4, 2.1, 4.0, 1.3]);
  const nearR = ridge(H * 0.03, H * 0.045, [2, 5, 11, 19], [1.7, 0.2, 3.3, 5.1]);
  const mix = (a: string, b: string, t: number) => {
    const ca = new THREE.Color(a), cb = new THREE.Color(b);
    return "#" + ca.lerp(cb, t).getHexString();
  };
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [fn, col, dense] of [[far, mix(near, horizon, 0.55), 0.35], [nearR, near, 1]] as [(u: number) => number, string, number][]) {
    x.fillStyle = col;
    x.beginPath();
    x.moveTo(0, H / 2 + 2);
    for (let u = 0; u <= W; u += 2) x.lineTo(u, H / 2 - Math.max(3, fn(u)));
    x.lineTo(W, H / 2 + 2);
    x.closePath();
    x.fill();
    // forest texture: darker and lighter tree crowns inside the ridge
    x.save();
    x.clip();
    for (let i = 0; i < W * 1.4 * dense; i++) {
      const u = rnd() * W, top = H / 2 - fn(u), v = top + rnd() * (H / 2 - top), s = (1.5 + rnd() * 2.5) * (W / 2048);
      x.fillStyle = rnd() < 0.6 ? "rgba(20,40,15,.18)" : "rgba(160,190,120,.12)";
      x.beginPath(); x.ellipse(u, v, s * 1.3, s, 0, 0, Math.PI * 2); x.fill();
    }
    x.restore();
  }
  // a little haze along the foot of the ridges
  const g = x.createLinearGradient(0, H / 2 - H * 0.03, 0, H / 2);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(1, horizon);
  x.fillStyle = g;
  x.fillRect(0, H / 2 - H * 0.03, W, H * 0.03 + 2);
}
