/* ElevenLabs TTS (server only): Eleven v3 speaks Azerbaijani. Returns MP3 plus a viseme timeline
   built from ElevenLabs' per-character timings (same ids as Azure, so lip sync works unchanged). */
import "server-only";
import type { Lang, Viseme } from "../types";
import { LETTER } from "./visemes";

/** voice used for Azerbaijani (chosen by the project owner); override with ELEVENLABS_VOICE_ID */
const DEFAULT_VOICE = "YH1Mz146w2IogsiQAoF0";

export const elevenConfigured = () => !!process.env.ELEVENLABS_API_KEY;
/** languages ElevenLabs handles; English stays on Azure / browser speech */
export const elevenLangs: Lang[] = ["az"];

interface Alignment { characters: string[]; character_start_times_seconds: number[] }

export async function elevenSynthesize(text: string): Promise<{ audio: Buffer; visemes: Viseme[] }> {
  const voice = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || "eleven_v3", language_code: "az" }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { audio_base64: string; alignment?: Alignment | null; normalized_alignment?: Alignment | null };
  return { audio: Buffer.from(j.audio_base64, "base64"), visemes: toVisemes(j.alignment ?? j.normalized_alignment) };
}

function toVisemes(a?: Alignment | null): Viseme[] {
  if (!a?.characters?.length) return [];
  const out: Viseme[] = [];
  a.characters.forEach((raw, i) => {
    const ch = raw.toLocaleLowerCase("az");
    const id = LETTER[ch] ?? (/[\s.,!?;:—–]/.test(ch) ? 0 : -1);
    if (id >= 0 && (!out.length || out[out.length - 1].id !== id)) out.push({ t: Math.round(a.character_start_times_seconds[i] * 1000), id });
  });
  out.push({ t: Math.round((a.character_start_times_seconds.at(-1) ?? 0) * 1000) + 120, id: 0 });
  return out;
}
