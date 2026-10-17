/* Era helpers shared by the exterior viewer, walk mode and build scripts.
   Two-era monuments use "past"/"today"; others list their own ids in manifest.eras. */
import type { Building, Era, L, Manifest, WalkSpec, ZoneInfo } from "./types";

/** era ids in toggle order */
export function eraList(m: Pick<Manifest, "eras" | "eraOrder">): Era[] {
  if (m.eraOrder?.length) return m.eraOrder;
  const keys = Object.keys(m.eras);
  if (keys.length === 2 && keys.includes("past") && keys.includes("today")) return ["today", "past"];
  return keys;
}

export function defaultEra(m: Pick<Manifest, "eras" | "eraOrder" | "defaultEra">): Era {
  return m.defaultEra ?? (m.eras.past ? "past" : eraList(m)[0]);
}

export function buildingVisible(b: Building, era: Era) {
  if (b.eras) return b.eras.includes(era);
  return !(b.pastOnly && era !== "past") && !(b.todayOnly && era !== "today");
}

export function buildingText(b: Building, era: Era): L | undefined {
  return b.byEra?.[era] ?? b.text ?? (era === "past" ? b.past : era === "today" ? b.today : undefined);
}

/** zone card info merged with its era override */
export function zoneInfoFor(spec: WalkSpec | undefined, id: string, era?: Era): ZoneInfo | null {
  const z = spec?.zoneInfo[id];
  if (!z) return null;
  const o = era ? z.byEra?.[era] : undefined;
  return o ? { ...z, ...o } : z;
}
