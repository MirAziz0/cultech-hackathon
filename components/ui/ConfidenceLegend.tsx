"use client";
import { CONF_KEY, useT } from "@/lib/i18n";
import type { Confidence, Manifest } from "@/lib/types";

type Labels = Manifest["confLabels"];

export function ConfBadge({ conf, labels }: { conf: Confidence; labels?: Labels }) {
  const { t, c } = useT();
  return (
    <span className="inline-flex items-center gap-1.5 grad-stroke rounded-full border px-2.5 py-1 text-[12px] font-semibold">
      <span className={`dot ${conf}`} />
      {labels?.[conf] ? c(labels[conf]!.short) : t(CONF_KEY[conf])}
    </span>
  );
}

export function ConfidenceLegend({ labels }: { labels?: Labels }) {
  const { t, c } = useT();
  const rows: [Confidence, "confOkLong" | "confMidLong" | "confHypLong"][] = [["ok", "confOkLong"], ["mid", "confMidLong"], ["hyp", "confHypLong"]];
  return (
    <section className="panel">
      <h2 className="mb-2.5 font-az-serif text-[19px] font-bold">{t("reliability")}</h2>
      <ul className="grid gap-2">
        {rows.map(([k, long]) => (
          <li key={k} className="grid grid-cols-[10px_1fr] items-baseline gap-2.5 text-[14px]">
            <span className={`dot ${k} translate-y-px`} />
            <span>
              <b>{labels?.[k] ? c(labels[k]!.short) : t(CONF_KEY[k])}.</b> {labels?.[k] ? c(labels[k]!.long) : t(long)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
