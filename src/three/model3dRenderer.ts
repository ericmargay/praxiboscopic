// Render offscreen de elementos 3D del Animation Studio (glTF/GLB) con three.js: un renderer compartido con fondo
// transparente que encuadra el modelo según la cámara del elemento y devuelve su canvas para componerlo en el
// fotograma. Los modelos se cachean por `src`; mientras cargan devuelve null y avisa con `onLoaded` al terminar.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Geometry } from '../animation/evaluate';

type Model3dGeometry = Extract<Geometry, { kind: 'model3d' }>;

export interface Model3dRenderer {
  render(geometry: Model3dGeometry, w: number, h: number): CanvasImageSource | null;
  /** se llama cuando termina de cargar un modelo (para repintar) */
  onLoaded: (() => void) | null;
  dispose(): void;
}

interface Entry {
  scene: THREE.Group | null;
  /** radio de la esfera envolvente del modelo centrado */
  radius: number;
  failed: boolean;
}

export function createModel3dRenderer(): Model3dRenderer {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  const pivot = new THREE.Group();
  scene.add(pivot);
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
  keyLight.position.set(1, 2, 1.5);
  const fill = new THREE.HemisphereLight(0xffffff, 0x404040, 0.8);
  scene.add(keyLight, fill);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const studioEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const loader = new GLTFLoader();
  const cache = new Map<string, Entry>();
  let current: THREE.Group | null = null;
  const api: Model3dRenderer = { render, onLoaded: null, dispose };

  function load(src: string): Entry {
    let e = cache.get(src);
    if (e) return e;
    e = { scene: null, radius: 1, failed: false };
    cache.set(src, e);
    loader.load(
      src,
      (gltf) => {
        const root = gltf.scene;
        const box = new THREE.Box3().setFromObject(root);
        const center = box.getCenter(new THREE.Vector3());
        root.position.sub(center);
        const wrapper = new THREE.Group();
        wrapper.add(root);
        e!.scene = wrapper;
        e!.radius = Math.max(1e-6, box.getSize(new THREE.Vector3()).length() / 2);
        api.onLoaded?.();
      },
      undefined,
      () => {
        e!.failed = true;
      },
    );
    return e;
  }

  function render(g: Model3dGeometry, w: number, h: number): CanvasImageSource | null {
    const e = load(g.src);
    if (!e.scene || e.failed) return null;
    if (current !== e.scene) {
      if (current) pivot.remove(current);
      pivot.add(e.scene);
      current = e.scene;
    }
    renderer.setSize(Math.max(1, w), Math.max(1, h), false);
    camera.aspect = w / h;
    camera.fov = g.camera.fovDeg;
    camera.updateProjectionMatrix();
    // distancia 1 = el modelo cabe justo en el encuadre
    const fit = e.radius / Math.sin((camera.fov * Math.PI) / 360) / Math.min(1, camera.aspect);
    const dist = fit * Math.max(0.05, g.camera.distance);
    const el = (g.camera.elevationDeg * Math.PI) / 180;
    const az = (g.camera.azimuthDeg * Math.PI) / 180;
    camera.position.set(dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el), dist * Math.cos(el) * Math.cos(az));
    camera.lookAt(0, 0, 0);
    camera.near = Math.max(0.001, dist - e.radius * 2);
    camera.far = dist + e.radius * 2;
    camera.updateProjectionMatrix();
    e.scene.rotation.set((g.rotX * Math.PI) / 180, (g.rotY * Math.PI) / 180, 0);
    scene.environment = g.environment === 'studio' ? studioEnv : null;
    const warm = new THREE.Color().setRGB(...kelvinApprox(g.lightKelvin));
    keyLight.color.copy(warm);
    renderer.render(scene, camera);
    return renderer.domElement;
  }

  function dispose(): void {
    for (const e of cache.values()) if (e.scene) e.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) mat.dispose();
    });
    cache.clear();
    studioEnv.dispose();
    pmrem.dispose();
    renderer.dispose();
  }

  return api;
}

/** aproximación rápida de color de cuerpo negro (sRGB 0..1) para el tinte de la luz clave */
function kelvinApprox(k: number): [number, number, number] {
  const t = Math.min(40000, Math.max(1000, k)) / 100;
  const r = t <= 66 ? 1 : Math.min(1, Math.max(0, 1.2929 * (t - 60) ** -0.1332));
  const g = t <= 66 ? Math.min(1, Math.max(0, (0.3900 * Math.log(t) - 0.6318))) : Math.min(1, Math.max(0, 1.1299 * (t - 60) ** -0.0755));
  const b = t >= 66 ? 1 : t <= 19 ? 0 : Math.min(1, Math.max(0, 0.5432 * Math.log(t - 10) - 1.1963));
  return [r, g, b];
}
