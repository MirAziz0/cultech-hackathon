"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { ArchitectSpec } from "@/lib/types";
import type { Mouth } from "@/lib/speech/visemes";

/* Original stylised character: a representative master builder (not a real person).
   Layers are animated imperatively through refs: breathing, blinking, head sway, brow raise,
   measuring-rod gestures and 8 mouth shapes driven by visemes or audio amplitude. */

export interface ArchitectRig {
  setMouth(m: Mouth, open: number): void;
  setTalking(on: boolean): void;
  gesture(kind?: "point" | "raise"): void;
}

const MOUTHS: Mouth[] = ["rest", "M", "A", "E", "O", "U", "F", "L"];

export const ArchitectSvg = forwardRef<ArchitectRig, { look?: ArchitectSpec["look"]; size?: number; title: string }>(function ArchitectSvg({ look, size, title }, ref) {
  const robe = look?.robe ?? "#2f5d7c";
  const sash = look?.sash ?? "#d9a441";
  const hat = look?.headwear ?? "turban";
  const beard = look?.beard ?? true;
  const chokha = look?.chokha ?? false;
  const body = useRef<SVGGElement>(null);
  const head = useRef<SVGGElement>(null);
  const eyes = useRef<SVGGElement>(null);
  const brows = useRef<SVGGElement>(null);
  const arm = useRef<SVGGElement>(null);
  const mouthRefs = useRef<Record<string, SVGGElement | null>>({});
  const state = useRef({ talking: false, mouth: "rest" as Mouth, open: 0, gestureT: -10, gestureKind: "raise" as "point" | "raise", nextBlink: 2, blinkT: -1 });

  useImperativeHandle(ref, () => ({
    setMouth(m, open) {
      const s = state.current;
      s.mouth = m;
      s.open = open;
      for (const k of MOUTHS) {
        const el = mouthRefs.current[k];
        if (!el) continue;
        const on = k === m;
        el.style.display = on ? "" : "none";
        if (on) el.setAttribute("transform", `translate(100 127) scale(1 ${k === "rest" || k === "M" ? 1 : 0.55 + open * 0.55})`);
      }
    },
    setTalking(on) {
      state.current.talking = on;
      if (on) state.current.gestureT = 0;
    },
    gesture(kind = "raise") {
      state.current.gestureKind = kind;
      state.current.gestureT = 0;
    },
  }));

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000, s = state.current;
      const amp = reduce ? 0.3 : 1;
      // breathing
      body.current?.setAttribute("transform", `translate(0 ${(Math.sin(t * 1.6) * 1.2 * amp).toFixed(2)})`);
      // head sway, more lively while talking
      const sway = (s.talking ? Math.sin(t * 2.3) * 2.2 + Math.sin(t * 5.1) * 0.8 : Math.sin(t * 0.7) * 1.2) * amp;
      const nod = s.talking ? s.open * 1.6 : 0;
      head.current?.setAttribute("transform", `translate(0 ${(Math.sin(t * 1.6 + 0.4) * 1 + nod).toFixed(2)}) rotate(${sway.toFixed(2)} 100 150)`);
      // blink
      s.nextBlink -= dt;
      if (s.nextBlink <= 0) { s.blinkT = 0; s.nextBlink = 2.5 + Math.random() * 3.5; }
      let eyeScale = 1;
      if (s.blinkT >= 0) { s.blinkT += dt; eyeScale = Math.abs(1 - Math.min(2, s.blinkT / 0.07)); if (s.blinkT > 0.14) s.blinkT = -1; eyeScale = Math.max(0.08, eyeScale); }
      eyes.current?.setAttribute("transform", `translate(0 98) scale(1 ${eyeScale.toFixed(2)}) translate(0 -98)`);
      // brows lift on emphasis
      const lift = s.talking ? Math.max(0, Math.sin(t * 1.9)) * 2.5 * amp : 0;
      brows.current?.setAttribute("transform", `translate(0 ${(-lift).toFixed(2)})`);
      // arm + measuring rod: gesture curve, then gentle beat while talking
      s.gestureT += dt;
      const g = s.gestureT < 1.4 ? Math.sin((s.gestureT / 1.4) * Math.PI) : 0;
      const beat = s.talking ? Math.sin(t * 2.8) * 4 : Math.sin(t * 0.9) * 1;
      const ang = -(s.gestureKind === "point" ? 38 : 22) * g * amp + beat * amp;
      arm.current?.setAttribute("transform", `rotate(${ang.toFixed(2)} 150 188)`);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const skin = "#c8996f", skinShade = "#b3845d", hair = beard ? "#3b2a20" : "#3b2a20";
  const setM = (k: Mouth) => (el: SVGGElement | null) => { mouthRefs.current[k] = el; };
  const lip = "#7a3a2a", inner = "#3a1712";

  return (
    <svg viewBox="0 0 200 240" width={size ?? "100%"} height={size ? (size * 240) / 200 : undefined} role="img" aria-label={title} style={{ overflow: "visible", display: "block", height: size ? undefined : "auto" }}>
      <defs>
        <radialGradient id="zq-bg" cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#f3e3c3" />
          <stop offset="1" stopColor="#d9c08f" />
        </radialGradient>
        <linearGradient id="zq-robe" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={robe} />
          <stop offset="1" stopColor={robe} stopOpacity=".8" />
        </linearGradient>
        <clipPath id="zq-arch"><path d="M8 240V96C8 44 52 10 100 6c48 4 92 38 92 90v144z" /></clipPath>
      </defs>
      {/* pointed-arch niche backdrop (echoes the portals) */}
      <path d="M8 240V96C8 44 52 10 100 6c48 4 92 38 92 90v144z" fill="url(#zq-bg)" stroke="#8a6a3a" strokeWidth="3" />
      <g clipPath="url(#zq-arch)">
        <path d="M30 240V112c0-38 32-66 70-70 38 4 70 32 70 70v128" fill="none" stroke="#c9a45a" strokeWidth="1.5" opacity=".6" />
        <g ref={body}>
          {/* robe (qaba) with V collar and sash */}
          <path d="M28 240c2-40 14-62 42-74l30 30 30-30c28 12 40 34 42 74z" fill="url(#zq-robe)" />
          <path d="M70 166l30 30 30-30-8-4-22 22-22-22z" fill="#efe2c4" />
          <path d="M70 166l30 30 30-30" fill="none" stroke={sash} strokeWidth="3" />
          <rect x="48" y="214" width="104" height="14" rx="3" fill={sash} />
          <path d="M48 218h104M48 224h104" stroke="#00000026" strokeWidth="2" />
          <path d="M100 196v18" stroke="#00000033" strokeWidth="2" />
          {chokha && (
            /* Caucasian chokha: dark under-coat (arkhaluq) in the V, rows of cartridge pockets (gazyr) on the chest */
            <g>
              <path d="M74 168l26 26 26-26-6 52H80z" fill="#2a2420" opacity=".85" />
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <g key={i}>
                  <rect x={52 + i * 1.6} y={176 + i * 6} width="16" height="4.2" rx="1.6" fill="#d9c7a0" stroke="#5a4630" strokeWidth=".8" />
                  <rect x={132 - i * 1.6} y={176 + i * 6} width="16" height="4.2" rx="1.6" fill="#d9c7a0" stroke="#5a4630" strokeWidth=".8" />
                </g>
              ))}
              <path d="M56 172c-4 20-6 44-6 68M144 172c4 20 6 44 6 68" stroke="#00000030" strokeWidth="2" fill="none" />
            </g>
          )}
          {/* neck */}
          <path d="M88 140h24v24l-12 10-12-10z" fill={skinShade} />
          {/* head */}
          <g ref={head}>
            <ellipse cx="66" cy="104" rx="5" ry="9" fill={skinShade} />
            <ellipse cx="134" cy="104" rx="5" ry="9" fill={skinShade} />
            <ellipse cx="100" cy="102" rx="33" ry="41" fill={skin} />
            {/* eyes */}
            <g ref={eyes}>
              <ellipse cx="86" cy="98" rx="6" ry="4.2" fill="#fbf4e6" />
              <ellipse cx="114" cy="98" rx="6" ry="4.2" fill="#fbf4e6" />
              <circle cx="87" cy="98" r="2.8" fill="#2a1a12" />
              <circle cx="115" cy="98" r="2.8" fill="#2a1a12" />
              <circle cx="88" cy="97" r=".9" fill="#fff" />
              <circle cx="116" cy="97" r=".9" fill="#fff" />
            </g>
            <g ref={brows} fill="none" stroke={hair} strokeWidth="3.4" strokeLinecap="round">
              <path d="M78 89q8-5 15 0" />
              <path d="M107 89q7-5 15 0" />
            </g>
            {/* nose */}
            <path d="M100 98c-2 8-5 13-5 16 2 2 8 2 10 0 0-3-3-8-5-16" fill={skinShade} />
            {beard && (
              <>
                <path d="M68 108c0 30 14 52 32 56 18-4 32-26 32-56-6 6-10 12-14 14-6-4-12-5-18-5s-12 1-18 5c-4-2-8-8-14-14z" fill={hair} />
                <path d="M84 120c6-4 11-5 16-3 5-2 10-1 16 3" fill="none" stroke={hair} strokeWidth="4" strokeLinecap="round" />
              </>
            )}
            {/* mouths */}
            <g ref={setM("rest")} transform="translate(100 127)"><path d="M-8 0q8 3 16 0" fill="none" stroke={lip} strokeWidth="2.6" strokeLinecap="round" /></g>
            <g ref={setM("M")} style={{ display: "none" }}><path d="M-8 0h16" stroke={lip} strokeWidth="3.6" strokeLinecap="round" /></g>
            <g ref={setM("A")} style={{ display: "none" }}><ellipse rx="7.5" ry="7" fill={inner} stroke={lip} strokeWidth="2" /><rect x="-5.5" y="-6.5" width="11" height="3" rx="1" fill="#f3ead9" /></g>
            <g ref={setM("E")} style={{ display: "none" }}><ellipse rx="9.5" ry="4" fill={inner} stroke={lip} strokeWidth="2" /><rect x="-7" y="-3.6" width="14" height="2.4" rx="1" fill="#f3ead9" /></g>
            <g ref={setM("O")} style={{ display: "none" }}><ellipse rx="5.6" ry="6.4" fill={inner} stroke={lip} strokeWidth="2.4" /></g>
            <g ref={setM("U")} style={{ display: "none" }}><ellipse rx="3.6" ry="4" fill={inner} stroke={lip} strokeWidth="2.6" /></g>
            <g ref={setM("F")} style={{ display: "none" }}><rect x="-7" y="-2.5" width="14" height="3" rx="1" fill="#f3ead9" /><path d="M-8 1.5q8 4 16 0" fill="none" stroke={lip} strokeWidth="2.6" strokeLinecap="round" /></g>
            <g ref={setM("L")} style={{ display: "none" }}><ellipse rx="7.5" ry="4.6" fill={inner} stroke={lip} strokeWidth="2" /><ellipse cy="-1.5" rx="3.2" ry="1.8" fill="#c0504a" /></g>
            {/* headwear */}
            {hat === "turban" && (
              <g>
                <path d="M64 86c-4-34 16-56 36-58 20 2 40 24 36 58-10-8-22-12-36-12s-26 4-36 12z" fill="#f2ead8" />
                <path d="M66 74c10-10 22-14 34-14s24 4 34 14M68 62c10-9 20-12 32-12s22 3 32 12M76 48c8-6 16-8 24-8s16 2 24 8" fill="none" stroke="#cbbf9f" strokeWidth="3" />
                <path d="M64 86c10-8 22-12 36-12s26 4 36 12" fill="none" stroke={sash} strokeWidth="3.5" />
                <circle cx="100" cy="62" r="5" fill="#1f7a80" stroke={sash} strokeWidth="2" />
                <path d="M100 56v-14" stroke={sash} strokeWidth="2" />
              </g>
            )}
            {hat === "kalpak" && (
              <g>
                <path d="M66 82c-2-28 4-50 8-56h52c4 6 10 28 8 56-10-6-22-9-34-9s-24 3-34 9z" fill="#1e1a17" />
                <path d="M72 40h56M70 52h60M68 64h64M68 76h64" stroke="#3a332c" strokeWidth="3" strokeDasharray="3 4" />
              </g>
            )}
            {hat === "papaq" && (
              /* tall sheepskin papaq */
              <g>
                <path d="M66 84c-3-22-1-44 4-58 9-6 19-8 30-8s21 2 30 8c5 14 7 36 4 58-10-6-22-9-34-9s-24 3-34 9z" fill="#2b2420" />
                {[30, 42, 54, 66, 78].map((y) => (
                  <path key={y} d={`M${70 - (y - 30) / 12} ${y}q5-4 10 0t10 0 10 0 10 0 10 0 10 0`} fill="none" stroke="#4a3f36" strokeWidth="2.6" strokeLinecap="round" />
                ))}
              </g>
            )}
            {hat === "cap" && (
              <g>
                <path d="M68 80c0-24 14-38 32-38s32 14 32 38c-10-6-20-8-32-8s-22 2-32 8z" fill={robe} />
                <path d="M70 74c10-5 20-7 30-7s20 2 30 7" fill="none" stroke={sash} strokeWidth="3" strokeDasharray="4 3" />
              </g>
            )}
          </g>
          {/* arm with the measuring rod (gaz) */}
          <g ref={arm}>
            <path d="M150 188c12 6 18 18 14 30l-12 4c0-10-6-18-14-22z" fill={robe} />
            <path d="M160 196L182 70" stroke="#6b4a2e" strokeWidth="5" strokeLinecap="round" />
            <path d="M178 92l6 1M175 112l6 1M172 132l6 1M169 152l6 1M166 172l6 1" stroke="#e8d4a8" strokeWidth="2" />
            <circle cx="160" cy="196" r="9" fill={skin} />
          </g>
        </g>
      </g>
    </svg>
  );
});
