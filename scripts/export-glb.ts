/* Exports each monument's exterior maquette (both eras) to public/monuments/<slug>/models/<era>.glb
   using the same kit as the browser viewer. These GLBs feed <model-viewer> for AR
   (Scene Viewer on Android, Quick Look via auto-generated USDZ on iOS).
   usage: npx tsx scripts/export-glb.ts [slug ...] */
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { buildExterior } from "../lib/kit/exterior";
import type { Era, Manifest } from "../lib/types";

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

async function exportOne(slug: string) {
  const m: Manifest = JSON.parse(fs.readFileSync(path.join(ROOT, slug, "manifest.json"), "utf8"));
  const outDir = path.join(process.cwd(), "public", "monuments", slug, "models");
  fs.mkdirSync(outDir, { recursive: true });
  for (const era of ["past", "today"] as Era[]) {
    const scene = new THREE.Scene();
    scene.add(buildExterior(m.exterior, era));
    const glb = (await new GLTFExporter().parseAsync(scene, { binary: true })) as ArrayBuffer;
    const file = path.join(outDir, `${era}.glb`);
    fs.writeFileSync(file, Buffer.from(glb));
    let tris = 0;
    scene.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (g) tris += g.attributes.position.count / 3; });
    console.log(`[export-glb] ${slug}/${era}.glb ${(glb.byteLength / 1024).toFixed(0)} KB, ${tris | 0} tris`);
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
