/* Imports a static character model (OBJ + texture, e.g. from an AI 3D generator) as the guide body.
   - normalises it: 1.75 m tall, feet at y=0, centred
   - simplifies it to the triangle budget (default 18k)
   - texture → 1024 px JPG
   writes content/characters/<id>/{model.glb, texture.jpg, character.json}
   usage: npx tsx scripts/import-character.ts <file.zip | file.obj> <id> [--tris=18000] [--yaw=0] */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { MeshoptSimplifier } from "meshoptimizer";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import sharp from "sharp";

class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(b: Blob) { b.arrayBuffer().then((a) => { this.result = a; this.onloadend?.(); }); }
  readAsDataURL(b: Blob) { b.arrayBuffer().then((a) => { this.result = `data:${b.type};base64,${Buffer.from(a).toString("base64")}`; this.onloadend?.(); }); }
}
(globalThis as unknown as { FileReader: unknown }).FileReader = NodeFileReader;

const args = process.argv.slice(2);
const [src, id] = args.filter((a) => !a.startsWith("--"));
const opt = (k: string, d: number) => Number(args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d);
if (!src || !id) { console.error("usage: tsx scripts/import-character.ts <file.zip|file.obj> <id> [--tris=18000] [--yaw=0]"); process.exit(1); }

async function main() {
  // unpack a zip into a fresh temp folder (Windows 10+ tar reads zip)
  let dir = path.dirname(path.resolve(src)), obj = path.resolve(src);
  if (!/\.obj$/i.test(src)) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "char-"));
    execFileSync(process.platform === "win32" ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar", ["-xf", path.resolve(src), "-C", dir]);
    obj = path.join(dir, fs.readdirSync(dir).find((f) => /\.obj$/i.test(f))!);
  }
  const tex = fs.readdirSync(dir).find((f) => /\.(png|jpe?g)$/i.test(f));
  const group = new OBJLoader().parse(fs.readFileSync(obj, "utf8"));
  const geos: THREE.BufferGeometry[] = [];
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) geos.push((o as THREE.Mesh).geometry); });
  let g = geos[0];
  g.deleteAttribute("color");
  g.deleteAttribute("normal"); // per-face normals would stop vertices from merging; recomputed below
  // normalise: height 1.75 m, feet on the floor, centred on x/z
  g.computeBoundingBox();
  const bb = g.boundingBox!, s = 1.75 / (bb.max.y - bb.min.y);
  g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  g.scale(s, s, s);
  if (opt("yaw", 0)) g.rotateY((opt("yaw", 0) * Math.PI) / 180);
  // simplify (UV seams stay split by mergeVertices)
  g = mergeVertices(g, 1e-5);
  const tris = (g.index?.count ?? 0) / 3, target = opt("tris", 18000);
  if (tris > target) {
    // meshoptimizer collapses seam vertices in pairs (same position, different UV), so the texture stays intact
    console.log(`simplifying ${Math.round(tris)} → ~${target} triangles…`);
    await MeshoptSimplifier.ready;
    const idx = new Uint32Array(g.index!.array), P = g.attributes.position.array as Float32Array;
    const [out] = MeshoptSimplifier.simplify(idx, P, 3, target * 3, 0.05, []);
    g.setIndex(new THREE.BufferAttribute(out, 1));
  }
  g.computeVertexNormals();
  const out = path.join(process.cwd(), "content", "characters", id);
  fs.mkdirSync(out, { recursive: true });
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial());
  const glb = await new GLTFExporter().parseAsync(mesh, { binary: true }) as ArrayBuffer;
  fs.writeFileSync(path.join(out, "model.glb"), Buffer.from(glb));
  if (tex) await sharp(path.join(dir, tex)).resize(1024, 1024).jpeg({ quality: 85 }).toFile(path.join(out, "texture.jpg"));
  fs.writeFileSync(path.join(out, "character.json"), JSON.stringify({ kind: "mesh", model: "model.glb", texture: tex ? "texture.jpg" : null, yaw: 0 }, null, 1) + "\n");
  const final = (g.index?.count ?? g.attributes.position.count) / 3;
  console.log(`✓ content/characters/${id}: ${Math.round(final)} triangles, ${(glb.byteLength / 1024).toFixed(0)} KB model${tex ? ", texture.jpg 1024 px" : ""}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
