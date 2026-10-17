/* Browser test for the 3D guide (Playwright). Against a running server.
   Phases: greet → walk in with real key presses → climb the spiral stair (Maiden Tower) or walk a
   zone route → level jump. Checks the guide stays 1–4 m away on the visitor's level, never inside a
   wall (his position must be walkable), and isn't parked in the middle of the view. Screenshots
   look toward the guide.
   usage: BASE=http://localhost:3000 npx tsx scripts/test-guide.ts [slug ...] [--phone] */
import fs from "node:fs";
import path from "node:path";
import { chromium, devices, type Page } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = path.join(process.cwd(), "screenshots");
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const phone = args.includes("--phone");
const ROOT = path.join(process.cwd(), "content", "monuments");
const slugs = args.filter((a) => !a.startsWith("--"));
const all = slugs.length ? slugs : fs.readdirSync(ROOT).filter((d) => fs.existsSync(path.join(ROOT, d, "manifest.json")));

let failures = 0;
const fail = (m: string) => { failures++; console.error("  ✗", m); };
const ok = (m: string) => console.log("  ✓", m);

type St = { gx: number; gy: number; gz: number; mode: string; moving: boolean; x: number; z: number; floor: number; yaw: number; walkable: boolean; dist: number; tris: number; nodes: number; inView: boolean; fps: number };

