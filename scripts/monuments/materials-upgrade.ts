/* Photo-texture upgrade for the hand-authored walks: sets walk.alias (material remaps) and walk.clouds.
   Geometry is untouched. Textures: content/textures (CC0, see CREDITS.md).
     npx tsx scripts/monuments/materials-upgrade.ts */
import fs from "node:fs";
import path from "node:path";

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
  let out = JSON.stringify(m, null, 1) + "\n";
  if (crlf) out = out.replace(/\n/g, "\r\n");
  fs.writeFileSync(file, out);
  console.log(`[materials] ${slug}: ${Object.keys(up.alias).length} aliases`);
}
