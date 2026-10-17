/* Procedural canvas textures (ported from reference/walk.js + interior.js, extended).
   Browser-only: needs document.createElement("canvas"). */
import * as THREE from "three";

export function rnd(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;
const cache = new Map<string, THREE.CanvasTexture>();

export function ctex(key: string, w: number, h: number, draw: Draw, srgb = true): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** height canvas -> tangent-space normal map (cheap relief for stone joints and carving) */
function normalFrom(key: string, src: HTMLCanvasElement, strength = 2.2): THREE.CanvasTexture {
  return ctex(key, src.width, src.height, (g, w, h) => {
    const s = src.getContext("2d")!.getImageData(0, 0, w, h).data;
    const out = g.createImageData(w, h);
    const lum = (x: number, y: number) => {
      const i = (((y + h) % h) * w + ((x + w) % w)) * 4;
      return (s[i] + s[i + 1] + s[i + 2]) / 765;
    };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = (lum(x + 1, y) - lum(x - 1, y)) * strength;
        const dy = (lum(x, y + 1) - lum(x, y - 1)) * strength;
        const len = Math.hypot(dx, dy, 1);
        const i = (y * w + x) * 4;
        out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
        out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
        out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
        out.data[i + 3] = 255;
      }
    g.putImageData(out, 0, 0);
  }, false);
}

/** alternating tall/short courses in two stone tones (Shirvanshahs masonry) */
export function stoneTex(tone: "light" | "grey" | "brick" = "light") {
  const key = `stone-${tone}`;
  const base = {
    light: { mortar: "#a08a66", a: [216, 199, 163], b: [196, 176, 138] },
    grey: { mortar: "#6a6255", a: [158, 149, 130], b: [128, 119, 102] },
    brick: { mortar: "#9a8466", a: [196, 150, 110], b: [178, 132, 96] },
  }[tone];
  const t = ctex(key, 512, 512, (g, w, h) => {
    const r = rnd(9);
    g.fillStyle = base.mortar;
    g.fillRect(0, 0, w, h);
    const courses = tone === "brick" ? [0.12, 0.12, 0.12, 0.12] : [0.36, 0.14, 0.36, 0.14];
    let y = 0, k = 0;
    while (y < h) {
      const ch = (courses[k % 4] / 2) * h, light = k % 2 === 0;
      let x = -r() * 80;
      while (x < w) {
        const bw = tone === "brick" ? 48 + r() * 8 : (light ? 90 : 60) + r() * 60, v = (r() - 0.5) * 18;
        const c = light ? base.a : base.b;
        g.fillStyle = `rgb(${(c[0] + v) | 0},${(c[1] + v) | 0},${(c[2] + v) | 0})`;
        g.fillRect(x + 1.5, y + 1.5, bw - 3, ch - 3);
        for (let i = 0; i < 14; i++) {
          g.fillStyle = `rgba(90,70,45,${r() * 0.08})`;
          g.fillRect(x + r() * bw, y + r() * ch, 2 + r() * 4, 2 + r() * 4);
        }
        x += bw;
      }
      y += ch;
      k++;
    }
  });
  return t;
}

export function stoneNormal(tone: "light" | "grey" | "brick" = "light") {
  const t = stoneTex(tone);
  return normalFrom(`stone-${tone}-n`, t.image as HTMLCanvasElement, 3);
}

export function floorTex(tone: "light" | "grey" | "brick" = "light") {
  return ctex(`floor-${tone}`, 512, 512, (g, w, h) => {
    const r = rnd(4);
    const col = tone === "grey" ? [160, 152, 136] : tone === "brick" ? [176, 120, 86] : [184, 166, 132];
    g.fillStyle = tone === "grey" ? "#6f675a" : "#857257";
    g.fillRect(0, 0, w, h);
    const n = tone === "brick" ? 8 : 4, s = w / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const v = (r() - 0.5) * 22;
        g.fillStyle = `rgb(${(col[0] + v) | 0},${(col[1] + v) | 0},${(col[2] + v) | 0})`;
        g.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
      }
  });
}

