"use client";
/* The guide's on-screen layer in walk mode (the guide himself is 3D in the scene):
   cinematic subtitles synced to speech, small source chips, floating controls
   (tour ▶/❚❚, next stop, mic, keyboard, mute, CC), the chat panel (keyboard button: every question and
   answer stays readable there while the answer is also spoken)
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

interface ChatMsg { id: number; who: "you" | "architect"; text: string; factIds: string[]; lang: Lang }

interface Line extends ParsedStory { factIds: string[]; who: "architect" | "you"; lang: Lang; marksMs?: number[] }

type SR = { lang: string; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

const btn = "grid h-11 w-11 shrink-0 place-items-center rounded-xl border-0 text-white transition-colors hover:bg-white/12 focus-visible:outline-2 focus-visible:outline-[#7fd0d4] max-sm:h-10 max-sm:w-10";

/** line icons (24-unit viewBox) for the guide toolbar: same look on every device, unlike emoji */
const ICON: Record<string, string> = {
  play: "M8 5.5v13l11-6.5z",
  pause: "M8 5h3v14H8zM13 5h3v14h-3z",
  next: "M6 5.5v13l9-6.5zM17 5h2v14h-2z",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7",
  keys: "M3 7h18v10H3zM6.5 10h1M9.5 10h1M12.5 10h1M15.5 10h1M8 14h8",
  sound: "M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11",
  mute: "M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5",
  close: "M6 6l12 12M18 6L6 18",
  send: "M4 12l16-8-6 16-2.5-6.5z",
};
function Icon({ name, fill }: { name: keyof typeof ICON; fill?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICON[name]} />
    </svg>
  );
}

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
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const chatId = useRef(0);
  const chatEnd = useRef<HTMLDivElement | null>(null);
  const addChat = useCallback((msg: Omit<ChatMsg, "id">) => setChat((list) => [...list, { ...msg, id: ++chatId.current }]), []);
  useEffect(() => { if (typing) chatEnd.current?.scrollIntoView({ block: "end" }); }, [chat, busy, typing]);
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
    setBusy(true);
    addChat({ who: "you", text: question, factIds: [], lang });
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
    addChat({ who: "architect", text: parseStory(ans.text).plain, factIds: ans.factIds, lang: ans.lang });
    setBusy(false);
    say(ans.text, ans.factIds, ans.lang);
  }, [addChat, busy, bundle.facts, bundle.qa, era, lang, m.architect.historical?.knowsUntil, m.slug, onAsk, say, zone]);

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
  const inTour = tour.index >= 0 && tour.phase !== "idle" && tour.phase !== "done";

  return (
    <>
      {/* subtitles + sources */}
      {cc && sub && (speaking || busy || line?.who === "you") && (
        <div aria-live="polite" className={`pointer-events-none fixed inset-x-0 z-30 ${typing ? "max-sm:hidden" : ""} flex flex-col items-center gap-1.5 px-4 bottom-[calc(max(12px,env(safe-area-inset-bottom))+84px)] max-sm:bottom-[calc(max(12px,env(safe-area-inset-bottom))+118px)] max-sm:pr-[180px] max-sm:pl-14`}>
          <p key={`${chunk}-${line?.plain.length}`} className="anim-in m-0 max-w-[min(720px,100%)] rounded-lg bg-[rgba(14,12,10,.8)] px-4 py-2 text-center font-display text-[19px] leading-snug text-white shadow-[0_6px_24px_rgba(0,0,0,.35)] [text-shadow:0_1px_2px_rgba(0,0,0,.6)] max-sm:px-2.5 max-sm:py-1.5 max-sm:text-[14.5px]">
            {line?.who === "you" ? <span className="text-[#9fe0e3]">{sub}</span> : sub}
          </p>
        </div>
      )}
      {facts.length > 0 && !typing && (
        <div className="fixed z-30 flex max-w-[min(560px,calc(100vw-24px))] flex-col items-start gap-1 left-[max(12px,env(safe-area-inset-left))] bottom-[calc(max(12px,env(safe-area-inset-bottom))+70px)] max-sm:bottom-[calc(max(12px,env(safe-area-inset-bottom))+64px)] max-sm:max-w-[200px]">
          <button type="button" onClick={() => setShowSources((v) => !v)} aria-expanded={showSources}
            className="rounded-full border border-white/12 bg-[rgba(20,17,14,.86)] px-3 py-1.5 text-[12.5px] font-semibold text-[#e5dccb] shadow-[0_6px_18px_rgba(0,0,0,.3)] backdrop-blur-md hover:text-white">
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

      {/* chat with the architect (keyboard button): questions and answers stay readable, answers are also spoken */}
      {typing && (
        <section aria-label={c({ az: "Memarla söhbət", en: "Chat with the architect" })}
          className="anim-in fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-white/12 bg-[rgba(20,17,14,.9)] text-white shadow-[0_16px_40px_rgba(0,0,0,.45)] backdrop-blur-md left-[max(12px,env(safe-area-inset-left))] bottom-[calc(max(12px,env(safe-area-inset-bottom))+72px)] w-[min(400px,calc(100vw-24px))] h-[min(460px,calc(100dvh-180px))] max-sm:inset-x-3 max-sm:bottom-[max(12px,env(safe-area-inset-bottom))] max-sm:w-auto max-sm:h-[min(60dvh,440px)]">
          <header className="flex items-center gap-2 border-b border-white/10 py-2 pr-1.5 pl-3.5">
            <div className="min-w-0 flex-1">
              <b className="block truncate font-display text-[15px]">{c(m.architect.name)}</b>
              <span className="block truncate text-[11.5px] text-[#b9ad99]">{status && !status.llm ? t("mockNote") : c({ az: "Sual verin — cavabı həm oxuyun, həm eşidin", en: "Ask — read the answer and hear it" })}</span>
            </div>
            <button type="button" aria-label={t("close")} title={t("close")} onClick={() => setTyping(false)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10"><Icon name="close" /></button>
          </header>
          <div className="flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3 py-3" aria-live="polite">
            {chat.length === 0 && !busy && (
              <p className="m-0 rounded-xl bg-white/6 px-3 py-2.5 text-[13.5px] leading-snug text-[#e5dccb]">
                {c({ az: "Salam! Bu abidə haqqında nə bilmək istəyirsiniz? Məsələn: “Nə vaxt tikilib?” və ya “Bu otaq nə üçün idi?”", en: "Hello! What would you like to know about this monument? For example: “When was it built?” or “What was this room for?”" })}
              </p>
            )}
            {chat.map((msg) => {
              const fs = msg.factIds.map((id) => bundle.facts.find((f) => f.id === id)).filter((f): f is Fact => !!f);
              return msg.who === "you" ? (
                <p key={msg.id} className="m-0 ml-auto w-fit max-w-[85%] rounded-xl rounded-br-sm bg-accent px-3 py-2 text-[14px] leading-snug text-accent-ink">{msg.text}</p>
              ) : (
                <div key={msg.id} className="max-w-[92%]">
                  <p className="m-0 rounded-xl rounded-bl-sm bg-white/10 px-3 py-2 text-[14px] leading-relaxed">{msg.text}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1 [&_a]:border-white/20 [&_a]:bg-white/10 [&_a]:text-white">
                    <button type="button" onClick={() => say(msg.text, msg.factIds, msg.lang)} title={c({ az: "Yenidən dinlə", en: "Listen again" })} aria-label={c({ az: "Yenidən dinlə", en: "Listen again" })}
                      className="grid h-7 w-7 place-items-center rounded-full text-[#cfc3ad] hover:bg-white/10 hover:text-white [&_svg]:h-4 [&_svg]:w-4"><Icon name="sound" /></button>
                    {fs.map((f) => <FactChip key={f.id} fact={f} />)}
                  </div>
                </div>
              );
            })}
            {busy && <p className="m-0 w-fit animate-pulse rounded-xl bg-white/10 px-3 py-2 text-[13.5px] text-[#cfc3ad]">{t("thinking")}</p>}
            <div ref={chatEnd} />
          </div>
          <form className="flex gap-1.5 border-t border-white/10 p-2" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
            <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("ask")} aria-label={t("ask")} maxLength={500}
              className="h-10 min-w-0 flex-1 rounded-full border border-white/20 bg-black/30 px-3.5 text-[14px] text-white placeholder:text-white/50 focus:border-[#7fd0d4] focus:outline-none" />
            <button type="button" title={listening ? t("listening") : t("mic")} aria-label={listening ? t("listening") : t("mic")} aria-pressed={listening} onClick={mic} className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${listening ? "animate-pulse bg-hyp" : "bg-white/10 hover:bg-white/15"}`}><Icon name="mic" /></button>
            <button type="submit" disabled={busy || !input.trim()} title={t("send")} aria-label={t("send")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-accent-ink disabled:opacity-50"><Icon name="send" fill /></button>
          </form>
        </section>
      )}

      {/* guide toolbar: a row bottom-left on desktop, a column on the left edge on phones */}
      <div role="toolbar" aria-label={c(m.architect.name)}
        className="fixed z-30 flex items-center gap-1 rounded-2xl border border-white/12 bg-[rgba(20,17,14,.86)] p-1.5 text-white shadow-[0_10px_30px_rgba(0,0,0,.35)] backdrop-blur-md left-[max(12px,env(safe-area-inset-left))] bottom-[max(12px,env(safe-area-inset-bottom))] max-sm:top-1/2 max-sm:bottom-auto max-sm:-translate-y-1/2 max-sm:flex-col max-sm:p-1">
        {tour.count > 0 && (
          <>
            {playing ? (
              <button type="button" title={c({ az: "Turu dayandır", en: "Pause tour" })} aria-label={c({ az: "Turu dayandır", en: "Pause tour" })} onClick={() => { speaker.current?.stop(); tour.pause(); }} className={`${btn} bg-white/10`}><Icon name="pause" fill /></button>
            ) : (
              <button type="button" title={c({ az: "Turu başlat", en: "Play tour" })} aria-label={c({ az: "Turu başlat", en: "Play tour" })} onClick={tour.play} className={`${btn} bg-accent text-accent-ink! hover:bg-accent`}><Icon name="play" fill /></button>
            )}
            <button type="button" title={c({ az: "Növbəti dayanacaq", en: "Next stop" })} aria-label={c({ az: "Növbəti dayanacaq", en: "Next stop" })} onClick={() => { speaker.current?.stop(); tour.next(); }} className={btn}><Icon name="next" fill /></button>
            {/* tour progress */}
            <div className="grid w-[210px] gap-1 px-2.5 max-lg:hidden">
              <span className="flex items-baseline gap-1.5 text-[13px] leading-tight">
                {inTour ? <b className="font-mono text-[12px] text-[#f2c46b]">{tour.index + 1}/{tour.count}</b> : null}
                <span className="truncate font-semibold">{inTour ? tour.title : c({ az: "Sərbəst gəzinti", en: "Free walk" })}</span>
              </span>
              <span className="h-1 overflow-hidden rounded-full bg-white/15">
                <span className="block h-full rounded-full bg-[#f2c46b] transition-[width] duration-500" style={{ width: `${inTour ? ((tour.index + 1) / tour.count) * 100 : 0}%` }} />
              </span>
            </div>
            {inTour && <span className="hidden px-1 font-mono text-[11px] text-[#f2c46b] max-lg:block">{tour.index + 1}/{tour.count}</span>}
            <span aria-hidden="true" className="mx-0.5 h-7 w-px bg-white/15 max-sm:h-px max-sm:w-7" />
          </>
        )}
        <button type="button" title={listening ? t("listening") : t("mic")} aria-label={listening ? t("listening") : t("mic")} aria-pressed={listening} onClick={mic} className={`${btn} ${listening ? "animate-pulse bg-hyp" : ""}`}><Icon name="mic" /></button>
        <button type="button" title={t("ask")} aria-label={t("ask")} aria-pressed={typing} onClick={() => setTyping((v) => !v)} className={`${btn} ${typing ? "bg-white/20" : ""}`}><Icon name="keys" /></button>
        <button type="button" title={muted ? t("unmute") : t("mute")} aria-label={muted ? t("unmute") : t("mute")} aria-pressed={muted} onClick={() => setMuted(!muted)} className={btn}><Icon name={muted ? "mute" : "sound"} /></button>
        <button type="button" title={c({ az: "Subtitrlər", en: "Subtitles" })} aria-label={c({ az: "Subtitrlər", en: "Subtitles" })} aria-pressed={cc} onClick={() => setCc(!cc)} className={`${btn} ${cc ? "bg-white/20" : "opacity-55"}`}>
          <span className="rounded-[4px] border-[1.8px] border-current px-1 font-mono text-[11px] leading-[15px] font-bold">CC</span>
        </button>
        {tour.count > 0 && inTour && (
          <>
            <span aria-hidden="true" className="mx-0.5 h-7 w-px bg-white/15 max-sm:h-px max-sm:w-7" />
            <button type="button" title={c({ az: "Turdan çıx, sərbəst gəz", en: "Leave tour, explore freely" })} aria-label={c({ az: "Turdan çıx, sərbəst gəz", en: "Leave tour, explore freely" })} onClick={() => { speaker.current?.stop(); tour.leave(); }} className={btn}><Icon name="close" /></button>
          </>
        )}
      </div>
    </>
  );
});
