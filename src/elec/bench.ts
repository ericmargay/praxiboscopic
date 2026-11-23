// Escena 3D del visor de conexiones (ADR-0015): la electrónica de la mesa de dos tambores extendida sobre un banco,
// con cada cable de punta a punta. Las piezas son las del catálogo a escala real (`src/three/parts.ts`); lo que se
// conecta, dónde y en qué paso sale de `wiring.ts`. Aquí solo se dibuja: colocar, tender los cables, resaltar el
// paso, seleccionar y rotular los pines.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PSU_MM } from '../mech/assembly';
import { BREADBOARD, ESP32_ROW, PITCH, box, buildKind, cyl, mat } from '../three/parts';
import { CABLE, COLOR_LABEL, ESP32_J2, ESP32_J3, WIRE_COLOR, WIRING, parseHole, refText, splitRef, type ElecComponent, type Hole, type Wire } from './wiring';

export type Sel = { kind: 'component' | 'wire'; id: string } | null;
/** qué cables se ven: hasta el paso (los del paso, resaltados), solo los del paso, o todos */
export type ViewMode = 'upto' | 'step' | 'all';

export interface Bench {
  readonly element: HTMLElement;
  setStep(n: number, mode: ViewMode): void;
  select(sel: Sel, focus?: boolean): void;
  /** ESP32 volteado, con las patas hacia arriba (suelto), o derecho (en su placa de expansión) */
  setFlipped(v: boolean): void;
  view(kind: 'iso' | 'top' | 'step'): void;
  onSelect: (sel: Sel) => void;
  resize(): void;
  /** para las capturas: verdadero cuando ya se dibujó */
  ready(): boolean;
}

const ACCENT = 0x1b6c86;
const SCENE_BG = 0xd5e0e4;

/** agujero de la protoboard en su marco: la fila a queda del lado de quien mira (+z) y la columna 1 a la izquierda */
export function holeXZ(h: Hole): { x: number; z: number } {
  const x = (h.col - 32) * PITCH;
  if (h.rail) {
    const d = h.rail === '+' ? 22.4 : 19.86;
    return { x, z: h.row === 'a' ? d : -d };
  }
  const i = 'abcdefghij'.indexOf(h.row);
  return { x, z: i < 5 ? 3.81 + (4 - i) * PITCH : -(3.81 + (i - 5) * PITCH) };
}

/** dónde va cada pieza suelta sobre el banco (mm; y giro sobre el eje vertical) */
const PLACE: Record<string, { x: number; z: number; rot?: number; y?: number }> = {
  breadboard: { x: 0, z: 0 },
  psu: { x: 0, z: -160, rot: -Math.PI / 2 },
  ac: { x: -150, z: -118 },
  fuse: { x: 30, z: -52, rot: -Math.PI / 2 },
  'buck-5v': { x: -30, z: -52, rot: -Math.PI / 2 },
  'buck-12v': { x: 62, z: -52, rot: -Math.PI / 2 },
  'dm542-1': { x: -170, z: -30 },
  'dm542-2': { x: 170, z: -30 },
  'motor-1': { x: -135, z: 72, rot: Math.PI },
  'motor-2': { x: 205, z: 72, rot: Math.PI },
  esp32: { x: -45, z: 64 },
  'hand-sensor-1': { x: -112, z: 128 },
  'hand-sensor-2': { x: -72, z: 128 },
  as5600: { x: -32, z: 128 },
  sensor: { x: 12, z: 124, rot: Math.PI / 2 },
  'led-resistor': { x: 98, z: 56 },
  led: { x: 132, z: 104 },
};

