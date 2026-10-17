/* Content schema for /content/monuments/<slug>/*.json.
   Everything a monument needs is data; the kit (lib/kit) turns it into three.js scenes. */

export type Lang = "az" | "en";
/** Localized string. `en` may be omitted; UI falls back to `az`. */
export type L = { az: string; en?: string };
/** ok = standing / observed, mid = based on excavation, plans or old photos, hyp = hypothesis */
export type Confidence = "ok" | "mid" | "hyp";
/** era key from manifest.eras ("past"/"today" for the two-era monuments; any id for more) */
export type Era = string;
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

/* ---------------- manifest.json ---------------- */
export interface Manifest {
  slug: string;
  order?: number;
  name: L;
  tagline: L;
  /** e.g. "XV əsr" */
  period: L;
  location: { lat: number; lon: number; place: L };
  /** photo id from photos.json used on cards / hero */
  cover?: string;
  eras: Record<Era, { label: L; badge: L; summary: L }>;
  /** order of the era toggle (default: today, past — or the key order of `eras`) */
  eraOrder?: Era[];
  defaultEra?: Era;
  /** per-monument wording of the three confidence levels (default: standing / evidence / hypothesis) */
  confLabels?: Partial<Record<Confidence, { short: L; long: L }>>;
  architect: ArchitectSpec;
  exterior: ExteriorSpec;
  buildings: Building[];
  interiors?: Record<string, InteriorSpec>;
  walk?: WalkSpec;
  /** shown under the legend; always say what is reconstructed */
  disclaimer: L;
  /** fact ids that summarise the monument (used for intro narration) */
  introFacts?: string[];
}

export interface ArchitectSpec {
  /** representative (not historical) character */
  name: L;
  role: L;
  voice: "male" | "female";
  /** costume tint so each era's builder looks different */
  look?: { robe?: string; sash?: string; headwear?: "turban" | "kalpak" | "cap" | "papaq"; beard?: boolean; /** Caucasian coat with cartridge pockets (gazyr) */ chokha?: boolean };
  /** set when the guide portrays a real, named person (stylised, no known likeness) */
  historical?: {
    /** last year the person can speak about first-hand; later facts are quoted from sources */
    knowsUntil: number;
    /** shown under the character: e.g. "no authentic portrait is known" */
    note: L;
  };
  /** first-person greeting shown when walk mode opens */
  greeting: L;
  /** folder in content/characters/<id>/ with avatar.vrm (+ anims); default: the monument slug */
  avatar?: string;
}

export interface Building {
  id: string;
  name: L;
  date: L;
  /** label anchor in exterior build coordinates (x east, y north, z up, metres) */
  pos: Vec3;
  conf: Confidence;
  text?: L;
  /** era-specific text (instead of `text`) */
  past?: L;
  today?: L;
  pastOnly?: boolean;
  todayOnly?: boolean;
  /** eras in which this label is shown (instead of pastOnly/todayOnly) */
  eras?: Era[];
  /** era-specific text for monuments with more than two eras */
  byEra?: Partial<Record<Era, L>>;
  photos?: string[];
  /** key into manifest.interiors */
  interior?: string;
  /** this building is the walkable one */
  walk?: boolean;
  factIds?: string[];
}

/* ---------------- exterior maquette ---------------- */
/** Coordinates follow the reference generator: x east, y north, z up (metres). */
export interface ExteriorSpec {
  /** metres -> maquette units (reference: 0.008) */
  scale: number;
  palette: Record<string, [number, number, number]>;
  home: { target: Vec3; az: number; pol: number; dist: number };
  parts: ExteriorPart[];
  /** seed for random parts (ruins, broken walls) */
  seed?: number;
  /** per-era material aliases, e.g. { past: { stone: "stone_rs" } } */
  eraMat?: Partial<Record<Era, Record<string, string>>>;
  overviewPhotos?: string[];
}