async function state(p: Page): Promise<St> {
  return p.evaluate(() => {
    type Any = { [k: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const g = (window as unknown as Any).__guide, w = (window as unknown as Any).__walk;
    const k = w.walker, hit = w.map.at(g.pos.x, g.pos.z, g.pos.y);
    const fx = -Math.sin(k.yaw), fz = -Math.cos(k.yaw), rx = g.pos.x - k.x, rz = g.pos.z - k.z;
    const along = rx * fx + rz * fz, lat = Math.abs(rx * fz - rz * fx);
    return {
      gx: g.pos.x, gy: g.pos.y, gz: g.pos.z, mode: g.mode, moving: g.moving, x: k.x, z: k.z, floor: k.floor, yaw: k.yaw,
      walkable: !!hit && Math.abs(hit.y - g.pos.y) < 0.3, dist: Math.hypot(g.pos.x - k.x, g.pos.z - k.z, (g.pos.y - k.floor) * 1.5),
      tris: g.avatar.tris, nodes: g.nav.count, inView: along > 0 && along < 3.5 && lat < 0.45 + along * 0.1, fps: w.fps,
    };
  });
}

/** turn the camera toward the guide and take a screenshot */
async function lookShot(p: Page, file: string) {
  await p.evaluate(() => {
    type Any = { [k: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const g = (window as unknown as Any).__guide, k = (window as unknown as Any).__walk.walker;
    const dx = g.pos.x - k.x, dz = g.pos.z - k.z;
    k.yaw = Math.atan2(-dx, -dz) + 0.25;
    k.pitch = Math.atan2(g.pos.y + 1.1 - (k.floor + 1.62), Math.hypot(dx, dz));
  });
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(OUT, file) });
}

async function check(p: Page, label: string, opts: { min?: number; max?: number } = {}) {
  // give him up to 8 s to settle; never settling counts as a failure (jitter)
  let s = await state(p);
  for (let t = 0; t < 16 && s.moving; t++) { await p.waitForTimeout(500); s = await state(p); }
  if (s.moving) fail(`${label}: guide still moving after 8 s`);
  const where = `guide (${s.gx.toFixed(1)}, ${s.gy.toFixed(1)}, ${s.gz.toFixed(1)}) visitor (${s.x.toFixed(1)}, ${s.floor.toFixed(1)}, ${s.z.toFixed(1)}) d=${s.dist.toFixed(1)} ${s.mode}${s.moving ? " moving" : ""}`;
  if (!s.walkable) fail(`${label}: guide not on walkable floor — ${where}`);
  else if (s.dist > (opts.max ?? 4.5) || s.dist < (opts.min ?? 0.7)) fail(`${label}: distance — ${where}`);
  else if (s.inView && !s.moving) fail(`${label}: parked in the middle of the view — ${where}`);
  else ok(`${label}: ${where}`);
  return s;
}


/** guided tour: the visitor follows the guide; each stop must be reached and presented */
async function tourTest(p: Page, tag: string, stopsToCheck: number) {
  const n = await p.evaluate(() => { const t = (window as unknown as { __tour?: { stops: unknown[]; start(i?: number): void } }).__tour; if (!t) return 0; t.start(0); return t.stops.length; });
  if (!n) { fail("no tour"); return; }
  ok(`tour with ${n} stops`);
  for (let k = 0; k < Math.min(n, stopsToCheck); k++) {
    let phase = "";
    for (let t = 0; t < 70; t++) {
      phase = await p.evaluate(() => {
        type Any = { [k: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
        const g = (window as unknown as Any).__guide, tr = (window as unknown as Any).__tour, w = (window as unknown as Any).__walk, k = w.walker;
        // visitor follows: stand ~2 m from the guide on the way back toward the visitor
        const dx = k.x - g.pos.x, dz = k.z - g.pos.z, L = Math.hypot(dx, dz) || 1;
        if (L > 2.4 || Math.abs(k.floor - g.pos.y) > 0.6) {
          const nn = g.nav.nearest({ x: g.pos.x + (dx / L) * 2, y: g.pos.y, z: g.pos.z + (dz / L) * 2 }, 1.5, 0, 0.6);
          const q = nn >= 0 ? g.nav.pos(nn) : g.pos;
          k.teleport(q.x, q.z, q.y);
        }
        return tr.phase;
      });
      if (phase === "telling") break;
      await p.waitForTimeout(300);
    }
    const st = await p.evaluate(() => {
      type Any = { [k: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
      const g = (window as unknown as Any).__guide, tr = (window as unknown as Any).__tour, s = tr.current;
      return { id: s?.id, d: Math.hypot(g.pos.x - s.stand[0], g.pos.z - s.stand[2], g.pos.y - s.stand[1]) };
    });
    if (phase !== "telling") { fail(`stop ${k + 1} (${st.id}): never started telling (phase ${phase})`); return; }
    st.d < 0.6 ? ok(`stop ${k + 1} ${st.id}: presenting at its spot (${st.d.toFixed(2)} m)`) : fail(`stop ${st.id}: guide ${st.d.toFixed(2)} m from his spot`);
    await p.waitForTimeout(2500);
    const sub = await p.locator("p.font-display").first().textContent().catch(() => null);
    sub ? ok(`subtitle: “${sub.slice(0, 60)}…”`) : fail(`stop ${st.id}: no subtitle`);
    await lookShot(p, `tour-${tag}-${k + 1}-${st.id}.png`);
    await p.evaluate(() => { const tr = (window as unknown as { __tour: { storyEnded(): void } }).__tour; tr.storyEnded(); });
  }
}

async function run(browser: import("playwright").Browser, slug: string) {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, slug, "manifest.json"), "utf8"));
  if (!m.walk) return;
  console.log(`\n▶ ${slug}${phone ? " (phone)" : ""}`);
  const ctx = phone ? await browser.newContext({ ...devices["iPhone 13"] }) : await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  // tsx keeps function names with a __name() helper that doesn't exist in the page
  await p.addInitScript(() => { (globalThis as unknown as { __name: (f: unknown) => unknown }).__name = (f) => f; });
  const errs: string[] = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (msg) => { if (msg.type() === "error" && !/favicon|Failed to load resource/.test(msg.text())) errs.push(msg.text()); });
  await p.goto(`${BASE}/m/${slug}/walk`, { waitUntil: "networkidle" });
  await p.waitForFunction(() => !!(window as unknown as { __guide?: unknown }).__guide, null, { timeout: 60000 });
  const start = p.getByRole("button", { name: /Gəzintiyə başla|Start the walk/ });
  if (phone) await start.tap(); else await start.click();
  await p.waitForTimeout(1500);
  const tag = `${slug}${phone ? "-phone" : ""}`;
  const s0 = await check(p, "greet", { max: 3.5 });
  console.log(`  · body ${s0.tris} tris, nav ${s0.nodes} nodes`);
  s0.tris <= 20000 ? ok(`triangles ${s0.tris} ≤ 20k`) : fail(`too many triangles: ${s0.tris}`);
  await p.screenshot({ path: path.join(OUT, `guide-${tag}-greet.png`) });

  // walk the scripted route with real keys (same as test-walk)
  if (!phone) {
    await p.locator("canvas").first().click({ position: { x: 640, y: 400 } });
    for (const step of m.walk.testRoute ?? []) {
      await p.keyboard.down(step.key); await p.waitForTimeout(step.ms); await p.keyboard.up(step.key);
    }
    await p.waitForTimeout(3500);
    await check(p, "after scripted walk");
    await lookShot(p, `guide-${tag}-route.png`);
  }

  if (slug === "maiden-tower") {
    // climb the in-wall stair from the ground floor to the 2nd storey, 2 m/s
    await p.evaluate(async () => {
      type Any = { [k: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
      const w = (window as unknown as Any).__walk, k = w.walker;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const go = async (x: number, z: number) => { const h = w.map.at(x, z, k.floor); if (h) k.teleport(x, z, h.y, (Math.atan2(-(x - k.x), -(z - k.z)) * 180) / Math.PI); await sleep(100); };
      for (let r = 2.2; r <= 5.1; r += 0.2) await go(r * Math.cos((75 * Math.PI) / 180), r * Math.sin((75 * Math.PI) / 180));
      for (let a = 75; a <= 255; a += 2.8) await go(5.1 * Math.cos((a * Math.PI) / 180), 5.1 * Math.sin((a * Math.PI) / 180));
      for (let r = 5.1; r >= 2.0; r -= 0.2) await go(r * Math.cos((255 * Math.PI) / 180), r * Math.sin((255 * Math.PI) / 180));
    });
    await p.waitForTimeout(4000);
    const s = await check(p, "climbed to storey 2");
    if (Math.abs(s.gy - s.floor) > 0.5) fail(`guide on another level (${s.gy.toFixed(1)} vs ${s.floor.toFixed(1)})`);
    await lookShot(p, `guide-${tag}-storey2.png`);
  } else {
    // walk through each testShot zone by teleport, the guide must catch up
    for (const id of (m.walk.testShots ?? []).slice(0, 3)) {
      await p.evaluate((id) => {
        type Any = { [k: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
        const w = (window as unknown as Any).__walk;
        const z = w.map.zones.find((q: Any) => q.id === id);
        let cx: number, cz: number;
        if (z.circle) [cx, cz] = z.circle; else if (z.ring) { cx = z.ring[0] + (z.ring[2] + z.ring[3]) / 2; cz = z.ring[1]; } else { cx = z.poly.reduce((a: number, q: number[]) => a + q[0], 0) / z.poly.length; cz = z.poly.reduce((a: number, q: number[]) => a + q[1], 0) / z.poly.length; }
        w.walker.teleport(cx, cz, z.y);
      }, id);
      await p.waitForTimeout(5000);
      await check(p, `zone ${id}`);
      await lookShot(p, `guide-${tag}-${id}.png`);
    }
  }
  // level jump button (stacked floors): guide re-appears near the visitor
  const lv = m.walk.map.levels?.at(-1);
  if (lv) {
    await p.evaluate((lv) => (window as unknown as { __walk: { walker: { teleport(x: number, z: number, f: number, yaw?: number): void } } }).__walk.walker.teleport(lv.at[0], lv.at[1], lv.y, lv.yaw), lv);
    await p.waitForTimeout(4500);
    await check(p, `jump to ${lv.name.en}`);
    await lookShot(p, `guide-${tag}-jump.png`);
  }
  if (!phone) await tourTest(p, tag, slug === "maiden-tower" ? 6 : 2);
  const fps = (await state(p)).fps;
  console.log(`  · fps ${fps.toFixed(0)}`);
  errs.length ? fail(`console errors: ${errs.slice(0, 3).join(" | ")}`) : ok("no console errors");
  await ctx.close();
}

async function main() {
  const browser = await chromium.launch({ args: process.env.SOFTWARE_GL ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] });
  for (const s of all) await run(browser, s);
  await browser.close();
  console.log(failures ? `\n${failures} failure(s)` : "\nall guide checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
