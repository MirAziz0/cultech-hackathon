/* Mock architect: answers from facts.json + qa.json without any API. Used when ANTHROPIC_API_KEY
   is missing, when the API fails, and on the client when offline. Pure function, shared by server and client. */
import type { Fact, Lang, QA } from "./types";

const norm = (s: string) =>
  s.toLocaleLowerCase("az").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ");
const STOP = new Set(
  "bu nə necə niyə kim hansı harada nədir idi var və ilə da də bir mi mı mu mü the a an is was what how why who which where of in to and or did does do you your i me tell about haqqında barədə danış".split(" "),
);
const words = (s: string) => norm(s).split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

/** simple language guess: Azerbaijani-specific letters or common words */
export function guessLang(q: string): Lang {
  if (/[əğıöüşç]/i.test(q) || /\b(nə|necə|niyə|kim|haqqında|barədə|nədir|neçə)\b/i.test(q)) return "az";
  if (/\b(what|how|why|who|when|where|the|is|was|tell)\b/i.test(q)) return "en";
  return "az";
}

function score(qw: string[], hay: string) {
  const h = norm(hay);
  let s = 0;
  for (const w of qw) {
    if (h.includes(w)) s += 2;
    else if (w.length > 4 && h.includes(w.slice(0, 4))) s += 1; // crude stemming for agglutinative az
  }
  return s;
}

export interface Answer { text: string; factIds: string[]; lang: Lang; mock: true }

/** knowsUntil: for a historical guide, facts after that year are quoted from sources, not told first-hand */
export function mockAnswer(question: string, facts: Fact[], qa: QA[], langHint?: Lang, opts: { knowsUntil?: number } = {}): Answer {
  const lang = guessLang(question) ?? langHint ?? "az";
  const qw = words(question);
  // 1) canned Q&A
  let bestQa: QA | null = null, bq = 0;
  for (const item of qa) {
    const s = score(qw, item.keys.join(" "));
    if (s > bq) { bq = s; bestQa = item; }
  }
  if (bestQa && bq >= 3) return { text: (lang === "en" ? bestQa.a.en : bestQa.a.az) || bestQa.a.az, factIds: bestQa.factIds, lang, mock: true };
  // 2) best matching facts
  const ranked = facts
    .map((f) => ({ f, s: score(qw, [f.text.az, f.text.en ?? "", ...(f.tags ?? [])].join(" ")) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .filter((x, i, all) => i === 0 || x.s >= all[0].s * 0.6) // drop weak second matches
    .slice(0, 2);
  if (!ranked.length) {
    return {
      text: lang === "en"
        ? "That I cannot say for certain — historians are not sure, and I won't invent it. Ask me about the halls, the domes, the stones or the dates."
        : "Bunu dəqiq deyə bilmərəm — tarixçilər də əmin deyil, uydurmaq istəmirəm. Zallar, günbəzlər, daşlar və tarixlər barədə soruş.",
      factIds: [],
      lang,
      mock: true,
    };
  }
  const intro = lang === "en" ? ["Listen, friend: ", "Here is what the sources say: ", "As far as we know: "] : ["Qulaq as, dostum: ", "Mənbələr belə deyir: ", "Bildiyimiz budur: "];
  const later = opts.knowsUntil !== undefined && ranked.some((x) => x.f.year !== undefined && x.f.year > opts.knowsUntil!);
  // a historical guide never tells later events as a witness
  const pick = later ? (lang === "en" ? "The sources say: " : "Mənbələr yazır ki: ") : intro[(question.length + ranked[0].f.id.length) % intro.length];
  const body = ranked.map((x) => (lang === "en" ? x.f.text.en : x.f.text.az) || x.f.text.az).join(" ");
  const unsure = ranked.some((x) => x.f.verify)
    ? lang === "en" ? " Some of this still needs a historian's check." : " Bunun bir hissəsini tarixçilər hələ yoxlamalıdır."
    : "";
  // keep within ~90 words
  const text = (pick + body).split(/\s+/).slice(0, 85).join(" ") + unsure;
  return { text, factIds: ranked.map((x) => x.f.id), lang, mock: true };
}
