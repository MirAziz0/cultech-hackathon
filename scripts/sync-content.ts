/* Copies binary assets from /content/monuments/<slug>/ to /public/monuments/<slug>/ so they are
   served statically (photos, narration audio). JSON stays in /content and is read at build time.
   Runs automatically before `dev` and `build`. */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "content", "monuments");
const DST = path.join(ROOT, "public", "monuments");
const COPY = [
  { dir: "photos", ext: /\.(jpe?g|png|webp)$/i },
  { dir: "narration", ext: /\.(mp3|ogg|wav|m4a)$/i },
  { dir: "narration/stops", ext: /\.(mp3|ogg|wav|m4a)$/i },
];

/** content/characters/<id>/ (avatar.vrm, anims/*.vrma|fbx, anims.json) → public/characters/<id>/ */
function copyDir(from: string, to: string): number {
  if (!fs.existsSync(from)) return 0;
  let n = 0;
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) { n += copyDir(a, b); continue; }
    if (!/\.(vrm|vrma|fbx|glb|json|png|jpe?g)$/i.test(e.name)) continue;
    if (fs.existsSync(b) && fs.statSync(b).size === fs.statSync(a).size && fs.statSync(b).mtimeMs >= fs.statSync(a).mtimeMs) continue;
    fs.copyFileSync(a, b);
    n++;
  }
  return n;
}

function sync() {
  if (!fs.existsSync(SRC)) return;
  let copied = 0, kept = 0;
  for (const slug of fs.readdirSync(SRC)) {
    if (!fs.existsSync(path.join(SRC, slug, "manifest.json"))) continue;
    for (const { dir, ext } of COPY) {
      const from = path.join(SRC, slug, dir);
      if (!fs.existsSync(from)) continue;
      const to = path.join(DST, slug, dir);
      fs.mkdirSync(to, { recursive: true });
      for (const f of fs.readdirSync(from)) {
        if (!ext.test(f)) continue;
        const a = path.join(from, f), b = path.join(to, f);
        const sa = fs.statSync(a);
        if (fs.existsSync(b) && fs.statSync(b).size === sa.size && fs.statSync(b).mtimeMs >= sa.mtimeMs) { kept++; continue; }
        fs.copyFileSync(a, b);
        copied++;
      }
    }
  }
  const chars = copyDir(path.join(ROOT, "content", "characters"), path.join(ROOT, "public", "characters"));
  console.log(`[sync-content] ${copied} copied, ${kept} up to date${chars ? `, ${chars} character files` : ""}`);
}
sync();
