/* Pre-generates the architect's zone narrations so the demo works offline.
   For every monument with a walk: "intro" + every zone in walk.zoneInfo.
     --text   (re)write the narration scripts with Claude from facts.json   [needs ANTHROPIC_API_KEY]
     --audio  synthesize MP3 + Azure viseme timelines for az and en          [needs AZURE_SPEECH_KEY/REGION]
     --force  overwrite existing text/audio
   Without keys it only validates that every zone has a narration and reports what is missing.
   usage: npx tsx scripts/generate-narration.ts [slug ...] [--text] [--audio] [--force] [--zone=id] */
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import type { FactsFile, Lang, Manifest, Narration } from "../lib/types";
import { azureConfigured, synthesize } from "../lib/speech/azure";
import { estimateDuration } from "../lib/speech/visemes";
import { COMMON_RULES, factLines, personaRules } from "../lib/persona";
import { zoneInfoFor } from "../lib/eras";

const ROOT = path.join(process.cwd(), "content", "monuments");
const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const zoneOnly = args.find((a) => a.startsWith("--zone="))?.slice(7);
const slugs = args.filter((a) => !a.startsWith("--"));

const Script = z.object({
  az: z.string().describe("Azerbaijani narration, first person, 40-60 words (15-25 seconds spoken)"),
  en: z.string().describe("English version of the same narration"),
  factIds: z.array(z.string()),
});

async function writeText(client: Anthropic, m: Manifest, facts: FactsFile, zone: string, era?: string): Promise<Narration> {
  const info = zone === "intro" ? null : zoneInfoFor(m.walk, zone, era)!;
  const factList = factLines(facts.facts, m);
  const eraLine = era ? ` The visitor is seeing the era "${m.eras[era]?.label.en ?? era}".` : "";
  const res = await client.beta.messages.parse({
    model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
    max_tokens: 4000,
    output_config: { effort: "medium", format: betaZodOutputFormat(Script) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: `You write spoken narration for a virtual walk.\n${personaRules(m)}\n${COMMON_RULES}\n- Call reconstructed or imagined parts approximate. No lists or markdown — it is read aloud by TTS. 40–60 words in Azerbaijani.`,
    messages: [{
      role: "user",
      content: `${zone === "intro" ? "Write the greeting when the visitor starts the walk." : `The visitor just entered: ${info!.title.az} (${info!.title.en ?? ""}). Description: ${info!.text.az}. Confidence: ${info!.conf ?? "?"}.`}${eraLine}\n\nFACTS:\n${factList}`,
    }],
  });
  if (!res.parsed_output) throw new Error(`no output for ${zone} (stop_reason ${res.stop_reason})`);
  const known = new Set(facts.facts.map((f) => f.id));
  return { zone, ...(era ? { era } : {}), text: { az: res.parsed_output.az, en: res.parsed_output.en }, factIds: res.parsed_output.factIds.filter((id) => known.has(id)), generatedBy: "claude" };
}

async function run(slug: string) {
  const dir = path.join(ROOT, slug);
  const m: Manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  if (!m.walk) return;
  const facts: FactsFile = JSON.parse(fs.readFileSync(path.join(dir, "facts.json"), "utf8"));
  const ndir = path.join(dir, "narration");
  fs.mkdirSync(ndir, { recursive: true });
  // with walk eras every zone has one narration per era: <zone>.<era>.json
  const eras: (string | undefined)[] = m.walk.eras?.length ? m.walk.eras : [undefined];
  const zones = ["intro", ...Object.keys(m.walk.zoneInfo)].filter((z) => !zoneOnly || z === zoneOnly).flatMap((z) => eras.map((e) => ({ zone: z, era: e })));
  const wantText = flag("--text"), wantAudio = flag("--audio") || (azureConfigured() && !flag("--text"));
  const client = wantText && (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) ? new Anthropic() : null;
  if (wantText && !client) console.warn("  ! --text needs ANTHROPIC_API_KEY; keeping existing scripts");
  if (wantAudio && !azureConfigured()) console.warn("  ! --audio needs AZURE_SPEECH_KEY and AZURE_SPEECH_REGION; skipping audio");
  console.log(`▶ ${slug}: ${zones.length} narrations`);
  for (const { zone, era } of zones) {
    const key = era ? `${zone}.${era}` : zone;
    const file = path.join(ndir, `${key}.json`);
    let n: Narration | null = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
    if (client && (!n || flag("--force"))) {
      n = await writeText(client, m, facts, zone, era);
      console.log(`  ✎ ${key}: text by Claude`);
    }
    if (!n) { console.warn(`  ✗ ${key}: missing narration (write ${path.relative(process.cwd(), file)} or run with --text)`); continue; }
    const words = n.text.az.split(/\s+/).length, secs = estimateDuration(n.text.az, "az");
    const lengthNote = secs < 12 || secs > 28 ? ` ⚠ ~${secs.toFixed(0)}s (target 15–25s)` : ` ~${secs.toFixed(0)}s`;
    if (wantAudio && azureConfigured()) {
      n.audio ??= {};
      n.visemes ??= {};
      for (const lang of ["az", "en"] as Lang[]) {
        const text = n.text[lang];
        if (!text) continue;
        const audioFile = `${key}.${lang}.mp3`;
        if (fs.existsSync(path.join(ndir, audioFile)) && n.visemes[lang] && !flag("--force")) continue;
        const { audio, visemes } = await synthesize(text, lang, m.architect.voice);
        fs.writeFileSync(path.join(ndir, audioFile), audio);
        n.audio[lang] = audioFile;
        n.visemes[lang] = visemes;
        console.log(`  ♪ ${key}.${lang}: ${(audio.length / 1024).toFixed(0)} KB, ${visemes.length} visemes`);
      }
    }
    fs.writeFileSync(file, JSON.stringify(n, null, 1) + "\n");
    console.log(`  ✓ ${key}: ${words} words${lengthNote}${n.audio?.az ? " · audio" : ""}`);
  }
}

async function main() {
  const all = fs.readdirSync(ROOT).filter((d) => fs.existsSync(path.join(ROOT, d, "manifest.json")));
  for (const s of slugs.length ? slugs : all) await run(s);
}
main().catch((e) => { console.error(e); process.exit(1); });
