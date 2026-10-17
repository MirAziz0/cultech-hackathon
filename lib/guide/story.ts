/* Story text with stage markers, e.g.
     "[smile] Xoş gəldin! … [look_up] İndi başını qaldır. [pause] Amma bir sirr deyim…"
   parseStory() strips the markers for speech and subtitles and remembers where they were,
   so gestures fire when the voice reaches them (by character position, or by the exact
   Azure bookmark time when narration audio was pre-generated). */

export const MARKERS = ["point", "look_up", "smile", "serious", "surprised", "think", "wave", "nod", "photo", "pause"] as const;
export type Marker = (typeof MARKERS)[number];

export interface ParsedStory {
  /** text as spoken (markers removed, [pause] → "…") */
  plain: string;
  /** marker positions as character offsets into `plain` */
  marks: { at: number; name: Marker }[];
  /** subtitle chunks (1–2 lines), character ranges into `plain` */
  chunks: { from: number; to: number; text: string }[];
}

const MAX_CHUNK = 86; // two lines of ~43 characters

export function parseStory(src: string): ParsedStory {
  let plain = "";
  const marks: ParsedStory["marks"] = [];
  const re = /\[([a-z_]+)\]/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    plain += src.slice(last, m.index);
    last = m.index + m[0].length;
    const name = m[1] as Marker;
    if (!MARKERS.includes(name)) continue;
    if (name === "pause") plain = plain.replace(/\s*$/, "") + "… ";
    marks.push({ at: plain.length, name });
  }
  plain = (plain + src.slice(last)).replace(/\s+/g, " ").replace(/\s+([,.!?…])/g, "$1").trim();
  return { plain, marks, chunks: chunkText(plain) };
}

/** split into sentences, then long sentences at commas/dashes, never above MAX_CHUNK where possible */
export function chunkText(t: string): ParsedStory["chunks"] {
  const out: ParsedStory["chunks"] = [];
  const sentences = t.match(/[^.!?…]+[.!?…]+["”»]?\s*|[^.!?…]+$/g) ?? [t];
  let pos = 0;
  for (const raw of sentences) {
    let s = raw;
    const start = t.indexOf(raw, pos);
    pos = start + raw.length;
    let off = start;
    while (s.trim().length > MAX_CHUNK) {
      // break at the last comma/dash/semicolon before the limit, else the last space
      const head = s.slice(0, MAX_CHUNK);
      let cut = Math.max(head.lastIndexOf(", "), head.lastIndexOf(" — "), head.lastIndexOf("; "));
      if (cut < MAX_CHUNK * 0.4) cut = head.lastIndexOf(" ");
      if (cut <= 0) break;
      const piece = s.slice(0, cut + 1);
      out.push({ from: off, to: off + piece.length, text: piece.trim() });
      off += piece.length;
      s = s.slice(piece.length);
    }
    if (s.trim()) out.push({ from: off, to: off + s.length, text: s.trim() });
  }
  return out;
}

/** text for TTS (markers out, pauses as ellipses) */
export const speakable = (src: string) => parseStory(src).plain;

/** character position reached at `progress` (0..1), weighting pauses like the speech estimate */
export function charAt(plain: string, progress: number) {
  return Math.round(Math.max(0, Math.min(1, progress)) * plain.length);
}