type PartBase = { eras?: Era[]; mat?: string; /** material per era */ matByEra?: Partial<Record<Era, string>>; /** confidence for this part (documentation only) */ conf?: Confidence };
export type ExteriorPart = PartBase & (
  | { t: "box"; size: Vec3; at: Vec3 }                                  // bottom-centred at `at`
  | { t: "cyl"; r: number; h: number; at: Vec3; sides?: number; r2?: number }
  | { t: "dome"; r: number; h: number; at: Vec3; pointed?: number; sides?: number }
  | { t: "tent"; r: number; h: number; at: Vec3; sides?: number }
  | { t: "niche"; w: number; spring: number; at: Vec3; facing: number; depth?: number }
  | { t: "portal"; w: number; h: number; at: Vec3; facing: number; depth?: number; nicheMat?: string }
  | { t: "windowRow"; from: number; to: number; along: "x" | "y"; at: Vec2; z: number; facing: number; n: number; w?: number; spring?: number }
  | { t: "tree"; at: Vec3; s?: number; kind?: "round" | "cypress" }
  | { t: "steps"; from: Vec2; dir: Vec2; width: number; n: number; run: number; z0: number; z1: number }
  /** perimeter wall along a closed polyline, merlons, optional corner towers; ruined=true breaks it randomly */
  | { t: "wallLoop"; pts: Vec2[]; h: number; th: number; merlons?: boolean; towers?: { r: number; h: number }; ruined?: number; closed?: boolean }
  /** groups of square rooms: domed (restored) or broken stubs (ruin) */
  | { t: "rooms"; at: Vec3; rooms: [number, number, number][]; mode: "domed" | "ruin"; h?: number; domeMat?: string }
  | { t: "scatter"; at: Vec3; area: Vec2; n: number; size: Vec2 }
  /** thick-walled hollow cylinder with an optional open top (towers) */
  | { t: "tube"; r: number; th: number; h: number; at: Vec3; sides?: number }
  /** prism from a 2D polygon footprint */
  | { t: "prism"; pts: Vec2[]; h: number; z: number }
  | { t: "water"; size: Vec2; at: Vec3 }
  /** Karabakh brick minaret: stone base, banded shaft with belts, timber lantern, metal cap. `at` = foot */
  | { t: "minaret"; at: Vec3; r: number; h: number; base?: { r: number; h: number }; belts?: number; lantern?: number; brickMats?: [string, string]; noLantern?: boolean }
  /** hipped roof over a rectangle; `at` = centre at eave height */
  | { t: "hipRoof"; at: Vec3; size: Vec2; h: number }
  | { t: "bush"; at: Vec3; s?: number }
);

/* ---------------- look-around interiors ---------------- */
export interface InteriorSpec {
  title: L;
  note: L;
  shape: "oct" | "rect";
  /** oct: radius; rect: [W, D] */
  size: number | Vec2;
  h: number;
  eye?: number;
  reach?: number;
  dome?: { r: number; sy: number; muqarnas?: boolean; drum?: number; skylights?: boolean };
  band?: boolean;
  squinches?: boolean;
  /** niches around the walls; doors/windows glow with daylight */
  openings?: { side: number | "n" | "e" | "s" | "w"; kind: "door" | "window" | "niche"; w: number; h: number; sill?: number; offset?: number }[];
  furniture?: Furniture[];
  light?: { color?: string; intensity?: number; y?: number };
  mirrors?: boolean;
}

/* ---------------- walk mode (architecture kit) ---------------- */
/** Walk coordinates: three.js world, metres; x east, y up, z south. */
export interface WalkSpec {
  title: L;
  /** label of the "walk inside" button, e.g. "Məscidin içində gəz" */
  cta?: L;
  eye?: number;
  /** floor height for zones without `floor` */
  defaultFloor?: number;
  start: { x: number; z: number; y?: number; yaw: number; pitch?: number };
  sky?: string;
  fog?: Vec2;
  /** minimap bounds [x0, x1, z0, z1] and zone ids not drawn on it */
  map: { bounds: [number, number, number, number]; hide?: string[]; /** quick jump buttons (stacked floors) */ levels?: { name: L; y: number; at: Vec2; yaw?: number; pitch?: number }[] };
  sun?: { dir: Vec3; intensity?: number };
  ambient?: number;
  /** eras the walk can show (elements filter by `eras`); defaults to a single static world */
  eras?: Era[];
  /** sky, fog and light per era */
  /** sky dome with clouds (zenith colour; the horizon uses `sky`) */
  clouds?: string;
  /** events of the place (sieges, earthquakes, rebuildings) for the zone card's History tab (scripts/monuments/history.ts) */
  history?: HistoryEvent[];
  /** material aliases for every era (era aliases win), e.g. { stone: "limestonePH" } */
  alias?: Record<string, string>;
  /** content/models/<id> tree variants (scripts/import-trees.ts) used for every { kind: "tree" } furniture */
  trees?: string;
  eraLook?: Partial<Record<Era, { clouds?: string; exposure?: number; sky?: string; fog?: Vec2; sun?: { dir: Vec3; intensity?: number }; ambient?: number; /** material aliases, e.g. { wallIn: "limeWorn" } */ alias?: Record<string, string> }>>;
  defaultEra?: Era;
  elements: El[];
  zones: Zone[];
  obstacles?: [number, number, number][];
  zoneInfo: Record<string, ZoneInfo>;
  /** guided tour: story stops in walking order (narration/stops/<id>.json) */
  tour?: { stops: TourStop[] };
  /** used by scripts/test-walk.ts: key presses with expected zone / min floor, and zones to screenshot */
  testRoute?: { key: string; ms: number; expect?: string; minFloor?: number }[];
  testShots?: string[];
}

