// Visor 3D de una sola pieza para la lista de compras: la misma geometría a escala real que la escena del simulador,
// sobre una cuadrícula de 10 mm, con las medidas del modelo. También genera las miniaturas de la lista.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildKind, buildReel, buildRoller, localBox } from '../three/parts';

export interface PartShape {
  kind: string;
  /** solo para el rodillo, que depende del proyecto */
  rollerRadiusMm?: number;
  rollerBodyMm?: number;
  /** solo para el tambor de dos tambores (ADR-0011) */
  reel?: { coreR: number; flangeR: number; gap: number };
}

function makePart(s: PartShape): THREE.Group {
  if (s.kind === 'roller') return buildRoller(s.rollerRadiusMm ?? 50, s.rollerBodyMm ?? 50, false);
  if (s.kind === 'reel') return buildReel(s.reel?.coreR ?? 51.6, s.reel?.flangeR ?? 65, s.reel?.gap ?? 42);
  return buildKind(s.kind);
}

/** encuadre isométrico de la pieza; devuelve sus medidas (ancho, fondo, alto) en mm */
function stage(scene: THREE.Scene, camera: THREE.PerspectiveCamera, controls: OrbitControls | null, part: THREE.Object3D): [number, number, number] {
  const b = localBox(part);
  const size = b.getSize(new THREE.Vector3());
  const c = b.getCenter(new THREE.Vector3());
  part.position.sub(new THREE.Vector3(c.x, b.min.y, c.z));
  const r = Math.max(size.x, size.y, size.z) * 0.75 + 4;
  const target = new THREE.Vector3(0, size.y / 2, 0);
  const dist = r / Math.sin(((camera.fov * Math.PI) / 180) / 2);
  camera.position.copy(target).add(new THREE.Vector3(0.75, 0.6, 1).normalize().multiplyScalar(dist));
  camera.near = dist / 100;
  camera.far = dist * 10;
  camera.updateProjectionMatrix();
  camera.lookAt(target);
  if (controls) {
    controls.target.copy(target);
    controls.update();
  }
  const span = Math.max(40, Math.ceil((Math.max(size.x, size.z) * 1.6) / 10) * 10);
  const grid = new THREE.GridHelper(span, span / 10, 0x9fb2ba, 0xc2d0d5);
  grid.userData.temp = true;
  scene.add(grid);
  return [size.x, size.z, size.y];
}

function baseScene(renderer: THREE.WebGLRenderer): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd5e0e4);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.7;
  pm.dispose();
  scene.add(new THREE.HemisphereLight(0xf2f6f9, 0xb9b3aa, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(1, 2, 1.4);
  scene.add(key);
  return scene;
}

export interface Preview {
  show(shape: PartShape | null): [number, number, number] | null;
  thumbnail(shape: PartShape): string;
  readonly element: HTMLElement;
}

export function createPreview(): Preview {
  const element = document.createElement('div');
  element.className = 'mini3d';
  const canvas = document.createElement('canvas');
  const msg = document.createElement('div');
  msg.className = 'msg';
  element.append(canvas, msg);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = baseScene(renderer);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 5000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  let current: THREE.Object3D | null = null;
  let need = true;
  controls.addEventListener('change', () => (need = true));
  const size = () => {
    const w = element.clientWidth || 400;
    const h = element.clientHeight || 230;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    need = true;
  };
  new ResizeObserver(size).observe(element);
  const loop = () => {
    requestAnimationFrame(loop);
    controls.update();
    if (!need || !element.isConnected) return;
    need = false;
    renderer.render(scene, camera);
  };
  loop();

  // miniaturas con un renderizador aparte de 96 px
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = thumbCanvas.height = 96;
  let thumbRenderer: THREE.WebGLRenderer | null = null;
  let thumbScene: THREE.Scene | null = null;
  const thumbCam = new THREE.PerspectiveCamera(30, 1, 0.1, 5000);
  const cache = new Map<string, string>();

  function clearTemp(s: THREE.Scene): void {
    for (const c of [...s.children]) if (c.userData.temp) s.remove(c);
  }
  return {
    element,
    show(shape) {
      if (current) scene.remove(current);
      clearTemp(scene);
      current = null;
      if (!shape) {
        msg.textContent = 'Sin modelo 3D: es un material, un servicio o una pieza que se fabrica a la medida.';
        msg.style.display = '';
        need = true;
        return null;
      }
      const part = makePart(shape);
      part.userData.temp = true;
      scene.add(part);
      current = part;
      size();
      const dims = stage(scene, camera, controls, part);
      msg.textContent = `${dims.map((v) => (Math.abs(v - Math.round(v)) < 0.05 ? v.toFixed(0) : v.toFixed(1))).join(' × ')} mm · cuadrícula de 10 mm · arrastra para girar`;
      msg.style.display = '';
      need = true;
      return dims;
    },
    thumbnail(shape) {
      const key = JSON.stringify(shape);
      const hit = cache.get(key);
      if (hit) return hit;
      if (!thumbRenderer) {
        thumbRenderer = new THREE.WebGLRenderer({ canvas: thumbCanvas, antialias: true, preserveDrawingBuffer: true });
        thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
        thumbRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        thumbRenderer.setSize(96, 96, false);
        thumbScene = baseScene(thumbRenderer);
        thumbScene.background = new THREE.Color(0xffffff);
      }
      clearTemp(thumbScene!);
      const part = makePart(shape);
      part.userData.temp = true;
      thumbScene!.add(part);
      stage(thumbScene!, thumbCam, null, part);
      for (const c of thumbScene!.children) if (c instanceof THREE.GridHelper) c.visible = false;
      thumbRenderer.render(thumbScene!, thumbCam);
      const url = thumbCanvas.toDataURL('image/png');
      cache.set(key, url);
      return url;
    },
  };
}