export function shebekeTex() {
  return ctex("shebeke", 256, 256, (g, w, h) => {
    g.fillStyle = "#fff4d8";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#5e4a30";
    g.lineWidth = 7;
    g.lineJoin = "round";
    const cell = 64;
    for (let cy = 0; cy <= h; cy += cell)
      for (let cx = 0; cx <= w; cx += cell) {
        const s = 22;
        g.strokeRect(cx - s, cy - s, s * 2, s * 2);
        g.beginPath();
        g.moveTo(cx, cy - s * 1.41); g.lineTo(cx + s * 1.41, cy); g.lineTo(cx, cy + s * 1.41); g.lineTo(cx - s * 1.41, cy);
        g.closePath();
        g.stroke();
        g.beginPath();
        g.moveTo(cx + s * 1.41, cy); g.lineTo(cx + cell - s * 1.41, cy);
        g.moveTo(cx, cy + s * 1.41); g.lineTo(cx, cy + cell - s * 1.41);
        g.stroke();
      }
  });
}

/** coloured-glass orosi lattice (Qajar / Sheki windows): wooden star lattice with muted glass panes */
export function stainedTex() {
  return ctex("stained", 256, 256, (g, w, h) => {
    const cell = 64;
    const glass = ["#b8443a", "#e3b04b", "#3f6fae", "#5f9e6e", "#f4e7c4"];
    for (let cy = 0; cy < h; cy += cell)
      for (let cx = 0; cx < w; cx += cell) {
        // symmetric colour layout: centre star, four petals, corners
        g.fillStyle = glass[4]; g.fillRect(cx, cy, cell, cell);
        g.fillStyle = glass[1];
        g.beginPath(); for (let k = 0; k < 16; k++) { const a = (k * Math.PI) / 8, r = k % 2 ? 9 : 20; g.lineTo(cx + 32 + Math.cos(a) * r, cy + 32 + Math.sin(a) * r); } g.closePath(); g.fill();
        [[32, 4, 0], [60, 32, 2], [32, 60, 0], [4, 32, 2]].forEach(([x, y, c]) => { g.fillStyle = glass[c]; g.beginPath(); g.ellipse(cx + x, cy + y, 9, 9, 0, 0, Math.PI * 2); g.fill(); });
        [[0, 0], [64, 0], [0, 64], [64, 64]].forEach(([x, y]) => { g.fillStyle = glass[3]; g.beginPath(); g.arc(cx + x, cy + y, 10, 0, Math.PI * 2); g.fill(); });
      }
    g.strokeStyle = "#4a2e1a";
    g.lineWidth = 5;
    g.lineJoin = "round";
    for (let cy = 0; cy <= h; cy += cell)
      for (let cx = 0; cx <= w; cx += cell) {
        g.beginPath(); for (let k = 0; k <= 16; k++) { const a = (k * Math.PI) / 8, r = k % 2 ? 9 : 20; g.lineTo(cx + 32 + Math.cos(a) * r, cy + 32 + Math.sin(a) * r); } g.stroke();
        g.beginPath(); g.moveTo(cx, cy + 32); g.lineTo(cx + 12, cy + 32); g.moveTo(cx + 52, cy + 32); g.lineTo(cx + 64, cy + 32); g.moveTo(cx + 32, cy); g.lineTo(cx + 32, cy + 12); g.moveTo(cx + 32, cy + 52); g.lineTo(cx + 32, cy + 64); g.stroke();
        g.strokeRect(cx, cy, cell, cell);
      }
  });
}

/** kufic-like inscription band */
export function bandTex() {
  const t = ctex("band", 1024, 64, (g, w, h) => {
    g.fillStyle = "#2f6f6c";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#e7d7b4";
    g.lineWidth = 4;
    for (let x = 6; x < w; x += 28) {
      const t = (x / 28) % 4;
      g.beginPath();
      g.moveTo(x, h - 12); g.lineTo(x, 12 + t * 4);
      if (t > 1) g.lineTo(x + 14, 12 + t * 4);
      g.stroke();
      g.beginPath();
      g.moveTo(x - 6, h - 12); g.lineTo(x + 22, h - 12);
      g.stroke();
    }
  });
  t.repeat.set(6, 1);
  return t;
}

