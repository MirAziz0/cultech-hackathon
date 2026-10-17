# ZamanQapısı AI

A virtual time-travel platform for architectural heritage. You can:

- see each monument as a 3D maquette **today** and **in its own era**;
- **walk inside** it;
- listen to an animated **AI architect** who narrates each space and answers questions from sourced facts.

Every reconstructed part carries a confidence label, and every photo is credited.

| Monument | Walk | Notes |
|---|---|---|
| Şirvanşahlar Sarayı, Bakı | the palace building: courtyard, west portal, octagonal hall, spiral stair, 3 rooms | port of the original prototype; 4 look-around interiors |
| Qız qalası, Bakı | plaza, entrance passage, 8 storeys, in-wall stair, roof | storey jump buttons; the 21 m well under stacked oculi |
| İrəvan qalası & Sərdar sarayı | fortress street, palace court, **Hall of Mirrors**, side rooms, balcony over the gorge | demolished site: reconstruction from the 1827 plan, the museum model and Gagarin's lithograph |

## Run locally

```bash
npm install
npx playwright install chromium   # only for the browser tests
npm run dev                       # http://localhost:3000
```

`npm run dev` and `npm run build` first run `npm run content`. That step copies photos and narration audio from `content/` to `public/monuments/`, and exports each exterior to `public/monuments/<slug>/models/<era>.<lang>.{glb,usdz}` for AR, with building names baked in as 3D signs.

Node 20+ is required (developed on Node 24).

## Environment variables

Copy `.env.example` to `.env.local`. **All variables are optional.** With none set, the app runs in **mock mode**, which is enough for a demo.

