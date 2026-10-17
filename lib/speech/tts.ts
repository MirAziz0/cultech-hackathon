/* One entry point for neural speech: Azure Speech when AZURE_SPEECH_KEY/REGION are set,
   otherwise the keyless Edge service (same Babek / Ryan voices). */
import type { Lang, Viseme } from "../types";
import { azureConfigured, synthesizeStory as azureStory } from "./azure";
import { edgeSynthesize, edgeSynthesizeStory } from "./edge";

export const ttsProvider = () => (azureConfigured() ? "azure" : "edge");

export function synthesize(text: string, lang: Lang, voice: "male" | "female"): Promise<{ audio: Buffer; visemes: Viseme[] }> {
  // texts may carry stage markers ([serious] …): Azure reads them through the story path (bookmarks), never aloud
  return azureConfigured() ? azureStory(text, lang, voice).then(({ audio, visemes }) => ({ audio, visemes })) : edgeSynthesize(text, lang, voice);
}

export function synthesizeStory(src: string, lang: Lang, voice: "male" | "female"): Promise<{ audio: Buffer; visemes: Viseme[]; marks: { t: number; name: string }[] }> {
  return azureConfigured() ? azureStory(src, lang, voice) : edgeSynthesizeStory(src, lang, voice);
}
