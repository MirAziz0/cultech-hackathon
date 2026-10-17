/* Plan A guide: a VRM avatar (VRoid Studio etc.) from /characters/<id>/avatar.vrm.
   Animations come from /characters/<id>/anims.json — { "<name>": "anims/<file>.vrma | .fbx" } with
   names idle, walk, talk1, talk2, talk3, point, lookUp, wave, welcome, think, nod. Mixamo FBX clips
   are retargeted to the VRM humanoid (port of the three-vrm Mixamo example). Missing clips fall
   back to procedural posing: arms down, breathing, leg swing; pointing is always arm IK and the
   head look-at is always procedural, so the avatar works even with no clips at all.
   Any failure → null, and the caller keeps the procedural Plan B body. */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin, createVRMAnimationClip, type VRMAnimation } from "@pixiv/three-vrm-animation";
import type { Expression, Gesture, GuideAvatar, MouthShape } from "./types";

const CLIP_NAMES = ["idle", "walk", "talk1", "talk2", "talk3", "point", "lookUp", "wave", "welcome", "think", "nod"] as const;
type ClipName = (typeof CLIP_NAMES)[number];

/* Mixamo rig → VRM humanoid bone */
const MIXAMO: Record<string, VRMHumanBoneName> = {
  mixamorigHips: "hips", mixamorigSpine: "spine", mixamorigSpine1: "chest", mixamorigSpine2: "upperChest", mixamorigNeck: "neck", mixamorigHead: "head",
  mixamorigLeftShoulder: "leftShoulder", mixamorigLeftArm: "leftUpperArm", mixamorigLeftForeArm: "leftLowerArm", mixamorigLeftHand: "leftHand",
  mixamorigRightShoulder: "rightShoulder", mixamorigRightArm: "rightUpperArm", mixamorigRightForeArm: "rightLowerArm", mixamorigRightHand: "rightHand",
  mixamorigLeftUpLeg: "leftUpperLeg", mixamorigLeftLeg: "leftLowerLeg", mixamorigLeftFoot: "leftFoot", mixamorigLeftToeBase: "leftToes",
  mixamorigRightUpLeg: "rightUpperLeg", mixamorigRightLeg: "rightLowerLeg", mixamorigRightFoot: "rightFoot", mixamorigRightToeBase: "rightToes",
  mixamorigLeftHandThumb1: "leftThumbMetacarpal", mixamorigLeftHandThumb2: "leftThumbProximal", mixamorigLeftHandThumb3: "leftThumbDistal",
  mixamorigLeftHandIndex1: "leftIndexProximal", mixamorigLeftHandIndex2: "leftIndexIntermediate", mixamorigLeftHandIndex3: "leftIndexDistal",
  mixamorigLeftHandMiddle1: "leftMiddleProximal", mixamorigLeftHandMiddle2: "leftMiddleIntermediate", mixamorigLeftHandMiddle3: "leftMiddleDistal",
  mixamorigLeftHandRing1: "leftRingProximal", mixamorigLeftHandRing2: "leftRingIntermediate", mixamorigLeftHandRing3: "leftRingDistal",
  mixamorigLeftHandPinky1: "leftLittleProximal", mixamorigLeftHandPinky2: "leftLittleIntermediate", mixamorigLeftHandPinky3: "leftLittleDistal",
  mixamorigRightHandThumb1: "rightThumbMetacarpal", mixamorigRightHandThumb2: "rightThumbProximal", mixamorigRightHandThumb3: "rightThumbDistal",
  mixamorigRightHandIndex1: "rightIndexProximal", mixamorigRightHandIndex2: "rightIndexIntermediate", mixamorigRightHandIndex3: "rightIndexDistal",
  mixamorigRightHandMiddle1: "rightMiddleProximal", mixamorigRightHandMiddle2: "rightMiddleIntermediate", mixamorigRightHandMiddle3: "rightMiddleDistal",
  mixamorigRightHandRing1: "rightRingProximal", mixamorigRightHandRing2: "rightRingIntermediate", mixamorigRightHandRing3: "rightRingDistal",
  mixamorigRightHandPinky1: "rightLittleProximal", mixamorigRightHandPinky2: "rightLittleIntermediate", mixamorigRightHandPinky3: "rightLittleDistal",
};

