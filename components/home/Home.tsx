"use client";
import Link from "next/link";
import { useState } from "react";
import mapData from "@/lib/map-data.json";
import { useT } from "@/lib/i18n";
import type { L } from "@/lib/types";
import { SiteHeader } from "@/components/ui/SiteHeader";

export interface MonumentCard {
  slug: string;
  name: L;
  tagline: L;
  period: L;
  place: L;
  lat: number;
  lon: number;
  cover?: string;
  coverCredit?: string;
  walk: boolean;
}

const D2R = Math.PI / 180;
/** same projection as scripts/make-map.ts */
function project(lon: number, lat: number): [number, number] {
  const { k, tx, ty, cos0 } = mapData.proj;
  return [k * lon * D2R * cos0 + tx, -k * lat * D2R + ty];
}

export function Home({ monuments }: { monuments: MonumentCard[] }) {
  const { t, c } = useT();
  const [hover, setHover] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  return (
    <div className="min-h-dvh pb-14">
      <SiteHeader />
      <main className="mx-auto grid max-w-[1180px] gap-8 px-4">
        <section className="grid items-center gap-6 pt-4 min-[861px]:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <div className="eyebrow">{c({ az: "Virtual zaman səyahəti", en: "Virtual time travel" })}</div>
            <h1 className="mt-2 font-display text-[clamp(34px,5.4vw,58px)] leading-[1.02] font-bold text-balance">
              {t("heroTitle").split(" ").slice(0, -1).join(" ")} <em className="font-medium text-accent">{t("heroTitle").split(" ").slice(-1)}</em>
            </h1>
            <p className="mt-3 max-w-[56ch] text-[16px] text-muted">{t("heroSub")}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {monuments[0] && <Link href={`/m/${monuments[0].slug}`} className="btn primary text-[14px]!">{c(monuments[0].name)} →</Link>}
              <a href="#monuments" className="btn text-[14px]!">{t("explore")}</a>
            </div>
            <p className="mt-4 max-w-[60ch] text-[12.5px] text-muted">{t("disclaimerGlobal")}</p>
          </div>

          {/* map */}
          <figure className="relative m-0 overflow-hidden rounded-md border border-line bg-[#cfe3ea] dark:bg-[#1c2a2f]">
            <svg viewBox={`0 0 ${mapData.width} ${mapData.height}`} className="block h-auto w-full" role="img" aria-label={t("map")}>
              {mapData.shapes.filter((s) => s.id !== "az").map((s) => (
                <path key={s.id} d={s.d} fill="var(--bg)" stroke="var(--line)" strokeWidth={1.2} opacity={0.75} />
              ))}
              {/* Azerbaijan's 14 economic regions */}
              {mapData.regions.map((r) => (
                <path key={r.id} d={r.d} fill={region === r.id ? "color-mix(in srgb, var(--accent) 22%, var(--surface))" : "var(--surface)"}
                  onMouseEnter={() => setRegion(r.id)} onMouseLeave={() => setRegion(null)}>
                  <title>{c(r.name)}</title>
                </path>
              ))}
              <path d={mapData.regionLines} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeLinejoin="round" opacity={0.85} pointerEvents="none" />
              <path d={mapData.azOutline} fill="none" stroke="var(--accent)" strokeWidth={2.4} strokeLinejoin="round" pointerEvents="none" />
              {region && (() => {
                const r = mapData.regions.find((x) => x.id === region)!;
                return (
                  <text x={mapData.width - 16} y={mapData.height - 18} textAnchor="end" fontSize={24} fontWeight={700} fill="var(--accent)" stroke="var(--surface)" strokeWidth={5} paintOrder="stroke" pointerEvents="none" style={{ fontFamily: "var(--font-sans)" }}>
                    {c(r.name)}
                  </text>
                );
              })()}
              {monuments.map((m) => {
                const [x, y] = project(m.lon, m.lat);
                const on = hover === m.slug;
                // monuments in the same city share a pin; stack their labels
                const dist = (o: MonumentCard) => { const [ox, oy] = project(o.lon, o.lat); return Math.hypot(ox - x, oy - y); };
                const same = monuments.filter((o) => dist(o) < 30);
                const row = same.findIndex((o) => o.slug === m.slug);
                const first = same[0].slug === m.slug;
                const left = x > mapData.width * 0.62;
                const ly = y - 22 - (same.length - 1 - row) * 30;
                return (
                  <Link key={m.slug} href={`/m/${m.slug}`} aria-label={c(m.name)} onMouseEnter={() => setHover(m.slug)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(m.slug)} onBlur={() => setHover(null)}>
                    {first && <circle cx={x} cy={y} r={on ? 26 : 20} fill="var(--accent)" opacity={0.18} />}
                    {first && <path d={`M${x} ${y}c-9-12-15-20-15-28a15 15 0 0 1 30 0c0 8-6 16-15 28z`} fill={on ? "var(--hyp)" : "var(--accent)"} stroke="var(--surface)" strokeWidth={3} />}
                    {first && <circle cx={x} cy={y - 28} r={5.5} fill="var(--surface)" />}
                    <text x={left ? x - 22 : x + 20} y={ly} textAnchor={left ? "end" : "start"} fontSize={on ? 25 : 22} fontWeight={700}
                      fill={on ? "var(--hyp)" : "var(--ink)"} stroke="var(--surface)" strokeWidth={6} paintOrder="stroke" style={{ fontFamily: "var(--font-sans)", cursor: "pointer" }}>
                      {c(m.name)}
                    </text>
                  </Link>
                );
              })}
            </svg>
            <figcaption className="absolute bottom-1.5 left-2 font-mono text-[10px] text-muted">Natural Earth · geoBoundaries (CC BY-SA 3.0)</figcaption>
          </figure>
        </section>

        <section id="monuments" className="grid gap-3">
          <h2 className="font-display text-[26px] font-bold">{t("explore")}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {monuments.map((m) => (
              <Link key={m.slug} href={`/m/${m.slug}`} onMouseEnter={() => setHover(m.slug)} onMouseLeave={() => setHover(null)}
                className="group grid overflow-hidden rounded-md border border-line bg-surface text-ink no-underline transition-shadow hover:shadow-[0_10px_30px_rgba(0,0,0,.12)]">
                <div className="relative aspect-[16/10] overflow-hidden bg-stage">
                  {m.cover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.cover} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                  )}
                  <span className="glass absolute top-2 left-2 rounded px-2 py-1 font-mono text-[11px] tracking-wide">{c(m.period)}</span>
                  {m.coverCredit && <span className="absolute right-1.5 bottom-1 max-w-[90%] truncate rounded bg-black/45 px-1.5 text-[10px] text-white/85">{m.coverCredit}</span>}
                </div>
                <div className="grid gap-1 p-4">
                  <div className="eyebrow">{c(m.place)}</div>
                  <h3 className="font-display text-[21px] leading-tight font-bold">{c(m.name)}</h3>
                  <p className="text-[14px] text-muted">{c(m.tagline)}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[12px] font-semibold">
                    <span className="rounded-full border border-line px-2 py-0.5">3D · {c({ az: "iki dövr", en: "two eras" })}</span>
                    {m.walk && <span className="rounded-full border border-line px-2 py-0.5">{t("walkInside")}</span>}
                    <span className="rounded-full border border-line px-2 py-0.5">{t("talkArchitect")}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
