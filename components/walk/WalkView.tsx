"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import type { MonumentBundle, TourStop } from "@/lib/types";
import type { WalkViewer } from "@/lib/viewer/walkViewer";
import type { Guide } from "@/lib/guide/guide";
import type { Tour, TourPhase } from "@/lib/guide/tour";
import { azureToShape, mouthToShape } from "@/lib/guide/lipsync";
import type { Marker } from "@/lib/guide/story";
import type { Keys } from "@/lib/walk/controller";
import { photos as photosOf } from "@/lib/bundle";
import { zoneInfoFor } from "@/lib/eras";
import type { Era } from "@/lib/types";
import { unlockAudio } from "@/lib/speech/speaker";
import { GuideHud, type GuideBody, type GuideHudHandle } from "@/components/guide/GuideHud";
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
  const guide = useRef<Guide | null>(null);
  const tour = useRef<Tour | null>(null);
  const [tourPhase, setTourPhase] = useState<TourPhase>("idle");
  const [tourIdx, setTourIdx] = useState(-1);
  const pendingTour = useRef(false);
  const [tourStops, setTourStops] = useState<TourStop[]>([]);
  const [offer, setOffer] = useState<TourStop | null>(null);
  const offered = useRef(new Set<string>());
  const [highlight, setHighlight] = useState(false);
  const hud = useRef<GuideHudHandle>(null);
  const [started, setStarted] = useState(false);
  const [zone, setZone] = useState<string | null>(null);
  const [card, setCard] = useState<{ list: PhotoWithUrl[]; i: number } | null>(null);
  const [cardOpen, setCardOpen] = useState(true);
  const [lb, setLb] = useState<{ list: PhotoWithUrl[]; i: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<string>("");
  const [floorY, setFloorY] = useState(0);
  const startedRef = useRef(false);
  const narrTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // eras inside the walk (Aghdam: 19th c. / 1993–2020 / today); the exterior page passes ?era=
  const walkEras = spec.eras ?? [];
  const [era, setEraState] = useState<Era | undefined>(() => spec.defaultEra ?? walkEras[0]);
  const eraRef = useRef(era);

  useEffect(() => {
    let v: WalkViewer | null = null, g: Guide | null = null, dead = false, iv: ReturnType<typeof setInterval> | undefined;
    Promise.all([import("@/lib/viewer/walkViewer"), import("@/lib/guide/guide"), import("@/lib/guide/avatar/procedural"), import("@/lib/guide/nav"), import("@/lib/guide/blockers"), import("@/lib/guide/tour"), import("@/lib/guide/autoStops")]).then(([{ WalkViewer }, { Guide }, { buildProceduralAvatar }, { NavGrid }, { collectBlockers }, { Tour }, { autoStops }]) => {
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
          // free mode: offer this place's story instead of auto-playing it (debounced past doorways)
          if (narrTimer.current) clearTimeout(narrTimer.current);
          setOffer(null);
          narrTimer.current = setTimeout(() => {
            const tr = tour.current;
            if (!startedRef.current || !tr || tr.active || offered.current.has(id)) return;
            const st = tr.stops.find((x) => x.zone === id);
            if (st) { offered.current.add(id); setOffer(st); }
          }, 1200);
        };
        // the guide: built now (nav grid + body), shown when the walk starts
        try {
          g = new Guide(v.map, buildProceduralAvatar({ ...m.architect.look }), new NavGrid(v.map, collectBlockers(spec.elements, v.era)));
          (g as Guide & { rebuildNav?: (era?: string) => void }).rebuildNav = (era) => g!.setNav(new NavGrid(v!.map, collectBlockers(spec.elements, era)));
          g.avatar.root.visible = false;
          v.addActor(g.avatar.root);
          const gg = g, vv = v;
          const own = (spec.tour?.stops ?? []).filter((s) => !s.eras || !vv.era || s.eras.includes(vv.era));
          const list = own.length ? own : autoStops(spec, gg.nav);
          setTourStops(list);
          const tr = new Tour(gg, list, {
            onStory: (s) => hud.current?.tellStop(s),
            onPhase: (ph, _s, i) => { setTourPhase(ph); setTourIdx(i); },
          });
          tour.current = tr;
          v.beforeRender = (dt) => { if (gg.avatar.root.visible) { tr.update(dt); gg.update(dt, vv.walker.floorPos(), vv.camera); } };
          v.mapMarks = () => [
            ...(gg.marker ? [{ ...gg.marker, color: "#f2c46b", kind: "diamond" as const }] : []),
            ...(gg.avatar.root.visible ? [{ ...gg.pos, color: "#7fd0d4", kind: "dot" as const }] : []),
          ];
          guide.current = g;
          // Plan A: swap in the VRM avatar if content/characters/<id>/avatar.vrm exists (else keep Plan B)
          const av = bundle.avatar;
          if (av) (av.kind === "vrm" ? import("@/lib/guide/avatar/vrm").then(({ loadVrmAvatar }) => loadVrmAvatar(av.id)) : import("@/lib/guide/avatar/mesh").then(({ loadMeshAvatar }) => loadMeshAvatar(av.id))).then((a) => {
            if (!a || dead || guide.current !== gg) { a?.dispose(); return; }
            const old = gg.avatar;
            a.root.visible = old.root.visible;
            vv.removeActor(old.root);
            old.dispose();
            gg.avatar = a;
            vv.addActor(a.root);
          }).catch(() => {});
        } catch (e) { console.warn("[guide] disabled:", e); }
        v.start();
        viewer.current = v;
        (window as unknown as { __walk?: WalkViewer; __guide?: Guide | null }).__walk = v; // for automated tests
        (window as unknown as { __guide?: Guide | null }).__guide = g;
        (window as unknown as { __tour?: Tour | null }).__tour = tour.current;
        if (new URLSearchParams(location.search).has("debug")) {
          iv = setInterval(() => v && setDebug(`${v.fps.toFixed(0)} fps · ${v.quality} · ${v.world.stats.meshes} meshes · ${(v.world.stats.tris / 1000).toFixed(0)}k tris · ${v.world.stats.lamps} lamps · ${v.renderer.info.render.calls} calls`), 1000);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    });
    return () => { dead = true; clearInterval(iv); g?.dispose(); v?.dispose(); viewer.current = null; guide.current = null; tour.current = null; };
  }, [spec, bundle]); // eslint-disable-line react-hooks/exhaustive-deps

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
    (guide.current as (Guide & { rebuildNav?: (era?: string) => void }) | null)?.rebuildNav?.(e);
    // refresh the card and tell the story of this place in the new era
    const id = viewer.current?.walker.zone?.id;
    if (id) {
      const info = zoneInfoFor(spec, id, e);
      const list = photosOf(bundle, info?.photos ?? []);
      setCard(list.length || info ? { list, i: 0 } : null);
      setCardOpen(true);
    }
  }, [spec, bundle]);

  const start = useCallback(() => {
    unlockAudio();
    startedRef.current = true;
    setStarted(true);
    const g = guide.current, v = viewer.current;
    if (g && v) {
      g.spawn(v.walker.floorPos());
      g.avatar.root.visible = true;
      g.avatar.gesture("wave");
      g.avatar.setExpression("happy");
      setTimeout(() => g.avatar.setExpression("neutral"), 4000);
      // greet, then the tour begins (or after 15 s if the greeting never ends)
      setTimeout(() => hud.current?.greet(), 400);
      if (tour.current?.stops.length) {
        pendingTour.current = true;
        setTimeout(() => { if (pendingTour.current) { pendingTour.current = false; tour.current?.start(); } }, 15000);
      }
    }
    canvasRef.current?.focus({ preventScroll: true });
  }, []);

  /* speech → the 3D body: lip sync, talk gestures, story markers */
  const lastViseme = useRef(0);
  const body = useMemo<GuideBody>(() => ({
    talk: (on) => {
      const g = guide.current;
      if (g) { g.talking = on; g.avatar.setTalking(on); }
      if (on) return;
      if (pendingTour.current) { pendingTour.current = false; setTimeout(() => tour.current?.start(), 900); }
      else tour.current?.storyEnded();
    },
    viseme: (id, open) => { lastViseme.current = performance.now(); guide.current?.avatar.setMouth(azureToShape(id, 0.55 + 0.45 * open)); },
    // amplitude lip sync (audio without a viseme timeline)
    mouth: (mm, open) => { if (performance.now() - lastViseme.current > 200) guide.current?.avatar.setMouth(mouthToShape(mm, open)); },
    mark: (name: Marker) => {
      const g = guide.current, tr = tour.current;
      if (!g) return;
      const face = (e: "happy" | "serious" | "surprised", ms: number) => { g.avatar.setExpression(e); setTimeout(() => g.avatar.setExpression("neutral"), ms); };
      switch (name) {
        case "point": if (tr?.current?.poi && tr.phase === "telling") tr.pointNow(3); else g.avatar.gesture("talk1"); break;
        case "look_up": g.avatar.gesture("lookUp"); break;
        case "smile": face("happy", 3500); break;
        case "serious": face("serious", 4000); break;
        case "surprised": face("surprised", 2200); break;
        case "think": g.avatar.gesture("think"); break;
        case "wave": g.avatar.gesture("wave"); break;
        case "nod": g.avatar.gesture("nod"); break;
        case "photo": {
          // "bax, bu yerin bugünkü şəklinə": show the stop's photo on the card and make it glow
          const id = tr?.current?.photo;
          const ph = id ? photosOf(bundle, [id]) : [];
          if (ph.length) { setCard((cd) => ({ list: [...ph, ...(cd?.list ?? []).filter((x) => x.id !== ph[0].id)], i: 0 })); setCardOpen(true); }
          setHighlight(true);
          setTimeout(() => setHighlight(false), 4500);
          break;
        }
        default: break;
      }
    },
  }), [bundle]);

  const tellHere = useCallback(() => {
    const tr = tour.current;
    if (!tr || !zone) return;
    const i = tr.stops.findIndex((x) => x.zone === zone);
    setOffer(null);
    if (i >= 0) tr.tellOne(i);
    else hud.current?.tellStop({ id: zone, zone, title: { az: zone }, stand: [0, 0, 0] });
  }, [zone]);

  const tourCtl = useMemo(() => ({
    phase: tourPhase,
    index: tourIdx,
    count: tourStops.length,
    title: tourIdx >= 0 ? c(tourStops[tourIdx]?.title) : undefined,
    play: () => { const tr = tour.current; if (!tr) return; setOffer(null); if (tr.phase === "paused") tr.resume(); else tr.start(tr.phase === "done" || tr.index < 0 ? 0 : tr.index); },
    pause: () => tour.current?.pause(),
    next: () => { setOffer(null); const tr = tour.current; if (tr) tr.goTo(tr.index + 1); },
    leave: () => tour.current?.stop(),
  }), [tourPhase, tourIdx, tourStops, c]);


  const info = zone ? zoneInfoFor(spec, zone, era) : null;
  const photo = card?.list[card.i];
  const padBtn = "grid h-12 w-12 select-none place-items-center rounded-md border-0 bg-[rgba(20,17,14,.62)] text-[20px] text-[#f3ead9] touch-none active:bg-accent active:text-accent-ink";

  return (
    <div ref={hostRef} className="fixed inset-0 overflow-hidden bg-[#1a1612] select-none" style={{ ["--dock-h" as string]: "0px" }}>
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
        <figure key={zone} className={`anim-in transition-shadow ${highlight ? "ring-4 ring-[#f2c46b] shadow-[0_0_40px_rgba(242,196,107,.7)]" : ""} absolute top-[calc(max(12px,env(safe-area-inset-top))+52px)] left-[max(12px,env(safe-area-inset-left))] sm:top-[calc(max(12px,env(safe-area-inset-top))+136px)] sm:right-[max(12px,env(safe-area-inset-right))] sm:left-auto m-0 w-[250px] max-h-[calc(100dvh-300px)] overflow-y-auto overflow-hidden rounded-md border border-line bg-surface text-ink shadow-[0_10px_30px_rgba(0,0,0,.28)] max-sm:w-[170px]`}>
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
            <button type="button" className="btn primary mt-1 min-h-[34px]! justify-center px-2! py-1.5! text-[12px]!" onClick={tellHere}>
              ▶ {t("tellMe")}
            </button>
          </figcaption>
          <button type="button" aria-label={t("close")} onClick={() => setCardOpen(false)} className="absolute top-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full border-0 bg-[rgba(20,17,14,.6)] text-[13px] text-white">✕</button>
        </figure>
      )}

      {/* touch / mouse pad */}
      <div aria-label="Hərəkət"
        className="absolute right-[max(12px,env(safe-area-inset-right))] bottom-[max(12px,env(safe-area-inset-bottom))] z-20 grid grid-cols-[repeat(3,48px)] grid-rows-[repeat(2,48px)] gap-1.5 [@media(hover:hover)_and_(pointer:fine)]:opacity-85">
        <button type="button" aria-label={t("forward")} className={`${padBtn} col-start-2 row-start-1`} {...pad("f")}>▲</button>
        <button type="button" aria-label={t("turnL")} className={`${padBtn} col-start-1 row-start-2`} {...pad("tl")}>↺</button>
        <button type="button" aria-label={t("backward")} className={`${padBtn} col-start-2 row-start-2`} {...pad("b")}>▼</button>
        <button type="button" aria-label={t("turnR")} className={`${padBtn} col-start-3 row-start-2`} {...pad("tr")}>↻</button>
      </div>

      {started && (
        <GuideHud ref={hud} bundle={bundle} era={era} zone={zone} body={body} tour={tourCtl} offer={offer}
          onOffer={(yes) => { if (yes) tellHere(); else setOffer(null); }}
          onAsk={() => tour.current?.pause()} />
      )}

      {!started && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-[rgba(14,12,10,.55)] p-4">
          <div className="glass grid max-w-[420px] gap-3 rounded-lg border border-white/15 p-5 text-center">
            <div className="eyebrow text-[#cfc3ad]!">{c(m.name)}</div>
            <h1 className="font-display text-[26px] leading-tight font-bold">{c(spec.title)}</h1>
            <p className="text-[14px] text-[#e5dccb]">{t("walkHint")}</p>
            <p className="text-[13px] text-[#cfc3ad]">{c({ az: "Memar yanınızda gəzəcək və yeri sizə hekayə kimi danışacaq. Turu istədiyiniz an dayandırıb sərbəst gəzə bilərsiniz.", en: "The architect walks with you and tells the place as a story. Pause the tour any time to explore on your own." })}</p>
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
