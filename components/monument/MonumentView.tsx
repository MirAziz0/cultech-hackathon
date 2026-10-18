"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, ViewTransition } from "react";
import { CONF_KEY, useT } from "@/lib/i18n";
import type { Era, MonumentBundle } from "@/lib/types";
import { factsFor, photos as photosOf } from "@/lib/bundle";
import { buildingText, buildingVisible, defaultEra, eraList } from "@/lib/eras";
import type { ExteriorViewer, LabelPos } from "@/lib/viewer/exteriorViewer";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { ConfBadge, ConfidenceLegend } from "@/components/ui/ConfidenceLegend";
import { Gallery } from "@/components/photos/Gallery";
import { Lightbox, type PhotoWithUrl } from "@/components/photos/Lightbox";
import { FactsPanel } from "./FactsPanel";
import { GlossaryText } from "@/components/ui/GlossaryText";
import { ArButton } from "./ArButton";
import { ArchitectDock } from "@/components/architect/ArchitectDock";

export function MonumentView({ bundle }: { bundle: MonumentBundle }) {
  const m = bundle.manifest;
  const { t, c, lang } = useT();
  const eras = useMemo(() => eraList(m), [m]);
  const [era, setEra] = useState<Era>(() => defaultEra(m));
  const [current, setCurrent] = useState<string | null>(null);
  const [inside, setInside] = useState<string | null>(null);
  const [labels, setLabels] = useState<LabelPos[]>([]);
  const [loading, setLoading] = useState<"loading" | "ok" | string>("loading");
  const [lb, setLb] = useState<{ list: PhotoWithUrl[]; i: number } | null>(null);
  const [talk, setTalk] = useState(false);
  const [wide, setWide] = useState(true);
  const viewRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<ExteriorViewer | null>(null);

  const visibleBuildings = useMemo(
    () => m.buildings.filter((b) => buildingVisible(b, era)),
    [m.buildings, era],
  );

  // three.js viewer lifecycle
  useEffect(() => {
    let disposed = false;
    let v: ExteriorViewer | null = null;
    import("@/lib/viewer/exteriorViewer").then(({ ExteriorViewer }) => {
      if (disposed || !canvasRef.current || !viewRef.current) return;
      try {
        v = new ExteriorViewer(canvasRef.current, viewRef.current, m.exterior, Object.keys(m.eras));
        v.load(era);
        v.setAnchors(m.buildings.map((b) => ({ id: b.id, pos: b.pos })));
        v.onLabels = setLabels;
        v.start();
        viewer.current = v;
        setLoading("ok");
      } catch (e) {
        setLoading(String((e as Error).message ?? e));
      }
    });
    return () => {
      disposed = true;
      v?.dispose();
      viewer.current = null;
    };
  }, [m]); // eslint-disable-line react-hooks/exhaustive-deps -- era changes go through setEra

  useEffect(() => viewer.current?.setEra(era), [era, loading]);

  useEffect(() => {
    const mq = matchMedia("(min-width: 521px)");
    const f = () => setWide(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);

  const select = useCallback((id: string | null, fly = true) => {
    if (viewer.current?.isInside) { viewer.current.exitInterior(); setInside(null); }
    setCurrent(id);
    if (id && fly) viewer.current?.flyToAnchor(id, 0.42);
  }, []);

  const enterInterior = (id: string) => {
    const spec = m.interiors?.[id];
    if (!spec || !viewer.current) return;
    viewer.current.enterInterior(id, spec);
    setInside(id);
  };
  const exitInterior = () => { viewer.current?.exitInterior(); setInside(null); };

  const b = m.buildings.find((x) => x.id === current && visibleBuildings.includes(x));
  const openLb = (list: PhotoWithUrl[], i: number) => setLb({ list, i });
  const walkBuilding = m.buildings.find((x) => x.walk);
  const overviewPhotos = photosOf(bundle, m.exterior.overviewPhotos ?? []);

  return (
    <div className="min-h-dvh pb-10">
      <SiteHeader back />
      <main className="mx-auto grid max-w-[1180px] gap-[18px] px-4">
        <div>
          {/* headings: bold Azerbaijan Serif · subheadings: medium Azerbaijan Sans · body text unchanged */}
          <div className="font-az-sans text-[13px] font-medium tracking-[.08em] text-muted uppercase">{c(m.location.place)}</div>
          <h1 className="mt-1.5 font-az-serif text-[clamp(28px,4.4vw,44px)] leading-[1.05] font-bold text-balance">
            {c(m.name)}, <em className="font-bold text-accent">{c(m.tagline).toLowerCase()}</em>
          </h1>
        </div>

        {/* desktop: stage top-left, the reference panels fill the space under it, and the info panel
            stays beside them (sticky); phones: stage, info panel, then the reference panels */}
        <div className="grid items-start gap-[18px] min-[861px]:grid-cols-[minmax(0,1fr)_340px]">
          {/* ---------- stage ---------- */}
          {/* the home card's photo grows into this stage when the page opens from a card */}
          <ViewTransition name={`monument-${m.slug}`} share="morph" default="none">
          <div className="relative overflow-hidden rounded-md border border-line bg-stage min-[861px]:col-start-1 min-[861px]:row-start-1">
            <div ref={viewRef} className="relative h-[min(68vh,620px)] min-h-[380px] w-full" role="img" aria-label={inside ? c(m.interiors?.[inside]?.title) : c(m.name)}>
              <canvas
                ref={canvasRef}
                className="block h-full w-full cursor-grab touch-none active:cursor-grabbing"
                onDoubleClick={() => { if (!inside) { setCurrent(null); viewer.current?.flyHome(); } }}
              />
              {!inside && (
                <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden={false}>
                  {labels.map((l) => {
                    const bb = visibleBuildings.find((x) => x.id === l.id);
                    if (!bb || !l.visible) return null;
                    const active = current === l.id;
                    return (
                      <button
                        key={l.id}
                        type="button"
                        aria-label={c(bb.name)}
                        onClick={() => select(l.id)}
                        className="pointer-events-auto absolute top-0 left-0 -mt-1.5 -ml-1.5 block h-3 w-3 rounded-full border-2 border-surface p-0 shadow-[0_0_0_3px_rgba(31,122,128,.25)]"
                        style={{ transform: `translate(${l.x}px, ${l.y}px) scale(${active ? 1.4 : 1})`, background: active ? "var(--hyp)" : "var(--accent)" }}
                      >
                        {(wide || active) && (
                          <span className="pointer-events-none absolute top-[-6px] left-4 rounded-[3px] border border-line bg-surface px-[7px] py-[5px] text-[12px] leading-none font-semibold whitespace-nowrap text-ink">
                            {c(bb.name)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {loading !== "ok" && (
                <div className="absolute inset-0 grid place-items-center font-mono text-[13px] tracking-[.06em] text-muted">
                  {loading === "loading" ? t("loading") : `${t("loadFail")}: ${loading}`}
                </div>
              )}
            </div>

            {inside ? (
              <>
                <button type="button" className="btn absolute top-3 left-3 bg-surface" onClick={exitInterior}>{t("backOut")}</button>
                <div className="absolute right-3 bottom-3 left-3 grid max-w-[520px] gap-1 rounded border border-line bg-surface px-3 py-2.5 text-[13px]">
                  <b className="font-az-serif text-[16px] font-bold">{c(m.interiors?.[inside]?.title)}</b>
                  <span className="text-muted"><GlossaryText text={c(m.interiors?.[inside]?.note)} />{" "}{lang === "az" ? "Təxmini bərpadır. Yuxarı baxmaq üçün sürüşdürün." : "Approximate reconstruction. Drag to look up."}</span>
                </div>
              </>
            ) : (
              <>
                <div className="absolute top-3.5 left-3.5 rounded border border-line bg-surface px-2.5 py-[7px] font-az-sans text-[12px] leading-none font-medium tracking-[.08em]">{c(m.eras[era].badge)}</div>
                <div className="absolute top-3 right-3"><ArButton bundle={bundle} era={era} /></div>
                <div role="group" aria-label={t("era")} className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1 rounded-full border grad-stroke on-surface p-1 shadow-[0_6px_20px_rgba(0,0,0,.12)]">
                  {eras.map((e) => (
                    <button key={e} type="button" aria-pressed={era === e} onClick={() => setEra(e)}
                      className={`rounded-full py-2.5 text-[14px] leading-none font-semibold whitespace-nowrap ${eras.length > 2 ? "px-3 max-sm:px-2.5 max-sm:text-[13px]" : "px-4"} ${era === e ? "bg-accent text-accent-ink" : ""}`}>
                      {c(m.eras[e].label)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          </ViewTransition>

          {/* ---------- side panel ---------- */}
          <aside className="grid min-w-0 gap-3.5 min-[861px]:sticky min-[861px]:top-4 min-[861px]:col-start-2 min-[861px]:row-span-2 min-[861px]:row-start-1">
            <section className="panel min-h-[120px]" aria-live="polite">
              {b ? (
                <>
                  <div className="font-az-sans text-[12px] font-medium tracking-[.06em] text-muted">{c(b.date)}</div>
                  <h3 className="mt-0.5 font-az-serif text-[22px] leading-[1.15] font-bold text-balance">{c(b.name)}</h3>
                  <p className="mt-2.5"><GlossaryText text={c(buildingText(b, era))} /></p>
                  <div className="mt-3"><ConfBadge conf={b.conf} labels={m.confLabels} /></div>
                  <div className="mt-3.5 flex flex-wrap gap-2">
                    {b.walk && m.walk && <Link className="btn primary" href={`/m/${m.slug}/walk${m.walk.eras?.includes(era) ? `?era=${era}` : ""}`}>{m.walk.cta ? c(m.walk.cta) : t("walkInside")}</Link>}
                    {b.interior && m.interiors?.[b.interior] && <button type="button" className="btn primary" onClick={() => enterInterior(b.interior!)}>{t("lookInside")}</button>}
                    <button type="button" className="btn" onClick={() => setTalk(true)}>{t("talkArchitect")}</button>
                  </div>
                  <Gallery photos={photosOf(bundle, b.photos)} onOpen={openLb} />
                </>
              ) : (
                <>
                  <div className="font-az-sans text-[12px] font-medium tracking-[.06em] text-muted">{c(m.eras[era].badge)}</div>
                  <h3 className="mt-0.5 font-az-serif text-[22px] leading-[1.15] font-bold">{c(m.name)}</h3>
                  <p className="mt-2.5"><GlossaryText text={c(m.eras[era].summary)} /></p>
                  <div className="mt-3.5 flex flex-wrap gap-2">
                    {walkBuilding && m.walk && <Link className="btn primary" href={`/m/${m.slug}/walk${m.walk.eras?.includes(era) ? `?era=${era}` : ""}`}>{m.walk.cta ? c(m.walk.cta) : t("walkInside")}</Link>}
                    <button type="button" className="btn" onClick={() => setTalk(true)}>{t("talkArchitect")}</button>
                  </div>
                  <Gallery photos={overviewPhotos} onOpen={openLb} />
                  <p className="mt-2.5 text-[13px] text-muted">{t("tapHint")}</p>
                </>
              )}
            </section>
          </aside>

          {/* ---------- reference panels, under the stage ---------- */}
          <div className="grid min-w-0 items-start gap-[18px] sm:grid-cols-2 min-[861px]:col-start-1 min-[861px]:row-start-2">
            <section className="panel">
              <h2 className="mb-2.5 font-az-serif text-[19px] font-bold">{t("buildings")}</h2>
              <ul className="grid gap-0.5">
                {visibleBuildings.map((x) => (
                  <li key={x.id}>
                    <button type="button" aria-current={x.id === current} onClick={() => select(x.id)}
                      className={`grid w-full grid-cols-[10px_1fr] items-baseline gap-2.5 rounded px-1.5 py-2 text-left text-[14px] leading-tight font-semibold hover:bg-bg ${x.id === current ? "bg-bg" : ""}`}>
                      <span className={`dot ${x.conf} translate-y-px`} title={m.confLabels?.[x.conf] ? c(m.confLabels[x.conf]!.short) : t(CONF_KEY[x.conf])} />
                      <span>{c(x.name)}<small className="mt-0.5 block font-mono text-[11px] font-medium tracking-[.03em] text-muted">{c(x.date)}</small></span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <ConfidenceLegend labels={m.confLabels} />
            <div className="sm:col-span-2">
              <FactsPanel facts={factsFor(bundle, b?.factIds) .length ? factsFor(bundle, b?.factIds) : bundle.facts} />
            </div>
            <p className="m-0 text-[13px] text-muted sm:col-span-2">{c(m.disclaimer)}</p>
          </div>
        </div>
      </main>
      {lb && <Lightbox list={lb.list} index={lb.i} onIndex={(i) => setLb({ ...lb, i })} onClose={() => setLb(null)} />}
      {talk && <ArchitectDock bundle={bundle} zone={null} era={era} onClose={() => setTalk(false)} mode="panel" />}
    </div>
  );
}
