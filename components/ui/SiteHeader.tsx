"use client";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { LangToggle } from "./LangToggle";

export function SiteHeader({ back }: { back?: boolean }) {
  const { t } = useT();
  return (
    <header className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-3 px-4 pt-[max(14px,env(safe-area-inset-top))] pb-2">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/" className="flex items-center gap-2 font-display text-[18px] font-bold no-underline">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon.svg" alt="" width={28} height={28} className="rounded-md" />
          <span className="whitespace-nowrap">ZamanQapısı <em className="font-medium text-accent">AI</em></span>
        </Link>
        {back && (
          <Link href="/" className="hidden text-[13px] font-semibold text-muted no-underline hover:text-ink sm:inline">
            {t("home")}
          </Link>
        )}
      </div>
      <LangToggle />
    </header>
  );
}
