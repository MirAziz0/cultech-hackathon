"use client";
import { createElement, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import type { Era, MonumentBundle } from "@/lib/types";

/** AR via <model-viewer> (WebXR / Android Scene Viewer / iOS Quick Look with auto USDZ).
   three.js stays the main renderer; model-viewer is loaded only when the user asks for AR. */
export function ArButton({ bundle, era }: { bundle: MonumentBundle; era: Era }) {
  const { t, c, lang } = useT();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const models = bundle.ar[era] ?? bundle.ar.past ?? bundle.ar.today;
  const model = models?.[lang] ?? models?.az;
  const src = model?.glb;
  const iosSrc = model?.usdz;
  const dlg = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    import("@google/model-viewer").then(() => setReady(true));
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);
  if (!src) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded border-0 bg-ink px-3 py-[9px] text-[13px] leading-none font-semibold text-bg">
        ⧉ {t("ar")}
      </button>
      {open && (
        <div ref={dlg} role="dialog" aria-modal="true" aria-label={t("ar")} className="fixed inset-0 z-50 grid place-items-center bg-[rgba(14,12,10,.85)] p-4">
          <div className="relative h-[min(80vh,640px)] w-[min(960px,100%)] overflow-hidden rounded-md bg-stage">
            {ready &&
              createElement(
                "model-viewer",
                {
                  src,
                  "ios-src": iosSrc,
                  alt: c(bundle.manifest.name),
                  ar: true,
                  "ar-modes": "webxr scene-viewer quick-look",
                  "ar-scale": "auto",
                  "camera-controls": true,
                  "auto-rotate": true,
                  "shadow-intensity": "1",
                  exposure: "1.1",
                  style: { width: "100%", height: "100%", background: "transparent" },
                },
                // Own AR button: big and clearly visible. model-viewer shows it only where AR is supported.
                createElement(
                  "button",
                  {
                    slot: "ar-button",
                    type: "button",
                    className: "absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border-0 bg-ink px-5 py-3 text-[15px] leading-none font-semibold text-bg shadow-lg",
                  },
                  `⧉ ${t("ar")}`,
                ),
              )}
            <button type="button" onClick={() => setOpen(false)} className="btn absolute top-3 right-3 z-10 bg-surface">✕ {t("arClose")}</button>
            {/* pointer-events-none so the hint never blocks taps on the model or the AR button */}
            <p className="pointer-events-none absolute top-14 right-3 left-3 rounded bg-surface/90 px-3 py-2 text-[12.5px]">
              {c({ az: "Telefonda aşağıdakı «AR-da bax» düyməsinə toxunun və maketi masanın üzərinə qoyun. Bu, təxmini bərpa maketidir.", en: "On a phone, tap “View in AR” below and place the model on a table. This is an approximate reconstruction." })}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
