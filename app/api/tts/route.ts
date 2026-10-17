/* POST /api/tts {text, lang, voice} → {audio: base64 mp3, visemes} via Azure Speech.
   204 when Azure is not configured: the client falls back to browser speech or silent subtitles. */
import { z } from "zod/v4";
import { azureConfigured, synthesize } from "@/lib/speech/azure";

const Body = z.object({ text: z.string().min(1).max(900), lang: z.enum(["az", "en"]), voice: z.enum(["male", "female"]) });

export async function POST(req: Request) {
  if (!azureConfigured()) return new Response(null, { status: 204 });
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
    console.error("[tts]", (e as Error).message);
    return new Response(null, { status: 204 });
  }
}
