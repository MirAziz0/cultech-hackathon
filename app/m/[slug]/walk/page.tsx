import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBundle, listSlugs } from "@/lib/content";
import { WalkView } from "@/components/walk/WalkView";

export function generateStaticParams() {
  return listSlugs()
    .filter((slug) => !!getBundle(slug).manifest.walk)
    .map((slug) => ({ slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/m/[slug]/walk">): Promise<Metadata> {
  const { slug } = await params;
  const m = getBundle(slug).manifest;
  return { title: m.walk?.title.az ?? m.name.az };
}

export default async function Page({ params }: PageProps<"/m/[slug]/walk">) {
  const { slug } = await params;
  if (!listSlugs().includes(slug)) notFound();
  const bundle = getBundle(slug);
  if (!bundle.manifest.walk) notFound();
  return <WalkView bundle={bundle} />;
}
