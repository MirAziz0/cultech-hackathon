"use client";
import { useT } from "@/lib/i18n";
import { GlossaryText } from "@/components/ui/GlossaryText";
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

/** how many facts the panel shows (the list follows the selected building, so it changes as you explore) */
const MAX_FACTS = 6;

/** a short, compact list of the key facts with their sources; two columns once the panel is wide enough */
export function FactsPanel({ facts }: { facts: Fact[] }) {
  const { t, c } = useT();
  if (!facts.length) return null;
  return (
    <section className="panel">
      <h2 className="mb-2.5 font-az-serif text-[19px] font-bold">{t("facts")}</h2>
      <ul className="grid gap-x-6 gap-y-2.5 md:grid-cols-2">
        {facts.slice(0, MAX_FACTS).map((f) => (
          <li key={f.id} className="grid gap-1 text-[13px] leading-snug">
            <span>
              <GlossaryText text={c(f.text)} />
              {f.verify && <span className="ml-1 whitespace-nowrap rounded bg-mid/15 px-1 text-[11px] font-semibold text-mid">{t("needsCheck")}</span>}
            </span>
            <span className="flex flex-wrap gap-1.5">
              {f.sources.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="text-[11.5px] text-accent underline decoration-dotted">
                  {s.title} ↗
                </a>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
