/* Downloads Wikimedia Commons photos listed in content/monuments/<slug>/photos.sources.json,
   stores ~1200px JPEG thumbnails in <slug>/photos/ and writes photos.json with author + license
   from the Commons API (extmetadata).  Port of reference/scripts/get_photos*.py.

   usage: npx tsx scripts/fetch-photos.ts [slug ...] [--force]   */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { L, Photo } from "../lib/types";

const UA = "ZamanQapisiAI/0.1 (hackathon heritage demo; https://github.com/zamanqapisi) node-fetch";
const ROOT = path.join(process.cwd(), "content", "monuments");
const API = "https://commons.wikimedia.org/w/api.php";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** crop = [left, top, width, height] as fractions of the image; `modified` is shown in the credit line */
interface SourceEntry { id: string; commons: string; caption: L; crop?: [number, number, number, number]; modified?: L }
interface ImageInfo {
  width: number; height: number; thumburl?: string; url: string; descriptionurl: string;
  extmetadata?: Record<string, { value: string }>;
}

const strip = (html = "") =>
  html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, " ").trim();

function cleanAuthor(raw: string) {
  let a = strip(raw);
  const assumed = a.match(/No machine-readable author provided\.\s*(.+?) assumed/i);
  if (assumed) a = assumed[1];
  // drop upload notes and timestamps ("X, uploaded by Y 09:16, 17 Jan 2005 (UTC)")
  a = a.replace(/,?\s*uploaded by .*$/i, "").replace(/\s*\d{1,2}:\d{2},.*\(UTC\)/, "");
  // Commons sometimes renders the same text twice (visible + hidden span)
  const half = a.length / 2;
  if (a.length % 2 === 0 && a.slice(0, half) === a.slice(half)) a = a.slice(0, half);
  return a.trim();
}

async function getJson(url: string): Promise<unknown> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA } });
    if (res.status === 429 || res.status >= 500) { await sleep(3000 + attempt * 3000); continue; }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  }
  throw new Error(`gave up: ${url}`);
}

async function info(titles: string[]): Promise<Map<string, ImageInfo>> {
  const out = new Map<string, ImageInfo>();
  for (let i = 0; i < titles.length; i += 40) {
    const batch = titles.slice(i, i + 40);
    const q = new URLSearchParams({
      action: "query", format: "json", formatversion: "2", prop: "imageinfo",
      iiprop: "url|extmetadata|size", iiurlwidth: "1280", iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl|Credit|UsageTerms",
      titles: batch.map((t) => "File:" + t).join("|"),
    });
    const data = (await getJson(`${API}?${q}`)) as {
      query: { normalized?: { from: string; to: string }[]; pages: { title: string; missing?: boolean; imageinfo?: ImageInfo[] }[] };
    };
    const norm = new Map((data.query.normalized ?? []).map((n) => [n.to, n.from]));
    for (const p of data.query.pages) {
      if (p.missing || !p.imageinfo) continue;
      const original = norm.get(p.title) ?? p.title;
      out.set(original.replace(/^File:/, ""), p.imageinfo[0]);
      out.set(p.title.replace(/^File:/, ""), p.imageinfo[0]);
    }
  }
  return out;
}

async function download(url: string, dest: string, crop?: SourceEntry["crop"]) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status === 429) { await sleep(4000 + attempt * 3000); continue; }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    let buf: Buffer = Buffer.from(await res.arrayBuffer());
    if (crop) {
      const im = sharp(buf).rotate();
      const { width = 0, height = 0 } = await im.metadata();
      buf = await im.extract({ left: Math.round(crop[0] * width), top: Math.round(crop[1] * height), width: Math.round(crop[2] * width), height: Math.round(crop[3] * height) }).toBuffer();
    }
    const meta = await sharp(buf)
      .rotate()
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(dest);
    return meta;
  }
  throw new Error(`gave up: ${url}`);
}

async function run(slug: string, force: boolean) {
  const dir = path.join(ROOT, slug);
  const srcFile = path.join(dir, "photos.sources.json");
  if (!fs.existsSync(srcFile)) { console.log(`- ${slug}: no photos.sources.json`); return; }
  const sources: SourceEntry[] = JSON.parse(fs.readFileSync(srcFile, "utf8"));
  const pdir = path.join(dir, "photos");
  fs.mkdirSync(pdir, { recursive: true });
  const meta = await info(sources.map((s) => s.commons));
  const photos: Photo[] = [];
  for (const s of sources) {
    const ii = meta.get(s.commons) ?? meta.get(s.commons.replace(/_/g, " "));
    if (!ii) { console.warn(`  ! not found on Commons: ${s.commons}`); continue; }
    const file = `${s.id}.jpg`;
    const dest = path.join(pdir, file);
    let w = 0, h = 0;
    if (force || !fs.existsSync(dest)) {
      try {
        const m = await download(ii.thumburl ?? ii.url, dest, s.crop);
        w = m.width; h = m.height;
        console.log(`  ok ${file} ${w}x${h}`);
        await sleep(1200);
      } catch (e) { console.warn(`  ! download failed ${s.commons}: ${(e as Error).message}`); continue; }
    } else {
      const m = await sharp(dest).metadata();
      w = m.width ?? 0; h = m.height ?? 0;
    }
    const em = ii.extmetadata ?? {};
    photos.push({
      id: s.id, file, commons: s.commons, page: ii.descriptionurl,
      author: cleanAuthor(em.Artist?.value ?? "") || cleanAuthor(em.Credit?.value ?? "") || "Unknown",
      license: strip(em.LicenseShortName?.value) || strip(em.UsageTerms?.value) || "see file page",
      licenseUrl: em.LicenseUrl?.value || undefined,
      caption: s.caption, w, h, ...(s.modified ? { modified: s.modified } : {}),
    });
  }
  fs.writeFileSync(path.join(dir, "photos.json"), JSON.stringify({ photos }, null, 1) + "\n");
  console.log(`✓ ${slug}: ${photos.length}/${sources.length} photos`);
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const slugs = args.filter((a) => !a.startsWith("--"));
  const all = fs.readdirSync(ROOT).filter((d) => fs.existsSync(path.join(ROOT, d, "manifest.json")));
  for (const slug of slugs.length ? slugs : all) await run(slug, force);
}
main().catch((e) => { console.error(e); process.exit(1); });
