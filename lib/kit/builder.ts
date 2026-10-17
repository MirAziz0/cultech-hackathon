/* Collects geometry per material in world space, then merges each bucket into one mesh
   (static geometry → a handful of draw calls). Frames give local coordinate systems. */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Materials } from "./materials";

export interface LightDef { pos: THREE.Vector3; intensity: number; distance: number; color: number }

/** world-space planar UVs so textures stay continuous across merged parts (from reference walk.js) */
export function worldUV(geo: THREE.BufferGeometry, s = 2) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u / s;
    uv[i * 2 + 1] = v / s;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

export class Builder {
  readonly mats: Materials;
  private buckets = new Map<string, THREE.BufferGeometry[]>();
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  readonly lights: LightDef[] = [];
  /** non-merged objects (animated or transparent) */
  readonly extras: THREE.Object3D[] = [];
  /** default material overrides from the manifest, e.g. { stone: "stoneGrey" } */
  alias: Record<string, string> = {};

  constructor(mats?: Materials) {
    this.mats = mats ?? new Materials();
  }

  get frame() {
    return this.stack[this.stack.length - 1];
  }
  push(m: THREE.Matrix4) {
    this.stack.push(this.frame.clone().multiply(m));
  }
  pop() {
    if (this.stack.length > 1) this.stack.pop();
  }

  resolve(key: string) {
    const hit = this.alias[key];
    if (hit) return hit;
    // "xxxDS" follows the alias of "xxx" (double-sided variant)
    if (key.endsWith("DS")) {
      const base = this.alias[key.slice(0, -2)];
      if (base) return base === "none" ? "none" : base.endsWith("DS") ? base : base + "DS";
    }
    return key;
  }

  /** add geometry in local frame coords; `local` is applied first */
  add(geo: THREE.BufferGeometry, matKey: string, local?: THREE.Matrix4) {
    const key = this.resolve(matKey);
    // an era can alias a material to "none" (e.g. window glass that is gone) — skip the surface
    if (key === "none") { geo.dispose(); return; }
    if (local) geo.applyMatrix4(local);
    geo.applyMatrix4(this.frame);
    const info = this.mats.get(key);
    if (info.worldUV) worldUV(geo, info.worldUV);
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    // keep only shared attributes so buckets merge cleanly
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    g.clearGroups();
    const list = this.buckets.get(key) ?? [];
    list.push(g);
    this.buckets.set(key, list);
    g = null as unknown as THREE.BufferGeometry;
  }

  /** point in current frame → world */
  world(x: number, y: number, z: number) {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.frame);
  }

  light(x: number, y: number, z: number, intensity = 1, distance = 10, color = 0xffcf96) {
    this.lights.push({ pos: this.world(x, y, z), intensity, distance, color });
  }

  extra(o: THREE.Object3D) {
    o.applyMatrix4(this.frame);
    this.extras.push(o);
  }

  /** merge every bucket into one mesh per material */
  finish(opts: { shadows?: boolean } = {}): THREE.Group {
    const group = new THREE.Group();
    for (const [key, geos] of this.buckets) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) {
        console.warn(`[kit] merge failed for ${key}`);
        continue;
      }
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, this.mats.get(key).mat);
      mesh.name = key;
      mesh.matrixAutoUpdate = false;
      if (opts.shadows) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      group.add(mesh);
    }
    this.buckets.clear();
    for (const e of this.extras) group.add(e);
    return group;
  }

  stats() {
    let tris = 0;
    for (const geos of this.buckets.values()) for (const g of geos) tris += g.attributes.position.count / 3;
    return { buckets: this.buckets.size, tris };
  }
}

export const M4 = () => new THREE.Matrix4();
export const D2R = Math.PI / 180;
