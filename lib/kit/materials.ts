/* Named materials used by manifests ("mat": "stone"). "c:#rrggbb" gives a plain coloured material. */
import * as THREE from "three";
import {
  bandTex, carpetTex, floorTex, mirrorTex, paintingTex, reliefNormal, reliefTex, shebekeTex, stainedTex,
  stoneNormal, stoneTex, tileTex, glowTex, minaretBrickTex, marbleTex, plasterTex, settsTex, metalRoofTex, plaqueTex, graniteTex,
} from "./textures";

export interface MatInfo { mat: THREE.Material; worldUV?: number }

const S = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });

/* photo textures from content/textures (served at /textures, CC0 Poly Haven); load lazily, appear when ready.
   Until the JPG arrives a texture shows a 1×1 placeholder (the photo's average colour, or a flat normal),
   so surfaces never render black on the first frames. */
const AVG: Record<string, string> = {
  asphalt_02: "#5a5a54", brick_floor: "#645746", castle_wall_slates: "#8a7e66", dry_ground_01: "#847969", grey_plaster_02: "#8e816c",
  leafy_grass: "#978359", marble_01: "#b19d7a", marble_tiles: "#8c8172", old_stone_wall: "#877763", painted_plaster_wall: "#aba3a0",
  patterned_paving_02: "#736151", red_brick_03: "#6a534b", rock_face: "#614532", rock_tile_floor: "#948d83", sandstone_blocks_08: "#a59275",
};
function pixel(css: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const x = c.getContext("2d")!;
  x.fillStyle = css;
  x.fillRect(0, 0, 1, 1);
  return c;
}
const texCache = new Map<string, THREE.Texture>();
function photoTex(name: string, color = true): THREE.Texture {
  const key = `${name}:${color}`;
  let t = texCache.get(key);
  if (!t) {
    if (typeof document === "undefined") t = new THREE.Texture();
    else {
      const tex = (t = new THREE.Texture<HTMLCanvasElement | HTMLImageElement>(pixel(color ? AVG[name.replace(/_(diff|nor)$/, "")] ?? "#9a8f80" : "#8080ff")));
      tex.needsUpdate = true;
      new THREE.ImageLoader().load(`/textures/${name}.jpg`, (img) => {
        tex.dispose(); // the GPU copy has the placeholder's size; drop it so the full image is uploaded
        tex.image = img;
        tex.needsUpdate = true;
      });
    }
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(key, t);
  }
  return t;
}
const P = (name: string, worldUV: number, o: THREE.MeshStandardMaterialParameters = {}): MatInfo => ({
  mat: S({ map: photoTex(`${name}_diff`), normalMap: photoTex(`${name}_nor`, false), normalScale: new THREE.Vector2(0.8, 0.8), ...o }),
  worldUV,
});

