/* Imports low-poly tree models (FBX, one mesh per tree variant + a colour texture) for walk scenes.
   Each variant is centred on its trunk base and scaled to 1 m height, so a tree of height h is
   just scale h. Walks with "trees": "<id>" place every { kind: "tree" } furniture with these
   models (instanced), alternating variants.
   writes content/models/<id>/{model.glb, texture.png, model.json}
   usage: npx tsx scripts/import-trees.ts <file.zip | file.fbx> <id> */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import sharp from "sharp";

// FBXLoader asks for an <img> for each texture; geometry is all we need here
(globalThis as unknown as { document: unknown }).document = { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }) };
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(b: Blob) { b.arrayBuffer().then((a) => { this.result = a; this.onloadend?.(); }); }
  readAsDataURL(b: Blob) { b.arrayBuffer().then((a) => { this.result = `data:${b.type};base64,${Buffer.from(a).toString("base64")}`; this.onloadend?.(); }); }
}
(globalThis as unknown as { FileReader: unknown }).FileReader = NodeFileReader;

const [src, id] = process.argv.slice(2);
if (!src || !id) { console.error("usage: tsx scripts/import-trees.ts <file.zip|file.fbx> <id>"); process.exit(1); }

const find = (d: string, re: RegExp): string | undefined => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) { const r = find(f, re); if (r) return r; } else if (re.test(e.name)) return f;
  }
};

async function main() {
  let dir = path.dirname(path.resolve(src));
  if (/\.zip$/i.test(src)) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "trees-"));
    execFileSync(process.platform === "win32" ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar", ["-xf", path.resolve(src), "-C", dir]);
  }
  const fbx = /\.fbx$/i.test(src) ? path.resolve(src) : find(dir, /\.fbx$/i)!;
  const tex = find(dir, /\.(png|jpe?g)$/i);
  const buf = fs.readFileSync(fbx);
  const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, "");
  root.updateMatrixWorld(true);
  const out = new THREE.Group();
  let k = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    for (const a of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(a)) g.deleteAttribute(a);
    g.computeBoundingBox();
    const b = g.boundingBox!, h = b.max.y - b.min.y;
    g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
    g.scale(1 / h, 1 / h, 1 / h);
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial());
    mesh.name = `v${k++}`;
    out.add(mesh);
  });
  const dst = path.join(process.cwd(), "content", "models", id);
  fs.mkdirSync(dst, { recursive: true });
  const glb = await new GLTFExporter().parseAsync(out, { binary: true }) as ArrayBuffer;
  fs.writeFileSync(path.join(dst, "model.glb"), Buffer.from(glb));
  if (tex) await sharp(fs.readFileSync(tex)).resize(512, 512, { fit: "inside" }).png({ palette: true, quality: 90 }).toFile(path.join(dst, "texture.png")); // PNG keeps the leaf cut-out alpha
  fs.writeFileSync(path.join(dst, "model.json"), JSON.stringify({ kind: "variants", model: "model.glb", texture: tex ? "texture.png" : null }, null, 1) + "\n");
  console.log(`✓ content/models/${id}: ${k} variants, ${(glb.byteLength / 1024).toFixed(0)} KB`);
}
main().catch((e) => { console.error(e); process.exit(1); });
