/* Guide body from a static textured model (content/characters/<id>/model.glb + texture.jpg,
   made by scripts/import-character.ts). The model has no skeleton, so one is added here:
   vertices are weighted by height (and left/right below the hips) to hips, two legs, spine,
   chest, neck and head bones. That gives a walk with robe swing and bob, turning, torso
   twist and lean toward what he shows, head look-at, nods and a bow. Arms stay as modelled.
   Any failure → null, and the caller keeps the procedural Plan B body. */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Gesture, GuideAvatar, MouthShape } from "./types";

const ss = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export async function loadMeshAvatar(id: string): Promise<GuideAvatar | null> {
  const base = `/characters/${id}`;
  try {
    const cfg = await fetch(`${base}/character.json`).then((r) => (r.ok ? r.json() : null)) as { model: string; texture: string | null; yaw?: number } | null;
    if (!cfg) return null;
    const [gltf, map] = await Promise.all([
      new GLTFLoader().loadAsync(`${base}/${cfg.model}`),
      cfg.texture ? new THREE.TextureLoader().loadAsync(`${base}/${cfg.texture}`) : Promise.resolve(null),
    ]);
    let src: THREE.Mesh | null = null;
    gltf.scene.traverse((o) => { if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh; });
    if (!src) return null;
    const geo = (src as THREE.Mesh).geometry.clone();
    if (cfg.yaw) geo.rotateY((cfg.yaw * Math.PI) / 180);
    geo.computeBoundingBox();
    const H = geo.boundingBox!.max.y;
    if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; }
    return build(geo, H, map);
  } catch (e) {
    console.warn("[guide] mesh avatar not used:", e);
    return null;
  }
}

