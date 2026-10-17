/* Screenshot a walk zone from a chosen heading — for visual review.
   usage: BASE=http://localhost:3100 npx tsx scripts/shot.ts <slug> <zone> [yawDeg] [pitch] [x,z] */
import { chromium } from "playwright";

const [slug, zone, yaw, pitch, at] = process.argv.slice(2);
const BASE = process.env.BASE ?? "http://localhost:3000";

async function main() {
  const b = await chromium.launch({ args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto(`${BASE}/m/${slug}/walk`, { waitUntil: "networkidle" });
  await p.waitForFunction(() => !!(window as unknown as { __walk?: unknown }).__walk);
  await p.getByRole("button", { name: /Gəzintiyə başla|Start the walk/ }).click();
  await p.evaluate(({ zone, yaw, pitch, at }) => {
    type Z = { id: string; poly?: [number, number][]; circle?: number[]; ring?: number[]; y: number };
    const w = (window as unknown as { __walk: { walker: { teleport(x: number, z: number, f: number, y?: number, p?: number): void }; map: { zones: Z[] } } }).__walk;
    const z = w.map.zones.find((q) => q.id === zone)!;
    let cx: number, cz: number;
    if (at) [cx, cz] = at.split(",").map(Number);
    else if (z.circle) [cx, cz] = z.circle;
    else if (z.ring) { cx = z.ring[0] + (z.ring[2] + z.ring[3]) / 2; cz = z.ring[1]; }
    else { cx = z.poly!.reduce((a, p) => a + p[0], 0) / z.poly!.length; cz = z.poly!.reduce((a, p) => a + p[1], 0) / z.poly!.length; }
    w.walker.teleport(cx, cz, z.y, yaw ? Number(yaw) : undefined, pitch ? Number(pitch) : undefined);
  }, { zone, yaw, pitch, at });
  // hide UI chrome for a clean view
  await p.addStyleTag({ content: "section[aria-label], figure, nav, .glass, canvas[aria-hidden] { display: none !important }" });
  await p.waitForTimeout(1500);
  const file = `screenshots/shot-${slug}-${zone}${yaw ? "-" + yaw : ""}.png`;
  await p.screenshot({ path: file });
  console.log(file);
  await b.close();
}
main();
