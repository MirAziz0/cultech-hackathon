"use client";
import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";
import type { Photo } from "@/lib/types";

export interface PhotoWithUrl extends Photo { url: string }

/** Credit line: author, license (linked) and Commons file page. Required for every photo shown. */
export function Credit({ p, className = "" }: { p: PhotoWithUrl; className?: string }) {
  const { t } = useT();
  return (
    <span className={className}>
      © {p.author} ·{" "}
      {p.licenseUrl ? (
        <a href={p.licenseUrl} target="_blank" rel="noopener noreferrer license" className="underline decoration-dotted">
          {p.license}
        </a>
      ) : (
        p.license
      )}{" "}
      ·{" "}
      <a href={p.page} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted">
        {t("source")}: Wikimedia Commons ↗
      </a>
    </span>
  );
}

export function Lightbox({ list, index, onIndex, onClose }: { list: PhotoWithUrl[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const { t, c } = useT();
  const closeRef = useRef<HTMLButtonElement>(null);
  const p = list[index];
  useEffect(() => {
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex((index + 1) % list.length);
      if (e.key === "ArrowLeft") onIndex((index + list.length - 1) % list.length);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [index, list.length, onClose, onIndex]);
  if (!p) return null;
  const btn = "absolute grid h-11 w-11 place-items-center rounded-full border-0 bg-white/15 text-[22px] text-white";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={c(p.caption)}
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(14,12,10,.9)] p-[max(16px,env(safe-area-inset-top))_max(16px,env(safe-area-inset-right))_max(16px,env(safe-area-inset-bottom))_max(16px,env(safe-area-inset-left))]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <figure className="m-0 grid max-w-[min(1000px,100%)] justify-items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.url} alt={c(p.caption)} className="max-h-[74vh] max-w-full rounded-[3px] object-contain" />
        <figcaption className="grid gap-1 text-center text-[15px] text-[#efe6d6]">
          <span>{c(p.caption)}</span>
          <span className="font-mono text-[12px] leading-snug text-[#b9ad99] [&_a]:text-[#7fd0d4]">
            {index + 1} / {list.length} · <Credit p={p} />
          </span>
        </figcaption>
      </figure>
      <button ref={closeRef} type="button" aria-label={t("close")} onClick={onClose} className={`${btn} right-[max(14px,env(safe-area-inset-right))] top-[max(14px,env(safe-area-inset-top))]`}>
        ✕
      </button>
      {list.length > 1 && (
        <>
          <button type="button" aria-label={t("prev")} onClick={() => onIndex((index + list.length - 1) % list.length)} className={`${btn} left-[max(10px,env(safe-area-inset-left))] top-1/2 -translate-y-1/2`}>
            ‹
          </button>
          <button type="button" aria-label={t("next")} onClick={() => onIndex((index + 1) % list.length)} className={`${btn} right-[max(10px,env(safe-area-inset-right))] top-1/2 -translate-y-1/2`}>
            ›
          </button>
        </>
      )}
    </div>
  );
}