/** One stop of the guided tour. Coordinates are walk coordinates (x east, y up, z south). */
export interface TourStop {
  id: string;
  /** walk zone the stop belongs to (free mode offers the story when the visitor enters it) */
  zone: string;
  title: L;
  /** where the guide stands: [x, floor height, z] */
  stand: Vec3;
  /** generated stop (lib/guide/autoStops.ts): no fixed spot, so it is told beside the visitor */
  auto?: boolean;
  /** the feature he points at */
  poi?: Vec3;
  /** opening gesture instead of pointing (e.g. "think" for a legend) */
  gesture?: "point" | "lookUp" | "think" | "welcome";
  /** photo id highlighted on the card when the story says [photo] */
  photo?: string;
  /** only in these eras (walk.eras) */
  eras?: Era[];
}

export interface HistoryEvent {
  year: string;
  title: L;
  text: L;
  /** walk zones the event belongs to (listed first there); none = the whole place */
  zones?: string[];
  conf?: Confidence;
}

export interface ZoneInfo {
  title: L;
  text: L;
  conf?: Confidence;
  photos?: string[];
  factIds?: string[];
  /** photos that may not be embedded (no open licence): shown as links */
  links?: { title: L; url: string }[];
  /** overrides for one era (walk.eras) */
  byEra?: Partial<Record<Era, Partial<Omit<ZoneInfo, "byEra" | "title">>>>;
}

/** floor height: constant, ramp along an axis, or helix (spiral stairs) */
export type FloorSpec =
  | number
  | { ramp: { axis: "x" | "z"; from: number; to: number; y0: number; y1: number } }
  | { helix: { c: Vec2; a0: number; y0: number; y1: number; risePerTurn: number; dir?: 1 | -1 } };

export interface Zone {
  id: string;
  rect?: [number, number, number, number];
  oct?: { c: Vec2; a: number };
  ngon?: { c: Vec2; r: number; n: number; rot?: number };
  circle?: [number, number, number];
  /** annulus (ring corridors, wall stairs): [cx, cz, rInner, rOuter] */
  ring?: [number, number, number, number];
  poly?: Vec2[];
  floor?: FloorSpec;
  /** places the shape in a local frame */
  frame?: Frame;
}

export interface Frame { pos: Vec2; rot: number /* degrees, +ccw seen from above */ }

/** opening in a wall, u = distance along the wall from its start */
export interface Op {
  u: number;
  w: number;
  sill: number;
  spring: number;
  kind: "door" | "window" | "niche";
  back?: number;
  /** window filling */
  fill?: "shebeke" | "glass" | "open" | "mirror";
}