async function mixamoClip(url: string, vrm: VRM): Promise<THREE.AnimationClip | null> {
  const asset = await new FBXLoader().loadAsync(url);
  const clip = THREE.AnimationClip.findByName(asset.animations, "mixamo.com") ?? asset.animations[0];
  if (!clip) return null;
  const tracks: THREE.KeyframeTrack[] = [];
  const restInv = new THREE.Quaternion(), parentRest = new THREE.Quaternion(), q = new THREE.Quaternion(), v = new THREE.Vector3();
  const motionHips = asset.getObjectByName("mixamorigHips")?.position.y ?? 1;
  const vrmHips = Math.abs((vrm.humanoid.getNormalizedBoneNode("hips")?.getWorldPosition(v).y ?? 1) - vrm.scene.getWorldPosition(v).y);
  const scale = vrmHips / motionHips;
  const vrm0 = vrm.meta?.metaVersion === "0";
  for (const track of clip.tracks) {
    const [rig, prop] = track.name.split(".");
    const bone = MIXAMO[rig];
    const node = bone ? vrm.humanoid.getNormalizedBoneNode(bone) : null;
    const src = asset.getObjectByName(rig);
    if (!node || !src) continue;
    src.getWorldQuaternion(restInv).invert();
    src.parent!.getWorldQuaternion(parentRest);
    if (track instanceof THREE.QuaternionKeyframeTrack) {
      const vals = track.values.slice();
      for (let i = 0; i < vals.length; i += 4) {
        q.fromArray(vals, i).premultiply(parentRest).multiply(restInv);
        q.toArray(vals, i);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.${prop}`, track.times, vals.map((x, i) => (vrm0 && i % 2 === 0 ? -x : x))));
    } else if (track instanceof THREE.VectorKeyframeTrack && bone === "hips") {
      // keep the bob, drop root motion (the guide controller moves the body)
      const vals = track.values.map((x, i) => (i % 3 === 1 ? x * scale : 0));
      tracks.push(new THREE.VectorKeyframeTrack(`${node.name}.${prop}`, track.times, vals));
    }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

export async function loadVrmAvatar(id: string): Promise<GuideAvatar | null> {
  const base = `/characters/${id}`;
  try {
    const head = await fetch(`${base}/avatar.vrm`, { method: "HEAD" });
    if (!head.ok) return null;
    const loader = new GLTFLoader();
    loader.register((p) => new VRMLoaderPlugin(p));
    loader.register((p) => new VRMAnimationLoaderPlugin(p));
    const gltf = await loader.loadAsync(`${base}/avatar.vrm`);
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) return null;
    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    VRMUtils.combineSkeletons(vrm.scene);
    VRMUtils.rotateVRM0(vrm);
    vrm.scene.traverse((o) => { o.frustumCulled = false; });

    /* clips */
    const mixer = new THREE.AnimationMixer(vrm.scene);
    const actions: Partial<Record<ClipName, THREE.AnimationAction>> = {};
    const list = await fetch(`${base}/anims.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})) as Partial<Record<ClipName, string>>;
    await Promise.all(CLIP_NAMES.filter((n) => list[n]).map(async (n) => {
      try {
        const url = `${base}/${list[n]}`;
        let clip: THREE.AnimationClip | null = null;
        if (/\.fbx$/i.test(url)) clip = await mixamoClip(url, vrm);
        else {
          const g = await loader.loadAsync(url);
          const anim = (g.userData.vrmAnimations as VRMAnimation[] | undefined)?.[0];
          if (anim) clip = createVRMAnimationClip(anim, vrm);
        }
        if (clip) actions[n] = mixer.clipAction(clip);
      } catch (e) { console.warn(`[guide] clip ${n} failed:`, e); }
    }));
    return makeAvatar(vrm, mixer, actions);
  } catch (e) {
    console.warn("[guide] VRM avatar not used:", e);
    return null;
  }
}

