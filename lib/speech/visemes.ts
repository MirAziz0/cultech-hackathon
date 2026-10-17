/* Mouth shapes for the architect.
   Azure TTS viseme ids (0–21, see Azure "viseme ID" table) are reduced to 8 drawable shapes.
   Without Azure visemes we estimate a timeline from the spelling (Azerbaijani-aware). */
import type { Viseme } from "../types";

export type Mouth = "rest" | "M" | "A" | "E" | "O" | "U" | "F" | "L";

const AZURE_TO_MOUTH: Mouth[] = [
  "rest", // 0 silence
  "A", "A", "O", "E", "E", // 1 æ ə ʌ · 2 ɑ · 3 ɔ · 4 ɛ ʊ · 5 ɝ
  "E", "U", "O", "A", "O", "A", // 6 j i ɪ · 7 w u · 8 o · 9 aʊ · 10 ɔɪ · 11 aɪ
  "E", "L", "L", "E", "U", "L", // 12 h · 13 ɹ · 14 l · 15 s z · 16 ʃ tʃ · 17 ð
  "F", "L", "E", "M", // 18 f v · 19 d t n θ · 20 k g ŋ · 21 p b m
];
export const azureToMouth = (id: number): Mouth => AZURE_TO_MOUTH[id] ?? "E";

export const LETTER: Record<string, number> = {
  a: 2, ə: 1, e: 4, i: 6, ı: 6, o: 8, ö: 8, u: 7, ü: 7,
  m: 21, b: 21, p: 21, f: 18, v: 18, l: 14, r: 13, d: 19, t: 19, n: 19,
  s: 15, z: 15, ş: 16, c: 16, ç: 16, j: 16, k: 20, g: 20, q: 20, ğ: 20, x: 12, h: 12, y: 6, w: 7,
};
const VOWELS = new Set("aəeiıoöuü".split(""));

/** rough speaking rate (characters per second) used for estimated timelines */
export const CHARS_PER_SEC = { az: 13.5, en: 14.5 } as const;

export function estimateDuration(text: string, lang: "az" | "en") {
  const pauses = (text.match(/[.!?…]/g)?.length ?? 0) * 0.35 + (text.match(/[,;:—–]/g)?.length ?? 0) * 0.15;
  return text.length / CHARS_PER_SEC[lang] + pauses;
}

/** estimate a viseme timeline (ms) from text, spread over `durationMs` */
export function estimateVisemes(text: string, durationMs: number): Viseme[] {
  const chars = text.toLocaleLowerCase("az").split("");
  const weights = chars.map((ch) => (VOWELS.has(ch) ? 1.25 : /[.!?…]/.test(ch) ? 3.5 : /[,;:—–]/.test(ch) ? 1.6 : ch === " " ? 0.55 : LETTER[ch] !== undefined ? 0.8 : 0.3));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const out: Viseme[] = [];
  let t = 0;
  chars.forEach((ch, i) => {
    const id = LETTER[ch] ?? (/[\s.,!?;:—–]/.test(ch) ? 0 : -1);
    if (id >= 0 && (!out.length || out[out.length - 1].id !== id)) out.push({ t: Math.round(t), id });
    t += (weights[i] / total) * durationMs;
  });
  out.push({ t: Math.round(durationMs), id: 0 });
  return out;
}

/** openness 0..1 used for amplitude-driven animation and blink/gesture timing */
export const MOUTH_OPEN: Record<Mouth, number> = { rest: 0, M: 0, F: 0.15, L: 0.45, E: 0.5, U: 0.35, O: 0.7, A: 1 };
