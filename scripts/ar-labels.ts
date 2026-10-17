/* 3D name tags baked into the AR models. Quick Look / Scene Viewer can't show HTML labels,
   so each building gets a small sign on a pin: real geometry, readable from front and back.
   Font: Noto Sans Bold (OFL), it covers Azerbaijani letters (ə, ı, ş, ğ …). */
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { TTFLoader } from "three/examples/jsm/loaders/TTFLoader.js";
import { Font } from "three/examples/jsm/loaders/FontLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { anchor } from "../lib/kit/exterior";
import type { Era, Lang, Manifest } from "../lib/types";

let font: Font | null = null;
function getFont() {
  if (!font) {
    const buf = fs.readFileSync(path.join(process.cwd(), "assets", "fonts", "NotoSans-Bold.ttf"));
    const json = new TTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    font = new Font(json);
  }
  return font;
}

const plateMat = () => new THREE.MeshStandardMaterial({ color: 0x1f1a14, roughness: 0.8, metalness: 0 });
const textMat = () => new THREE.MeshStandardMaterial({ color: 0xf5ecd8, emissive: 0x5a5242, roughness: 0.6, metalness: 0 });
const pinMat = () => new THREE.MeshStandardMaterial({ color: 0xc8a96a, roughness: 0.5, metalness: 0.2 });

/** flat text (a few triangles per glyph, unlike extruded text) */
function textMesh(str: string, size: number, mat: THREE.Material) {
  const g = new THREE.ShapeGeometry(getFont().generateShapes(str, size), 2);
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  g.translate(-(bb.max.x + bb.min.x) / 2, -(bb.max.y + bb.min.y) / 2, 0);
  return { mesh: new THREE.Mesh(g, mat), width: bb.max.x - bb.min.x };
}

/** Group of signs for the buildings visible in this era, sized relative to the model. */
export function buildArLabels(m: Manifest, era: Era, lang: Lang, model: THREE.Object3D) {
  const group = new THREE.Group();
  group.name = "ar-labels";
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  const h = Math.max(size.x, size.y, size.z) * 0.026; // text cap height
  const depth = h * 0.08;
  const face = THREE.MathUtils.degToRad(m.exterior.home.az); // face the default camera
  const mats = { plate: plateMat(), text: textMat(), pin: pinMat() };

  const list = m.buildings.filter((b) => !(b.pastOnly && era === "today") && !(b.todayOnly && era === "past"));
  const right = new THREE.Vector3(Math.cos(face), 0, -Math.sin(face)); // sign's horizontal axis
  model.updateMatrixWorld(true);
  const top = new THREE.Box3().setFromObject(model).max.y + 1;
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  /** highest model surface under a horizontal strip (so signs never sink into a building) */
  const groundUnder = (c: THREE.Vector3, halfW: number) => {
    let y = -Infinity;
    for (let i = -4; i <= 4; i++) {
      ray.set(new THREE.Vector3(c.x, top, c.z).addScaledVector(right, (halfW * i) / 4), down);
      const hit = ray.intersectObject(model, true)[0];
      if (hit) y = Math.max(y, hit.point.y);
    }
    return y;
  };

  const signs = list.map((b) => {
    const name = (lang === "en" ? b.name.en : b.name.az) || b.name.az;
    const at = anchor(m.exterior, b.pos);
    const front = textMesh(name, h, mats.text);
    const pad = h * 0.6;
    const w = front.width + pad * 2, hh = h * 1.4 + pad;
    const bottom = Math.max(at.y + h * 1.5, groundUnder(at, w / 2) + h * 0.8);
    return { name, at, front, w, hh, bottom, u: at.dot(right) };
  });
  // Stack signs that would overlap as seen from the default camera (same view as the web viewer):
  // lowest first, push later ones up until their screen rectangles are clear.
  const hm = m.exterior.home;
  const az = THREE.MathUtils.degToRad(hm.az), pol = THREE.MathUtils.degToRad(hm.pol);
  const cam = new THREE.PerspectiveCamera(35, 1.4, 0.01, 50);
  const tgt = new THREE.Vector3(...hm.target);
  cam.position.set(tgt.x + hm.dist * Math.sin(pol) * Math.sin(az), tgt.y + hm.dist * Math.cos(pol), tgt.z + hm.dist * Math.sin(pol) * Math.cos(az));
  cam.lookAt(tgt);
  cam.updateMatrixWorld(true);
  const rectOf = (s: (typeof signs)[number]) => {
    const r = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    for (const dx of [-1, 1]) for (const dy of [0, 1]) {
      const p = s.at.clone().setY(s.bottom + dy * s.hh).addScaledVector(right, (dx * s.w) / 2).project(cam);
      r.x0 = Math.min(r.x0, p.x); r.x1 = Math.max(r.x1, p.x); r.y0 = Math.min(r.y0, p.y); r.y1 = Math.max(r.y1, p.y);
    }
    return r;
  };
  signs.sort((p, q) => p.bottom - q.bottom);
  const placed: ReturnType<typeof rectOf>[] = [];
  const step = h * 0.25;
  for (const s of signs) {
    for (let i = 0; i < 400; i++) {
      const r = rectOf(s), m = (r.y1 - r.y0) * 0.6; // generous margin: AR is seen from many angles
      if (!placed.some((q) => r.x0 < q.x1 + m && r.x1 > q.x0 - m && r.y0 < q.y1 + m && r.y1 > q.y0 - m)) break;
      s.bottom += step;
    }
    placed.push(rectOf(s));
  }

  for (const s of signs) {
    const { at, front, w, hh } = s;
    const sign = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(w, hh, depth * 2), mats.plate);
    front.mesh.position.z = depth * 1.1;
    const back = textMesh(s.name, h, mats.text);
    back.mesh.rotation.y = Math.PI;
    back.mesh.position.z = -depth * 1.1;
    sign.add(plate, front.mesh, back.mesh);
    sign.position.set(at.x, s.bottom + hh / 2, at.z);
    sign.rotation.y = face;

    const pinLen = s.bottom - at.y;
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.06, h * 0.06, pinLen, 6), mats.pin);
    pin.position.set(at.x, at.y + pinLen / 2, at.z);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(h * 0.22, 10, 6), mats.pin);
    dot.position.copy(at);

    group.add(sign, pin, dot);
  }
  // one mesh per material instead of hundreds of small nodes
  group.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    g = g.applyMatrix4(mesh.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const mat = mesh.material as THREE.Material;
    byMat.set(mat, [...(byMat.get(mat) ?? []), g]);
  });
  const out = new THREE.Group();
  out.name = "ar-labels";
  for (const [mat, geos] of byMat) out.add(new THREE.Mesh(mergeGeometries(geos), mat));
  return out;
}
