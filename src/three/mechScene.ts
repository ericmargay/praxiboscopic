// Escena mecánica en three.js, a escala real y en milímetros (el grupo raíz se escala a metros). Muestra la obra como un
// modelo de CAD: base con la electrónica de potencia dentro, rodillos impresos, película con los fotogramas reales,
// ventana, cabeza del LED, sensor, lente, caja de control con protoboard y ESP32 encima de los rodillos, cables y
// pantalla. Cada pieza se puede seleccionar (clic o árbol), ocultar, aislar y medir; las propiedades salen del catálogo
// (`parts.ts`) y de la lista de compras. Posiciones: `mech/assembly.ts`.
//
// El host llama a `update(state)` en cada rAF. Lo estático se reconstruye solo cuando cambia algo físico (recorrido,
// película, motor, estroboscopio, óptica); el atlas de fotogramas cuando cambia `frames.hash`; la cinta en cada llamada.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Derived, Project } from '../core/project';
import type { CanvasLike, FrameSet } from '../frames/generator';
import { buildAssembly, type Assembly } from '../mech/assembly';
import { pointAt, type PathGeometry } from '../mech/path';
import { motorOf } from '../mech/transport';
import { opticsReport } from '../optics/projector';
import { BREADBOARD, box, breadboardHole, buildAcrylicBox, buildKind, buildRoller, cyl, EXPANSION, KINDS, localBox, mat, type KindSpec, type PartCategory } from './parts';

const MM = 0.001;
const ACCENT = 0x1b6c86;
const HOVER = 0x63b8d3;
const SCENE_BG = 0xd5e0e4;

export interface MechSceneState {
  derived: Derived;
  project: Project;
  frames: FrameSet;
  phiMm: number;
  simTime: number;
  flashIntensity: number;
  screenCanvas: CanvasLike | null;
  highlightGate: boolean;
}

export type ViewId = 'home' | 'front' | 'back' | 'left' | 'right' | 'top' | 'gate' | 'drive' | 'control' | 'base' | 'screen' | 'drum';

export interface PartNode {
  id: string;
  name: string;
  category: PartCategory;
  /** tipo del catálogo (medidas reales, pines, fuente) */
  kind?: string;
  /** renglón de la lista de compras */
  bomId?: string;
  /** pieza que la contiene en el árbol */
  parent?: string;
  /** notas propias de esta instancia */
  notes?: string[];
  visible: boolean;
}

export interface PartDetails {
  node: PartNode;
  spec?: KindSpec;
  /** medidas del modelo en el marco de la pieza (mm): ancho, fondo, alto */
  modelMm: [number, number, number];
  /** centro en mm respecto al centro de la cubierta */
  positionMm: [number, number, number];
}

export interface MechScene {
  update(state: MechSceneState): void;
  resize(): void;
  setView(id: ViewId): void;
  dispose(): void;
  readonly renderer: THREE.WebGLRenderer;
  stats(): { drawCalls: number; triangles: number; fps: number };
  parts(): PartNode[];
  select(id: string | null, frame?: boolean): void;
  selected(): string | null;
  details(id: string): PartDetails | null;
  onSelect(cb: (id: string | null) => void): void;
  onPartsChanged(cb: () => void): void;
  setVisible(id: string, visible: boolean): void;
  isolate(id: string | null): void;
  showAll(): void;
  setProjection(kind: 'persp' | 'ortho'): void;
  fit(id?: string | null): void;
  setMeasure(on: boolean): void;
  onMeasure(cb: (mm: number | null, step: 0 | 1 | 2) => void): void;
  setLabels(on: boolean): void;
  setShell(transparent: boolean): void;
}

/** marco local sobre el recorrido: origen en el punto de la cinta a la altura y, +Z = normal exterior, +Y = arriba */
function pathFrame(geo: PathGeometry, s: number, y: number): THREE.Matrix4 {
  const p = pointAt(geo, s);
  const z = new THREE.Vector3(p.normal.x, 0, p.normal.y).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const x = new THREE.Vector3().crossVectors(up, z).normalize();
  return new THREE.Matrix4().makeBasis(x, up, z).setPosition(p.position.x, y, p.position.y);
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
}

/** tubo de cable por puntos (mm) */
function wireMesh(points: THREE.Vector3[], color: number, radius: number, ends = false): THREE.Group {
  const g = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(16, points.length * 12), radius, 8, false), m);
  tube.castShadow = true;
  g.add(tube);
  if (ends) {
    // carcasas dupont en los extremos
    for (const [p, q] of [[points[0], points[1]], [points[points.length - 1], points[points.length - 2]]]) {
      const h = box(2.5, 14, 2.5, mat('header'));
      h.position.copy(p).add(q.clone().sub(p).normalize().multiplyScalar(7));
      h.lookAt(q);
      h.rotateX(Math.PI / 2);
      g.add(h);
    }
  }
  return g;
}

