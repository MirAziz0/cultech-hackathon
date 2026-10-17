/* Full-screen walk mode: kit-built world + Walker + light pool + optional N8AO.
   Quality: "high" (desktop) = AO + DPR up to 2; "low" (phones / weak GPUs) = no AO, DPR ≤ 1.5. */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import type { Era, WalkSpec } from "../types";
import { buildWalkWorld, type WalkWorld } from "../kit/walkScene";
import { Walker, drawMap, type MapMark } from "../walk/controller";
import { ZoneMap } from "../walk/zones";
import { loadModel } from "../kit/models";

export type Quality = "high" | "low";

export function detectQuality(): Quality {
  if (typeof window === "undefined") return "low";
  const q = new URLSearchParams(location.search).get("q");
  if (q === "high" || q === "low") return q;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
  const cores = navigator.hardwareConcurrency || 4;
  return mobile || cores <= 4 ? "low" : "high";
}

export class WalkViewer {
  renderer: THREE.WebGLRenderer;
  camera = new THREE.PerspectiveCamera(72, 1, 0.1, 150);
  world: WalkWorld;
  walker: Walker;
  map: ZoneMap;
  private composer: EffectComposer | null = null;
  private raf = 0;
  private clock = new THREE.Clock();
  private ro: ResizeObserver;
  private fpsAcc = { t: 0, n: 0 };
  fps = 60;
  paused = false;
  onZone?: (id: string) => void;
  onFrame?: (dt: number) => void;
  /** runs after the walker moved and before rendering (the guide lives here) */
  beforeRender?: (dt: number) => void;
  /** extra dots on the minimap (guide, next stop) */
  mapMarks?: () => MapMark[];
  /** objects that live in every era's scene (the guide) */
  private actors: THREE.Object3D[] = [];
  mini?: { ctx: CanvasRenderingContext2D; w: number; h: number; colors: { bg: string; floor: string; me: string; other: string } };

  /** worlds built so far, one per era (built on first visit, so switching back is instant) */
  private worlds = new Map<string, WalkWorld>();
  era: Era | undefined;

