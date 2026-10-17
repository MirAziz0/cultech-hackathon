import { listMonuments } from "@/lib/content";
import { Home, type MonumentCard } from "@/components/home/Home";

export default function Page() {
  const monuments: MonumentCard[] = listMonuments().map((m) => ({
    slug: m.slug,
    name: m.name,
    tagline: m.tagline,
    period: m.period,
    place: m.location.place,
    lat: m.location.lat,
    lon: m.location.lon,
    cover: m.coverUrl,
    coverCredit: m.coverPhoto ? `© ${m.coverPhoto.author} · ${m.coverPhoto.license}` : undefined,
    walk: !!m.walk,
    eras: Object.keys(m.eras).length,
  }));
  return <Home monuments={monuments} />;
}
