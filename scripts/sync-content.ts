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
];

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
  console.log(`[sync-content] ${copied} copied, ${kept} up to date`);
}
sync();
