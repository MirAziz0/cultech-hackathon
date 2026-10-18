"use client";
import { useEffect, useRef, useState } from "react";
import type { MonumentCard } from "./Home";
import { MonumentCardItem } from "./MonumentCardItem";

const DRIFT = 28; // px per second, right to left

/** full-width monument carousel: drifts slowly right to left in an endless loop (the list runs
    twice) and pauses under the mouse; the strip can be swiped with two fingers on a trackpad,
    dragged with the mouse or swiped on a touch screen */
export function MonumentCarousel({ monuments, hover, setHover }: {
  monuments: MonumentCard[];
  hover: string | null;
  setHover: (slug: string | null) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const state = useRef({ offset: 0, paused: false });
  // the card clicked last: only it carries the shared-element name (the list is rendered twice)
  const [morphFrom, setMorphFrom] = useState<number | null>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = state.current, half = track.scrollWidth / 2;
      if (!half) return;
      if (!s.paused && !still) s.offset += DRIFT * dt;
      // keep the offset inside one copy of the list
      s.offset = ((s.offset % half) + half) % half;
      track.style.transform = `translate3d(${-s.offset}px, 0, 0)`;
    };
    raf = requestAnimationFrame(tick);

    // two-finger trackpad swipe (horizontal wheel) or shift + wheel moves the strip directly;
    // plain vertical scrolling is left alone so the page still scrolls
    const viewport = viewportRef.current;
    const onWheel = (e: WheelEvent) => {
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (!dx) return;
      e.preventDefault();
      state.current.offset += dx * (e.deltaMode === 1 ? 16 : 1);
    };
    viewport?.addEventListener("wheel", onWheel, { passive: false });

    // drag with the mouse or swipe with a finger; a real drag swallows the click that follows it
    let drag: { id: number; x: number; start: number; moved: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, start: state.current.offset, moved: false };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 6) return;
      if (!drag.moved) {
        drag.moved = true;
        viewport?.setPointerCapture(e.pointerId);
        viewport?.classList.add("cursor-grabbing");
      }
      state.current.offset = drag.start - dx;
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved) {
        viewport?.classList.remove("cursor-grabbing");
        const swallow = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
        viewport?.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => viewport?.removeEventListener("click", swallow, { capture: true }), 0);
      }
      drag = null;
    };
    viewport?.addEventListener("pointerdown", onDown);
    viewport?.addEventListener("pointermove", onMove);
    viewport?.addEventListener("pointerup", onUp);
    viewport?.addEventListener("pointercancel", onUp);
    return () => {
      cancelAnimationFrame(raf);
      viewport?.removeEventListener("wheel", onWheel);
      viewport?.removeEventListener("pointerdown", onDown);
      viewport?.removeEventListener("pointermove", onMove);
      viewport?.removeEventListener("pointerup", onUp);
      viewport?.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return (
    <div className="relative" onPointerEnter={() => { state.current.paused = true; }} onPointerLeave={() => { state.current.paused = false; }}
      onFocus={() => { state.current.paused = true; }} onBlur={() => { state.current.paused = false; }}>
      {/* touch-action pan-y: vertical swipes still scroll the page, horizontal ones move the strip */}
      <div ref={viewportRef} onDragStart={(e) => e.preventDefault()} className="cursor-grab touch-pan-y overflow-hidden px-4 select-none [mask-image:linear-gradient(to_right,transparent,#000_4%,#000_96%,transparent)] [&_img]:pointer-events-none">
        <div ref={trackRef} className="flex w-max items-stretch py-8 will-change-transform">
          {[...monuments, ...monuments].map((m, i) => (
            <div key={`${m.slug}-${i}`} className="flex w-[min(340px,78vw)] shrink-0 pr-5">
              <MonumentCardItem m={m} index={i % monuments.length} active={hover === m.slug} setHover={setHover} copy={i >= monuments.length}
                morph={morphFrom === i} onPick={() => setMorphFrom(i)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