function build(geo: THREE.BufferGeometry, H: number, map: THREE.Texture | null): GuideAvatar {
  /* skeleton: 0 root, 1 hips, 2 legL, 3 legR, 4 spine, 5 chest, 6 neck, 7 head */
  const mk = (y: number, x = 0) => { const b = new THREE.Bone(); b.position.set(x, y, 0); return b; };
  const yHip = 0.52 * H, ySpine = 0.6 * H, yChest = 0.72 * H, yNeck = 0.83 * H, yHead = 0.87 * H;
  const root = mk(0), hips = mk(yHip), legL = mk(0, 0.06 * H), legR = mk(0, -0.06 * H), spine = mk(ySpine - yHip), chest = mk(yChest - ySpine), neck = mk(yNeck - yChest), head = mk(yHead - yNeck);
  root.add(hips); hips.add(legL, legR, spine); spine.add(chest); chest.add(neck); neck.add(head);
  const bones = [root, hips, legL, legR, spine, chest, neck, head];

  /* weights by height; below the hips also by side, fading into the hips near the top */
  const pos = geo.attributes.position, n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const w: [number, number][] = [];
    if (y < yHip) {
      const side = ss(-0.04 * H, 0.04 * H, x);           // 0 = right (-x), 1 = left (+x)
      const leg = 1 - ss(0.38 * H, yHip, y);              // full leg weight low down
      w.push([2, leg * side], [3, leg * (1 - side)], [1, 1 - leg]);
    } else if (y < yChest) {
      const t = ss(yHip, yChest, y);
      w.push([1, 1 - t], [4, t * (1 - ss(ySpine, yChest, y)) + 0], [5, t * ss(ySpine, yChest, y)]);
    } else {
      const h = ss(yNeck - 0.02 * H, yHead + 0.02 * H, y), nk = ss(yChest + 0.04 * H, yNeck, y) * (1 - h);
      w.push([5, 1 - h - nk], [6, nk], [7, h]);
    }
    const sum = w.reduce((a, b) => a + b[1], 0) || 1;
    w.forEach(([b, v], k) => { si[i * 4 + k] = b; sw[i * 4 + k] = v / sum; });
  }
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0 });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.add(root);
  mesh.bind(new THREE.Skeleton(bones));

  const group = new THREE.Group();
  group.name = "guide-mesh";
  group.add(mesh);
  /* blob shadow */
  const sc = document.createElement("canvas"); sc.width = sc.height = 64;
  const sx = sc.getContext("2d")!; const gr = sx.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, "rgba(0,0,0,.42)"); gr.addColorStop(1, "rgba(0,0,0,0)"); sx.fillStyle = gr; sx.fillRect(0, 0, 64, 64);
  const shadowTex = new THREE.CanvasTexture(sc);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.012; group.add(shadow);

  let time = 0, speed = 0, turn = 0, walkW = 0, phase = 0;
  let clip: { g: Gesture; t0: number; dur: number } | null = null;
  let talking = false, nextTalk = 0, open = 0, openT = 0;
  let lookT: THREE.Vector3 | null = null, pointT: THREE.Vector3 | null = null, pointUntil = Infinity, pointW = 0;
  let lookYaw = 0, lookPitch = 0, twist = 0;
  const v1 = new THREE.Vector3(), q = new THREE.Quaternion();
  const DUR: Partial<Record<Gesture, number>> = { wave: 1.6, welcome: 2, lookUp: 2.6, nod: 0.9, think: 2.4, talk1: 1.6, talk2: 1.8, talk3: 1.4 };
  const env = (u: number, d: number) => ss(0, 0.3, u) * ss(0, 0.35, d - u);

  function update(dt: number) {
    time += dt;
    walkW += ((speed > 0.1 ? Math.min(1, speed / 1.1) : Math.abs(turn) > 0.9 ? 0.3 : 0) - walkW) * Math.min(1, dt * 6);
    phase += dt * (speed > 0.1 ? (speed / 0.65) * Math.PI : walkW > 0.05 ? 5 : 0);
    const s = Math.sin(phase), c = Math.cos(phase);
    // base: breathing, walk (robe swing, bob, sway)
    hips.position.y = yHip - 0.012 * walkW + 0.022 * walkW * Math.abs(c);
    hips.rotation.set(0, 0.06 * walkW * s, 0.03 * walkW * s + 0.012 * Math.sin(time * 0.45));
    legL.rotation.set(-0.32 * walkW * s, 0, 0);
    legR.rotation.set(0.32 * walkW * s, 0, 0);
    let sx = 0.012 * Math.sin(time * 1.6) + 0.05 * walkW, sy = -0.05 * walkW * s, hx = 0, hz = 0;
    // gestures
    if (clip && time - clip.t0 > clip.dur) clip = null;
    if (talking && !clip && time > nextTalk && walkW < 0.3) {
      const g = (["talk1", "talk2", "talk3", "nod"] as Gesture[])[Math.floor(Math.random() * 4)];
      clip = { g, t0: time, dur: DUR[g]! };
      nextTalk = time + clip.dur + 0.6 + Math.random() * 1.4;
    }
    if (clip) {
      const u = time - clip.t0, w = env(u, clip.dur);
      switch (clip.g) {
        case "welcome": case "wave": sx += 0.32 * w * Math.sin(Math.min(1, u / clip.dur) * Math.PI); hx += 0.2 * w; break;
        case "nod": hx += 0.22 * Math.sin(Math.min(1, u / clip.dur) * Math.PI * 2); break;
        case "lookUp": hx -= 0.55 * w; sx -= 0.06 * w; break;
        case "think": hx += 0.15 * w; hz += 0.14 * w; sx += 0.05 * w; break;
        case "talk1": sy += 0.12 * w * Math.sin(u * 3); hx += 0.05 * w * Math.sin(u * 4); break;
        case "talk2": sx += 0.06 * w; hz += 0.08 * w * Math.sin(u * 2.5); break;
        case "talk3": hx += 0.08 * w * Math.sin(u * 4.5); sy -= 0.08 * w; break;
        default: break;
      }
    }
    // talking life: tiny head movement with the voice
    openT += (open - openT) * Math.min(1, dt * 18);
    hx += 0.035 * openT;
    // pointing: twist the torso toward the feature and lean a little
    const pointing = !!pointT && time < pointUntil;
    pointW += ((pointing ? 1 : 0) - pointW) * Math.min(1, dt * 4);
    group.updateMatrixWorld(true);
    if (pointT && pointW > 0.01) {
      v1.copy(pointT); group.worldToLocal(v1);
      twist += (THREE.MathUtils.clamp(Math.atan2(v1.x, v1.z), -0.6, 0.6) - twist) * Math.min(1, dt * 5);
    } else twist *= 1 - Math.min(1, dt * 4);
    spine.rotation.set(sx * 0.6 + 0.05 * pointW, sy + twist * 0.5 * pointW, 0);
    chest.rotation.set(sx * 0.4, twist * 0.4 * pointW, 0);
    // head look-at in body space
    if (lookT) {
      head.getWorldPosition(v1);
      const d = lookT.clone().sub(v1).applyQuaternion(group.getWorldQuaternion(q).invert());
      const yaw = THREE.MathUtils.clamp(Math.atan2(d.x, d.z) - twist * pointW * 0.9, -1.1, 1.1);
      const pitch = THREE.MathUtils.clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.7, 0.55);
      lookYaw += (yaw - lookYaw) * Math.min(1, dt * 7); lookPitch += (pitch - lookPitch) * Math.min(1, dt * 7);
    } else { lookYaw *= 1 - Math.min(1, dt * 4); lookPitch *= 1 - Math.min(1, dt * 4); }
    neck.rotation.set(lookPitch * 0.35 + hx * 0.3, lookYaw * 0.4, hz * 0.4);
    head.rotation.set(lookPitch * 0.65 + hx * 0.7, lookYaw * 0.6, hz * 0.6);
  }

  return {
    root: group,
    kind: "mesh",
    tris: Math.round((geo.index?.count ?? geo.attributes.position.count) / 3) + 2,
    eyeHeight: 0.93 * H,
    update,
    setLocomotion(sp, tr = 0) { speed = sp; turn = tr; },
    gesture(g, hold) {
      if (g === "point") { pointUntil = time + (hold ?? 3.5); return; }
      clip = { g, t0: time, dur: hold ?? DUR[g] ?? 2 };
      nextTalk = time + clip.dur + 0.8;
    },
    setTalking(on) { talking = on; if (on) nextTalk = Math.min(nextTalk, time + 0.6); else open = 0; },
    lookAt(p) { lookT = p ? (lookT ?? new THREE.Vector3()).copy(p) : null; },
    pointAt(p) { pointT = p ? (pointT ?? new THREE.Vector3()).copy(p) : null; pointUntil = Infinity; },
    setMouth(m: MouthShape) { open = Math.max(m.aa, m.oh, m.ou * 0.7, m.ee * 0.5, m.ih * 0.4); },
    setExpression() { /* the static model has no face rig */ },
    dispose() {
      geo.dispose(); mat.dispose(); map?.dispose(); shadowTex.dispose(); (shadow.material as THREE.Material).dispose(); shadow.geometry.dispose();
      group.removeFromParent();
    },
  };
}
