/* POST /api/architect — live Q&A with the monument's architect.
   Answers only from that monument's facts.json; returns the fact ids used (UI shows "Mənbə" chips).
   No ANTHROPIC_API_KEY (or any failure) → mock answer from facts/qa, so the demo never breaks. */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { getBundle, listSlugs } from "@/lib/content";
import { guessLang, mockAnswer } from "@/lib/mock";
import { COMMON_RULES, STORY_RULES, factLines, personaRules } from "@/lib/persona";
import type { Lang } from "@/lib/types";
import { zoneInfoFor } from "@/lib/eras";

const Body = z.object({
  slug: z.string().max(64),
  question: z.string().min(1).max(600),
  lang: z.enum(["az", "en"]).optional(),
  zone: z.string().max(64).nullish(),
  era: z.string().max(32).nullish(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(1200) })).max(8).optional(),
});

const Reply = z.object({
  text: z.string().describe("The architect's spoken answer: a short story-flavoured reply, first person, at most 80 words"),
  factIds: z.array(z.string()).describe("ids of the facts the answer relies on; empty if none"),
  lang: z.enum(["az", "en", "other"]).describe("language of the answer"),
});

let client: Anthropic | null = null;
const hasKey = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

function systemPrompt(slug: string) {
  const b = getBundle(slug);
  const m = b.manifest;
  return `${personaRules(m)}
${COMMON_RULES}
${STORY_RULES}
- At most 80 words: a short story-flavoured answer, not a lecture. Plain spoken sentences, no lists, no markdown — it will be read aloud.
- Answer in Azerbaijani by default; if the visitor writes in another language, answer in that language.
- Return the ids of the facts you used in factIds.

FACTS (${m.slug}):
${factLines(b.facts, m)}`;
}

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (!listSlugs().includes(body.slug)) return Response.json({ error: "unknown monument" }, { status: 404 });
  const bundle = getBundle(body.slug);
  const fallback = (reason: string) => Response.json({ ...mockAnswer(body.question, bundle.facts, bundle.qa, body.lang, { knowsUntil: bundle.manifest.architect.historical?.knowsUntil }), reason });
  if (!hasKey()) return fallback("no-key");

  client ??= new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
  const zoneInfo = body.zone ? zoneInfoFor(bundle.manifest.walk, body.zone, body.era ?? undefined) : undefined;
  const eraInfo = body.era ? bundle.manifest.eras[body.era] : undefined;
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...(body.history ?? []).map((h) => ({ role: h.role, content: h.text })),
    {
      role: "user",
      content: `${zoneInfo ? `[Visitor is standing in: ${zoneInfo.title.az} / ${zoneInfo.title.en ?? ""}]\n` : ""}${eraInfo ? `[Era shown: ${eraInfo.label.en ?? eraInfo.label.az}]\n` : ""}${body.question}`,
    },
  ];
  try {
    const res = await client.beta.messages.parse(
      {
        model,
        max_tokens: 2000,
        // conversational route: keep latency low
        output_config: { effort: "low", format: betaZodOutputFormat(Reply) },
        // server-side refusal fallback (runs alone on models without fallback support)
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [{ type: "text", text: systemPrompt(body.slug), cache_control: { type: "ephemeral" } }],
        messages,
      },
      { timeout: 25_000 },
    );
    if (res.stop_reason === "refusal" || !res.parsed_output) return fallback(res.stop_reason ?? "unparsed");
    const out = res.parsed_output;
    const known = new Set(bundle.facts.map((f) => f.id));
    const lang: Lang = out.lang === "en" ? "en" : out.lang === "az" ? "az" : guessLang(body.question);
    return Response.json({ text: out.text, factIds: out.factIds.filter((id) => known.has(id)), lang, mock: false });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) console.error("[architect] invalid API key");
    else if (e instanceof Anthropic.RateLimitError) console.warn("[architect] rate limited");
    else if (e instanceof Anthropic.APIError) console.error(`[architect] API error ${e.status}: ${e.message}`);
    else console.error("[architect]", e);
    return fallback("api-error");
  }
}

export async function GET() {
  return Response.json({ llm: hasKey(), tts: true }); // neural speech always available: Azure with a key, the keyless Edge service without
}