  constructor(private canvas: HTMLCanvasElement, private host: HTMLElement, private spec: WalkSpec, public quality: Quality = detectQuality(), era?: Era) {
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === "low", powerPreference: "high-performance" }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === "high" ? 2 : 1.5));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    this.era = spec.eras?.length ? (era && spec.eras.includes(era) ? era : spec.defaultEra ?? spec.eras[0]) : undefined;
    this.world = buildWalkWorld(spec, r, { era: this.era });
    this.addModels(this.world, this.era);
    this.addTrees(this.world);
    r.toneMappingExposure = (this.era && spec.eraLook?.[this.era]?.exposure) || 1;
    this.worlds.set(this.era ?? "", this.world);
    this.map = new ZoneMap(spec.zones, spec.defaultFloor ?? 0, spec.obstacles ?? []);
    this.walker = new Walker(this.map, spec);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    if (quality === "high") this.setupAO().catch((e) => console.warn("[walk] AO disabled:", e));
    this.world.pool.update(0, this.camera.position, true);
  }

  /** swap to another era's world; the walker keeps its position */
  setEra(era: Era) {
    if (!this.spec.eras?.includes(era) || era === this.era) return;
    this.era = era;
    let w = this.worlds.get(era);
    if (!w) { w = buildWalkWorld(this.spec, this.renderer, { era }); this.worlds.set(era, w); this.addModels(w, era); this.addTrees(w); }
    this.renderer.toneMappingExposure = this.spec.eraLook?.[era]?.exposure || 1;
    this.world = w;
    for (const a of this.actors) w.scene.add(a);
    this.world.pool.update(0, this.camera.position, true);
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
      this.setupAO().catch((e) => console.warn("[walk] AO disabled:", e));
    }
  }

  /** textured models (walk elements { t: "model" }) arrive after the kit world is built */
  private addModels(w: WalkWorld, era?: Era) {
    for (const e of this.spec.elements) {
      if (e.t !== "model" || (e.eras && era && !e.eras.includes(era))) continue;
      loadModel(e.src).then((obj) => {
        const o = obj.clone();
        o.position.set(...e.at);
        o.rotation.y = ((e.rotY ?? 0) * Math.PI) / 180;
        if (Array.isArray(e.scale)) o.scale.set(...e.scale); else o.scale.setScalar(e.scale ?? 1);
        if (e.cut?.length) cutModel(o, e.cut);
        w.scene.add(o);
      }).catch((err) => console.warn(`[walk] model ${e.src} not loaded:`, err));
    }
  }

  /** imported tree variants, instanced: one draw call per variant however many trees */
  private addTrees(w: WalkWorld) {
    const src = this.spec.trees;
    if (!src || !w.treeSpots.length) return;
    loadModel(src).then((obj) => {
      const variants: THREE.Mesh[] = [];
      obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) variants.push(o as THREE.Mesh); });
      if (!variants.length) return;
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      variants.forEach((v, k) => {
        const spots = w.treeSpots.filter((s) => Math.abs(Math.round(s[4])) % variants.length === k);
        if (!spots.length) return;
        const inst = new THREE.InstancedMesh(v.geometry, v.material, spots.length);
        spots.forEach(([x, y, z, h, seed, wd], i) => {
          q.setFromAxisAngle(up, (seed * 2.399) % (Math.PI * 2));
          m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(h * wd, h, h * wd));
          inst.setMatrixAt(i, m4);
        });
        inst.computeBoundingSphere();
        w.scene.add(inst);
      });
    }).catch((err) => console.warn(`[walk] trees ${src} not loaded:`, err));
  }

  addActor(o: THREE.Object3D) {
    this.actors.push(o);
    this.world.scene.add(o);
  }

  removeActor(o: THREE.Object3D) {
    this.actors = this.actors.filter((a) => a !== o);
    o.removeFromParent();
  }

  private async setupAO() {
    const { N8AOPass } = await import("n8ao");
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const composer = new EffectComposer(this.renderer);
    const ao = new N8AOPass(this.world.scene, this.camera, w, h);
    ao.configuration.aoRadius = 1.2;
    ao.configuration.distanceFalloff = 0.6;
    ao.configuration.intensity = 2.2;
    ao.configuration.gammaCorrection = false;
    ao.setQualityMode("Medium");
    composer.addPass(ao);
    composer.addPass(new SMAAPass());
    composer.addPass(new OutputPass());
    composer.setPixelRatio(this.renderer.getPixelRatio());
    composer.setSize(w, h);
    this.composer = composer;
  }

  /** drop to the cheap path if frame rate collapses (e.g. integrated GPU) */
  private adapt(dt: number) {
    this.fpsAcc.t += dt;
    this.fpsAcc.n++;
    if (this.fpsAcc.t < 2) return;
    this.fps = this.fpsAcc.n / this.fpsAcc.t;
    this.fpsAcc = { t: 0, n: 0 };
    if (this.composer && this.fps < 40) {
      console.info(`[walk] ${this.fps.toFixed(0)} fps → disabling AO`);
      this.composer.dispose();
      this.composer = null;
      this.quality = "low";
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.resize();
    }
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      if (this.paused) return;
      const z = this.walker.update(dt, this.camera);
      if (z) this.onZone?.(z);
      this.beforeRender?.(dt);
      this.world.sky?.position.copy(this.camera.position);
      this.world.pool.update(dt, this.camera.position);
      if (this.quality === "high") this.world.update(this.clock.elapsedTime);
      if (this.composer) this.composer.render(dt);
      else this.renderer.render(this.world.scene, this.camera);
      if (this.mini) drawMap(this.mini.ctx, this.mini.w, this.mini.h, this.spec, this.map, this.walker, this.mini.colors, this.mapMarks?.());
      this.onFrame?.(dt);
      this.adapt(dt);
    };
    loop();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.composer?.dispose();
    for (const w of this.worlds.values()) { w.dispose(); w.materials.dispose(); }
    this.renderer.dispose();
  }
}

/** remove the model's triangles whose centre lies in any of the world boxes (e.g. a closed door surface) */
function cutModel(o: THREE.Object3D, boxes: [number, number, number, number, number, number][]) {
  o.updateMatrixWorld(true);
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    if (!m.isMesh || !m.geometry.index) return;
    const g = m.geometry.clone(), pos = g.attributes.position, idx = g.index!.array, keep: number[] = [];
    for (let i = 0; i < idx.length; i += 3) {
      c.set(0, 0, 0);
      for (let k = 0; k < 3; k++) c.add(v.fromBufferAttribute(pos, idx[i + k]).applyMatrix4(m.matrixWorld));
      c.divideScalar(3);
      if (!boxes.some(([x0, x1, y0, y1, z0, z1]) => c.x > x0 && c.x < x1 && c.y > y0 && c.y < y1 && c.z > z0 && c.z < z1)) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    g.setIndex(keep);
    m.geometry = g;
  });
}
