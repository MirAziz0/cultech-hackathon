"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";
import mapData from "@/lib/map-data.json";
import { useT } from "@/lib/i18n";
import type { L } from "@/lib/types";
import type { PinScreen, TerrainMap } from "@/lib/viewer/terrainMap";

export interface TerrainMapPin { slug: string; name: L; x: number; y: number }

/* geographic names over the map (lon/lat, projected like the monuments) */
const D2R = Math.PI / 180;
const toMap = (lon: number, lat: number) => {
  const { k, tx, ty, cos0 } = mapData.proj;
  return { x: k * lon * D2R * cos0 + tx, y: -k * lat * D2R + ty };
};
const PLACES: { id: string; kind: "mountain" | "river" | "sea"; name: L; lon: number; lat: number }[] = [
  { id: "greater-caucasus", kind: "mountain", name: { az: "Böyük Qafqaz", en: "Greater Caucasus" }, lon: 47.7, lat: 41.25 },
  { id: "lesser-caucasus", kind: "mountain", name: { az: "Kiçik Qafqaz", en: "Lesser Caucasus" }, lon: 45.95, lat: 40.15 },
  { id: "kur", kind: "river", name: { az: "Kür", en: "Kura" }, lon: 48.3, lat: 40.05 },
  { id: "araz", kind: "river", name: { az: "Araz", en: "Aras" }, lon: 47.55, lat: 39.4 },
  { id: "caspian", kind: "sea", name: { az: "Xəzər dənizi", en: "Caspian Sea" }, lon: 49.7, lat: 39.15 },
];

type Box = { x: number; y: number; w: number; h: number };
const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** 3D relief diorama of Azerbaijan with region hover and monument pins, filling its positioned parent
    as the hero background. Each label sits right at its pin and never overlaps the other labels,
    pins or the map buttons (the hero text, `avoid`, is dodged where possible). Calls onFail if
    WebGL is unavailable. */
