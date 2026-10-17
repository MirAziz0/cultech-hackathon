/* Builds lib/map-data.json: South Caucasus country outlines (Natural Earth via world-atlas, public domain)
   projected to a 1000-wide SVG. Pins are projected at runtime with the same formula (lib/map.ts).
   usage: npx tsx scripts/make-map.ts */
import fs from "node:fs";
import path from "node:path";
import { geoArea, geoPath, geoProjection } from "d3-geo";
import { feature, merge, mesh } from "topojson-client";
import { topology } from "topojson-server";
import type { Topology, GeometryCollection } from "topojson-specification";

const topo = JSON.parse(fs.readFileSync(path.join(process.cwd(), "node_modules", "world-atlas", "countries-50m.json"), "utf8")) as Topology;
const countries = feature(topo, topo.objects.countries as GeometryCollection);

// view window (lon/lat) — South Caucasus with the Caspian coast
const LON0 = 43.4, LON1 = 51.9, LAT0 = 38.3, LAT1 = 42.2;
const LATC = ((LAT0 + LAT1) / 2) * (Math.PI / 180);
const W = 1000;
const cos0 = Math.cos(LATC);
const raw = (l: number, p: number): [number, number] => [l * cos0, p];
const proj = geoProjection(raw);
const outline = { type: "Polygon" as const, // clockwise ring: d3 treats an anticlockwise ring as "the whole globe minus this box"
  coordinates: [[[LON0, LAT0], [LON0, LAT1], [LON1, LAT1], [LON1, LAT0], [LON0, LAT0]]] };
proj.fitWidth(W, outline);
const [, h] = [0, Math.ceil((geoPath(proj).bounds(outline)[1][1]) - geoPath(proj).bounds(outline)[0][1])];
const H = h;
proj.clipExtent([[0, 0], [W, H]]);
const pathGen = geoPath(proj);

const KEEP: Record<string, { id: string; name: { az: string; en: string } }> = {
  "031": { id: "az", name: { az: "Azərbaycan", en: "Azerbaijan" } },
  "051": { id: "am", name: { az: "Ermənistan", en: "Armenia" } },
  "268": { id: "ge", name: { az: "Gürcüstan", en: "Georgia" } },
  "364": { id: "ir", name: { az: "İran", en: "Iran" } },
  "643": { id: "ru", name: { az: "Rusiya", en: "Russia" } },
  "792": { id: "tr", name: { az: "Türkiyə", en: "Türkiye" } },
};
const shapes = countries.features
  .filter((f) => KEEP[String(f.id)])
  .map((f) => ({ ...KEEP[String(f.id)], d: (pathGen(f) ?? "").replace(/(\d+)\.\d+/g, "$1") }));

/* ---- Azerbaijan's 14 economic regions (2021 decree), dissolved from the 79 districts of
   geoBoundaries ADM2 (CC BY-SA 3.0, scripts/data/aze-adm2.geojson) ---- */
