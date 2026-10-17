/* Plan B guide: a procedural low-poly master builder in the maquette style.
   Rigid parts on a joint hierarchy (no skinning): each joint's parts are merged into one
   vertex-coloured mesh, so the whole character is ~18 draw calls and ~3k triangles.
   Animation is layered every frame: idle/walk cycle → gesture clips → talk gestures →
   head look-at → arm IK for pointing; then joints are damped toward the target pose. */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { AvatarLook, Expression, Gesture, GuideAvatar, MouthShape } from "./types";

type JointName =
  | "hips" | "robe" | "spine" | "neck" | "head" | "jaw"
  | "thighL" | "kneeL" | "thighR" | "kneeR"
  | "shL" | "elL" | "haL" | "shR" | "elR" | "haR";
type P3 = [number, number, number];
type Pose = Partial<Record<JointName, P3>>;

const JOINTS: JointName[] = ["hips", "robe", "spine", "neck", "head", "jaw", "thighL", "kneeL", "thighR", "kneeR", "shL", "elL", "haL", "shR", "elR", "haR"];

/* ---------- geometry helpers ---------- */
const col = new THREE.Color();
function paint(g: THREE.BufferGeometry, hex: string, m?: THREE.Matrix4) {
  g.deleteAttribute("uv");
  if (m) g.applyMatrix4(m);
  col.set(hex);
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return g;
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
const M = (pos: P3 = [0, 0, 0], rot: P3 = [0, 0, 0], scl: P3 = [1, 1, 1]) =>
  new THREE.Matrix4().compose(new THREE.Vector3(...pos), _q.clone().setFromEuler(_e.set(...rot)), new THREE.Vector3(...scl));
const lathe = (pts: [number, number][], seg = 9) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/* ---------- gesture clips: additive joint offsets over time ---------- */
interface Clip { dur: number; pose: (u: number) => Pose }
const CLIPS: Record<Exclude<Gesture, "point">, Clip> = {
  wave: { dur: 2.2, pose: (u) => ({ shR: [-0.25, 0, -2.45], elR: [-0.35, 0, 0.45 * Math.sin(u * 9)], head: [0, 0, 0.08] }) },
  welcome: { dur: 2.0, pose: (u) => { const b = Math.sin(Math.min(1, u / 2) * Math.PI); return { shR: [-0.5, 0, 0.5], elR: [-2.0, 0, 0], haR: [0, 0, 0.3], spine: [0.26 * b, 0, 0], head: [0.15 * b, 0, 0] }; } },
  talk1: { dur: 1.9, pose: (u) => ({ shR: [-0.55, 0, -0.18], elR: [-1.05 + 0.18 * Math.sin(u * 3.2), 0, 0], haR: [0.25, 0, -0.3], head: [0.04 * Math.sin(u * 4), 0, 0] }) },
  talk2: { dur: 2.1, pose: (u) => ({ shL: [-0.25, 0, 0.32], elL: [0.35 + 0.1 * Math.sin(u * 3), 0, 0], shR: [-0.45, 0, -0.38 - 0.08 * Math.sin(u * 3)], elR: [-0.95, 0, 0], haR: [0.3, 0, -0.4] }) },
  talk3: { dur: 1.7, pose: (u) => ({ shR: [-0.3, 0, -0.08], elR: [-1.35, 0, 0.12 * Math.sin(u * 5)], head: [0.1 * Math.sin(u * 4.5), 0.08, 0] }) },
  think: { dur: 2.6, pose: () => ({ shR: [-0.8, 0, 0.25], elR: [-2.25, 0, 0], haR: [0.4, 0, 0], head: [0.16, 0.12, 0.12] }) },
  lookUp: { dur: 2.6, pose: () => ({ head: [-0.55, 0, 0], neck: [-0.2, 0, 0], spine: [-0.08, 0, 0] }) },
  nod: { dur: 0.9, pose: (u) => ({ head: [0.2 * Math.sin(Math.min(1, u / 0.9) * Math.PI * 2), 0, 0] }) },
};

/** idle pose: left hand holds the rod in front, right arm relaxed */
const IDLE: Pose = { shL: [-0.12, 0, 0.12], elL: [-1.1, 0, 0], shR: [0.02, 0, -0.07], elR: [-0.18, 0, 0] };

export function buildProceduralAvatar(look: AvatarLook = {}): GuideAvatar {
  const robe = look.robe ?? "#6b4a2e";
  const sash = look.sash ?? "#2f7d78";
  const skin = look.skin ?? "#c99b77";
  const beard = "#3b2e26";
  const dark = "#2e241d";
  const cloth = look.turban ?? "#ece3cf";

  const root = new THREE.Group();
  root.name = "guide";
  const J = {} as Record<JointName, THREE.Group>;
  const parts = new Map<THREE.Group, THREE.BufferGeometry[]>();
  const joint = (name: JointName, parent: THREE.Object3D, pos: P3) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(...pos);
    parent.add(g);
    J[name] = g;
    return g;
  };
  const add = (g: THREE.Group, geo: THREE.BufferGeometry, hex: string, m?: THREE.Matrix4) => {
    if (!parts.has(g)) parts.set(g, []);
    parts.get(g)!.push(paint(geo, hex, m));
  };

  /* skeleton (metres; feet at y=0, faces +Z, +X is the character's left) */
  const hips = joint("hips", root, [0, 0.95, 0]);
  const robeJ = joint("robe", hips, [0, 0, 0]);
  const spine = joint("spine", hips, [0, 0.1, 0]);
  const neck = joint("neck", spine, [0, 0.47, 0]);
  const head = joint("head", neck, [0, 0.09, 0]);
  const jaw = joint("jaw", head, [0, 0.06, 0.02]);
  const thighL = joint("thighL", hips, [0.09, -0.02, 0]);
  const kneeL = joint("kneeL", thighL, [0, -0.42, 0]);
  const thighR = joint("thighR", hips, [-0.09, -0.02, 0]);
  const kneeR = joint("kneeR", thighR, [0, -0.42, 0]);
  const shL = joint("shL", spine, [0.215, 0.41, 0]);
  const elL = joint("elL", shL, [0, -0.28, 0]);
  const haL = joint("haL", elL, [0, -0.26, 0]);
  const shR = joint("shR", spine, [-0.215, 0.41, 0]);
  const elR = joint("elR", shR, [0, -0.28, 0]);
  const haR = joint("haR", elR, [0, -0.26, 0]);

  /* robe skirt (hangs from the hips, sways a little) */
  add(robeJ, lathe([[0.31, -0.83], [0.3, -0.74], [0.25, -0.4], [0.2, -0.05], [0.175, 0.12]], 10), robe);
  add(robeJ, new THREE.CylinderGeometry(0.312, 0.312, 0.04, 10, 1, true), sash, M([0, -0.8, 0]));
  /* torso + sash */
  add(spine, lathe([[0.17, -0.12], [0.19, 0.1], [0.205, 0.28], [0.19, 0.38], [0.13, 0.46], [0.06, 0.5]], 9), robe);
  add(spine, new THREE.CylinderGeometry(0.2, 0.192, 0.08, 9), sash, M([0, -0.04, 0]));
  add(spine, new THREE.CylinderGeometry(0.075, 0.1, 0.05, 9), cloth, M([0, 0.47, 0])); // shirt collar
  if (look.chokha) for (const s of [-1, 1]) for (let k = 0; k < 4; k++)
    add(spine, new THREE.CylinderGeometry(0.011, 0.011, 0.07, 5), "#d8c9a3", M([s * (0.085 + k * 0.022), 0.3, 0.17 - k * 0.012], [0.25, 0, 0]));
  /* legs: only the shins and boots show under the robe */
  for (const [th, kn] of [[thighL, kneeL], [thighR, kneeR]] as const) {
    add(th, new THREE.CylinderGeometry(0.065, 0.055, 0.42, 6), dark, M([0, -0.21, 0]));
    add(kn, new THREE.CylinderGeometry(0.052, 0.045, 0.44, 6), dark, M([0, -0.22, 0]));
    add(kn, new THREE.BoxGeometry(0.095, 0.075, 0.21), "#3a2a1e", M([0, -0.47, 0.045]));
  }
  /* arms with wide sleeves */
  for (const [sh, el, ha] of [[shL, elL, haL], [shR, elR, haR]] as const) {
    add(sh, new THREE.SphereGeometry(0.075, 7, 5), robe);
    add(sh, new THREE.CylinderGeometry(0.062, 0.075, 0.29, 7), robe, M([0, -0.14, 0]));
    add(el, new THREE.CylinderGeometry(0.072, 0.095, 0.25, 7), robe, M([0, -0.12, 0]));
    add(el, new THREE.CylinderGeometry(0.096, 0.096, 0.025, 7), sash, M([0, -0.24, 0]));
    add(ha, new THREE.SphereGeometry(0.042, 6, 5), skin, M([0, -0.04, 0], [0, 0, 0], [0.8, 1.15, 0.6]));
    add(ha, new THREE.CylinderGeometry(0.009, 0.008, 0.06, 4), skin, M([0, -0.1, 0.012]));
  }
  /* neck + head */
  add(neck, new THREE.CylinderGeometry(0.048, 0.055, 0.1, 7), skin, M([0, 0.04, 0]));
  add(head, new THREE.SphereGeometry(0.105, 9, 7), skin, M([0, 0.1, 0], [0, 0, 0], [1, 1.08, 1.02]));
  add(head, new THREE.ConeGeometry(0.02, 0.05, 5), skin, M([0, 0.09, 0.11], [Math.PI / 2, 0, 0]));
  for (const s of [-1, 1]) add(head, new THREE.SphereGeometry(0.03, 5, 4), skin, M([s * 0.103, 0.095, -0.005], [0, 0, 0], [0.4, 1, 0.7]));
  if (look.beard !== false) {
    add(head, new THREE.SphereGeometry(0.104, 9, 6), beard, M([0, 0.045, 0.012], [0, 0, 0], [1.03, 0.55, 0.98]));
    add(head, new THREE.CylinderGeometry(0.011, 0.011, 0.085, 5), beard, M([0, 0.058, 0.1], [0, 0, Math.PI / 2]));
    add(jaw, new THREE.ConeGeometry(0.075, 0.17, 7), beard, M([0, -0.075, 0.05], [Math.PI - 0.25, 0, 0]));
  } else {
    add(jaw, new THREE.SphereGeometry(0.06, 7, 5), skin, M([0, -0.01, 0.04], [0, 0, 0], [1, 0.6, 0.9]));
  }
  /* headwear */
  const hw = look.headwear ?? "turban";
  if (hw === "turban") {
    add(head, new THREE.TorusGeometry(0.1, 0.045, 6, 12), cloth, M([0, 0.165, 0], [Math.PI / 2, 0, 0]));
    add(head, new THREE.TorusGeometry(0.085, 0.04, 6, 12), cloth, M([0, 0.205, -0.008], [Math.PI / 2 + 0.12, 0, 0]));
    add(head, new THREE.SphereGeometry(0.1, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), cloth, M([0, 0.18, 0], [0, 0, 0], [1, 0.85, 1]));
    add(head, new THREE.SphereGeometry(0.016, 5, 4), sash, M([0, 0.19, 0.135]));
  } else if (hw === "kalpak") {
    add(head, new THREE.CylinderGeometry(0.095, 0.112, 0.18, 10), dark, M([0, 0.24, 0]));
  } else if (hw === "papaq") {
    add(head, new THREE.CylinderGeometry(0.13, 0.118, 0.17, 10), "#3a2e26", M([0, 0.235, 0]));
  } else {
    add(head, new THREE.SphereGeometry(0.112, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), sash, M([0, 0.15, 0], [0, 0, 0], [1, 0.62, 1]));
  }
  /* face features with their own joints (blink, brows, mouth) */
  const eyes = new THREE.Group(); eyes.position.set(0, 0.115, 0.093); head.add(eyes);
  const browL = new THREE.Group(); browL.position.set(0.036, 0.142, 0.098); head.add(browL);
  const browR = new THREE.Group(); browR.position.set(-0.036, 0.142, 0.098); head.add(browR);
  const mouth = new THREE.Group(); mouth.position.set(0, 0.052, 0.104); head.add(mouth);
  for (const s of [-1, 1]) parts.set(eyes, [...(parts.get(eyes) ?? []), paint(new THREE.SphereGeometry(0.014, 6, 4), "#1d1712", M([s * 0.036, 0, 0]))]);
  parts.set(browL, [paint(new THREE.BoxGeometry(0.042, 0.009, 0.012), beard)]);
  parts.set(browR, [paint(new THREE.BoxGeometry(0.042, 0.009, 0.012), beard)]);
  parts.set(mouth, [paint(new THREE.SphereGeometry(0.026, 7, 4), "#3a1a14", M([0, 0, 0], [0, 0, 0], [1.3, 0.45, 0.35]))]);

  /* measuring rod: lives under the left hand, kept upright in world space unless it is used as a pointer */
  const rod = new THREE.Group(); rod.position.set(0, -0.04, 0); haL.add(rod);
  const rodParts: THREE.BufferGeometry[] = [paint(new THREE.CylinderGeometry(0.014, 0.016, 1.7, 5), "#8a6a3f", M([0, 0.1, 0]))];
  for (let k = 0; k < 6; k++) rodParts.push(paint(new THREE.CylinderGeometry(0.019, 0.019, 0.018, 5), "#c9a45a", M([0, -0.55 + k * 0.28, 0])));
  rodParts.push(paint(new THREE.ConeGeometry(0.02, 0.05, 5), "#c9a45a", M([0, 0.97, 0])));
  parts.set(rod, rodParts);

  /* merge per joint */
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0 });
  let tris = 0;
  for (const [g, list] of parts) {
    const geo = mergeGeometries(list, false)!;
    list.forEach((x) => x.dispose());
    tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `${g.name || "part"}-mesh`;
    g.add(mesh);
  }
  /* soft blob shadow */
  const sc = document.createElement("canvas"); sc.width = sc.height = 64;
  const sx = sc.getContext("2d")!; const gr = sx.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, "rgba(0,0,0,.42)"); gr.addColorStop(1, "rgba(0,0,0,0)"); sx.fillStyle = gr; sx.fillRect(0, 0, 64, 64);
  const shadowTex = new THREE.CanvasTexture(sc);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.012; shadow.renderOrder = -1;
  root.add(shadow);
  tris += 2;

  /* ---------- animation state ---------- */
  const cur: Record<JointName, P3> = Object.fromEntries(JOINTS.map((j) => [j, [0, 0, 0]])) as Record<JointName, P3>;
  let time = 0, speed = 0, turnRate = 0, phase = 0, walkAmt = 0;
  let clip: { g: Gesture; t0: number; dur: number } | null = null;
  let talking = false, nextTalk = 0, lastTalk: Gesture = "talk3";
  let lookTarget: THREE.Vector3 | null = null, pointTarget: THREE.Vector3 | null = null;
  let pointW = 0, pointSide: "L" | "R" = "R", rodAlign = 0, pointUntil = Infinity;
  let mouthOpen = 0, mouthWide = 1, mouthTarget: MouthShape = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  let expr: Expression = "neutral", exprAmt = { up: 0, tilt: 0, eye: 1, open: 0 };
  let nextBlink = 2 + Math.random() * 3, blinkT = -1;
  let lookYaw = 0, lookPitch = 0;

  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion();
  const DOWN = new THREE.Vector3(0, -1, 0);
  const ROD_FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);

  const addPose = (into: Record<JointName, P3>, p: Pose, w: number) => {
    for (const k in p) { const a = into[k as JointName], b = p[k as JointName]!; a[0] += b[0] * w; a[1] += b[1] * w; a[2] += b[2] * w; }
  };

  function update(dt: number) {
    time += dt;
    const tgt: Record<JointName, P3> = Object.fromEntries(JOINTS.map((j) => [j, [0, 0, 0]])) as Record<JointName, P3>;
    addPose(tgt, IDLE, 1);
    /* idle life: breathing + weight shift */
    tgt.spine[0] += 0.015 * Math.sin(time * 1.6);
    tgt.hips[2] += 0.02 * Math.sin(time * 0.45);
    tgt.head[1] += 0.05 * Math.sin(time * 0.31);
    /* walk cycle (also small steps when turning on the spot) */
    const stepping = speed < 0.1 && Math.abs(turnRate) > 0.9 ? 0.35 : 0;
    const want = Math.max(Math.min(1, speed / 1.1), stepping);
    walkAmt += (want - walkAmt) * Math.min(1, dt * 6);
    phase += dt * (speed > 0.1 ? (speed / 0.65) * Math.PI : stepping ? 5 : 0);
    const a = walkAmt, s = Math.sin(phase), c = Math.cos(phase);
    tgt.thighL[0] += -0.5 * a * s; tgt.thighR[0] += 0.5 * a * s;
    tgt.kneeL[0] += 0.7 * a * Math.max(0, -c); tgt.kneeR[0] += 0.7 * a * Math.max(0, c);
    tgt.shR[0] += -0.32 * a * s; tgt.shL[0] += 0.08 * a * s;
    tgt.robe[0] += -0.05 * a; tgt.robe[2] += 0.025 * a * s;
    tgt.spine[0] += 0.06 * a; tgt.spine[1] += 0.05 * a * s;
    hips.position.y = 0.95 - 0.025 * a + 0.03 * a * Math.abs(c); // hips bob
    /* gesture clip */
    if (clip) {
      const u = time - clip.t0;
      if (u > clip.dur) clip = null;
      else if (clip.g !== "point") {
        const w = smooth(u / 0.3) * smooth((clip.dur - u) / 0.35);
        addPose(tgt, CLIPS[clip.g as Exclude<Gesture, "point">].pose(u), w * (1 - pointW * 0.8));
      }
    }
    /* automatic talk gestures */
    if (talking && !clip && time > nextTalk && walkAmt < 0.3) {
      const opts: Gesture[] = ["talk1", "talk2", "talk3", "nod"].filter((g) => g !== lastTalk) as Gesture[];
      const g = opts[Math.floor(Math.random() * opts.length)];
      lastTalk = g;
      clip = { g, t0: time, dur: CLIPS[g as Exclude<Gesture, "point">].dur };
      nextTalk = time + clip.dur + 0.5 + Math.random() * 1.4;
    }
    /* expression → brows / eyes / jaw */
    const E = { neutral: { up: 0, tilt: 0, eye: 1, open: 0 }, happy: { up: 0.006, tilt: -0.12, eye: 0.75, open: 0 }, surprised: { up: 0.014, tilt: 0.1, eye: 1.25, open: 0.25 }, serious: { up: -0.004, tilt: 0.28, eye: 0.9, open: 0 } }[expr];
    const ke = Math.min(1, dt * 6);
    exprAmt = { up: exprAmt.up + (E.up - exprAmt.up) * ke, tilt: exprAmt.tilt + (E.tilt - exprAmt.tilt) * ke, eye: exprAmt.eye + (E.eye - exprAmt.eye) * ke, open: exprAmt.open + (E.open - exprAmt.open) * ke };

    /* damp joints toward target */
    const k = 1 - Math.exp(-dt * 11);
    for (const j of JOINTS) {
      const cj = cur[j], tj = tgt[j];
      cj[0] += (tj[0] - cj[0]) * k; cj[1] += (tj[1] - cj[1]) * k; cj[2] += (tj[2] - cj[2]) * k;
      J[j].rotation.set(cj[0], cj[1], cj[2]);
    }

    root.updateMatrixWorld(true);
    /* head look-at (in body space, split between neck and head) */
    if (lookTarget) {
      head.getWorldPosition(v1);
      v2.copy(lookTarget).sub(v1).applyQuaternion(root.getWorldQuaternion(qa).invert());
      const yaw = THREE.MathUtils.clamp(Math.atan2(v2.x, v2.z) - cur.spine[1], -1.15, 1.15);
      const pitch = THREE.MathUtils.clamp(-Math.atan2(v2.y, Math.hypot(v2.x, v2.z)), -0.75, 0.6);
      lookYaw += (yaw - lookYaw) * Math.min(1, dt * 7); lookPitch += (pitch - lookPitch) * Math.min(1, dt * 7);
    } else { lookYaw *= 1 - Math.min(1, dt * 4); lookPitch *= 1 - Math.min(1, dt * 4); }
    neck.rotation.y += lookYaw * 0.35; neck.rotation.x += lookPitch * 0.3;
    head.rotation.y += lookYaw * 0.65; head.rotation.x += lookPitch * 0.7;

    /* pointing: aim the whole arm at the target (two-bone chain held straight) */
    const pointing = !!pointTarget && time < pointUntil;
    pointW += ((pointing ? 1 : 0) - pointW) * Math.min(1, dt * 5);
    if (pointW > 0.01 && pointTarget) {
      const sh = pointSide === "L" ? shL : shR, el = pointSide === "L" ? elL : elR;
      root.updateMatrixWorld(true);
      sh.getWorldPosition(v1);
      v2.copy(pointTarget).sub(v1).normalize().applyQuaternion(spine.getWorldQuaternion(qa).invert());
      qb.setFromUnitVectors(DOWN, v2);
      qc.copy(sh.quaternion).slerp(qb, pointW);
      sh.quaternion.copy(qc);
      el.rotation.x *= 1 - pointW * 0.92;
      el.rotation.z *= 1 - pointW;
    }
    rodAlign += ((pointing && pointSide === "L" ? 1 : 0) - rodAlign) * Math.min(1, dt * 5);
    /* mouth + jaw */
    const m = mouthTarget;
    const open = Math.min(1, Math.max(m.aa, m.oh * 0.85, m.ou * 0.55, m.ee * 0.45, m.ih * 0.4) + exprAmt.open);
    const wide = 1 + 0.45 * (m.ee + m.ih) - 0.4 * (m.ou + m.oh * 0.6) + (expr === "happy" ? 0.15 : 0);
    const km = Math.min(1, dt * 22);
    mouthOpen += (open - mouthOpen) * km; mouthWide += (wide - mouthWide) * km;
    jaw.rotation.set(mouthOpen * 0.32, 0, 0);
    mouth.scale.set(mouthWide, 0.35 + mouthOpen * 2.2, 1);
    /* blink + brows */
    if (time > nextBlink) { blinkT = 0; nextBlink = time + 2 + Math.random() * 3.5; }
    let eyeS = exprAmt.eye;
    if (blinkT >= 0) { blinkT += dt; const b = blinkT / 0.15; eyeS *= b < 1 ? Math.abs(1 - 2 * b) * 0.9 + 0.1 : 1; if (b >= 1) blinkT = -1; }
    eyes.scale.y = eyeS;
    browL.position.y = browR.position.y = 0.142 + exprAmt.up;
    browL.rotation.z = -exprAmt.tilt; browR.rotation.z = exprAmt.tilt;

    /* rod: upright in body space (slight forward tilt), or along the arm when pointing with the left hand */
    root.updateMatrixWorld(true);
    haL.getWorldQuaternion(qa);
    root.getWorldQuaternion(qb);
    qb.multiply(qc.setFromAxisAngle(v1.set(1, 0, 0), 0.08));
    const upright = qa.clone().invert().multiply(qb);
    rod.quaternion.copy(upright).slerp(ROD_FLIP, rodAlign);
  }

  return {
    root,
    kind: "procedural",
    tris,
    eyeHeight: 1.68,
    update,
    setLocomotion(sp, tr = 0) { speed = sp; turnRate = tr; },
    gesture(g, hold) {
      if (g === "point") { pointUntil = time + (hold ?? 3.5); return; }
      clip = { g, t0: time, dur: hold ?? CLIPS[g].dur };
      nextTalk = time + clip.dur + 0.8;
    },
    setTalking(on) { talking = on; if (on) nextTalk = Math.min(nextTalk, time + 0.6); },
    lookAt(p) { lookTarget = p ? (lookTarget ?? new THREE.Vector3()).copy(p) : null; },
    pointAt(p) {
      if (!p) { pointTarget = null; return; }
      pointTarget = (pointTarget ?? new THREE.Vector3()).copy(p);
      // side: targets on the character's left use the rod hand (the rod becomes a pointer)
      root.updateMatrixWorld(true);
      v1.copy(p); root.worldToLocal(v1);
      pointSide = v1.x > 0.25 ? "L" : "R";
      pointUntil = Infinity;
    },
    setMouth(mm) { mouthTarget = mm; },
    setExpression(e) { expr = e; },
    dispose() {
      root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
      mat.dispose(); shadowTex.dispose(); (shadow.material as THREE.Material).dispose();
      root.removeFromParent();
    },
  };
}
