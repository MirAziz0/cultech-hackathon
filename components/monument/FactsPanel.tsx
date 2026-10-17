"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import type { Fact } from "@/lib/types";

export function FactChip({ fact, onClick }: { fact: Fact; onClick?: () => void }) {
  const { t } = useT();
  const src = fact.sources[0];
  return (
    <a
      href={src?.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      title={src?.title}
      className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-[11.5px] font-semibold text-ink no-underline hover:border-accent"
    >
      <span className={`dot ${fact.conf} h-[7px]! w-[7px]!`} />
      {t("source")}: {src?.title.replace(/^Wikipedia: /, "Wikipedia · ") ?? fact.id}
    </a>
  );
}

export function FactsPanel({ facts }: { facts: Fact[] }) {
  const { t, c } = useT();
  const [open, setOpen] = useState(false);
  const shown = open ? facts : facts.slice(0, 4);
  if (!facts.length) return null;
  return (
    <section className="panel">
      <h2 className="mb-2.5 font-display text-[19px] font-bold">{t("facts")}</h2>
      <ul className="grid gap-3">
        {shown.map((f) => (
          <li key={f.id} className="grid gap-1.5 text-[14px]">
            <span>
              {c(f.text)}
              {f.verify && <span className="ml-1 whitespace-nowrap rounded bg-mid/15 px-1 text-[11px] font-semibold text-mid">{t("needsCheck")}</span>}
            </span>
            <span className="flex flex-wrap gap-1.5">
              {f.sources.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-accent underline decoration-dotted">
                  {s.title} ↗
                </a>
              ))}
            </span>
          </li>
        ))}
      </ul>
      {facts.length > 4 && (
        <button type="button" className="btn mt-3" onClick={() => setOpen(!open)}>
          {open ? "−" : `+${facts.length - 4}`}
        </button>
      )}
    </section>
  );
}
