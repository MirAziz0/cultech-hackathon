"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import type { MonumentBundle } from "@/lib/types";
import type { WalkViewer } from "@/lib/viewer/walkViewer";
import type { Keys } from "@/lib/walk/controller";
import { photos as photosOf } from "@/lib/bundle";
import { zoneInfoFor } from "@/lib/eras";
import type { Era } from "@/lib/types";
import { unlockAudio } from "@/lib/speech/speaker";
import { ArchitectDock, type ArchitectHandle } from "@/components/architect/ArchitectDock";
import { Lightbox, Credit, type PhotoWithUrl } from "@/components/photos/Lightbox";
import { ConfBadge } from "@/components/ui/ConfidenceLegend";
import { LangToggle } from "@/components/ui/LangToggle";

const KEYMAP: Record<string, keyof Keys> = { KeyW: "f", ArrowUp: "f", KeyS: "b", ArrowDown: "b", KeyA: "l", KeyD: "r", ArrowLeft: "tl", ArrowRight: "tr", ShiftLeft: "run", ShiftRight: "run" };

export function WalkView({ bundle }: { bundle: MonumentBundle }) {
  const m = bundle.manifest;
  const spec = m.walk!;
  const { t, c } = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<WalkViewer | null>(null);
  const dock = useRef<ArchitectHandle>(null);
  const [started, setStarted] = useState(false);
  const [zone, setZone] = useState<string | null>(null);
  const [card, setCard] = useState<{ list: PhotoWithUrl[]; i: number } | null>(null);
  const [cardOpen, setCardOpen] = useState(true);
  const [lb, setLb] = useState<{ list: PhotoWithUrl[]; i: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<string>("");
  const [dockH, setDockH] = useState(0);
  const [floorY, setFloorY] = useState(0);
  const startedRef = useRef(false);
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(max-width: 639px)");
    const f = () => setPhone(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  const narrTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // eras inside the walk (Aghdam: 19th c. / 1993–2020 / today); the exterior page passes ?era=
  const walkEras = spec.eras ?? [];
  const [era, setEraState] = useState<Era | undefined>(() => spec.defaultEra ?? walkEras[0]);
  const eraRef = useRef(era);

  useEffect(() => {
    let v: WalkViewer | null = null, dead = false, iv: ReturnType<typeof setInterval> | undefined;
    import("@/lib/viewer/walkViewer").then(({ WalkViewer }) => {
      if (dead || !canvasRef.current || !hostRef.current) return;
      try {
        const q = new URLSearchParams(location.search).get("era");
        v = new WalkViewer(canvasRef.current, hostRef.current, spec, undefined, q && spec.eras?.includes(q) ? q : eraRef.current);
        if (v.era && v.era !== eraRef.current) { eraRef.current = v.era; setEraState(v.era); }
        const mini = miniRef.current!;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        mini.width = mini.clientWidth * dpr; mini.height = mini.clientHeight * dpr;
        v.mini = { ctx: mini.getContext("2d")!, w: mini.width, h: mini.height, colors: { bg: "rgba(20,17,14,.72)", floor: "#cdb98f", me: "#e07a68", other: "#e8d6a6" } };
        // zone change → photo card + narration (debounced so brushing past a doorway doesn't trigger it)
        v.onZone = (id) => {
          setZone(id);
          setFloorY(v!.walker.floor);
          const info = zoneInfoFor(spec, id, eraRef.current);
          const list = photosOf(bundle, info?.photos ?? []);
          setCard(list.length || info ? { list, i: 0 } : null);
          setCardOpen(true);
          if (narrTimer.current) clearTimeout(narrTimer.current);
          if (startedRef.current) narrTimer.current = setTimeout(() => dock.current?.narrateZone(id), 900);
        };
        v.start();
        viewer.current = v;
        (window as unknown as { __walk?: WalkViewer }).__walk = v; // for automated tests
        if (new URLSearchParams(location.search).has("debug")) {
          iv = setInterval(() => v && setDebug(`${v.fps.toFixed(0)} fps · ${v.quality} · ${v.world.stats.meshes} meshes · ${(v.world.stats.tris / 1000).toFixed(0)}k tris · ${v.world.stats.lamps} lamps · ${v.renderer.info.render.calls} calls`), 1000);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    });
    return () => { dead = true; clearInterval(iv); v?.dispose(); viewer.current = null; };
  }, [spec, bundle]);

  // photo card auto-advance
  useEffect(() => {
    if (!card || card.list.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const iv = setInterval(() => setCard((cd) => (cd ? { ...cd, i: (cd.i + 1) % cd.list.length } : cd)), 5000);
    return () => clearInterval(iv);
  }, [card?.list]); // eslint-disable-line react-hooks/exhaustive-deps

  // keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (lb || (e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = KEYMAP[e.code];
      if (k && viewer.current) { viewer.current.walker.keys[k] = true; e.preventDefault(); }
    };
    const up = (e: KeyboardEvent) => { const k = KEYMAP[e.code]; if (k && viewer.current) viewer.current.walker.keys[k] = false; };
    const blur = () => viewer.current?.walker.clearKeys();
    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { document.removeEventListener("keydown", down); document.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, [lb]);

  // drag to look
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; (e.target as Element).setPointerCapture(e.pointerId); };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    viewer.current?.walker.look(e.clientX - d.x, e.clientY - d.y);
    d.x = e.clientX; d.y = e.clientY;
  };
  const onUp = () => { drag.current = null; };

  const pad = (k: keyof Keys) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); if (viewer.current) viewer.current.walker.keys[k] = true; },
    onPointerUp: () => { if (viewer.current) viewer.current.walker.keys[k] = false; },
    onPointerLeave: () => { if (viewer.current) viewer.current.walker.keys[k] = false; },
    onPointerCancel: () => { if (viewer.current) viewer.current.walker.keys[k] = false; },
  });

  const setEra = useCallback((e: Era) => {
    if (e === eraRef.current) return;
    eraRef.current = e;
    setEraState(e);
    viewer.current?.setEra(e);
    // refresh the card and tell the story of this place in the new era
    const id = viewer.current?.walker.zone?.id;
    if (id) {
      const info = zoneInfoFor(spec, id, e);
      const list = photosOf(bundle, info?.photos ?? []);
      setCard(list.length || info ? { list, i: 0 } : null);
      setCardOpen(true);
      if (narrTimer.current) clearTimeout(narrTimer.current);
      if (startedRef.current) narrTimer.current = setTimeout(() => dock.current?.narrateZone(id), 600);
    }
  }, [spec, bundle]);

  const start = useCallback(() => {
    unlockAudio();
    startedRef.current = true;
    setStarted(true);
    canvasRef.current?.focus({ preventScroll: true });
  }, []);

  const info = zone ? zoneInfoFor(spec, zone, era) : null;
  const photo = card?.list[card.i];
  const padBtn = "grid h-12 w-12 select-none place-items-center rounded-md border-0 bg-[rgba(20,17,14,.62)] text-[20px] text-[#f3ead9] touch-none active:bg-accent active:text-accent-ink";

  return (
    <div ref={hostRef} className="fixed inset-0 overflow-hidden bg-[#1a1612] select-none" style={{ ["--dock-h" as string]: `${phone ? dockH : 0}px` }}>
      <canvas ref={canvasRef} tabIndex={-1} aria-label={c(spec.title)} className="block h-full w-full cursor-grab touch-none outline-none active:cursor-grabbing"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-[max(12px,env(safe-area-inset-top))_max(12px,env(safe-area-inset-right))_0_max(12px,env(safe-area-inset-left))]">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <Link href={`/m/${m.slug}`} className="btn glass border-white/20 text-[#f3ead9]! no-underline">{t("backModel")}</Link>
          <LangToggle dark />
        </div>
        <canvas ref={miniRef} aria-hidden="true" className="pointer-events-none h-[112px] w-[168px] rounded border border-white/25 max-sm:h-[80px] max-sm:w-[120px]" />
      </div>
      <div className="glass pointer-events-none absolute top-[max(14px,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 rounded-[3px] px-2.5 py-1.5 font-mono text-[11px] whitespace-nowrap max-lg:hidden">
        {t("walkHint")}
      </div>
      {walkEras.length > 1 && (
        <div role="group" aria-label={t("era")}
          className="glass absolute top-[calc(max(12px,env(safe-area-inset-top))+52px)] left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded-full p-1 max-sm:top-[calc(max(12px,env(safe-area-inset-top))+90px)] max-sm:right-[max(12px,env(safe-area-inset-right))] max-sm:left-auto max-sm:translate-x-0">
          {walkEras.map((e) => (
            <button key={e} type="button" aria-pressed={era === e} onClick={() => setEra(e)}
              className={`h-8 rounded-full px-3 text-[12.5px] font-semibold whitespace-nowrap max-sm:px-2 max-sm:text-[11.5px] ${era === e ? "bg-accent text-accent-ink" : "text-white"}`}>
              {c(m.eras[e]?.label)}
            </button>
          ))}
        </div>
      )}
      {spec.map.levels && started && (
        <nav aria-label={t("levels")} className={`glass absolute ${walkEras.length > 1 ? "top-[calc(max(12px,env(safe-area-inset-top))+96px)]" : "top-[calc(max(12px,env(safe-area-inset-top))+52px)]"} left-1/2 flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full px-2 py-1 max-sm:top-auto max-sm:bottom-[calc(max(12px,env(safe-area-inset-bottom))+var(--dock-h,0px)+12px)] max-sm:left-[max(12px,env(safe-area-inset-left))] max-sm:max-w-[calc(100vw-196px)] max-sm:translate-x-0`}>
          <span className="px-1 font-mono text-[10px] tracking-wide text-[#cfc3ad] uppercase">{t("levels")}</span>
          {spec.map.levels.map((lv) => {
            const here = Math.abs(floorY - lv.y) < 1;
            return (
              <button key={lv.y} type="button" aria-current={here}
                onClick={() => { viewer.current?.walker.teleport(lv.at[0], lv.at[1], lv.y, lv.yaw, lv.pitch ?? 0); setFloorY(lv.y); }}
                className={`h-8 min-w-8 rounded-full px-2 text-[12px] font-semibold ${here ? "bg-accent text-accent-ink" : "bg-white/10 text-white"}`}>
                {c(lv.name)}
              </button>
            );
          })}
        </nav>
      )}
      {debug && <div className="glass absolute bottom-[140px] right-3 rounded px-2 py-1 font-mono text-[11px]">{debug}</div>}

      {/* zone card */}
      {info && cardOpen && (
        <figure key={zone} className="anim-in absolute top-[calc(max(12px,env(safe-area-inset-top))+52px)] left-[max(12px,env(safe-area-inset-left))] sm:top-[calc(max(12px,env(safe-area-inset-top))+136px)] sm:right-[max(12px,env(safe-area-inset-right))] sm:left-auto m-0 w-[250px] max-h-[calc(100dvh-300px)] overflow-y-auto overflow-hidden rounded-md border border-line bg-surface text-ink shadow-[0_10px_30px_rgba(0,0,0,.28)] max-sm:w-[170px]">
          {photo && (
            <button type="button" aria-label={t("enlarge")} onClick={() => { viewer.current?.walker.clearKeys(); setLb({ list: card!.list, i: card!.i }); }}
              className="block aspect-[4/3] w-full cursor-zoom-in border-0 bg-bg p-0 max-sm:aspect-[16/10]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={c(photo.caption)} className="block h-full w-full object-cover" />
            </button>
          )}
          <figcaption className="grid gap-1 px-2.5 pt-2 pb-2.5 text-[12.5px] leading-snug max-sm:text-[11.5px]">
            <span className="flex items-center justify-between gap-1">
              <span className="font-mono text-[10px] tracking-[.1em] text-accent uppercase max-sm:hidden">{photo ? t("realPhoto") : ""}</span>
              {info.conf && <span className="scale-90 origin-right"><ConfBadge conf={info.conf} labels={m.confLabels} /></span>}
            </span>
            <b className="font-display text-[15px] leading-tight">{c(info.title)}</b>
            <span className="text-muted max-sm:hidden">{c(info.text)}</span>
            {photo && <span className="text-[11px] max-sm:hidden">{c(photo.caption)}</span>}
            {photo && <Credit p={photo} className="text-[10px] text-muted [&_a]:text-muted" />}
            {info.links?.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="text-[11px] underline decoration-dotted max-sm:hidden">{c(l.title)} ↗</a>
            ))}
            {card && card.list.length > 1 && (
              <span className="flex gap-1">{card.list.map((_, j) => <span key={j} className={`h-1.5 w-1.5 rounded-full ${j === card.i ? "bg-accent" : "bg-line"}`} />)}</span>
            )}
            <button type="button" className="btn primary mt-1 min-h-[34px]! justify-center px-2! py-1.5! text-[12px]!" onClick={() => zone && dock.current?.narrateZone(zone, true)}>
              ▶ {t("tellMe")}
            </button>
          </figcaption>
          <button type="button" aria-label={t("close")} onClick={() => setCardOpen(false)} className="absolute top-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full border-0 bg-[rgba(20,17,14,.6)] text-[13px] text-white">✕</button>
        </figure>
      )}

      {/* touch / mouse pad */}
      <div aria-label="Hərəkət" style={phone && dockH ? { bottom: `calc(max(12px, env(safe-area-inset-bottom)) + ${dockH + 10}px)` } : undefined}
        className="absolute right-[max(12px,env(safe-area-inset-right))] bottom-[max(12px,env(safe-area-inset-bottom))] z-20 grid grid-cols-[repeat(3,48px)] grid-rows-[repeat(2,48px)] gap-1.5 [@media(hover:hover)_and_(pointer:fine)]:opacity-85">
        <button type="button" aria-label={t("forward")} className={`${padBtn} col-start-2 row-start-1`} {...pad("f")}>▲</button>
        <button type="button" aria-label={t("turnL")} className={`${padBtn} col-start-1 row-start-2`} {...pad("tl")}>↺</button>
        <button type="button" aria-label={t("backward")} className={`${padBtn} col-start-2 row-start-2`} {...pad("b")}>▼</button>
        <button type="button" aria-label={t("turnR")} className={`${padBtn} col-start-3 row-start-2`} {...pad("tr")}>↻</button>
      </div>

      {started && <ArchitectDock ref={dock} bundle={bundle} zone={zone} era={era} mode="dock" onHeight={setDockH} />}

      {!started && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-[rgba(14,12,10,.55)] p-4">
          <div className="glass grid max-w-[420px] gap-3 rounded-lg border border-white/15 p-5 text-center">
            <div className="eyebrow text-[#cfc3ad]!">{c(m.name)}</div>
            <h1 className="font-display text-[26px] leading-tight font-bold">{c(spec.title)}</h1>
            <p className="text-[14px] text-[#e5dccb]">{t("walkHint")}</p>
            <p className="text-[13px] text-[#cfc3ad]">{c({ az: "Memar sizi müşayiət edəcək: hər zala girəndə danışacaq. Səsi aşağıdakı düymə ilə idarə edin.", en: "The architect will guide you and speak as you enter each space. Use the speaker button to mute." })}</p>
            <button type="button" className="btn primary justify-center text-[15px]!" onClick={start} autoFocus>
              ▶ {c({ az: "Gəzintiyə başla", en: "Start the walk" })}
            </button>
            {error && <p className="text-[13px] text-hyp">{error}</p>}
          </div>
        </div>
      )}
      {lb && <Lightbox list={lb.list} index={lb.i} onIndex={(i) => setLb({ ...lb, i })} onClose={() => setLb(null)} />}
    </div>
  );
}
