/* Renders the brand mark (public/icons/logo-mark.png, thin lines on transparent) to the browser-tab,
   PWA and iOS icons. The mark sits on a white disc / tile so it stays visible on dark tab bars. */
import sharp from "sharp";
import path from "node:path";

const dir = path.join(process.cwd(), "public", "icons");
const mark = path.join(dir, "logo-mark.png");

/** white background (circle or rounded square) with the mark centred at `fill` of the size; `bold` thickens
   the hairlines first (blur the alpha, then raise it), which tab-sized icons need to stay readable */
async function icon(name: string, size: number, shape: "circle" | "square", fill: number, bold = 0) {
  const r = shape === "circle" ? size / 2 : size * 0.22;
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="#fff"/></svg>`);
  const m = Math.round(size * fill);
  let src = sharp(mark).resize(512, 512, { kernel: "lanczos3" });
  if (bold) {
    // thicker lines: the line coverage (opacity × darkness) is blurred and raised into a mask, then filled
    // with the mark's own navy → bronze sweep (pixels are handled in JS: sharp reorders chained operations)
    const px = await src.clone().ensureAlpha().raw().toBuffer();
    const cover = Buffer.alloc(512 * 512);
    for (let i = 0; i < cover.length; i++) {
      const lum = 0.3 * px[i * 4] + 0.59 * px[i * 4 + 1] + 0.11 * px[i * 4 + 2];
      cover[i] = Math.round((px[i * 4 + 3] / 255) * (255 - lum));
    }
    const { data: blurred, info } = await sharp(cover, { raw: { width: 512, height: 512, channels: 1 } }).blur(bold).raw().toBuffer({ resolveWithObject: true });
    const alpha = Buffer.alloc(512 * 512);
    for (let i = 0; i < alpha.length; i++) alpha[i] = Math.min(255, blurred[i * info.channels] * 5);
    const sweep = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><linearGradient id="g"><stop offset="0" stop-color="#1f2f57"/><stop offset="1" stop-color="#b06a26"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/></svg>`);
    const rgb = await sharp(sweep).removeAlpha().raw().toBuffer();
    const rgba = Buffer.alloc(512 * 512 * 4);
    for (let i = 0; i < 512 * 512; i++) {
      rgba[i * 4] = rgb[i * 3]; rgba[i * 4 + 1] = rgb[i * 3 + 1]; rgba[i * 4 + 2] = rgb[i * 3 + 2]; rgba[i * 4 + 3] = alpha[i];
    }
    src = sharp(rgba, { raw: { width: 512, height: 512, channels: 4 } });
  }
  const logo = await sharp(await src.png().toBuffer()).resize(m, m, { kernel: "lanczos3" }).toBuffer();
  await sharp(bg).composite([{ input: logo, gravity: "centre" }]).png().toFile(path.join(dir, name));
  console.log("wrote", name);
}

async function main() {
  await icon("favicon-32.png", 32, "circle", 0.94, 5);
  await icon("favicon-64.png", 64, "circle", 0.94, 3);
  await icon("icon-192.png", 192, "square", 0.78);
  await icon("icon-512.png", 512, "square", 0.78);
  // maskable: the platform crops to its own shape, so keep the mark inside the 80% safe zone
  await icon("icon-maskable-512.png", 512, "square", 0.62);
  await icon("apple-touch-icon.png", 180, "square", 0.78);
}
main();
