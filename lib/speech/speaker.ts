/* Speaker: plays one utterance and drives the architect's mouth + subtitles.
   Priority: 1) pre-generated audio (+ Azure viseme timeline) 2) live Azure TTS via /api/tts
             3) browser speechSynthesis 4) silent subtitles with estimated visemes.
   Lip sync: viseme timeline if present; otherwise AnalyserNode amplitude; otherwise estimate. */
import type { Lang, Viseme } from "../types";
import { azureToMouth, estimateDuration, estimateVisemes, type Mouth } from "./visemes";

export interface Utterance {
  text: string;
  lang: Lang;
  voice: "male" | "female";
  audioUrl?: string;
  visemes?: Viseme[];
  /** try /api/tts when no audioUrl */
  allowTts?: boolean;
}

export interface SpeakerEvents {
  onMouth?: (m: Mouth, open: number) => void;
  /** 0..1 progress for subtitle highlighting, plus elapsed ms */
  onProgress?: (p: number, ms: number) => void;
  /** raw Azure-style viseme id (real or estimated timeline) for 3D lip sync */
  onViseme?: (id: number, open: number) => void;
  onStart?: (mode: "audio" | "tts" | "browser" | "silent") => void;
  onEnd?: () => void;
}

let ctx: AudioContext | null = null;
/** call from a user gesture to unlock audio on iOS/Android */
export function unlockAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = ctx ?? new AC();
    if (ctx.state === "suspended") ctx.resume();
    const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
    s.buffer = b; s.connect(ctx.destination); s.start(0);
    if ("speechSynthesis" in window) { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); }
  } catch {}
}

function pickVoice(lang: Lang): SpeechSynthesisVoice | null {
  if (!("speechSynthesis" in window)) return null;
  const voices = speechSynthesis.getVoices();
  const want = lang === "az" ? ["az-AZ", "az"] : ["en-GB", "en-US", "en"];
  for (const w of want) {
    const v = voices.find((x) => x.lang.replace("_", "-").toLowerCase().startsWith(w.toLowerCase()));
    if (v) return v;
  }
  // Turkish voices read Azerbaijani text tolerably; better than silence
  if (lang === "az") return voices.find((x) => x.lang.toLowerCase().startsWith("tr")) ?? null;
  return null;
}

export class Speaker {
  muted = false;
  private audio: HTMLAudioElement | null = null;
  private raf = 0;
  private token = 0;
  private analyser: AnalyserNode | null = null;
  private srcNode: MediaElementAudioSourceNode | null = null;
  speaking = false;

  constructor(private ev: SpeakerEvents) {}

  setEvents(ev: SpeakerEvents) { this.ev = ev; }

  stop() {
    this.token++;
    cancelAnimationFrame(this.raf);
    if (this.audio) { this.audio.pause(); this.audio.src = ""; this.audio = null; }
    this.srcNode?.disconnect(); this.srcNode = null;
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    if (this.speaking) { this.speaking = false; this.ev.onMouth?.("rest", 0); this.ev.onEnd?.(); }
  }