export function createMechScene(canvas: HTMLCanvasElement, overlay?: HTMLElement): MechScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE_BG);
  const persp = new THREE.PerspectiveCamera(35, 1, 0.005, 50);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -50, 50);
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = persp;
  persp.position.set(0.55, 0.45, 0.65);
  const controls = new OrbitControls(persp, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.maxDistance = 8;
  controls.minDistance = 0.03;
  controls.screenSpacePanning = true;

  // luz pareja de estudio: entorno neutro para que los metales reflejen algo, cielo claro, clave con sombra suave y
  // contraluz; sin focos ni niebla
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.7;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xf2f6f9, 0xb9b3aa, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.002;
  const sc = key.shadow.camera;
  sc.left = -0.45;
  sc.right = 0.45;
  sc.top = 0.45;
  sc.bottom = -0.45;
  sc.near = 0.1;
  sc.far = 4;
  scene.add(key, key.target);
  const back = new THREE.DirectionalLight(0xdfe9f5, 0.6);
  back.position.set(-1, 0.8, -1.2);
  scene.add(back);
  const lamp = new THREE.PointLight(0xfff4e0, 0, 0.6, 2);
  scene.add(lamp);

  // todo en mm dentro de `root`
  const root = new THREE.Group();
  root.scale.setScalar(MM);
  scene.add(root);
  const staticGroup = new THREE.Group();
  const filmGroup = new THREE.Group();
  const gateGroup = new THREE.Group();
  const helpers = new THREE.Group(); // selección, medición
  root.add(staticGroup, filmGroup, gateGroup, helpers);

  // --- estado -------------------------------------------------------------------------------------------------------
  let builtKey = '';
  let builtLayout: Derived['layout'] | null = null;
  let atlasHash = '';
  let atlasTex: THREE.CanvasTexture | null = null;
  let atlasCells = { cols: 1, rows: 1, count: 0 };
  let screenTex: THREE.CanvasTexture | null = null;
  let screenMat: THREE.MeshBasicMaterial | null = null;
  let screenSource: CanvasLike | null = null;
  let coneMat: THREE.MeshBasicMaterial | null = null;
  let emitterMat: THREE.MeshStandardMaterial | null = null;
  let gateOutline: THREE.LineSegments | null = null;
  let drum: THREE.Group | null = null;
  let drumPhaseRad = 0;
  let asm: Assembly | null = null;
  let gateMatrix = new THREE.Matrix4();
  let lampLocal = new THREE.Vector3();
  let lastPhi = NaN;
  const frameTimes: number[] = [];
  let spinners: { obj: THREE.Object3D; ratio: number }[] = [];
  let drumSpinners: THREE.Object3D[] = [];
  let shellMats: THREE.MeshStandardMaterial[] = [];
  let shellTransparent = true;
  let lastProject: Project | null = null;
  let filmMid = 26;
  let firstBuild = true;

  // --- registro de piezas -------------------------------------------------------------------------------------------
  const registry = new Map<string, { obj: THREE.Object3D; node: PartNode }>();
  const hidden = new Set<string>();
  let isolated: string | null = null;
  let selectedId: string | null = null;
  let hoverId: string | null = null;
  const selectListeners: ((id: string | null) => void)[] = [];
  const partsListeners: (() => void)[] = [];
  function tag<T extends THREE.Object3D>(obj: T, node: Omit<PartNode, 'visible'>): T {
    obj.userData.partId = node.id;
    registry.set(node.id, { obj, node: { ...node, visible: true } });
    return obj;
  }
  function partOf(o: THREE.Object3D | null): string | null {
    for (let x: THREE.Object3D | null = o; x; x = x.parent) if (x.userData.partId) return x.userData.partId as string;
    return null;
  }
  function parentOf(id: string): string | undefined {
    const e = registry.get(id);
    return e ? partOf(e.obj.parent) ?? undefined : undefined;
  }

  // --- cinta ----------------------------------------------------------------------------------------------------------
  const baseMat = new THREE.MeshPhysicalMaterial({ color: 0xe6eef2, transparent: true, opacity: 0.35, roughness: 0.15, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
  const frameMat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.02, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  const syncMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide });
  let baseMesh: THREE.Mesh | null = null;
  let frameMesh: THREE.Mesh | null = null;
  let syncMesh: THREE.Mesh | null = null;
  let baseSigma = new Float32Array(0);
  let baseY = new Float32Array(0);
  let frameSigma = new Float32Array(0);
  let frameY = new Float32Array(0);
  let syncSigma = new Float32Array(0);
  let syncY = new Float32Array(0);
  const FRAME_OFFSET = 0.08;

  // --- construcción estática ----------------------------------------------------------------------------------------
  function physicalKey(p: Project, d: Derived): string {
    return JSON.stringify([d.pathSpec, p.film.stripWidthMm, p.film.pitchMm, p.film.syncMarks, p.transport.motorId, p.transport.gearRatio, p.strobeKind, p.strobeKind === 'drum' ? [p.drum.slots, p.drum.drumRadiusMm, p.drum.slotWidthMm, p.drum.phaseDeg] : 0, p.optics.filmToLensMm, p.optics.throwMm, p.optics.gateWidthMm, p.optics.gateHeightMm, p.optics.focalMm]);
  }

  function anchorPos(obj: THREE.Object3D, name: string): THREE.Vector3 {
    const a = (obj.userData.anchors?.[name] as THREE.Vector3 | undefined) ?? new THREE.Vector3();
    const v = a.clone();
    obj.localToWorld(v);
    return root.worldToLocal(v);
  }

  function buildStatic(d: Derived, p: Project): void {
    disposeObject(staticGroup);
    staticGroup.clear();
    disposeObject(gateGroup);
    gateGroup.clear();
    clearHelpers();
    registry.clear();
    spinners = [];
    drumSpinners = [];
    shellMats = [];
    drum = null;
    emitterMat = null;
    gateOutline = null;
    coneMat = null;
    if (screenTex) {
      screenTex.dispose();
      screenTex = null;
      screenSource = null;
    }
    screenMat = null;

    const a = buildAssembly(p, d);
    asm = a;
    filmMid = a.filmMid;
    const R = a.R;
    const bodyH = a.rollerBodyH;
    const rollers = d.pathSpec.rollers;
    const B = a.base;
    const cx = (B.x0 + B.x1) / 2;
    const cz = (B.z0 + B.z1) / 2;
    const W = B.x1 - B.x0;
    const D = B.z1 - B.z0;

    // --- base: cubierta, paredes, piso y patas ----------------------------------------------------------------------
    const baseG = tag(new THREE.Group(), { id: 'base', name: 'Caja base (obra)', category: 'estructura', bomId: 'base-box', notes: ['Cubierta de MDF 9 mm con los barrenos de los rodillos y el paso de cables', 'Paredes y piso de MDF 6 mm (se ven en transparencia para mostrar lo que hay dentro)', `Altura total ${(B.deckT + B.innerH + B.floorT).toFixed(0)} mm más patas de 4 mm`] });
    const deck = box(W, B.deckT, D, mat('mdf'), cx, -B.deckT / 2, cz);
    baseG.add(deck);
    const shell = (w: number, h: number, dd: number, x: number, y: number, z: number) => {
      const m = new THREE.MeshStandardMaterial({ color: 0xcfc9c0, roughness: 0.85, transparent: true, opacity: shellTransparent ? 0.18 : 1, depthWrite: !shellTransparent });
      shellMats.push(m);
      const mesh = box(w, h, dd, m, x, y, z);
      mesh.userData.shell = true;
      baseG.add(mesh);
    };
    const wallY = -B.deckT - B.innerH / 2;
    shell(W, B.innerH, B.wallT, cx, wallY, B.z0 + B.wallT / 2);
    shell(W, B.innerH, B.wallT, cx, wallY, B.z1 - B.wallT / 2);
    shell(B.wallT, B.innerH, D - 2 * B.wallT, B.x0 + B.wallT / 2, wallY, cz);
    shell(B.wallT, B.innerH, D - 2 * B.wallT, B.x1 - B.wallT / 2, wallY, cz);
    baseG.add(box(W, B.floorT, D, mat('mdf'), cx, B.bottom + B.floorT / 2, cz));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) baseG.add(cyl(8, 4, mat('rubber'), cx + sx * (W / 2 - 15), B.bottom - 2, cz + sz * (D / 2 - 15), 20));
    // paso de cables
    baseG.add(cyl(9, 0.4, mat('hole'), a.bundle.x, 0.2, a.bundle.y, 24));
    staticGroup.add(baseG);

    // suelo: cuadrícula de 10 mm sobre la mesa de trabajo
    const floorY = B.bottom - 4;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.ShadowMaterial({ opacity: 0.18 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, floorY, cz);
    ground.receiveShadow = true;
    ground.raycast = () => {};
    const grid = new THREE.GridHelper(900, 90, 0x9fb2ba, 0xc2d0d5);
    grid.position.set(cx, floorY + 0.1, cz);
    grid.raycast = () => {};
    const gridMajor = new THREE.GridHelper(900, 9, 0x7f949c, 0x7f949c);
    gridMajor.position.set(cx, floorY + 0.15, cz);
    gridMajor.raycast = () => {};
    staticGroup.add(ground, grid, gridMajor);

    // --- rodillos -------------------------------------------------------------------------------------------------
    const polyC = new THREE.Vector2(rollers.reduce((s, r) => s + r.x, 0) / rollers.length, rollers.reduce((s, r) => s + r.y, 0) / rollers.length);
    const motor = motorOf(p.transport);
    const ratio = p.transport.gearRatio;
    rollers.forEach((r, i) => {
      const isDrive = i === d.pathSpec.driveRoller;
      const isTensioner = i === d.pathSpec.tensionerRoller;
      const role = isDrive ? 'motriz' : isTensioner ? 'tensor' : 'libre';
      const g = tag(new THREE.Group(), {
        id: `roller-${i}`,
        name: `Rodillo ${i} · ${role}`,
        category: 'transporte',
        kind: 'roller',
        bomId: 'rollers',
        notes: [
          `Ø${(2 * R).toFixed(2)} × ${bodyH} mm, pestañas de Ø${(2 * R + 4).toFixed(1)} mm, impreso en PLA o PETG`,
          `Una vuelta = ${((2 * Math.PI * R) / p.film.pitchMm).toFixed(2)} fotogramas`,
          isDrive ? 'Banda de goma de agarre; su eje baja por la cubierta hasta el motor' : isTensioner ? 'Va sobre un brazo con resorte que mantiene ~1 N de tensión' : 'Gira libre sobre dos 608ZZ en un eje fijo de 8 mm',
        ],
      });
      g.position.set(r.x, isTensioner ? 5 : 0, r.y);
      const spin = new THREE.Group();
      const roller = buildRoller(R, bodyH, isDrive);
      roller.position.y = 1;
      spin.add(roller);
      g.add(spin);
      spinners.push({ obj: spin, ratio: 1 });
      const shaftTop = 1 + bodyH + 12;
      const bearing = (y: number, id: string, parentObj: THREE.Object3D) => {
        const b = tag(buildKind('bearing'), { id, name: 'Rodamiento 608ZZ', category: 'transporte', kind: 'bearing', bomId: 'bearing-608' });
        b.position.y = y;
        parentObj.add(b);
      };
      if (isDrive) {
        // el eje gira con el rodillo y baja hasta el cople
        const shaft = cyl(4, shaftTop - a.motor.couplingY, mat('steel'), 0, (shaftTop + a.motor.couplingY) / 2, 0, 16);
        spin.add(shaft);
        bearing(-B.deckT / 2, `bearing-${i}-a`, g);
        bearing(-B.deckT - 9, `bearing-${i}-b`, g);
        const housing = tag(new THREE.Group(), { id: 'motor-housing', name: 'Alojamiento impreso del segundo 608', category: 'transporte', bomId: 'printed-supports', notes: ['Sostiene el eje del motriz en un segundo rodamiento y de él cuelga el soporte del motor'] });
        housing.add(box(46, -a.motor.housingY - B.deckT, 46, mat('plaDark'), 0, (a.motor.housingY - B.deckT) / 2, 0));
        g.add(housing);
      } else {
        g.add(cyl(4, shaftTop + B.deckT, mat('steel'), 0, (shaftTop - B.deckT) / 2, 0, 16));
        g.add(cyl(6.5, 4, mat('steel'), 0, shaftTop - 2, 0, 6)); // tuerca
        bearing(1 + bodyH * 0.25, `bearing-${i}-a`, spin);
        bearing(1 + bodyH * 0.75, `bearing-${i}-b`, spin);
      }
      if (isTensioner) {
        // brazo oscilante con pivote hacia dentro del loop y resorte de extensión hacia la esquina
        const inward = new THREE.Vector2(polyC.x - r.x, polyC.y - r.y).normalize();
        const side = new THREE.Vector2(-inward.y, inward.x);
        const pivot = inward.clone().multiplyScalar(30).add(side.clone().multiplyScalar(-34));
        const arm = tag(new THREE.Group(), { id: 'tensioner', name: 'Brazo tensor con resorte', category: 'transporte', bomId: 'tensioner', notes: ['Forma esquemática: el brazo pivota y el resorte empuja el rodillo hacia fuera'] });
        const len = pivot.length();
        const bar = box(len + 24, 4, 16, mat('plaDark'), pivot.x / 2, -3, pivot.y / 2);
        bar.rotation.y = -Math.atan2(pivot.y, pivot.x);
        arm.add(bar, cyl(5, 10, mat('steel'), pivot.x, -2, pivot.y, 16));
        const anchorPt = inward.clone().multiplyScalar(-10).add(side.clone().multiplyScalar(-58));
        const pts: THREE.Vector3[] = [];
        const from = new THREE.Vector3(pivot.x * 0.4, 1, pivot.y * 0.4);
        const to = new THREE.Vector3(anchorPt.x, 1, anchorPt.y);
        const dir = to.clone().sub(from);
        const n = 60;
        const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          const ang = t * Math.PI * 2 * 12;
          pts.push(from.clone().add(dir.clone().multiplyScalar(t)).add(perp.clone().multiplyScalar(3 * Math.cos(ang))).add(new THREE.Vector3(0, 3 * Math.sin(ang), 0)));
        }
        arm.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, 0.5, 6), mat('steel')));
        arm.add(cyl(3, 12, mat('steel'), anchorPt.x, -4, anchorPt.y, 12));
        g.add(arm);
      }
      staticGroup.add(g);
    });

    // --- motor, soporte y cople bajo el motriz -------------------------------------------------------------------
    {
      const mg = new THREE.Group();
      mg.position.set(a.motor.x, 0, a.motor.z);
      const isNema17 = motor.body.shape === 'box' && motor.body.wMm < 43;
      const motorObj = isNema17 ? buildKind('nema17') : (() => {
        const g = new THREE.Group();
        const geo = motor.body.shape === 'cylinder' ? new THREE.CylinderGeometry(motor.body.wMm / 2, motor.body.wMm / 2, motor.body.lengthMm, 32) : new THREE.BoxGeometry(motor.body.wMm, motor.body.lengthMm, motor.body.hMm);
        const body = new THREE.Mesh(geo, mat('black'));
        body.position.y = motor.body.lengthMm / 2;
        const sh = new THREE.Group();
        sh.add(cyl(motor.shaft.diameterMm / 2, motor.shaft.lengthMm, mat('steel'), 0, motor.body.lengthMm + motor.shaft.lengthMm / 2, 0, 12));
        g.add(body, sh);
        g.userData.spin = sh;
        return g;
      })();
      const bodyLen = isNema17 ? 48 : motor.body.lengthMm;
      motorObj.position.y = a.motor.faceY - bodyLen;
      tag(motorObj, {
        id: 'motor',
        name: `Motor ${motor.label.split(' (')[0]}`,
        category: 'transporte',
        kind: isNema17 ? 'nema17' : undefined,
        bomId: `motor-${motor.id}`,
        notes: [`${p.transport.motorRpm.toFixed(0)} rpm con acoplamiento directo${Math.abs(ratio - 1) > 1e-6 ? ` · reducción ${ratio.toFixed(2)}:1 en el modelo de transporte (la correa no se dibuja)` : ''}`, 'Cuelga bajo la cubierta, dentro de la base'],
      });
      if (motorObj.userData.spin) spinners.push({ obj: motorObj.userData.spin as THREE.Object3D, ratio });
      mg.add(motorObj);
      const bracket = tag(buildKind('bracket'), { id: 'bracket', name: 'Soporte en L del motor', category: 'transporte', kind: 'bracket', bomId: 'bracket-nema17' });
      bracket.position.y = a.motor.faceY;
      bracket.rotation.y = Math.PI;
      mg.add(bracket);
      const cpl = tag(buildKind('coupling'), { id: 'coupling', name: 'Cople flexible 5 × 8 mm', category: 'transporte', kind: 'coupling', bomId: 'coupling-5-8' });
      cpl.position.y = a.motor.couplingY;
      spinners.push({ obj: cpl, ratio: 1 });
      mg.add(cpl);
      staticGroup.add(mg);
    }

    // --- electrónica de potencia dentro de la base ---------------------------------------------------------------
    const floorTop = B.floorTop;
    const place = (o: THREE.Object3D, x: number, y: number, z: number, rotY = 0) => {
      o.position.set(x, y, z);
      o.rotation.y = rotY;
      staticGroup.add(o);
      return o;
    };
    const psu = place(tag(buildKind('psu'), { id: 'psu', name: 'Fuente 24 V 5 A', category: 'potencia', kind: 'psu', bomId: 'psu-24v-5a' }), a.psu.x, floorTop, a.psu.z);
    const dm = place(tag(buildKind('dm542'), { id: 'dm542', name: 'Driver DM542', category: 'potencia', kind: 'dm542', bomId: 'driver-dm542', notes: ['Interruptores DIP: 1/16 de paso y corriente de 1,8 A (verificar la tabla impresa en el driver)'] }), a.dm542.x, floorTop, a.dm542.z);
    const bucks = a.bucks.map((b) => place(tag(buildKind('lm2596'), { id: `buck-${b.volts}v`, name: `Regulador LM2596 a ${b.volts} V`, category: 'potencia', kind: 'lm2596', bomId: 'buck-lm2596', notes: [b.volts === 5 ? 'Alimenta ESP32, sensor y las entradas del driver' : 'Alimenta el IR2101'] }), b.x, floorTop, b.z));
    const fuseG = tag(new THREE.Group(), { id: 'fuse', name: 'Portafusible con fusible rápido de 500 mA', category: 'potencia', bomId: 'led-fuse', notes: ['En la línea de 24 V del LED, antes de los capacitores', 'Modelo aproximado'] });
    const holder = cyl(6, 30, mat('black'), 0, 7, 0, 20);
    holder.rotation.z = Math.PI / 2;
    fuseG.add(holder);
    fuseG.userData.anchors = { in: new THREE.Vector3(-16, 7, 0), out: new THREE.Vector3(16, 7, 0) };
    place(fuseG, a.fuse.x, floorTop, a.fuse.z);

    // --- caja de control sobre los rodillos ------------------------------------------------------------------------
    const bx = a.box;
    const standoffs = tag(new THREE.Group(), { id: 'standoffs', name: 'Separadores de la caja de control', category: 'estructura', kind: 'standoff', bomId: 'standoffs' });
    for (const s of a.standoffs) {
      const o = buildKind('standoff');
      o.position.set(s.x, 0, s.y);
      standoffs.add(o);
    }
    staticGroup.add(standoffs);
    const ctl = tag(new THREE.Group(), { id: 'control-box', name: 'Caja de control (acrílico)', category: 'control', bomId: 'control-box', notes: [`${bx.w} × ${bx.d} × ${bx.h} mm, a ${bx.y} mm sobre la cubierta: libra los ejes de los rodillos`, 'Dentro: protoboard, ESP32 en su placa de expansión y el driver del LED'] });
    ctl.position.set(bx.x, bx.y, bx.z);
    ctl.add(buildAcrylicBox(bx.w, bx.d, bx.h));
    ctl.add(cyl(9, 0.4, mat('hole'), a.bundle.x - bx.x, 3.2, a.bundle.y - bx.z, 24));
    staticGroup.add(ctl);
    const fl = 3; // piso de la caja
    const bbZ = -37;
    const bb = tag(buildKind('breadboard'), { id: 'breadboard', name: 'Protoboard 830 puntos', category: 'control', kind: 'breadboard', bomId: 'breadboard-kit' });
    bb.position.set(0, fl, bbZ);
    ctl.add(bb);
    const exp = tag(buildKind('expansion'), { id: 'esp32-expansion', name: 'Placa de expansión del ESP32', category: 'control', kind: 'expansion', bomId: 'esp32-expansion' });
    exp.position.set(-22, fl, 35);
    ctl.add(exp);
    const esp = tag(buildKind('esp32'), { id: 'esp32', name: 'ESP32 DevKitC V4 («el Arduino»)', category: 'control', kind: 'esp32', bomId: 'esp32' });
    esp.position.set(0, EXPANSION.socketTop + 2.5, 0);
    exp.add(esp);
    const res10 = tag(buildKind('res10w'), { id: 'led-resistor', name: 'Resistencia 3,3 Ω 10 W', category: 'control', kind: 'res10w', bomId: 'led-resistor' });
    res10.position.set(58, fl, 35);
    ctl.add(res10);
    // componentes en la protoboard
    const onBB = (o: THREE.Object3D, col: number, row: string, rotY = 0) => {
      const h = breadboardHole(col, row);
      o.position.set(h.x, BREADBOARD.h, h.z);
      o.rotation.y = rotY;
      bb.add(o);
      return o;
    };
    const ir = onBB(tag(buildKind('ir2101'), { id: 'ir2101', name: 'Driver de compuerta IR2101', category: 'control', kind: 'ir2101', bomId: 'led-gate-driver' }), 12.5, 'e');
    ir.position.z = 0;
    const fet = onBB(tag(buildKind('irlz44n'), { id: 'irlz44n', name: 'MOSFET IRLZ44N', category: 'control', kind: 'irlz44n', bomId: 'led-mosfet' }), 24, 'b');
    const caps = tag(new THREE.Group(), { id: 'caps', name: 'Capacitores 3 × 1000 µF 50 V', category: 'control', kind: 'cap1000', bomId: 'led-caps' });
    bb.add(caps);
    for (const c of [32, 39, 46]) {
      const o = buildKind('cap1000');
      const h = breadboardHole(c, 'i');
      o.position.set(h.x, BREADBOARD.h, h.z);
      caps.add(o);
    }
    const npns = [54, 59].map((c, k) => onBB(tag(buildKind('s8050'), { id: `s8050-${k ? 'dir' : 'pul'}`, name: `Transistor S8050 · ${k ? 'DIR' : 'PUL'}`, category: 'control', kind: 's8050', bomId: 'npn-s8050', notes: ['El tercero de la lista es repuesto'] }), c, 'c'));
    const smallR = tag(new THREE.Group(), { id: 'small-resistors', name: 'Resistencias 1/4 W', category: 'control', kind: 'resistor', bomId: 'small-resistors' });
    bb.add(smallR);
    for (const [c, row] of [[16, 'h'], [18, 'b'], [52, 'a'], [57, 'a']] as const) {
      const o = buildKind('resistor');
      const h = breadboardHole(c + 2, row);
      o.position.set(h.x, BREADBOARD.h, h.z);
      smallR.add(o);
    }

    // --- película, ventana, cabeza del LED, sensor, lente y pantalla (marco de la ventana) -------------------------
    gateMatrix = pathFrame(d.path, d.pathSpec.gateMm, a.filmMid);
    gateGroup.matrixAutoUpdate = false;
    gateGroup.matrix.copy(gateMatrix);
    gateGroup.matrixWorldNeedsUpdate = true;
    const o = p.optics;
    const rep = opticsReport(o);
    const gw = o.gateWidthMm;
    const gh = o.gateHeightMm;
    const strip = p.film.stripWidthMm;
    // placa de la ventana
    const plate = tag(new THREE.Group(), { id: 'gate-plate', name: 'Placa de la ventana', category: 'optica', bomId: 'gate-plate', notes: [`Hueco de ${gh} × ${gw} mm en aluminio negro de 1,5 mm`, 'Guías que mantienen la película plana en el plano focal'] });
    const plateW = Math.max(gh + 30, 60);
    const plateH = strip + 24;
    const sideW = (plateW - gh) / 2;
    const topH = (plateH - gw) / 2;
    const pm = mat('anod');
    plate.add(box(sideW, plateH, 1.5, pm, -(gh / 2 + sideW / 2), 0, 2), box(sideW, plateH, 1.5, pm, gh / 2 + sideW / 2, 0, 2), box(gh, topH, 1.5, pm, 0, gw / 2 + topH / 2, 2), box(gh, topH, 1.5, pm, 0, -(gw / 2 + topH / 2), 2));
    plate.add(box(8, a.filmMid - plateH / 2, 8, pm, plateW / 2 - 4, -a.filmMid + (a.filmMid - plateH / 2) / 2, 2));
    const ol = new THREE.BufferGeometry().setFromPoints([[-1, -1], [1, -1], [1, -1], [1, 1], [1, 1], [-1, 1], [-1, 1], [-1, -1]].map(([x, y]) => new THREE.Vector3((x * gh) / 2, (y * gw) / 2, 2.9)));
    gateOutline = new THREE.LineSegments(ol, new THREE.LineBasicMaterial({ color: ACCENT }));
    gateOutline.raycast = () => {};
    plate.add(gateOutline);
    gateGroup.add(plate);

    let lampZ = -33;
    if (p.strobeKind === 'led') {
      const head = tag(new THREE.Group(), { id: 'led-head', name: 'Cabeza del LED', category: 'optica', notes: ['LED, disipador y condensador en un poste impreso, detrás de la ventana', `Ocupa ${a.ledHead.width} × ${a.ledHead.depth} mm en el hueco de ${d.clearance.widthMm.toFixed(0)} mm entre rodillos`] });
      const cond = tag(buildKind('condenser'), { id: 'condenser', name: 'Condensador Ø40 mm', category: 'optica', kind: 'condenser', bomId: 'condenser' });
      cond.position.z = -27;
      const led = tag(buildKind('led10'), { id: 'led', name: 'LED de 10 W', category: 'optica', kind: 'led10', bomId: 'led-10w' });
      led.position.z = -a.ledHead.ledBack;
      emitterMat = led.userData.emitter as THREE.MeshStandardMaterial;
      const hs = tag(buildKind('heatsink'), { id: 'led-heatsink', name: 'Disipador 40 × 40 mm', category: 'optica', kind: 'heatsink', bomId: 'led-heatsink' });
      hs.position.z = -a.ledHead.heatsinkFront;
      const post = box(12, a.filmMid - 20, 10, mat('plaDark'), 0, -a.filmMid + (a.filmMid - 20) / 2, -46);
      head.add(cond, led, hs, post);
      gateGroup.add(head);
      lampZ = -33;
    } else {
      // tambor de ranuras: solo como comparación, no cabe en este loop
      const ds = p.drum;
      const Rd = ds.drumRadiusMm;
      const drumH = strip + 20;
      const g = tag(new THREE.Group(), { id: 'drum', name: `Tambor de ${ds.slots} ranuras`, category: 'optica', bomId: 'drum-shutter', notes: ['Solo como comparación: no cabe dentro de este loop (ver avisos)'] });
      drum = new THREE.Group();
      drum.position.set(0, 3 - a.filmMid + drumH / 2, -(Rd + 6));
      const slots = Math.max(1, ds.slots);
      const slotAng = Math.min(((Math.PI * 2) / slots) * 0.9, ds.slotWidthMm / Rd);
      const solidAng = (Math.PI * 2) / slots - slotAng;
      const segGeo = new THREE.CylinderGeometry(Rd, Rd, drumH, 12, 1, true, 0, solidAng);
      const dmat = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide });
      for (let i = 0; i < slots; i++) {
        const seg = new THREE.Mesh(segGeo, dmat);
        seg.rotation.y = -((i * Math.PI * 2) / slots + slotAng / 2);
        drum.add(seg);
      }
      for (const y of [-drumH / 2, drumH / 2]) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(Rd * 0.72, Rd, 48), new THREE.MeshStandardMaterial({ color: 0x8e979e, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = y;
        drum.add(ring);
      }
      drum.add(box(Rd * 0.5, 0.6, 2, mat('red'), Rd * 0.6, drumH / 2 + 0.6, 0));
      g.add(drum);
      gateGroup.add(g);
      drumPhaseRad = (ds.phaseDeg * Math.PI) / 180;
      lampZ = -(2 * Rd + 40);
      const lampBox = box(60, strip + 40, 60, mat('black'), 0, 0, lampZ - 30);
      g.add(lampBox);
    }
    lampLocal = new THREE.Vector3(0, 0, lampZ);

    // sensor de horquilla sobre el borde superior, un paso antes de la ventana
    {
      const m = pathFrame(d.path, a.sensor.sMm, a.sensor.mouthY);
      const sg = tag(buildKind('f249'), { id: 'sensor', name: 'Sensor de barrera F249', category: 'control', kind: 'f249', bomId: 'sensor-f249', notes: [`A ${p.film.pitchMm} mm (un paso) antes de la ventana: lee la marca del fotograma que está en ella`, `Haz a ${(a.filmTop - a.sensor.beamY).toFixed(1)} mm del borde; la marca mide ${p.film.syncMarks.acrossMm} mm`, 'El segundo F249 de la lista es repuesto'] });
      sg.matrixAutoUpdate = false;
      sg.matrix.copy(m);
      // brazo impreso desde un poste dentro del loop
      sg.add(box(6, a.sensor.mouthY + 12.6, 6, mat('plaDark'), 12, -(a.sensor.mouthY) + (a.sensor.mouthY + 12.6) / 2, -22));
      sg.add(box(6, 3, 22, mat('plaDark'), 12, 14.1, -12));
      staticGroup.add(sg);
    }

    // lente en su cuna, colgada del borde frontal
    const lensMount = o.filmToLensMm - 5;
    const lens = tag(buildKind('lens'), { id: 'lens', name: `Objetivo ${o.focalMm} mm f/${o.fNumber}`, category: 'optica', kind: 'lens', bomId: `lens-${o.focalMm}mm`, notes: [`Montura a ${lensMount.toFixed(1)} mm de la película; enfoca a ${(o.throwMm / 1000).toFixed(2)} m`, 'Cuna impresa atornillada a la pared frontal de la base'] });
    lens.position.z = lensMount;
    // cuna bajo el barril, brazo hacia la base y placa atornillada a la cara de la pared frontal
    const cradleY = -32 - 4;
    const edge = gateEdgeDistance(d, a);
    lens.add(box(70, 4, 30, mat('plaDark'), 0, cradleY, 20));
    const armLen = lensMount + 20 - edge;
    lens.add(box(20, 4, armLen, mat('plaDark'), 0, cradleY, edge - lensMount + armLen / 2));
    lens.add(box(30, 34, 4, mat('plaDark'), 0, cradleY - 15, edge + 2 - lensMount));
    gateGroup.add(lens);

    // pantalla
    const screenZ = o.filmToLensMm + o.throwMm;
    const imgW = Math.min(Math.max(rep.imageWidthMm, 20), 6000);
    const imgH = Math.min(Math.max(rep.imageHeightMm, 12), 4000);
    const scr = tag(new THREE.Group(), { id: 'screen', name: 'Pantalla', category: 'optica', bomId: 'screen', notes: [`Imagen de ${imgW.toFixed(0)} × ${imgH.toFixed(0)} mm a ${(o.throwMm / 1000).toFixed(2)} m`] });
    screenMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, toneMapped: false });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(imgW, imgH), screenMat);
    screen.position.z = screenZ;
    screen.rotation.y = Math.PI;
    const border = new THREE.Mesh(new THREE.PlaneGeometry(imgW + 60, imgH + 60), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, side: THREE.DoubleSide }));
    border.position.z = screenZ + 1;
    border.rotation.y = Math.PI;
    scr.add(border, screen);
    gateGroup.add(scr);
    coneMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const coneLen = o.throwMm - (lensMount + 40 - o.filmToLensMm);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(imgW, imgH) / 2, coneLen, 32, 1, true), coneMat);
    cone.rotation.x = -Math.PI / 2;
    cone.position.z = lensMount + 40 + coneLen / 2;
    cone.raycast = () => {};
    gateGroup.add(cone);

    // --- cables -------------------------------------------------------------------------------------------------
    root.updateMatrixWorld(true);
    const wires = { control: tag(new THREE.Group(), { id: 'wires-control', name: 'Jumpers de señal', category: 'cableado', bomId: 'jumpers-hm', notes: ['GPIO25 → PUL, GPIO26 → DIR, GPIO27 → IR2101, GPIO34 ← sensor; 5 V y GND'] }), power: tag(new THREE.Group(), { id: 'wires-power', name: 'Cables de 24 V y del LED', category: 'cableado', bomId: 'wire-18awg', notes: ['18 AWG: 24 V, GND y el lazo del pulso (resistencia → LED → MOSFET)', 'Mantener el lazo corto: los capacitores entregan el pico'] }), motor: tag(new THREE.Group(), { id: 'wires-motor', name: 'Cables del motor', category: 'cableado', bomId: `motor-${motor.id}`, notes: ['Vienen con el motor: A+ A− B+ B− al DM542'] }) };
    const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const up = (p0: THREE.Vector3, h: number) => p0.clone().add(v3(0, h, 0));
    const hole = (col: number, row: string, lift = 0) => {
      const h = breadboardHole(col, row);
      return root.worldToLocal(bb.localToWorld(v3(h.x, BREADBOARD.h + lift, h.z)));
    };
    const boxHole = v3(a.bundle.x, bx.y + 4, a.bundle.y);
    const deckHole = v3(a.bundle.x, 0, a.bundle.y);
    const under = v3(a.bundle.x, -20, a.bundle.y);
    let k = 0;
    /** cable de la caja a la base por el paso de cables */
    const down = (from: THREE.Vector3, to: THREE.Vector3, color: number, r: number, grp: THREE.Group, ends = false) => {
      const off = v3(((k % 4) - 1.5) * 2.2, 0, (Math.floor(k / 4) - 1) * 2.2);
      k++;
      grp.add(wireMesh([from, up(from, 10), boxHole.clone().add(off).add(v3(0, 12, 0)), boxHole.clone().add(off), deckHole.clone().add(off), under.clone().add(off), up(to, 20).add(v3(0, 0, 0)), to], color, r, ends));
    };
    const local = (from: THREE.Vector3, to: THREE.Vector3, color: number, h = 14, r = 0.65, grp = wires.control) => grp.add(wireMesh([from, up(from, h), up(to, h), to], color, r, true));
    // potencia dentro de la base
    const psuP = anchorPos(psu, '+V');
    const psuN = anchorPos(psu, '-V');
    const lift = (p0: THREE.Vector3, h = 12) => up(p0, h);
    wires.power.add(wireMesh([psuP, lift(psuP), lift(anchorPos(fuseG, 'in'), 18), anchorPos(fuseG, 'in')], 0xc8372d, 1));
    wires.power.add(wireMesh([psuP, lift(psuP, 16), lift(anchorPos(dm, '+V'), 20), anchorPos(dm, '+V')], 0xc8372d, 1));
    wires.power.add(wireMesh([psuN, lift(psuN, 14), lift(anchorPos(dm, 'GND'), 18), anchorPos(dm, 'GND')], 0x222222, 1));
    for (const b of bucks) {
      wires.power.add(wireMesh([psuP, lift(psuP, 22), lift(anchorPos(b, 'IN+'), 14), anchorPos(b, 'IN+')], 0xc8372d, 0.8));
      wires.power.add(wireMesh([psuN, lift(psuN, 20), lift(anchorPos(b, 'IN-'), 12), anchorPos(b, 'IN-')], 0x222222, 0.8));
    }
    // motor → driver
    const mConn = anchorPos(registry.get('motor')!.obj, 'conn');
    ['A+', 'A-', 'B+', 'B-'].forEach((t, i) => wires.motor.add(wireMesh([mConn.clone().add(v3(i - 1.5, 0, 0)), mConn.clone().add(v3(i - 1.5, 0, 25)), lift(anchorPos(dm, t), 26), anchorPos(dm, t)], [0x222222, 0x2b8a4b, 0xc8372d, 0x2a6fb5][i], 0.6)));
    // de la base a la caja: 24 V (desde el fusible), GND, 5 V, 12 V
    const rail = (row: string, col: number) => hole(col, row);
    down(rail('t+', 3), anchorPos(fuseG, 'out'), 0xc8372d, 1, wires.power);
    down(rail('t-', 3), psuN, 0x222222, 1, wires.power);
    down(rail('b+', 4), anchorPos(bucks[0], 'OUT+'), 0xe07b26, 0.65, wires.control);
    down(rail('b+', 62), anchorPos(bucks[1], 'OUT+'), 0x7b4bb3, 0.65, wires.control);
    down(rail('b-', 4), anchorPos(bucks[0], 'OUT-'), 0x222222, 0.65, wires.control);
    // S8050 → PUL− y DIR− del driver; 5 V a PUL+ y DIR+
    void npns;
    void ir;
    void fet;
    down(hole(55, 'd'), anchorPos(dm, 'PUL-'), 0x2b8a4b, 0.65, wires.control, true);
    down(hole(60, 'd'), anchorPos(dm, 'DIR-'), 0x2a6fb5, 0.65, wires.control, true);
    down(hole(5, 'b+'), anchorPos(dm, 'PUL+'), 0xe07b26, 0.65, wires.control, true);
    down(hole(6, 'b+'), anchorPos(dm, 'DIR+'), 0xe07b26, 0.65, wires.control, true);
    // ESP32 (placa de expansión) → protoboard
    local(anchorPos(exp, 'GPIO25'), hole(52, 'b', 0), 0x2b8a4b);
    local(anchorPos(exp, 'GPIO26'), hole(57, 'b', 0), 0x2a6fb5);
    local(anchorPos(exp, 'GPIO27'), hole(12, 'a', 0), 0xeeeeee);
    local(anchorPos(exp, '5V'), hole(10, 'b+', 0), 0xe07b26);
    local(anchorPos(exp, 'GND'), hole(10, 'b-', 0), 0x222222);
    // lazo del LED: 24 V → resistencia → LED+ ; LED− → drenador del MOSFET
    const ledObj = registry.get('led')?.obj;
    local(hole(30, 't+', 0), anchorPos(res10, 'a'), 0xc8372d, 18, 1, wires.power);
    if (ledObj) {
      const ledP = anchorPos(ledObj, '+');
      const ledN = anchorPos(ledObj, '-');
      const exitP = root.worldToLocal(ctl.localToWorld(v3(40, 1.5, bx.d / 2 - 4)));
      const exitN = root.worldToLocal(ctl.localToWorld(v3(30, 1.5, bx.d / 2 - 4)));
      wires.power.add(wireMesh([anchorPos(res10, 'b'), up(anchorPos(res10, 'b'), 10), up(exitP, 8), exitP, exitP.clone().add(v3(0, -10, 6)), up(ledP, 22).add(v3(0, 0, -6)), ledP], 0xc8372d, 1));
      wires.power.add(wireMesh([hole(25, 'a', 0), up(hole(25, 'a', 0), 12), up(exitN, 8), exitN, exitN.clone().add(v3(0, -10, 6)), up(ledN, 22).add(v3(0, 0, -6)), ledN], 0x222222, 1));
    }
    // sensor: 5 V, GND y salida a GPIO34
    const sensorObj = registry.get('sensor')!.obj;
    sensorObj.updateMatrixWorld(true);
    const sExit = root.worldToLocal(ctl.localToWorld(v3(-60, 1.5, bx.d / 2 - 4)));
    (['VCC', 'GND', 'DO'] as const).forEach((pin, i) => {
      const from = i === 2 ? anchorPos(exp, 'GPIO34') : hole(8 + i, i ? 'b-' : 'b+', 0);
      const to = anchorPos(sensorObj, pin);
      wires.control.add(wireMesh([from, up(from, 12), up(sExit, 10).add(v3(i * 2.5, 0, 0)), sExit.clone().add(v3(i * 2.5, 0, 0)), sExit.clone().add(v3(i * 2.5, -16, 14)), up(to, 16), to], [0xe07b26, 0x222222, 0xeeeeee][i], 0.6, true));
    });
    staticGroup.add(wires.control, wires.power, wires.motor);

    // la película se registra aquí para el árbol (sus mallas se construyen aparte)
    tag(filmGroup, { id: 'film', name: 'Película (tira en loop)', category: 'pelicula', notes: [`${d.layout.loopLengthMm.toFixed(0)} × ${strip} mm, ${d.layout.frames.length} fotogramas a ${p.film.pitchMm} mm, sin perforar`, `Marca de sincronía de ${p.film.syncMarks.alongMm} × ${p.film.syncMarks.acrossMm} mm en el borde ${p.film.syncMarks.edge === 'top' ? 'superior' : 'inferior'}`] });

    // sombra: encuadre de la luz clave sobre la base
    const center = new THREE.Vector3(cx * MM, 0, cz * MM);
    key.target.position.copy(center);
    key.position.copy(center).add(new THREE.Vector3(0.35, 0.9, 0.45));

    for (const id of hidden) applyVisibility(id);
    if (isolated && !registry.has(isolated)) isolated = null;
    applyIsolation();
    if (selectedId && !registry.has(selectedId)) selectedId = null;
    refreshSelection();
    for (const cb of partsListeners) cb();
  }

  /** distancia (mm) del plano de la película al borde frontal de la base, a lo largo de la normal de la ventana */
  function gateEdgeDistance(d: Derived, a: Assembly): number {
    const g = pointAt(d.path, d.pathSpec.gateMm);
    const B = a.base;
    const n = g.normal;
    const tx = n.x > 1e-6 ? (B.x1 - g.position.x) / n.x : n.x < -1e-6 ? (B.x0 - g.position.x) / n.x : Infinity;
    const tz = n.y > 1e-6 ? (B.z1 - g.position.y) / n.y : n.y < -1e-6 ? (B.z0 - g.position.y) / n.y : Infinity;
    return Math.min(tx, tz);
  }

  // --- cinta (mm) ---------------------------------------------------------------------------------------------------
  function buildFilmGeometry(d: Derived): void {
    for (const m of [baseMesh, frameMesh, syncMesh]) if (m) {
      m.geometry.dispose();
      filmGroup.remove(m);
    }
    baseMesh = frameMesh = syncMesh = null;
    const layout = d.layout;
    const L = layout.loopLengthMm;
    if (L <= 0 || !asm) return;
    const yBottom = asm.filmBottom;
    const yTop = asm.filmTop;
    const nSeg = Math.max(16, Math.ceil(L / 4));
    const bs: number[] = [];
    const by: number[] = [];
    const bIdx: number[] = [];
    for (let i = 0; i <= nSeg; i++) {
      const sigma = (i / nSeg) * L;
      bs.push(sigma, sigma);
      by.push(yBottom, yTop);
    }
    for (let i = 0; i < nSeg; i++) {
      const q = i * 2;
      bIdx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
    }
    baseSigma = Float32Array.from(bs);
    baseY = Float32Array.from(by);
    const baseGeo = new THREE.BufferGeometry();
    baseGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bs.length * 3), 3));
    baseGeo.setIndex(bIdx);
    baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.renderOrder = 1;
    filmGroup.add(baseMesh);
    const sub = 6;
    const fs: number[] = [];
    const fy: number[] = [];
    const fuv: number[] = [];
    const fIdx: number[] = [];
    const { cols, rows } = atlasCells;
    for (const pf of layout.frames) {
      const cu = pf.frameIndex % cols;
      const cv = Math.floor(pf.frameIndex / cols);
      const u0 = cu / cols;
      const u1 = (cu + 1) / cols;
      const v0 = cv / rows;
      const v1 = (cv + 1) / rows;
      const yHi = yTop - pf.xMm;
      const yLo = yHi - pf.acrossMm;
      const base = fs.length;
      for (let q = 0; q <= sub; q++) {
        const t = q / sub;
        const sigma = pf.sMm + pf.alongMm * t;
        fs.push(sigma, sigma);
        fy.push(yHi, yLo);
        fuv.push(u0 + (u1 - u0) * t, v0, u0 + (u1 - u0) * t, v1);
      }
      for (let q = 0; q < sub; q++) {
        const i0 = base + q * 2;
        fIdx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
      }
    }
    frameSigma = Float32Array.from(fs);
    frameY = Float32Array.from(fy);
    const fGeo = new THREE.BufferGeometry();
    fGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(fs.length * 3), 3));
    fGeo.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(fuv), 2));
    fGeo.setIndex(fIdx);
    frameMesh = new THREE.Mesh(fGeo, frameMat);
    frameMesh.renderOrder = 2;
    filmGroup.add(frameMesh);
    const ss: number[] = [];
    const sy: number[] = [];
    const sIdx: number[] = [];
    for (const m of layout.marks) {
      if (m.kind !== 'sync') continue;
      const yHi = yTop - m.xMm;
      const yLo = yHi - m.acrossMm;
      const base = ss.length;
      ss.push(m.sMm, m.sMm, m.sMm + m.alongMm, m.sMm + m.alongMm);
      sy.push(yHi, yLo, yHi, yLo);
      sIdx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    syncSigma = Float32Array.from(ss);
    syncY = Float32Array.from(sy);
    if (ss.length) {
      const sGeo = new THREE.BufferGeometry();
      sGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ss.length * 3), 3));
      sGeo.setIndex(sIdx);
      syncMesh = new THREE.Mesh(sGeo, syncMat);
      syncMesh.renderOrder = 2;
      filmGroup.add(syncMesh);
    }
    lastPhi = NaN;
  }

  function placeRibbon(mesh: THREE.Mesh | null, sigmas: Float32Array, ys: Float32Array, geo: PathGeometry, phi: number, offset: number): void {
    if (!mesh) return;
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < sigmas.length; i++) {
      const pt = pointAt(geo, phi - sigmas[i]);
      arr[i * 3] = pt.position.x + pt.normal.x * offset;
      arr[i * 3 + 1] = ys[i];
      arr[i * 3 + 2] = pt.position.y + pt.normal.y * offset;
    }
    pos.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
    mesh.geometry.computeBoundingBox();
  }

  function buildAtlas(frames: FrameSet): void {
    const n = frames.frames.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.max(1, Math.ceil(n / cols));
    const maxTex = Math.min(4096, renderer.capabilities.maxTextureSize);
    const cellW = Math.max(1, Math.min(frames.widthPx, Math.floor(maxTex / cols)));
    const cellH = Math.max(1, Math.min(frames.heightPx, Math.floor(maxTex / rows)));
    const atlas = document.createElement('canvas');
    atlas.width = cellW * cols;
    atlas.height = cellH * rows;
    const ctx = atlas.getContext('2d')!;
    for (const f of frames.frames) ctx.drawImage(f.canvas as unknown as CanvasImageSource, (f.index % cols) * cellW, Math.floor(f.index / cols) * cellH, cellW, cellH);
    if (atlasTex) atlasTex.dispose();
    atlasTex = new THREE.CanvasTexture(atlas);
    atlasTex.flipY = false;
    atlasTex.colorSpace = THREE.SRGBColorSpace;
    atlasTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    frameMat.map = atlasTex;
    frameMat.needsUpdate = true;
    atlasCells = { cols, rows, count: n };
  }

  // --- selección, visibilidad y aislamiento ------------------------------------------------------------------------
  const tintCache = new Map<THREE.Material, THREE.Material>();
  const tinted: THREE.Mesh[] = [];
  function tintOf(m: THREE.Material): THREE.Material {
    let t = tintCache.get(m);
    if (!t) {
      t = m.clone();
      const s = t as THREE.MeshStandardMaterial;
      if (s.emissive) {
        s.emissive = new THREE.Color(ACCENT);
        s.emissiveIntensity = 0.18;
      }
      tintCache.set(m, t);
    }
    return t;
  }
  function clearHelpers(): void {
    for (const m of tinted) if (m.userData.origMat) {
      m.material = m.userData.origMat as THREE.Material;
      delete m.userData.origMat;
    }
    tinted.length = 0;
    for (const c of [...helpers.children]) {
      if (c.userData.measure) continue;
      helpers.remove(c);
      (c as THREE.LineSegments).geometry?.dispose();
    }
    for (const r of registry.values()) for (const c of [...r.obj.children]) if (c.userData.outline) {
      r.obj.remove(c);
      (c as THREE.LineSegments).geometry.dispose();
    }
  }
  function outline(id: string, color: number, opacity: number): void {
    const e = registry.get(id);
    if (!e) return;
    const b = localBox(e.obj);
    if (b.isEmpty()) return;
    const size = b.getSize(new THREE.Vector3());
    const pad = Math.max(0.6, Math.max(size.x, size.y, size.z) * 0.015);
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x + pad, size.y + pad, size.z + pad));
    const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }));
    line.position.copy(b.getCenter(new THREE.Vector3()));
    line.renderOrder = 999;
    line.userData.outline = true;
    line.raycast = () => {};
    e.obj.add(line);
  }
  function refreshSelection(): void {
    clearHelpers();
    if (hoverId && hoverId !== selectedId) outline(hoverId, HOVER, 0.7);
    if (!selectedId) return;
    outline(selectedId, ACCENT, 1);
    registry.get(selectedId)?.obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.origMat || Array.isArray(m.material)) return;
      const mm = m.material as THREE.MeshStandardMaterial;
      if (!mm.emissive || mm.transparent) return;
      m.userData.origMat = m.material;
      m.material = tintOf(m.material);
      tinted.push(m);
    });
  }
  function related(id: string, other: string): boolean {
    for (let x: string | undefined = other; x; x = parentOf(x)) if (x === id) return true; // `other` dentro de `id`
    for (let x: string | undefined = id; x; x = parentOf(x)) if (x === other) return true; // `id` dentro de `other`
    return false;
  }
  function applyVisibility(id: string): void {
    const e = registry.get(id);
    if (e) e.obj.visible = !hidden.has(id) && (!isolated || related(isolated, id));
  }
  function applyIsolation(): void {
    for (const id of registry.keys()) applyVisibility(id);
  }

  // --- cámara y vistas -----------------------------------------------------------------------------------------------
  function worldOf(id: string): THREE.Sphere | null {
    const e = registry.get(id);
    if (!e) return null;
    const b = new THREE.Box3().setFromObject(e.obj, true);
    if (b.isEmpty()) return null;
    return b.getBoundingSphere(new THREE.Sphere());
  }
  function baseSphere(): THREE.Sphere {
    if (!asm) return new THREE.Sphere(new THREE.Vector3(), 0.3);
    const B = asm.base;
    const c = new THREE.Vector3(((B.x0 + B.x1) / 2) * MM, ((B.bottom + asm.box.y + asm.box.h) / 2) * MM, ((B.z0 + B.z1) / 2) * MM);
    return new THREE.Sphere(c, Math.hypot(B.x1 - B.x0, B.z1 - B.z0, asm.box.y + asm.box.h - B.bottom) * 0.5 * MM);
  }
  function lookFrom(target: THREE.Vector3, dir: THREE.Vector3, radius: number): void {
    const fov = (persp.fov * Math.PI) / 180;
    const dist = (radius / Math.sin(fov / 2)) * 1.3;
    controls.target.copy(target);
    persp.position.copy(target).add(dir.clone().normalize().multiplyScalar(dist));
    persp.up.set(0, 1, 0);
    syncOrtho(dist);
    controls.update();
  }
  function syncOrtho(dist = persp.position.distanceTo(controls.target)): void {
    const h = Math.tan(((persp.fov * Math.PI) / 180) / 2) * dist;
    const aspect = persp.aspect || 1;
    ortho.left = -h * aspect;
    ortho.right = h * aspect;
    ortho.top = h;
    ortho.bottom = -h;
    ortho.zoom = 1;
    ortho.position.copy(persp.position);
    ortho.quaternion.copy(persp.quaternion);
    ortho.updateProjectionMatrix();
  }
  function setView(id: ViewId): void {
    const s = baseSphere();
    const gz = new THREE.Vector3(0, 0, 1).applyMatrix4(new THREE.Matrix4().extractRotation(gateMatrix));
    const gx = new THREE.Vector3(1, 0, 0).applyMatrix4(new THREE.Matrix4().extractRotation(gateMatrix));
    const gate = new THREE.Vector3().setFromMatrixPosition(gateMatrix).multiplyScalar(MM);
    switch (id) {
      case 'home':
        return lookFrom(s.center, new THREE.Vector3(0.75, 0.62, 1), s.radius);
      case 'front':
        return lookFrom(s.center, new THREE.Vector3(0, 0.0001, 1), s.radius);
      case 'back':
        return lookFrom(s.center, new THREE.Vector3(0, 0.0001, -1), s.radius);
      case 'left':
        return lookFrom(s.center, new THREE.Vector3(-1, 0.0001, 0), s.radius);
      case 'right':
        return lookFrom(s.center, new THREE.Vector3(1, 0.0001, 0), s.radius);
      case 'top':
        return lookFrom(s.center, new THREE.Vector3(0.0001, 1, 0.0002), s.radius);
      case 'gate':
        return lookFrom(gate, gz.clone().multiplyScalar(1).add(gx.clone().multiplyScalar(0.8)).add(new THREE.Vector3(0, 0.6, 0)), 0.07);
      case 'drive':
        return focusPart('motor', new THREE.Vector3(-1, -0.2, 0.9), 0.1);
      case 'control':
        return focusPart('control-box', new THREE.Vector3(0.5, 0.9, 0.8), undefined);
      case 'base': {
        const b = asm?.base;
        if (!b) return;
        const c = new THREE.Vector3(((b.x0 + b.x1) / 2) * MM, ((b.floorTop - b.deckT) / 2) * MM, ((b.z0 + b.z1) / 2) * MM);
        return lookFrom(c, new THREE.Vector3(0.7, -0.15, 1), Math.hypot(b.x1 - b.x0, b.z1 - b.z0) * 0.42 * MM);
      }
      case 'screen': {
        const z = ((lastProject?.optics.filmToLensMm ?? 50) + (lastProject?.optics.throwMm ?? 1000)) * MM;
        const sp = gate.clone().add(gz.clone().multiplyScalar(z));
        return lookFrom(sp, gz.clone().multiplyScalar(-1).add(new THREE.Vector3(0, 0.15, 0)), 0.4);
      }
      case 'drum':
        return focusPart('drum', new THREE.Vector3(0.8, 0.7, -0.6), undefined);
    }
  }
  function focusPart(id: string, dir: THREE.Vector3, r?: number): void {
    const sph = worldOf(id);
    if (!sph) return setView('home');
    lookFrom(sph.center, dir, r ?? Math.max(0.02, sph.radius));
  }
  function fit(id?: string | null): void {
    const target = id ?? selectedId;
    if (!target) return setView('home');
    const sph = worldOf(target);
    if (!sph) return;
    const dir = persp.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-9) dir.set(1, 0.6, 1);
    // lo que está dentro de la base se ve de lado, a través de las paredes: desde arriba lo tapa la cubierta
    if (sph.center.y < 0) {
      dir.y = 0;
      if (dir.lengthSq() < 1e-9) dir.set(1, 0, 1);
      dir.normalize();
      dir.y = -0.12;
    }
    lookFrom(sph.center, dir, Math.max(0.015, sph.radius));
  }
  function setProjection(kind: 'persp' | 'ortho'): void {
    if (kind === 'ortho' && camera !== ortho) {
      syncOrtho();
      camera = ortho;
    } else if (kind === 'persp' && camera !== persp) {
      // conserva el encuadre: la altura visible de la ortográfica se traduce en distancia
      const dist = ortho.top / Math.max(1e-6, ortho.zoom) / Math.tan(((persp.fov * Math.PI) / 180) / 2);
      const dir = ortho.position.clone().sub(controls.target).normalize();
      persp.position.copy(controls.target).add(dir.multiplyScalar(dist));
      camera = persp;
    }
    (controls as unknown as { object: THREE.Camera }).object = camera;
    controls.update();
  }

  // --- puntero: selección, resaltado y medición --------------------------------------------------------------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down: [number, number] | null = null;
  let measureOn = false;
  let measurePts: THREE.Vector3[] = [];
  const measureListeners: ((mm: number | null, step: 0 | 1 | 2) => void)[] = [];
  function pick(e: PointerEvent): { id: string | null; point: THREE.Vector3 | null } {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObject(root, true).filter((h) => {
      for (let x: THREE.Object3D | null = h.object; x; x = x.parent) if (!x.visible) return false;
      return true;
    });
    // lo transparente (paredes de la base, acrílico, película) no tapa lo que hay detrás
    const solid = hits.find((h) => {
      const m = (h.object as THREE.Mesh).material as THREE.Material | undefined;
      if (h.object.userData.shell && shellTransparent) return false;
      return !(m && m.transparent && m.opacity < 0.5);
    });
    const h = solid ?? hits[0];
    if (!h) return { id: null, point: null };
    return { id: partOf(h.object), point: h.point.clone() };
  }
  canvas.addEventListener('pointerdown', (e) => {
    down = [e.clientX, e.clientY];
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    down = null;
    const { id, point } = pick(e);
    if (measureOn) {
      if (!point) return;
      if (measurePts.length >= 2) clearMeasure();
      measurePts.push(root.worldToLocal(point.clone()));
      drawMeasure();
      return;
    }
    select(id);
  });
  let hoverPending = false;
  canvas.addEventListener('pointermove', (e) => {
    if (hoverPending || e.buttons) return;
    hoverPending = true;
    requestAnimationFrame(() => {
      hoverPending = false;
      const { id } = pick(e);
      canvas.style.cursor = measureOn ? 'crosshair' : id ? 'pointer' : '';
      if (id !== hoverId) {
        hoverId = id;
        refreshSelection();
      }
    });
  });
  canvas.addEventListener('pointerleave', () => {
    if (hoverId) {
      hoverId = null;
      refreshSelection();
    }
  });
  canvas.addEventListener('dblclick', () => fit());
  function clearMeasure(): void {
    measurePts = [];
    for (const c of [...helpers.children]) if (c.userData.measure) {
      helpers.remove(c);
      disposeObject(c);
    }
    measureLabel.style.display = 'none';
  }
  function drawMeasure(): void {
    for (const c of [...helpers.children]) if (c.userData.measure) helpers.remove(c);
    for (const p of measurePts) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), new THREE.MeshBasicMaterial({ color: ACCENT, depthTest: false }));
      dot.position.copy(p);
      dot.renderOrder = 1000;
      dot.userData.measure = true;
      dot.raycast = () => {};
      helpers.add(dot);
    }
    if (measurePts.length === 2) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(measurePts), new THREE.LineBasicMaterial({ color: ACCENT, depthTest: false }));
      line.renderOrder = 1000;
      line.userData.measure = true;
      line.raycast = () => {};
      helpers.add(line);
      const mm = measurePts[0].distanceTo(measurePts[1]);
      measureLabel.textContent = `${mm.toFixed(1)} mm`;
      measureLabel.style.display = '';
      for (const cb of measureListeners) cb(mm, 2);
    } else for (const cb of measureListeners) cb(null, 1);
  }

  // --- rótulos HTML sobre el visor ------------------------------------------------------------------------------------
  const labelsEl = document.createElement('div');
  labelsEl.className = 'sim-labels';
  const measureLabel = document.createElement('span');
  measureLabel.className = 'sim-label measure';
  measureLabel.style.display = 'none';
  overlay?.append(labelsEl);
  labelsEl.append(measureLabel);
  let labelsOn = false;
  const labelEls = new Map<string, HTMLSpanElement>();
  function syncLabels(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const v = new THREE.Vector3();
    if (measurePts.length === 2) {
      v.copy(measurePts[0]).add(measurePts[1]).multiplyScalar(0.5);
      root.localToWorld(v).project(camera);
      measureLabel.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -140%)`;
    }
    const wanted = new Set<string>();
    if (labelsOn) for (const [id, e] of registry) {
      if (!e.obj.visible || e.node.category === 'cableado' || id.startsWith('bearing-') || parentOf(id) && !['control-box', 'led-head'].includes(parentOf(id)!)) continue;
      wanted.add(id);
    }
    for (const [id, el] of labelEls) if (!wanted.has(id)) {
      el.remove();
      labelEls.delete(id);
    }
    for (const id of wanted) {
      let el = labelEls.get(id);
      if (!el) {
        el = document.createElement('span');
        el.className = 'sim-label';
        el.textContent = registry.get(id)!.node.name;
        el.onclick = () => select(id);
        labelsEl.append(el);
        labelEls.set(id, el);
      }
      el.classList.toggle('on', id === selectedId);
      const sph = worldOf(id);
      if (!sph) continue;
      v.copy(sph.center).project(camera);
      const vis = v.z < 1 && v.x > -1 && v.x < 1 && v.y > -1 && v.y < 1;
      el.style.display = vis ? '' : 'none';
      if (vis) el.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -50%)`;
    }
  }

  // --- API ------------------------------------------------------------------------------------------------------------
  function select(id: string | null, frame = false): void {
    if (id && !registry.has(id)) id = null;
    if (id !== selectedId) {
      selectedId = id;
      refreshSelection();
      for (const cb of selectListeners) cb(id);
    }
    if (frame && id) fit(id);
  }

  function update(state: MechSceneState): void {
    const { derived: d, project: p, frames } = state;
    lastProject = p;
    const keyNow = physicalKey(p, d);
    const needStatic = keyNow !== builtKey;
    const needAtlas = frames.hash !== atlasHash;
    if (needAtlas) {
      buildAtlas(frames);
      atlasHash = frames.hash;
    }
    if (needStatic) {
      buildStatic(d, p);
      builtKey = keyNow;
      if (firstBuild) {
        firstBuild = false;
        setView('home');
      }
    }
    if (needStatic || needAtlas || d.layout !== builtLayout) {
      buildFilmGeometry(d);
      builtLayout = d.layout;
    }
    if (state.phiMm !== lastPhi) {
      placeRibbon(baseMesh, baseSigma, baseY, d.path, state.phiMm, 0);
      placeRibbon(frameMesh, frameSigma, frameY, d.path, state.phiMm, FRAME_OFFSET);
      placeRibbon(syncMesh, syncSigma, syncY, d.path, state.phiMm, FRAME_OFFSET);
      lastPhi = state.phiMm;
    }
    if (drum && p.strobeKind === 'drum') {
      const w = (p.drum.rpm * (1 + p.drum.speedErrorPct / 100) * Math.PI * 2) / 60;
      drum.rotation.y = -(w * state.simTime) - drumPhaseRad;
      for (const s of drumSpinners) s.rotation.y = drum.rotation.y;
    }
    // el ángulo del rodillo es exactamente φ / R (antihorario en el plano de la mesa = giro negativo alrededor de +Y)
    const rollerAngle = -state.phiMm / Math.max(1e-6, d.pathSpec.rollerRadiusMm);
    for (const s of spinners) s.obj.rotation.y = rollerAngle * s.ratio;
    const fi = Math.max(0, Math.min(1, state.flashIntensity));
    if (emitterMat) emitterMat.emissiveIntensity = fi * 4;
    if (coneMat) coneMat.opacity = fi * 0.18;
    lamp.position.copy(lampLocal).applyMatrix4(gateMatrix).multiplyScalar(MM);
    lamp.intensity = fi * 0.8;
    if (gateOutline) gateOutline.visible = state.highlightGate;
    if (screenMat && state.screenCanvas) {
      if (screenSource !== state.screenCanvas || !screenTex) {
        if (screenTex) screenTex.dispose();
        screenTex = new THREE.CanvasTexture(state.screenCanvas as unknown as HTMLCanvasElement);
        screenTex.colorSpace = THREE.SRGBColorSpace;
        screenTex.wrapS = THREE.RepeatWrapping;
        screenTex.repeat.x = -1;
        screenMat.map = screenTex;
        screenMat.color.set(0xffffff);
        screenMat.needsUpdate = true;
        screenSource = state.screenCanvas;
      }
      screenTex.needsUpdate = true;
    }
    controls.update();
    renderer.info.reset();
    renderer.render(scene, camera);
    syncLabels();
    const now = performance.now();
    frameTimes.push(now);
    while (frameTimes.length && now - frameTimes[0] > 1000) frameTimes.shift();
  }

  function resize(): void {
    const w = canvas.clientWidth || canvas.width || 1;
    const h = canvas.clientHeight || canvas.height || 1;
    renderer.setSize(w, h, false);
    persp.aspect = w / h;
    persp.updateProjectionMatrix();
    const hh = (ortho.top - ortho.bottom) / 2;
    ortho.left = -hh * (w / h);
    ortho.right = hh * (w / h);
    ortho.updateProjectionMatrix();
  }

  function details(id: string): PartDetails | null {
    const e = registry.get(id);
    if (!e) return null;
    const b = localBox(e.obj);
    const size = b.isEmpty() ? new THREE.Vector3() : b.getSize(new THREE.Vector3());
    const c = new THREE.Box3().setFromObject(e.obj, true).getCenter(new THREE.Vector3());
    root.worldToLocal(c);
    const B = asm?.base;
    const ox = B ? (B.x0 + B.x1) / 2 : 0;
    const oz = B ? (B.z0 + B.z1) / 2 : 0;
    return {
      node: { ...e.node, parent: parentOf(id), visible: e.obj.visible },
      spec: e.node.kind ? KINDS[e.node.kind] : undefined,
      modelMm: [size.x, size.z, size.y],
      positionMm: [c.x - ox, c.z - oz, c.y],
    };
  }

  resize();
  return {
    update,
    resize,
    setView,
    dispose() {
      controls.dispose();
      disposeObject(scene);
      atlasTex?.dispose();
      screenTex?.dispose();
      envTex.dispose();
      renderer.dispose();
      labelsEl.remove();
    },
    renderer,
    stats: () => ({ drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, fps: frameTimes.length }),
    parts: () => [...registry.values()].map((e) => ({ ...e.node, parent: parentOf(e.node.id), visible: !hidden.has(e.node.id) })),
    select,
    selected: () => selectedId,
    details,
    onSelect: (cb) => void selectListeners.push(cb),
    onPartsChanged: (cb) => void partsListeners.push(cb),
    setVisible(id, v) {
      if (v) hidden.delete(id);
      else hidden.add(id);
      applyVisibility(id);
      for (const cb of partsListeners) cb();
    },
    isolate(id) {
      isolated = id && registry.has(id) ? id : null;
      applyIsolation();
      for (const cb of partsListeners) cb();
    },
    showAll() {
      hidden.clear();
      isolated = null;
      applyIsolation();
      for (const cb of partsListeners) cb();
    },
    setProjection,
    fit,
    setMeasure(on) {
      measureOn = on;
      if (!on) clearMeasure();
      for (const cb of measureListeners) cb(null, 0);
    },
    onMeasure: (cb) => void measureListeners.push(cb),
    setLabels(on) {
      labelsOn = on;
    },
    setShell(t) {
      shellTransparent = t;
      for (const m of shellMats) {
        m.opacity = t ? 0.18 : 1;
        m.depthWrite = !t;
        m.needsUpdate = true;
      }
    },
  };
}
