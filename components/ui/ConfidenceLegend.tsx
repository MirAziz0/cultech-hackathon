"use client";
import { CONF_KEY, useT } from "@/lib/i18n";
import type { Confidence } from "@/lib/types";

export function ConfBadge({ conf }: { conf: Confidence }) {
  const { t } = useT();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12px] font-semibold">
      <span className={`dot ${conf}`} />
      {t(CONF_KEY[conf])}
    </span>
  );
}

export function ConfidenceLegend() {
  const { t } = useT();
  const rows: [Confidence, "confOkLong" | "confMidLong" | "confHypLong"][] = [["ok", "confOkLong"], ["mid", "confMidLong"], ["hyp", "confHypLong"]];
  return (
    <section className="panel">
      <h2 className="mb-2.5 font-display text-[19px] font-bold">{t("reliability")}</h2>
      <ul className="grid gap-2">
        {rows.map(([c, long]) => (
          <li key={c} className="grid grid-cols-[10px_1fr] items-baseline gap-2.5 text-[14px]">
            <span className={`dot ${c} translate-y-px`} />
            <span>
              <b>{t(CONF_KEY[c])}.</b> {t(long)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
