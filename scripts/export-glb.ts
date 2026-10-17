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

/** exterior + baked name tags for one era/language */
function arScene(m: Manifest, era: Era, lang: Lang) {
  const scene = new THREE.Scene();
  const model = buildExterior(m.exterior, era);
  scene.add(model, buildArLabels(m, era, lang, model));
  return scene;
}

async function exportOne(slug: string) {
  const m: Manifest = JSON.parse(fs.readFileSync(path.join(ROOT, slug, "manifest.json"), "utf8"));
  const outDir = path.join(process.cwd(), "public", "monuments", slug, "models");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const era of ["past", "today"] as Era[])
    for (const lang of ["az", "en"] as Lang[]) {
      const name = `${era}.${lang}`;
      const scene = arScene(m, era, lang);
      const glb = (await new GLTFExporter().parseAsync(scene, { binary: true })) as ArrayBuffer;
      fs.writeFileSync(path.join(outDir, `${name}.glb`), Buffer.from(glb));
      let tris = 0;
      scene.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (g) tris += g.attributes.position.count / 3; });
      console.log(`[export-glb] ${slug}/${name}.glb ${(glb.byteLength / 1024).toFixed(0)} KB, ${tris | 0} tris`);
      // iOS Quick Look needs USDZ. model-viewer can convert in the browser, but that is slow and
      // flaky on iPhone, so ship a ready file. Textures are dropped (no canvas in Node).
      try {
        const usdzScene = arScene(m, era, lang);
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
