"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import type { Fact, Lang, MonumentBundle } from "@/lib/types";
import { Speaker, type Utterance } from "@/lib/speech/speaker";
import { mockAnswer } from "@/lib/mock";
import { narrationAudioUrl } from "@/lib/bundle";
import { ArchitectSvg, type ArchitectRig } from "./ArchitectSvg";
import { FactChip } from "@/components/monument/FactsPanel";

export interface ArchitectHandle {
  /** speak the narration for a walk zone (force = even if already heard) */
  narrateZone(id: string, force?: boolean): void;
  stop(): void;
}

interface Line { text: string; factIds: string[]; lang: Lang; mock?: boolean; who: "architect" | "you" }

type SR = { lang: string; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

export const ArchitectDock = forwardRef<ArchitectHandle, {
  bundle: MonumentBundle;
  zone: string | null;
  mode: "dock" | "panel";
  onClose?: () => void;
  /** greet when mounted (after a user gesture) */
  greet?: boolean;
  onHeight?: (h: number) => void;
}>(function ArchitectDock({ bundle, zone, mode, onClose, greet = true, onHeight }, ref) {
  const m = bundle.manifest;
  const { t, c, lang } = useT();
  const rig = useRef<ArchitectRig>(null);
  const speaker = useRef<Speaker | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [line, setLine] = useState<Line | null>(null);
  const [progress, setProgress] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState<{ llm: boolean; tts: boolean } | null>(null);
  const [mode2, setMode2] = useState<string>("");
  const history = useRef<{ role: "user" | "assistant"; text: string }[]>([]);
  const heard = useRef(new Set<string>());
  const rec = useRef<SR | null>(null);
  const boxRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !onHeight) return;
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight));
    ro.observe(el);
    return () => { ro.disconnect(); onHeight(0); };
  }, [collapsed, onHeight]);

  useEffect(() => {
    const s = new Speaker({});
    speaker.current = s;
    return () => s.stop();
  }, []);
  useEffect(() => {
    speaker.current?.setEvents({
      onMouth: (mm, open) => rig.current?.setMouth(mm, open),
      onProgress: setProgress,
      onStart: (md) => { setSpeaking(true); setMode2(md); rig.current?.setTalking(true); },
      onEnd: () => { setSpeaking(false); rig.current?.setTalking(false); },
    });
  }, []);
  useEffect(() => {
    fetch("/api/architect").then((r) => r.json()).then(setStatus).catch(() => setStatus({ llm: false, tts: false }));
  }, []);
  useEffect(() => { if (speaker.current) speaker.current.muted = muted; if (muted) speaker.current?.stop(); }, [muted]);

  const say = useCallback((l: Line, u?: Partial<Utterance>) => {
    setLine(l);
    setProgress(0);
    rig.current?.gesture(l.who === "architect" && u?.audioUrl ? "point" : "raise");
    speaker.current?.speak({ text: l.text, lang: l.lang, voice: m.architect.voice, allowTts: status?.tts ?? true, ...u });
  }, [m.architect.voice, status]);

  const narrateZone = useCallback((id: string, force = false) => {
    if (!force && heard.current.has(id)) return;
    heard.current.add(id);
    const n = bundle.narration[id];
    const info = m.walk?.zoneInfo[id];
    if (!n && !info) return;
    const L: Lang = lang;
    const text = n ? c(n.text) : c(info!.text);
    const audio = n?.audio?.[L];
    say(
      { text, factIds: n?.factIds ?? info?.factIds ?? [], lang: L, who: "architect" },
      { audioUrl: narrationAudioUrl(bundle, audio), visemes: n?.visemes?.[L] },
    );
  }, [bundle, c, lang, m.walk, say]);

  useImperativeHandle(ref, () => ({ narrateZone, stop: () => speaker.current?.stop() }), [narrateZone]);

  // greeting (intro narration if pre-generated, else manifest greeting)
  const greeted = useRef(false);
  useEffect(() => {
    if (!greet || greeted.current || status === null) return;
    greeted.current = true;
    const intro = bundle.narration["intro"];
    if (intro) narrateZone("intro", true);
    else say({ text: c(m.architect.greeting), factIds: [], lang, who: "architect" });
  }, [greet, status, bundle.narration, narrateZone, say, c, m.architect.greeting, lang]);

  const ask = useCallback(async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    speaker.current?.stop();
    setLine({ text: question, factIds: [], lang, who: "you" });
    let ans: { text: string; factIds: string[]; lang: Lang; mock?: boolean };
    try {
      const r = await fetch("/api/architect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: m.slug, question, lang, zone, history: history.current.slice(-6) }),
      });
      if (!r.ok) throw new Error(String(r.status));
      ans = await r.json();
    } catch {
      // offline / server down: same mock brain on the client
      ans = mockAnswer(question, bundle.facts, bundle.qa, lang);
    }
    history.current.push({ role: "user", text: question }, { role: "assistant", text: ans.text });
    setBusy(false);
    say({ ...ans, who: "architect" });
  }, [busy, bundle.facts, bundle.qa, lang, m.slug, say, zone]);

  const SRClass = typeof window !== "undefined" ? ((window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition) : undefined;
  const mic = () => {
    if (!SRClass) return;
    if (listening) { rec.current?.stop(); return; }
    speaker.current?.stop();
    const r = new SRClass();
    r.lang = lang === "az" ? "az-AZ" : "en-US";
    r.interimResults = true;
    r.maxAlternatives = 1;
    let final = "";
    r.onresult = (e) => {
      final = Array.from(e.results).map((x) => x[0].transcript).join(" ");
      setInput(final);
    };
    r.onend = () => { setListening(false); if (final.trim()) ask(final); };
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };

  const facts: Fact[] = (line?.factIds ?? [])
    .map((id) => bundle.facts.find((f) => f.id === id))
    .filter((f): f is Fact => !!f)
    .filter((f, i, all) => all.findIndex((g) => g.sources[0]?.url === f.sources[0]?.url) === i);
  const words = line ? line.text.split(/(\s+)/) : [];
  const upto = Math.floor(progress * words.length);

  if (collapsed) {
    return (
      <button ref={(el) => { boxRef.current = el; }} type="button" aria-label={t("expand")} onClick={() => setCollapsed(false)}
        className="glass fixed bottom-[max(12px,env(safe-area-inset-bottom))] left-[max(12px,env(safe-area-inset-left))] z-30 grid h-16 w-16 place-items-center overflow-hidden rounded-full border border-white/20 p-0">
        <span className="block w-[64px] translate-y-1"><ArchitectSvg ref={rig} look={m.architect.look} size={64} title={c(m.architect.name)} /></span>
        {speaking && <span className="absolute top-1 right-1 h-2.5 w-2.5 animate-pulse rounded-full bg-[#7fd0d4]" />}
      </button>
    );
  }

  return (
    <section
      ref={(el) => { boxRef.current = el; }}
      aria-label={`${t("architectIntro")}: ${c(m.architect.name)}`}
      className={
        mode === "dock"
          ? "glass fixed bottom-[max(12px,env(safe-area-inset-bottom))] left-[max(12px,env(safe-area-inset-left))] z-30 w-[min(360px,calc(100vw-24px))] rounded-lg border border-white/15 p-2.5 shadow-[0_12px_40px_rgba(0,0,0,.35)]"
          : "glass fixed right-[max(12px,env(safe-area-inset-right))] bottom-[max(12px,env(safe-area-inset-bottom))] left-[max(12px,env(safe-area-inset-left))] z-40 mx-auto max-w-[560px] rounded-lg border border-white/15 p-3 shadow-[0_12px_40px_rgba(0,0,0,.4)]"
      }
    >
      <div className="flex gap-2.5">
        <div className={`shrink-0 ${mode === "dock" ? "w-[76px] sm:w-[118px]" : "w-[96px] sm:w-[150px]"}`}>
          <ArchitectSvg ref={rig} look={m.architect.look} title={c(m.architect.name)} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-display text-[16px] leading-tight font-bold">{c(m.architect.name)}</div>
              <div className="text-[11px] leading-snug text-[#cfc3ad] max-sm:hidden">{c(m.architect.role)}</div>
            </div>
            <div className="flex shrink-0 gap-1">
              <button type="button" aria-label={muted ? t("unmute") : t("mute")} aria-pressed={muted} onClick={() => setMuted(!muted)}
                className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-[15px]">{muted ? "🔇" : "🔊"}</button>
              {mode === "dock" ? (
                <button type="button" aria-label={t("collapse")} onClick={() => { setCollapsed(true); }}
                  className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-[15px]">▾</button>
              ) : (
                <button type="button" aria-label={t("close")} onClick={() => { speaker.current?.stop(); onClose?.(); }}
                  className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-[14px]">✕</button>
              )}
            </div>
          </div>
          {/* subtitles */}
          <div aria-live="polite" className="mt-1.5 max-h-[132px] min-h-[54px] max-sm:max-h-[78px] max-sm:min-h-[44px] max-sm:text-[12.5px] overflow-y-auto rounded bg-black/30 px-2.5 py-2 text-[13.5px] leading-snug">
            {busy ? (
              <span className="text-[#cfc3ad]">{t("thinking")}</span>
            ) : line ? (
              line.who === "you" ? (
                <span className="text-[#7fd0d4]">“{line.text}”</span>
              ) : (
                <span>
                  {words.map((w, i) => (
                    <span key={i} className={speaking && i >= upto ? "text-white/55" : "text-white"}>{w}</span>
                  ))}
                </span>
              )
            ) : (
              <span className="text-[#cfc3ad]">{c(m.architect.greeting)}</span>
            )}
          </div>
          {facts.length > 0 && line?.who === "architect" && (
            <div className="mt-1.5 flex flex-wrap gap-1 [&_a]:border-white/20 [&_a]:bg-white/10 [&_a]:text-white">
              {facts.slice(0, 3).map((f, i) => <span key={f.id} className={i ? "max-sm:hidden" : ""}><FactChip fact={f} /></span>)}
            </div>
          )}
          {(status && !status.llm) || mode2 === "silent" ? (
            <div className="mt-1 font-mono text-[10px] tracking-wide text-[#b9ad99] max-sm:hidden">
              {status && !status.llm ? t("mockNote") : ""}{mode2 === "silent" && !muted ? (status && !status.llm ? " · " : "") + (lang === "az" ? "səs: subtitr" : "voice: subtitles") : ""}
            </div>
          ) : null}
        </div>
      </div>
      {/* ask */}
      <form className="mt-2 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        {SRClass && (
          <button type="button" onClick={mic} aria-label={listening ? t("listening") : t("mic")} aria-pressed={listening}
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[16px] ${listening ? "animate-pulse bg-hyp text-white" : "bg-white/12"}`}>🎤</button>
        )}
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={listening ? t("listening") : t("ask")} aria-label={t("ask")} maxLength={500}
          className="h-10 min-w-0 flex-1 rounded-full border border-white/20 bg-black/30 px-3.5 text-[14px] text-white placeholder:text-white/50 focus:border-[#7fd0d4] focus:outline-none" />
        <button type="submit" disabled={busy || !input.trim()} className="h-10 shrink-0 rounded-full bg-accent px-3.5 text-[13px] font-semibold text-accent-ink disabled:opacity-50">{t("send")}</button>
      </form>
    </section>
  );
});
