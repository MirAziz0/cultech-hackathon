"use client";
import Link from "next/link";
import { useRef, useState, type PointerEvent } from "react";
import mapData from "@/lib/map-data.json";
import { useT } from "@/lib/i18n";
import type { L } from "@/lib/types";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { TerrainMapView } from "./TerrainMapView";
import { MonumentCarousel } from "./MonumentCarousel";

export interface MonumentCard {
  slug: string;
  name: L;
  tagline: L;
  period: L;
  /** representative year, places the monument on the timeline */
  year?: number;
  place: L;
  lat: number;
  lon: number;
  cover?: string;
  coverCredit?: string;
  walk: boolean;
  eras: number;
}

const D2R = Math.PI / 180;
/** same projection as scripts/make-map.ts */
function project(lon: number, lat: number): [number, number] {
  const { k, tx, ty, cos0 } = mapData.proj;
  return [k * lon * D2R * cos0 + tx, -k * lat * D2R + ty];
}

/* pseudo-3D map: the flat map is squashed onto a tilted ground plane (SQUASH),
   Azerbaijan is extruded DEPTH px above the neighbours, pins stand STEM px tall */
const SQUASH = 0.74;
const DEPTH = 14;
const LIFT = 6;
const STEM = 30;
const OFFSET_Y = (mapData.height * (1 - SQUASH) - DEPTH) / 2;
/** transform for a layer of the ground plane, `down` px below the top of the slab */
const plane = (down: number) => `translate(0 ${OFFSET_Y + down}) scale(1 ${SQUASH})`;
/** flat map coords -> screen coords on top of the slab */
const ground = (x: number, y: number): [number, number] => [x, OFFSET_Y + y * SQUASH];

