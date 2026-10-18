/* Builds public/map/az-height.png + lib/terrain-meta.json: an elevation grid for the 3D home map,
   sampled in the same projected coordinates as lib/map-data.json (1 px = 1 map unit).
   Source: AWS Terrain Tiles, "terrarium" encoding (Mapzen / open data, public domain).
   usage: npx tsx scripts/make-terrain.ts */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import mapData from "../lib/map-data.json";

const Z = 9;
const TILE = 256;
const D2R = Math.PI / 180;
const { k, tx, ty, cos0 } = mapData.proj;
const toLonLat = (x: number, y: number): [number, number] => [(x - tx) / (k * cos0) / D2R, -(y - ty) / k / D2R];

// Azerbaijan's bounding box in map units, padded a little
const pts = [...mapData.azOutline.matchAll(/(\d+),(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
const PAD = 6;
const x0 = Math.min(...pts.map((p) => p[0])) - PAD, x1 = Math.max(...pts.map((p) => p[0])) + PAD;
const y0 = Math.min(...pts.map((p) => p[1])) - PAD, y1 = Math.max(...pts.map((p) => p[1])) + PAD;
const SCALE = 2; // heightmap pixels per map unit (~360 m, matches the z9 tiles)
const W = (x1 - x0) * SCALE, H = (y1 - y0) * SCALE;

// slippy tile maths
const tileX = (lon: number) => ((lon + 180) / 360) * 2 ** Z;
const tileY = (lat: number) => ((1 - Math.log(Math.tan(lat * D2R) + 1 / Math.cos(lat * D2R)) / Math.PI) / 2) * 2 ** Z;
const [lonA, latA] = toLonLat(x0, y1), [lonB, latB] = toLonLat(x1, y0);
const tx0 = Math.floor(tileX(lonA)), tx1 = Math.floor(tileX(lonB));
const ty0 = Math.floor(tileY(latB)), ty1 = Math.floor(tileY(latA));

const cacheDir = path.join(process.cwd(), "scripts", "data", "terrain-cache");
fs.mkdirSync(cacheDir, { recursive: true });
const tiles = new Map<string, Float32Array>();
async function loadTile(x: number, y: number) {
  const file = path.join(cacheDir, `${Z}-${x}-${y}.png`);
  if (!fs.existsSync(file)) {
    const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`);
    if (!res.ok) throw new Error(`tile ${Z}/${x}/${y}: ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const { data } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const elev = new Float32Array(TILE * TILE);
  for (let i = 0; i < elev.length; i++) elev[i] = data[i * 4] * 256 + data[i * 4 + 1] + data[i * 4 + 2] / 256 - 32768;
  tiles.set(`${x},${y}`, elev);
}

function sample(lon: number, lat: number) {
  const fx = tileX(lon), fy = tileY(lat);
  const tX = Math.floor(fx), tY = Math.floor(fy);
  const t = tiles.get(`${tX},${tY}`);
  if (!t) return 0;
  const px = Math.min(TILE - 1, Math.floor((fx - tX) * TILE)), py = Math.min(TILE - 1, Math.floor((fy - tY) * TILE));
  return t[py * TILE + px];
}

async function main() {
  console.log(`[terrain] tiles z${Z} x${tx0}-${tx1} y${ty0}-${ty1}, grid ${W}x${H}`);
  for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) await loadTile(x, y);

  const elev = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const [lon, lat] = toLonLat(x0 + (i + 0.5) / SCALE, y0 + (j + 0.5) / SCALE);
    elev[j * W + i] = Math.max(-30, sample(lon, lat));
  }
  const min = -30;
  let max = 0;
  for (const v of elev) if (v > max) max = v;
  max = Math.ceil(max);
  // elevation in STEP-metre steps split across R (high byte) and G (low byte), as browsers only read 8-bit
  // canvas channels. The low byte is folded (reversed when the high byte is odd), so the image has no
  // sawtooth jumps and lossless WebP packs it to about 0.8 MB (the plain 16-bit PNG was 2 MB).
  const STEP = 2;
  const buf = Buffer.alloc(W * H * 3);
  for (let i = 0; i < elev.length; i++) {
    const q = Math.round((elev[i] - min) / STEP), hi = q >> 8, lo = q & 255;
    buf[i * 3] = hi;
    buf[i * 3 + 1] = hi & 1 ? 255 - lo : lo;
  }
  const out = path.join(process.cwd(), "public", "map", "az-height.webp");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } }).webp({ lossless: true, effort: 6 }).toFile(out);
  fs.writeFileSync(path.join(process.cwd(), "lib", "terrain-meta.json"),
    JSON.stringify({ x0, y0, width: x1 - x0, height: y1 - y0, scale: SCALE, min, max, source: "AWS Terrain Tiles (terrarium), public domain", file: "az-height.webp", step: STEP }, null, 2) + "\n");
  console.log(`[terrain] ${out} ${W}x${H}, elevation ${min}..${max} m`);
}

main().catch((e) => { console.error(e); process.exit(1); });
