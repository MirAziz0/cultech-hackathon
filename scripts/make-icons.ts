/* Renders public/icons/icon.svg to the PNG sizes the PWA manifest and iOS need. */
import sharp from "sharp";
import path from "node:path";

const dir = path.join(process.cwd(), "public", "icons");
const svg = path.join(dir, "icon.svg");
const sizes: [string, number][] = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
];
async function main() {
  for (const [name, size] of sizes) {
    await sharp(svg, { density: 300 }).resize(size, size).png().toFile(path.join(dir, name));
    console.log("wrote", name);
  }
}
main();