// --- texto plano sobre el banco: letreros de pines y numeración de la protoboard ----------------------------------------
const texCache = new Map<string, { tex: THREE.Texture; aspect: number }>();
function textTexture(text: string, color: string, bold: boolean): { tex: THREE.Texture; aspect: number } {
  const key = `${text}|${color}|${bold}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  const px = 56;
  const font = `${bold ? 700 : 500} ${px}px -apple-system, 'Segoe UI', Roboto, sans-serif`;
  let ctx = c.getContext('2d')!;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 8;
  c.width = w;
  c.height = px + 12;
  ctx = c.getContext('2d')!;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 4, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const out = { tex, aspect: c.width / c.height };
  texCache.set(key, out);
  return out;
}
/** letrero acostado sobre el banco, de `h` mm de alto; `turn` lo gira sobre la vertical (π/2: se lee hacia el fondo) */
function flatText(text: string, h: number, opts: { color?: string; bold?: boolean; turn?: number; align?: 'left' | 'center' | 'right' } = {}): THREE.Mesh {
  const { tex, aspect } = textTexture(text, opts.color ?? '#13242c', opts.bold ?? false);
  const w = h * aspect;
  const geo = new THREE.PlaneGeometry(w, h);
  const align = opts.align ?? 'center';
  geo.translate(align === 'left' ? w / 2 : align === 'right' ? -w / 2 : 0, 0, 0);
  geo.rotateX(-Math.PI / 2);
  if (opts.turn) geo.rotateY(opts.turn);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  m.raycast = () => {};
  m.renderOrder = 2;
  return m;
}

// --- piezas que no están en el catálogo -------------------------------------------------------------------------------
function buildFuse(): THREE.Group {
  const g = new THREE.Group();
  const holder = cyl(6, 30, mat('black'), 0, 7, 0, 20);
  holder.rotation.z = Math.PI / 2;
  const cap = cyl(6.4, 6, mat('anod'), 12, 7, 0, 20);
  cap.rotation.z = Math.PI / 2;
  g.add(holder, cap);
  return g;
}
function buildDip8(): THREE.Group {
  // pines 1 a 4 del lado +z (fila e) y la muesca hacia −x: el pin 1 queda en la esquina de −x, +z
  const g = new THREE.Group();
  g.add(box(9.8, 3.3, 6.35, mat('epoxy'), 0, 1.2 + 1.65, 0));
  for (const z of [-3.81, 3.81]) for (const k of [-1.5, -0.5, 0.5, 1.5]) g.add(box(0.6, 3.2, 0.5, mat('tin'), k * PITCH, 0.6, z));
  const notch = cyl(1, 0.3, mat('hole'), -4.9, 4.5, 0, 14);
  const dot = cyl(0.55, 0.3, mat('white'), -3.6, 4.5, 2);
  g.add(notch, dot);
  return g;
}
function buildCeramic(): THREE.Group {
  const disc = cyl(2.6, 1.6, new THREE.MeshStandardMaterial({ color: 0x2f6f9f, roughness: 0.5 }), 0, 6, 0, 20);
  disc.rotation.x = Math.PI / 2;
  const g = new THREE.Group();
  g.add(disc, box(0.5, 4.5, 0.5, mat('tin'), -PITCH / 2, 2.2, 0), box(0.5, 4.5, 0.5, mat('tin'), PITCH / 2, 2.2, 0));
  return g;
}
function buildCapSmall(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(2.5, 11, mat('capBlue'), 0, 1.5 + 5.5, 0, 20), cyl(2.3, 0.3, mat('tin'), 0, 12.6, 0, 20), box(1.4, 10, 0.3, mat('white'), 0, 7, -2.45));
  return g;
}
/** el LED sobre su disipador, mirando hacia arriba; origen en el banco */
function buildLedOnSink(): THREE.Group {
  const g = new THREE.Group();
  const sink = buildKind('heatsink');
  sink.rotation.x = -Math.PI / 2;
  sink.position.y = 20;
  const led = buildKind('led10');
  led.rotation.x = -Math.PI / 2;
  led.position.y = 20;
  g.add(sink, led);
  return g;
}
/** el cable de alimentación: funda, tres hilos y la clavija */
function buildAc(): THREE.Group {
  const g = new THREE.Group();
  const jacket = cyl(3.4, 90, mat('black'), -45, 3.4, 0, 14);
  jacket.rotation.z = Math.PI / 2;
  g.add(jacket, box(26, 20, 34, mat('black'), -102, 10, 0));
  for (const z of [-6, 6]) g.add(box(16, 1.4, 6, mat('tin'), -122, 10, z));
  g.add(cyl(2.2, 16, mat('tin'), -122, 16, 0, 10).rotateZ(Math.PI / 2));
  return g;
}

function buildComponent(c: ElecComponent): THREE.Group {
  switch (c.kind) {
    case 'ac':
      return buildAc();
    case 'fuse':
      return buildFuse();
    case 'ir2101':
      return buildDip8();
    case 'ceramic':
      return buildCeramic();
    case 'cap-small':
      return buildCapSmall();
    case 'led10':
      return buildLedOnSink();
    default:
      return buildKind(c.kind);
  }
}

/** puntas de cada pieza suelta, en su propio marco (mm) */
function localTerminals(c: ElecComponent, obj: THREE.Object3D): Record<string, THREE.Vector3> {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const anchors = (obj.userData.anchors ?? {}) as Record<string, THREE.Vector3>;
  switch (c.kind) {
    case 'psu': {
      // de izquierda a derecha, vistos de frente: L, N, ⏚, −V, −V, +V, +V
      const out: Record<string, THREE.Vector3> = {};
      ['L', 'N', 'PE', '-V1', '-V2', '+V1', '+V2'].forEach((id, k) => (out[id] = v(PSU_MM.l / 2 - 6, PSU_MM.h + 1, 34 - k * 11.33)));
      return out;
    }
    case 'ac':
      return { L: v(2, 3.4, -3), N: v(2, 3.4, 0), PE: v(2, 3.4, 3) };
    case 'fuse':
      return { in: v(-16, 7, 0), out: v(16, 7, 0) };
    case 'nema17': {
      const p = anchors.conn ?? v(0, 7, 27);
      const out: Record<string, THREE.Vector3> = {};
      ['A+', 'A-', 'B+', 'B-'].forEach((id, k) => (out[id] = p.clone().add(v((k - 1.5) * 2, 0, 0))));
      return out;
    }
    case 'esp32': {
      // J2 del lado −z y J3 del lado +z; el primer pin de cada fila, junto a la antena (+x)
      const out: Record<string, THREE.Vector3> = {};
      ESP32_J2.forEach((id, k) => (out[id] = v(22.86 - k * PITCH, -6, -ESP32_ROW / 2)));
      ESP32_J3.forEach((id, k) => (out[id] = v(22.86 - k * PITCH, -6, ESP32_ROW / 2)));
      return out;
    }
    case 'vl53l4cd': {
      const out: Record<string, THREE.Vector3> = {};
      c.pins.forEach((p, k) => (out[p.id] = v(-6.35 + k * PITCH, 1.8, -10.2)));
      return out;
    }
    case 'as5600': {
      const out: Record<string, THREE.Vector3> = {};
      c.pins.forEach((p, k) => (out[p.id] = v(-7.62 + k * PITCH, 1.8, -10)));
      return out;
    }
    case 'led10': {
      // el LED quedó acostado: su + y su − están arriba del disipador
      return { '+': v(-8.5, 22.2, 0), '-': v(8.5, 22.2, 0) };
    }
    default:
      return Object.fromEntries(Object.entries(anchors).map(([k, p]) => [k, p.clone()]));
  }
}

const RADIUS: Record<Wire['cable'], number> = { ac: 1.3, awg18: 1.0, tip: 0.85, motor: 0.6, mm: 0.55, hm: 0.55, hh: 0.55 };

export function createBench(): Bench {
  const element = document.createElement('div');
  element.className = 'ev-stage';
  const canvas = document.createElement('canvas');
  const overlay = document.createElement('div');
  overlay.className = 'ev-labels';
  const tip = document.createElement('div');
  tip.className = 'ev-tip';
  element.append(canvas, overlay, tip);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE_BG);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.7;
  pm.dispose();
  scene.add(new THREE.HemisphereLight(0xf2f6f9, 0xb9b3aa, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(-180, 520, 260);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -340, right: 340, top: 320, bottom: -320, near: 50, far: 1400 });
  key.shadow.bias = -0.0006;
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(32, 1, 5, 6000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.minDistance = 30;
  controls.maxDistance = 2200;
  controls.zoomToCursor = true;

  // banco: una hoja clara con cuadrícula de 10 mm
  const bench = new THREE.Mesh(new THREE.PlaneGeometry(760, 520), new THREE.MeshStandardMaterial({ color: 0xeef2f3, roughness: 0.95 }));
  bench.rotation.x = -Math.PI / 2;
  bench.position.set(15, -0.2, -50);
  bench.receiveShadow = true;
  bench.raycast = () => {};
  const grid = new THREE.GridHelper(760, 76, 0xb7c6cc, 0xd3dde0);
  grid.position.set(15, -0.1, -50);
  grid.scale.z = 520 / 760;
  grid.raycast = () => {};
  scene.add(bench, grid);

  const wr = WIRING;
  const root = new THREE.Group();
  scene.add(root);

  // --- piezas ----------------------------------------------------------------------------------------------------------
  interface Node {
    c: ElecComponent;
    obj: THREE.Group;
    terminals: Record<string, THREE.Vector3>;
  }
  const nodes = new Map<string, Node>();
  const bb = wr.components.find((c) => c.kind === 'breadboard')!;
  const bbObj = buildComponent(bb);
  let flipped = true;

  const holePos = (ref: string, lift = 0): THREE.Vector3 => {
    const h = parseHole(ref)!;
    const p = holeXZ(h);
    return new THREE.Vector3(p.x, BREADBOARD.h + lift, p.z);
  };

  function mountOnBoard(c: ElecComponent, obj: THREE.Group): void {
    const pts = Object.values(c.mount!).map((h) => holePos(h));
    const mid = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    obj.position.copy(mid);
    // el 2N3904 trae la cara plana hacia −z: aquí va hacia la fila a (+z)
    if (c.kind === 'npn') obj.rotation.y = Math.PI;
    if (c.kind === 'cap1000') obj.position.y = BREADBOARD.h;
  }

  for (const c of wr.components) {
    const obj = c.id === 'breadboard' ? bbObj : buildComponent(c);
    obj.userData.pick = { kind: 'component', id: c.id };
    if (c.mount) mountOnBoard(c, obj);
    else {
      const pl = PLACE[c.id];
      if (!pl) throw new Error(`Sin lugar en el banco: ${c.id}`);
      obj.position.set(pl.x, pl.y ?? 0, pl.z);
      obj.rotation.y = pl.rot ?? 0;
    }
    root.add(obj);
    nodes.set(c.id, { c, obj, terminals: c.mount ? {} : localTerminals(c, obj) });
  }

  /** punto del mundo donde termina un cable */
  function terminal(ref: string): THREE.Vector3 {
    if (ref.startsWith('bb:')) return holePos(ref);
    const [cid, pid] = splitRef(ref);
    const n = nodes.get(cid);
    if (!n) throw new Error(`Sin pieza: ${ref}`);
    if (n.c.mount?.[pid]) return holePos(n.c.mount[pid], 1.5);
    const p = n.terminals[pid];
    if (!p) throw new Error(`Sin punta: ${ref}`);
    n.obj.updateMatrixWorld(true);
    return n.obj.localToWorld(p.clone());
  }

  // --- numeración de la protoboard y letreros de pines -----------------------------------------------------------------
  const boardText = new THREE.Group();
  for (let col = 1; col <= 63; col++) {
    if (col !== 1 && col % 5 !== 0) continue;
    for (const z of [16.9, -16.9]) {
      const t = flatText(String(col), 2.1, { color: '#3a4e57', bold: true });
      t.position.set((col - 32) * PITCH, BREADBOARD.h + 0.25, z);
      boardText.add(t);
    }
  }
  for (const row of 'abcdefghij') {
    const z = holeXZ({ rail: '', row, col: 1 }).z;
    for (const x of [-80.9, 80.9]) {
      const t = flatText(row, 2.1, { color: '#3a4e57', bold: true });
      t.position.set(x, BREADBOARD.h + 0.25, z);
      boardText.add(t);
    }
  }
  for (const [text, z] of [['+ 24 V', -25.2], ['− tierra', -17.5], ['− tierra', 17.5], ['+ 5 V', 25.2]] as const) {
    const t = flatText(text, 1.9, { color: text.startsWith('+') ? '#ab2a22' : '#1d4f91', bold: true, align: 'left' });
    t.position.set(-78, BREADBOARD.h + 0.25, z);
    boardText.add(t);
  }
  root.add(boardText);

  const pinText = new THREE.Group();
  root.add(pinText);
  const usedPins = new Set<string>();
  for (const x of wr.wires) for (const end of [x.from, x.to]) if (!end.startsWith('bb:')) usedPins.add(end);

  /** letreros de los pines de las piezas sueltas, junto a cada punta y hacia afuera de la pieza */
  function buildPinText(): void {
    pinText.clear();
    for (const { c, obj } of nodes.values()) {
      // el cable, el fusible y la resistencia de potencia no traen nada impreso en sus puntas
      if (c.mount || !c.pins.length || c.kind === 'ac' || c.kind === 'fuse' || c.kind === 'res10w') continue;
      const center = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
      for (const p of c.pins) {
        const ref = `${c.id}.${p.id}`;
        let at: THREE.Vector3;
        try {
          at = terminal(ref);
        } catch {
          continue;
        }
        const used = usedPins.has(ref);
        const label = p.label.replace(/^\d /, '');
        const out = at.clone().sub(center).setY(0);
        // hacia dónde se aleja el letrero: por el lado más cercano al borde de la pieza
        const alongZ = c.kind === 'esp32' || c.kind === 'dm542' || c.kind === 'vl53l4cd' || c.kind === 'as5600' || c.kind === 'psu' || c.kind === 'lm2596' || c.kind === 'nema17' || c.kind === 'fuse' ? true : Math.abs(out.z) > Math.abs(out.x);
        const dir = alongZ ? Math.sign(out.z) || 1 : Math.sign(out.x) || 1;
        const narrow = c.kind === 'esp32' || c.kind === 'vl53l4cd' || c.kind === 'as5600' || c.kind === 'nema17';
        const h = c.kind === 'esp32' ? 1.7 : c.kind === 'dm542' ? 2.4 : c.kind === 'psu' ? 4 : narrow ? 1.7 : 2.6;
        let t: THREE.Mesh;
        if (alongZ && narrow) {
          // filas apretadas: el texto sale perpendicular a la fila
          t = flatText(label, h, { color: used ? '#13242c' : '#8a9aa1', bold: used, turn: Math.PI / 2, align: dir > 0 ? 'right' : 'left' });
          t.position.set(at.x, 0.3, at.z + dir * (c.kind === 'esp32' ? 3.2 : 5));
        } else if (alongZ) {
          t = flatText(label, h, { color: used ? '#13242c' : '#8a9aa1', bold: used });
          t.position.set(at.x, 0.3, at.z + dir * (h * 0.5 + (c.kind === 'psu' ? 6 : c.kind === 'fuse' ? 4 : 3)));
        } else {
          t = flatText(label, h, { color: used ? '#13242c' : '#8a9aa1', bold: used, align: dir > 0 ? 'left' : 'right' });
          t.position.set(at.x + dir * 4, 0.3, at.z);
        }
        t.userData.owner = c.id;
        pinText.add(t);
      }
    }
  }

  // --- cables --------------------------------------------------------------------------------------------------------
  interface WireNode {
    w: Wire;
    group: THREE.Group;
    mat: THREE.MeshStandardMaterial;
    ends: [THREE.Vector3, THREE.Vector3];
    mid: THREE.Vector3;
  }
  const wires = new Map<string, WireNode>();
  const wireRoot = new THREE.Group();
  root.add(wireRoot);
  const housing = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.7 });

  function buildWires(): void {
    for (const n of wires.values()) {
      n.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      n.mat.dispose();
    }
    wires.clear();
    wireRoot.clear();
    wr.wires.forEach((x, i) => {
      const a = terminal(x.from);
      const b = terminal(x.to);
      const d = a.distanceTo(b);
      // arco: más alto entre más largo, y cada cable a una altura un poco distinta para que no se encimen
      const h = Math.min(60, 7 + d * 0.16) + (i % 6) * 1.6;
      const up = (p: THREE.Vector3, k: number) => p.clone().add(new THREE.Vector3(0, h * k, 0));
      const lerp = (t: number) => a.clone().lerp(b, t);
      const pts = d < 14 ? [a, up(lerp(0.5), 1), b] : [a, up(a, 0.55), up(lerp(0.25), 1), up(lerp(0.75), 1), up(b, 0.55), b];
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const m = new THREE.MeshStandardMaterial({ color: WIRE_COLOR[x.color], roughness: 0.55, transparent: true });
      const seg = Math.max(18, Math.round(d / 4));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, RADIUS[x.cable], 8, false), m);
      tube.castShadow = true;
      const g = new THREE.Group();
      g.add(tube);
      // manga gruesa e invisible: un cable delgado es difícil de tocar
      const fat = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(10, Math.round(seg / 2)), 2.6, 5, false), new THREE.MeshBasicMaterial({ visible: false }));
      g.add(fat);
      // carcasas de los jumpers: larga en la hembra, corta en el macho
      const jumper = x.cable === 'mm' || x.cable === 'hm' || x.cable === 'hh';
      if (jumper || x.cable === 'tip') {
        for (const [end, p] of [[x.from, a], [x.to, b]] as const) {
          const onBoard = end.startsWith('bb:') || !!nodes.get(splitRef(end)[0])?.c.mount;
          if (x.cable === 'tip' && !onBoard) continue;
          const female = !onBoard && x.cable !== 'mm';
          const len = female ? 12 : 6;
          const hs = new THREE.Mesh(new THREE.BoxGeometry(2.3, len, 2.3), housing);
          hs.position.copy(p).add(new THREE.Vector3(0, len / 2 + (female ? 0 : 1), 0));
          hs.castShadow = true;
          g.add(hs);
        }
      }
      g.userData.pick = { kind: 'wire', id: x.id };
      wireRoot.add(g);
      wires.set(x.id, { w: x, group: g, mat: m, ends: [a, b], mid: curve.getPoint(0.5) });
    });
  }

  function placeEsp(): void {
    const n = nodes.get('esp32')!;
    // suelto: patas arriba, apoyado en el blindaje del módulo. Derecho: sobre sus patas
    n.obj.rotation.set(flipped ? Math.PI : 0, 0, 0);
    n.obj.position.y = flipped ? 5 : 8.5;
  }
  placeEsp();
  root.updateMatrixWorld(true);
  buildWires();
  buildPinText();

  // --- estado: paso, selección, resaltado -------------------------------------------------------------------------------
  let step = 1;
  let mode: ViewMode = 'upto';
  let sel: Sel = null;
  let hover: Sel = null;
  let dirty = true;
  let drawn = false;
  const selBox = new THREE.Box3Helper(new THREE.Box3(), ACCENT);
  (selBox.material as THREE.LineBasicMaterial).depthTest = false;
  selBox.renderOrder = 5;
  selBox.visible = false;
  selBox.raycast = () => {};
  scene.add(selBox);

  const compVisible = (c: ElecComponent) => mode === 'all' || c.step <= step;
  const wireVisible = (x: Wire) => (mode === 'all' ? true : mode === 'step' ? x.step === step : x.step <= step);
  const touches = (x: Wire, cid: string) => [x.from, x.to].some((e) => !e.startsWith('bb:') && splitRef(e)[0] === cid);

  function apply(): void {
    for (const { c, obj } of nodes.values()) obj.visible = compVisible(c);
    for (const t of pinText.children) t.visible = !!nodes.get(t.userData.owner as string)?.obj.visible;
    for (const n of wires.values()) {
      const vis = wireVisible(n.w);
      n.group.visible = vis;
      const isSel = sel?.kind === 'wire' && sel.id === n.w.id;
      const ofSel = sel?.kind === 'component' && touches(n.w, sel.id);
      // con algo elegido, solo sus cables; sin nada elegido, los del paso (los de pasos anteriores, atenuados)
      const strong = sel ? isSel || ofSel : mode !== 'upto' || n.w.step === step;
      n.mat.opacity = strong ? 1 : sel ? 0.14 : 0.22;
      n.mat.depthWrite = strong;
      n.mat.emissive.setHex(isSel || (hover?.kind === 'wire' && hover.id === n.w.id) ? WIRE_COLOR[n.w.color] : 0x000000);
      n.mat.emissiveIntensity = isSel ? 0.55 : 0.35;
    }
    if (sel?.kind === 'component' && nodes.get(sel.id)?.obj.visible) {
      selBox.box.setFromObject(nodes.get(sel.id)!.obj).expandByScalar(1.2);
      selBox.visible = true;
    } else selBox.visible = false;
    buildLabels();
    dirty = true;
  }

  // --- rótulos sobre la vista (nombres de las piezas y puntas del cable elegido) ---------------------------------------
  interface Label {
    el: HTMLElement;
    at: THREE.Vector3;
  }
  let labels: Label[] = [];
  function buildLabels(): void {
    overlay.replaceChildren();
    labels = [];
    const add = (text: string, at: THREE.Vector3, cls: string, pick?: Sel) => {
      const el = document.createElement(pick ? 'button' : 'div');
      el.className = `ev-label ${cls}`;
      el.textContent = text;
      if (pick) {
        (el as HTMLButtonElement).type = 'button';
        el.addEventListener('click', () => api.onSelect(pick));
      }
      overlay.append(el);
      labels.push({ el, at });
    };
    for (const { c, obj } of nodes.values()) {
      if (!obj.visible || c.id === 'breadboard') continue;
      const isSel = sel?.kind === 'component' && sel.id === c.id;
      // lo montado en la protoboard solo se rotula en su paso (o elegido): si no, se enciman
      if (c.mount && !(isSel || (mode !== 'all' && c.step === step))) continue;
      const b = new THREE.Box3().setFromObject(obj);
      add(c.short, new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y + 3, (b.min.z + b.max.z) / 2), `${c.mount ? 'small' : ''} ${isSel ? 'on' : ''}`, { kind: 'component', id: c.id });
    }
    const w0 = sel?.kind === 'wire' ? wires.get(sel.id) : null;
    if (w0?.group.visible) {
      add(refText(w0.w.from), w0.ends[0].clone().add(new THREE.Vector3(0, 4, 0)), 'end');
      add(refText(w0.w.to), w0.ends[1].clone().add(new THREE.Vector3(0, 4, 0)), 'end');
    }
  }
  const v = new THREE.Vector3();
  function placeLabels(): void {
    const w = element.clientWidth;
    const h = element.clientHeight;
    for (const l of labels) {
      v.copy(l.at).project(camera);
      const off = v.z > 1 || v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05;
      l.el.style.display = off ? 'none' : '';
      if (!off) l.el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
    }
  }

  // --- cámara ----------------------------------------------------------------------------------------------------------
  function frame(box3: THREE.Box3, dir: THREE.Vector3, pad = 1.15): void {
    const c = box3.getCenter(new THREE.Vector3());
    const size = box3.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.z * 1.25, size.y, 40) * 0.5 * pad;
    const fov = (camera.fov * Math.PI) / 180;
    const fit = r / Math.tan(fov / 2) / Math.min(1, camera.aspect);
    camera.position.copy(c).add(dir.clone().normalize().multiplyScalar(fit));
    controls.target.copy(c);
    camera.near = Math.max(2, fit / 200);
    camera.far = fit * 12 + 4000;
    camera.updateProjectionMatrix();
    controls.update();
    dirty = true;
  }
  const ISO = new THREE.Vector3(0.05, 1.25, 0.82);
  const TOP = new THREE.Vector3(0, 1, 0.012);
  function stepBox(): THREE.Box3 {
    const b = new THREE.Box3();
    for (const n of wires.values()) if (n.w.step === step) b.expandByPoint(n.ends[0]).expandByPoint(n.ends[1]);
    for (const { c, obj } of nodes.values()) if (c.step === step && c.id !== 'breadboard') b.union(new THREE.Box3().setFromObject(obj));
    return b.isEmpty() ? new THREE.Box3().setFromObject(root) : b.expandByScalar(18);
  }
  function allBox(): THREE.Box3 {
    const b = new THREE.Box3();
    for (const { obj } of nodes.values()) if (obj.visible) b.union(new THREE.Box3().setFromObject(obj));
    return b.expandByScalar(10);
  }

  // --- puntero: tocar y pasar por encima --------------------------------------------------------------------------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pickAt(ev: PointerEvent): Sel {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets: THREE.Object3D[] = [];
    for (const n of wires.values()) if (n.group.visible) targets.push(n.group);
    for (const n of nodes.values()) if (n.obj.visible) targets.push(n.obj);
    const hits = ray.intersectObjects(targets, true);
    let best: Sel = null;
    let bestD = Infinity;
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.pick) o = o.parent;
      if (!o) continue;
      const p = o.userData.pick as NonNullable<Sel>;
      // la protoboard y las piezas grandes ceden ante lo que tienen encima o un cable que pasa cerca
      const bias = p.kind === 'wire' ? -6 : p.id === 'breadboard' ? 4 : 0;
      if (hit.distance + bias < bestD) {
        bestD = hit.distance + bias;
        best = p;
      }
      if (hit.distance > bestD + 12) break;
    }
    return best;
  }
  let down: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (ev) => (down = { x: ev.clientX, y: ev.clientY }));
  canvas.addEventListener('pointerup', (ev) => {
    if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5) return;
    api.onSelect(pickAt(ev));
  });
  let hoverQueued: PointerEvent | null = null;
  canvas.addEventListener('pointermove', (ev) => {
    if (ev.buttons) return;
    const first = !hoverQueued;
    hoverQueued = ev;
    if (!first) return;
    requestAnimationFrame(() => {
      const e = hoverQueued!;
      hoverQueued = null;
      const p = pickAt(e);
      const same = p?.kind === hover?.kind && p?.id === hover?.id;
      hover = p;
      canvas.style.cursor = p ? 'pointer' : '';
      if (p) {
        const r = element.getBoundingClientRect();
        tip.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`;
        if (p.kind === 'wire') {
          const x = wires.get(p.id)!.w;
          tip.textContent = `${refText(x.from)} → ${refText(x.to)} · ${CABLE[x.cable].label.toLowerCase()}, ${COLOR_LABEL[x.color]}`;
        } else tip.textContent = nodes.get(p.id)!.c.name;
        tip.style.display = 'block';
      } else tip.style.display = 'none';
      if (!same) apply();
    });
  });
  canvas.addEventListener('pointerleave', () => {
    tip.style.display = 'none';
    if (hover) {
      hover = null;
      apply();
    }
  });

  controls.addEventListener('change', () => (dirty = true));
  function loop(): void {
    if (dirty && element.clientWidth > 0) {
      dirty = false;
      renderer.render(scene, camera);
      placeLabels();
      drawn = true;
    }
    requestAnimationFrame(loop);
  }

  const api: Bench = {
    element,
    onSelect: () => {},
    setStep(n, m) {
      step = n;
      mode = m;
      apply();
    },
    select(s, focus = false) {
      sel = s;
      apply();
      if (!focus || !s) return;
      if (s.kind === 'component') {
        const n = nodes.get(s.id);
        if (n?.obj.visible) frame(new THREE.Box3().setFromObject(n.obj).expandByScalar(n.c.mount ? 26 : 34), camera.position.clone().sub(controls.target));
      } else {
        const n = wires.get(s.id);
        if (n?.group.visible) frame(new THREE.Box3().setFromPoints(n.ends).expandByScalar(24), camera.position.clone().sub(controls.target));
      }
    },
    setFlipped(f) {
      flipped = f;
      placeEsp();
      root.updateMatrixWorld(true);
      buildWires();
      buildPinText();
      apply();
    },
    view(kind) {
      // inclinada, el fondo del banco se ve más corto de lo que mide: por eso se puede acercar más que desde arriba
      if (kind === 'top') frame(allBox(), TOP, 1.05);
      else if (kind === 'step') frame(stepBox(), ISO, 0.98);
      else frame(allBox(), ISO, 0.93);
    },
    resize() {
      const w = element.clientWidth;
      const h = element.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      dirty = true;
    },
    ready: () => drawn,
  };
  new ResizeObserver(() => api.resize()).observe(element);
  apply();
  requestAnimationFrame(() => {
    api.resize();
    api.view('iso');
    loop();
  });
  return api;
}
