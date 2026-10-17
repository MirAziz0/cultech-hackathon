/* Textured models for walk scenes: content/models/<src>/{model.glb, texture.jpg, model.json}
   (made by scripts/import-character.ts --model), served from /models/<src>/. Cached per src. */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const cache = new Map<string, Promise<THREE.Object3D>>();

export function loadModel(src: string): Promise<THREE.Object3D> {
  let p = cache.get(src);
  if (!p) {
    p = (async () => {
      const base = `/models/${src}`;
      const cfg = (await fetch(`${base}/model.json`).then((r) => r.json())) as { model: string; texture: string | null };
      const [gltf, map] = await Promise.all([
        new GLTFLoader().loadAsync(`${base}/${cfg.model}`),
        cfg.texture ? new THREE.TextureLoader().loadAsync(`${base}/${cfg.texture}`) : Promise.resolve(null),
      ]);
      if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8; }
      const cutout = !!cfg.texture?.endsWith(".png");
      const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0, ...(cutout ? { alphaTest: 0.5, side: THREE.DoubleSide } : {}) });
      gltf.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = mat; });
      return gltf.scene;
    })();
    cache.set(src, p);
  }
  return p;
}