type ElBase = { mat?: string; id?: string; /** only built in these eras (walk.eras) */ eras?: Era[] };
export type El = ElBase & (
  | { t: "group"; frame: Frame; children: El[] }
  | { t: "floor"; rect: [number, number, number, number]; y: number }
  | { t: "disc"; c: Vec2; r: number; y: number; hole?: number; sides?: number; /** [startDeg, lengthDeg], angles from +x toward +z */ arc?: Vec2 }
  | { t: "box"; min: Vec3; max: Vec3 }
  | { t: "wall"; from: Vec2; to: Vec2; y0: number; h: number; th: number; ops?: Op[] }
  | { t: "octWalls"; c: Vec2; a: number; th: number; y0: number; h: number; faces: (Partial<Op> | null)[] }
  | { t: "ngonWalls"; c: Vec2; r: number; n: number; th: number; y0: number; h: number; rot?: number; faces?: (Partial<Op> | null)[] }
  | { t: "room"; x: Vec2; z: Vec2; y0: number; h: number; th: number; ops?: { n?: Op[]; e?: Op[]; s?: Op[]; w?: Op[] }; vault?: "x" | "z" | "flat" | "none"; vaultScale?: number; ceilingMat?: string }
  | { t: "vault"; x: Vec2; z: Vec2; y: number; axis: "x" | "z"; scaleY?: number; pointed?: boolean }
  | { t: "dome"; c: Vec2; r: number; y: number; sy?: number; outside?: boolean; /** radius of a central opening (oculus) */ hole?: number }
  | { t: "octRing"; c: Vec2; a: number; y0: number; h: number; n?: number }
  | { t: "ringCap"; c: Vec2; r0: number; r1: number; y: number; n?: number }
  | { t: "muqarnas"; c: Vec2; r: number; y: number; tiers?: number; n?: number }
  | { t: "drumLights"; c: Vec2; r: number; y: number; n: number }
  | { t: "cylWall"; c: Vec2; r: number; y0: number; h: number; th?: number; arc?: Vec2; outside?: boolean; sides?: number }
  | { t: "column"; c: Vec2; r: number; y0: number; h: number; sides?: number; capital?: boolean }
  | { t: "spiralStair"; c: Vec2; r: number; y0: number; y1: number; steps: number; a0: number; turnDeg: number; column?: number; shell?: boolean; dome?: boolean }
  | { t: "stair"; from: Vec2; dir: Vec2; width: number; steps: number; rise: number; run: number; y0: number; solid?: boolean }
  | { t: "ringStair"; c: Vec2; r0: number; r1: number; y0: number; a0: number; turnDeg: number; steps: number; rise: number }
  | { t: "band"; c: Vec2; r: number; y: number; h: number; n?: number }
  | { t: "plane"; at: Vec3; size: Vec2; rotY?: number; rotX?: number; doubleSide?: boolean }
  | { t: "fountain"; c: Vec2; r: number; n?: number }
  | { t: "pool"; rect: [number, number, number, number]; y: number }
  | { t: "well"; c: Vec2; r: number; y: number; depth: number }
  | { t: "relief"; at: Vec3; size: Vec2; rotY: number; pattern?: "star" | "kufic" | "rosette" }
  | { t: "mirrorWall"; from: Vec2; to: Vec2; y0: number; h: number; cells?: Vec2 }
  | { t: "painting"; at: Vec3; size: Vec2; rotY: number; motif: "floral" | "hunt" | "portrait"; /** real artwork: content/textures/<src>.jpg (credited in CREDITS.md) instead of the drawn motif */ src?: string }
  /** arbitrary quad (slopes, banks): four corners in order */
  | { t: "quad"; pts: [Vec3, Vec3, Vec3, Vec3] }
  | { t: "terrain"; rect: [number, number, number, number]; y: number; color?: string }
  | { t: "light"; at: Vec3; intensity?: number; distance?: number; color?: string }
  | { t: "shaft"; at: Vec3; to: Vec3; w: number }
  | ({ t: "furniture" } & Furniture)
  /** textured 3D model from content/models/<src>/ (scripts/import-character.ts --model), loaded after the
      world is built; `replaces` hides kit elements (by type or material) in the eras where the model is shown */
  | { t: "model"; src: string; at: Vec3; rotY?: number; /** uniform or per-axis (fit a footprint) */ scale?: number | Vec3; /** world boxes [x0,x1,y0,y1,z0,z1] cut out of the model (open doorways) */ cut?: [number, number, number, number, number, number][]; replaces?: { types?: string[]; mats?: string[] } }
  /* Karabakh mosque kit (lib/kit/karabakh.ts) */
  | { t: "minaret"; c: Vec2; y0: number; r: number; h: number; base?: { r: number; h: number }; belts?: number; taper?: number; lantern?: { h: number; r?: number }; brick?: string; belt?: string; stone?: string; wood?: string; cap?: string; broken?: boolean }
  | { t: "kColumn"; c: Vec2; y0: number; h: number; r: number }
  /** domed bay on a rectangular plan (sail vault); hole = broken crown open to the sky */
  | { t: "sailVault"; x: Vec2; z: Vec2; y: number; rise?: number; hole?: number; outside?: string; shell?: number }
  | { t: "gallery"; x: Vec2; z: Vec2; y: number; th?: number; rail?: ("n" | "s" | "e" | "w")[]; railH?: number; railMat?: string; broken?: boolean; seed?: number }
  | { t: "rubble"; rect: [number, number, number, number]; y: number; n: number; size?: Vec2; seed?: number }
  /** fallen plaster on the room side of a wall line */
  | { t: "patches"; from: Vec2; to: Vec2; y0: number; h: number; n: number; seed?: number; side?: 1 | -1 }
);