export function TerrainMapView({ pins, hover, setHover, onFail, avoid }: {
  pins: TerrainMapPin[];
  hover: string | null;
  setHover: (slug: string | null) => void;
  onFail: () => void;
  avoid?: RefObject<HTMLElement | null>;
}) {
  const { t, c } = useT();
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<TerrainMap | null>(null);
  const labelRefs = useRef(new Map<string, HTMLAnchorElement>());
  const placeRefs = useRef(new Map<string, HTMLSpanElement>());
  const controlsRef = useRef<HTMLDivElement>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const hoverRef = useRef(hover);
  useEffect(() => { hoverRef.current = hover; });

  // monuments in the same city share one pin
  const layout = pins.map((p) => {
    const same = pins.filter((o) => Math.hypot(o.x - p.x, o.y - p.y) < 24);
    return { ...p, showPin: same[0].slug === p.slug };
  });

  // the viewer is created once; callbacks read the latest props through refs
  // opening a monument: the camera flies down to its pin first, then the page opens
  const open = (slug: string) => {
    const go = () => router.push(`/m/${slug}`);
    if (viewerRef.current) viewerRef.current.flyToPin(slug, go);
    else go();
  };
  const cb = useRef({ setHover, onFail, open });
  useEffect(() => { cb.current = { setHover, onFail, open }; });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let viewer: TerrainMap | null = null;
    let cancelled = false;
    const ro = new ResizeObserver(() => viewer?.resize());
    const prefer = new Map<string, number>(); // last chosen spot per label, so labels don't jitter

    /* label placement: every label stays touching its pin — above it, or beside / just below the
       pin head — and takes the first of those spots that is inside the map and clear of the labels
       already placed, other pins and the map buttons (the hero text only counts lightly, so a label
       never wanders away from its pin to dodge it) */
    const place = (screen: PinScreen[], places: PinScreen[]) => {
      const fig = canvas.parentElement;
      if (!fig) return;
      const fb = fig.getBoundingClientRect();
      for (const p of places) {
        const el = placeRefs.current.get(p.slug);
        if (!el) continue;
        const on = p.visible && p.x > 0 && p.x < fb.width && p.y > 0 && p.y < fb.height;
        el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
        el.style.opacity = on ? "1" : "0";
      }
      const rel = (el: Element | null | undefined, pad: number): Box | null => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return r.width ? { x: r.left - fb.left - pad, y: r.top - fb.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 } : null;
      };
      const blocked = [rel(controlsRef.current, 8)].filter((b): b is Box => !!b);
      const soft = rel(avoid?.current, 4);
      // pins themselves are obstacles too, so a label never covers another monument's pin
      const pinBoxes = screen.filter((s) => s.visible).map((s) => ({ x: s.x - 9, y: s.y - 9, w: 18, h: 44 }));
      const items = screen
        .map((s) => ({ s, el: labelRefs.current.get(s.slug) }))
        .filter((i): i is { s: PinScreen; el: HTMLAnchorElement } => !!i.el)
        .map((i) => ({ ...i, w: i.el.offsetWidth, h: i.el.offsetHeight }));
      // the hovered label places first so it always keeps its own spot
      items.sort((a, b) => Number(b.s.slug === hoverRef.current) - Number(a.s.slug === hoverRef.current));
      const placed: Box[] = [];
      for (const { s, el, w, h } of items) {
        const onMap = s.visible && s.x > -20 && s.x < fb.width + 20 && s.y > -20 && s.y < fb.height + 20;
        if (!onMap) {
          el.style.opacity = "0";
          el.style.pointerEvents = "none";
          continue;
        }
        // spots around the pin head (s = head centre), all within a few pixels of it
        const cands: [number, number][] = [
          [s.x - w / 2, s.y - 12 - h], // above
          [s.x + 12, s.y - h / 2], // right
          [s.x - 12 - w, s.y - h / 2], // left
          [s.x + 4, s.y - 10 - h], // above, to the right
          [s.x - 4 - w, s.y - 10 - h], // above, to the left
          [s.x + 12, s.y + 4], // below, to the right
          [s.x - 12 - w, s.y + 4], // below, to the left
        ];
        const order = prefer.has(s.slug) ? [prefer.get(s.slug)!, ...cands.keys()] : [...cands.keys()];
        const others = pinBoxes.filter((b) => Math.hypot(b.x + 9 - s.x, b.y + 9 - s.y) > 4);
        let best = 0, bestCost = Infinity;
        for (const i of order) {
          const [x, y] = cands[i];
          const box = { x, y, w, h };
          const out = x < 6 || y < 6 || x + w > fb.width - 6 || y + h > fb.height - 6;
          const cost = [...placed, ...blocked, ...others].reduce((sum, b) => sum + overlap(box, b), 0)
            + (soft ? overlap(box, soft) * 0.8 : 0) + (out ? w * h * 4 : 0); // never let a label run off the edge
          if (cost < bestCost) { best = i; bestCost = cost; }
          if (cost === 0) break;
        }
        prefer.set(s.slug, best);
        // near the screen edge, slide the label back inside (it still touches its pin's side)
        const x = Math.max(6, Math.min(fb.width - w - 6, cands[best][0])), y = cands[best][1];
        placed.push({ x: x - 3, y: y - 3, w: w + 6, h: h + 6 });
        el.style.transform = `translate(${x}px, ${y}px)`;
        el.style.opacity = "1";
        el.style.pointerEvents = "auto";
      }
    };
    import("@/lib/viewer/terrainMap").then(async ({ TerrainMap }) => {
      if (cancelled) return;
      try {
        viewer = new TerrainMap(canvas, {
          pins: layout.map(({ slug, x, y, showPin }) => ({ slug, x, y, showPin })),
          onRegion: setRegion,
          onPinHover: (s) => cb.current.setHover(s),
          onPinClick: (s) => cb.current.open(s),
          onFrame: place,
          places: PLACES.map((p) => ({ id: p.id, ...toMap(p.lon, p.lat) })),
          shiftRight: 0.23,
          reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
        viewerRef.current = viewer;
        await viewer.load();
        if (!cancelled) setReady(true);
        ro.observe(canvas);
      } catch (e) {
        console.error("[terrain map]", e);
        if (!cancelled) cb.current.onFail();
      }
    });
    return () => {
      cancelled = true;
      ro.disconnect();
      viewer?.dispose();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- built once per mount; pins are static per page
  }, []);

  useEffect(() => { viewerRef.current?.setHover(hover); }, [hover, ready]);

  function mapAction(act: "in" | "out" | "reset") {
    const v = viewerRef.current;
    if (act === "reset") v?.resetView();
    else v?.zoomBy(act === "in" ? 0.6 : 1.6);
  }

  const regionName = region ? mapData.regions.find((r) => r.id === region)?.name : undefined;
  return (
    <figure className="absolute inset-0 m-0 overflow-hidden">
      {/* lift the diorama off the photo behind it: a hairline white rim, a deep drop shadow and a
          touch more colour (the canvas is transparent around the country, so the filters follow its shape) */}
      <canvas ref={canvasRef} role="img" aria-label={t("map")}
        className={`block h-full w-full transition-opacity duration-700 [filter:drop-shadow(0_0_1.5px_rgba(255,255,255,.95))_drop-shadow(0_0_6px_rgba(255,255,255,.35))_drop-shadow(0_18px_30px_rgba(0,0,0,.6))_saturate(1.2)_contrast(1.08)] ${ready ? "opacity-100" : "opacity-0"}`} />
      {/* geographic names: mountains in spaced caps, rivers and the sea in italic serif */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {PLACES.map((p) => (
          <span key={p.id} ref={(el) => { if (el) placeRefs.current.set(p.id, el); else placeRefs.current.delete(p.id); }}
            className={`absolute top-0 left-0 whitespace-nowrap opacity-0 transition-opacity duration-300 [text-shadow:0_1px_3px_rgba(0,0,0,.75),0_0_10px_rgba(0,0,0,.45)] ${
              p.kind === "mountain" ? "font-az-sans text-[10px] font-semibold tracking-[.28em] text-white/90 uppercase sm:text-[11px]"
              : p.kind === "river" ? "font-az-serif text-[15px] font-bold tracking-[.06em] text-[#e9f8ff] italic sm:text-[17px]"
              : "font-az-serif text-[15px] tracking-[.12em] text-[#e3f6ff] italic sm:text-[18px]"}`}>
            {c(p.name)}
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {layout.map((p) => (
          <Link key={p.slug} href={`/m/${p.slug}`}
            onClick={(e) => {
              // plain clicks fly to the pin first; ctrl/cmd/middle clicks open normally
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              open(p.slug);
            }}
            ref={(el) => { if (el) labelRefs.current.set(p.slug, el); else labelRefs.current.delete(p.slug); }}
            onMouseEnter={() => setHover(p.slug)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(p.slug)} onBlur={() => setHover(null)}
            className={`absolute top-0 left-0 rounded-full border px-2 py-[3px] text-[10.5px] leading-none font-semibold whitespace-nowrap no-underline opacity-0 shadow-[0_4px_14px_rgba(0,0,0,.12)] transition-[colors,opacity] sm:px-2.5 sm:py-1 sm:text-[12.5px] ${hover === p.slug ? "z-10 border-hyp bg-hyp text-white" : "border-line bg-white/95 text-ink"}`}>
            {c(p.name)}
          </Link>
        ))}
      </div>
      {/* zoom / reset controls */}
      <div ref={controlsRef} className="absolute right-4 bottom-8 z-10 flex flex-col overflow-hidden rounded-[10px] border border-line bg-white/95 shadow-[0_4px_14px_rgba(0,0,0,.12)]">
        {([
          { label: "+", aria: { az: "Yaxınlaşdır", en: "Zoom in" }, act: "in" },
          { label: "−", aria: { az: "Uzaqlaşdır", en: "Zoom out" }, act: "out" },
          { label: "⟲", aria: { az: "İlkin görünüş", en: "Reset view" }, act: "reset" },
        ] as const).map((b) => (
          <button key={b.label} type="button" onClick={() => mapAction(b.act)} aria-label={c(b.aria)}
            className="grid h-9 w-9 place-items-center border-b border-line text-[18px] leading-none text-ink last:border-b-0 hover:bg-surface">
            {b.label}
          </button>
        ))}
      </div>
      <p className="pointer-events-none absolute right-16 bottom-9 m-0 hidden text-[11px] text-white/85 [text-shadow:0_1px_2px_rgba(0,0,0,.7)] lg:block">
        {c({ az: "Bölgənin üzərinə gəlin: xəritə ona yaxınlaşır", en: "Hover a region to zoom in on it" })}
      </p>

      {regionName && (
        <div className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 rounded-md bg-white/90 px-2.5 py-1.5 text-[15px] font-bold text-accent shadow-[0_4px_14px_rgba(0,0,0,.1)]">
          {c(regionName)}
        </div>
      )}
    </figure>
  );
}
