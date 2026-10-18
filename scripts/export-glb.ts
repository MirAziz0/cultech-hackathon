/* Exports each monument's exterior maquette (both eras, with name tags per language) to
   public/monuments/<slug>/models/<era>.<lang>.{glb,usdz}
   using the same kit as the browser viewer. These GLBs feed <model-viewer> for AR
   (Scene Viewer on Android, Quick Look via auto-generated USDZ on iOS).
   usage: npx tsx scripts/export-glb.ts [slug ...] */
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter.js";
import { buildExterior } from "../lib/kit/exterior";
import type { Era, Lang, Manifest } from "../lib/types";
import sharp from "sharp";
import { buildArLabels } from "./ar-labels";

// GLTFExporter uses FileReader to pack the binary; Node has Blob but no FileReader.
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onload: ((e: unknown) => void) | null = null;
  onloadend: ((e: unknown) => void) | null = null;
  readAsArrayBuffer(b: Blob) {
    b.arrayBuffer().then((buf) => { this.result = buf; this.onload?.({ target: this }); this.onloadend?.({ target: this }); });
  }
  readAsDataURL(b: Blob) {
    b.arrayBuffer().then((buf) => {
      this.result = `data:${b.type || "application/octet-stream"};base64,${Buffer.from(buf).toString("base64")}`;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    });
  }
}
(globalThis as unknown as { FileReader: unknown }).FileReader = NodeFileReader;

const ROOT = path.join(process.cwd(), "content", "monuments");

const TEX_DIR = path.join(process.cwd(), "content", "textures");
type Rgb = [number, number, number];

/** a texture placeholder: buildExterior only needs something to put in `map`; the photo itself is
   packed into the GLB afterwards (GLTFExporter cannot read images in Node) */
const stubTexture = (name: string) => { const t = new THREE.Texture(); t.userData.src = name; return t; };

/** what a photo-textured surface needs in AR: its photo (≤512 px JPEG, brightened when the tint is
   above 1, since glTF factors stop at 1), the glTF colour factor, and a flat colour for USDZ */
interface ArTex { key: string; jpg: Buffer; factor: Rgb; flat: Rgb }
const texCache = new Map<string, Promise<{ jpg: Buffer; avg: Rgb }>>();
const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function loadPhoto(name: string, boost: number) {
  const key = `${name}@${boost.toFixed(3)}`;
  let p = texCache.get(key);
  if (!p) {
    p = (async () => {
      const file = path.join(TEX_DIR, `${name}.jpg`);
      let img = sharp(file).resize(512, 512, { fit: "inside" });
      if (boost > 1.001) img = img.linear(boost, 0);
      const jpg = await img.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      const px = await sharp(jpg).resize(1, 1, { fit: "fill" }).raw().toBuffer();
      return { jpg, avg: [srgbToLinear(px[0] / 255), srgbToLinear(px[1] / 255), srgbToLinear(px[2] / 255)] as Rgb };
    })();
    texCache.set(key, p);
  }
  return p;
}

/** AR colours closer to the real thing: flat palette colours are read as sRGB (the browser keeps the old
   linear reading, which looks washed out in AR), photo-textured surfaces get their photo (GLB) or its
   average colour (USDZ). Returns the photos to pack, by material name. */
async function arMaterials(model: THREE.Object3D, usdz: boolean) {
  const out = new Map<string, ArTex>();
  const meshes: THREE.Mesh[] = [];
  model.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  for (const mesh of meshes) {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat?.isMeshStandardMaterial) continue;
    const src = mat.map?.userData.src as string | undefined;
    mat.map = null;
    mat.normalMap = null;
    if (!src) {
      const c = mat.color;
      c.setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace);
      continue;
    }
    const tint = [mat.color.r, mat.color.g, mat.color.b] as Rgb;
    const boost = Math.max(1, ...tint);
    const photo = await loadPhoto(src, boost);
    const factor = tint.map((t) => t / boost) as Rgb;
    const flat = tint.map((t, i) => Math.min(1, t * photo.avg[i])) as Rgb;
    if (usdz) mat.color.setRGB(...flat, THREE.LinearSRGBColorSpace);
    else mat.color.setRGB(...factor, THREE.LinearSRGBColorSpace);
    out.set(mat.name, { key: `${src}@${boost}`, jpg: photo.jpg, factor, flat });
  }
  return out;
}

/** exterior + baked name tags for one era/language */
async function arScene(m: Manifest, era: Era, lang: Lang, usdz = false) {
  const scene = new THREE.Scene();
  const model = buildExterior(m.exterior, era, m.exterior.textures ? { texture: stubTexture } : {});
  const photos = await arMaterials(model, usdz);
  scene.add(model, buildArLabels(m, era, lang, model));
  return { scene, photos };
}

