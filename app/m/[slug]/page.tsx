import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBundle, listSlugs } from "@/lib/content";
import { MonumentView } from "@/components/monument/MonumentView";
import type { MonumentBundle, WalkSpec } from "@/lib/types";

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
  return <MonumentView bundle={pageBundle(slug)} />;
}

/** the monument page only needs the walk's labels, eras and zone texts: not its geometry, tour stories or the
   lip-sync timelines of the narration (the 2D architect follows the audio's loudness instead). Sending the
   whole bundle made the page ~1 MB of HTML, and the home page prefetches it. */
function pageBundle(slug: string): MonumentBundle {
  const b = getBundle(slug);
  const w = b.manifest.walk;
  const walk = w && ({ ...w, elements: [], zones: [], obstacles: undefined, tour: undefined, testRoute: undefined, testShots: undefined } satisfies WalkSpec);
  const narration = Object.fromEntries(Object.entries(b.narration).map(([k, n]) => [k, { ...n, visemes: undefined }]));
  return { ...b, stories: {}, narration, manifest: { ...b.manifest, walk } };
}
