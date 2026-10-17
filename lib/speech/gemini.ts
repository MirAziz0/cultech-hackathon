/* Gemini TTS (server only): gemini-3.8-flash-tts speaks Azerbaijani and English with one style direction per
   request. It returns 24 kHz 16-bit mono WAV without word timings, so:
   - the WAV is encoded to MP3 (lamejs, 48 kbit/s) like every other narration file;
   - lip sync: the PCM is cut into 20 ms frames, voiced frames are found by loudness, and the letter-based mouth
     shapes are spread over the voiced time only — the mouth rests in every pause.
   Stage markers ([serious], [point] …) are never read aloud; their times are estimated from their text position. */
import type { Lang, Viseme } from "../types";
import { LETTER } from "./visemes";

export const geminiConfigured = () => !!process.env.GEMINI_API_KEY;

const MODEL = () => process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts";
/** Algieba (smooth, lower pitch — chosen by the project owner) and Sulafat (warm, female); override with GEMINI_VOICE_MALE / GEMINI_VOICE_FEMALE */
const VOICE = (v: "male" | "female") => (v === "male" ? process.env.GEMINI_VOICE_MALE || "Algieba" : process.env.GEMINI_VOICE_FEMALE || "Sulafat");
const STYLE: Record<Lang, string> = {
  az: "A calm, warm museum guide telling a story to one visitor, in native Azerbaijani (Baku) pronunciation. Unhurried, friendly, with natural pauses; questions rise gently, sentences ending in an ellipsis trail off.",
  en: "A calm, warm museum guide telling a story to one visitor, in clear British English. Unhurried, friendly, with natural pauses; questions rise gently, sentences ending in an ellipsis trail off.",
};
const SERIOUS = " Lines that matter most are spoken slower, lower and with weight.";

/** markers out of the spoken text, positions kept (same rules as the Edge path) */
function stripMarkers(src: string): { plain: string; at: { pos: number; name: string }[] } {
  let plain = "";
  const at: { pos: number; name: string }[] = [];
  for (const part of src.split(/(\[[a-z_]+\])/)) {
    const m = /^\[([a-z_]+)\]$/.exec(part);
    if (m) { at.push({ pos: plain.length, name: m[1] }); if (m[1] === "pause") plain += " … "; }
    else plain += part;
  }
  return { plain: plain.replace(/[ \t]+/g, " ").trim(), at };
}

async function request(text: string, lang: Lang, voice: "male" | "female", serious: boolean): Promise<Buffer> {
  const body = {
    model: MODEL(),
    input: [{ type: "user_input", content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style: STYLE[lang] + (serious ? SERIOUS : "") }] }] }],
    response_format: { type: "audio" },
    generation_config: { speech_config: [{ voice: VOICE(voice) }] },
  };
  for (let attempt = 0; ; attempt++) {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY!, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if ((r.status === 429 || r.status >= 500) && attempt < 4) { await new Promise((ok) => setTimeout(ok, 4000 * (attempt + 1))); continue; }
    if (!r.ok) throw new Error(`Gemini TTS ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { steps?: { content?: { type: string; data?: string }[] }[] };
    const data = j.steps?.flatMap((s) => s.content ?? []).find((c) => c.type === "audio" && c.data)?.data;
    if (!data) throw new Error("Gemini TTS: no audio in the response");
    return Buffer.from(data, "base64");
  }
}

/** WAV (RIFF, 16-bit mono) → samples and rate */
function readWav(wav: Buffer): { pcm: Int16Array; rate: number } {
  if (wav.toString("ascii", 0, 4) !== "RIFF") return { pcm: new Int16Array(wav.buffer, wav.byteOffset, wav.length >> 1), rate: 24000 };
  let rate = 24000, off = 12;
  while (off + 8 <= wav.length) {
    const id = wav.toString("ascii", off, off + 4), size = wav.readUInt32LE(off + 4);
    if (id === "fmt ") rate = wav.readUInt32LE(off + 12);
    if (id === "data") {
      const bytes = wav.subarray(off + 8, off + 8 + size), copy = Buffer.from(bytes); // aligned copy
      return { pcm: new Int16Array(copy.buffer, copy.byteOffset, copy.length >> 1), rate };
    }
    off += 8 + size + (size & 1);
  }
  throw new Error("Gemini TTS: WAV without data");
}

async function toMp3(pcm: Int16Array, rate: number): Promise<Buffer> {
  // the package ships ESM only for import() (its require entry exports nothing)
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const enc = new Mp3Encoder(1, rate, 48), out: Uint8Array[] = [];
  for (let i = 0; i < pcm.length; i += 1152) out.push(enc.encodeBuffer(pcm.subarray(i, i + 1152)));
  out.push(enc.flush());
  return Buffer.concat(out.map((u) => Buffer.from(u)));
}

/** voiced 20 ms frames (loudness above a level relative to the loud parts of this clip) */
function voicedFrames(pcm: Int16Array, rate: number) {
  const n = Math.round(rate * 0.02), rms: number[] = [];
  for (let i = 0; i < pcm.length; i += n) {
    let s = 0;
    const end = Math.min(pcm.length, i + n);
    for (let k = i; k < end; k++) s += pcm[k] * pcm[k];
    rms.push(Math.sqrt(s / Math.max(1, end - i)));
  }
  const loud = [...rms].sort((a, b) => a - b)[Math.floor(rms.length * 0.9)] || 1;
  return { voiced: rms.map((r) => r > loud * 0.08), frameMs: 20 };
}

/** letter mouth shapes spread over the voiced frames only */
function visemesFromAudio(text: string, pcm: Int16Array, rate: number): Viseme[] {
  const { voiced, frameMs } = voicedFrames(pcm, rate);
  const letters = text.toLocaleLowerCase("az").split("").filter((ch) => LETTER[ch] !== undefined || ch === " ");
  const voicedCount = voiced.filter(Boolean).length || 1;
  const out: Viseme[] = [];
  let k = 0, seen = 0;
  voiced.forEach((v, f) => {
    const t = f * frameMs;
    if (!v) { if (out.length && out[out.length - 1].id !== 0) out.push({ t, id: 0 }); return; }
    const target = Math.floor((++seen / voicedCount) * letters.length);
    for (; k < target; k++) {
      const id = letters[k] === " " ? -1 : LETTER[letters[k]];
      if (id >= 0 && (!out.length || out[out.length - 1].id !== id)) out.push({ t: t + Math.round(((k % 3) * frameMs) / 3), id });
    }
  });
  out.push({ t: voiced.length * frameMs, id: 0 });
  return out;
}

export async function geminiSynthesizeStory(src: string, lang: Lang, voice: "male" | "female"): Promise<{ audio: Buffer; visemes: Viseme[]; marks: { t: number; name: string }[] }> {
  const { plain, at } = stripMarkers(src);
  const { pcm, rate } = readWav(await request(plain, lang, voice, at.some((m) => m.name === "serious")));
  const durMs = (pcm.length / rate) * 1000;
  const marks = at.map((m) => ({ t: Math.round((m.pos / Math.max(1, plain.length)) * durMs), name: m.name }));
  return { audio: await toMp3(pcm, rate), visemes: visemesFromAudio(plain, pcm, rate), marks };
}

export async function geminiSynthesize(text: string, lang: Lang, voice: "male" | "female"): Promise<{ audio: Buffer; visemes: Viseme[] }> {
  const { audio, visemes } = await geminiSynthesizeStory(text, lang, voice);
  return { audio, visemes };
}