/** packs the photos into the GLB's binary chunk and puts them on the materials with those names */
function packPhotos(glb: ArrayBuffer, photos: Map<string, ArTex>): Buffer {
  const buf = Buffer.from(glb);
  if (!photos.size) return buf;
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
  const binLen = buf.readUInt32LE(20 + jsonLen);
  const parts: Buffer[] = [buf.subarray(28 + jsonLen, 28 + jsonLen + binLen)];
  let size = binLen;
  const pad4 = () => { const p = (4 - (size % 4)) % 4; if (p) { parts.push(Buffer.alloc(p)); size += p; } };
  json.images ??= []; json.textures ??= []; json.samplers ??= []; json.bufferViews ??= [];
  json.samplers.push({ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }); // linear, mipmapped, repeat
  const sampler = json.samplers.length - 1;
  const texIndex = new Map<string, number>();
  for (const mat of json.materials ?? []) {
    const ph = photos.get(mat.name);
    if (!ph) continue;
    let ti = texIndex.get(ph.key);
    if (ti === undefined) {
      pad4();
      json.bufferViews.push({ buffer: 0, byteOffset: size, byteLength: ph.jpg.length });
      parts.push(ph.jpg); size += ph.jpg.length;
      json.images.push({ bufferView: json.bufferViews.length - 1, mimeType: "image/jpeg" });
      json.textures.push({ sampler, source: json.images.length - 1 });
      ti = json.textures.length - 1;
      texIndex.set(ph.key, ti);
    }
    mat.pbrMetallicRoughness ??= {};
    mat.pbrMetallicRoughness.baseColorTexture = { index: ti };
    mat.pbrMetallicRoughness.baseColorFactor = [...ph.factor, 1];
  }
  pad4();
  json.buffers[0].byteLength = size;
  let js = Buffer.from(JSON.stringify(json), "utf8");
  if (js.length % 4) js = Buffer.concat([js, Buffer.alloc(4 - (js.length % 4), 0x20)]);
  const bin = Buffer.concat(parts);
  const head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, jh, js, bh, bin]);
}

async function exportOne(slug: string) {
  const m: Manifest = JSON.parse(fs.readFileSync(path.join(ROOT, slug, "manifest.json"), "utf8"));
  const outDir = path.join(process.cwd(), "public", "monuments", slug, "models");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const era of Object.keys(m.eras) as Era[])
    for (const lang of ["az", "en"] as Lang[]) {
      const name = `${era}.${lang}`;
      const { scene, photos } = await arScene(m, era, lang);
      const glb = packPhotos((await new GLTFExporter().parseAsync(scene, { binary: true })) as ArrayBuffer, photos);
      fs.writeFileSync(path.join(outDir, `${name}.glb`), glb);
      let tris = 0;
      scene.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (g) tris += g.attributes.position.count / 3; });
      console.log(`[export-glb] ${slug}/${name}.glb ${(glb.byteLength / 1024).toFixed(0)} KB, ${tris | 0} tris`);
      // iOS Quick Look needs USDZ. model-viewer can convert in the browser, but that is slow and
      // flaky on iPhone, so ship a ready file. Photos are replaced by their average colour (no canvas in Node).
      try {
        const { scene: usdzScene } = await arScene(m, era, lang, true);
        usdzScene.traverse((o) => {
          const mat = (o as THREE.Mesh).material as THREE.Material & { map?: THREE.Texture | null };
          if (mat && "map" in mat && mat.map) mat.map = null;
        });
        const usdz = await new USDZExporter().parseAsync(usdzScene, { quickLookCompatible: true });
        fs.writeFileSync(path.join(outDir, `${name}.usdz`), Buffer.from(usdz));
        console.log(`[export-glb] ${slug}/${name}.usdz ${(usdz.byteLength / 1024).toFixed(0)} KB`);
      } catch (e) {
        console.warn(`[export-glb] ${slug}/${name}.usdz skipped:`, (e as Error).message);
      }
    }
}

async function main() {
  const args = process.argv.slice(2);
  const all = fs.readdirSync(ROOT).filter((d) => fs.existsSync(path.join(ROOT, d, "manifest.json")));
  for (const slug of args.length ? args : all) {
    try {
      const raw = fs.readFileSync(path.join(ROOT, slug, "manifest.json"), "utf8").trim();
      if (!raw) { console.log(`[export-glb] skip ${slug} (empty manifest)`); continue; }
      await exportOne(slug);
    } catch (e) {
      console.error(`[export-glb] ${slug} failed:`, (e as Error).message);
      process.exitCode = 1;
    }
  }
}
main();
