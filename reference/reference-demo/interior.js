/* Stylized interiors (approximate artistic reconstructions), built in meters. */
const INT = (() => {
  const T = THREE;
  function canvasTex(w, h, draw, rx = 1, ry = 1){
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry);
    t.encoding = T.sRGBEncoding; t.anisotropy = 4;
    return t;
  }
  function rnd(seed){ let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  // limestone ashlar blocks
  function stoneDraw(base, mortar, seed){
    return (g, w, h) => {
      const r = rnd(seed); g.fillStyle = mortar; g.fillRect(0, 0, w, h);
      const rows = 8, bh = h / rows;
      for (let y = 0; y < rows; y++){
        let x = (y % 2) * -40;
        while (x < w){
          const bw = 70 + r() * 60, v = (r() - 0.5) * 22;
          g.fillStyle = `rgb(${base[0]+v|0},${base[1]+v|0},${base[2]+v*0.8|0})`;
          g.fillRect(x + 2, y * bh + 2, bw - 4, bh - 4);
          for (let k = 0; k < 18; k++){ g.fillStyle = `rgba(80,60,40,${r()*0.06})`; g.fillRect(x + r()*bw, y*bh + r()*bh, 2 + r()*5, 2 + r()*5); }
          x += bw;
        }
      }
    };
  }
  const wallTex = (rx, ry) => canvasTex(512, 512, stoneDraw([214,196,160], "#a8946f", 11), rx, ry);
  const floorTex = (rx, ry) => canvasTex(512, 512, (g, w, h) => {
    const r = rnd(5); g.fillStyle = "#8f7d60"; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++){
      const v = (r() - 0.5) * 26; g.fillStyle = `rgb(${190+v|0},${172+v|0},${138+v|0})`;
      g.fillRect(x*128 + 3, y*128 + 3, 122, 122);
    }
  }, rx, ry);
  // Azerbaijani-style carpet: red field, border, diamond göl medallions
  const carpetTex = () => canvasTex(512, 768, (g, w, h) => {
    g.fillStyle = "#7d1f1a"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#1c2a4a"; g.fillRect(0, 0, w, h); g.fillStyle = "#e9dcc0"; g.fillRect(14, 14, w-28, h-28);
    g.fillStyle = "#1c2a4a"; g.fillRect(28, 28, w-56, h-56);
    g.fillStyle = "#9a2a20"; g.fillRect(52, 52, w-104, h-104);
    // border zigzag
    g.fillStyle = "#d9a441";
    for (let x = 30; x < w - 30; x += 22){ g.beginPath(); g.moveTo(x, 30); g.lineTo(x+11, 48); g.lineTo(x+22, 30); g.fill(); g.beginPath(); g.moveTo(x, h-30); g.lineTo(x+11, h-48); g.lineTo(x+22, h-30); g.fill(); }
    const gol = (cx, cy, s) => {
      const d = (k, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(cx, cy - s*k); g.lineTo(cx + s*k*0.75, cy); g.lineTo(cx, cy + s*k); g.lineTo(cx - s*k*0.75, cy); g.closePath(); g.fill(); };
      d(1, "#1c2a4a"); d(0.82, "#e9dcc0"); d(0.66, "#2f7d78"); d(0.45, "#d9a441"); d(0.22, "#7d1f1a");
      g.fillStyle = "#e9dcc0"; [[-1,0],[1,0],[0,-1],[0,1]].forEach(([a,b]) => { g.fillRect(cx + a*s*0.95 - 4, cy + b*s*1.2 - 4, 8, 8); });
    };
    gol(w/2, h*0.27, 70); gol(w/2, h*0.5, 70); gol(w/2, h*0.73, 70);
    g.fillStyle = "#d9a441";
    for (let i = 0; i < 40; i++){ const r2 = rnd(i+3); g.fillRect(70 + r2()*(w-140), 70 + r2()*(h-140), 5, 5); }
  });

  const M = (opts) => new T.MeshStandardMaterial(Object.assign({roughness: 0.9, metalness: 0}, opts));
  const glow = (c, i = 1.4) => new T.MeshStandardMaterial({color: c, emissive: c, emissiveIntensity: i, roughness: 1});

  function archShape(w, hs){
    const s = new T.Shape(), c = w * 0.18, r = w / 2 + c, top = Math.sqrt(r*r - c*c);
    s.moveTo(-w/2, 0); s.lineTo(-w/2, hs);
    s.absarc(c, hs, r, Math.PI, Math.atan2(top, -c), true);
    s.absarc(-c, hs, r, Math.atan2(top, c), 0, true);
    s.lineTo(w/2, 0); s.lineTo(-w/2, 0);
    return s;
  }
  // arched recess facing room center; placed at wall point (x,z) with inward angle a
  function niche(group, w, hs, x, z, y, a, mat, depth = 0.5, frameMat){
    depth = Math.max(depth, 0.12);
    const geo = new T.ExtrudeGeometry(archShape(w, hs), {depth, bevelEnabled: false, curveSegments: 10});
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.y = a; group.add(m);
    if (frameMat){
      const f = new T.Mesh(new T.ExtrudeGeometry(archShape(w + 0.36, hs + 0.1), {depth: 0.06, bevelEnabled: false, curveSegments: 10}), frameMat);
      f.position.set(x, y - 0.1, z); f.rotation.y = a; group.add(f);
    }
    return m;
  }
  function octRoom(group, R, H, wallMat, floorMat){
    const walls = new T.Mesh(new T.CylinderGeometry(R, R, H, 8, 1, true), wallMat);
    walls.material.side = T.BackSide; walls.position.y = H / 2; walls.rotation.y = Math.PI / 8; group.add(walls);
    const floor = new T.Mesh(new T.CircleGeometry(R, 32), floorMat);
    floor.rotation.x = -Math.PI / 2; group.add(floor);
  }
  function domeOn(group, R, y, hScale, mat, segs = 32){
    const d = new T.Mesh(new T.SphereGeometry(R, segs, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    d.material.side = T.BackSide; d.scale.y = hScale; d.position.y = y; group.add(d);
    return d;
  }
  // stepped muqarnas-like ring at dome base
  function muqarnasRing(group, R, y, n, mat){
    for (let tier = 0; tier < 3; tier++){
      const r = R - tier * 0.18, cnt = n + tier * 4;
      for (let i = 0; i < cnt; i++){
        const a = i / cnt * Math.PI * 2 + tier * 0.2;
        const b = new T.Mesh(new T.BoxGeometry(0.34, 0.22, 0.26), mat);
        b.position.set(Math.cos(a) * r, y + tier * 0.22, Math.sin(a) * r);
        b.lookAt(0, y + tier * 0.22, 0); group.add(b);
      }
    }
  }
  function lights(group, warm = 0xffd7a0, inten = 1.2, y = 3){
    group.add(new T.HemisphereLight(0xfff1dc, 0x5a4632, 0.55));
    const p = new T.PointLight(warm, inten, 25, 1.6); p.position.set(0, y, 0); group.add(p);
  }
  function inscriptionBand(group, R, y, sides, mat){
    const band = new T.Mesh(new T.CylinderGeometry(R - 0.02, R - 0.02, 0.45, sides, 1, true), mat);
    band.material.side = T.BackSide; band.position.y = y; band.rotation.y = Math.PI / sides; group.add(band);
    return band;
  }
  function boxRoom(group, W, H, D, mat, holeR, ceilMat){
    const mk = (w, x, z, ry) => { const p = new T.Mesh(new T.PlaneGeometry(w, H), mat); p.position.set(x, H / 2, z); p.rotation.y = ry; group.add(p); };
    mat.side = T.FrontSide;
    mk(W, 0, -D / 2, 0); mk(W, 0, D / 2, Math.PI); mk(D, -W / 2, 0, Math.PI / 2); mk(D, W / 2, 0, -Math.PI / 2);
    const sh = new T.Shape(); sh.moveTo(-W/2, -D/2); sh.lineTo(W/2, -D/2); sh.lineTo(W/2, D/2); sh.lineTo(-W/2, D/2); sh.lineTo(-W/2, -D/2);
    const hole = new T.Path(); hole.absarc(0, 0, holeR, 0, Math.PI * 2, false); sh.holes.push(hole);
    const c = new T.Mesh(new T.ShapeGeometry(sh, 48), ceilMat); c.rotation.x = Math.PI / 2; c.position.y = H; group.add(c);
  }
  const bandTex = () => canvasTex(1024, 64, (g, w, h) => {
    g.fillStyle = "#2f6f6c"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#e7d7b4"; g.lineWidth = 4;
    for (let x = 6; x < w; x += 28){ // kufic-like vertical strokes and hooks
      const t = (x / 28) % 4;
      g.beginPath(); g.moveTo(x, h - 12); g.lineTo(x, 12 + t * 4); if (t > 1){ g.lineTo(x + 14, 12 + t * 4); } g.stroke();
      g.beginPath(); g.moveTo(x - 6, h - 12); g.lineTo(x + 22, h - 12); g.stroke();
    }
  }, 4, 1);

  const builders = {
    divan(){
      const g = new T.Group(), R = 3.6, H = 4.6;
      const wm = M({map: wallTex(6, 2)}), fm = M({map: floorTex(3, 3)}), dark = M({color: 0x6e5a42}), light = M({color: 0xe6d4ad});
      octRoom(g, R, H, wm, fm);
      for (let i = 0; i < 8; i++){
        const a = i * Math.PI / 4, ap = R * Math.cos(Math.PI / 8) - 0.03, x = Math.cos(a) * ap, z = Math.sin(a) * ap;
        const face = -a - Math.PI / 2;
        if (i === 4) niche(g, 1.6, 2.2, x, z, 0, face, glow(0xfff2d0, 1.6), 0.02, light); // west door: daylight
        else niche(g, 1.7, 2.0, x, z, 0.45, face, dark, 0.04, light);
      }
      inscriptionBand(g, R, H - 0.4, 8, M({map: bandTex()}));
      const drum = new T.Mesh(new T.CylinderGeometry(R - 0.25, R, 0.8, 16, 1, true), M({map: wallTex(6, 1)}));
      drum.material.side = T.BackSide; drum.position.y = H + 0.4; g.add(drum);
      muqarnasRing(g, R - 0.45, H + 0.1, 16, light);
      domeOn(g, R - 0.25, H + 0.8, 1.15, M({map: wallTex(8, 3)}));
      const ring = new T.Mesh(new T.RingGeometry(1.2, 1.35, 8), M({color: 0x8a7354}));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; g.add(ring);
      lights(g, 0xffdcae, 1.3, 3.5);
      return {group: g, eye: 1.6, reach: 2.6};
    },
    turbe(){
      const g = new T.Group(), W = 7, H = 6;
      const wm = M({map: wallTex(5, 3), side: T.BackSide}), fm = M({map: floorTex(3, 3)}), dark = M({color: 0x6e5a42}), light = M({color: 0xe6d4ad});
      boxRoom(g, W, H, W, wm, 3.4, M({map: wallTex(4, 4), side: T.DoubleSide}));
      const floor = new T.Mesh(new T.PlaneGeometry(W, W), fm); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.005; g.add(floor);
      // door south (daylight) + blind niches
      niche(g, 1.6, 2.4, 0, W/2 - 0.02, 0, Math.PI, glow(0xfff2d0, 1.6), 0.02, light);
      niche(g, 2.0, 2.4, 0, -W/2 + 0.02, 0.4, 0, dark, 0.04, light);
      niche(g, 2.0, 2.4, -W/2 + 0.02, 0, 0.4, Math.PI/2, dark, 0.04, light);
      niche(g, 2.0, 2.4, W/2 - 0.02, 0, 0.4, -Math.PI/2, dark, 0.04, light);
      inscriptionBand(g, W / 2 * 1.41, H - 0.5, 4, M({map: bandTex()}));
      // corner squinches -> octagon
      for (let i = 0; i < 4; i++){
        const a = i * Math.PI / 2 + Math.PI / 4;
        const s = new T.Mesh(new T.ConeGeometry(1.3, 1.5, 4, 1, true), M({color: 0xd8c39a, side: T.DoubleSide}));
        s.position.set(Math.cos(a) * 3.1, H - 0.3, Math.sin(a) * 3.1); s.rotation.x = Math.PI; g.add(s);
      }
      domeOn(g, 3.4, H, 1.1, M({map: wallTex(8, 3), side: T.BackSide}));
      // cenotaphs
      const ston = M({color: 0xcdb791});
      [-1.3, 0, 1.3].forEach((x, i) => {
        const c = new T.Mesh(new T.BoxGeometry(0.8, 0.5 - i * 0.05, 2.1), ston); c.position.set(x, 0.25, -0.6); g.add(c);
        const top = new T.Mesh(new T.CylinderGeometry(0.01, 0.42, 0.28, 4, 1), ston);
        top.scale.z = 2.5; top.rotation.y = Math.PI / 4; top.position.set(x, 0.5 - i * 0.05 + 0.14, -0.6); g.add(top);
      });
      lights(g, 0xffd09a, 1.1, 4);
      return {group: g, eye: 1.6, reach: 2.4};
    },
    mosque(){
      const g = new T.Group(), W = 10, D = 8, H = 6.5;
      const wm = M({map: wallTex(7, 3), side: T.BackSide}), dark = M({color: 0x5f4d38}), light = M({color: 0xe6d4ad});
      boxRoom(g, W, H, D, wm, 3.6, M({map: wallTex(5, 4), side: T.DoubleSide}));
      const floor = new T.Mesh(new T.PlaneGeometry(W, D), M({map: floorTex(4, 3)})); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.005; g.add(floor);
      const carpet = new T.Mesh(new T.PlaneGeometry(4.2, 6.2), M({map: carpetTex(), roughness: 1}));
      carpet.rotation.x = -Math.PI / 2; carpet.position.y = 0.02; g.add(carpet);
      // mihrab on south wall (+z) with stepped hood
      niche(g, 1.5, 2.2, 0, D/2 - 0.02, 0, Math.PI, M({color: 0x8c7556}), 0.05, M({color: 0x2f6f6c}));
      for (let i = 0; i < 4; i++){
        const st = new T.Mesh(new T.BoxGeometry(1.3 - i * 0.28, 0.16, 0.25), light);
        st.position.set(0, 2.25 + i * 0.16, D/2 - 0.15); g.add(st);
      }
      // minbar
      for (let i = 0; i < 6; i++){
        const st = new T.Mesh(new T.BoxGeometry(0.9, 0.25 * (i + 1), 0.4), M({color: 0x6b4a2e}));
        st.position.set(1.6, 0.125 * (i + 1), D/2 - 0.4 - i * 0.4); g.add(st);
      }
      // windows (daylight)
      [-3.2, 3.2].forEach(x => niche(g, 0.8, 1.2, x, D/2 - 0.02, 2.2, Math.PI, glow(0xfff2d0, 1.3), 0.02, light));
      [-2, 2].forEach(z => {
        niche(g, 0.8, 1.2, -W/2 + 0.02, z, 2.2, Math.PI/2, glow(0xfff2d0, 1.3), 0.02, light);
        niche(g, 0.8, 1.2, W/2 - 0.02, z, 2.2, -Math.PI/2, glow(0xfff2d0, 1.3), 0.02, light);
      });
      niche(g, 1.6, 2.3, -2.5, -D/2 + 0.02, 0, 0, glow(0xfff2d0, 1.6), 0.02, light); // entrance
      inscriptionBand(g, W / 2 * Math.SQRT2 - 0.01, H - 0.6, 4, M({map: bandTex()})).scale.z = D / W;
      domeOn(g, 3.6, H, 1.0, M({map: wallTex(8, 3), side: T.BackSide}));
      // hanging lamp ring
      const ring = new T.Mesh(new T.TorusGeometry(1.1, 0.03, 6, 32), M({color: 0x8a6a3a, metalness: 0.6, roughness: 0.4}));
      ring.rotation.x = Math.PI / 2; ring.position.y = 3.6; g.add(ring);
      for (let i = 0; i < 12; i++){
        const a = i / 12 * Math.PI * 2, l = new T.Mesh(new T.SphereGeometry(0.07, 8, 6), glow(0xffc070, 2.2));
        l.position.set(Math.cos(a) * 1.1, 3.52, Math.sin(a) * 1.1); g.add(l);
      }
      lights(g, 0xffcf90, 1.4, 3.4);
      return {group: g, eye: 1.6, reach: 3.2};
    },
    bath(){
      const g = new T.Group(), R = 4, H = 3.2;
      const wm = M({map: wallTex(6, 2)}), fm = M({map: floorTex(3, 3)}), dark = M({color: 0x6e5a42}), light = M({color: 0xe6d4ad});
      octRoom(g, R, H, wm, fm);
      for (let i = 0; i < 8; i++){
        const a = i * Math.PI / 4, ap = R * Math.cos(Math.PI / 8) - 0.03, x = Math.cos(a) * ap, z = Math.sin(a) * ap;
        niche(g, 1.9, 1.6, x, z, 0, -a - Math.PI / 2, i === 2 ? glow(0xfff2d0, 1.2) : dark, 0.04, light);
        const bench = new T.Mesh(new T.BoxGeometry(1.6, 0.45, 0.6), light);
        bench.position.set(Math.cos(a) * (ap - 0.4), 0.22, Math.sin(a) * (ap - 0.4)); bench.lookAt(0, 0.22, 0);
        if (i !== 2) g.add(bench);
      }
      const pool = new T.Mesh(new T.CylinderGeometry(1.5, 1.5, 0.35, 8), light); pool.position.y = 0.17; pool.rotation.y = Math.PI/8; g.add(pool);
      const water = new T.Mesh(new T.CylinderGeometry(1.32, 1.32, 0.02, 8), M({color: 0x3f9fae, roughness: 0.15, metalness: 0.1}));
      water.position.y = 0.33; water.rotation.y = Math.PI/8; g.add(water);
      domeOn(g, R, H, 0.85, M({map: wallTex(8, 3)}));
      // star-shaped skylights in the dome
      for (let k = 0; k < 2; k++) for (let i = 0; i < (k ? 6 : 10); i++){
        const a = i / (k ? 6 : 10) * Math.PI * 2 + k * 0.3, phi = k ? 0.45 : 0.85;
        const sx = Math.sin(phi) * R * 0.98, sy = H + Math.cos(phi) * R * 0.85 * 0.98;
        const s = new T.Mesh(new T.CircleGeometry(0.12, 5), glow(0xfff6dc, 2.5));
        s.position.set(Math.cos(a) * sx, sy, Math.sin(a) * sx); s.lookAt(0, 0, 0); g.add(s);
      }
      lights(g, 0xfff0d0, 1.0, 2.6);
      return {group: g, eye: 1.5, reach: 2.8};
    }
  };
  const cache = {};
  return { get(id){ if (!builders[id]) return null; return cache[id] || (cache[id] = builders[id]()); }, has: id => !!builders[id] };
})();
