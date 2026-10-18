"use client";
import { Fragment, useId } from "react";
import { GLOSSARY_RE, termForStem, type Term } from "@/lib/glossary";
import { useT } from "@/lib/i18n";

/** a term with a dotted underline; hovering or focusing it shows a short explanation */
function TermTip({ term, children }: { term: Term; children: string }) {
  const { c } = useT();
  const id = useId();
  return (
    <span tabIndex={0} aria-describedby={id}
      className="group/term relative cursor-help underline decoration-accent decoration-dotted underline-offset-[3px] outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-accent">
      {children}
      <span id={id} role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-30 w-[min(260px,70vw)] -translate-x-1/2 translate-y-1 rounded-lg bg-ink px-3 py-2 text-left text-[12.5px] leading-snug font-normal text-white no-underline opacity-0 shadow-[0_8px_24px_rgba(0,0,0,.25)] transition-[opacity,transform] duration-150 group-hover/term:translate-y-0 group-hover/term:opacity-100 group-focus-visible/term:translate-y-0 group-focus-visible/term:opacity-100">
        <b className="mb-0.5 block font-az-serif text-[14px]">{c(term.term)}</b>
        {c(term.def)}
        {/* little pointer under the bubble */}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-ink" />
      </span>
    </span>
  );
}

/** renders text with glossary terms explained on hover (each term once per block, so it stays calm) */
export function GlossaryText({ text }: { text: string }) {
  const parts: (string | { term: Term; word: string })[] = [];
  const seen = new Set<string>();
  let last = 0;
  for (const m of text.matchAll(GLOSSARY_RE)) {
    const term = termForStem(m[1] ?? m[2]);
    if (!term || seen.has(term.id)) continue;
    seen.add(term.id);
    parts.push(text.slice(last, m.index), { term, word: m[0] });
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? <Fragment key={i}>{p}</Fragment> : <TermTip key={i} term={p.term}>{p.word}</TermTip>,
      )}
    </>
  );
}
