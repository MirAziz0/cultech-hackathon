import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBundle, listSlugs } from "@/lib/content";
import { MonumentView } from "@/components/monument/MonumentView";

export function generateStaticParams() {
  return listSlugs().map((slug) => ({ slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/m/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const m = getBundle(slug).manifest;
  return { title: m.name.az, description: `${m.name.az} — ${m.tagline.az}. ${m.location.place.az}` };
}

export default async function Page({ params }: PageProps<"/m/[slug]">) {
  const { slug } = await params;
  if (!listSlugs().includes(slug)) notFound();
  return <MonumentView bundle={getBundle(slug)} />;
}
