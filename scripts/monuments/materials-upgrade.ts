/* Photo-texture upgrade for the hand-authored walks: sets walk.alias (material remaps) and walk.clouds.
   Geometry is untouched. Textures: content/textures (CC0, see CREDITS.md).
     npx tsx scripts/monuments/materials-upgrade.ts */
import fs from "node:fs";
import path from "node:path";

type Box = { t: "box"; min: number[]; max: number[]; mat?: string; tag: "closure" } | { t: "floor" | "terrain"; rect: number[]; y: number; mat: string; tag: "closure" };
const box = (min: number[], max: number[], mat?: string): Box => ({ t: "box", min, max, ...(mat ? { mat } : {}), tag: "closure" });
const ground = (t: "floor" | "terrain", rect: number[], y: number, mat: string): Box => ({ t, rect, y, mat, tag: "closure" });

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
    // ground everywhere east of the cliff (the street paving only covered the street) and the gate threshold
    out.push(ground("terrain", [-15, 260, -260, 260], -0.06, "groundPH"));
    out.push(ground("floor", [20, 20.5, -1.3, 1.3], 0, "floorGrey"));
    // blocks are kept 2 cm inside the walls they meet, so no two faces share a plane (shared planes flicker)
    for (const s of [-1, 1]) {
      const z = (a: number, b: number) => (s > 0 ? [a, b] : [-b, -a]);
      const [g0, g1] = z(10.32, 13.98), [p0, p1] = z(6.27, 10.28), [c0, c1] = z(11.77, 13.98);
      out.push(box([19.52, 0, g0], [21.98, 5.15, g1], "brick"));         // gate flanks → street houses
      out.push(box([-5.28, 0.15, p0], [-4.77, 4.55, p1], "plaster"));    // palace corner → courtyard rooms
      out.push(box([-8.23, 0.15, c0], [-4.52, 4.55, c1], "plaster"));
    }
    erivanTown(out);
  }
  return out;
}

/* Erivan: the town inside the fortress walls (about 800 flat-roofed houses are recorded) around the
   modelled street, so the street no longer ends in an empty plain. Layout is a hypothesis. */
function erivanTown(out: Box[]) {
  let s = 1827;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const MATS = ["brick", "c:#a88a68", "brick", "c:#9c7e5e", "c:#b39773"]; // fired brick and mud-plastered walls
  const house = (x0: number, z0: number, x1: number, z1: number, h: number) => out.push(box([x0, 0, z0], [x1, h, z1], MATS[Math.floor(r() * MATS.length)]));
  // the street continues to a small square before the mosque; a row of houses on its north side; a block closes the view
  out.push(ground("floor", [44, 48, -8, 8], 0, "floorGrey"));
  out.push(ground("floor", [48, 70, 4, 8.5], 0, "floorGrey"));
  house(44.02, 8.52, 53.9, 13.98, 4.6);
  house(54.1, 8.52, 63.9, 13.98, 5.3);
  house(70.02, -13.98, 81.98, 13.98, 6.4);
  // the rest of the town: houses on a loose grid with narrow lanes, kept off the palace, courtyard, street, mosque and gorge
  const keepOut = [[-16, 22, -15, 15], [20, 46, -14.6, 14.6], [44, 82.5, -15, 15], [-400, -15, -400, 400]];
  const clear = (x0: number, x1: number, z0: number, z1: number) => !keepOut.some(([a, b, c, d]) => x0 < b + 0.6 && x1 > a - 0.6 && z0 < d + 0.6 && z1 > c - 0.6);
  for (let gx = -14; gx < 138; gx += 9.5)
    for (let gz = -78; gz < 78; gz += 9.5) {
      const w = 6.2 + r() * 2.4, d = 6.2 + r() * 2.4, x0 = gx + r() * (9.5 - w - 0.8), z0 = gz + r() * (9.5 - d - 0.8);
      if (clear(x0, x0 + w, z0, z0 + d)) house(x0, z0, x0 + w, z0 + d, 3.6 + r() * 3.4);
    }
  // the fortress wall beyond the houses (the cliff side stays open)
  out.push(box([-15, 0, -84], [142, 9, -82], "brick"));
  out.push(box([-15, 0, 82], [142, 9, 84], "brick"));
  out.push(box([140, 0, -82], [142, 9, 82], "brick"));
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
