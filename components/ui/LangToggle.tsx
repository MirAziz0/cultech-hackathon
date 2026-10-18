"use client";
import { useLang } from "@/lib/i18n";

export function LangToggle({ dark = false }: { dark?: boolean }) {
  const { lang, setLang } = useLang();
  return (
    <div
      role="group"
      aria-label="Language / Dil"
      className={`inline-flex rounded-full border p-[3px] text-[12px] font-semibold ${dark ? "border-white/25 bg-black/40 text-white" : "grad-stroke on-surface"}`}
    >
      {(["az", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={`min-w-9 rounded-full px-2.5 py-1.5 uppercase ${lang === l ? "bg-accent text-accent-ink" : ""}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
