/* Keyless neural TTS through Microsoft Edge's "Read aloud" service (msedge-tts): the same
   az-AZ-BabekNeural / en-GB-RyanNeural voices as Azure, without an Azure subscription.
   Not an official API — if it stops working, /api/tts falls back and pre-generated MP3s keep playing.

   Expressive reading: the service accepts only one prosody per request, so the text is split into
   sentences, each group is read with its own tone (question, exclamation, trailing "…", [serious]
   emphasis, quoted speech) and the MP3 pieces are joined with silences that follow the punctuation.
   Lip sync: word timings from the service, mouth shapes estimated inside each word. */
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import type { Lang, Viseme } from "../types";
import { estimateVisemes } from "./visemes";

const VOICES: Record<Lang, { male: string; female: string }> = {
  az: { male: "az-AZ-BabekNeural", female: "az-AZ-BanuNeural" },
  en: { male: "en-GB-RyanNeural", female: "en-GB-SoniaNeural" },
};

/** "calm architect": slower and a little deeper than the stock voice (chosen by the project owner) */
export const VOICE_STYLE = { rate: "-12%", pitch: "-6%" };

type Tone = "say" | "ask" | "exclaim" | "trail" | "serious" | "quote";
/** prosody per sentence type, and the silence after it (ms) */
const TONES: Record<Tone, { rate: string; pitch: string; volume?: string; gap: number }> = {
  say: { ...VOICE_STYLE, gap: 160 },
  ask: { rate: "-9%", pitch: "-1%", gap: 450 },                     // a question rises and leaves room to think
  exclaim: { rate: "-7%", pitch: "-3%", volume: "+10%", gap: 300 },
  trail: { rate: "-17%", pitch: "-9%", gap: 700 },                  // "…" slows down, drops, lingers
  serious: { rate: "-18%", pitch: "-9%", gap: 750 },                // **bold** lines: slow and weighty
  quote: { rate: "-10%", pitch: "-2%", gap: 320 },                  // someone's words in quotes
};
const PARAGRAPH_GAP = 280;

// MP3 from the service: MPEG-2 layer III, 24 kHz, 48 kbit/s mono → fixed 144-byte frames of 24 ms
const FRAME_BYTES = 144, FRAME_MS = 24;

interface Word { t: number; d: number; text: string; at: number }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** one request on an open connection: audio + word timings (ms, relative to the piece) */
async function piece(tts: MsEdgeTTS, text: string, tone: Tone): Promise<{ audio: Buffer; words: Omit<Word, "at">[] }> {
  const { rate, pitch, volume } = TONES[tone];
  const { audioStream, metadataStream } = tts.toStream(esc(text), { rate, pitch, ...(volume ? { volume } : {}) });
  const chunks: Buffer[] = [], words: Omit<Word, "at">[] = [];
  audioStream.on("data", (d: Buffer) => chunks.push(d));
  metadataStream?.on("data", (d: Buffer) => {
    try {
      for (const m of JSON.parse(d.toString()).Metadata ?? [])
        if (m.Type === "WordBoundary") words.push({ t: m.Data.Offset / 10_000, d: m.Data.Duration / 10_000, text: m.Data.text.Text });
    } catch {}
  });
  await new Promise<void>((ok, fail) => { audioStream.on("close", ok); audioStream.on("error", fail); });
  return { audio: Buffer.concat(chunks), words };
}

/** markers like [serious] are removed from the spoken text; their positions are kept */
function stripMarkers(src: string): { plain: string; at: { pos: number; name: string }[] } {
  let plain = "";
  const at: { pos: number; name: string }[] = [];
  for (const part of src.split(/(\[[a-z_]+\])/)) {
    const m = /^\[([a-z_]+)\]$/.exec(part);
    if (m) { at.push({ pos: plain.length, name: m[1] }); if (m[1] === "pause") plain += " … "; }
    else plain += part;
  }
  return { plain, at };
}

const PACE_MS = 120;
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
async function connect(lang: Lang, voice: "male" | "female"): Promise<MsEdgeTTS> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICES[lang][voice], OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, { wordBoundaryEnabled: true });
  return tts;
}

interface Group { from: number; text: string; tone: Tone; endsParagraph: boolean }

