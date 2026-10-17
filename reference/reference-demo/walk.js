/* Walkable interior of the Shirvanshahs' palace building (approximate reconstruction).
   Based on: published plan of the central octagonal hall (S = 34.15 m², portal stair, NE chamber "3",
   NW spiral stair "5"), and descriptions: west portal leading to an octagonal domed hall, a small
   octagonal vestibule linking other rooms, three narrow spiral stairs, bay windows on S/E facades,
   "shebeke" stone gratings, masonry in alternating courses. Rooms R1–R3 are illustrative. */
const WALK = (() => {
  const T = THREE, F = 1.2, EYE = 1.62, D2R = Math.PI / 180;
  const scene = new T.Scene();
  scene.background = new T.Color(0xbcd6e8);
  scene.fog = new T.Fog(0xbcd6e8, 30, 90);

  /* ---------- textures ---------- */
  function ctex(w, h, draw){
    const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t;
  }
  function rnd(seed){ let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  // alternating tall/short courses in two stone tones (as described for the palace masonry)
  const stoneT = ctex(512, 512, (g, w, h) => {
    const r = rnd(9); g.fillStyle = "#a08a66"; g.fillRect(0, 0, w, h);
    const courses = [0.36, 0.14, 0.36, 0.14]; let y = 0, k = 0;
    while (y < h){
      const ch = courses[k % 4] / 2 * h, light = k % 2 === 0;
      let x = -r() * 80;
      while (x < w){
        const bw = (light ? 90 : 60) + r() * 60, v = (r() - 0.5) * 18;
        const base = light ? [216, 199, 163] : [196, 176, 138];
        g.fillStyle = `rgb(${base[0]+v|0},${base[1]+v|0},${base[2]+v|0})`;
        g.fillRect(x + 1.5, y + 1.5, bw - 3, ch - 3);
        for (let i = 0; i < 10; i++){ g.fillStyle = `rgba(90,70,45,${r()*0.07})`; g.fillRect(x + r()*bw, y + r()*ch, 2 + r()*4, 2 + r()*4); }
        x += bw;
      }
      y += ch; k++;
    }
  });
  const floorT = ctex(512, 512, (g, w, h) => {
    const r = rnd(4); g.fillStyle = "#857257"; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++){
      const v = (r() - 0.5) * 22; g.fillStyle = `rgb(${184+v|0},${166+v|0},${132+v|0})`; g.fillRect(x*128 + 2, y*128 + 2, 124, 124);
    }
  });
  const shebekeT = ctex(256, 256, (g, w, h) => {
    g.fillStyle = "#fff4d8"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#5e4a30"; g.lineWidth = 7; g.lineJoin = "round";
    const cell = 64;
    for (let cy = 0; cy <= h; cy += cell) for (let cx = 0; cx <= w; cx += cell){
      const s = 22;
      g.strokeRect(cx - s, cy - s, s * 2, s * 2);
      g.beginPath(); g.moveTo(cx, cy - s * 1.41); g.lineTo(cx + s * 1.41, cy); g.lineTo(cx, cy + s * 1.41); g.lineTo(cx - s * 1.41, cy); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(cx + s * 1.41, cy); g.lineTo(cx + cell - s * 1.41, cy); g.moveTo(cx, cy + s * 1.41); g.lineTo(cx, cy + cell - s * 1.41); g.stroke();
    }
  });
  const bandT = ctex(1024, 64, (g, w, h) => {
    g.fillStyle = "#2f6f6c"; g.fillRect(0, 0, w, h); g.strokeStyle = "#e7d7b4"; g.lineWidth = 4;
    for (let x = 6; x < w; x += 28){ const t = (x / 28) % 4;
      g.beginPath(); g.moveTo(x, h - 12); g.lineTo(x, 12 + t * 4); if (t > 1) g.lineTo(x + 14, 12 + t * 4); g.stroke();
      g.beginPath(); g.moveTo(x - 6, h - 12); g.lineTo(x + 22, h - 12); g.stroke(); }
  });
  bandT.repeat.set(6, 1);
  function carpetT(seed, field, field2){
    return ctex(512, 768, (g, w, h) => {
      const r = rnd(seed);
      g.fillStyle = "#1c2a4a"; g.fillRect(0, 0, w, h); g.fillStyle = "#e9dcc0"; g.fillRect(14, 14, w-28, h-28);
      g.fillStyle = "#1c2a4a"; g.fillRect(28, 28, w-56, h-56); g.fillStyle = field; g.fillRect(52, 52, w-104, h-104);
      g.fillStyle = "#d9a441";
      for (let x = 30; x < w - 30; x += 22){ [[30, 48], [h-30, h-48]].forEach(([a, b]) => { g.beginPath(); g.moveTo(x, a); g.lineTo(x+11, b); g.lineTo(x+22, a); g.fill(); }); }
      const gol = (cx, cy, s) => {
        [[1, "#1c2a4a"], [0.82, "#e9dcc0"], [0.66, field2], [0.45, "#d9a441"], [0.22, field]].forEach(([k, c]) => {
          g.fillStyle = c; g.beginPath(); g.moveTo(cx, cy - s*k); g.lineTo(cx + s*k*0.75, cy); g.lineTo(cx, cy + s*k); g.lineTo(cx - s*k*0.75, cy); g.closePath(); g.fill(); });
        g.fillStyle = "#e9dcc0"; [[-1,0],[1,0],[0,-1],[0,1]].forEach(([a,b]) => g.fillRect(cx + a*s*0.95 - 4, cy + b*s*1.2 - 4, 8, 8));
      };
      gol(w/2, h*0.27, 70); gol(w/2, h*0.5, 70); gol(w/2, h*0.73, 70);
      g.fillStyle = "#d9a441"; for (let i = 0; i < 50; i++) g.fillRect(70 + r()*(w-140), 70 + r()*(h-140), 5, 5);
    });
  }
  const carpets = [carpetT(3, "#8e2a20", "#2f7d78"), carpetT(8, "#1f4f6e", "#a33a2b"), carpetT(13, "#7a2f45", "#d9a441")];

  /* ---------- materials ---------- */
  const P = o => new T.MeshPhongMaterial(Object.assign({shininess: 4, specular: 0x111111}, o));
  const mStone = P({map: stoneT}), mFloor = P({map: floorT}), mDark = P({color: 0x7a6548});
  const mWood = P({color: 0x6b4a2e}), mCopper = P({color: 0xb87333, shininess: 60, specular: 0x664422});
  const mShebeke = new T.MeshBasicMaterial({map: shebekeT, side: T.DoubleSide, toneMapped: false});
  const mGlow = new T.MeshBasicMaterial({color: 0xffd28a, toneMapped: false});
  const mBand = P({map: bandT, side: T.DoubleSide});
  const mStoneDS = P({map: stoneT, side: T.DoubleSide});

  /* ---------- geometry helpers ---------- */
  function worldUV(geo, s = 2){
    geo.computeVertexNormals();
    const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++){
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      let u, v;
      if (ay >= ax && ay >= az){ u = x; v = z; } else if (ax >= az){ u = z; v = y; } else { u = x; v = y; }
      uv[i*2] = u / s; uv[i*2+1] = v / s;
    }
    geo.setAttribute("uv", new T.BufferAttribute(uv, 2));
    return geo;
  }
  function add(geo, mat, m4){ if (m4) geo.applyMatrix4(m4); if (mat.map === stoneT || mat.map === floorT) worldUV(geo); const me = new T.Mesh(geo, mat); scene.add(me); return me; }
  const M4 = () => new T.Matrix4();
  function box(x0, x1, y0, y1, z0, z1, mat = mStone){
    const g = new T.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0+x1)/2, (y0+y1)/2, (z0+z1)/2); return add(g, mat);
  }
  function archPts(a, b, yS, n = 10){
    const w = b - a, m = (a + b) / 2, c = w * 0.16, r = w / 2 + c, rise = Math.sqrt(r*r - c*c), pts = [];
    const aR = Math.atan2(rise, c); // right half arc around (m-c, yS) from 0 to aR
    for (let i = 0; i <= n; i++){ const t = aR * i / n; pts.push([m - c + r * Math.cos(t), yS + r * Math.sin(t)]); }
    const aL = Math.atan2(rise, -c);
    for (let i = 1; i <= n; i++){ const t = aL + (Math.PI - aL) * i / n; pts.push([m + c + r * Math.cos(t), yS + r * Math.sin(t)]); }
    return {pts, apex: yS + rise};
  }
  /* wall from (x1,z1) to (x2,z2); interior is on local +z (left-rotated direction).
     ops: {u, w, sill, spring, kind: "door"|"window"|"niche"} */
  function wall(x1, z1, x2, z2, y0, h, th, ops = [], o = {}){
    const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz), ang = Math.atan2(dz, dx);
    const m4 = new T.Matrix4().makeRotationY(-ang).setPosition(x1, 0, z1);
    const piece = (u0, u1, ya, yb) => { if (u1 - u0 < 0.001 || yb - ya < 0.001) return; const g = new T.BoxGeometry(u1 - u0, yb - ya, th); g.translate((u0+u1)/2, (ya+yb)/2, 0); add(g, o.mat || mStone, m4); };
    let cur = 0;
    ops.slice().sort((p, q) => p.u - q.u).forEach(op => {
      const a = op.u - op.w / 2, b = op.u + op.w / 2, ys = y0 + op.sill + op.spring;
      piece(cur, a, y0, y0 + h);
      piece(a, b, y0, y0 + op.sill);
      const {pts, apex} = archPts(a, b, ys);
      const top = Math.max(y0 + h, apex + 0.15);
      const s = new T.Shape(); s.moveTo(a, ys); s.lineTo(a, top); s.lineTo(b, top);
      for (const [px, py] of pts) s.lineTo(px, py);
      const eg = new T.ExtrudeGeometry(s, {depth: th, bevelEnabled: false, curveSegments: 4}); eg.translate(0, 0, -th / 2);
      add(eg, o.mat || mStone, m4);
      if (op.kind === "window" || op.kind === "niche"){
        const hs = new T.Shape(); hs.moveTo(a, y0 + op.sill); hs.lineTo(b, y0 + op.sill);
        for (const [px, py] of pts) hs.lineTo(px, py); hs.lineTo(a, y0 + op.sill);
        const sg = new T.ShapeGeometry(hs, 8);
        const zoff = op.kind === "window" ? 0 : (op.back || -1) * (th / 2 - 0.03);
        sg.translate(0, 0, zoff);
        if (op.kind === "niche") add(sg, mStoneDS, m4);
        else { sg.applyMatrix4(m4); const me = new T.Mesh(sg, mShebeke); scene.add(me); }
      }
      cur = b;
    });
    piece(cur, L, y0, y0 + h);
  }
  function octWalls(cx, cz, a, th, y0, h, faces){
    const rc = (a + th / 2) / Math.cos(22.5 * D2R);
    for (let k = 0; k < 8; k++){
      const p0 = (k * 45 - 22.5) * D2R, p1 = (k * 45 + 22.5) * D2R;
      const x1 = cx + rc * Math.cos(p0), z1 = cz + rc * Math.sin(p0), x2 = cx + rc * Math.cos(p1), z2 = cz + rc * Math.sin(p1);
      const L = Math.hypot(x2 - x1, z2 - z1), f = faces[k];
      wall(x1, z1, x2, z2, y0, h, th, f ? [Object.assign({u: L / 2}, f)] : []);
    }
  }
  function vault(x0, x1, z0, z1, ySpring, axis, scaleY = 1.0){
    const len = axis === "x" ? x1 - x0 : z1 - z0, r = (axis === "x" ? z1 - z0 : x1 - x0) / 2;
    const g = new T.CylinderGeometry(r, r, len, 28, 1, true, 0, Math.PI);
    g.rotateZ(Math.PI / 2); g.scale(1, scaleY, 1);
    if (axis === "z") g.rotateY(Math.PI / 2);
    g.translate((x0 + x1) / 2, ySpring, (z0 + z1) / 2);
    add(g, mStoneDS);
    const lun = (x, z, ry) => { const c = new T.CircleGeometry(r, 24, 0, Math.PI); c.scale(1, scaleY, 1); c.rotateY(ry); c.translate(x, ySpring, z); add(c, mStoneDS); };
    if (axis === "x"){ lun(x0, (z0+z1)/2, Math.PI / 2); lun(x1, (z0+z1)/2, Math.PI / 2); }
    else { lun((x0+x1)/2, z0, 0); lun((x0+x1)/2, z1, 0); }
  }
  function dome(cx, cz, r, y, sy){
    const g = new T.SphereGeometry(r, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, sy, 1); g.translate(cx, y, cz); add(g, mStoneDS);
  }
  function octRing(cx, cz, a, y0, h, mat){
    const g = new T.CylinderGeometry(a / Math.cos(22.5 * D2R), a / Math.cos(22.5 * D2R), h, 8, 1, true);
    g.rotateY(Math.PI / 8); g.translate(cx, y0 + h / 2, cz); add(g, mat);
  }
  const mMq = [P({color: 0xe6d4ad}), P({color: 0xd9c49a})];
  function muqarnas(cx, cz, R, y){
    for (let tier = 0; tier < 3; tier++){
      const r = R - tier * 0.2, cnt = 16 + tier * 8;
      for (let i = 0; i < cnt; i++){
        const a = i / cnt * Math.PI * 2 + tier * 0.13, g = new T.BoxGeometry(0.36, 0.24, 0.28);
        const m = new T.Mesh(g, mMq[tier % 2]);
        m.position.set(cx + Math.cos(a) * r, y + tier * 0.24, cz + Math.sin(a) * r); m.lookAt(cx, y + tier * 0.24, cz); scene.add(m);
      }
    }
  }
  function floorRect(x0, x1, z0, z1, y, mat = mFloor){ const g = new T.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0+x1)/2, y, (z0+z1)/2); add(g, mat); }
  function carpet(x, z, w, d, i, ry = 0){
    const g = new T.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); g.rotateY(ry); g.translate(x, F + 0.012, z);
    scene.add(new T.Mesh(g, P({map: carpets[i % 3], shininess: 1})));
  }
  function cushion(x, z, len, ry, col){
    const g = new T.BoxGeometry(len, 0.18, 0.7); g.translate(0, 0.09, 0); const m = new T.Mesh(g, P({color: col})); m.position.set(x, F + 0.01, z); m.rotation.y = ry; scene.add(m);
    const b = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, len, 12), P({color: col})); b.rotation.z = Math.PI / 2; b.position.set(0, 0.32, -0.27); m.add(b);
  }
  function jug(x, y, z, s, col){
    const pts = [[0,0],[0.32,0],[0.42,0.15],[0.48,0.45],[0.38,0.75],[0.18,0.9],[0.15,1.12],[0.22,1.2]].map(([a,b]) => new T.Vector2(a * s, b * s));
    const m = new T.Mesh(new T.LatheGeometry(pts, 18), P({color: col, shininess: 30, specular: 0x333333, side: T.DoubleSide})); m.position.set(x, y, z); scene.add(m);
  }
  function lamp(x, y, z){
    const c = new T.Mesh(new T.CylinderGeometry(0.01, 0.01, 1.2, 4), mDark); c.position.set(x, y + 0.6, z); scene.add(c);
    const bowl = new T.Mesh(new T.SphereGeometry(0.2, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mCopper); bowl.position.set(x, y, z); scene.add(bowl);
    for (let i = 0; i < 5; i++){ const a = i / 5 * Math.PI * 2, f = new T.Mesh(new T.SphereGeometry(0.035, 8, 6), mGlow); f.position.set(x + Math.cos(a) * 0.14, y + 0.02, z + Math.sin(a) * 0.14); scene.add(f); }
  }
  function pointLight(x, y, z, i, d){ const l = new T.PointLight(0xffcf96, i, d, 1.6); l.position.set(x, y, z); scene.add(l); }

  /* ---------- lighting ---------- */
  scene.add(new T.HemisphereLight(0xfff3e0, 0x6a5640, 0.62));
  const sun = new T.DirectionalLight(0xfff0d8, 0.8); sun.position.set(-10, 20, 6); scene.add(sun);

  /* ---------- courtyard (west) ---------- */
  floorRect(-30, -6.8, -12, 12, 0, P({map: floorT}));
  [[-30, -6.8, -12, -11.5], [-30, -6.8, 11.5, 12], [-30, -29.5, -12, 12]].forEach(([a, b, c, d]) => box(a, b, 0, 2.8, c, d));
  // octagonal fountain (as in today's courtyard photos)
  const fb = new T.CylinderGeometry(1.4, 1.5, 0.45, 8); fb.translate(-15, 0.225, 0); add(fb, P({color: 0xd8c39a}));
  const fw = new T.CylinderGeometry(1.25, 1.25, 0.04, 8); fw.translate(-15, 0.44, 0); scene.add(new T.Mesh(fw, P({color: 0x3f9fae, shininess: 80, specular: 0x88ccdd})));
  const cyp = (x, z) => { const t = new T.Mesh(new T.ConeGeometry(0.55, 5.5, 10), P({color: 0x3f5a2a})); t.position.set(x, 2.75, z); scene.add(t); };
  [[-12, -9], [-17, -9], [-22, -9], [-12, 9], [-17, 9], [-22, 9]].forEach(([x, z]) => cyp(x, z));
  for (let i = -6; i <= 6; i += 3) if (Math.abs(i) > 1) { const b = new T.Mesh(new T.SphereGeometry(0.45, 10, 8), P({color: 0x55702f})); b.position.set(-17.5, 0.35, i); scene.add(b); }

  /* ---------- west facade with high portal ---------- */
  // facade: x=-6.4, interior +x -> traverse z from 9 to -9 (u = 9 - z)
  wall(-6.4, 9, -6.4, -9, 0, 10, 0.8, [
    {u: 9, w: 2.0, sill: F, spring: 2.4, kind: "door"},
    {u: 3.2, w: 1.0, sill: 2.2, spring: 1.0, kind: "window"}, {u: 14.8, w: 1.0, sill: 2.2, spring: 1.0, kind: "window"},
    {u: 5.6, w: 1.0, sill: 2.2, spring: 1.0, kind: "window"}, {u: 12.4, w: 1.0, sill: 2.2, spring: 1.0, kind: "window"},
  ]);
  box(-6.85, -5.95, 9.9, 10.3, -9, 9); // cornice
  // pishtaq (projecting portal) with tall arched niche
  wall(-7.2, 2.6, -7.2, -2.6, 0, 9.6, 0.8, [{u: 2.6, w: 3.6, sill: 0, spring: 4.8, kind: "door"}]);
  box(-7.7, -6.8, 9.6, 9.95, -2.75, 2.75);
  const bandG = new T.PlaneGeometry(4.4, 0.55); bandG.rotateY(-Math.PI / 2); bandG.translate(-7.62, 8.7, 0); scene.add(new T.Mesh(bandG, mBand));
  box(-7.6, -6.8, 0, F, -1.8, 1.8); // niche landing
  for (let i = 0; i < 8; i++) box(-10.6 + i * 0.375, -7.6, 0, (i + 1) * 0.15, -1.8, 1.8, P({map: floorT}));

  /* ---------- building floor ---------- */
  floorRect(-6.0, 15.6, -8.2, 8.2, F);

  /* ---------- entrance vestibule (plan "1") ---------- */
  wall(-6.0, -1.25, -3.85, -1.25, F, 3.0, 0.5);
  wall(-3.85, 1.25, -6.0, 1.25, F, 3.0, 0.5);
  vault(-6.0, -3.85, -1.25, 1.25, F + 3.0, "x", 1.25);

  /* ---------- central octagonal hall (plan "2", ~34 m²) ---------- */
  const A = 3.3, TH = 0.6, HH = 6.0;
  const niche = {w: 1.9, sill: 0.45, spring: 2.2, kind: "niche", back: -1};
  octWalls(0, 0, A, TH, F, HH, [
    {w: 1.4, sill: 0, spring: 2.4, kind: "door"},              // E -> small vestibule
    {w: 1.3, sill: 1.6, spring: 1.6, kind: "window"},          // SE: shebeke window
    niche, niche,                                               // S, SW
    {w: 1.8, sill: 0, spring: 2.8, kind: "door"},              // W -> entrance
    {w: 1.0, sill: 0, spring: 2.0, kind: "door"},              // NW -> spiral stair "5"
    niche,                                                      // N
    {w: 1.0, sill: 0, spring: 2.0, kind: "door"},              // NE -> chamber "3"
  ]);
  octRing(0, 0, A - 0.02, F + 5.2, 0.5, mBand);
  octRing(0, 0, A, F + HH, 0.9, mStoneDS);
  muqarnas(0, 0, A - 0.2, F + HH + 0.3);
  dome(0, 0, A - 0.5, F + HH + 0.9, 1.25);
  { const c = new T.RingGeometry(A - 0.55, A / Math.cos(22.5 * D2R) + 0.4, 32); c.rotateX(Math.PI / 2); c.translate(0, F + HH + 0.9, 0); add(c, mStoneDS); }
  // light openings in the drum
  for (let k = 0; k < 8; k += 2){ const a = (k * 45 + 22.5) * D2R, g = new T.CircleGeometry(0.18, 12); g.rotateY(-a + Math.PI / 2); g.translate(Math.cos(a) * (A - 0.05), F + HH + 0.5, Math.sin(a) * (A - 0.05)); scene.add(new T.Mesh(g, mShebeke)); }
  const ring = new T.Mesh(new T.RingGeometry(1.2, 1.32, 8), P({color: 0x8a7354})); ring.rotation.x = -Math.PI / 2; ring.position.y = F + 0.011; scene.add(ring);
  carpet(0, 0, 2.2, 2.2, 0, Math.PI / 4);
  lamp(0, F + 3.6, 0);
  pointLight(0, F + 3.4, 0, 1.0, 13);

  /* NW: spiral stair "5" */
  const dNW = [Math.cos(225 * D2R), Math.sin(225 * D2R)], wc = [dNW[0] * 4.95, dNW[1] * 4.95];
  { const g = new T.CylinderGeometry(1.15, 1.15, 4.2, 24, 1, true, 80 * D2R, 290 * D2R); g.translate(wc[0], F + 2.1, wc[1]); add(g, mStoneDS);
    const col = new T.CylinderGeometry(0.16, 0.16, 4.2, 10); col.translate(wc[0], F + 2.1, wc[1]); add(col, mStone);
    for (let i = 0; i < 14; i++){
      const a = (200 + i * 26) * D2R, st = new T.BoxGeometry(0.85, 0.18, 0.42);
      st.translate(0.6, 0, 0); st.rotateY(-a); st.translate(wc[0], F + 0.6 + i * 0.22, wc[1]); add(st, P({map: floorT}));
    }
    dome(wc[0], wc[1], 1.15, F + 4.2, 0.7);
    pointLight(wc[0], F + 2.2, wc[1], 0.35, 4);
  }
  /* NE: small chamber "3" */
  const dNE = [Math.cos(315 * D2R), Math.sin(315 * D2R)], nNE = [-dNE[1], dNE[0]];
  { const at = (r, t) => [dNE[0] * r + nNE[0] * t, dNE[1] * r + nNE[1] * t];
    const c1 = at(3.9, -1.15), c2 = at(6.15, -1.15), c3 = at(6.15, 1.15), c4 = at(3.9, 1.15);
    // walls around chamber (radial r 3.9..6.0, tangential ±0.9)
    wall(...at(3.9, -1.15), ...at(6.2, -1.15), F, 3.0, 0.5);
    wall(...at(5.95, -1.15), ...at(5.95, 1.15), F, 3.0, 0.5, [{u: 1.15, w: 0.9, sill: 1.0, spring: 1.0, kind: "window"}]);
    wall(...at(6.2, 1.15), ...at(3.9, 1.15), F, 3.0, 0.5);
    const cc = at(4.85, 0); dome(cc[0], cc[1], 1.3, F + 3.0, 0.6);
    const chest = new T.Mesh(new T.BoxGeometry(0.9, 0.5, 0.5), mWood); chest.position.set(at(5.4, 0.45)[0], F + 0.25, at(5.4, 0.45)[1]); chest.rotation.y = -315 * D2R; scene.add(chest);
    jug(at(5.4, -0.5)[0], F, at(5.4, -0.5)[1], 0.45, 0x2f7d78);
  }

  /* ---------- east corridor + small octagonal vestibule ---------- */
  wall(3.85, -0.95, 5.25, -0.95, F, 2.8, 0.5);
  wall(5.25, 0.95, 3.85, 0.95, F, 2.8, 0.5);
  vault(3.85, 5.25, -0.95, 0.95, F + 2.8, "x", 1.2);
  const VX = 7.3, VA = 1.6, sn = {w: 0.9, sill: 0.5, spring: 1.3, kind: "niche", back: -1};
  octWalls(VX, 0, VA, 0.5, F, 4.0, [
    {w: 1.2, sill: 0, spring: 2.2, kind: "door"}, sn, {w: 1.2, sill: 0, spring: 2.2, kind: "door"}, sn,
    {w: 1.4, sill: 0, spring: 2.3, kind: "door"}, sn, {w: 1.2, sill: 0, spring: 2.2, kind: "door"}, sn,
  ]);
  octRing(VX, 0, VA, F + 4.0, 0.4, mStoneDS);
  dome(VX, 0, VA + 0.1, F + 4.4, 1.15);
  { const c = new T.RingGeometry(VA, VA / Math.cos(22.5 * D2R) + 0.35, 32); c.rotateX(Math.PI / 2); c.translate(VX, F + 4.4, 0); add(c, mStoneDS); }
  lamp(VX, F + 2.9, 0);
  pointLight(VX, F + 2.6, 0, 0.55, 7);
  jug(VX + 1.32, F + 0.5, -0.55, 0.32, 0xa86b2d); jug(VX - 1.32, F + 0.5, 0.55, 0.32, 0x2f7d78);

  /* ---------- R1 north: shah's chamber (illustrative) ---------- */
  function room(x0, x1, z0, z1, h, th, ops, axis){
    const t = th / 2;
    wall(x0 - t, z0 - t, x1 + t, z0 - t, F, h, th, ops.n || []);  // north, +x
    wall(x1 + t, z0 - t, x1 + t, z1 + t, F, h, th, ops.e || []);  // east, +z
    wall(x1 + t, z1 + t, x0 - t, z1 + t, F, h, th, ops.s || []);  // south, -x
    wall(x0 - t, z1 + t, x0 - t, z0 - t, F, h, th, ops.w || []);  // west, -z
    if (axis === "x") vault(x0 - t, x1 + t, z0 - t, z1 + t, F + h, "x", 0.85);
    else vault(x0 - t, x1 + t, z0 - t, z1 + t, F + h, "z", 0.85);
  }
  const rn = (u) => ({u, w: 1.0, sill: 0.5, spring: 1.1, kind: "niche", back: -1});
  // north room: inner x 5.2..9.4, z -7.0..-2.6; door on south wall at x=7.3 (south traversed -x: u = 9.65 - 7.3)
  room(5.2, 9.4, -7.0, -2.6, 3.2, 0.5, {
    n: [{u: 2.35, w: 1.6, sill: 1.0, spring: 1.4, kind: "window"}, rn(0.9), rn(3.8)],
    s: [{u: 9.65 - 7.3, w: 1.2, sill: 0, spring: 2.2, kind: "door"}],
    w: [rn(1.5), rn(3.2)], e: [rn(1.5), rn(3.2)],
  }, "x");
  carpet(7.3, -4.8, 3.0, 3.6, 1, Math.PI / 2);
  [0xa33a2b, 0x2f5d7c, 0xa33a2b].forEach((c, i) => cushion(6.2 + i * 1.1, -6.55, 1.0, 0, c));
  cushion(5.65, -4.9, 1.8, Math.PI / 2, 0x2f5d7c);
  { const tray = new T.Mesh(new T.CylinderGeometry(0.45, 0.45, 0.04, 24), mCopper); tray.position.set(7.3, F + 0.32, -5.2); scene.add(tray);
    const leg = new T.Mesh(new T.CylinderGeometry(0.25, 0.3, 0.3, 12), mWood); leg.position.set(7.3, F + 0.15, -5.2); scene.add(leg);
    jug(7.15, F + 0.34, -5.25, 0.16, 0xb87333); jug(7.5, F + 0.34, -5.1, 0.1, 0x2f7d78); }
  [[5.0, -5.5], [5.0, -3.8], [9.6, -5.5], [9.6, -3.8]].forEach(([x, z], i) => jug(x, F + 0.5, z, 0.26, [0x2f7d78, 0xa86b2d, 0xd9c49a, 0x2f7d78][i]));
  lamp(7.3, F + 2.6, -4.8); pointLight(7.3, F + 2.4, -4.8, 0.7, 8);

  /* ---------- R2 south: family room with carpet loom (illustrative) ---------- */
  room(5.2, 9.4, 2.6, 7.0, 3.2, 0.5, {
    n: [{u: 7.3 - 4.95, w: 1.2, sill: 0, spring: 2.2, kind: "door"}],
    s: [{u: 2.35, w: 2.4, sill: 0.45, spring: 1.6, kind: "window"}],   // bay window (south facade)
    w: [rn(2.35)], e: [rn(1.4), rn(3.3)],
  }, "x");
  carpet(7.3, 4.6, 2.6, 3.4, 2, Math.PI / 2);
  cushion(7.3, 6.5, 2.2, Math.PI, 0xa33a2b);
  { // vertical carpet loom with half-woven carpet
    const lx = 5.75, lz = 4.6;
    [-0.9, 0.9].forEach(dz => { const p = new T.Mesh(new T.BoxGeometry(0.12, 2.2, 0.12), mWood); p.position.set(lx, F + 1.1, lz + dz); scene.add(p); });
    [0.35, 2.1].forEach(y => { const b = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 2.0, 8), mWood); b.rotation.x = Math.PI / 2; b.position.set(lx, F + y, lz); scene.add(b); });
    const woven = new T.PlaneGeometry(1.7, 0.9); woven.rotateY(Math.PI / 2); woven.translate(lx + 0.02, F + 0.82, lz);
    scene.add(new T.Mesh(woven, P({map: carpets[0], side: T.DoubleSide})));
    for (let i = 0; i < 28; i++){ const s = new T.Mesh(new T.BoxGeometry(0.004, 0.85, 0.006), P({color: 0xeee2c8})); s.position.set(lx + 0.02, F + 1.7, lz - 0.84 + i * 0.062); scene.add(s); }
    [0xa33a2b, 0x1c2a4a, 0xd9a441, 0x2f7d78].forEach((c, i) => { const y = new T.Mesh(new T.SphereGeometry(0.11, 10, 8), P({color: c})); y.position.set(lx + 0.6, F + 0.11, lz - 0.5 + i * 0.3); scene.add(y); });
  }
  lamp(7.3, F + 2.6, 4.6); pointLight(7.3, F + 2.4, 4.6, 0.7, 8);

  /* ---------- R3 east: reception room with east bay window (illustrative) ---------- */
  wall(9.35, -0.6, 10.4, -0.6, F, 2.6, 0.4); wall(10.4, 0.6, 9.35, 0.6, F, 2.6, 0.4);
  box(9.35, 10.4, F + 2.6, F + 2.9, -0.8, 0.8);
  room(10.4, 15.0, -2.4, 2.4, 3.4, 0.5, {
    w: [{u: 2.65, w: 1.0, sill: 0, spring: 2.1, kind: "door"}],
    e: [{u: 2.65, w: 2.2, sill: 0.5, spring: 1.6, kind: "window"}],    // bay window (east facade)
    n: [rn(1.3), rn(2.9), rn(4.5)], s: [rn(1.3), rn(2.9), rn(4.5)],
  }, "x");
  box(13.4, 15.0, F, F + 0.35, -2.4, 2.4, P({map: floorT}));  // raised platform (taxt)
  carpet(14.2, 0, 1.4, 4.4, 0, 0);
  carpet(11.8, 0, 2.4, 3.4, 1, Math.PI / 2);
  cushion(14.6, 0, 3.6, -Math.PI / 2, 0xa33a2b);
  [[11.2, -2.62], [12.8, -2.62], [11.2, 2.62], [12.8, 2.62]].forEach(([x, z], i) => jug(x, F + 0.5, z + (z < 0 ? 0.05 : -0.05), 0.27, [0xa86b2d, 0x2f7d78, 0x2f7d78, 0xd9c49a][i]));
  { const st = new T.Mesh(new T.BoxGeometry(0.5, 0.35, 0.35), mWood); st.position.set(12.4, F + 0.17, 0); scene.add(st);
    const bk = new T.Mesh(new T.BoxGeometry(0.34, 0.05, 0.26), P({color: 0x7a2f22})); bk.position.set(12.4, F + 0.37, 0); bk.rotation.z = 0.25; scene.add(bk); }
  lamp(12.2, F + 2.8, 0); pointLight(12.2, F + 2.6, 0, 0.75, 9);

  /* ---------- walkable zones ---------- */
  const rect = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const octP = (cx, cz, ap) => { const r = ap / Math.cos(22.5 * D2R), p = []; for (let k = 0; k < 8; k++){ const a = (k * 45 + 22.5) * D2R; p.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } return p; };
  const rot = (d, r0, r1, t0, t1) => { const n = [-d[1], d[0]], at = (r, t) => [d[0] * r + n[0] * t, d[1] * r + n[1] * t]; return [at(r0, t0), at(r1, t0), at(r1, t1), at(r0, t1)]; };
  const ZONES = [
    {id: "court", poly: rect(-28.5, -10.6, -10.8, 10.8), floor: () => 0},
    {id: "portal", poly: rect(-10.65, -7.6, -1.5, 1.5), floor: x => Math.max(0, Math.min(F, (x + 10.6) / 3.0 * F))},
    {id: "portal", poly: rect(-7.65, -6.75, -1.5, 1.5)},
    {id: "vest", poly: rect(-6.8, -2.8, -0.7, 0.7)},
    {id: "hall", poly: octP(0, 0, A - 0.28)},
    {id: "hall", poly: rect(2.8, 4.0, -0.45, 0.45)},
    {id: "corr", poly: rect(3.9, 6.2, -0.45, 0.45)},
    {id: "vest2", poly: octP(VX, 0, VA - 0.28)},
    {id: "vest2", poly: rect(VX - 0.35, VX + 0.35, -2.9, 2.9)},
    {id: "r1", poly: rect(5.45, 9.15, -6.75, -2.85)},
    {id: "r2", poly: rect(5.45, 9.15, 2.85, 6.75)},
    {id: "vest2", poly: rect(8.6, 10.7, -0.3, 0.3)},
    {id: "r3", poly: rect(10.65, 13.35, -2.15, 2.15)},
    {id: "r3", poly: rect(13.35, 14.75, -2.15, 2.15), floor: () => F + 0.35},
    {id: "stair", poly: rot(dNW, 2.6, 4.6, -0.25, 0.25)},
    {id: "stair", circle: [wc[0], wc[1], 0.75]},
    {id: "ch3", poly: rot(dNE, 2.6, 4.3, -0.25, 0.25)},
    {id: "ch3", poly: rot(dNE, 4.15, 5.45, -0.65, 0.65)},
  ];
  const INFO = {
    court: ["Yuxarı həyət", "Qərb fasadı və hündür giriş portalı. Pilləkənlə yuxarı qalxıb içəri keçin."],
    portal: ["Qərb portalı", "Hündür, tağlı portal. Pilləkən birbaşa mərkəzi zala aparır."],
    vest: ["Giriş dəhlizi", "Plandakı 1 nömrəli hissə: portaldan mərkəzi zala keçid."],
    hall: ["Mərkəzi səkkizguşəli zal", "Planda sahəsi 34,15 m². Günbəzlə örtülüb, ehtimal ki, qəbullar üçün istifadə olunub. Sarayın ən qədim hissəsi sayılır."],
    stair: ["Dolama pilləkən", "Plandakı 5 nömrəli hissə. Sarayda üç dar dolama pilləkən olduğu bilinir."],
    ch3: ["Kiçik otaq", "Plandakı 3 nömrəli hissə: zalın şimal-şərq küncündəki kiçik otaq."],
    corr: ["Keçid", "Mərkəzi zaldan şərqə, kiçik vestibülə gedən dəhliz."],
    vest2: ["Kiçik səkkizguşəli vestibül", "Mənbələrə görə mərkəzi zalı sarayın digər otaqları ilə birləşdirir."],
    r1: ["Şimal otağı (təxmini)", "Şah ailəsinin yaşayış otağı kimi təsəvvür edilib: xalça, mütəkkələr, taxçalarda saxsı qablar, şəbəkəli pəncərə."],
    r2: ["Cənub otağı (təxmini)", "Cənub fasadında erkər pəncərə olduğu bilinir. Otaqda xalça toxuma dəzgahı təsəvvür edilib."],
    r3: ["Şərq otağı (təxmini)", "Şərq fasadındakı erkər pəncərənin qarşısında hündür taxt, xalçalar və kitab rəhləsi."],
  };

  function inPoly(x, z, p){ let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++){ const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; }
  const OBST = [[-15, 0, 1.85], [7.3, -5.2, 0.55]];
  function zoneAt(x, z){
    for (const [ox, oz, r] of OBST) if (Math.hypot(x - ox, z - oz) < r) return null;
    let best = null;
    for (const zn of ZONES){
      const ok = zn.circle ? Math.hypot(x - zn.circle[0], z - zn.circle[1]) < zn.circle[2] : inPoly(x, z, zn.poly);
      if (ok){ if (zn.floor) return zn; best = best || zn; }
    }
    return best;
  }
  const floorAt = (zn, x) => zn.floor ? zn.floor(x) : F;

  /* ---------- player ---------- */
  const st = {x: -20, z: 0, yaw: -Math.PI / 2, pitch: 0.08, y: EYE, keys: {}, zone: null};
  const START = {x: -20, z: 0, yaw: -Math.PI / 2, pitch: 0.08};
  function reset(){ Object.assign(st, START); st.y = EYE; st.zone = null; }
  function update(dt, cam, onZone){
    const k = st.keys, sp = 2.0 * dt * (k.run ? 1.8 : 1);
    let f = (k.f ? 1 : 0) - (k.b ? 1 : 0), s = (k.r ? 1 : 0) - (k.l ? 1 : 0);
    if (k.tl) st.yaw += 1.6 * dt; if (k.tr) st.yaw -= 1.6 * dt;
    if (f || s){
      const fx = -Math.sin(st.yaw), fz = -Math.cos(st.yaw), rx = Math.cos(st.yaw), rz = -Math.sin(st.yaw);
      const len = Math.hypot(f, s); f /= len; s /= len;
      const dx = (fx * f + rx * s) * sp, dz = (fz * f + rz * s) * sp;
      if (zoneAt(st.x + dx, st.z)) st.x += dx;
      if (zoneAt(st.x, st.z + dz)) st.z += dz;
    }
    const zn = zoneAt(st.x, st.z);
    const target = (zn ? floorAt(zn, st.x) : 0) + EYE;
    st.y += (target - st.y) * Math.min(1, dt * 10);
    cam.position.set(st.x, st.y, st.z);
    cam.rotation.set(st.pitch, st.yaw, 0, "YXZ");
    if (zn && zn.id !== st.zone){ st.zone = zn.id; onZone && onZone(INFO[zn.id], zn.id); }
  }
  function look(dx, dy){ st.yaw -= dx * 0.0042; st.pitch = Math.max(-1.2, Math.min(1.2, st.pitch - dy * 0.0042)); }

  /* ---------- minimap ---------- */
  function drawMap(ctx, w, h, colors){
    const x0 = -12, x1 = 16, z0 = -8.5, z1 = 8.5, sc = Math.min(w / (x1 - x0), h / (z1 - z0));
    const X = x => (x - x0) * sc + (w - (x1 - x0) * sc) / 2, Z = z => (z - z0) * sc + (h - (z1 - z0) * sc) / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = colors.floor;
    for (const zn of ZONES){
      if (zn.id === "court") continue;
      ctx.beginPath();
      if (zn.circle) ctx.arc(X(zn.circle[0]), Z(zn.circle[1]), zn.circle[2] * sc, 0, Math.PI * 2);
      else zn.poly.forEach(([x, z], i) => i ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z)));
      ctx.closePath(); ctx.fill();
    }
    const px = X(st.x), pz = Z(st.z);
    ctx.fillStyle = colors.me; ctx.beginPath(); ctx.arc(px, pz, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = colors.me; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, pz); ctx.lineTo(px - Math.sin(st.yaw) * 12, pz - Math.cos(st.yaw) * 12); ctx.stroke();
  }

  return {scene, update, look, reset, state: st, drawMap, zoneAt};
})();