| Variable | Used for | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | live Q&A in `/api/architect`; `npm run narration -- --text` | answers come from `facts.json` and `qa.json` (keyword match) |
| `ANTHROPIC_MODEL` | model id, default `claude-opus-5-5` | default |
| `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | Azerbaijani TTS (`az-AZ-BabekNeural` / `az-AZ-BanuNeural`) with viseme lip sync in `/api/tts`; pre-generated narration audio | browser `speechSynthesis` if an az voice exists (else a Turkish voice), else animated subtitles |

How the architect speaks, in priority order:

1. Cached narration MP3 with an Azure viseme timeline.
2. Live Azure TTS.
3. Browser speech.
4. Silent subtitles with mouth shapes estimated from the spelling.

When audio has no visemes, the mouth follows audio amplitude through a Web Audio `AnalyserNode`.

**For a stage demo, pre-generate the audio once**, then commit `content/monuments/*/narration/*.mp3`. The walk will then speak offline:

```bash
AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=… npm run narration -- --audio
```

The Q&A route answers only from the monument's `facts.json` and returns the fact ids it used, which the UI shows as "Mənbə" chips. If the key is missing, the API fails, or the model declines, it falls back to the mock answer, so nothing breaks on stage. Server-side refusal fallback (`fallbacks: "default"`) is enabled.

## Scripts

| Command | What it does |
|---|---|
| `npm run photos [slug]` | downloads Commons photos listed in `photos.sources.json` and writes `photos.json` with author, license and file page |
| `npm run narration [slug] [--text] [--audio] [--force] [--zone=id]` | checks every walk zone has a narration; with keys, writes scripts (Claude) and MP3 + visemes (Azure) |
| `npm run todo` | regenerates `CONTENT_TODO.md` (facts marked `verify`, reconstructed parts, source conflicts from `content/review-notes.md`) |
| `npm run test:walk` | Playwright browser test against a running server (`BASE=http://localhost:3000`): pages load without console errors, scripted key walk, every zone reachable, touch pad on an iPhone viewport, screenshots in `screenshots/` |
| `npm run shot -- <slug> <zone> [yaw] [pitch] [x,z]` | screenshot of one spot in a walk, for visual review |
| `npm run map` / `npm run icons` | rebuild the regional map outline (Natural Earth) / PWA icons |

## Adding a monument (no code changes)

Create `content/monuments/<slug>/` containing:

```
manifest.json          the monument (schema below, TypeScript types in lib/types.ts)
facts.json             { monument, facts: [{ id, text:{az,en}, sources:[{title,url}], conf, tags?, verify?, year? }] }
photos.sources.json    [{ id, commons: "File title.jpg", caption:{az,en}, crop?, modified? }]  → npm run photos <slug>
narration/<zone>.json  { zone, text:{az,en}, factIds, generatedBy }  (+ "intro"; optional qa.json for mock mode)
narration/<zone>.<era>.json   one per era when the walk has eras ({ …, era })
```

Then run `npm run photos <slug>` and `npm run build`. The home page, map pin, `/m/<slug>`, `/m/<slug>/walk`, AR models and Q&A all pick it up from these files.

### `manifest.json`

```jsonc
{
  "slug": "my-monument", "order": 4,
  "name": { "az": "…", "en": "…" }, "tagline": {…}, "period": {…},
  "location": { "lat": 40.0, "lon": 49.0, "place": {…} },
  "cover": "photo_id",
  "eras": { "past":  { "label": {…}, "badge": {…}, "summary": {…} },
            "today": { "label": {…}, "badge": {…}, "summary": {…} } },   // or any number of eras, e.g. xix / ruin / today
  "eraOrder": ["past", "today"],   // toggle order (optional)
  "confLabels": { "ok": { "short": {…}, "long": {…} }, … },  // optional per-monument wording of the confidence levels
  "architect": { "name": {…}, "role": {…}, "voice": "male", "greeting": {…},
                 "look": { "robe": "#2f5d7c", "sash": "#d9a441", "headwear": "turban|kalpak|cap|papaq", "beard": true, "chokha": false },
                 "historical": { "knowsUntil": 1885, "note": {…} } },  // only for a real, named person (see Honesty rules)
  "exterior": {                     // maquette, build coords: x east, y north, z up, metres
    "scale": 0.008, "home": { "target": [0, 0.06, 0], "az": -38, "pol": 58, "dist": 1.05 },
    "palette": { "stone": [214, 192, 150] }, "eraMat": { "past": { "stone": "stone_rs" } },
    "parts": [ { "t": "box", "size": [10, 8, 6], "at": [0, 0, 0] },
               { "t": "dome", "r": 3, "h": 3, "at": [0, 0, 6], "eras": ["past"] } ]
  },
  "buildings": [ { "id": "main", "name": {…}, "date": {…}, "pos": [0, 0, 12], "conf": "ok|mid|hyp",
                   "text": {…} | "past"/"today": {…} | "byEra": { "<era>": {…} }, "photos": ["id"], "factIds": ["id"],
                   "walk": true, "interior": "key", "pastOnly": false, "eras": ["<era>"] } ],
  "interiors": { "key": { "shape": "oct|rect", "size": 4, "h": 5, "dome": {…}, "openings": [...], "furniture": [...] } },
  "walk": {                         // three.js coords: x east, y up, z south, metres
    "title": {…}, "cta": {…}, "start": { "x": 0, "z": 10, "yaw": 0 }, "defaultFloor": 0,
    "eras": ["xix", "ruin", "today"], "defaultEra": "today",          // optional: era toggle inside the walk
    "eraLook": { "ruin": { "sky": "#c4cfd6", "fog": [45, 130], "alias": { "wallIn": "limeWorn", "daylight": "none" } } },
    "map": { "bounds": [x0, x1, z0, z1], "hide": ["outside"], "levels": [ { "name": {…}, "y": 3.5, "at": [x, z] } ] },
    "elements": [ … architecture kit elements … ],
    "zones": [ { "id": "hall", "rect": [x0, x1, z0, z1], "floor": 1.2 } ],
    "zoneInfo": { "hall": { "title": {…}, "text": {…}, "conf": "ok", "photos": ["id"], "factIds": ["id"],
                            "links": [ { "title": {…}, "url": "…" } ],     // photos that may not be embedded
                            "byEra": { "ruin": { "text": {…}, "conf": "mid", "photos": [] } } } }
  },
  "disclaimer": {…}
}
```

**Architecture kit elements** (`walk.elements`, built by `lib/kit/elements.ts`):

- **Walls:** `wall` (pointed-arch `ops`: door, window, niche, with fills `shebeke | stained | glass | mirror | open`), `octWalls`, `ngonWalls`, `room` (4 walls + barrel or flat vault), `cylWall` (open arc or thick ring).
- **Vaults and domes:** `vault`, `dome` (with optional oculus `hole`), `octRing`, `ringCap`, `muqarnas`, `drumLights`, `band`.
- **Stairs:** `stair` (straight), `spiralStair`, `ringStair` (helix inside a wall).
- **Floors and terrain:** `floor`, `disc` (with hole and arc), `terrain`, `quad`, `box`, `plane`.
- **Water:** `pool`, `fountain`, `well`.
- **Decoration:** `relief` (star, kufic, rosette), `mirrorWall`, `painting`.
- **Light:** `light`, `shaft` (light beam + dust).
- **Frames:** `group` (local frame `{pos, rot}`).
- **`furniture`:** carpet, cushion, jug, lamp, chest, tray, lectern, loom, cypress, bush, cenotaph, mihrab, minbar, lampRing, bench, cannon, pool, skylights, brazier.
- **Karabakh mosque set** ([lib/kit/karabakh.ts](lib/kit/karabakh.ts)): `minaret` (brick shaft with belts, timber lantern, metal cap), `kColumn` (octagonal stone pillar with faceted capital), `sailVault` (domed bay on a square plan, optional broken crown `hole`), `gallery` (two-storey gallery slab with balustrade, `broken` for ruins), `rubble`, `patches` (fallen plaster).
- **Eras:** any element can carry `"eras": [...]`; materials can be swapped per era with `walk.eraLook[era].alias`, and aliasing a material to `"none"` removes those surfaces (e.g. glass that is gone). Wall openings that overlap along a wall are stacked (lower and upper windows).
- **Exterior parts** also include `minaret`, `hipRoof` and `bush`. Switching eras on the maquette plays a "time sweep": a glowing plane crosses the model and swaps the geometry as it passes (instant with reduced motion).

Static geometry is merged per material, which usually gives a single-digit number of meshes. Point lights come from a fixed pool of 6 that follows the nearest lamps.

**Zones** are `rect`, `oct`, `ngon`, `circle`, `ring` or `poly` shapes, optionally inside a `frame`. A zone's `floor` is a number, a `ramp`, or a `helix` for spiral stairs. Movement is allowed only inside zones and slides along walls. A zone is accepted only if its floor is within 0.5 m of the current floor, which makes stacked storeys work.

**Confidence:** `ok` means standing or observed, `mid` means evidence-based (remains, plans, old photos), `hyp` means hypothesis. Use it on every building, zone and fact.

The manifests for the first three monuments were written with small generator scripts. Their JSON in `content/` is the source of truth; edit it directly. **Exception:** the Aghdam mosque's geometry (`exterior.parts`, `walk.elements`, `walk.zones`, `walk.obstacles`) is generated by [scripts/monuments/aghdam-mosque.ts](scripts/monuments/aghdam-mosque.ts); edit the script and rerun it. All its text lives in the JSON and is kept.

## Deploy to Vercel

1. Push the repo and import it in Vercel (framework: Next.js; build command `npm run build`, which also runs the content step).
2. Optionally add the env vars above in Project → Settings → Environment Variables.
3. Deploy. The API routes run on the Node.js runtime; everything else is static.

Note: `public/monuments/` is generated and git-ignored, so the build recreates it from `content/`.

## Platform notes

- **Mobile:** works on iPhone Safari and Android Chrome. There's a touch pad and drag-to-look, and the architect dock keeps out of the controls. A "Start the walk" tap unlocks audio on iOS.
- **Performance:**
  - Phones use the low tier (no AO, DPR ≤ 1.5).
  - Desktops get N8AO + SMAA and drop to the low tier automatically below 40 fps.
  - Force a tier with `?q=low|high`; add `?debug` for fps, draw calls and triangle counts.
  - 60 fps on a GTX 1050 at 1280×800.
- **AR:** "AR-da bax" opens `<model-viewer>` with the exported GLB (WebXR, Scene Viewer) or the pre-built USDZ (iOS Quick Look). Building names are baked into the models as 3D signs ([scripts/ar-labels.ts](scripts/ar-labels.ts)), one model per language. three.js stays the main renderer.
- **Offline / PWA:** installable. A service worker caches photos, models and narration audio after first use.
- **Language:** AZ/EN toggle; Azerbaijani by default. Voice input uses the Web Speech API (`az-AZ`) where the browser supports it; the text box always works.

## Honesty rules (built into content and prompts)

- 3D models are approximate reconstructions, not measured data, and each part is labelled with its confidence.
- The architects (Usta Rəşid, Usta Fərrux, Usta Kərim) are invented representative characters, not historical people. They say so when asked.
- Kərbəlayi Səfixan Qarabaği (Aghdam) is a real architect shown as a stylised, representative figure: no authentic portrait is known, and the app says so. He speaks first-hand only about his own time (`architect.historical.knowsUntil`); facts with a later `year` are quoted ("Mənbələr yazır ki…"), never told as a witness.
- Where sources disagree, the text says so ("mənbələrdə fərqli göstərilir") and cites both.
- They answer only from sourced facts and say "historians are unsure" when the facts don't cover a question.
- Claims that need a historian's review are listed in `CONTENT_TODO.md`.
- Photos come from Wikimedia Commons and show author, license and file page wherever they appear.
- Map outlines: Natural Earth (public domain).
