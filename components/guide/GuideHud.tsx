"use client";
/* The guide's on-screen layer in walk mode (the guide himself is 3D in the scene):
   cinematic subtitles synced to speech, small source chips, floating controls
   (tour ▶/❚❚, next stop, mic, keyboard, mute, CC), the question box (opens on tap)
   and the free-mode "Memar danışsın?" offer. Markers in stories ([point], [smile]…) are
   reported through body.mark() when the voice reaches them. */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import type { Fact, Lang, MonumentBundle, TourStop, Viseme } from "@/lib/types";
import { Speaker } from "@/lib/speech/speaker";
import type { Mouth } from "@/lib/speech/visemes";
import { mockAnswer } from "@/lib/mock";
import { narrationAudioUrl } from "@/lib/bundle";
import { zoneInfoFor } from "@/lib/eras";
import { parseStory, type Marker, type ParsedStory } from "@/lib/guide/story";
import type { TourPhase } from "@/lib/guide/tour";
import { FactChip } from "@/components/monument/FactsPanel";

export interface GuideHudHandle {
  /** tell a tour stop's story (falls back to the zone narration) */
  tellStop(stop: TourStop): void;
  greet(): void;
  stop(): void;
}

export interface GuideBody {
  talk(on: boolean): void;
  viseme(id: number, open: number): void;
  mouth(m: Mouth, open: number): void;
  mark(name: Marker): void;
}

interface Line extends ParsedStory { factIds: string[]; who: "architect" | "you"; lang: Lang; marksMs?: number[] }

