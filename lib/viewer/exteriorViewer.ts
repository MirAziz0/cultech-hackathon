/* Exterior maquette viewer — port of reference/app.js (renderer, sun shadows, orbit controls,
   era toggle, projected labels, fly-to, double-tap home, look-around interiors). */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Era, ExteriorSpec, InteriorSpec, Vec3 } from "../types";
import { anchor, buildExterior } from "../kit/exterior";
import { buildInterior } from "../kit/interior";

export interface LabelPos { id: string; x: number; y: number; visible: boolean }

function orbitPos(target: THREE.Vector3, azDeg: number, polDeg: number, dist: number) {
  const az = THREE.MathUtils.degToRad(azDeg), pol = THREE.MathUtils.degToRad(polDeg);
  return new THREE.Vector3(
    target.x + dist * Math.sin(pol) * Math.sin(az),
    target.y + dist * Math.cos(pol),
    target.z + dist * Math.sin(pol) * Math.cos(az),
  );
}

export class ExteriorViewer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.01, 20);
  controls: OrbitControls;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private models: Partial<Record<Era, THREE.Group>> = {};
  private era: Era = "past";
  private fly: { t: number; fromT: THREE.Vector3; toT: THREE.Vector3; fromP: THREE.Vector3; toP: THREE.Vector3 } | null = null;
  private anchors: { id: string; v: THREE.Vector3 }[] = [];
  private raf = 0;
  private clock = new THREE.Clock();
  private ro: ResizeObserver;
  private home: { target: THREE.Vector3; az: number; pol: number; dist: number };
  private inside: { id: string; group: THREE.Group; saved: { pos: THREE.Vector3; target: THREE.Vector3 } } | null = null;
  private interiors = new Map<string, ReturnType<typeof buildInterior>>();
  private reduceMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  onLabels?: (labels: LabelPos[]) => void;
  private tmp = new THREE.Vector3();
  private dirty = true;

  constructor(private canvas: HTMLCanvasElement, private host: HTMLElement, private spec: ExteriorSpec) {
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;

    // legacy light units ×π to keep the reference look
    this.hemi = new THREE.HemisphereLight(0xfff6e6, 0x6b5a45, 0.6 * Math.PI);
    this.scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff0d8, 1.25 * Math.PI));
    sun.position.set(-0.6, 1.1, 0.7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -0.5, right: 0.5, top: 0.5, bottom: -0.5, near: 0.1, far: 3 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.0025;
    sun.shadow.radius = 3;
    this.scene.add(sun);

    const c = (this.controls = new OrbitControls(this.camera, canvas));
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minDistance = 0.18;
    c.maxDistance = 2.2;
    c.maxPolarAngle = Math.PI * 0.47;
    const h = spec.home;
    this.home = { target: new THREE.Vector3(...h.target), az: h.az, pol: h.pol, dist: h.dist };
    c.target.copy(this.home.target);
    this.camera.position.copy(orbitPos(this.home.target, h.az, h.pol, h.dist));
    c.addEventListener("change", () => (this.dirty = true));

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  /** builds both eras (procedural, synchronous) */
  load() {
    for (const era of ["past", "today"] as Era[]) {
      const g = buildExterior(this.spec, era);
      g.visible = era === this.era;
      this.models[era] = g;
      this.scene.add(g);
    }
    this.dirty = true;
  }

  setAnchors(list: { id: string; pos: Vec3 }[]) {
    this.anchors = list.map((a) => ({ id: a.id, v: anchor(this.spec, a.pos) }));
    this.dirty = true;
  }

  setEra(era: Era) {
    this.era = era;
    for (const e of ["past", "today"] as Era[]) if (this.models[e]) this.models[e]!.visible = !this.inside && e === era;
    this.dirty = true;
  }

  flyToAnchor(id: string, dist = 0.42) {
    const a = this.anchors.find((x) => x.id === id);
    if (!a) return;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.fly = { t: 0, fromT: this.controls.target.clone(), toT: a.v.clone(), fromP: this.camera.position.clone(), toP: a.v.clone().add(dir.multiplyScalar(dist)) };
  }

  flyHome() {
    const h = this.home;
    this.fly = { t: 0, fromT: this.controls.target.clone(), toT: h.target.clone(), fromP: this.camera.position.clone(), toP: orbitPos(h.target, h.az, h.pol, h.dist) };
  }

  enterInterior(id: string, spec: InteriorSpec) {
    if (this.inside) this.exitInterior();
    let r = this.interiors.get(id);
    if (!r) { r = buildInterior(spec); this.interiors.set(id, r); }
    this.fly = null;
    this.inside = { id, group: r.group, saved: { pos: this.camera.position.clone(), target: this.controls.target.clone() } };
    this.scene.add(r.group);
    this.hemi.visible = this.sun.visible = false;
    this.renderer.shadowMap.enabled = false;
    this.setEra(this.era);
    const cam = this.camera;
    cam.near = 0.05; cam.far = 80; cam.fov = 70; cam.updateProjectionMatrix();
    this.controls.target.set(0, r.eye, 0);
    cam.position.set(0, r.eye + 0.15, r.reach * 0.55);
    Object.assign(this.controls, { minDistance: 0.3, maxDistance: r.reach, minPolarAngle: 0.15, maxPolarAngle: Math.PI - 0.15, enablePan: false });
    this.dirty = true;
  }

  exitInterior() {
    if (!this.inside) return;
    this.scene.remove(this.inside.group);
    const saved = this.inside.saved;
    this.inside = null;
    this.hemi.visible = this.sun.visible = true;
    this.renderer.shadowMap.enabled = true;
    this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
    this.setEra(this.era);
    const cam = this.camera;
    cam.near = 0.01; cam.far = 20; cam.fov = 35; cam.updateProjectionMatrix();
    Object.assign(this.controls, { minDistance: 0.18, maxDistance: 2.2, minPolarAngle: 0, maxPolarAngle: Math.PI * 0.47, enablePan: true });
    cam.position.copy(saved.pos);
    this.controls.target.copy(saved.target);
    this.dirty = true;
  }

  get isInside() { return !!this.inside; }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  start() {
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.clock.getDelta();
      if (this.fly) {
        const f = this.fly;
        f.t = this.reduceMotion ? 1 : Math.min(1, f.t + 0.035);
        const e = 1 - Math.pow(1 - f.t, 3);
        this.controls.target.lerpVectors(f.fromT, f.toT, e);
        this.camera.position.lerpVectors(f.fromP, f.toP, e);
        if (f.t >= 1) this.fly = null;
        this.dirty = true;
      }
      this.controls.update();
      // render on demand: an idle maquette costs nothing on phones
      if (!this.dirty) return;
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
      if (!this.inside) this.emitLabels();
    };
    loop();
  }

  private emitLabels() {
    if (!this.onLabels) return;
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.onLabels(
      this.anchors.map((a) => {
        this.tmp.copy(a.v).project(this.camera);
        const vis = this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.05 && Math.abs(this.tmp.y) < 1.05;
        return { id: a.id, x: (this.tmp.x * 0.5 + 0.5) * w, y: (-this.tmp.y * 0.5 + 0.5) * h, visible: vis };
      }),
    );
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
    });
    this.renderer.dispose();
  }
}
