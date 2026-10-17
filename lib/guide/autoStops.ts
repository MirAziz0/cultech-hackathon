/* Stops for walks without a hand-made walk.tour: one per described zone (zoneInfo order).
   The guide stands on the roomiest spot of the zone; no pointing target. */
import type { TourStop, WalkSpec } from "../types";
import type { NavGrid } from "./nav";

export function autoStops(spec: WalkSpec, nav: NavGrid): TourStop[] {
  const out: TourStop[] = [];
  for (const [id, info] of Object.entries(spec.zoneInfo)) {
    let best = -1, bs = -Infinity;
    for (let n = 0; n < nav.count; n++) {
      if (nav.zoneId(n) !== id) continue;
      const s = nav.clear[n];
      if (s > bs) { bs = s; best = n; }
    }
    if (best < 0) continue;
    const p = nav.pos(best);
    out.push({ id, zone: id, title: info.title, stand: [p.x, p.y, p.z], auto: true });
  }
  return out;
}
