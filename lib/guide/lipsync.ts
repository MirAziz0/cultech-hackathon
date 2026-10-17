/* Mouth shapes for the 3D guide.
   Azure viseme ids (0–21) map straight to VRM mouth expressions aa/ih/ou/ee/oh;
   the 2D speaker's reduced shapes (Mouth) map to the same set. */
import type { Mouth } from "../speech/visemes";
import { MOUTH_REST, type MouthShape } from "./avatar/types";

type Shape = keyof MouthShape;
/** Azure viseme id → [shape, weight] (Azure "viseme ID" table, en-US/az-AZ share ids) */
const AZURE: ([Shape, number] | null)[] = [
  null,                                   // 0 silence
  ["aa", 0.8], ["aa", 1], ["oh", 0.9],    // 1 æ ə ʌ · 2 ɑ · 3 ɔ
  ["ee", 0.6], ["ee", 0.5], ["ih", 0.7],  // 4 ɛ ʊ · 5 ɝ · 6 j i ɪ
  ["ou", 0.9], ["oh", 0.8], ["aa", 0.9],  // 7 w u · 8 o · 9 aʊ
  ["oh", 0.8], ["aa", 0.85], ["aa", 0.3], // 10 ɔɪ · 11 aɪ · 12 h
  ["ou", 0.4], ["ih", 0.4], ["ih", 0.35], // 13 ɹ · 14 l · 15 s z
  ["ou", 0.45], ["ih", 0.3], ["ih", 0.15],// 16 ʃ tʃ · 17 ð · 18 f v
  ["ih", 0.3], ["ih", 0.35], null,        // 19 d t n θ · 20 k g ŋ · 21 p b m (closed)
];

export function azureToShape(id: number, gain = 1): MouthShape {
  const s = AZURE[id];
  if (!s) return MOUTH_REST;
  return { ...MOUTH_REST, [s[0]]: Math.min(1, s[1] * gain) };
}

const FROM_MOUTH: Record<Mouth, [Shape, number] | null> = {
  rest: null, M: null, F: ["ih", 0.15], L: ["ih", 0.45], E: ["ee", 0.6], U: ["ou", 0.7], O: ["oh", 0.8], A: ["aa", 1],
};

/** 2D speaker mouth (+ openness 0..1) → VRM mouth shape */
export function mouthToShape(m: Mouth, open: number): MouthShape {
  const s = FROM_MOUTH[m];
  if (!s) return MOUTH_REST;
  return { ...MOUTH_REST, [s[0]]: Math.min(1, s[1] * (0.4 + 0.6 * open)) };
}
