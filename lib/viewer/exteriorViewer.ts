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

/** additive warm curtain with a bright foot line, fading upward and toward the sides */
function makeGlow() {
  const cv = document.createElement("canvas");
  cv.width = 64; cv.height = 128;
  const ctx = cv.getContext("2d")!;
  const v = ctx.createLinearGradient(0, 128, 0, 0);
  v.addColorStop(0, "rgba(255,226,160,.9)");
  v.addColorStop(0.04, "rgba(255,206,120,.45)");
  v.addColorStop(0.4, "rgba(255,190,100,.14)");
  v.addColorStop(1, "rgba(255,190,100,0)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 64, 128);
  ctx.globalCompositeOperation = "destination-in";
  const hz = ctx.createLinearGradient(0, 0, 64, 0);
  hz.addColorStop(0, "rgba(0,0,0,0)");
  hz.addColorStop(0.18, "rgba(0,0,0,1)");
  hz.addColorStop(0.82, "rgba(0,0,0,1)");
  hz.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = hz;
  ctx.fillRect(0, 0, 64, 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }),
  );
  mesh.renderOrder = 10;
  mesh.visible = false;
  return mesh;
}

export class ExteriorViewer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.01, 20);
  controls: OrbitControls;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private models: Partial<Record<Era, THREE.Group>> = {};
  /** one clipping plane per era model; parked far away when idle so shaders never recompile */
  private clips: Partial<Record<Era, THREE.Plane>> = {};
  private era: Era;
  private sweep: { from: Era; to: Era; t: number; n: THREE.Vector3; s0: number; s1: number } | null = null;
  private glow: THREE.Mesh | null = null;
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

  constructor(private canvas: HTMLCanvasElement, private host: HTMLElement, private spec: ExteriorSpec, private eras: Era[] = ["past", "today"]) {
    this.era = eras[0];
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" }));
    r.localClippingEnabled = true;
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

  /** builds every era (procedural, synchronous) */
  load(initial?: Era) {
    if (initial) this.era = initial;
    for (const era of this.eras) {
      const g = buildExterior(this.spec, era);
      g.visible = era === this.era;
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6);
      g.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (mat) { mat.clippingPlanes = [plane]; mat.clipShadows = true; }
      });
      this.clips[era] = plane;
      this.models[era] = g;
      this.scene.add(g);
    }
    this.dirty = true;
  }

  setAnchors(list: { id: string; pos: Vec3 }[]) {
    this.anchors = list.map((a) => ({ id: a.id, v: anchor(this.spec, a.pos) }));
    this.dirty = true;
  }

  /** switch era; outside (and without reduced motion) a glowing "time sweep" plane crosses the
     maquette and swaps the geometry as it passes */
  setEra(era: Era) {
    const from = this.sweep?.to ?? this.era;
    this.endSweep();
    this.era = era;
    const animate = !this.inside && !this.reduceMotion && from !== era && !!this.models[from] && !!this.models[era];
    if (animate) this.startSweep(from, era);
    else for (const e of this.eras) if (this.models[e]) this.models[e]!.visible = !this.inside && e === era;
    this.dirty = true;
  }

  get sweeping() { return !!this.sweep; }

  private startSweep(from: Era, to: Era) {
    // sweep across the view, tilted toward the camera so the curtain is seen at an angle
    const fwd = this.controls.target.clone().sub(this.camera.position).setY(0).normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const n = right.multiplyScalar(-1).addScaledVector(fwd, 0.55).normalize();
    const box = new THREE.Box3().setFromObject(this.models[from]!).union(new THREE.Box3().setFromObject(this.models[to]!));
    let s0 = Infinity, s1 = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const d = n.x * x + n.y * y + n.z * z;
      s0 = Math.min(s0, d); s1 = Math.max(s1, d);
    }
    const pad = (s1 - s0) * 0.02;
    this.sweep = { from, to, t: 0, n, s0: s0 - pad, s1: s1 + pad };
    this.models[from]!.visible = this.models[to]!.visible = true;
    for (const e of this.eras) if (e !== from && e !== to && this.models[e]) this.models[e]!.visible = false;
    const size = box.getSize(new THREE.Vector3());
    if (!this.glow) this.glow = makeGlow();
    const g = this.glow;
    g.scale.set(Math.hypot(size.x, size.z) * 1.15, size.y * 1.6 + 0.05, 1);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    g.userData.center = box.getCenter(new THREE.Vector3());
    g.userData.y0 = box.min.y;
    g.visible = true;
    if (!g.parent) this.scene.add(g);
    this.clock.getDelta();
    this.applySweep(0);
  }

  private applySweep(e: number) {
    const sw = this.sweep!;
    const s = sw.s0 + (sw.s1 - sw.s0) * e;
    // the old era keeps n·p > s, the new era keeps n·p < s
    this.clips[sw.from]!.set(sw.n, -s);
    this.clips[sw.to]!.set(sw.n.clone().negate(), s);
    const g = this.glow!, c = g.userData.center as THREE.Vector3;
    g.position.copy(c).addScaledVector(sw.n, s - sw.n.dot(c)).setY((g.userData.y0 as number) + g.scale.y / 2 - 0.004);
    (g.material as THREE.MeshBasicMaterial).opacity = Math.min(0.75, Math.sin(Math.PI * e) * 1.4);
  }

  private endSweep() {
    const sw = this.sweep;
    if (!sw) return;
    this.sweep = null;
    for (const e of [sw.from, sw.to]) this.clips[e]?.set(new THREE.Vector3(0, 1, 0), 1e6);
    this.models[sw.from]!.visible = false;
    this.models[sw.to]!.visible = !this.inside && sw.to === this.era;
    if (this.glow) this.glow.visible = false;
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
    this.endSweep();
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
      const dt = this.clock.getDelta();
      if (this.sweep) {
        const sw = this.sweep;
        sw.t = Math.min(1, sw.t + Math.min(dt, 0.05) / 1.5);
        const e = sw.t < 0.5 ? 2 * sw.t * sw.t : 1 - Math.pow(-2 * sw.t + 2, 2) / 2;
        this.applySweep(e);
        if (sw.t >= 1) this.endSweep();
        this.dirty = true;
      }
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
