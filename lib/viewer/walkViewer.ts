/* Full-screen walk mode: kit-built world + Walker + light pool + optional N8AO.
   Quality: "high" (desktop) = AO + DPR up to 2; "low" (phones / weak GPUs) = no AO, DPR ≤ 1.5. */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import type { WalkSpec } from "../types";
import { buildWalkWorld, type WalkWorld } from "../kit/walkScene";
import { Walker, drawMap } from "../walk/controller";
import { ZoneMap } from "../walk/zones";

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
  camera = new THREE.PerspectiveCamera(72, 1, 0.05, 150);
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
  mini?: { ctx: CanvasRenderingContext2D; w: number; h: number; colors: { bg: string; floor: string; me: string; other: string } };

  constructor(private canvas: HTMLCanvasElement, private host: HTMLElement, private spec: WalkSpec, public quality: Quality = detectQuality()) {
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === "low", powerPreference: "high-performance" }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === "high" ? 2 : 1.5));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    this.world = buildWalkWorld(spec, r);
    this.map = new ZoneMap(spec.zones, spec.defaultFloor ?? 0, spec.obstacles ?? []);
    this.walker = new Walker(this.map, spec);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    if (quality === "high") this.setupAO().catch((e) => console.warn("[walk] AO disabled:", e));
    this.world.pool.update(0, this.camera.position, true);
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
      this.world.pool.update(dt, this.camera.position);
      if (this.quality === "high") this.world.update(this.clock.elapsedTime);
      if (this.composer) this.composer.render(dt);
      else this.renderer.render(this.world.scene, this.camera);
      if (this.mini) drawMap(this.mini.ctx, this.mini.w, this.mini.h, this.spec, this.map, this.walker, this.mini.colors);
      this.onFrame?.(dt);
      this.adapt(dt);
    };
    loop();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.composer?.dispose();
    this.world.dispose();
    this.world.materials.dispose();
    this.renderer.dispose();
  }
}
