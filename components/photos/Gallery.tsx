"use client";
import { useT } from "@/lib/i18n";
import type { PhotoWithUrl } from "./Lightbox";

export function Gallery({ photos, onOpen }: { photos: PhotoWithUrl[]; onOpen: (list: PhotoWithUrl[], i: number) => void }) {
  const { t, c } = useT();
  if (!photos.length) return null;
  return (
    <div>
      <div className="mt-4 mb-2 font-az-sans text-[12px] font-medium uppercase tracking-[.1em] text-muted">{t("photos")}</div>
      <div className="grid grid-cols-3 gap-1.5">
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            aria-label={c(p.caption)}
            title={`${c(p.caption)} — © ${p.author}, ${p.license}`}
            onClick={() => onOpen(photos, i)}
            className="group aspect-square cursor-zoom-in overflow-hidden rounded-[3px] border border-line bg-bg p-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={c(p.caption)} loading="lazy" className="block h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.06]" />
          </button>
        ))}
      </div>
    </div>
  );
}
