/* Photo-texture upgrade for the hand-authored walks: sets walk.alias (material remaps) and walk.clouds.
   Geometry is untouched. Textures: content/textures (CC0, see CREDITS.md).
     npx tsx scripts/monuments/materials-upgrade.ts */
import fs from "node:fs";
import path from "node:path";

type Box = { t: "box"; min: number[]; max: number[]; mat?: string; tag: "closure" };
const box = (min: number[], max: number[], mat?: string): Box => ({ t: "box", min, max, ...(mat ? { mat } : {}), tag: "closure" });

/* Closures: walls and house blocks that seal gaps where the world showed through (added on top of the
   hand-made geometry, tagged "closure" so re-running replaces them). Mostly artistic hypothesis. */
function closures(slug: string): Box[] {
  const out: Box[] = [];
  if (slug === "shirvanshahs") {
    // facade (z ±9) → courtyard side walls (z ±12): fill the corners, then close the palace block behind the facade
    for (const s of [-1, 1]) {
      out.push(box([-6.8, 0, s > 0 ? 8.9 : -12], [-6.0, 10, s > 0 ? 12 : -8.9]));
      out.push(box([-6.0, 0, s > 0 ? 11.5 : -12], [16.4, 10, s > 0 ? 12 : -11.5]));
      out.push(box([-6.85, 9.9, s > 0 ? 8.9 : -12], [-5.95, 10.3, s > 0 ? 12 : -8.9])); // cornice
    }
    out.push(box([15.9, 0, -12], [16.4, 10, 12]));
  }
  if (slug === "maiden-tower") {
    // a continuous ring of flat-roofed Old City houses around the square (r > 28), lower toward the sea (+z)
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const H = (sea: boolean) => (sea ? 3 + r() * 1.5 : 4.5 + r() * 3.5);
    for (let a = -36; a < 36; ) {
      const w = 5 + r() * 4, b = Math.min(a + w, 36), d = 6 + r() * 4;
      out.push(box([a, 0, -29 - d], [b, H(false), -29], "limestonePH"));  // north
      out.push(box([a, 0, 29], [b, H(true), 29 + d], "limestonePH"));     // south (sea side)
      out.push(box([-29 - d, 0, a], [-29, H(false), b], "limestonePH"));  // west
      out.push(box([29, 0, a], [29 + d, H(a > 10), b], "limestonePH"));   // east
      a = b;
    }
  }
  if (slug === "erivan-fortress") {
    for (const s of [-1, 1]) {
      const z = (a: number, b: number) => (s > 0 ? [a, b] : [-b, -a]);
      const [g0, g1] = z(10.3, 14), [p0, p1] = z(6.25, 10.3);
      out.push(box([19.5, 0, g0], [22, 5.2, g1], "brick"));        // gate flanks → street houses
      out.push(box([-5.3, 0.15, p0], [-4.75, 4.6, p1], "plaster")); // palace corner → courtyard rooms
      out.push(box([-8.25, 0.15, s > 0 ? 11.75 : -14], [-4.5, 4.6, s > 0 ? 14 : -11.75], "plaster"));
    }
  }
  return out;
}

const UPGRADES: Record<string, { clouds: string; alias: Record<string, string> }> = {
  // Absheron limestone, Old City paving
  shirvanshahs: {
    clouds: "#3f84d0",
    alias: { stone: "limestonePH", floor: "pavingStonePH", floorGrey: "pavingStonePH" },
  },
  // rough coursed limestone, darker weathered stone, rough stone floors, dry ground around the square
  "maiden-tower": {
    clouds: "#3f84d0",
    alias: { stone: "towerStonePH", stoneGrey: "towerStoneGreyPH", floorGrey: "pavingStonePH", "c:#b9a57f": "groundPH" },
  },
  // fired brick, brick floors, plastered palace walls, the Hrazdan gorge (cliff, river bank, plateau)
  "erivan-fortress": {
    clouds: "#4a8ad0",
    alias: {
      brick: "brickPH", floorBrick: "brickFloorPH", plaster: "plasterPH", floorGrey: "pavingStonePH",
      "c:#8a6e4eDS": "cliffPHDS", "c:#8f7452DS": "cliffPHDS", "c:#7f8a52DS": "grassBankPHDS", "c:#a9a06aDS": "groundPHDS",
    },
  },
};

for (const [slug, up] of Object.entries(UPGRADES)) {
  const file = path.join(process.cwd(), "content", "monuments", slug, "manifest.json");
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  const m = JSON.parse(raw);
  m.walk.clouds = up.clouds;
  m.walk.alias = up.alias;
  m.walk.elements = [...m.walk.elements.filter((e: { tag?: string }) => e.tag !== "closure"), ...closures(slug)];
  m.walk.trees = "trees"; // low-poly tree pack (content/models/trees) for every tree, cypress and bush
  let out = JSON.stringify(m, null, 1) + "\n";
  if (crlf) out = out.replace(/\n/g, "\r\n");
  fs.writeFileSync(file, out);
  console.log(`[materials] ${slug}: ${Object.keys(up.alias).length} aliases`);
}
