/* Guide stories written by the team (content/scripts/<slug>.<lang>.md) → narration files.
   A script is split by "@@ <target>" lines:
     @@ intro            narration/intro.json
     @@ court            narration/court.json            (zone narration)
     @@ hall@ruin        narration/hall.ruin.json        (zone narration for one era)
     @@ intro@*          narration/intro.<era>.json for every era of the walk
     @@ stop:well        narration/stops/well.json       (tour stop story)
   In the text: [CHECK…] notes are removed from speech and collected for the historian (content/review-notes.md);
   **bold** lines become "[serious] …" (spoken slower and lower); "[Era: X]" / "[Dövr: X]" become "X." .
   Audio of every changed text is deleted (unchanged texts keep theirs), so `npm run narration -- --audio` regenerates it.
     npx tsx scripts/apply-scripts.ts [slug ...] */
import fs from "node:fs";
import path from "node:path";
import type { Lang, Manifest } from "../lib/types";

const ROOT = path.join(process.cwd(), "content");
const LANGS: Lang[] = ["az", "en"];
const only = process.argv.slice(2);

type Json = Record<string, unknown> & { text?: Partial<Record<Lang, string>>; audio?: Partial<Record<Lang, string>>; visemes?: Record<string, unknown>; marks?: Record<string, unknown> };
const notes: string[] = [];

function clean(par: string, where: string): string {
  let t = par.replace(/\s*\[CHECK(?::\s*([^\]]*))?\]/g, (_m, what: string | undefined) => {
    notes.push(`${where}: ${what ? what.trim() : "verify"} — "${par.replace(/\s*\[CHECK[^\]]*\]/g, "").slice(0, 110).trim()}…"`);
    return "";
  });
  t = t.replace(/^\[(?:Era|Dövr):\s*([^\]]+)\]\s*/, "$1. ");
  t = t.replace(/\*\*(.+?)\*\*/g, "[serious] $1");
  return t.trim();
}

function parse(file: string): { target: string; text: string }[] {
  const out: { target: string; text: string }[] = [];
  let cur: { target: string; pars: string[] } | null = null;
  const flush = () => { if (cur) out.push({ target: cur.target, text: cur.pars.join("\n") }); };
  let buf: string[] = [];
  const endPar = () => { if (cur && buf.length) cur.pars.push(clean(buf.join(" "), `${path.basename(file)} @${cur.target}`)); buf = []; };
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    const m = /^@@\s+(\S+)/.exec(line);
    if (m) { endPar(); flush(); cur = { target: m[1], pars: [] }; continue; }
    if (!cur || line.startsWith("<!--")) continue;
    if (!line) { endPar(); continue; }
    buf.push(line);
  }
  endPar(); flush();
  return out;
}

const read = (f: string): Json | null => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null);
const write = (f: string, j: Json) => fs.writeFileSync(f, JSON.stringify(j, null, 1) + "\n");

/** set one language's text and drop that language's audio so it is regenerated */
function setText(file: string, lang: Lang, text: string, base: Json) {
  const j = read(file) ?? base;
  if (j.text?.[lang] === text) return; // unchanged: keep its audio
  j.text = { ...(j.text ?? {}), [lang]: text };
  j.generatedBy = "hand";
  if (j.audio?.[lang]) { const mp3 = path.join(path.dirname(file), j.audio[lang]!); if (fs.existsSync(mp3)) fs.rmSync(mp3); delete j.audio[lang]; }
  delete j.visemes?.[lang];
  delete j.marks?.[lang];
  write(file, j);
}

// every script is parsed (so the historian checklist always covers all monuments); only the chosen ones are written
const slugs = fs.readdirSync(path.join(ROOT, "scripts")).map((f) => f.split(".")[0]).filter((s, i, a) => a.indexOf(s) === i);
for (const slug of slugs) {
  if (only.length && !only.includes(slug)) {
    for (const lang of LANGS) { const f = path.join(ROOT, "scripts", `${slug}.${lang}.md`); if (fs.existsSync(f)) parse(f); }
    continue;
  }
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, "monuments", slug, "manifest.json"), "utf8")) as Manifest;
  const ndir = path.join(ROOT, "monuments", slug, "narration"), sdir = path.join(ndir, "stops");
  const eras = m.walk?.eras ?? [];
  const stops = m.walk?.tour?.stops ?? [];
  const touched = new Set<string>();
  for (const lang of LANGS) {
    const file = path.join(ROOT, "scripts", `${slug}.${lang}.md`);
    if (!fs.existsSync(file)) continue;
    for (const { target, text } of parse(file)) {
      if (target.startsWith("stop:")) {
        const id = target.slice(5);
        if (!stops.some((s) => s.id === id)) throw new Error(`${slug}: unknown stop "${id}"`);
        fs.mkdirSync(sdir, { recursive: true });
        setText(path.join(sdir, `${id}.json`), lang, text, { stop: id, text: {}, factIds: [], generatedBy: "hand" });
        touched.add(`stop:${id}`);
        continue;
      }
      const [zone, era] = target.split("@");
      const list = era === "*" ? eras : [era];
      for (const e of list) {
        const name = e ? `${zone}.${e}` : zone;
        const f = path.join(ndir, `${name}.json`);
        if (!fs.existsSync(f) && zone !== "intro" && !m.walk?.zones.some((z) => z.id === zone)) throw new Error(`${slug}: unknown zone "${zone}"`);
        setText(f, lang, text, { zone, ...(e ? { era: e } : {}), text: {}, factIds: [], generatedBy: "hand" });
      }
      touched.add(target);
    }
  }
  // a stop story written in only one language: the other language keeps the zone narration
  for (const s of stops) {
    const f = path.join(sdir, `${s.id}.json`), st = read(f);
    if (!st || !touched.has(`stop:${s.id}`)) continue;
    for (const lang of LANGS) {
      if (st.text?.[lang]) continue;
      const zn = read(path.join(ndir, `${s.zone}.json`));
      if (zn?.text?.[lang]) setText(f, lang, zn.text[lang]!, st);
    }
  }
  console.log(`✓ ${slug}: ${touched.size} texts`);
}

// historian checklist in content/review-notes.md (replaced on every run)
const rn = path.join(ROOT, "review-notes.md");
const BEGIN = "<!-- guide-stories:begin -->", END = "<!-- guide-stories:end -->";
let body = fs.readFileSync(rn, "utf8");
const block = `${BEGIN}\n### Guide stories (October 2026) — [CHECK] notes from the authors\n\nThe stories in content/scripts/ marked these details for a historian; the guide speaks them as written.\n\n${notes.map((n) => `- ${n}`).join("\n")}\n${END}`;
body = body.includes(BEGIN) ? body.replace(new RegExp(`${BEGIN}[\\s\\S]*?${END}`), block) : `${body.trimEnd()}\n\n${block}\n`;
fs.writeFileSync(rn, body);
console.log(`✓ ${notes.length} [CHECK] notes → content/review-notes.md`);
