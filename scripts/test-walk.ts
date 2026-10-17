/* Browser smoke test (Playwright + Chromium) against a running server.
   - every page loads without console errors, screenshots desktop + phone
   - walk mode: real key presses walk from the courtyard up the portal ramp into the first interior
     zone; every zone in the manifest is reachable by teleport and reports the right floor height
   usage: BASE=http://localhost:3000 npx tsx scripts/test-walk.ts [slug ...] */
import fs from "node:fs";
import path from "node:path";
import { chromium, devices, type Page } from "playwright";
import { eraList } from "../lib/eras";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = path.join(process.cwd(), "screenshots");
fs.mkdirSync(OUT, { recursive: true });
const ROOT = path.join(process.cwd(), "content", "monuments");
const slugs = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(ROOT).filter((d) => fs.existsSync(path.join(ROOT, d, "manifest.json")));

let failures = 0;
const fail = (msg: string) => { failures++; console.error("  ✗", msg); };
const ok = (msg: string) => console.log("  ✓", msg);

function watch(page: Page, label: string) {
  const errs: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource.*(404|204)/.test(m.text())) errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push(String(e)));
  return () => { if (errs.length) fail(`${label}: ${errs.length} console error(s): ${errs.slice(0, 3).join(" | ")}`); else ok(`${label}: no console errors`); };
}

type W = { walker: { x: number; z: number; y: number; floor: number; yaw: number; zone: { id: string } | null; teleport(x: number, z: number, f: number, yaw?: number): void }; map: { at(x: number, z: number, near: number): { zone: { id: string }; y: number } | null; zones: { id: string; poly?: [number, number][]; circle?: number[]; ring?: number[]; y: number }[] }; fps: number; world: { stats: { meshes: number; tris: number; lamps: number } }; renderer: { info: { render: { calls: number } } } };

