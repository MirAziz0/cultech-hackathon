/* POST /api/tts {text, lang, voice} → {audio: base64 mp3, visemes}.
   1) Azure Speech when AZURE_SPEECH_KEY/REGION are set, otherwise the keyless Edge service — both use
      az-AZ-BabekNeural for the male architects (lib/speech/tts.ts)
   2) ElevenLabs for Azerbaijani when ELEVENLABS_API_KEY is set (backup; library voices need a paid plan)
   204 when nothing is configured or every provider failed: the client falls back to browser speech or silent subtitles. */
import { z } from "zod/v4";
import { synthesize, ttsProvider } from "@/lib/speech/tts";
import { elevenConfigured, elevenLangs, elevenSynthesize } from "@/lib/speech/elevenlabs";

const Body = z.object({ text: z.string().min(1).max(900), lang: z.enum(["az", "en"]), voice: z.enum(["male", "female"]) });

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  try {
    const { audio, visemes } = await synthesize(body.text, body.lang, body.voice);
    return Response.json({ audio: audio.toString("base64"), visemes });
  } catch (e) {
    console.error(`[tts] ${ttsProvider()}:`, (e as Error).message);
  }
  if (elevenConfigured() && elevenLangs.includes(body.lang)) {
    try {
      const { audio, visemes } = await elevenSynthesize(body.text);
      return Response.json({ audio: audio.toString("base64"), visemes });
    } catch (e) {
      console.error("[tts] elevenlabs:", (e as Error).message);
    }
  }
  return new Response(null, { status: 204 });
}
