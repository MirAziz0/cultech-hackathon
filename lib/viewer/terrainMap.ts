/* 3D relief map of Azerbaijan for the home page: a terrain diorama in the style of a cut-out
   relief block (layered soil on the sides), with the 14 economic regions painted on top and
   monument pins standing on the terrain. World units = map units of lib/map-data.json
   (x right, z = map y down); heights come from public/map/az-height.webp (scripts/make-terrain.ts). */
import * as THREE from "three";
import { MapControls } from "three/examples/jsm/controls/MapControls.js";
import mapData from "../map-data.json";
import meta from "../terrain-meta.json";

export interface TerrainPin { slug: string; x: number; y: number; showPin: boolean }
export interface PinScreen { slug: string; x: number; y: number; visible: boolean }
export interface TerrainMapOptions {
  pins: TerrainPin[];
  onRegion?: (id: string | null) => void;
  onPinHover?: (slug: string | null) => void;
  onPinClick?: (slug: string) => void;
  /** called every frame with the screen position of each pin head and each place name (for HTML labels) */
  onFrame?: (pins: PinScreen[], places: PinScreen[]) => void;
  /** geographic names drawn over the map (mountains, rivers, sea), in map coordinates */
  places?: { id: string; x: number; y: number }[];
  reducedMotion?: boolean;
  /** on wide screens, move the country right by this fraction of the width (room for overlaid text) */
  shiftRight?: number;
}

const EXAG = 0.0058; // world units per metre (~4.5x vertical exaggeration)
const BASE = -16; // bottom of the soil block
// phones get a lighter mesh / texture / shadow map; desktops the sharp one
const COARSE = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
const SEG = COARSE ? 1.8 : 1.0; // map units per terrain grid cell
const TEX_W = COARSE ? 2048 : 4096;
const SHADOW = COARSE ? 2048 : 4096;
const PIN_STEM = 30;
const ACCENT = new THREE.Color("#007a87");
const HOT = new THREE.Color("#a33a2b");

// hypsometric tints (metres → colour), muted to sit on a white page
const TINTS: [number, [number, number, number]][] = [
  [-30, [196, 205, 166]], [150, [184, 196, 150]], [500, [166, 180, 128]], [1100, [176, 166, 118]],
  [1800, [160, 134, 100]], [2700, [140, 114, 98]], [3400, [196, 186, 176]], [4000, [245, 243, 240]],
];
// soil layers from the surface down (depth in world units), echoing the #806363 → #b0927a brand gradient
const STRATA: [number, string][] = [
  [0, "#5a4a3c"], [0.8, "#806363"], [4, "#8f7268"], [7, "#b0927a"], [9.5, "#c6ad93"], [12, "#a3846f"],
  [17, "#b0927a"], [23, "#8d7067"], [30, "#6f5652"], [40, "#6f5652"],
];

const CX = meta.x0 + meta.width / 2;
const CZ = meta.y0 + meta.height / 2;
const GW = meta.width * meta.scale; // heightmap grid size (meta.scale samples per map unit)
const GH = meta.height * meta.scale;