const factories: Record<string, () => MatInfo> = {
  stone: () => ({ mat: S({ map: stoneTex("light"), normalMap: stoneNormal("light"), normalScale: new THREE.Vector2(0.6, 0.6) }), worldUV: 2 }),
  stoneDS: () => ({ mat: S({ map: stoneTex("light"), normalMap: stoneNormal("light"), normalScale: new THREE.Vector2(0.6, 0.6), side: THREE.DoubleSide }), worldUV: 2 }),
  stoneGrey: () => ({ mat: S({ map: stoneTex("grey"), normalMap: stoneNormal("grey"), normalScale: new THREE.Vector2(0.8, 0.8) }), worldUV: 2.4 }),
  stoneGreyDS: () => ({ mat: S({ map: stoneTex("grey"), normalMap: stoneNormal("grey"), normalScale: new THREE.Vector2(0.8, 0.8), side: THREE.DoubleSide }), worldUV: 2.4 }),
  brick: () => ({ mat: S({ map: stoneTex("brick"), normalMap: stoneNormal("brick"), normalScale: new THREE.Vector2(0.7, 0.7) }), worldUV: 1.6 }),
  brickDS: () => ({ mat: S({ map: stoneTex("brick"), normalMap: stoneNormal("brick"), side: THREE.DoubleSide }), worldUV: 1.6 }),
  floor: () => ({ mat: S({ map: floorTex("light") }), worldUV: 2 }),
  floorGrey: () => ({ mat: S({ map: floorTex("grey") }), worldUV: 2 }),
  floorBrick: () => ({ mat: S({ map: floorTex("brick") }), worldUV: 1.5 }),
  plaster: () => ({ mat: S({ color: 0xeadfc8, side: THREE.DoubleSide }) }),
  dark: () => ({ mat: S({ color: 0x7a6548 }) }),
  niche: () => ({ mat: S({ color: 0x6e5a42 }) }),
  wood: () => ({ mat: S({ color: 0x6b4a2e, roughness: 0.75 }) }),
  woodDark: () => ({ mat: S({ color: 0x3f2a1a, roughness: 0.7 }) }),
  copper: () => ({ mat: S({ color: 0xb87333, metalness: 0.6, roughness: 0.4 }) }),
  gold: () => ({ mat: S({ color: 0xc9a45a, metalness: 0.7, roughness: 0.35 }) }),
  iron: () => ({ mat: S({ color: 0x3a3632, metalness: 0.6, roughness: 0.55 }) }),
  shebeke: () => ({ mat: new THREE.MeshBasicMaterial({ map: shebekeTex(), side: THREE.DoubleSide, toneMapped: false }), worldUV: 0.9 }),
  stained: () => ({ mat: new THREE.MeshBasicMaterial({ map: stainedTex(), color: 0xd8d0c0, side: THREE.DoubleSide, toneMapped: false }), worldUV: 0.55 }),
  glow: () => ({ mat: new THREE.MeshBasicMaterial({ color: 0xffd28a, toneMapped: false }) }),
  daylight: () => ({ mat: new THREE.MeshBasicMaterial({ color: 0xfff2d0, toneMapped: false, side: THREE.DoubleSide }) }),
  band: () => ({ mat: S({ map: bandTex(), side: THREE.DoubleSide }) }),
  inlay: () => ({ mat: S({ color: 0x8a7354 }) }),
  mq0: () => ({ mat: S({ color: 0xe6d4ad, side: THREE.DoubleSide }) }),
  mq1: () => ({ mat: S({ color: 0xd9c49a, side: THREE.DoubleSide }) }),
  water: () => ({ mat: S({ color: 0x2f8396, roughness: 0.3, metalness: 0, emissive: 0x0b3a44, emissiveIntensity: 0.6 }) }),
  plant: () => ({ mat: S({ color: 0x55702f }) }),
  cypress: () => ({ mat: S({ color: 0x3f5a2a }) }),
  ground: () => ({ mat: S({ color: 0xb8a27a }) }),
  earth: () => ({ mat: S({ color: 0x9c8462 }) }),
  // mirror mosaic: strong environment reflection plus faceted emissive sparkle so it reads even in dim halls
  mirror: () => ({ mat: S({ map: mirrorTex(), color: 0xe8e2d6, metalness: 0.75, roughness: 0.16, envMapIntensity: 5, emissive: 0xffffff, emissiveMap: mirrorTex(), emissiveIntensity: 0.45, side: THREE.DoubleSide }), worldUV: 0.9 }),
  tile: () => ({ mat: S({ map: tileTex(), roughness: 0.35, side: THREE.DoubleSide }), worldUV: 0.42 }),
  relief: () => ({ mat: S({ map: reliefTex("star"), normalMap: reliefNormal("star"), normalScale: new THREE.Vector2(1.2, 1.2) }) }),
  reliefKufic: () => ({ mat: S({ map: reliefTex("kufic"), normalMap: reliefNormal("kufic") }) }),
  reliefRosette: () => ({ mat: S({ map: reliefTex("rosette"), normalMap: reliefNormal("rosette") }) }),
  paintFloral: () => ({ mat: S({ map: paintingTex("floral") }) }),
  paintHunt: () => ({ mat: S({ map: paintingTex("hunt") }) }),
  paintPortrait: () => ({ mat: S({ map: paintingTex("portrait") }) }),
  carpet0: () => ({ mat: S({ map: carpetTex(0), roughness: 1 }) }),
  carpet1: () => ({ mat: S({ map: carpetTex(1), roughness: 1 }) }),
  carpet2: () => ({ mat: S({ map: carpetTex(2), roughness: 1 }) }),
  // Karabakh mosque set (Aghdam)
  minaretBrick: () => ({ mat: S({ map: minaretBrickTex("red") }), worldUV: 2.4 }),
  minaretBlue: () => ({ mat: S({ map: minaretBrickTex("blue"), roughness: 0.55 }), worldUV: 2.4 }),
  marble: () => ({ mat: S({ map: marbleTex(false), roughness: 0.6 }), worldUV: 3 }),
  marbleWorn: () => ({ mat: S({ map: marbleTex(true), roughness: 0.8 }), worldUV: 3 }),
  lime: () => ({ mat: S({ map: plasterTex(false), side: THREE.DoubleSide }), worldUV: 4 }),
  plasterPH: () => P("painted_plaster_wall", 3, { side: THREE.DoubleSide, color: 0xfffcf6 }),
  marblePH: () => P("marble_01", 1.6, { roughness: 0.45 }),
  marbleTilesPH: () => P("marble_tiles", 3, { roughness: 0.5 }),
  pavingPH: () => P("patterned_paving_02", 3),
  grassPH: () => P("leafy_grass", 3.5, { color: 0xc8f0a8 }),
  asphaltPH: () => P("asphalt_02", 6),
  fencePH: () => P("painted_plaster_wall", 3, { side: THREE.DoubleSide, color: 0xf1e2c4 }),
  hedgePH: () => P("leafy_grass", 1.2, { color: 0x7fc062 }),
  // Absheron limestone (Shirvanshahs): warm sand-beige blocks in horizontal courses
  limestonePH: () => P("sandstone_blocks_08", 1.5, { color: 0xf3efe9 }),
  // Maiden Tower: rough coursed limestone; darker weathered stone for the base and inner walls
  towerStonePH: () => P("castle_wall_slates", 2.6, { color: 0xeee6da, normalScale: new THREE.Vector2(1, 1) }),
  towerStoneGreyPH: () => P("old_stone_wall", 2.4, { color: 0xddd6cb, normalScale: new THREE.Vector2(1, 1) }),
  pavingStonePH: () => P("rock_tile_floor", 3, { color: 0xf4ead8 }),
  // Erivan: fired brick walls and brick floors, the Hrazdan gorge, dry open ground
  brickPH: () => P("red_brick_03", 1.8, { color: 0xffe2cc }),
  brickFloorPH: () => P("brick_floor", 2),
  cliffPH: () => P("rock_face", 9, { color: 0xe6cfae, normalScale: new THREE.Vector2(1.2, 1.2) }),
  groundPH: () => P("dry_ground_01", 5),
  granitePH: () => ({ mat: S({ map: graniteTex(), roughness: 0.72 }), worldUV: 0.8 }), // pink granite (procedural)
  bronzePlaque: () => ({ mat: S({ map: plaqueTex(), metalness: 0.7, roughness: 0.38, envMapIntensity: 1.4 }) }),
  grassBankPH: () => P("leafy_grass", 4, { color: 0xb8d898 }),
  // vault and dome undersides: a little self-light so crowns read as lit plaster, not shadow
  vaultLime: () => ({ mat: S({ map: plasterTex(false), side: THREE.DoubleSide, emissive: 0x5c574e, emissiveIntensity: 0.55 }), worldUV: 4 }),
  vaultLimeWorn: () => ({ mat: S({ map: plasterTex(true), side: THREE.DoubleSide, emissive: 0x4e4840, emissiveIntensity: 0.5 }), worldUV: 4 }),
  limeWorn: () => ({ mat: S({ map: plasterTex(true), side: THREE.DoubleSide }), worldUV: 4 }),
  setts: () => ({ mat: S({ map: settsTex() }), worldUV: 1.6 }),
  metalRoof: () => ({ mat: S({ map: metalRoofTex(), metalness: 0.45, roughness: 0.45, side: THREE.DoubleSide }), worldUV: 2 }),
  tin: () => ({ mat: S({ color: 0xaab0b4, metalness: 0.55, roughness: 0.4, side: THREE.DoubleSide }) }),
  iwanBlue: () => ({ mat: S({ color: 0x6f9cc4, side: THREE.DoubleSide }) }),
  rubble: () => ({ mat: S({ color: 0x9a8a72 }) }),
  dust: () => ({ mat: S({ color: 0x8e7f68, roughness: 1 }) }),
  sky: () => ({ mat: new THREE.MeshBasicMaterial({ color: 0xcfe0ec, toneMapped: false, side: THREE.DoubleSide }) }),
  shaft: () => ({
    mat: new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }),
  }),
};