export function Home({ monuments }: { monuments: MonumentCard[] }) {
  const { t, c } = useT();
  const [hover, setHover] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [relief, setRelief] = useState(true);
  const heroTextRef = useRef<HTMLDivElement>(null);
  // parallax: write pointer position to CSS vars directly, no re-render per move
  const mapRef = useRef<HTMLElement>(null);
  const onMapMove = (e: PointerEvent) => {
    const el = mapRef.current;
    if (!el || e.pointerType !== "mouse") return;
    const b = el.getBoundingClientRect();
    el.style.setProperty("--px", (((e.clientX - b.left) / b.width) * 2 - 1).toFixed(3));
    el.style.setProperty("--py", (((e.clientY - b.top) / b.height) * 2 - 1).toFixed(3));
  };
  const onMapLeave = () => {
    mapRef.current?.style.setProperty("--px", "0");
    mapRef.current?.style.setProperty("--py", "0");
  };
  return (
    <div className="min-h-dvh">
      {/* hero: the 3D map fills the width and runs up under the transparent header;
          the intro sits on top of it over a dark scrim */}
      <section className="relative h-[min(744px,100dvh)] min-h-[620px] overflow-hidden bg-[#2d4a2a] md:h-dvh md:max-h-[980px]">
          <SiteHeader overlay />
          {/* background layer, under the map: a forested lake landscape across the whole hero,
              with an even, light dark veil (no gradient) so the white text over it reads clearly */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 bg-[url(/hero/lake.webp)] bg-cover bg-center" />
            <div className="absolute inset-0 bg-black/35" />
          </div>
          {/* map: 3D relief diorama; the SVG slab below is the fallback when WebGL is unavailable */}
          {relief ? (
            <TerrainMapView pins={monuments.map((m) => { const [x, y] = project(m.lon, m.lat); return { slug: m.slug, name: m.name, x, y }; })}
              hover={hover} setHover={setHover} onFail={() => setRelief(false)} avoid={heroTextRef} />
          ) : (
          <div className="absolute inset-0 grid place-items-center bg-[#e3f1f3] p-4 pt-[45%] md:pt-4 md:pl-[38%]">
          <figure ref={mapRef} onPointerMove={onMapMove} onPointerLeave={onMapLeave}
            className="map3d relative m-0 w-full overflow-hidden rounded-md border border-line bg-[#e3f1f3]">
            <svg viewBox={`0 0 ${mapData.width} ${mapData.height}`} className="block h-auto w-full" role="img" aria-label={t("map")}>
              <defs>
                <g id="az-land">{mapData.regions.map((r) => <path key={r.id} d={r.d} />)}</g>
                <pattern id="sea-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M40 0H0V40" fill="none" stroke="var(--accent)" strokeWidth={1} opacity={0.12} />
                </pattern>
                <filter id="slab-shadow" x="-10%" y="-10%" width="120%" height="140%"><feGaussianBlur stdDeviation="9" /></filter>
              </defs>

              <g className="lyr lyr-sea">
                <rect x={-mapData.width} y={-mapData.height} width={mapData.width * 3} height={mapData.height * 3} fill="url(#sea-grid)" transform={plane(DEPTH)} />
                {mapData.shapes.filter((s) => s.id !== "az").map((s) => (
                  <path key={s.id} d={s.d} transform={plane(DEPTH)} fill="color-mix(in srgb, var(--accent) 6%, var(--bg))" stroke="color-mix(in srgb, var(--accent) 22%, var(--bg))" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
                ))}
              </g>

              <g className="lyr lyr-land"><g className="map-rise">
                <use href="#az-land" transform={plane(DEPTH + 10)} fill="#0b2a2e" opacity={0.28} filter="url(#slab-shadow)" />
                {Array.from({ length: DEPTH }, (_, i) => DEPTH - i).map((d) => (
                  <use key={d} href="#az-land" transform={plane(d)} fill={d > DEPTH / 2 ? "#00535c" : "#006a76"} />
                ))}
                {/* Azerbaijan's 14 economic regions */}
                {mapData.regions.map((r) => (
                  <path key={r.id} d={r.d} transform={plane(0)} fill="var(--bg)"
                    onMouseEnter={() => setRegion(r.id)} onMouseLeave={() => setRegion(null)}>
                    <title>{c(r.name)}</title>
                  </path>
                ))}
                <path d={mapData.regionLines} transform={plane(0)} fill="none" stroke="var(--muted)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" opacity={0.7} pointerEvents="none" />
                {region && (() => {
                  const r = mapData.regions.find((x) => x.id === region)!;
                  return (
                    <g pointerEvents="none">
                      {Array.from({ length: LIFT }, (_, i) => i).map((i) => (
                        <path key={i} d={r.d} transform={plane(-i)} fill="var(--accent)" />
                      ))}
                      <path d={r.d} transform={plane(-LIFT)} fill="color-mix(in srgb, var(--accent) 22%, var(--surface))" stroke="var(--accent)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                    </g>
                  );
                })()}
                <path d={mapData.azOutline} transform={plane(0)} fill="none" stroke="var(--accent)" strokeWidth={2.4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" pointerEvents="none" />
              </g></g>

              <g className="lyr lyr-pins">
                {region && (
                  <text x={mapData.width - 16} y={mapData.height - 18} textAnchor="end" fontSize={24} fontWeight={700} fill="var(--accent)" stroke="var(--surface)" strokeWidth={5} paintOrder="stroke" pointerEvents="none" style={{ fontFamily: "var(--font-sans)" }}>
                    {c(mapData.regions.find((x) => x.id === region)!.name)}
                  </text>
                )}
                {monuments.map((m) => {
                  const [x, y] = ground(...project(m.lon, m.lat));
                  const on = hover === m.slug;
                  // monuments in the same city share a pin; stack their labels
                  const dist = (o: MonumentCard) => { const [ox, oy] = ground(...project(o.lon, o.lat)); return Math.hypot(ox - x, oy - y); };
                  const same = monuments.filter((o) => dist(o) < 24);
                  const row = same.findIndex((o) => o.slug === m.slug);
                  const first = same[0].slug === m.slug;
                  const left = x > mapData.width * 0.62;
                  const stem = on ? STEM + 8 : STEM;
                  const ly = y - stem - 22 - (same.length - 1 - row) * 30;
                  return (
                    <Link key={m.slug} href={`/m/${m.slug}`} aria-label={c(m.name)} onMouseEnter={() => setHover(m.slug)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(m.slug)} onBlur={() => setHover(null)}>
                      {first && <ellipse cx={x} cy={y} rx={on ? 26 : 20} ry={on ? 9 : 7} fill="var(--accent)" opacity={0.22} />}
                      {first && <ellipse cx={x} cy={y} rx={5} ry={2} fill="#0b2a2e" opacity={0.45} />}
                      {first && <line x1={x} y1={y} x2={x} y2={y - stem} stroke={on ? "var(--hyp)" : "var(--accent)"} strokeWidth={3} strokeLinecap="round" />}
                      {first && <circle cx={x} cy={y - stem} r={on ? 13 : 11} fill={on ? "var(--hyp)" : "var(--accent)"} stroke="var(--surface)" strokeWidth={3} />}
                      {first && <circle cx={x} cy={y - stem} r={4.5} fill="var(--surface)" />}
                      <text x={left ? x - 18 : x + 18} y={ly} textAnchor={left ? "end" : "start"} fontSize={on ? 25 : 22} fontWeight={700}
                        fill={on ? "var(--hyp)" : "var(--ink)"} stroke="var(--surface)" strokeWidth={6} paintOrder="stroke" style={{ fontFamily: "var(--font-sans)", cursor: "pointer" }}>
                        {c(m.name)}
                      </text>
                    </Link>
                  );
                })}
              </g>
            </svg>
            <figcaption className="absolute bottom-1.5 left-2 font-mono text-[10px] text-muted">Natural Earth · geoBoundaries (CC BY-SA 3.0)</figcaption>
          </figure>
          </div>
          )}

          <div className="pointer-events-none absolute inset-0">
            <div className="mx-auto flex h-full max-w-[1180px] items-start px-4 pt-20 md:items-center md:pt-10">
              {/* the text lets the mouse through to the map (regions under it still zoom); only the buttons catch it */}
              <div ref={heroTextRef} className="max-w-[540px] text-white">
                {/* same size and colour as the subtitle below; only the typeface differs */}
                <div className="font-az-sans text-[15px] leading-[1.4] font-bold tracking-[0.04em] text-white md:text-[17px]">{c({ az: "Virtual zaman səyahəti", en: "Virtual time travel" })}</div>
                {/* Cormorant tops out at 700, so a hairline stroke in the text colour thickens it further */}
                <h1 className="mt-3 max-w-[10ch] font-display text-[clamp(46px,7vw,88px)] leading-[0.98] font-bold text-balance text-white [-webkit-text-stroke:0.8px_currentColor]">
                  {t("heroTitle").split(" ").slice(0, -1).join(" ")} <em className="font-bold text-white">{t("heroTitle").split(" ").slice(-1)}</em>
                </h1>
              </div>
            </div>
          </div>
      </section>

      <main className="pt-12 md:pt-14">
        <div className="mx-auto grid max-w-[1180px] gap-10 px-4 md:gap-12">
          <p className="m-0 w-full font-az-serif text-[22px] leading-[1.4] text-ink md:text-[clamp(26px,2.5vw,34px)]">{t("heroSub")}</p>
          <h2 id="monuments" className="m-0 scroll-mt-10 font-display text-[clamp(32px,4vw,44px)] leading-tight font-semibold">{t("explore")}</h2>
        </div>
        {/* full-width carousel, arrows at the screen edges */}
        <section aria-labelledby="monuments" className="mt-1">
          <MonumentCarousel monuments={monuments} hover={hover} setHover={setHover} />
        </section>
      </main>
      <SiteFooter monuments={monuments} />
    </div>
  );
}