type SR = { lang: string; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

const btn = "grid h-10 w-10 shrink-0 place-items-center rounded-full border-0 text-[15px] text-white transition-colors max-sm:h-9 max-sm:w-9";

export const GuideHud = forwardRef<GuideHudHandle, {
  bundle: MonumentBundle;
  era?: string;
  zone: string | null;
  body: GuideBody;
  tour: { phase: TourPhase; index: number; count: number; title?: string; play(): void; pause(): void; next(): void; leave(): void };
  offer: TourStop | null;
  onOffer(yes: boolean): void;
  /** the visitor started asking: pause the tour */
  onAsk(): void;
}>(function GuideHud({ bundle, era, zone, body, tour, offer, onOffer, onAsk }, ref) {
  const m = bundle.manifest;
  const { t, c, lang } = useT();
  const speaker = useRef<Speaker | null>(null);
  const bodyRef = useRef(body);
  useEffect(() => { bodyRef.current = body; }, [body]);
  const [line, setLine] = useState<Line | null>(null);
  const lineRef = useRef<Line | null>(null);
  const [chunk, setChunk] = useState(0);
  const fired = useRef(0);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cc, setCc] = useState(true);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [status, setStatus] = useState<{ llm: boolean; tts: boolean } | null>(null);
  const history = useRef<{ role: "user" | "assistant"; text: string }[]>([]);
  const rec = useRef<SR | null>(null);
  const audioMode = useRef(false);

  useEffect(() => {
    const s = new Speaker({});
    speaker.current = s;
    s.setEvents({
      onStart: (md) => { audioMode.current = md === "audio" || md === "tts"; setSpeaking(true); bodyRef.current.talk(true); },
      onEnd: () => { setSpeaking(false); bodyRef.current.talk(false); bodyRef.current.mouth("rest", 0); },
      onMouth: (mm, open) => bodyRef.current.mouth(mm, open),
      onViseme: (id, open) => bodyRef.current.viseme(id, open),
      onProgress: (p, ms) => {
        const l = lineRef.current;
        if (!l || l.who !== "architect") return;
        const pos = p * l.plain.length;
        // subtitle chunk
        let k = l.chunks.findIndex((ch) => pos < ch.to);
        if (k < 0) k = l.chunks.length - 1;
        setChunk((old) => (old === k ? old : k));
        // markers: exact bookmark times with cached audio, else character position
        while (fired.current < l.marks.length) {
          const mk = l.marks[fired.current];
          const due = audioMode.current && l.marksMs?.[fired.current] !== undefined ? ms >= l.marksMs[fired.current] : pos >= mk.at;
          if (!due) break;
          fired.current++;
          bodyRef.current.mark(mk.name);
        }
      },
    });
    return () => s.stop();
  }, []);
  useEffect(() => { fetch("/api/architect").then((r) => r.json()).then(setStatus).catch(() => setStatus({ llm: false, tts: false })); }, []);
  useEffect(() => { if (speaker.current) speaker.current.muted = muted; if (muted) speaker.current?.stop(); }, [muted]);

  const say = useCallback((src: string, factIds: string[], L: Lang, audio?: { url?: string; visemes?: Viseme[]; marks?: { t: number }[] }) => {
    const parsed = parseStory(src);
    const l: Line = { ...parsed, factIds, who: "architect", lang: L, marksMs: audio?.marks?.map((x) => x.t) };
    lineRef.current = l;
    fired.current = 0;
    setLine(l);
    setChunk(0);
    setShowSources(false);
    speaker.current?.speak({ text: parsed.plain, lang: L, voice: m.architect.voice, allowTts: status?.tts ?? true, audioUrl: audio?.url, visemes: audio?.visemes });
  }, [m.architect.voice, status]);

  const tellStop = useCallback((s: TourStop) => {
    const st = (era && bundle.stories[`${s.id}@${era}`]) || bundle.stories[s.id];
    if (st) {
      say(c(st.text), st.factIds, lang, { url: narrationAudioUrl(bundle, st.audio?.[lang] ? `stops/${st.audio[lang]}` : undefined), visemes: st.visemes?.[lang], marks: st.marks?.[lang] });
      return;
    }
    // no story written yet: the zone narration (or zone card text)
    const n = (era && bundle.narration[`${s.zone}@${era}`]) || bundle.narration[s.zone];
    const info = zoneInfoFor(m.walk, s.zone, era);
    const text = n ? c(n.text) : info ? c(info.text) : "";
    if (!text) return;
    say(text, n?.factIds ?? info?.factIds ?? [], lang, { url: narrationAudioUrl(bundle, n?.audio?.[lang]), visemes: n?.visemes?.[lang] });
  }, [bundle, c, era, lang, m.walk, say]);

  const greet = useCallback(() => {
    const st = bundle.stories["intro"];
    const n = bundle.narration["intro"] ?? (era ? bundle.narration[`intro@${era}`] : undefined);
    if (st) say(c(st.text), st.factIds, lang, { url: narrationAudioUrl(bundle, st.audio?.[lang] ? `stops/${st.audio[lang]}` : undefined), visemes: st.visemes?.[lang], marks: st.marks?.[lang] });
    else if (n) say(`[smile] ${c(n.text)}`, n.factIds, lang, { url: narrationAudioUrl(bundle, n.audio?.[lang]), visemes: n.visemes?.[lang] });
    else say(`[smile] ${c(m.architect.greeting)}`, [], lang);
  }, [bundle, c, era, lang, m.architect.greeting, say]);

  useImperativeHandle(ref, () => ({ tellStop, greet, stop: () => speaker.current?.stop() }), [tellStop, greet]);

  const ask = useCallback(async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    onAsk();
    setInput("");
    setTyping(false);
    setBusy(true);
    speaker.current?.stop();
    const you: Line = { ...parseStory(question), factIds: [], who: "you", lang };
    lineRef.current = you;
    setLine(you);
    setChunk(0);
    let ans: { text: string; factIds: string[]; lang: Lang };
    try {
      const r = await fetch("/api/architect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: m.slug, question, lang, zone, era, history: history.current.slice(-6) }) });
      if (!r.ok) throw new Error(String(r.status));
      ans = await r.json();
    } catch {
      ans = mockAnswer(question, bundle.facts, bundle.qa, lang, { knowsUntil: m.architect.historical?.knowsUntil });
    }
    history.current.push({ role: "user", text: question }, { role: "assistant", text: ans.text });
    setBusy(false);
    say(ans.text, ans.factIds, ans.lang);
  }, [busy, bundle.facts, bundle.qa, era, lang, m.architect.historical?.knowsUntil, m.slug, onAsk, say, zone]);

  const SRClass = typeof window !== "undefined" ? ((window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition) : undefined;
  const mic = () => {
    if (!SRClass) { setTyping(true); return; }
    if (listening) { rec.current?.stop(); return; }
    speaker.current?.stop();
    const r = new SRClass();
    r.lang = lang === "az" ? "az-AZ" : "en-US";
    r.interimResults = true;
    r.maxAlternatives = 1;
    let final = "";
    r.onresult = (e) => { final = Array.from(e.results).map((x) => x[0].transcript).join(" "); setInput(final); };
    r.onend = () => { setListening(false); if (final.trim()) ask(final); };
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };

  const facts: Fact[] = (line?.who === "architect" ? line.factIds : [])
    .map((id) => bundle.facts.find((f) => f.id === id))
    .filter((f): f is Fact => !!f);
  const sub = busy ? t("thinking") : line ? (line.who === "you" ? `“${line.plain}”` : line.chunks[chunk]?.text ?? "") : "";
  const playing = tour.phase !== "idle" && tour.phase !== "done" && tour.phase !== "paused";

  return (
    <>
      {/* subtitles + sources */}
      {cc && sub && (speaking || busy || line?.who === "you") && (
        <div aria-live="polite" className="pointer-events-none fixed inset-x-0 z-30 flex flex-col items-center gap-1.5 px-4 bottom-[calc(max(12px,env(safe-area-inset-bottom))+76px)] max-sm:bottom-[calc(max(12px,env(safe-area-inset-bottom))+118px)] max-sm:pr-[180px] max-sm:pl-14">
          <p key={`${chunk}-${line?.plain.length}`} className="anim-in m-0 max-w-[min(720px,100%)] rounded-md bg-black/62 px-4 py-2 text-center font-display text-[19px] leading-snug text-white shadow-[0_6px_24px_rgba(0,0,0,.35)] [text-shadow:0_1px_2px_rgba(0,0,0,.6)] max-sm:px-2.5 max-sm:py-1.5 max-sm:text-[14.5px]">
            {line?.who === "you" ? <span className="text-[#9fe0e3]">{sub}</span> : sub}
          </p>
        </div>
      )}
      {facts.length > 0 && (
        <div className="fixed z-30 flex max-w-[min(560px,calc(100vw-24px))] flex-col items-start gap-1 left-[max(12px,env(safe-area-inset-left))] bottom-[calc(max(12px,env(safe-area-inset-bottom))+56px)] max-sm:bottom-auto max-sm:top-[calc(max(12px,env(safe-area-inset-top))+96px)] max-sm:max-w-[200px]">
          <button type="button" onClick={() => setShowSources((v) => !v)} aria-expanded={showSources}
            className="glass rounded-full border border-white/15 px-2.5 py-1 font-mono text-[10.5px] tracking-wide text-[#e5dccb]">
            ⓘ {c({ az: "Mənbələr", en: "Sources" })} · {facts.length}
          </button>
          {showSources && (
            <div className="glass flex flex-wrap gap-1 rounded-md border border-white/15 p-1.5 [&_a]:border-white/20 [&_a]:bg-white/10 [&_a]:text-white">
              {facts.map((f) => <FactChip key={f.id} fact={f} />)}
              {status && !status.llm && <span className="w-full font-mono text-[10px] text-[#b9ad99]">{t("mockNote")}</span>}
            </div>
          )}
        </div>
      )}

      {/* free mode: offer the story of this place */}
      {offer && !speaking && (
        <div className="anim-in glass fixed left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 py-1 pr-1 pl-3.5 text-[13.5px] bottom-[calc(max(12px,env(safe-area-inset-bottom))+124px)] max-sm:bottom-[calc(max(12px,env(safe-area-inset-bottom))+170px)]">
          <span>{c({ az: "Memar danışsın?", en: "Shall the architect tell?" })} <b className="font-display">{c(offer.title)}</b></span>
          <button type="button" onClick={() => onOffer(true)} className="h-8 rounded-full bg-accent px-3 text-[12.5px] font-semibold text-accent-ink">{c({ az: "Bəli", en: "Yes" })}</button>
          <button type="button" aria-label={t("close")} onClick={() => onOffer(false)} className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-[12px]">✕</button>
        </div>
      )}

      {/* question box (opens on tap) */}
      {typing && (
        <form className="anim-in glass fixed left-1/2 z-40 flex w-[min(520px,calc(100vw-24px))] -translate-x-1/2 gap-1.5 rounded-full border border-white/15 p-1.5 bottom-[calc(max(12px,env(safe-area-inset-bottom))+60px)] max-sm:bottom-[calc(max(12px,env(safe-area-inset-bottom))+124px)]"
          onSubmit={(e) => { e.preventDefault(); ask(input); }}>
          <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("ask")} aria-label={t("ask")} maxLength={500}
            className="h-10 min-w-0 flex-1 rounded-full border border-white/20 bg-black/30 px-3.5 text-[14px] text-white placeholder:text-white/50 focus:border-[#7fd0d4] focus:outline-none" />
          <button type="submit" disabled={busy || !input.trim()} className="h-10 shrink-0 rounded-full bg-accent px-3.5 text-[13px] font-semibold text-accent-ink disabled:opacity-50">{t("send")}</button>
          <button type="button" aria-label={t("close")} onClick={() => setTyping(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-[13px]">✕</button>
        </form>
      )}

      {/* floating controls: row bottom-left on desktop, column on the left edge on phones */}
      <div role="toolbar" aria-label={c(m.architect.name)}
        className="glass fixed z-30 flex items-center gap-1 rounded-full border border-white/15 p-1 left-[max(12px,env(safe-area-inset-left))] bottom-[max(12px,env(safe-area-inset-bottom))] max-sm:top-1/2 max-sm:bottom-auto max-sm:-translate-y-1/2 max-sm:flex-col">
        {tour.count > 0 && (playing ? (
          <button type="button" aria-label={c({ az: "Turu dayandır", en: "Pause tour" })} onClick={() => { speaker.current?.stop(); tour.pause(); }} className={`${btn} bg-white/10`}>❚❚</button>
        ) : (
          <button type="button" aria-label={c({ az: "Turu başlat", en: "Play tour" })} onClick={tour.play} className={`${btn} bg-accent text-accent-ink!`}>▶</button>
        ))}
        {tour.count > 0 && <button type="button" aria-label={c({ az: "Növbəti dayanacaq", en: "Next stop" })} onClick={() => { speaker.current?.stop(); tour.next(); }} className={`${btn} bg-white/10`}>⏭</button>}
        <button type="button" aria-label={listening ? t("listening") : t("mic")} aria-pressed={listening} onClick={mic} className={`${btn} ${listening ? "animate-pulse bg-hyp" : "bg-white/10"}`}>🎤</button>
        <button type="button" aria-label={t("ask")} aria-pressed={typing} onClick={() => setTyping((v) => !v)} className={`${btn} ${typing ? "bg-white/25" : "bg-white/10"}`}>⌨</button>
        <button type="button" aria-label={muted ? t("unmute") : t("mute")} aria-pressed={muted} onClick={() => setMuted(!muted)} className={`${btn} bg-white/10`}>{muted ? "🔇" : "🔊"}</button>
        <button type="button" aria-label={c({ az: "Subtitrlər", en: "Subtitles" })} aria-pressed={cc} onClick={() => setCc(!cc)} className={`${btn} font-mono text-[11px]! font-bold ${cc ? "bg-white/25" : "bg-white/10 opacity-60"}`}>CC</button>
        {tour.count > 0 && (
          <span className="px-2 font-mono text-[10.5px] whitespace-nowrap text-[#cfc3ad] max-lg:hidden">
            {tour.index >= 0 && tour.phase !== "idle" && tour.phase !== "done" ? `${tour.index + 1}/${tour.count} · ${tour.title ?? ""}` : c({ az: "Sərbəst gəzinti", en: "Free walk" })}
          </span>
        )}
        {tour.count > 0 && tour.phase !== "idle" && tour.phase !== "done" && (
          <button type="button" aria-label={c({ az: "Turdan çıx, sərbəst gəz", en: "Leave tour, explore freely" })} onClick={() => { speaker.current?.stop(); tour.leave(); }} className={`${btn} bg-white/10 text-[12px]!`}>✕</button>
        )}
      </div>
    </>
  );
});