export class Materials {
  private made = new Map<string, MatInfo>();
  get(key: string): MatInfo {
    let m = this.made.get(key);
    if (m) return m;
    if (!factories[key] && key.endsWith("DS")) {
      // double-sided variant of any material, e.g. "plasterDS", "c:#aabbccDS" (checked first: "c:" keys can carry it)
      const base = this.get(key.slice(0, -2));
      const mat = base.mat.clone();
      mat.side = THREE.DoubleSide;
      m = { mat, worldUV: base.worldUV };
    } else if (key.startsWith("c:")) {
      m = { mat: S({ color: new THREE.Color(key.slice(2)) }) };
    } else if (key.startsWith("art:")) {
      // a real painting (photo of the artwork), stretched once over the canvas
      m = { mat: S({ map: photoTex(key.slice(4)), roughness: 0.7 }) };
    } else if (key.startsWith("cs:")) {
      // shiny glazed colour (ceramics)
      m = { mat: S({ color: new THREE.Color(key.slice(3)), roughness: 0.3, side: THREE.DoubleSide }) };
    } else {
      const f = factories[key];
      if (!f) {
        console.warn(`[kit] unknown material "${key}", using stone`);
        return this.get("stone");
      }
      m = f();
    }
    m.mat.name = key;
    this.made.set(key, m);
    return m;
  }
  all() {
    return [...this.made.values()].map((m) => m.mat);
  }
  dispose() {
    for (const m of this.made.values()) m.mat.dispose();
    this.made.clear();
  }
}
