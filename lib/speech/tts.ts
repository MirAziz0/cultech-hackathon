/* One entry point for neural speech, in priority order:
   1) Azure Speech when AZURE_SPEECH_KEY/REGION are set (exact visemes),
   2) Gemini TTS when GEMINI_API_KEY is set (lib/speech/gemini.ts),
   3) the keyless Edge service (Babek / Ryan voices) — also the fallback if Gemini fails. */
import type { Lang, Viseme } from "../types";
import { azureConfigured, synthesizeStory as azureStory } from "./azure";
import { edgeSynthesize, edgeSynthesizeStory } from "./edge";
import { geminiConfigured, geminiSynthesize, geminiSynthesizeStory } from "./gemini";

export const ttsProvider = () => (azureConfigured() ? "azure" : geminiConfigured() ? "gemini" : "edge");

async function viaGemini<T>(run: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    console.warn(`[tts] gemini failed, using edge: ${(e as Error).message}`);
    return fallback();
  }
}

export function synthesize(text: string, lang: Lang, voice: "male" | "female"): Promise<{ audio: Buffer; visemes: Viseme[] }> {
  // texts may carry stage markers ([serious] …): every path reads them as directions, never aloud
  if (azureConfigured()) return azureStory(text, lang, voice).then(({ audio, visemes }) => ({ audio, visemes }));
  if (geminiConfigured()) return viaGemini(() => geminiSynthesize(text, lang, voice), () => edgeSynthesize(text, lang, voice));
  return edgeSynthesize(text, lang, voice);
}

export function synthesizeStory(src: string, lang: Lang, voice: "male" | "female"): Promise<{ audio: Buffer; visemes: Viseme[]; marks: { t: number; name: string }[] }> {
  if (azureConfigured()) return azureStory(src, lang, voice);
  if (geminiConfigured()) return viaGemini(() => geminiSynthesizeStory(src, lang, voice), () => edgeSynthesizeStory(src, lang, voice));
  return edgeSynthesizeStory(src, lang, voice);
}