export function carpetTex(i: number) {
  const variants: [number, string, string][] = [[3, "#8e2a20", "#2f7d78"], [8, "#1f4f6e", "#a33a2b"], [13, "#7a2f45", "#d9a441"]];
  const [seed, field, field2] = variants[((i % 3) + 3) % 3];
  return ctex(`carpet-${i % 3}`, 512, 768, (g, w, h) => {
    const r = rnd(seed);
    g.fillStyle = "#1c2a4a"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#e9dcc0"; g.fillRect(14, 14, w - 28, h - 28);
    g.fillStyle = "#1c2a4a"; g.fillRect(28, 28, w - 56, h - 56);
    g.fillStyle = field; g.fillRect(52, 52, w - 104, h - 104);
    g.fillStyle = "#d9a441";
    for (let x = 30; x < w - 30; x += 22)
      [[30, 48], [h - 30, h - 48]].forEach(([a, b]) => {
        g.beginPath(); g.moveTo(x, a); g.lineTo(x + 11, b); g.lineTo(x + 22, a); g.fill();
      });
    const gol = (cx: number, cy: number, s: number) => {
      ([[1, "#1c2a4a"], [0.82, "#e9dcc0"], [0.66, field2], [0.45, "#d9a441"], [0.22, field]] as [number, string][]).forEach(([k, c]) => {
        g.fillStyle = c;
        g.beginPath();
        g.moveTo(cx, cy - s * k); g.lineTo(cx + s * k * 0.75, cy); g.lineTo(cx, cy + s * k); g.lineTo(cx - s * k * 0.75, cy);
        g.closePath();
        g.fill();
      });
      g.fillStyle = "#e9dcc0";
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([a, b]) => g.fillRect(cx + a * s * 0.95 - 4, cy + b * s * 1.2 - 4, 8, 8));
    };
    gol(w / 2, h * 0.27, 70); gol(w / 2, h * 0.5, 70); gol(w / 2, h * 0.73, 70);
    g.fillStyle = "#d9a441";
    for (let k = 0; k < 50; k++) g.fillRect(70 + r() * (w - 140), 70 + r() * (h - 140), 5, 5);
  });
}

/** mirror mosaic (aynakari): small facets of varying brightness in a star lattice */
export function mirrorTex() {
  return ctex("mirror", 512, 512, (g, w, h) => {
    const r = rnd(33);
    g.fillStyle = "#3a3630";
    g.fillRect(0, 0, w, h);
    const s = 32;
    for (let y = 0; y < h; y += s)
      for (let x = 0; x < w; x += s) {
        for (let k = 0; k < 4; k++) {
          const v = 150 + r() * 105 | 0;
          g.fillStyle = `rgb(${v},${v},${Math.min(255, v + 12)})`;
          g.beginPath();
          const cx = x + s / 2, cy = y + s / 2;
          const a = (k * Math.PI) / 2;
          g.moveTo(cx, cy);
          g.lineTo(cx + Math.cos(a) * s * 0.48, cy + Math.sin(a) * s * 0.48);
          g.lineTo(cx + Math.cos(a + Math.PI / 2) * s * 0.48, cy + Math.sin(a + Math.PI / 2) * s * 0.48);
          g.closePath();
          g.fill();
        }
      }
    g.strokeStyle = "#c9a45a";
    g.lineWidth = 2;
    for (let y = 0; y <= h; y += s * 2)
      for (let x = 0; x <= w; x += s * 2) {
        g.beginPath();
        g.arc(x, y, s * 0.9, 0, Math.PI * 2);
        g.stroke();
      }
  });
}