const REGIONS: Record<string, { az: string; en: string; districts: string[] }> = {
  baku: { az: "Bakı", en: "Baku", districts: ["Baku City"] },
  absheron: { az: "Abşeron-Xızı", en: "Absheron-Khizi", districts: ["Absheron District", "Khizi District", "Sumqayit City"] },
  shirvan_m: { az: "Dağlıq Şirvan", en: "Mountainous Shirvan", districts: ["Shamakhi District", "Agsu District", "Ismailli District", "Gobustan District"] },
  ganja: { az: "Gəncə-Daşkəsən", en: "Ganja-Dashkasan", districts: ["Ganja City", "Dashkasan District", "Goygol District", "Goranboy District", "Samukh District", "Naftalan City"] },
  gazakh: { az: "Qazax-Tovuz", en: "Gazakh-Tovuz", districts: ["Agstafa District", "Gadabay District", "Qazakh District", "Shamkir District", "Tovuz District"] },
  karabakh: { az: "Qarabağ", en: "Karabakh", districts: ["Khankendi City", "Aghjabadi District", "Agdam District", "Barda District", "Fuzuli District", "Khojaly District", "Khojavend District", "Shusha City", "Shusha District", "Tartar District"] },
  zangezur: { az: "Şərqi Zəngəzur", en: "East Zangezur", districts: ["Jabrayil District", "Kalbajar District", "Qubadli District", "Lachin District", "Zangilan District"] },
  guba: { az: "Quba-Xaçmaz", en: "Guba-Khachmaz", districts: ["Quba District", "Qusar District", "Khachmaz District", "Shabran District", "Siazan District"] },
  lankaran: { az: "Lənkəran-Astara", en: "Lankaran-Astara", districts: ["Lankaran City", "Lankaran District", "Astara District", "Lerik District", "Masally District", "Yardymli District", "Jalilabad District"] },
  aran: { az: "Mərkəzi Aran", en: "Central Aran", districts: ["Mingachevir City", "Agdash District", "Goychay District", "Kurdamir District", "Ujar District", "Yevlakh City", "Yevlakh District", "Zardab District"] },
  mughan: { az: "Mil-Muğan", en: "Mil-Mughan", districts: ["Beylagan District", "Imishli District", "Saatly District", "Sabirabad District"] },
  shaki: { az: "Şəki-Zaqatala", en: "Shaki-Zagatala", districts: ["Shaki City", "Shaki District", "Balakan District", "Qakh District", "Qabala District", "Oghuz District", "Zaqatala District"] },
  shirvan_s: { az: "Şirvan-Salyan", en: "Shirvan-Salyan", districts: ["Shirvan City", "Bilasuvar District", "Hajigabul District", "Neftchala District", "Salyan District"] },
  nakhchivan: { az: "Naxçıvan", en: "Nakhchivan", districts: ["Nakhchivan City", "Babek District", "Julfa District", "Kangarli District", "Ordubad District", "Sadarak District", "Shahbuz District", "Sharur District"] },
};
const regionOf = new Map<string, string>();
for (const [id, r] of Object.entries(REGIONS)) for (const d of r.districts) regionOf.set(d, id);

type Geo = GeoJSON.Polygon | GeoJSON.MultiPolygon;
/** d3 wants clockwise exterior rings; GeoJSON (RFC 7946) files use the opposite. Flip rings of
   any polygon that d3 would read as "almost the whole globe". */
function rewind(g: Geo): Geo {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  const fixed = polys.map((rings) => (geoArea({ type: "Polygon", coordinates: rings }) > 2 * Math.PI ? rings.map((r) => [...r].reverse()) : rings));
  return g.type === "Polygon" ? { type: "Polygon", coordinates: fixed[0] } : { type: "MultiPolygon", coordinates: fixed };
}

const adm2 = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts", "data", "aze-adm2.geojson"), "utf8")) as GeoJSON.FeatureCollection<Geo, { shapeName: string }>;
for (const f of adm2.features) {
  if (!regionOf.has(f.properties.shapeName)) throw new Error(`district without region: ${f.properties.shapeName}`);
  f.geometry = rewind(f.geometry);
  (f.properties as { region?: string }).region = regionOf.get(f.properties.shapeName);
}
const dtopo = topology({ d: adm2 }, 1e5) as unknown as Topology;
const dobj = dtopo.objects.d as GeometryCollection<{ region: string }>;
const round = (d: string | null) => (d ?? "").replace(/(\d+)\.\d+/g, "$1");
const reg = (g: unknown) => (g as { properties?: { region?: string } }).properties?.region;
const regions = Object.entries(REGIONS).map(([id, r]) => ({
  id,
  name: { az: r.az, en: r.en },
  d: round(pathGen(merge(dtopo, dobj.geometries.filter((g) => reg(g) === id) as never))),
}));
// internal lines only between different economic regions; the country outline separately
const regionLines = round(pathGen(mesh(dtopo, dobj, (a, b) => a !== b && reg(a) !== reg(b))));
const azOutline = round(pathGen(mesh(dtopo, dobj, (a, b) => a === b)));

const s = proj.scale(), [tx, ty] = proj.translate();
const out = {
  width: W, height: H, proj: { k: s, tx, ty, cos0 }, shapes, regions, regionLines, azOutline,
  source: "Natural Earth 1:50m via world-atlas (public domain); Azerbaijan districts: geoBoundaries ADM2 (CC BY-SA 3.0)",
};
fs.writeFileSync(path.join(process.cwd(), "lib", "map-data.json"), JSON.stringify(out));
console.log(`map ${W}x${H}, ${shapes.length} shapes, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
