import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Era, Fact, FactsFile, Lang, Manifest, MonumentBundle, Narration, Photo, PhotosFile, QA, Story } from "./types";

/* Reads /content/monuments/* at build time. Adding a folder adds a monument. */
const ROOT = path.join(process.cwd(), "content", "monuments");

function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch (e) {
    throw new Error(`Invalid JSON in ${path.relative(process.cwd(), file)}: ${(e as Error).message}`);
  }
}

export function listSlugs(): string[] {
  if (!fs.existsSync(ROOT)) return [];
  return fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_") && fs.existsSync(path.join(ROOT, d.name, "manifest.json")))
    .map((d) => d.name);
}

function check(m: Manifest, slug: string) {
  const need: (keyof Manifest)[] = ["name", "tagline", "period", "location", "eras", "architect", "exterior", "buildings", "disclaimer"];
  for (const k of need) if (m[k] === undefined) throw new Error(`content/monuments/${slug}/manifest.json: missing "${k}"`);
  if (m.slug !== slug) throw new Error(`content/monuments/${slug}/manifest.json: slug "${m.slug}" must match folder name`);
}

export function getManifest(slug: string): Manifest {
  const m = readJson<Manifest | null>(path.join(ROOT, slug, "manifest.json"), null);
  if (!m) throw new Error(`No manifest for ${slug}`);
  check(m, slug);
  return m;
}

export function getFacts(slug: string): Fact[] {
  return readJson<FactsFile>(path.join(ROOT, slug, "facts.json"), { monument: slug, facts: [] }).facts;
}

export function getBundle(slug: string): MonumentBundle {
  const dir = path.join(ROOT, slug);
  const manifest = getManifest(slug);
  const facts = getFacts(slug);
  const photos: Photo[] = readJson<PhotosFile>(path.join(dir, "photos.json"), { photos: [] }).photos.filter((p) =>
    fs.existsSync(path.join(dir, "photos", p.file)),
  );
  const narration: Record<string, Narration> = {};
  const ndir = path.join(dir, "narration");
  if (fs.existsSync(ndir))
    for (const f of fs.readdirSync(ndir))
      if (f.endsWith(".json") && f !== "qa.json") {
        const n = readJson<Narration | null>(path.join(ndir, f), null);
        if (n) narration[n.era ? `${n.zone}@${n.era}` : n.zone] = n;
      }
  const qa = readJson<QA[]>(path.join(ndir, "qa.json"), []);
  const stories: Record<string, Story> = {};
  const sdir = path.join(ndir, "stops");
  if (fs.existsSync(sdir))
    for (const f of fs.readdirSync(sdir))
      if (f.endsWith(".json")) {
        const st = readJson<Story | null>(path.join(sdir, f), null);
        if (st) stories[st.era ? `${st.stop}@${st.era}` : st.stop] = st;
      }
  const ar: MonumentBundle["ar"] = {};
  const models = path.join(process.cwd(), "public", "monuments", slug, "models");
  for (const era of Object.keys(manifest.eras) as Era[])
    for (const lang of ["az", "en"] as Lang[]) {
      const name = `${era}.${lang}`;
      if (!fs.existsSync(path.join(models, `${name}.glb`))) continue;
      const usdz = fs.existsSync(path.join(models, `${name}.usdz`)) ? `/monuments/${slug}/models/${name}.usdz` : undefined;
      (ar[era] ??= {})[lang] = { glb: `/monuments/${slug}/models/${name}.glb`, usdz };
    }
  const avatarId = manifest.architect.avatar ?? slug;
  const cdir = path.join(process.cwd(), "content", "characters", avatarId);
  const avatar: MonumentBundle["avatar"] = fs.existsSync(path.join(cdir, "avatar.vrm")) ? { id: avatarId, kind: "vrm" } : fs.existsSync(path.join(cdir, "model.glb")) ? { id: avatarId, kind: "mesh" } : undefined;
  return { manifest, facts, photos, narration, stories, qa, base: `/monuments/${slug}`, ar, avatar };
}

export function listMonuments(): (Manifest & { coverUrl?: string; coverPhoto?: Photo })[] {
  return listSlugs()
    .map((slug) => {
      const b = getBundle(slug);
      const coverPhoto = b.photos.find((p) => p.id === b.manifest.cover) ?? b.photos[0];
      return { ...b.manifest, coverPhoto, coverUrl: coverPhoto ? `${b.base}/photos/${coverPhoto.file}` : undefined };
    })
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}
