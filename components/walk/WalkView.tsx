"use client";
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
import { Lightbox, type PhotoWithUrl } from "@/components/photos/Lightbox";
import { ZoneCard } from "@/components/walk/ZoneCard";
import { InteractiveHoverLink } from "@/components/ui/interactive-hover-button";
import { LangToggle } from "@/components/ui/LangToggle";

const KEYMAP: Record<string, keyof Keys> = { KeyW: "f", ArrowUp: "f", KeyS: "b", ArrowDown: "b", KeyA: "l", KeyD: "r", ArrowLeft: "tl", ArrowRight: "tr", ShiftLeft: "run", ShiftRight: "run" };

/** phones get the zone card minimised: it would cover most of the 3D view */
const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;

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
  const [highlight, setHighlight] = useState(false);
  const hud = useRef<GuideHudHandle>(null);
  /** the model body (content/characters) loads in the background; the placeholder body is never shown meanwhile */
  const bodyState = useRef<"loading" | "ready" | "failed">("loading");
  const showWanted = useRef(false);
  const [started, setStarted] = useState(false);
  const [zone, setZone] = useState<string | null>(null);
  const [card, setCard] = useState<{ list: PhotoWithUrl[]; i: number } | null>(null);
  const [cardOpen, setCardOpen] = useState(true);
  const [lb, setLb] = useState<{ list: PhotoWithUrl[]; i: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<string>("");
  const [floorY, setFloorY] = useState(0);
  const startedRef = useRef(false);
  // eras inside the walk (Aghdam: 19th c. / 1993–2020 / today); the exterior page passes ?era=
  const walkEras = spec.eras ?? [];
  const [era, setEraState] = useState<Era | undefined>(() => spec.defaultEra ?? walkEras[0]);
  const eraRef = useRef(era);
  /** shaders compiled and models loaded: "Start" responds instantly */
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let v: WalkViewer | null = null, g: Guide | null = null, dead = false, iv: ReturnType<typeof setInterval> | undefined;
    // resolves when the guide's final body is in place (or failed / not used)
    let bodySettled = () => {};
    const bodyDone = new Promise<void>((r) => { bodySettled = r; });
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
          setCardOpen(!isPhone());
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
          // only after "Start": the shader warm-up shows the guide for a moment while the visitor's position is
          // still unset (0,0,0), and the tour would start telling whichever stop lies near the centre
          v.beforeRender = (dt) => { if (startedRef.current && gg.avatar.root.visible) { tr.update(dt); gg.update(dt, vv.walker.floorPos(), vv.camera); } };
          v.mapMarks = () => [
            ...(gg.marker ? [{ ...gg.marker, color: "#f2c46b", kind: "diamond" as const }] : []),
            ...(gg.avatar.root.visible ? [{ ...gg.pos, color: "#7fd0d4", kind: "dot" as const }] : []),
          ];
          guide.current = g;
          // Plan A: swap in the VRM avatar if content/characters/<id>/avatar.vrm exists (else keep Plan B)
          const av = bundle.avatar;
          if (av) (av.kind === "vrm" ? import("@/lib/guide/avatar/vrm").then(({ loadVrmAvatar }) => loadVrmAvatar(av.id)) : import("@/lib/guide/avatar/mesh").then(({ loadMeshAvatar }) => loadMeshAvatar(av.id))).then((a) => {
            if (!a || dead || guide.current !== gg) { a?.dispose(); bodyState.current = "failed"; bodySettled(); if (showWanted.current) gg.avatar.root.visible = true; return; }
            bodyState.current = "ready";
            const old = gg.avatar;
            a.root.visible = showWanted.current;
            vv.removeActor(old.root);
            old.dispose();
            gg.avatar = a;
            vv.addActor(a.root);
            if (showWanted.current) a.gesture("wave"); // arrived after the start: greet in the real body
            bodySettled();
          }).catch(() => { bodyState.current = "failed"; bodySettled(); if (showWanted.current) gg.avatar.root.visible = true; });
          else { bodyState.current = "ready"; bodySettled(); }
        } catch (e) { console.warn("[guide] disabled:", e); bodySettled(); }
        // compile every shader (world, trees, models, the guide's body) behind the start screen,
        // so pressing "Start" doesn't freeze while the GPU compiles (it took seconds on rich scenes)
        const vw = v;
        Promise.race([bodyDone, new Promise((r) => setTimeout(r, 12000))])
          .then(() => vw.warmUp(guide.current ? [guide.current.avatar.root] : []))
          .catch((e) => console.warn("[walk] warm-up:", e))
          // the render loop starts only now: rendering earlier compiled each shader synchronously on first
          // draw (seconds of frozen page), before the parallel compile above could do it
          // (the first frames still compile the effect passes, so "Start" is enabled only after them)
          .finally(() => {
            if (dead) return;
            vw.start();
            requestAnimationFrame(() => requestAnimationFrame(() => { if (!dead) setReady(true); }));
          });
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
      setCardOpen(!isPhone());
    }
  }, [spec, bundle]);

  const start = useCallback(() => {
    unlockAudio();
    startedRef.current = true;
    setStarted(true);
    const g = guide.current, v = viewer.current;
    if (g && v) {
      g.spawn(v.walker.floorPos());
      // show the guide only in its final body: wait for the model if it is still loading (max 10 s)
      showWanted.current = true;
      if (bodyState.current !== "loading") g.avatar.root.visible = true;
      else setTimeout(() => { if (bodyState.current === "loading" && guide.current) guide.current.avatar.root.visible = true; }, 10000);
      g.avatar.gesture("wave");
      g.avatar.setExpression("happy");
      setTimeout(() => g.avatar.setExpression("neutral"), 4000);
      // greet; then he follows the visitor and tells each stop when they reach it (▶ starts the guided tour)
      setTimeout(() => hud.current?.greet(), 400);
      if (tour.current) {
        tour.current.autoTell = false;
        pendingTour.current = true; // = greeting in progress
        setTimeout(() => { if (pendingTour.current && tour.current) { pendingTour.current = false; tour.current.autoTell = true; } }, 20000);
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
      if (pendingTour.current) { pendingTour.current = false; setTimeout(() => { if (tour.current) tour.current.autoTell = true; }, 900); }
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
    if (i >= 0) tr.tellHere(i);
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
  const padBtn = "grid h-12 w-12 select-none place-items-center rounded-md border-0 bg-[rgba(20,17,14,.62)] text-[20px] text-[#f3ead9] touch-none active:bg-accent active:text-accent-ink";

  return (
    <div ref={hostRef} className="fixed inset-0 overflow-hidden bg-[#1a1612] select-none" style={{ ["--dock-h" as string]: "0px" }}>
      <canvas ref={canvasRef} tabIndex={-1} aria-label={c(spec.title)} className="block h-full w-full cursor-grab touch-none outline-none active:cursor-grabbing"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-[max(12px,env(safe-area-inset-top))_max(12px,env(safe-area-inset-right))_0_max(12px,env(safe-area-inset-left))]">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <InteractiveHoverLink href={`/m/${m.slug}`} back text={t("backModel").replace(/^[←s]+/, "")} />
          <LangToggle dark />
        </div>
        <canvas ref={miniRef} aria-hidden="true" className="pointer-events-none h-[112px] w-[168px] rounded border border-white/25 max-sm:h-[80px] max-sm:w-[120px]" />
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
      {info && zone && (
        <ZoneCard zone={zone} info={info} photos={card?.list ?? []} index={card?.i ?? 0}
          onIndex={(i) => setCard((cd) => (cd ? { ...cd, i } : cd))}
          events={spec.history ?? []} open={cardOpen} highlight={highlight}
          onOpen={() => setCardOpen(true)} onClose={() => setCardOpen(false)}
          onEnlarge={() => { viewer.current?.walker.clearKeys(); if (card) setLb({ list: card.list, i: card.i }); }}
          onTell={tellHere} />
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
            <p className="text-[13px] text-[#cfc3ad]">{c({ az: "Memar sizinlə gəzəcək və hər maraqlı yerə çatanda onu hekayə kimi danışacaq. ▶ düyməsi ilə onu bələdçi turuna da çıxara bilərsiniz.", en: "The architect walks with you and tells each place as a story when you reach it. Press ▶ for a guided tour." })}</p>
            <button type="button" className="btn primary justify-center text-[15px]! disabled:cursor-wait disabled:opacity-70" onClick={start} disabled={!ready} autoFocus aria-busy={!ready}>
              {ready ? <>▶ {c({ az: "Gəzintiyə başla", en: "Start the walk" })}</> : (
                <><span aria-hidden="true" className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> {c({ az: "Hazırlanır…", en: "Getting ready…" })}</>
              )}
            </button>
            {error && <p className="text-[13px] text-hyp">{error}</p>}
          </div>
        </div>
      )}
      {lb && <Lightbox list={lb.list} index={lb.i} onIndex={(i) => setLb({ ...lb, i })} onClose={() => setLb(null)} />}
    </div>
  );
}