/** sentences → tone groups; plain statements of one paragraph are read together */
function group(plain: string, serious: number[]): Group[] {
  const out: Group[] = [];
  const pre = /[^\n]+/g;
  let p: RegExpExecArray | null;
  while ((p = pre.exec(plain))) {
    const para = p[0], base = p.index;
    const sre = /[^.!?…]+(?:[.!?…]+["”»]?|$)\s*/g;
    let s: RegExpExecArray | null;
    const sents: { from: number; text: string; tone: Tone }[] = [];
    while ((s = sre.exec(para))) {
      const text = s[0].trim();
      if (!text) continue;
      if (!/[\p{L}\p{N}]/u.test(text)) { if (sents.length) sents[sents.length - 1].text += text; continue; }
      const start = base + s.index, from = start + (s[0].length - s[0].trimStart().length);
      const tone: Tone = serious.some((x) => x >= start - 1 && x <= from) ? "serious"
        : /(\.\.\.|…)["”»]?$/.test(text) ? "trail"
        : /\?["”»]?$/.test(text) ? "ask"
        : /!["”»]?$/.test(text) ? "exclaim"
        : /^["“«]/.test(text) ? "quote" : "say";
      sents.push({ from, text, tone });
    }
    // a [serious] marker covers the whole bold line: every sentence of that paragraph
    if (sents.length && sents[0].tone === "serious") for (const x of sents) if (x.tone !== "ask") x.tone = "serious";
    sents.forEach((x, i) => {
      const last = out[out.length - 1];
      if (i > 0 && last && x.tone === "say" && last.tone === "say") { last.text += " " + x.text; return; }
      out.push({ from: x.from, text: x.text, tone: x.tone, endsParagraph: false });
    });
    if (out.length) out[out.length - 1].endsParagraph = true;
  }
  return out;
}

async function speakExpressive(src: string, lang: Lang, voice: "male" | "female"): Promise<{ audio: Buffer; words: Word[]; marks: { t: number; name: string }[] }> {
  const { plain, at } = stripMarkers(src);
  const groups = group(plain, at.filter((a) => a.name === "serious").map((a) => a.pos));
  let tts = await connect(lang, voice);
  const parts: Buffer[] = [], words: Word[] = [];
  let t = 0, silent: Buffer | null = null;
  try {
    for (const [gi, g] of groups.entries()) {
      if (gi) await sleep(PACE_MS);
      // the service rate-limits (HTTP 429) long runs: wait, reconnect and try the piece again
      let r: Awaited<ReturnType<typeof piece>> | null = null;
      for (let attempt = 0; !r; attempt++) {
        try { r = await piece(tts, g.text, g.tone); }
        catch (e) {
          if (attempt >= 5) throw e;
          tts.close();
          await sleep(4000 * (attempt + 1));
          tts = await connect(lang, voice);
        }
      }
      const audio = r.audio.subarray(0, r.audio.length - (r.audio.length % FRAME_BYTES));
      if (!audio.length) continue;
      silent ??= Buffer.from(audio.subarray(0, FRAME_BYTES)); // every piece opens with silence: reuse its first frame
      parts.push(audio);
      let cursor = 0;
      for (const w of r.words) {
        const i = g.text.indexOf(w.text, cursor);
        if (i >= 0) cursor = i + w.text.length;
        words.push({ t: t + w.t, d: w.d, text: w.text, at: g.from + (i >= 0 ? i : cursor) });
      }
      t += (audio.length / FRAME_BYTES) * FRAME_MS;
      const n = Math.round((TONES[g.tone].gap + (g.endsParagraph ? PARAGRAPH_GAP : 0)) / FRAME_MS);
      for (let k = 0; k < n; k++) parts.push(silent);
      t += n * FRAME_MS;
    }
  } finally {
    tts.close();
  }
  const audio = Buffer.concat(parts);
  if (!audio.length) throw new Error("Edge TTS returned no audio");
  const end = words.length ? words[words.length - 1].t + words[words.length - 1].d : 0;
  const marks = at.map(({ pos, name }) => {
    const w = words.find((x) => x.at >= pos);
    return { t: Math.round(w ? w.t : end), name };
  });
  return { audio, words, marks };
}

/** mouth timeline: each word's letters spread over that word's spoken time, silence between words */
function toVisemes(words: Word[]): Viseme[] {
  const out: Viseme[] = [];
  for (const w of words) {
    for (const v of estimateVisemes(w.text, w.d)) if (v.id !== 0) out.push({ t: Math.round(w.t + v.t), id: v.id });
    out.push({ t: Math.round(w.t + w.d), id: 0 });
  }
  return out;
}

export async function edgeSynthesize(text: string, lang: Lang, voice: "male" | "female"): Promise<{ audio: Buffer; visemes: Viseme[] }> {
  const { audio, words } = await speakExpressive(text, lang, voice);
  return { audio, visemes: toVisemes(words) };
}

/** story with stage markers ([point], [pause] …): markers are timed at the word that follows them */
export async function edgeSynthesizeStory(src: string, lang: Lang, voice: "male" | "female"): Promise<{ audio: Buffer; visemes: Viseme[]; marks: { t: number; name: string }[] }> {
  const { audio, words, marks } = await speakExpressive(src, lang, voice);
  return { audio, visemes: toVisemes(words), marks };
}
