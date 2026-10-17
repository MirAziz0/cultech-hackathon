/* Client-safe helpers over a MonumentBundle. */
import type { Fact, MonumentBundle } from "./types";
import type { PhotoWithUrl } from "@/components/photos/Lightbox";

export function photoUrl(b: MonumentBundle, file: string) {
  return `${b.base}/photos/${file}`;
}

export function photos(b: MonumentBundle, ids?: string[]): PhotoWithUrl[] {
  const all = b.photos.map((p) => ({ ...p, url: photoUrl(b, p.file) }));
  if (!ids) return all;
  return ids.map((id) => all.find((p) => p.id === id)).filter((p): p is PhotoWithUrl => !!p);
}

export function factsFor(b: MonumentBundle, ids?: string[]): Fact[] {
  if (!ids) return b.facts;
  return ids.map((id) => b.facts.find((f) => f.id === id)).filter((f): f is Fact => !!f);
}

export function narrationAudioUrl(b: MonumentBundle, file?: string) {
  return file ? `${b.base}/narration/${file}` : undefined;
}