function makeAvatar(vrm: VRM, mixer: THREE.AnimationMixer, actions: Partial<Record<ClipName, THREE.AnimationAction>>): GuideAvatar {
  const root = new THREE.Group();
  root.name = "guide-vrm";
  root.add(vrm.scene);
  let tris = 0;
  vrm.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) tris += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3; });
  if (tris > 20000) console.warn(`[guide] VRM has ${Math.round(tris)} triangles (budget 20k) — reduce it in VRoid's export settings`);

  /* blob shadow (same as Plan B) */
  const sc = document.createElement("canvas"); sc.width = sc.height = 64;
  const sx = sc.getContext("2d")!; const gr = sx.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, "rgba(0,0,0,.42)"); gr.addColorStop(1, "rgba(0,0,0,0)"); sx.fillStyle = gr; sx.fillRect(0, 0, 64, 64);
  const shadowTex = new THREE.CanvasTexture(sc);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.012; root.add(shadow);

  const H = vrm.humanoid;
  const bone = (n: VRMHumanBoneName) => H.getNormalizedBoneNode(n);
  const E = vrm.expressionManager;
  const headY = (() => { const v = new THREE.Vector3(); bone("head")?.getWorldPosition(v); return v.y - vrm.scene.position.y; })();

  /* base layer */
  const idle = actions.idle, walk = actions.walk;
  idle?.play(); walk?.play();
  if (walk) walk.setEffectiveWeight(0);
  let time = 0, speed = 0, walkW = 0, phase = 0;
  let gestureAction: THREE.AnimationAction | null = null, gestureEnd = 0, gestureName: Gesture | null = null, gestureT0 = 0;
  let talking = false, nextTalk = 0;
  let lookTarget: THREE.Vector3 | null = null, pointTarget: THREE.Vector3 | null = null, pointUntil = Infinity, pointW = 0, pointSide: "left" | "right" = "right";
  let lookYaw = 0, lookPitch = 0;
  let mouth: MouthShape = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  const cur: MouthShape = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  let expr: Expression = "neutral";
  const exprW = { happy: 0, surprised: 0, angry: 0 };
  let nextBlink = 2, blinkT = -1;
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const REST = { left: new THREE.Vector3(1, 0, 0), right: new THREE.Vector3(-1, 0, 0) };

  const playGesture = (g: Gesture, hold?: number) => {
    const a = actions[g as ClipName];
    gestureName = g; gestureT0 = time;
    if (!a) { gestureEnd = time + (hold ?? 2); return; }
    gestureAction?.fadeOut(0.25);
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.fadeIn(0.25); a.play();
    gestureAction = a;
    gestureEnd = time + (hold ?? a.getClip().duration);
  };

  function update(dt: number) {
    time += dt;
    /* idle ↔ walk */
    walkW += ((speed > 0.1 ? Math.min(1, speed / 1.1) : 0) - walkW) * Math.min(1, dt * 6);
    if (walk) { walk.setEffectiveWeight(walkW); walk.timeScale = Math.max(0.6, speed / 1.2); }
    if (idle) idle.setEffectiveWeight(1 - walkW);
    if (gestureAction && time > gestureEnd) { gestureAction.fadeOut(0.3); gestureAction = null; }
    if (gestureName && time > gestureEnd) gestureName = null;
    if (talking && !gestureName && time > nextTalk && walkW < 0.3) {
      const opts = (["talk1", "talk2", "talk3", "nod"] as const).filter((n) => actions[n]);
      if (opts.length) playGesture(opts[Math.floor(Math.random() * opts.length)]);
      nextTalk = time + 2.5 + Math.random() * 1.5;
    }
    mixer.update(dt);

    /* procedural fallback when clips are missing */
    if (!idle) {
      const s = Math.sin(time * 1.6);
      bone("leftUpperArm")?.rotation.set(0, 0, -1.2);
      bone("rightUpperArm")?.rotation.set(0, 0, 1.2);
      bone("spine")?.rotation.set(0.015 * s, 0, 0);
    }
    if (!walk && walkW > 0.01) {
      phase += dt * (speed / 0.65) * Math.PI;
      const a = walkW * 0.5 * Math.sin(phase);
      bone("leftUpperLeg")?.rotation.set(-a, 0, 0);
      bone("rightUpperLeg")?.rotation.set(a, 0, 0);
      bone("leftLowerLeg")?.rotation.set(walkW * 0.6 * Math.max(0, Math.cos(phase)), 0, 0);
      bone("rightLowerLeg")?.rotation.set(walkW * 0.6 * Math.max(0, -Math.cos(phase)), 0, 0);
    }
    if (gestureName === "lookUp" && !actions.lookUp) bone("head")?.rotateX(-0.5 * Math.min(1, (time - gestureT0) * 3));

    root.updateMatrixWorld(true);
    /* head look-at */
    const head = bone("head"), neck = bone("neck");
    if (lookTarget && head) {
      head.getWorldPosition(v1);
      v2.copy(lookTarget).sub(v1).applyQuaternion(root.getWorldQuaternion(qa).invert());
      const yaw = THREE.MathUtils.clamp(Math.atan2(v2.x, v2.z), -1.1, 1.1);
      const pitch = THREE.MathUtils.clamp(-Math.atan2(v2.y, Math.hypot(v2.x, v2.z)), -0.7, 0.6);
      lookYaw += (yaw - lookYaw) * Math.min(1, dt * 7); lookPitch += (pitch - lookPitch) * Math.min(1, dt * 7);
    } else { lookYaw *= 1 - Math.min(1, dt * 4); lookPitch *= 1 - Math.min(1, dt * 4); }
    neck?.rotateY(lookYaw * 0.35); neck?.rotateX(lookPitch * 0.3);
    head?.rotateY(lookYaw * 0.65); head?.rotateX(lookPitch * 0.7);

    /* pointing: aim the upper arm, straighten the forearm */
    const pointing = !!pointTarget && time < pointUntil;
    pointW += ((pointing ? 1 : 0) - pointW) * Math.min(1, dt * 5);
    if (pointW > 0.01 && pointTarget) {
      const up = bone(pointSide === "left" ? "leftUpperArm" : "rightUpperArm"), lo = bone(pointSide === "left" ? "leftLowerArm" : "rightLowerArm");
      if (up && up.parent) {
        root.updateMatrixWorld(true);
        up.getWorldPosition(v1);
        v2.copy(pointTarget).sub(v1).normalize().applyQuaternion(up.parent.getWorldQuaternion(qa).invert());
        qb.setFromUnitVectors(REST[pointSide], v2);
        up.quaternion.slerp(qb, pointW);
        lo?.quaternion.slerp(qa.identity(), pointW * 0.9);
      }
    }

    /* face: mouth, blink, expressions */
    if (E) {
      const k = Math.min(1, dt * 20);
      for (const key of ["aa", "ih", "ou", "ee", "oh"] as const) { cur[key] += (mouth[key] - cur[key]) * k; E.setValue(key, cur[key]); }
      if (time > nextBlink) { blinkT = 0; nextBlink = time + 2 + Math.random() * 3.5; }
      let bl = 0;
      if (blinkT >= 0) { blinkT += dt; const b = blinkT / 0.15; bl = b < 1 ? 1 - Math.abs(1 - 2 * b) : 0; if (b >= 1) blinkT = -1; }
      E.setValue("blink", bl);
      const want = { happy: expr === "happy" ? 0.8 : 0, surprised: expr === "surprised" ? 0.8 : 0, angry: expr === "serious" ? 0.3 : 0 };
      for (const key of ["happy", "surprised", "angry"] as const) { exprW[key] += (want[key] - exprW[key]) * Math.min(1, dt * 6); E.setValue(key, exprW[key]); }
    }
    vrm.update(dt);
  }

  return {
    root,
    kind: "vrm",
    tris: Math.round(tris),
    eyeHeight: headY + 0.06,
    update,
    setLocomotion(sp) { speed = sp; },
    gesture(g, hold) {
      if (g === "point") { pointUntil = time + (hold ?? 3.5); if (actions.point) playGesture("point", hold); return; }
      playGesture(g, hold);
      nextTalk = time + 3;
    },
    setTalking(on) { talking = on; if (on) nextTalk = Math.min(nextTalk, time + 0.6); },
    lookAt(p) { lookTarget = p ? (lookTarget ?? new THREE.Vector3()).copy(p) : null; },
    pointAt(p) {
      if (!p) { pointTarget = null; return; }
      pointTarget = (pointTarget ?? new THREE.Vector3()).copy(p);
      root.updateMatrixWorld(true);
      v1.copy(p); root.worldToLocal(v1);
      pointSide = v1.x > 0.25 ? "left" : "right";
      pointUntil = Infinity;
    },
    setMouth(m) { mouth = m; },
    setExpression(e) { expr = e; },
    dispose() {
      mixer.stopAllAction();
      VRMUtils.deepDispose(vrm.scene);
      shadowTex.dispose(); (shadow.material as THREE.Material).dispose(); shadow.geometry.dispose();
      root.removeFromParent();
    },
  };
}
