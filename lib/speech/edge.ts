/* Keyless neural TTS through Microsoft Edge's "Read aloud" service (msedge-tts): the same
   az-AZ-BabekNeural / en-GB-RyanNeural voices as Azure, without an Azure subscription.
   Not an official API — if it stops working, /api/tts falls back and pre-generated MP3s keep playing.
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

interface Word { t: number; d: number; text: string }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function run(text: string, lang: Lang, voice: "male" | "female"): Promise<{ audio: Buffer; words: Word[] }> {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(VOICES[lang][voice], OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, { wordBoundaryEnabled: true });
    const { audioStream, metadataStream } = tts.toStream(esc(text), VOICE_STYLE);
    const chunks: Buffer[] = [], words: Word[] = [];
    audioStream.on("data", (d: Buffer) => chunks.push(d));
    metadataStream?.on("data", (d: Buffer) => {
      try {
        for (const m of JSON.parse(d.toString()).Metadata ?? [])
          if (m.Type === "WordBoundary") words.push({ t: m.Data.Offset / 10_000, d: m.Data.Duration / 10_000, text: m.Data.text.Text });
      } catch {}
    });
    await new Promise<void>((ok, fail) => { audioStream.on("close", ok); audioStream.on("error", fail); });
    const audio = Buffer.concat(chunks);
    if (!audio.length) throw new Error("Edge TTS returned no audio");
    return { audio, words };
  } finally {
    tts.close();
  }
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
  const { audio, words } = await run(text, lang, voice);
  return { audio, visemes: toVisemes(words) };
}

/** story with stage markers ([point], [pause] …): markers are removed from the spoken text and timed
    at the word that follows them ([pause] also becomes a sentence break) */
export async function edgeSynthesizeStory(src: string, lang: Lang, voice: "male" | "female"): Promise<{ audio: Buffer; visemes: Viseme[]; marks: { t: number; name: string }[] }> {
  let plain = "";
  const at: { pos: number; name: string }[] = [];
  for (const part of src.split(/(\[[a-z_]+\])/)) {
    const m = /^\[([a-z_]+)\]$/.exec(part);
    if (m) { at.push({ pos: plain.length, name: m[1] }); if (m[1] === "pause") plain += " … "; }
    else plain += part;
  }
  const { audio, words } = await run(plain, lang, voice);
  // locate each spoken word in the plain text to map marker positions → time
  let cursor = 0;
  const pos = words.map((w) => { const i = plain.indexOf(w.text, cursor); if (i >= 0) cursor = i + w.text.length; return i >= 0 ? i : cursor; });
  const end = words.length ? words[words.length - 1].t + words[words.length - 1].d : 0;
  const marks = at.map(({ pos: p, name }) => {
    const k = pos.findIndex((x) => x >= p);
    return { t: Math.round(k >= 0 ? words[k].t : end), name };
  });
  return { audio, visemes: toVisemes(words), marks };
}
