"use client";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { LangToggle } from "./LangToggle";

/** `overlay`: floats transparently over the home hero (white wordmark on the hero's dark scrim) */
export function SiteHeader({ back, overlay }: { back?: boolean; overlay?: boolean }) {
  const { t } = useT();
  return (
    <header className={`mx-auto flex w-full max-w-[1180px] items-center justify-between gap-3 px-4 pt-[max(14px,env(safe-area-inset-top))] pb-2 ${overlay ? "absolute inset-x-0 top-0 z-20" : ""}`}>
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/" className={`flex items-center gap-2.5 font-brand text-[22px] font-bold no-underline sm:text-[26px] ${overlay ? "text-white" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/logo-mark.png" alt="" width={48} height={48} className="h-11 w-11 sm:h-12 sm:w-12" />
          <span className="whitespace-nowrap">ZamanQapısı</span>
        </Link>
        {back && (
          <Link href="/#monuments" className="hidden text-[13px] font-semibold text-muted no-underline hover:text-ink sm:inline">
            {t("home")}
          </Link>
        )}
      </div>
      <LangToggle />
    </header>
  );
}
