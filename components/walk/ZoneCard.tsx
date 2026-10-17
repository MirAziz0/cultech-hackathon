"use client";
/* Zone card in walk mode: what the visitor is looking at (photo, text, confidence) and what happened
   here (History tab: sieges, earthquakes, rebuildings from walk.history). Minimises to a pill. */
import { useState } from "react";
import { useT } from "@/lib/i18n";
import type { HistoryEvent, ZoneInfo } from "@/lib/types";
import { Credit, type PhotoWithUrl } from "@/components/photos/Lightbox";


export function ZoneCard({ zone, info, photos, index, onIndex, events, open, highlight, onOpen, onClose, onEnlarge, onTell }: {
  zone: string;
  info: ZoneInfo;
  photos: PhotoWithUrl[];
  index: number;
  onIndex: (i: number) => void;
  events: HistoryEvent[];
  open: boolean;
  highlight: boolean;
  onOpen: () => void;
  onClose: () => void;
  onEnlarge: () => void;
  onTell: () => void;
}) {
  const { t, c } = useT();
  const [tab, setTab] = useState<"about" | "history">("about");
  const pos = "absolute z-20 left-[calc(max(12px,env(safe-area-inset-left))+58px)] sm:left-[max(12px,env(safe-area-inset-left))] top-[calc(max(12px,env(safe-area-inset-top))+56px)] sm:left-auto sm:right-[max(12px,env(safe-area-inset-right))] sm:top-[calc(max(12px,env(safe-area-inset-top))+132px)]";

  if (!open)
    return (
      <button type="button" onClick={onOpen} className={`${pos} anim-in flex max-w-[min(300px,calc(100vw-82px))] items-center gap-2 rounded-full border border-white/15 bg-[rgba(20,17,14,.82)] py-2 pr-4 pl-3 text-[14px] font-semibold text-[#f3ead9] shadow-[0_8px_24px_rgba(0,0,0,.3)] backdrop-blur`}>
        <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-[13px] text-accent-ink">i</span>
        <span className="truncate">{c(info.title)}</span>
      </button>
    );

  // events of this zone first, then the rest of the place's history (chronological inside each group)
  const here = events.filter((e) => e.zones?.includes(zone));
  const rest = events.filter((e) => !e.zones?.includes(zone));
  const photo = photos[index];
  const many = photos.length > 1;
  const arrow = "absolute top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border-0 bg-black/55 text-[18px] text-white hover:bg-black/75";

  return (
    <figure key={zone} className={`${pos} anim-in m-0 flex w-[380px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-[0_14px_40px_rgba(0,0,0,.35)] transition-shadow max-h-[calc(100dvh-230px)] max-sm:w-[calc(100vw-82px)] max-sm:max-h-[calc(100dvh-280px)] ${highlight ? "ring-4 ring-[#f2c46b] shadow-[0_0_40px_rgba(242,196,107,.7)]" : ""}`}>
      {/* header */}
      <div className="flex items-start gap-2 border-b border-line px-4 pt-3 pb-2.5">
        <div className="grid min-w-0 flex-1 gap-1">
          <b className="font-display text-[20px] leading-tight max-sm:text-[17px]">{c(info.title)}</b>
        </div>
        <button type="button" aria-label={c({ az: "Kartı kiçilt", en: "Minimise card" })} onClick={onClose}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-bg text-[15px] hover:bg-line">—</button>
      </div>

      {/* tabs */}
      {events.length > 0 && (
        <div role="tablist" className="flex gap-1 border-b border-line px-3 pt-2">
          {([["about", c({ az: "Haqqında", en: "About" })], ["history", `${c({ az: "Tarix", en: "History" })} · ${events.length}`]] as const).map(([id, label]) => (
            <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`-mb-px rounded-t-md border-b-2 px-3 pb-2 text-[14px] font-semibold ${tab === id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "about" ? (
          <>
            {photo && (
              <div className="relative">
                <button type="button" aria-label={t("enlarge")} onClick={onEnlarge} className="block aspect-[16/10] w-full cursor-zoom-in border-0 bg-bg p-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={c(photo.caption)} className="block h-full w-full object-cover" />
                </button>
                <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[10.5px] tracking-[.08em] text-white uppercase">{t("realPhoto")}</span>
                {many && (
                  <>
                    <button type="button" aria-label={c({ az: "Əvvəlki şəkil", en: "Previous photo" })} onClick={() => onIndex((index - 1 + photos.length) % photos.length)} className={`${arrow} left-2`}>‹</button>
                    <button type="button" aria-label={c({ az: "Növbəti şəkil", en: "Next photo" })} onClick={() => onIndex((index + 1) % photos.length)} className={`${arrow} right-2`}>›</button>
                    <span className="pointer-events-none absolute right-2 bottom-2 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[11px] text-white">{index + 1}/{photos.length}</span>
                  </>
                )}
              </div>
            )}
            <div className="grid gap-2 px-4 pt-3 pb-3 text-[14.5px] leading-relaxed max-sm:text-[13.5px]">
              <p className="m-0">{c(info.text)}</p>
              {photo && (
                <p className="m-0 border-t border-line pt-2 text-[12.5px] text-muted">
                  <b className="font-semibold text-ink">{c(photo.caption)}</b>
                  <Credit p={photo} className="mt-0.5 block text-[11.5px] text-muted [&_a]:text-muted" />
                </p>
              )}
              {info.links?.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="text-[13px] underline decoration-dotted">{c(l.title)} ↗</a>
              ))}
            </div>
          </>
        ) : (
          <ol className="m-0 grid list-none gap-0 px-4 py-3">
            {[...here, ...rest].map((e, i) => (
              <li key={i} className={`relative grid grid-cols-[92px_1fr] gap-3 border-l-2 py-2 pl-3 ${e.zones?.includes(zone) ? "border-accent" : "border-line"}`}>
                <span className="font-mono text-[12.5px] font-bold text-accent">{e.year}</span>
                <span className="grid gap-0.5">
                  <b className="text-[14.5px] leading-snug">{c(e.title)}{e.zones?.includes(zone) && <span className="ml-1.5 rounded-full bg-accent/15 px-1.5 py-0.5 align-middle text-[10.5px] font-semibold text-accent">{c({ az: "burada", en: "here" })}</span>}</b>
                  <span className="text-[13.5px] leading-snug text-muted">{c(e.text)}</span>
                  {e.conf === "mid" && <span className="text-[11.5px] text-muted italic">{c({ az: "Mənbələrdə fərqli göstərilir", en: "Sources differ" })}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="border-t border-line p-3">
        <button type="button" className="btn primary w-full justify-center py-2.5! text-[14.5px]!" onClick={onTell}>▶ {t("tellMe")}</button>
      </div>
    </figure>
  );
}