/** Qajar-style glazed tile: cobalt ground, cream arabesque, yellow and turquoise accents */
export function tileTex() {
  return ctex("tile", 256, 256, (g, w, h) => {
    g.fillStyle = "#2c4f86";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#e9dcb8";
    g.lineWidth = 5;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.strokeStyle = "#d9b45a";
    g.lineWidth = 4;
    for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]]) { g.beginPath(); g.arc(cx, cy, 56, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = "#efe4c8";
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      g.beginPath(); g.ellipse(w / 2 + Math.cos(a) * 40, h / 2 + Math.sin(a) * 40, 22, 9, a, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = "#3fa39b";
    g.beginPath(); g.arc(w / 2, h / 2, 18, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#d9b45a";
    g.beginPath(); g.arc(w / 2, h / 2, 8, 0, Math.PI * 2); g.fill();
  });
}

/** painted panel (floral / hunt / portrait silhouettes) for the Hall of Mirrors */
export function paintingTex(motif: "floral" | "hunt" | "portrait") {
  return ctex(`paint-${motif}`, 256, 384, (g, w, h) => {
    g.fillStyle = "#e9dcc0";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#7a5a2a";
    g.lineWidth = 10;
    g.strokeRect(5, 5, w - 10, h - 10);
    if (motif === "portrait") {
      g.fillStyle = "#6e2a20";
      g.fillRect(50, 150, w - 100, h - 190);
      g.fillStyle = "#c9a07a";
      g.beginPath(); g.ellipse(w / 2, 115, 34, 42, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#1c1410";
      g.beginPath(); g.ellipse(w / 2, 145, 30, 34, 0, 0, Math.PI); g.fill();
      g.fillRect(w / 2 - 36, 60, 72, 26);
      g.fillStyle = "#d9a441";
      g.fillRect(70, 230, w - 140, 10);
    } else if (motif === "hunt") {
      g.fillStyle = "#c9b48a"; g.fillRect(20, 20, w - 40, h - 40);
      g.fillStyle = "#5a3a22";
      g.beginPath(); g.ellipse(w / 2, 230, 70, 30, 0, 0, Math.PI * 2); g.fill();
      g.fillRect(w / 2 - 60, 240, 10, 60); g.fillRect(w / 2 + 50, 240, 10, 60);
      g.fillStyle = "#6e2a20"; g.fillRect(w / 2 - 15, 150, 30, 70);
      g.fillStyle = "#c9a07a"; g.beginPath(); g.arc(w / 2, 140, 16, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = "#2f6f6c";
      for (let k = 0; k < 7; k++) {
        const y = 60 + k * 42;
        g.beginPath(); g.ellipse(w / 2 - 30, y, 22, 10, -0.5, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(w / 2 + 30, y + 14, 22, 10, 0.5, 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = "#2f6f6c"; g.lineWidth = 5;
      g.beginPath(); g.moveTo(w / 2, 40); g.lineTo(w / 2, h - 40); g.stroke();
      g.fillStyle = "#a33a2b";
      for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(w / 2, 70 + k * 80, 13, 0, Math.PI * 2); g.fill(); }
    }
  });
}

/** carved relief (star / kufic / rosette) for portals — used as albedo + normal */
export function reliefTex(pattern: "star" | "kufic" | "rosette") {
  return ctex(`relief-${pattern}`, 256, 256, (g, w, h) => {
    g.fillStyle = "#d8c49c";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#8f7a55";
    g.fillStyle = "#efe0bc";
    g.lineWidth = 5;
    if (pattern === "star") {
      for (let y = 0; y <= h; y += 64)
        for (let x = 0; x <= w; x += 64) {
          g.beginPath();
          for (let k = 0; k < 16; k++) {
            const a = (k * Math.PI) / 8, rr = k % 2 ? 14 : 30;
            g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
          }
          g.closePath(); g.fill(); g.stroke();
        }
    } else if (pattern === "rosette") {
      for (let k = 0; k < 12; k++) {
        const a = (k * Math.PI) / 6;
        g.beginPath(); g.ellipse(w / 2 + Math.cos(a) * 60, h / 2 + Math.sin(a) * 60, 40, 16, a, 0, Math.PI * 2); g.fill(); g.stroke();
      }
      g.beginPath(); g.arc(w / 2, h / 2, 30, 0, Math.PI * 2); g.fill(); g.stroke();
    } else {
      for (let x = 10; x < w; x += 32) {
        g.fillRect(x, 40, 12, h - 80);
        g.strokeRect(x, 40, 12, h - 80);
        g.fillRect(x, h - 52, 26, 12);
      }
    }
  });
}

export function reliefNormal(pattern: "star" | "kufic" | "rosette") {
  const t = reliefTex(pattern);
  return normalFrom(`relief-${pattern}-n`, t.image as HTMLCanvasElement, 5);
}

/** soft radial gradient for light shafts and dust */
export function glowTex() {
  return ctex("glow", 64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, "rgba(255,240,200,0)");
    gr.addColorStop(0.5, "rgba(255,240,200,1)");
    gr.addColorStop(1, "rgba(255,240,200,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    const fade = g.createLinearGradient(0, 0, 0, h);
    fade.addColorStop(0, "rgba(0,0,0,0)");
    fade.addColorStop(1, "rgba(0,0,0,1)");
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = fade;
    g.fillRect(0, 0, w, h);
  });
}

/* ---------------- Karabakh mosque set (Aghdam) ---------------- */

/** minaret brickwork: running-bond courses with lighter bricks forming a lozenge lattice
   (Aghdam / Shusha minarets). "blue" is the glazed blue-and-white look after the 2022–24 restoration. */
export function minaretBrickTex(tone: "red" | "blue" = "red") {
  return ctex(`minaret-${tone}`, 256, 256, (g, w, h) => {
    const r = rnd(tone === "red" ? 41 : 43);
    const mortar = tone === "red" ? "#cdbb9c" : "#e9e6de";
    const dark = tone === "red" ? [150, 78, 52] : [38, 52, 92];
    const light = tone === "red" ? [226, 214, 190] : [236, 236, 230];
    g.fillStyle = mortar;
    g.fillRect(0, 0, w, h);
    const bw = 32, bh = 16, cells = w / bw;
    for (let row = 0; row < h / bh; row++)
      for (let col = -1; col <= cells; col++) {
        const x = col * bw + (row % 2 ? bw / 2 : 0);
        // lozenge lattice: light bricks on two diagonals of an 8×8-brick repeat
        const cx = Math.round((x + bw / 2) / (bw / 2)) % 8, cy = row % 8;
        const onDiag = cx === cy || cx === (8 - cy) % 8;
        const c = onDiag ? light : dark;
        const j = (r() - 0.5) * 22;
        g.fillStyle = `rgb(${c[0] + j},${c[1] + j * 0.7},${c[2] + j * 0.6})`;
        g.fillRect(x + 1.5, row * bh + 1.5, bw - 3, bh - 3);
      }
  });
}

/** grey-and-white marble cladding slabs (added in the 1970s–80s) */
export function marbleTex(worn = false) {
  return ctex(`marble-${worn}`, 512, 512, (g, w, h) => {
    const r = rnd(worn ? 77 : 71);
    const sw = 128, sh = 96;
    for (let row = 0; row < Math.ceil(h / sh); row++)
      for (let col = 0; col < w / sw; col++) {
        const grey = (row + col) % 2 === 0 ? r() < 0.75 : r() < 0.2;
        const base = grey ? 150 + r() * 25 : 218 + r() * 20;
        g.fillStyle = `rgb(${base},${base + 2},${base + 4})`;
        g.fillRect(col * sw, row * sh, sw, sh);
        g.strokeStyle = "rgba(90,90,90,.25)";
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          g.moveTo(col * sw + r() * sw, row * sh);
          g.bezierCurveTo(col * sw + r() * sw, row * sh + sh * 0.3, col * sw + r() * sw, row * sh + sh * 0.7, col * sw + r() * sw, row * sh + sh);
          g.stroke();
        }
        if (worn && r() < 0.28) {
          // missing slab: rough rubble stone shows through
          g.fillStyle = `rgb(${176 + r() * 20},${160 + r() * 16},${126 + r() * 14})`;
          g.fillRect(col * sw + 2, row * sh + 2, sw - 4, sh - 4);
          for (let k = 0; k < 14; k++) {
            g.fillStyle = `rgba(110,92,70,${0.25 + r() * 0.3})`;
            g.fillRect(col * sw + r() * sw, row * sh + r() * sh, 10 + r() * 22, 6 + r() * 12);
          }
        }
        g.fillStyle = "rgba(60,60,60,.5)";
        g.fillRect(col * sw, row * sh, sw, 2);
        g.fillRect(col * sw, row * sh, 2, sh);
      }
    if (worn) {
      g.fillStyle = "rgba(70,60,45,.18)";
      for (let k = 0; k < 40; k++) g.fillRect(r() * w, r() * h * 0.2 + h * 0.8, 3 + r() * 6, 20 + r() * 60);
    }
  });
}

/** lime plaster; worn = peeling patches with rubble stone behind and water stains */
export function plasterTex(worn = false) {
  return ctex(`plaster-${worn}`, 512, 512, (g, w, h) => {
    const r = rnd(worn ? 91 : 93);
    g.fillStyle = worn ? "#ddd2bb" : "#f2ede2";
    g.fillRect(0, 0, w, h);
    for (let k = 0; k < 260; k++) {
      g.fillStyle = `rgba(${worn ? "150,130,100" : "200,190,170"},${r() * 0.08})`;
      g.beginPath();
      g.arc(r() * w, r() * h, 6 + r() * 40, 0, Math.PI * 2);
      g.fill();
    }
    if (!worn) return;
    for (let k = 0; k < 4; k++) {
      const x = r() * w, y = r() * h, rw = 24 + r() * 70, rh = 18 + r() * 50;
      g.fillStyle = `rgb(${168 + r() * 20},${148 + r() * 16},${116 + r() * 14})`;
      g.beginPath();
      for (let a = 0; a < 12; a++) {
        const t = (a / 12) * Math.PI * 2, f = 0.7 + r() * 0.5;
        g.lineTo(x + Math.cos(t) * rw * f, y + Math.sin(t) * rh * f);
      }
      g.closePath();
      g.fill();
      for (let s = 0; s < 10; s++) {
        g.fillStyle = `rgba(105,88,66,${0.3 + r() * 0.3})`;
        g.fillRect(x + (r() - 0.5) * rw, y + (r() - 0.5) * rh, 8 + r() * 18, 5 + r() * 10);
      }
    }
    const st = g.createLinearGradient(0, 0, 0, h);
    st.addColorStop(0, "rgba(90,80,60,.22)");
    st.addColorStop(0.35, "rgba(90,80,60,0)");
    g.fillStyle = st;
    g.fillRect(0, 0, w, h);
  });
}

/** historic stone pavement (setts) at the entrance */
export function settsTex() {
  return ctex("setts", 512, 512, (g, w, h) => {
    const r = rnd(57);
    g.fillStyle = "#6f6455";
    g.fillRect(0, 0, w, h);
    const s = 64;
    for (let row = 0; row < h / s; row++)
      for (let col = -1; col <= w / s; col++) {
        const x = col * s + (row % 2 ? s / 2 : 0) + (r() - 0.5) * 6, y = row * s + (r() - 0.5) * 6;
        const v = 150 + r() * 45;
        g.fillStyle = `rgb(${v},${v - 8},${v - 22})`;
        g.beginPath();
        g.roundRect(x + 4, y + 4, s - 8 + (r() - 0.5) * 8, s - 8 + (r() - 0.5) * 8, 10);
        g.fill();
      }
  });
}

/** standing-seam sheet metal roof */
export function metalRoofTex() {
  return ctex("metal-roof", 256, 256, (g, w, h) => {
    g.fillStyle = "#b9bec2";
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      g.fillStyle = "#d8dcdf";
      g.fillRect(x, 0, 3, h);
      g.fillStyle = "#8f959a";
      g.fillRect(x + 3, 0, 2, h);
    }
  });
}
