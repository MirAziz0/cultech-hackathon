"use client";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import type { L } from "@/lib/types";

/** simple site footer: brand, the monuments, data credits */
export function SiteFooter({ monuments }: { monuments: { slug: string; name: L; coverCredit?: string }[] }) {
  const { c } = useT();
  return (
    // everything in the footer is set in Inter except the ZamanQapısı wordmark
    <footer className="mt-20 bg-surface font-sans">
      {/* brand gradient hairline */}
      <div className="h-[2px] bg-[image:var(--accent-2)]" aria-hidden="true" />
      <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div className="grid content-start gap-3">
          <Link href="/" className="flex items-center gap-2.5 font-brand text-[22px] font-bold text-ink no-underline">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/logo-mark.png" alt="" width={40} height={40} />
            ZamanQapısı
          </Link>
          <p className="m-0 max-w-[40ch] text-[14px] leading-relaxed text-muted">
            {c({
              az: "Azərbaycan memarlıq irsinə virtual zaman səyahəti: 3D bərpa, içəridə gəzinti və danışan memar.",
              en: "A virtual journey through Azerbaijan's architectural heritage: 3D reconstructions, walk-throughs and a talking architect.",
            })}
          </p>
        </div>

        <nav aria-label={c({ az: "Abidələr", en: "Monuments" })} className="grid content-start gap-3">
          <h2 className="m-0 font-sans text-[15px] font-semibold text-ink">{c({ az: "Abidələr", en: "Monuments" })}</h2>
          <ul className="m-0 grid list-none gap-2 p-0">
            {monuments.map((m) => (
              <li key={m.slug}>
                <Link href={`/m/${m.slug}`} className="text-[14px] text-muted no-underline hover:text-accent">{c(m.name)}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="grid content-start gap-3">
          <h2 className="m-0 font-sans text-[15px] font-semibold text-ink">{c({ az: "Mənbələr", en: "Sources" })}</h2>
          <ul className="m-0 grid list-none gap-2 p-0 text-[14px] text-muted">
            <li>{c({ az: "Relyef", en: "Terrain" })}: AWS Terrain Tiles</li>
            <li>{c({ az: "Sərhədlər", en: "Borders" })}: Natural Earth · geoBoundaries (CC BY-SA 3.0)</li>
          </ul>
          {/* the card photos carry no credit on the image, so their (CC BY-SA) attribution lives here */}
          <h3 className="m-0 mt-2 text-[14px] font-semibold text-ink">{c({ az: "Fotolar", en: "Photos" })}</h3>
          <ul className="m-0 grid list-none gap-1.5 p-0 text-[13px] text-muted">
            {monuments.filter((m) => m.coverCredit).map((m) => (
              <li key={m.slug}>{c(m.name)}: {m.coverCredit}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto m-0 max-w-[1180px] px-4 py-5 text-[13px] text-muted">
          © {new Date().getFullYear()} ZamanQapısı · {c({ az: "3D modellər mənbələrə əsaslanan təxmini bərpadır.", en: "3D models are source-based approximate reconstructions." })}
        </p>
      </div>
    </footer>
  );
}