export class TerrainMap {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 10, 5000);
  private controls: MapControls;
  private fly: { t: number; speed: number; fromPos: THREE.Vector3; fromTarget: THREE.Vector3; toPos: THREE.Vector3; toTarget: THREE.Vector3 } | null = null;
  private down = { x: 0, y: 0 };
  private moved = false;
  private terrain?: THREE.Mesh;
  private topTex?: THREE.CanvasTexture;
  private topCanvas = document.createElement("canvas");
  private baseLayer = document.createElement("canvas");
  private heights = new Float32Array(GW * GH);
  private regionPaths = mapData.regions.map((r) => ({ id: r.id, path: new Path2D(r.d) }));
  private landPath = this.regionPaths.reduce((all, r) => (all.addPath(r.path), all), new Path2D());
  private hitCtx = document.createElement("canvas").getContext("2d")!;
  private pinMeshes = new Map<string, { head: THREE.Mesh; group: THREE.Group }>();
  private pins: TerrainPin[];
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private region: string | null = null;
  private hoverPin: string | null = null;
  private raf = 0;
  private visible = true;
  private io: IntersectionObserver;
  private intro = 0;
  private dist = 1150;
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement, private opts: TerrainMapOptions) {
    this.pins = opts.pins;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" }));
    // native resolution: rendering above it (supersampling) stalled integrated GPUs to ~1 fps
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    // sun and terrain never move: draw the (4096 px) shadow map only when something casting a shadow changes,
    // not on every frame of a camera flight
    r.shadowMap.autoUpdate = false;

    this.placeCamera(1);
    // no mouse / touch navigation: the camera only moves by hovering a region or via the buttons
    const c = (this.controls = new MapControls(this.camera, canvas));
    c.target.set(0, 0, 15);
    c.enabled = false;
    c.minDistance = 90;

    // a little less ambient and a stronger, low sun deepen the relief shading
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xc9b8a6, 0.66));
    const sun = new THREE.DirectionalLight(0xfff8ee, 1.45);
    sun.position.set(-300, 300, 140);
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW, SHADOW);
    Object.assign(sun.shadow.camera, { left: -460, right: 460, top: 420, bottom: -420, near: 10, far: 1400 });
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.6;
    this.scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.ShadowMaterial({ opacity: 0.35 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = BASE - 0.2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    // leaving is judged on the whole map figure, so hovering a pin label doesn't zoom back out
    (canvas.parentElement ?? canvas).addEventListener("pointerleave", this.onLeave);
    canvas.addEventListener("click", this.onClick);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; });
    this.io.observe(canvas);
    this.intro = opts.reducedMotion ? 1 : 0;
  }

  async load() {
    const img = new Image();
    img.src = `/map/${meta.file}`;
    await img.decode();
    if (this.disposed) return;
    const cv = document.createElement("canvas");
    cv.width = GW;
    cv.height = GH;
    const ctx = cv.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, GW, GH).data;
    // elevation in `meta.step` metre steps: R = high byte, G = low byte folded (reversed when R is odd) so the
    // image stays smooth and compresses well
    for (let i = 0; i < this.heights.length; i++) {
      const hi = px[i * 4], g = px[i * 4 + 1];
      this.heights[i] = (hi * 256 + (hi & 1 ? 255 - g : g)) * meta.step + meta.min;
    }

    this.buildBaseLayer();
    this.buildTerrain();
    this.buildWalls();
    this.buildPins();
    this.resize();
    // compile the shaders in parallel first, so the first frame doesn't freeze the page while they compile
    await this.renderer.compileAsync(this.scene, this.camera).catch(() => {});
    if (this.disposed) return;
    this.renderer.shadowMap.needsUpdate = true;
    this.loop();
  }

  /** bilinear elevation in metres at map coords */
  private elev(mx: number, my: number) {
    const x = Math.max(0, Math.min(GW - 1.001, (mx - meta.x0) * meta.scale - 0.5));
    const y = Math.max(0, Math.min(GH - 1.001, (my - meta.y0) * meta.scale - 0.5));
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, w = GW, h = this.heights;
    const a = h[j * w + i], b = h[j * w + i + 1], c = h[(j + 1) * w + i], d = h[(j + 1) * w + i + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  private heightAt = (mx: number, my: number) => Math.max(0, this.elev(mx, my)) * EXAG;
  /** pins on Azerbaijan stand on the terrain; pins outside it (e.g. Irevan) stand on the table */
  private pinBase = (p: { x: number; y: number }) => (this.hitCtx.isPointInPath(this.landPath, p.x, p.y) ? this.heightAt(p.x, p.y) : BASE);

  /** elevation colours with a baked hillshade, one pixel per heightmap sample */
  private buildBaseLayer() {
    const w = GW, h = GH;
    this.baseLayer.width = w;
    this.baseLayer.height = h;
    const ctx = this.baseLayer.getContext("2d")!;
    const img = ctx.createImageData(w, h);
    const H = this.heights;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const e = H[y * w + x];
      let k = 0;
      while (k < TINTS.length - 2 && e > TINTS[k + 1][0]) k++;
      const [e0, c0] = TINTS[k], [e1, c1] = TINTS[k + 1];
      const t = Math.max(0, Math.min(1, (e - e0) / (e1 - e0)));
      // light from the north-west, like a classic hillshade
      const dx = H[y * w + Math.min(w - 1, x + 1)] - H[y * w + Math.max(0, x - 1)];
      const dy = H[Math.min(h - 1, y + 1) * w + x] - H[Math.max(0, y - 1) * w + x];
      // neighbours are 1/scale map units apart, so scale the slope to keep the same shading strength
      const shade = Math.max(0.7, Math.min(1.2, 1 - (dx + dy) * 0.0016 * meta.scale));
      const o = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) img.data[o + ch] = Math.min(255, (c0[ch] + (c1[ch] - c0[ch]) * t) * shade);
      img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.topCanvas.width = TEX_W;
    this.topCanvas.height = Math.round((TEX_W * meta.height) / meta.width);
  }

  /** paints the terrain texture: relief colours, region borders, hovered region, cut to Azerbaijan */
  private paintTop() {
    const cv = this.topCanvas, ctx = cv.getContext("2d")!;
    const s = cv.width / meta.width;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(this.baseLayer, 0, 0, cv.width, cv.height);
    ctx.setTransform(s, 0, 0, s, -meta.x0 * s, -meta.y0 * s);
    ctx.lineJoin = "round";
    const hot = this.regionPaths.find((r) => r.id === this.region);
    if (hot) {
      ctx.fillStyle = "rgba(0, 122, 135, 0.34)";
      ctx.fill(hot.path);
    }
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 0.9;
    ctx.stroke(new Path2D(mapData.regionLines));
    if (hot) {
      ctx.strokeStyle = "#007a87";
      ctx.lineWidth = 1.6;
      ctx.stroke(hot.path);
    }
    ctx.strokeStyle = "#007a87";
    ctx.lineWidth = 1.4;
    ctx.stroke(new Path2D(mapData.azOutline));
    // cut everything outside Azerbaijan in one pass (each destination-in fill clears outside itself);
    // alphaTest then discards it on the GPU
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = "#000";
    ctx.fill(this.landPath);
    if (this.topTex) this.topTex.needsUpdate = true;
    this.dirty = true;
  }

  private buildTerrain() {
    const sx = Math.round(meta.width / SEG), sz = Math.round(meta.height / SEG);
    const geo = new THREE.PlaneGeometry(meta.width, meta.height, sx, sz);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.heightAt(pos.getX(i) + CX, pos.getZ(i) + CZ));
    geo.computeVertexNormals();
    this.paintTop();
    const tex = (this.topTex = new THREE.CanvasTexture(this.topCanvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.95, metalness: 0 });
    const mesh = (this.terrain = new THREE.Mesh(geo, mat));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  /** soil walls along every border ring, banded by depth below the surface */
  private buildWalls() {
    const tc = document.createElement("canvas");
    tc.width = 4;
    tc.height = 512;
    const tctx = tc.getContext("2d")!;
    const maxDepth = STRATA[STRATA.length - 1][0];
    for (let i = 0; i < STRATA.length - 1; i++) {
      const [d0, col] = STRATA[i], [d1] = STRATA[i + 1];
      tctx.fillStyle = col;
      tctx.fillRect(0, (d0 / maxDepth) * 512, 4, ((d1 - d0) / maxDepth) * 512 + 1);
    }
    const tex = new THREE.CanvasTexture(tc);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;

    const pos: number[] = [], uv: number[] = [];
    for (const ring of mapData.azOutline.split("M").filter(Boolean)) {
      const pts = [...ring.matchAll(/(-?\d+),(-?\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
      if (pts.length < 6) continue;
      let u = 0;
      for (let i = 0; i < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
        const ha = this.heightAt(ax, az), hb = this.heightAt(bx, bz);
        const len = Math.hypot(bx - ax, bz - az);
        const A = [ax - CX, az - CZ], B = [bx - CX, bz - CZ];
        const da = (ha - BASE) / maxDepth, db = (hb - BASE) / maxDepth;
        pos.push(A[0], ha, A[1], B[0], hb, B[1], B[0], BASE, B[1], A[0], ha, A[1], B[0], BASE, B[1], A[0], BASE, A[1]);
        uv.push(u, 0, u + len / 40, 0, u + len / 40, db, u, 0, u + len / 40, db, u, da);
        u += len / 40;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const wall = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 1 }));
    wall.castShadow = true;
    wall.receiveShadow = true;
    this.scene.add(wall);
  }

  private buildPins() {
    const stemGeo = new THREE.CylinderGeometry(1.1, 1.1, PIN_STEM, 10);
    stemGeo.translate(0, PIN_STEM / 2, 0);
    const headGeo = new THREE.SphereGeometry(6, 24, 16);
    const ringGeo = new THREE.RingGeometry(4, 10, 32);
    ringGeo.rotateX(-Math.PI / 2);
    for (const p of this.pins) {
      if (!p.showPin) continue;
      const g = new THREE.Group();
      g.position.set(p.x - CX, this.pinBase(p), p.y - CZ);
      const stem = new THREE.Mesh(stemGeo, new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.5 }));
      const head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: ACCENT, roughness: 0.35 }));
      head.position.y = PIN_STEM + 5;
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.35, depthWrite: false }));
      ring.position.y = 0.4;
      stem.castShadow = head.castShadow = true;
      for (const m of [stem, head]) m.userData.slug = p.slug;
      g.add(stem, head, ring);
      this.scene.add(g);
      this.pinMeshes.set(p.slug, { head, group: g });
    }
  }

  /** the pin (one per city) that carries a monument */
  private ownerOf(slug: string) {
    const p = this.pins.find((x) => x.slug === slug);
    return p ? (this.pins.find((o) => o.showPin && Math.hypot(o.x - p.x, o.y - p.y) < 24) ?? p).slug : undefined;
  }

  /** highlight the pin for a monument (also driven by hovering the cards below the map) */
  setHover(slug: string | null) {
    this.hoverPin = slug;
    this.stylePins();
  }

  private stylePins() {
    const hovered = this.hoverPin ? this.ownerOf(this.hoverPin) : undefined;
    for (const [s, { head }] of this.pinMeshes) {
      const on = s === hovered;
      (head.material as THREE.MeshStandardMaterial).color.copy(on ? HOT : ACCENT);
      head.scale.setScalar(on ? 1.3 : 1);
    }
    this.renderer.shadowMap.needsUpdate = true;
    this.dirty = true;
  }

  /** fly down to a monument's pin, then call `done` (used to open its page after the flight) */
  flyToPin(slug: string, done: () => void) {
    const p = this.pins.find((x) => x.slug === slug);
    if (!p) return done();
    const target = new THREE.Vector3(p.x - CX, this.pinBase(p), p.y - CZ);
    const off = this.camera.position.clone().sub(this.controls.target).setLength(220);
    clearTimeout(this.dwell);
    this.cancelReset();
    this.focused = null;
    this.moved = true;
    this.flyTo(target.clone().add(off), target, 0.022);
    this.afterFly = done;
    if (this.opts.reducedMotion) { this.afterFly = null; done(); }
  }
  private afterFly: (() => void) | null = null;

  private pick(e: { clientX: number; clientY: number }) {
    const b = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const heads = [...this.pinMeshes.values()].flatMap((p) => p.group.children.slice(0, 2));
    const pin = this.ray.intersectObjects(heads, false)[0]?.object.userData.slug as string | undefined;
    // the terrain outside Azerbaijan is cut away only in the texture, so its (invisible) mountains
    // still catch rays — e.g. Iran's in front of Nakhchivan. Take the first hit that lands on Azerbaijan.
    let region: string | null = null;
    let point: THREE.Vector3 | null = null;
    for (const hit of this.terrain ? this.ray.intersectObject(this.terrain, false) : []) {
      if (!hit.uv) continue;
      const mx = meta.x0 + hit.uv.x * meta.width, my = meta.y0 + (1 - hit.uv.y) * meta.height;
      const id = this.regionPaths.find((r) => this.hitCtx.isPointInPath(r.path, mx, my))?.id;
      if (id) {
        region = id;
        point = hit.point.clone();
        break;
      }
    }
    return { pin: pin ?? null, region, point };
  }

  private pointer: { clientX: number; clientY: number } | null = null;
  private onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || !this.terrain) return;
    this.pointer = { clientX: e.clientX, clientY: e.clientY };
    // while the camera is flying the terrain slides under a still cursor (and the browser keeps
    // sending moves for it): judge the hover only once the camera has stopped (see loop)
    if (this.fly || this.intro < 1) return;
    this.hoverAt(this.pointer);
  };

  private hoverAt(p: { clientX: number; clientY: number }) {
    const { pin, region, point } = this.pick(p);
    this.canvas.style.cursor = pin ? "pointer" : "";
    if (pin !== this.hoverPin) this.opts.onPinHover?.(pin);
    // back on the country (or a pin): stay; off it (Armenia, Iran, the sea, the background): fly home
    if (region || pin) this.cancelReset();
    if (region !== this.region) {
      this.region = region;
      this.paintTop();
      this.opts.onRegion?.(region);
      clearTimeout(this.dwell);
      if (region && point) this.scheduleFocus(region, point);
      else if (!pin) this.scheduleReset();
    }
  }

  /** the pointer left the whole map (labels inside it don't count): fly back out after a moment */
  private onLeave = () => {
    this.pointer = null;
    clearTimeout(this.dwell);
    if (this.region) {
      this.region = null;
      this.paintTop();
      this.opts.onRegion?.(null);
    }
    this.opts.onPinHover?.(null);
    this.scheduleReset();
  };
  private cancelReset() { clearTimeout(this.resetTimer); }
  private scheduleReset() {
    this.cancelReset();
    // short grace period so brushing past the coastline doesn't snap the view back
    this.resetTimer = setTimeout(() => { if (this.moved || this.focused) this.resetView(); }, 450);
  }

  /* ---- hover zoom: resting on a region zooms into it around the cursor ---- */

  private dwell?: ReturnType<typeof setTimeout>;
  private resetTimer?: ReturnType<typeof setTimeout>;
  private focused: string | null = null;
  private scheduleFocus(region: string, point: THREE.Vector3) {
    // a short dwell so sweeping the mouse across the map doesn't send the camera bouncing
    this.dwell = setTimeout(() => {
      if (region === this.focused) return;
      this.focused = region;
      this.focusRegion(region, point);
    }, 380);
  }

  private regionSize = new Map(mapData.regions.map((r) => {
    const pts = [...r.d.matchAll(/(-?\d+),(-?\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return [r.id, Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))] as const;
  }));

  /** zoom about the point under the cursor: scaling the camera and target around that point keeps
      it at the same spot on screen, so the region stays under the mouse (no ping-pong between
      regions, works for the Nakhchivan exclave and at the map's edges alike) */
  private focusRegion(id: string, point: THREE.Vector3) {
    const size = this.regionSize.get(id) ?? 120;
    const c = this.controls;
    const cur = this.camera.position.distanceTo(c.target);
    const want = THREE.MathUtils.clamp(size * 3.4, 320, this.dist * 0.7);
    const k = want / cur;
    const toPos = point.clone().add(this.camera.position.clone().sub(point).multiplyScalar(k));
    const toTarget = point.clone().add(c.target.clone().sub(point).multiplyScalar(k));
    this.moved = true;
    this.flyTo(toPos, toTarget);
  }

  private onDown = (e: PointerEvent) => { this.down = { x: e.clientX, y: e.clientY }; };

  private onClick = (e: MouseEvent) => {
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5) return;
    const { pin } = this.pick(e);
    if (pin) this.opts.onPinClick?.(pin);
  };

  /* ---- buttons ---- */

  /** zoom in (f < 1) or out (f > 1) around the current target */
  zoomBy(f: number) {
    const c = this.controls;
    const off = this.camera.position.clone().sub(c.target);
    const len = THREE.MathUtils.clamp(off.length() * f, c.minDistance, c.maxDistance);
    this.moved = true;
    this.flyTo(c.target.clone().add(off.setLength(len)), c.target.clone());
  }

  /** back to the whole-country view */
  resetView() {
    this.moved = false;
    this.focused = null;
    const t = new THREE.Vector3(0, 0, 15);
    this.flyTo(this.homePosition(), t);
  }

  private flyTo(toPos: THREE.Vector3, toTarget: THREE.Vector3, speed = 0.03) {
    if (this.opts.reducedMotion) {
      this.camera.position.copy(toPos);
      this.controls.target.copy(toTarget);
      return;
    }
    this.fly = { t: 0, speed, fromPos: this.camera.position.clone(), fromTarget: this.controls.target.clone(), toPos, toTarget };
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.dirty = true;
    this.camera.aspect = w / h;
    // wide hero: shift the country right so the overlaid text on the left keeps clear of it
    // (portrait: push it down instead, below the text)
    const shift = this.opts.shiftRight && w / h > 1.3 ? this.opts.shiftRight : 0;
    if (shift) this.camera.setViewOffset(w, h, -w * shift, 0, w, h);
    else if (this.opts.shiftRight) this.camera.setViewOffset(w, h, 0, -h * 0.17, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    // distance that fits the country (plus margin) in the free part of the view, both ways
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect * (1 - shift * 2));
    const fit = Math.max((meta.width * 0.5) / Math.tan(hfov / 2), (meta.height * 0.54) / Math.tan(vfov / 2));
    this.dist = fit;
    // the home view is the furthest zoom-out, so scrolling down from it goes straight to the page
    this.controls.maxDistance = fit * 1.01;
    // untouched view follows the new size; a view the visitor moved is left alone
    if (this.intro >= 1 && !this.moved && !this.fly) this.placeCamera(1);
  }

  /** t = 0: top-down and far, t = 1: the tilted diorama view (used for the intro ease) */
  private homePosition(t = 1) {
    const polar = 0.3 + (0.8 - 0.3) * t, dist = this.dist * (1.3 - 0.3 * t);
    return new THREE.Vector3(0, Math.cos(polar) * dist, Math.sin(polar) * dist + 15);
  }
  private placeCamera(t: number) { this.camera.position.copy(this.homePosition(t)); }

  private v = new THREE.Vector3();
  private lastPose: number[] = [];
  /** set when the scene changes without the camera moving (texture repaint, pin highlight, resize) */
  private dirty = true;
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.visible) return;
    const c = this.controls;
    if (this.intro < 1) {
      this.intro = Math.min(1, this.intro + 0.012);
      this.placeCamera(1 - (1 - this.intro) ** 3);
      if (this.intro >= 1 && this.pointer) this.hoverAt(this.pointer);
    } else if (this.fly) {
      const f = this.fly;
      f.t = Math.min(1, f.t + f.speed);
      const k = 1 - (1 - f.t) ** 3;
      this.camera.position.lerpVectors(f.fromPos, f.toPos, k);
      c.target.lerpVectors(f.fromTarget, f.toTarget, k);
      if (f.t >= 1) {
        this.fly = null;
        const done = this.afterFly;
        this.afterFly = null;
        if (done) done();
        // the camera has settled: re-read what is under the (possibly still) mouse
        else if (this.pointer) this.hoverAt(this.pointer);
      }
    }
    c.update();
    // keep the view over the map: clamp the orbit target, dragging the camera along
    const tx = THREE.MathUtils.clamp(c.target.x, -meta.width / 2, meta.width / 2);
    const tz = THREE.MathUtils.clamp(c.target.z, -meta.height / 2, meta.height / 2);
    if (tx !== c.target.x || tz !== c.target.z) {
      this.camera.position.x += tx - c.target.x;
      this.camera.position.z += tz - c.target.z;
      c.target.set(tx, c.target.y, tz);
    }
    // render on demand: only when the camera moved or something in the scene changed
    const pose = this.camera.position.toArray().concat(c.target.toArray());
    const moved = pose.some((v, i) => Math.abs(v - this.lastPose[i]) > 1e-4);
    if (!moved && !this.dirty) return;
    this.lastPose = pose;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
    if (this.opts.onFrame) {
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      const toScreen = (slug: string, x: number, y: number, lift: number): PinScreen => {
        this.v.set(x - CX, lift, y - CZ).project(this.camera);
        return { slug, x: ((this.v.x + 1) / 2) * w, y: ((1 - this.v.y) / 2) * h, visible: this.v.z < 1 };
      };
      this.opts.onFrame(
        this.pins.map((p) => {
          const owner = this.pins.find((o) => o.showPin && Math.hypot(o.x - p.x, o.y - p.y) < 24) ?? p;
          return toScreen(p.slug, owner.x, owner.y, this.pinBase(owner) + PIN_STEM + 5);
        }),
        // place names sit just above the terrain (or at sea level off the land)
        (this.opts.places ?? []).map((pl) => toScreen(pl.id, pl.x, pl.y, Math.max(0, this.pinBase(pl)) + 4)),
      );
    }
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.io.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    (this.canvas.parentElement ?? this.canvas).removeEventListener("pointerleave", this.onLeave);
    clearTimeout(this.resetTimer);
    this.canvas.removeEventListener("click", this.onClick);
    clearTimeout(this.dwell);
    this.controls.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material as THREE.MeshStandardMaterial;
        m.map?.dispose();
        m.dispose();
      }
    });
    this.renderer.dispose();
  }
}