async function main() {
  // real GPU via ANGLE/D3D11 (Windows); set SOFTWARE_GL=1 on machines without one (movement checks then run slow)
  const browser = await chromium.launch({ args: process.env.SOFTWARE_GL ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"] });
  // ---------- home ----------
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const done = watch(page, "home");
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(OUT, "home.png"), fullPage: true });
    const pins = await page.locator("svg a").count();
    pins >= slugs.length ? ok(`home: ${pins} map pins`) : fail(`home: expected ${slugs.length} pins, got ${pins}`);
    done();
    await page.close();
  }
  for (const slug of slugs) {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, slug, "manifest.json"), "utf8"));
    console.log(`\n▶ ${slug}`);
    // ---------- exterior ----------
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
      const done = watch(page, `${slug} exterior`);
      await page.goto(`${BASE}/m/${slug}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, `${slug}-exterior.png`) });
      const labels = await page.locator('button[aria-label]').filter({ has: page.locator("span") }).count();
      labels > 0 ? ok(`exterior labels: ${labels}`) : fail("no building labels");
      // era toggle
      // era toggle: every era of the monument (the switch animates a time sweep, so wait for it)
      for (const e of eraList(manifest)) {
        await page.getByRole("group", { name: /Dövr|Era/ }).getByRole("button", { name: manifest.eras[e].label.az, exact: true }).click();
        await page.waitForTimeout(1900);
        await page.screenshot({ path: path.join(OUT, `${slug}-exterior-${e}.png`) });
      }
      ok(`era toggle: ${eraList(manifest).join(", ")}`);
      // select first building with an interior and look inside
      const withInterior = manifest.buildings.find((b: { interior?: string }) => b.interior);
      if (withInterior) {
        await page.locator("aside").getByRole("button", { name: withInterior.name.az }).click();
        await page.waitForTimeout(1200);
        await page.getByRole("button", { name: /İçərisinə bax|Look inside/ }).click();
        await page.waitForTimeout(1200);
        await page.screenshot({ path: path.join(OUT, `${slug}-interior-${withInterior.interior}.png`) });
        ok(`interior ${withInterior.interior} rendered`);
      }
      done();
      await page.close();
    }
    if (!manifest.walk) continue;
    // ---------- walk (desktop) ----------
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const done = watch(page, `${slug} walk`);
      await page.goto(`${BASE}/m/${slug}/walk?debug`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => !!(window as unknown as { __walk?: unknown }).__walk, null, { timeout: 30000 });
      await page.getByRole("button", { name: /Gəzintiyə başla|Start the walk/ }).click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, `${slug}-walk-start.png`) });
      const stats = await page.evaluate(() => { const w = (window as unknown as { __walk: W }).__walk; return { ...w.world.stats, calls: w.renderer.info.render.calls }; });
      console.log(`  · ${stats.meshes} meshes, ${(stats.tris / 1000).toFixed(0)}k tris, ${stats.lamps} lamps, ${stats.calls} draw calls`);
      stats.calls <= 80 ? ok(`draw calls ${stats.calls} ≤ 80`) : fail(`too many draw calls: ${stats.calls}`);

      // scripted walk: optional test route in manifest.walk.testRoute = [{key, ms, expectZone?}]
      const route: { key: string; ms: number; expect?: string; minFloor?: number }[] = manifest.walk.testRoute ?? [];
      await page.locator("canvas").first().click({ position: { x: 640, y: 400 } });
      for (const step of route) {
        await page.keyboard.down(step.key);
        await page.waitForTimeout(step.ms);
        await page.keyboard.up(step.key);
        await page.waitForTimeout(250);
        const st = await page.evaluate(() => { const w = (window as unknown as { __walk: W }).__walk.walker; return { x: w.x, z: w.z, floor: w.floor, zone: w.zone?.id ?? null }; });
        const line = `${step.key} ${step.ms}ms → (${st.x.toFixed(2)}, ${st.z.toFixed(2)}) floor ${st.floor.toFixed(2)} zone ${st.zone}`;
        if (step.expect && st.zone !== step.expect) fail(`${line} (expected ${step.expect})`);
        else if (step.minFloor !== undefined && st.floor < step.minFloor - 0.02) fail(`${line} (floor < ${step.minFloor})`);
        else ok(line);
      }
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, `${slug}-walk-route.png`) });

      // every zone reachable: teleport to a point inside each zone shape and check floor lookup
      const report = await page.evaluate(() => {
        const w = (window as unknown as { __walk: W }).__walk;
        const out: { id: string; ok: boolean; y?: number }[] = [];
        const seen = new Set<string>();
        for (const z of w.map.zones) {
          if (seen.has(z.id)) continue;
          let cx: number, cz: number;
          if (z.circle) [cx, cz] = z.circle;
          else if (z.ring) { cx = z.ring[0] + (z.ring[2] + z.ring[3]) / 2; cz = z.ring[1]; }
          else { cx = z.poly!.reduce((a, p) => a + p[0], 0) / z.poly!.length; cz = z.poly!.reduce((a, p) => a + p[1], 0) / z.poly!.length; }
          // centre may be blocked by furniture: also try points between centre and each vertex
          const pts: [number, number][] = [[cx, cz], ...(z.poly ?? []).map((p) => [cx + (p[0] - cx) * 0.5, cz + (p[1] - cz) * 0.5] as [number, number])];
          let hit = null;
          for (const [px, pz] of pts) { const h = w.map.at(px, pz, z.y); if (h && h.zone.id === z.id) { hit = h; break; } }
          out.push({ id: z.id, ok: !!hit && hit.zone.id === z.id, y: hit?.y });
          seen.add(z.id);
        }
        return out;
      });
      for (const r of report) r.ok ? ok(`zone ${r.id} @ floor ${r.y?.toFixed(2)}`) : fail(`zone ${r.id} not reachable`);
      // screenshots from each zone
      const shots: string[] = manifest.walk.testShots ?? [];
      const walkEras: (string | null)[] = manifest.walk.eras?.length ? manifest.walk.eras : [null];
      for (const era of walkEras) {
      if (era) {
        await page.getByRole("group", { name: /Dövr|Era/ }).getByRole("button", { name: manifest.eras[era].label.az, exact: true }).click();
        await page.waitForTimeout(1200);
        const calls = await page.evaluate(() => (window as unknown as { __walk: W }).__walk.renderer.info.render.calls);
        calls <= 80 ? ok(`era ${era}: draw calls ${calls} ≤ 80`) : fail(`era ${era}: too many draw calls: ${calls}`);
      }
      for (const id of shots) {
        const moved = await page.evaluate((id) => {
          const w = (window as unknown as { __walk: W }).__walk;
          const z = w.map.zones.find((q) => q.id === id);
          if (!z) return false;
          let cx: number, cz: number;
          if (z.circle) [cx, cz] = z.circle; else if (z.ring) { cx = z.ring[0] + (z.ring[2] + z.ring[3]) / 2; cz = z.ring[1]; } else { cx = z.poly!.reduce((a, p) => a + p[0], 0) / z.poly!.length; cz = z.poly!.reduce((a, p) => a + p[1], 0) / z.poly!.length; }
          w.walker.teleport(cx, cz, z.y);
          return true;
        }, id);
        if (!moved) { fail(`testShot zone ${id} missing`); continue; }
        await page.waitForTimeout(900);
        await page.screenshot({ path: path.join(OUT, `${slug}-walk-${era ? era + "-" : ""}${id}.png`) });
      }
      }
      const fps = await page.evaluate(() => (window as unknown as { __walk: W }).__walk.fps);
      console.log(`  · fps: ${fps.toFixed(0)}`);
      done();
      await page.close();
    }
    // ---------- walk (phone) ----------
    {
      const ctx = await browser.newContext({ ...devices["iPhone 13"] });
      const page = await ctx.newPage();
      const done = watch(page, `${slug} walk (iPhone 13)`);
      await page.goto(`${BASE}/m/${slug}/walk`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => !!(window as unknown as { __walk?: unknown }).__walk, null, { timeout: 30000 });
      await page.getByRole("button", { name: /Gəzintiyə başla|Start the walk/ }).tap();
      await page.waitForTimeout(800); // let the start overlay close and the dock mount
      const fwd = page.getByRole("button", { name: /İrəli|Forward/ });
      const box = await fwd.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(1500);
        await page.mouse.up();
      }
      const st = await page.evaluate(() => (window as unknown as { __walk: W }).__walk.walker);
      const s0 = manifest.walk.start;
      Math.hypot(st.x - s0.x, st.z - s0.z) > 0.5 ? ok(`touch pad moves the player (${st.x.toFixed(1)}, ${st.z.toFixed(1)})`) : fail("touch pad did not move the player");
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, `${slug}-walk-phone.png`) });
      done();
      await ctx.close();
    }
  }
  await browser.close();
  console.log(failures ? `\n${failures} failure(s)` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