export type Furniture =
  | { kind: "carpet"; at: Vec3; size: Vec2; rotY?: number; pattern?: number }
  | { kind: "cushion"; at: Vec3; len: number; rotY?: number; color: string }
  | { kind: "jug"; at: Vec3; s: number; color: string }
  | { kind: "lamp"; at: Vec3; light?: number; distance?: number }
  | { kind: "chest"; at: Vec3; rotY?: number }
  | { kind: "tray"; at: Vec3 }
  | { kind: "lectern"; at: Vec3; rotY?: number }
  | { kind: "loom"; at: Vec3; rotY?: number }
  | { kind: "cypress"; at: Vec3; h?: number }
  | { kind: "bush"; at: Vec3; r?: number }
  /** granite boulder with a bronze plaque on its flattened front (front faces -z before rotY) */
  | { kind: "plaqueStone"; at: Vec3; rotY?: number; h?: number; seed?: number }
  /** broad-leaved tree: trunk and a few leafy crowns */
  | { kind: "tree"; at: Vec3; h?: number; seed?: number }
  | { kind: "cenotaph"; at: Vec3; size: Vec3; rotY?: number }
  | { kind: "mihrab"; at: Vec3; rotY?: number; w?: number }
  | { kind: "minbar"; at: Vec3; rotY?: number; steps?: number }
  | { kind: "lampRing"; at: Vec3; r: number; n?: number }
  | { kind: "bench"; at: Vec3; size: Vec3; rotY?: number }
  | { kind: "cannon"; at: Vec3; rotY?: number }
  | { kind: "pool"; at: Vec3; r: number; sides?: number }
  | { kind: "skylights"; at: Vec3; r: number; n?: number }
  | { kind: "brazier"; at: Vec3 };

/* ---------------- facts.json ---------------- */
export interface Source { title: string; url: string }
export interface Fact {
  id: string;
  text: L;
  sources: Source[];
  conf: Confidence;
  tags?: string[];
  /** needs historian check — mirrored in CONTENT_TODO.md */
  verify?: boolean;
  /** year the fact refers to; for a historical guide, facts after architect.historical.knowsUntil are quoted, not witnessed */
  year?: number;
}
export interface FactsFile { monument: string; facts: Fact[] }

/* ---------------- photos.json ---------------- */
export interface Photo {
  id: string;
  /** file name inside the monument's photos/ folder */
  file: string;
  /** Commons file title, without "File:" */
  commons: string;
  page: string;
  author: string;
  license: string;
  licenseUrl?: string;
  caption: L;
  w: number;
  h: number;
  /** how the image was changed for the app (e.g. cropped) — required by CC BY-SA */
  modified?: L;
}
export interface PhotosFile { photos: Photo[] }

/* ---------------- narration/*.json ---------------- */
export interface Viseme { t: number; id: number }
export interface Narration {
  zone: string;
  /** era variant of a zone narration; stored in the bundle as "zone@era" */
  era?: Era;
  text: L;
  factIds: string[];
  /** relative to the monument's narration/ folder */
  audio?: Partial<Record<Lang, string>>;
  visemes?: Partial<Record<Lang, Viseme[]>>;
  generatedBy: "hand" | "claude";
}

/** A tour stop told as a story: narration/stops/<stop>.json. Text carries markers like [point]. */
export interface Story {
  stop: string;
  /** era variant ("stop@era" in the bundle) */
  era?: Era;
  text: L;
  factIds: string[];
  audio?: Partial<Record<Lang, string>>;
  visemes?: Partial<Record<Lang, Viseme[]>>;
  /** marker times (ms) from Azure bookmarks, in marker order */
  marks?: Partial<Record<Lang, { t: number; name: string }[]>>;
  generatedBy: "hand" | "claude";
}

/** canned answers used in mock mode */
export interface QA { keys: string[]; a: L; factIds: string[] }

/** Everything the client needs for one monument (assembled by lib/content.ts) */
export interface MonumentBundle {
  manifest: Manifest;
  facts: Fact[];
  photos: Photo[];
  narration: Record<string, Narration>;
  /** guide body found in content/characters/<id>/: avatar.vrm (rigged) or model.glb (static model); none → procedural */
  avatar?: { id: string; kind: "vrm" | "mesh" };
  /** tour stories by stop id ("stop@era" for era variants) */
  stories: Record<string, Story>;
  qa: QA[];
  /** public URL prefix: /monuments/<slug> */
  base: string;
  /** exported AR models (with baked name tags) per era and language; usdz is for iOS Quick Look */
  ar: Partial<Record<Era, Partial<Record<Lang, { glb: string; usdz?: string }>>>>;
}
