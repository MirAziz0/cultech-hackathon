/* Azure Speech synthesis with viseme events (server / build scripts only).
   az-AZ-BabekNeural (male) / az-AZ-BanuNeural (female); English uses en-GB voices. */
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import type { Lang, Viseme } from "../types";

export const VOICES: Record<Lang, Record<"male" | "female", string>> = {
  az: { male: "az-AZ-BabekNeural", female: "az-AZ-BanuNeural" },
  en: { male: "en-GB-RyanNeural", female: "en-GB-SoniaNeural" },
};

export const azureConfigured = () => !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function synthesize(text: string, lang: Lang, voice: "male" | "female"): Promise<{ audio: Buffer; visemes: Viseme[] }> {
  const cfg = sdk.SpeechConfig.fromSubscription(process.env.AZURE_SPEECH_KEY!, process.env.AZURE_SPEECH_REGION!);
  cfg.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
  // null audio config: keep the audio in memory instead of playing it on the server
  const synth = new sdk.SpeechSynthesizer(cfg, null as unknown as sdk.AudioConfig);
  const visemes: Viseme[] = [];
  synth.visemeReceived = (_s, e) => visemes.push({ t: Math.round(e.audioOffset / 10_000), id: e.visemeId });
  const name = VOICES[lang][voice];
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${name.slice(0, 5)}">
<voice name="${name}"><mstts:viseme type="redlips_front"/><prosody rate="-4%">${esc(text)}</prosody></voice></speak>`;
  try {
    const result = await new Promise<sdk.SpeechSynthesisResult>((resolve, reject) => synth.speakSsmlAsync(ssml, resolve, reject));
    if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
      const details = sdk.CancellationDetails.fromResult(result as unknown as sdk.RecognitionResult);
      throw new Error(`Azure TTS failed: ${details?.errorDetails ?? result.errorDetails ?? result.reason}`);
    }
    return { audio: Buffer.from(result.audioData), visemes };
  } finally {
    synth.close();
  }
}

/** Story with stage markers → audio + visemes + marker times. Markers become SSML bookmarks
    ([pause] also becomes a short break), so gestures can fire on the exact millisecond. */
export async function synthesizeStory(src: string, lang: Lang, voice: "male" | "female"): Promise<{ audio: Buffer; visemes: Viseme[]; marks: { t: number; name: string }[] }> {
  const cfg = sdk.SpeechConfig.fromSubscription(process.env.AZURE_SPEECH_KEY!, process.env.AZURE_SPEECH_REGION!);
  cfg.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
  const synth = new sdk.SpeechSynthesizer(cfg, null as unknown as sdk.AudioConfig);
  const visemes: Viseme[] = [], marks: { t: number; name: string }[] = [];
  synth.visemeReceived = (_s, e) => visemes.push({ t: Math.round(e.audioOffset / 10_000), id: e.visemeId });
  synth.bookmarkReached = (_s, e) => marks.push({ t: Math.round(e.audioOffset / 10_000), name: e.text });
  const body = src.split(/(\[[a-z_]+\])/).map((part) => {
    const m = /^\[([a-z_]+)\]$/.exec(part);
    if (!m) return esc(part);
    return `<bookmark mark="${m[1]}"/>${m[1] === "pause" ? '<break time="600ms"/>' : ""}`;
  }).join("");
  const name = VOICES[lang][voice];
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${name.slice(0, 5)}">
<voice name="${name}"><mstts:viseme type="redlips_front"/><prosody rate="-4%">${body}</prosody></voice></speak>`;
  try {
    const result = await new Promise<sdk.SpeechSynthesisResult>((resolve, reject) => synth.speakSsmlAsync(ssml, resolve, reject));
    if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) throw new Error(`Azure TTS failed: ${result.errorDetails ?? result.reason}`);
    return { audio: Buffer.from(result.audioData), visemes, marks };
  } finally {
    synth.close();
  }
}