  async speak(u: Utterance) {
    this.stop();
    const my = ++this.token;
    this.speaking = true;
    const alive = () => my === this.token;

    // 1/2: real audio (cached file or live TTS)
    let url = u.audioUrl, vis = u.visemes, mode: "audio" | "tts" = "audio";
    if (!url && u.allowTts && !this.muted) {
      try {
        const r = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: u.text, lang: u.lang, voice: u.voice }) });
        if (r.status === 200) {
          const j = (await r.json()) as { audio: string; visemes: Viseme[] };
          url = `data:audio/mpeg;base64,${j.audio}`;
          vis = j.visemes;
          mode = "tts";
        }
      } catch {}
      if (!alive()) return;
    }
    if (url && !this.muted) {
      const ok = await this.playAudio(url, vis, u, alive);
      if (ok) { this.ev.onStart?.(mode); return; }
      if (!alive()) return;
    }
    // 3: browser speech synthesis
    const voice = !this.muted ? pickVoice(u.lang) : null;
    if (voice) { this.browserSpeak(u, voice, alive); this.ev.onStart?.("browser"); return; }
    // 4: silent subtitles with estimated mouth
    this.ev.onStart?.("silent");
    const dur = estimateDuration(u.text, u.lang) * 1000;
    const t0 = performance.now();
    this.runTimeline(estimateVisemes(u.text, dur), () => performance.now() - t0, dur, alive);
  }

  private playAudio(url: string, vis: Viseme[] | undefined, u: Utterance, alive: () => boolean): Promise<boolean> {
    return new Promise((resolve) => {
      const a = new Audio();
      a.crossOrigin = "anonymous";
      a.preload = "auto";
      a.src = url;
      this.audio = a;
      let started = false;
      a.onended = () => { if (alive()) this.finish(); };
      a.onerror = () => { if (!started) resolve(false); };
      a.play().then(() => {
        started = true;
        resolve(true);
        const dur = (isFinite(a.duration) && a.duration > 0 ? a.duration : estimateDuration(u.text, u.lang)) * 1000;
        if (vis?.length) this.runTimeline(vis, () => a.currentTime * 1000, dur, alive, true);
        else this.runAmplitude(a, dur, alive);
      }).catch(() => resolve(false));
    });
  }

  /** mouth from a viseme timeline; `clock` returns ms since start */
  private runTimeline(vis: Viseme[], clock: () => number, dur: number, alive: () => boolean, external = false) {
    let i = 0;
    const tick = () => {
      if (!alive()) return;
      const t = clock();
      while (i < vis.length - 1 && vis[i + 1].t <= t) i++;
      const m = azureToMouth(vis[i]?.id ?? 0);
      // small jitter keeps long vowels alive
      const open = m === "rest" ? 0 : 0.75 + 0.25 * Math.sin(t / 55);
      this.ev.onMouth?.(m, open);
      this.ev.onViseme?.(vis[i]?.id ?? 0, open);
      this.ev.onProgress?.(Math.min(1, t / dur), t);
      if (!external && t >= dur) { this.finish(); return; }
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  /** fallback lip sync: AnalyserNode RMS → open/close */
  private runAmplitude(a: HTMLAudioElement, dur: number, alive: () => boolean) {
    try {
      if (ctx && !a.src.startsWith("data:")) {
        this.srcNode = ctx.createMediaElementSource(a);
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 512;
        this.srcNode.connect(this.analyser);
        this.analyser.connect(ctx.destination);
      }
    } catch { this.analyser = null; }
    const buf = new Uint8Array(512);
    let smooth = 0;
    const tick = () => {
      if (!alive()) return;
      let level = 0;
      if (this.analyser && this.srcNode) {
        this.analyser.getByteTimeDomainData(buf);
        let s = 0;
        for (const v of buf) s += ((v - 128) / 128) ** 2;
        level = Math.min(1, Math.sqrt(s / buf.length) * 5);
      } else {
        // no analyser (cross-origin/data url): pseudo-syllables
        level = 0.5 + 0.5 * Math.sin(a.currentTime * 18) * Math.sin(a.currentTime * 7);
      }
      smooth += (level - smooth) * 0.45;
      const m: Mouth = smooth < 0.08 ? "rest" : smooth < 0.3 ? "E" : smooth < 0.6 ? "O" : "A";
      this.ev.onMouth?.(m, smooth);
      this.ev.onProgress?.(Math.min(1, (a.currentTime * 1000) / dur), a.currentTime * 1000);
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  private browserSpeak(u: Utterance, voice: SpeechSynthesisVoice, alive: () => boolean) {
    const ut = new SpeechSynthesisUtterance(u.text);
    ut.voice = voice;
    ut.lang = voice.lang;
    ut.rate = 0.98;
    ut.pitch = u.voice === "male" ? 0.85 : 1.1;
    const dur = estimateDuration(u.text, u.lang) * 1000;
    let t0 = performance.now();
    // boundary events re-sync the estimated clock to the real word position
    let offset = 0;
    ut.onstart = () => { t0 = performance.now(); };
    ut.onboundary = (e) => { offset = (e.charIndex / Math.max(1, u.text.length)) * dur - (performance.now() - t0); };
    ut.onend = () => { if (alive()) this.finish(); };
    ut.onerror = () => { if (alive()) this.finish(); };
    speechSynthesis.speak(ut);
    this.runTimeline(estimateVisemes(u.text, dur), () => performance.now() - t0 + offset * 0.5, dur, alive, true);
  }

  private finish() {
    cancelAnimationFrame(this.raf);
    this.speaking = false;
    this.ev.onMouth?.("rest", 0);
    this.ev.onProgress?.(1, Infinity);
    this.ev.onEnd?.();
  }
}
