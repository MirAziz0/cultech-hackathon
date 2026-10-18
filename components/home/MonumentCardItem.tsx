"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, ViewTransition, type PointerEvent } from "react";
import { flushSync } from "react-dom";
import { useT } from "@/lib/i18n";
import type { MonumentCard } from "./Home";

/** a monument card that fades up as it scrolls into view and, under the mouse, tilts toward the
    pointer with a soft glare; it also lifts when the monument's pin is hovered on the map */
export function MonumentCardItem({ m, index, active, setHover, copy = false, morph = false, onPick }: {
  m: MonumentCard;
  index: number;
  active: boolean;
  setHover: (slug: string | null) => void;
  /** the carousel's duplicate run: hidden from screen readers and skipped by Tab */
  copy?: boolean;
  /** this card's photo is the shared element that grows into the monument page */
  morph?: boolean;
  /** clicked: the parent marks this card as the morph source before navigating */
  onPick?: () => void;
}) {
  const router = useRouter();
  const { t, c } = useT();
  const ref = useRef<HTMLAnchorElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setShown(true);
        io.disconnect();
      }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // tilt + glare: write the pointer position to CSS vars (no re-render per move)
  const onMove = (e: PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const b = el.getBoundingClientRect();
    const px = (e.clientX - b.left) / b.width, py = (e.clientY - b.top) / b.height;
    el.style.setProperty("--rx", `${(0.5 - py) * 7}deg`);
    el.style.setProperty("--ry", `${(px - 0.5) * 9}deg`);
    el.style.setProperty("--mx", `${px * 100}%`);
    el.style.setProperty("--my", `${py * 100}%`);
  };
  const onLeave = () => {
    const el = ref.current;
    if (el) for (const v of ["--rx", "--ry"]) el.style.setProperty(v, "0deg");
    setHover(null);
  };

  const chips = [
    `3D · ${m.eras > 2 ? c({ az: `${m.eras} dövr`, en: `${m.eras} eras` }) : c({ az: "iki dövr", en: "two eras" })}`,
    ...(m.walk ? [t("walkInside")] : []),
    t("talkArchitect"),
  ];

  return (
    <Link ref={ref} href={`/m/${m.slug}`} data-shown={shown} data-active={active}
      aria-hidden={copy || undefined} tabIndex={copy ? -1 : undefined}
      style={{ ["--delay" as string]: `${index * 90}ms` }}
      onPointerMove={onMove} onPointerEnter={() => setHover(m.slug)} onPointerLeave={onLeave}
      onFocus={() => setHover(m.slug)} onBlur={() => setHover(null)}
      onClick={(e) => {
        // plain click: name this card's photo first (sync), then navigate, so the photo grows into the page
        if (!onPick || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.defaultPrevented) return;
        e.preventDefault();
        flushSync(onPick);
        router.push(`/m/${m.slug}`);
      }}
      className="mcard group relative grid h-full grid-rows-[auto_1fr] overflow-hidden rounded-xl bg-surface text-ink no-underline">
      <ViewTransition name={morph ? `monument-${m.slug}` : undefined} share="morph" default="none">
      <div className="relative aspect-[16/10] overflow-hidden bg-stage">
        {m.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.cover} alt="" loading="lazy" className="mcard-img h-full w-full object-cover" />
        )}
        {/* bottom shade so the badge and credit stay legible on bright photos */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />
        <span className="glass mcard-badge absolute top-2.5 left-2.5 rounded-md px-2 py-1 font-mono text-[11px] tracking-wide">{c(m.period)}</span>
      </div>
      </ViewTransition>
      <div className="grid content-start gap-1 p-4">
        <div className="eyebrow">{c(m.place)}</div>
        <h3 className="m-0 font-display text-[22px] leading-tight font-bold">{c(m.name)}</h3>
        <p className="m-0 text-[14px] text-muted">{c(m.tagline)}</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[12px] font-semibold">
          {chips.map((label, i) => (
            <span key={label} className="mcard-chip grad-stroke on-surface rounded-full border px-2 py-0.5" style={{ ["--i" as string]: i }}>{label}</span>
          ))}
        </div>
      </div>
      {/* glare that follows the pointer */}
      <div className="mcard-glare pointer-events-none absolute inset-0" aria-hidden="true" />
    </Link>
  );
}
