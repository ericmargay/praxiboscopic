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
import { buildAssembly, buildReelsAssembly, type Assembly, type ReelsAssembly } from '../mech/assembly';
import { pointAt, type PathGeometry, type PathPoint, type Vec2 } from '../mech/path';
import { handRangeMm, livePath, type HandInput, type ReelLive } from '../mech/reels';
import { motorOf } from '../mech/transport';
import { opticsReport } from '../optics/projector';
import { BREADBOARD, box, breadboardHole, buildAcrylicBox, buildHand, buildKind, buildMagnet, buildReel, buildRoller, buildSpool, buildSpring, cyl, EXPANSION, KINDS, localBox, mat, type KindSpec, type PartCategory } from './parts';
import { buildReelsStructure, SHEET_MATERIALS, type AssemblyStep, type ReelsStructure, type SheetMaterial } from '../mech/structure';
import { reelsPrintedParts } from '../fabricate/printed';

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
  /** dos tambores: el programa del ESP32 y las manos del visitante */
  reel?: { live: ReelLive; hands: [HandInput, HandInput] };
}

export type ViewId = 'home' | 'front' | 'back' | 'left' | 'right' | 'top' | 'gate' | 'drive' | 'control' | 'base' | 'screen' | 'drum' | 'hands';

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
  /** paso del ensamble en que entra (mesa de dos tambores) y hacia dónde sale en la vista explosionada */
  step?: number;
  explode?: [number, number, number];
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
  /**
   * Ensamble paso a paso (mesa de dos tambores): `step` muestra lo armado hasta ese paso y hace llegar las piezas del
   * paso desde afuera; `explode` (0–1) separa todo lo visible. `null` vuelve a la mesa armada.
   */
  setAssembly(step: number | null, explode?: number): void;
  /** pasos del ensamble de la obra armada (vacío si no es la mesa de dos tambores) */
  assemblySteps(): AssemblyStep[];
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
  let reelAsm: ReelsAssembly | null = null;
  let reelStructure: ReelsStructure | null = null;
  /** piezas de los dos tambores que se mueven en cada cuadro */
  let reelParts: { spins: THREE.Object3D[]; motorSpins: THREE.Object3D[][]; wound: { side: THREE.Mesh; caps: THREE.Mesh[]; r: number }[]; guides: THREE.Object3D[]; dancerArm: THREE.Object3D; dancerSpin: THREE.Object3D; hands: THREE.Object3D[]; cones: THREE.MeshBasicMaterial[] } | null = null;
  /** caja de la base (de la obra que esté armada) y lo más alto que hay que encuadrar (mm) */
  let baseBox: Assembly['base'] | null = null;
  let topY = 130;
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
    const reels = d.reels ? [d.reels.spec.coreDiameterMm, d.reels.spec.flangeDiameterMm, d.reels.spec.spacingMm, d.reels.spec.depthMm, d.reels.spec.guideDiameterMm, d.reels.spec.dancerDiameterMm, d.reels.spec.sensor, d.reels.spec.control.speedMap, d.reels.design.totalMm] : 0;
    return JSON.stringify([d.pathSpec, reels, p.film.stripWidthMm, p.film.pitchMm, p.film.syncMarks, p.transport.motorId, p.transport.gearRatio, p.strobeKind, p.strobeKind === 'drum' ? [p.drum.slots, p.drum.drumRadiusMm, p.drum.slotWidthMm, p.drum.phaseDeg] : 0, p.optics.filmToLensMm, p.optics.throwMm, p.optics.gateWidthMm, p.optics.gateHeightMm, p.optics.focalMm]);
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
    reelParts = null;
    reelStructure = null;
    homes.clear();
    if (!d.reels) assembly = null;
    if (d.reels) {
      asm = null;
      buildReels(d, p);
      return;
    }
    reelAsm = null;

    const a = buildAssembly(p, d);
    asm = a;
    baseBox = a.base;
    topY = a.box.y + a.box.h;
    filmMid = a.filmMid;
    const R = a.R;
    const bodyH = a.rollerBodyH;
    const rollers = d.pathSpec.rollers;
    const B = a.base;
    buildBaseBox(B, [a.bundle], 'Cubierta de MDF 9 mm con los barrenos de los rodillos y el paso de cables');
    buildGround(B);

    // --- rodillos -------------------------------------------------------------------------------------------------
    const polyC = new THREE.Vector2(rollers.reduce((s, r) => s + r.x, 0) / rollers.length, rollers.reduce((s, r) => s + r.y, 0) / rollers.length);
    const motor = motorOf(p.transport);
    const ratio = p.transport.gearRatio;
    // un rodillo abrazado en sentido horario (festón) gira al revés que uno abrazado en antihorario
    const sideOf = (i: number) => d.pathSpec.sides?.[i] ?? 1;
    const driveSide = sideOf(d.pathSpec.driveRoller);
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
      spinners.push({ obj: spin, ratio: sideOf(i) });
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
      if (motorObj.userData.spin) spinners.push({ obj: motorObj.userData.spin as THREE.Object3D, ratio: ratio * driveSide });
      mg.add(motorObj);
      const bracket = tag(buildKind('bracket'), { id: 'bracket', name: 'Soporte en L del motor', category: 'transporte', kind: 'bracket', bomId: 'bracket-nema17' });
      bracket.position.y = a.motor.faceY;
      bracket.rotation.y = Math.PI;
      mg.add(bracket);
      const cpl = tag(buildKind('coupling'), { id: 'coupling', name: 'Cople flexible 5 × 8 mm', category: 'transporte', kind: 'coupling', bomId: 'coupling-5-8' });
      cpl.position.y = a.motor.couplingY;
      spinners.push({ obj: cpl, ratio: driveSide });
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

    void npns;
    void ir;
    void fet;
    buildGateOptics(d, p, a);
    buildWiresLoop(a, motor, { bb, exp, dm, psu, fuseG, res10, bucks, ctl, bx });
    finishStatic(d, p, B);
  }

  /** caja base: cubierta, paredes en transparencia, piso, patas y los pasos de cables */
  function buildBaseBox(B: Assembly['base'], holes: Vec2[], deckNote: string): void {
    const cx = (B.x0 + B.x1) / 2;
    const cz = (B.z0 + B.z1) / 2;
    const W = B.x1 - B.x0;
    const D = B.z1 - B.z0;
    const baseG = tag(new THREE.Group(), { id: 'base', name: 'Caja base (obra)', category: 'estructura', bomId: 'base-box', notes: [deckNote, 'Paredes y piso de MDF 6 mm (se ven en transparencia para mostrar lo que hay dentro)', `${W.toFixed(0)} × ${D.toFixed(0)} mm; altura total ${(B.deckT + B.innerH + B.floorT).toFixed(0)} mm más patas de 4 mm`] });
    baseG.add(box(W, B.deckT, D, mat('mdf'), cx, -B.deckT / 2, cz));
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
    for (const h of holes) baseG.add(cyl(9, 0.4, mat('hole'), h.x, 0.2, h.y, 24));
    staticGroup.add(baseG);
  }

  /** suelo: cuadrícula de 10 mm sobre la mesa de trabajo */
  function buildGround(B: Assembly['base']): void {
    const cx = (B.x0 + B.x1) / 2;
    const cz = (B.z0 + B.z1) / 2;
    const floorY = B.bottom - 4;
    const gridSize = Math.max(900, Math.ceil((Math.max(B.x1 - B.x0, B.z1 - B.z0) + 400) / 100) * 100);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(gridSize, gridSize), new THREE.ShadowMaterial({ opacity: 0.18 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, floorY, cz);
    ground.receiveShadow = true;
    ground.raycast = () => {};
    const grid = new THREE.GridHelper(gridSize, gridSize / 10, 0x9fb2ba, 0xc2d0d5);
    grid.position.set(cx, floorY + 0.1, cz);
    grid.raycast = () => {};
    const gridMajor = new THREE.GridHelper(gridSize, gridSize / 100, 0x7f949c, 0x7f949c);
    gridMajor.position.set(cx, floorY + 0.15, cz);
    gridMajor.raycast = () => {};
    staticGroup.add(ground, grid, gridMajor);
  }

  /** la parte que comparten las dos obras: registro de la película, sombra y lo que el usuario ocultó o aisló */
  function finishStatic(d: Derived, p: Project, B: Assembly['base']): void {
    const strip = p.film.stripWidthMm;
    const film = d.reels
      ? [`Película abierta de ${(d.reels.design.totalMm / 1000).toFixed(2)} m × ${strip} mm: ${d.layout.frames.length} fotogramas a ${p.film.pitchMm} mm y colas transparentes de ${d.reels.design.tail1Mm} y ${d.reels.design.tail2Mm} mm, sin perforar`, 'Laminada: la cubierta tapa la tinta, que en el tambor apoya en la vuelta anterior']
      : [`${d.layout.loopLengthMm.toFixed(0)} × ${strip} mm, ${d.layout.frames.length} fotogramas a ${p.film.pitchMm} mm, sin perforar`];
    tag(filmGroup, { id: 'film', name: d.reels ? 'Película (entre los dos tambores)' : 'Película (tira en loop)', category: 'pelicula', notes: [...film, `Marca de sincronía de ${p.film.syncMarks.alongMm} × ${p.film.syncMarks.acrossMm} mm en el borde ${p.film.syncMarks.edge === 'top' ? 'superior' : 'inferior'}`], ...(d.reels ? { step: 11 } : {}) });
    const W = B.x1 - B.x0;
    const D = B.z1 - B.z0;
    const center = new THREE.Vector3(((B.x0 + B.x1) / 2) * MM, 0, ((B.z0 + B.z1) / 2) * MM);
    key.target.position.copy(center);
    key.position.copy(center).add(new THREE.Vector3(0.35, 0.9, 0.45));
    const half = Math.max(0.45, Math.max(W, D) * MM * 0.75);
    sc.left = -half;
    sc.right = half;
    sc.top = half;
    sc.bottom = -half;
    sc.updateProjectionMatrix();
    for (const id of hidden) applyVisibility(id);
    if (isolated && !registry.has(isolated)) isolated = null;
    applyIsolation();
    if (selectedId && !registry.has(selectedId)) selectedId = null;
    refreshSelection();
    for (const cb of partsListeners) cb();
  }

  /**
   * Ventana, cabeza del LED (o tambor de ranuras), sensor de marcas, lente y pantalla, todo en el marco de la ventana:
   * igual para el loop y para los dos tambores.
   */
  function buildGateOptics(d: Derived, p: Project, a: Pick<Assembly, 'filmMid' | 'filmTop' | 'ledHead' | 'sensor' | 'base'>, reels?: ReelsAssembly): void {
    gateMatrix = pathFrame(d.path, d.pathSpec.gateMm, a.filmMid);
    gateGroup.matrixAutoUpdate = false;
    gateGroup.matrix.copy(gateMatrix);
    gateGroup.matrixWorldNeedsUpdate = true;
    const o = p.optics;
    const rep = opticsReport(o);
    const gw = o.gateWidthMm;
    const gh = o.gateHeightMm;
    const strip = p.film.stripWidthMm;
    // placa de la ventana: del lado de la lámpara, como los rodillos; del lado de la lente nada toca la tinta (ADR-0009)
    const plate = reels ? Object.assign(new THREE.Group(), { userData: { assemblyFrom: 8 } }) : tag(new THREE.Group(), { id: 'gate-plate', name: 'Placa de la ventana', category: 'optica', bomId: 'gate-plate', notes: [`Hueco de ${gh} × ${gw} mm en aluminio negro de 1,5 mm, del lado de la lámpara`, 'Sus guías apoyan en los márgenes de la cara limpia y mantienen la película plana en el plano focal; del lado de la lente nada la toca'] });
    const plateW = Math.max(gh + 30, 60);
    const plateH = strip + 24;
    const sideW = (plateW - gh) / 2;
    const topH = (plateH - gw) / 2;
    const pm = mat('anod');
    const plateZ = reels ? reels.gate.plateZ[1] + 0.5 : -2;
    if (!reels) {
      plate.add(box(sideW, plateH, 1.5, pm, -(gh / 2 + sideW / 2), 0, plateZ), box(sideW, plateH, 1.5, pm, gh / 2 + sideW / 2, 0, plateZ), box(gh, topH, 1.5, pm, 0, gw / 2 + topH / 2, plateZ), box(gh, topH, 1.5, pm, 0, -(gw / 2 + topH / 2), plateZ));
      plate.add(box(8, a.filmMid - plateH / 2, 8, pm, plateW / 2 - 4, -a.filmMid + (a.filmMid - plateH / 2) / 2, plateZ - 3.25));
    }
    const ol = new THREE.BufferGeometry().setFromPoints([[-1, -1], [1, -1], [1, -1], [1, 1], [1, 1], [-1, 1], [-1, 1], [-1, -1]].map(([x, y]) => new THREE.Vector3((x * gh) / 2, (y * gw) / 2, plateZ + 0.9)));
    gateOutline = new THREE.LineSegments(ol, new THREE.LineBasicMaterial({ color: ACCENT }));
    gateOutline.raycast = () => {};
    plate.add(gateOutline);
    gateGroup.add(plate);

    let lampZ = -33;
    const st8 = reels ? { step: 8, explode: [0, 1, 0] as [number, number, number] } : {};
    if (p.strobeKind === 'led') {
      const head = tag(new THREE.Group(), { id: 'led-head', name: reels ? 'I11 Cabeza del LED' : 'Cabeza del LED', category: 'optica', bomId: reels ? 'print-petg' : undefined, notes: reels ? ['Impresa en PETG: el disipador entra entre sus paredes con el LED pegado al frente y el tubo del condensador descansa en dos cunas, donde se corre para ajustar la luz', 'Va a la cubierta con dos espigas I16 pegadas'] : ['LED, disipador y condensador en un poste impreso, detrás de la ventana', `Ocupa ${a.ledHead.width} × ${a.ledHead.depth} mm en el hueco de ${d.clearance.widthMm.toFixed(0)} mm entre rodillos`], ...st8 });
      const cond = tag(buildKind('condenser'), { id: 'condenser', name: 'Condensador Ø40 mm', category: 'optica', kind: 'condenser', bomId: 'condenser', notes: reels ? ['Dos plano-convexas en el tubo impreso I12'] : undefined });
      cond.position.z = reels ? -30 : -27;
      const led = tag(buildKind('led10'), { id: 'led', name: 'LED de 10 W', category: 'optica', kind: 'led10', bomId: 'led-10w' });
      led.position.z = -a.ledHead.ledBack;
      emitterMat = led.userData.emitter as THREE.MeshStandardMaterial;
      const hs = tag(buildKind('heatsink'), { id: 'led-heatsink', name: 'Disipador 40 × 40 mm', category: 'optica', kind: 'heatsink', bomId: 'led-heatsink' });
      hs.position.z = -a.ledHead.heatsinkFront;
      if (reels) {
        // cabeza impresa I11: base, repisa y paredes del disipador, tope y las dos cunas del tubo (marco de la ventana)
        const fm = a.filmMid;
        const pd = mat('plaDark');
        head.add(box(52, 4, 54, pd, 0, -fm + 2, -35), box(40.8, 2, 24, pd, 0, -fm + 5, -46));
        for (const sx of [-1, 1]) head.add(box(4, 26, 24, pd, sx * 22.4, -fm + 17, -46));
        head.add(box(48.8, 16, 2, pd, 0, -fm + 12, -59));
        for (const zc of [-11, -27]) {
          const sh = new THREE.Shape();
          sh.moveTo(-26, -fm);
          sh.lineTo(26, -fm);
          sh.lineTo(26, 0);
          sh.lineTo(22.2, 0);
          sh.absarc(0, 0, 22.2, 0, Math.PI, true);
          sh.lineTo(-26, 0);
          sh.closePath();
          const cg = new THREE.ExtrudeGeometry(sh, { depth: 4, bevelEnabled: false, curveSegments: 24 });
          const cm = new THREE.Mesh(cg, pd);
          cm.position.z = zc - 2;
          cm.castShadow = true;
          head.add(cm);
        }
        head.add(cond, led, hs);
      } else {
        const post = box(12, a.filmMid - 20, 10, mat('plaDark'), 0, -a.filmMid + (a.filmMid - 20) / 2, -46);
        head.add(cond, led, hs, post);
      }
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
      const sg = tag(buildKind('f249'), { id: 'sensor', name: 'Sensor de barrera F249', category: 'control', kind: 'f249', bomId: 'sensor-f249', notes: [`A ${p.film.pitchMm} mm (un paso) antes de la ventana: lee la marca del fotograma que está en ella`, `Haz a ${(a.filmTop - a.sensor.beamY).toFixed(1)} mm del borde; la marca mide ${p.film.syncMarks.acrossMm} mm`, 'El segundo F249 de la lista es repuesto', ...(reels ? ['Va amarrado con un cincho al brazo impreso I14, cuya espiga cuadrada entra en la cubierta'] : [])], ...st8 });
      if (reels) {
        // brazo I14: espiga cuadrada en la cubierta, poste y brazo sobre la película; el F249 va amarrado debajo
        const yTop = 19;
        sg.add(box(8, a.sensor.mouthY + yTop, 8, mat('plaDark'), 12, -a.sensor.mouthY + (a.sensor.mouthY + yTop) / 2, -22));
        sg.add(box(8, 6, 34, mat('plaDark'), 12, yTop - 3, -9));
      } else {
        // brazo impreso desde un poste dentro del loop
        sg.add(box(6, a.sensor.mouthY + 12.6, 6, mat('plaDark'), 12, -(a.sensor.mouthY) + (a.sensor.mouthY + 12.6) / 2, -22));
        sg.add(box(6, 3, 22, mat('plaDark'), 12, 14.1, -12));
      }
      sg.matrixAutoUpdate = !!reels;
      if (reels) {
        sg.position.setFromMatrixPosition(m);
        sg.quaternion.setFromRotationMatrix(m);
      } else sg.matrix.copy(m);
      staticGroup.add(sg);
    }

    // lente en su cuna, colgada del borde frontal
    const lensMount = o.filmToLensMm - 5;
    const lens = tag(buildKind('lens'), { id: 'lens', name: `Objetivo ${o.focalMm} mm f/${o.fNumber}`, category: 'optica', kind: 'lens', bomId: `lens-${o.focalMm}mm`, notes: [`Montura a ${lensMount.toFixed(1)} mm de la película; enfoca a ${(o.throwMm / 1000).toFixed(2)} m`, reels ? 'Descansa en la cuna impresa I13, sujeta con una liga o un cincho de velcro' : 'Cuna impresa atornillada a la pared frontal de la base'], ...st8 });
    lens.position.z = lensMount;
    const edge = gateEdgeDistance(d, a);
    if (reels) {
      // cuna I13: ceja sobre la cubierta con dos espigas en ranuras, placa por la cara del frente, repisa y dos cunas
      const fm = a.filmMid;
      const pd = mat('plaDark');
      const zF = edge;
      const cradle = tag(new THREE.Group(), { id: 'lens-cradle', name: 'I13 Cuna de la lente', category: 'optica', bomId: 'print-petg', notes: ['Impresa en PETG: su ceja apoya en la cubierta con dos espigas I16 que corren ±3 mm en las ranuras (para enfocar) y el barril descansa en dos cunas'], ...st8 });
      cradle.add(box(80, 4, zF + 4 - 6, pd, 0, -fm + 2, (6 + zF + 4) / 2), box(80, 44, 4, pd, 0, -fm - 18, zF + 2), box(64, 4, 70, pd, 0, -fm - 38, zF + 35));
      const lr = 32.2;
      for (const zc of [lensMount + 6, lensMount + 30]) {
        const sh = new THREE.Shape();
        sh.moveTo(-32, -fm - 36);
        sh.lineTo(32, -fm - 36);
        sh.lineTo(32, -8);
        sh.lineTo(Math.sqrt(lr * lr - 64), -8);
        sh.absarc(0, 0, lr, -Math.asin(8 / lr), -Math.PI + Math.asin(8 / lr), true);
        sh.lineTo(-32, -8);
        sh.closePath();
        const cm = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 4, bevelEnabled: false, curveSegments: 32 }), pd);
        cm.position.z = zc - 2;
        cm.castShadow = true;
        cradle.add(cm);
      }
      gateGroup.add(cradle);
    } else {
      // cuna bajo el barril, brazo hacia la base y placa atornillada a la cara de la pared frontal
      const cradleY = -32 - 4;
      lens.add(box(70, 4, 30, mat('plaDark'), 0, cradleY, 20));
      const armLen = lensMount + 20 - edge;
      lens.add(box(20, 4, armLen, mat('plaDark'), 0, cradleY, edge - lensMount + armLen / 2));
      lens.add(box(30, 34, 4, mat('plaDark'), 0, cradleY - 15, edge + 2 - lensMount));
    }
    gateGroup.add(lens);

    // pantalla
    const screenZ = o.filmToLensMm + o.throwMm;
    const imgW = Math.min(Math.max(rep.imageWidthMm, 20), 6000);
    const imgH = Math.min(Math.max(rep.imageHeightMm, 12), 4000);
    const scr = tag(new THREE.Group(), { id: 'screen', name: 'Pantalla', category: 'optica', bomId: 'screen', notes: [`Imagen de ${imgW.toFixed(0)} × ${imgH.toFixed(0)} mm a ${(o.throwMm / 1000).toFixed(2)} m`] });
    scr.userData.assemblyHide = true;
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
    cone.userData.assemblyHide = true;
    gateGroup.add(cone);
  }

  /** cables del loop: potencia dentro de la base, señales de la caja de control a la base, LED y sensor */
  function buildWiresLoop(a: Assembly, motor: ReturnType<typeof motorOf>, refs: { bb: THREE.Object3D; exp: THREE.Object3D; dm: THREE.Object3D; psu: THREE.Object3D; fuseG: THREE.Object3D; res10: THREE.Object3D; bucks: THREE.Object3D[]; ctl: THREE.Object3D; bx: Assembly['box'] }): void {
    const { bb, exp, dm, psu, fuseG, res10, bucks, ctl, bx } = refs;
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
  }

  /** distancia (mm) del plano de la película al borde frontal de la base, a lo largo de la normal de la ventana */
  function gateEdgeDistance(d: Derived, a: Pick<Assembly, 'base'>): number {
    const g = pointAt(d.path, d.pathSpec.gateMm);
    const B = a.base;
    const n = g.normal;
    const tx = n.x > 1e-6 ? (B.x1 - g.position.x) / n.x : n.x < -1e-6 ? (B.x0 - g.position.x) / n.x : Infinity;
    const tz = n.y > 1e-6 ? (B.z1 - g.position.y) / n.y : n.y < -1e-6 ? (B.z0 - g.position.y) / n.y : Infinity;
    return Math.min(tx, tz);
  }

  // --- dos tambores (ADR-0011) armados sin tornillos (ADR-0012) ---------------------------------------------------------
  /** piezas de corte láser: se extruyen los mismos contornos que salen al taller y se colocan con su marco */
  function buildStructure(st: ReelsStructure): void {
    const bomOf: Record<SheetMaterial, string> = { mdf: 'laser-mdf', 'acrilico-3': 'laser-acrylic', 'acrilico-negro-3': 'laser-black' };
    const shellIds = new Set(['E02', 'E03', 'E04', 'E07']);
    const shellMat = new THREE.MeshStandardMaterial({ color: 0xcfc9c0, roughness: 0.85, transparent: true, opacity: shellTransparent ? 0.18 : 1, depthWrite: !shellTransparent, side: THREE.DoubleSide });
    shellMats.push(shellMat);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x8c8379, transparent: true, opacity: 0.55 });
    const category = (id: string): PartCategory => (id === 'A01' ? 'manos' : id.startsWith('A') ? 'transporte' : id.startsWith('N') ? 'optica' : 'estructura');
    for (const part of st.parts) {
      if (!part.frames.length) continue;
      const shape = new THREE.Shape(part.profile.outer.map((q) => new THREE.Vector2(q.x, q.y)));
      for (const h of part.profile.holes ?? []) shape.holes.push(new THREE.Path(h.map((q) => new THREE.Vector2(q.x, q.y))));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: part.thicknessMm, bevelEnabled: false, curveSegments: 1 });
      const edges = new THREE.EdgesGeometry(geo, 25);
      const shell = shellIds.has(part.id);
      const material = part.material === 'acrilico-3' ? mat('acrylic') : part.material === 'acrilico-negro-3' ? mat('anod') : shell ? shellMat : mat('mdf');
      part.frames.forEach((f, k) => {
        const many = part.frames.length > 1;
        const g = tag(new THREE.Group(), {
          id: many ? `${part.id}-${k + 1}` : part.id,
          name: many ? `${part.id} ${part.name} (${k + 1} de ${part.frames.length})` : `${part.id} ${part.name}`,
          category: category(part.id),
          bomId: bomOf[part.material],
          notes: [part.role, `${SHEET_MATERIALS[part.material].short}, corte láser${part.glue ? ` · ${part.glue}` : ' · sin pegamento: encaja a presión'}`, `Paso ${part.step} del ensamble`],
          step: part.step,
          explode: part.explode,
        });
        const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...f.u), new THREE.Vector3(...f.v), new THREE.Vector3(...f.n)).setPosition(...f.o);
        const mesh = new THREE.Mesh(geo, material);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(m);
        mesh.castShadow = !shell;
        mesh.receiveShadow = true;
        if (shell) mesh.userData.shell = true;
        const line = new THREE.LineSegments(edges, edgeMat);
        line.matrixAutoUpdate = false;
        line.matrix.copy(m);
        line.raycast = () => {};
        g.add(mesh, line);
        staticGroup.add(g);
      });
    }
  }

  function buildReels(d: Derived, p: Project): void {
    const r = d.reels!;
    const st = buildReelsStructure(p, d);
    const a = st.asm;
    reelAsm = a;
    reelStructure = st;
    baseBox = a.base;
    topY = a.sensorFaceY + 160;
    filmMid = a.filmMid;
    const B = a.base;
    const motor = motorOf(p.transport);
    const strip = p.film.stripWidthMm;
    const gap = a.flangeHighY - a.flangeLowY;
    const c = r.spec.control;
    const printed = new Map(reelsPrintedParts(p, d, {}, a).map((q) => [q.id, q]));
    /** nota de una pieza impresa: código, qué es y en qué paso entra */
    const pnote = (id: string) => {
      const q = printed.get(id);
      return q ? `${q.id} ${q.name}, impresa en PETG: ${q.role}` : id;
    };
    buildStructure(st);
    buildGround(B);
    const bearing = (parentObj: THREE.Object3D, y: number, id: string, step?: number) => {
      const b = tag(buildKind('bearing'), { id, name: 'Rodamiento 608ZZ', category: 'transporte', kind: 'bearing', bomId: 'bearing-608', ...(step ? { step, explode: [0, 1, 0] as [number, number, number] } : {}) });
      b.position.y = y;
      parentObj.add(b);
    };
    const flangeR2 = a.flangeR;
    const spoolBase = a.flangeLowY - a.flangeT;

    // --- tambores: núcleo impreso entre bridas de acrílico, eje pegado, motor parado en su torre -----------------------
    const spins: THREE.Object3D[] = [];
    const motorSpins: THREE.Object3D[][] = [];
    const wound: { side: THREE.Mesh; caps: THREE.Mesh[]; r: number }[] = [];
    const woundMat = new THREE.MeshStandardMaterial({ color: 0x6f8189, roughness: 0.3, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
    const shaftTop = a.flangeHighY + a.flangeT + 2;
    const deckBearingY = a.deckBearingTopY - 3.5;
    const plateBearingY = (a.motor.bearingPlateY[0] + a.motor.bearingPlateY[1]) / 2;
    a.reels.forEach((q, i) => {
      const n = i + 1;
      const g = tag(new THREE.Group(), {
        id: `reel-${n}`,
        name: `Tambor ${n}`,
        category: 'transporte',
        bomId: 'print-petg',
        notes: [
          n === 1 ? 'La mano sobre este tambor lleva la película hacia él: la animación avanza' : 'La mano sobre este tambor lleva la película hacia él: la animación va al revés',
          `Núcleo I01 de Ø${(2 * a.coreR).toFixed(1)} mm entre bridas de acrílico A02 y A03 de Ø${(2 * flangeR2).toFixed(0)} mm, con ${gap.toFixed(0)} mm de luz para la película de ${strip} mm`,
          `Lleno mide Ø${(2 * r.design.fullR).toFixed(1)} mm con ${(r.design.maxWoundMm / 1000).toFixed(2)} m de película`,
          'El eje de 8 mm va pegado al núcleo: gira en el 608 de la cubierta y en el de la torre, y baja al cople del motor',
          `La cola transparente entra en la ranura del núcleo y le da ${r.spec.tailTurns} vuelta${r.spec.tailTurns === 1 ? '' : 's'} con la película en el otro extremo`,
        ],
        step: 6,
        explode: [0, 1, 0],
      });
      g.position.set(q.x, 0, q.y);
      const spin = new THREE.Group();
      const reel = buildReel(a.coreR, flangeR2, gap, a.flangeT);
      reel.position.y = spoolBase;
      spin.add(reel);
      spin.add(cyl(5.75, spoolBase - a.deckBearingTopY, mat('pla'), 0, (spoolBase + a.deckBearingTopY) / 2, 0, 24)); // boss sobre la pista interior
      spin.add(cyl(4, shaftTop - a.motor.reelShaftBottomY, mat('steel'), 0, (shaftTop + a.motor.reelShaftBottomY) / 2, 0, 16));
      g.add(spin);
      spins.push(spin);
      // película enrollada: lado y tapas, que siguen al radio en cada cuadro
      const side = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, strip, 72, 1, true), woundMat);
      side.position.y = a.filmMid;
      side.userData.assemblyFilm = true;
      g.add(side);
      const caps = [a.filmBottom, a.filmTop].map((y) => {
        const m = new THREE.Mesh(new THREE.RingGeometry(a.coreR, a.coreR + 0.5, 72), woundMat);
        m.rotation.x = -Math.PI / 2;
        m.position.y = y;
        m.userData.assemblyFilm = true;
        g.add(m);
        return m;
      });
      wound.push({ side, caps, r: 0 });
      staticGroup.add(g);
      // rodamientos fijos (no giran con el tambor): uno a presión en la cubierta, con la contracubierta de tope, y otro
      // en la placa E10 de la torre, 25 mm abajo
      const bg = new THREE.Group();
      bg.position.set(q.x, 0, q.y);
      bearing(bg, deckBearingY, `bearing-reel${n}-a`, 5);
      bearing(bg, plateBearingY, `bearing-reel${n}-b`, 2);
      staticGroup.add(bg);
      const mg = new THREE.Group();
      mg.position.set(q.x, 0, q.y);
      const m = tag(buildKind('nema17'), { id: `motor-${n}`, name: `Motor ${n} · NEMA 17 17HS8401`, category: 'transporte', kind: 'nema17', bomId: `motor-${motor.id}`, notes: [`A ${r.fps.normal} fps gira de ${r.rpm.normalFull.toFixed(0)} rpm (tambor lleno) a ${r.rpm.normalCore.toFixed(0)} rpm (vacío); a ${r.fps.max} fps, hasta ${r.rpm.maxCore.toFixed(0)} rpm`, `Par: hacen falta ${r.torque.rollerTorqueNcm.toFixed(1)} N·cm y da ${r.torque.availableNcm.toFixed(1)} N·cm a ${r.torque.motorRpm.toFixed(0)} rpm`, 'Parado en el piso, dentro del collar E09 de su torre: no lleva soporte ni tornillos. Lo mueve su propio DM542'], step: 2, explode: [0, 1, 0] });
      m.position.y = a.motor.faceY - 48;
      mg.add(m);
      const cpl = tag(buildKind('coupling'), { id: `coupling-${n}`, name: `Cople flexible 5 × 8 mm · motor ${n}`, category: 'transporte', kind: 'coupling', bomId: 'coupling-5-8', notes: ['El único tornillo de la mesa: sus dos prisioneros aprietan el eje del motor y el del tambor'], step: 2, explode: [0, 1, 0] });
      cpl.position.y = a.motor.couplingY;
      mg.add(cpl);
      staticGroup.add(mg);
      motorSpins.push([m.userData.spin as THREE.Object3D, cpl].filter(Boolean));
    });

    // --- guías: cuerpo impreso con bridas de acrílico, en eje fijo pegado a la cubierta -----------------------------------
    const guides: THREE.Object3D[] = [];
    a.guides.forEach((q, i) => {
      const n = i + 1;
      const g = tag(new THREE.Group(), { id: `guide-${n}`, name: `Guía ${n}`, category: 'transporte', kind: 'roller', bomId: 'print-petg', notes: [pnote('I02'), 'Bridas A04 de acrílico; eje fijo de 70 mm pegado con epóxico en la cubierta, rondana M8 abajo y tapón I07 arriba', 'Toca la cara de la lámpara'], step: 7, explode: [0, 1, 0] });
      g.position.set(q.x, 0, q.y);
      const spin = new THREE.Group();
      const roller = buildSpool(a.R, gap, a.flangeT, a.R + 2);
      roller.position.y = spoolBase;
      spin.add(roller);
      g.add(spin);
      const top = shaftTop + 4.5;
      g.add(cyl(4, top + B.deckT, mat('steel'), 0, (top - B.deckT) / 2, 0, 16), cyl(7, 6, mat('pla'), 0, top - 1, 0, 24), cyl(8, 1.6, mat('steel'), 0, 0.8, 0, 24));
      bearing(spin, 1.6 + 3.5, `bearing-guide${n}-a`);
      bearing(spin, a.flangeHighY + a.flangeT - 3.1, `bearing-guide${n}-b`);
      staticGroup.add(g);
      guides.push(spin);
    });

    // --- brazo tensor: gira en el hueco de la cubierta; abajo, la copa con el segundo 608, el imán y el AS5600 ----------
    const ps = a.pivotStack;
    const piv = new THREE.Group();
    piv.position.set(a.pivot.x, 0, a.pivot.y);
    const armAng = Math.atan2(a.dancer.y - a.pivot.y, a.dancer.x - a.pivot.x);
    const rot = tag(new THREE.Group(), {
      id: 'dancer',
      name: 'Brazo tensor',
      category: 'transporte',
      bomId: 'print-petg',
      notes: [pnote('I04'), `Rodillo I03 de Ø${(2 * a.dancerR).toFixed(0)} mm con bridas A05: empuja la película unos 22 mm hacia dentro, por la cara de la cubierta, con el centro rebajado`, `El resorte, entre la mitad del brazo y el ancla I15, fija la tensión en unos ${p.transport.tensionN} N; el AS5600 lee el ángulo del eje`, 'El ESP32 corrige el tambor que suelta para dejar el brazo al centro: sirve en los dos sentidos'],
      step: 7,
      explode: [0, 1, 0],
    });
    const dx = a.dancer.x - a.pivot.x;
    const dz = a.dancer.y - a.pivot.y;
    const armT = ps.armY[1] - ps.armY[0];
    const bar = box(a.armMm, armT, 12, mat('plaDark'), dx / 2, (ps.armY[0] + ps.armY[1]) / 2, dz / 2);
    bar.rotation.y = -armAng;
    rot.add(bar, cyl(8, armT, mat('plaDark'), 0, (ps.armY[0] + ps.armY[1]) / 2, 0, 24), cyl(6, ps.bossTopY - ps.armY[0], mat('plaDark'), dx, (ps.bossTopY + ps.armY[0]) / 2, dz, 24));
    const rg = new THREE.Group();
    rg.position.set(dx, 0, dz);
    const dSpin = new THREE.Group();
    const dRoller = buildSpool(a.dancerR, gap, a.flangeT, a.dancerR + 2, 0.5);
    dRoller.position.y = spoolBase;
    dSpin.add(dRoller);
    rg.add(dSpin);
    const dTop = shaftTop + 4.5;
    rg.add(cyl(4, dTop - ps.armY[0], mat('steel'), 0, (dTop + ps.armY[0]) / 2, 0, 16), cyl(7, 6, mat('pla'), 0, dTop - 1, 0, 24));
    bearing(dSpin, ps.bossTopY + 3.5, 'bearing-dancer-a');
    bearing(dSpin, a.flangeHighY + a.flangeT - 3.5, 'bearing-dancer-b');
    rot.add(rg);
    // eje del pivote con la tapa del imán abajo
    rot.add(cyl(4, ps.armY[1] - (ps.magnetFaceY + 3.4), mat('steel'), 0, (ps.armY[1] + ps.magnetFaceY + 3.4) / 2, 0, 16));
    rot.add(cyl(7, 7.5, mat('plaDark'), 0, ps.magnetFaceY + 3.75, 0, 24));
    const mag = buildMagnet();
    mag.position.y = ps.magnetFaceY + 1.25;
    rot.add(mag);
    piv.add(rot);
    bearing(piv, (ps.upperBearingY[0] + ps.upperBearingY[1]) / 2, 'bearing-pivot-a', 5);
    bearing(piv, (ps.lowerBearingY[0] + ps.lowerBearingY[1]) / 2, 'bearing-pivot-b', 5);
    const cup = tag(new THREE.Group(), { id: 'pivot-cup', name: 'I05 Copa del pivote', category: 'transporte', bomId: 'print-petg', notes: [pnote('I05')], step: 5, explode: [0, -1, 0] });
    const cupH = ps.cupY[1] - ps.cupY[0];
    const cupBody = new THREE.Mesh(new THREE.CylinderGeometry(13.5, 13.5, cupH - 6, 40, 1, true), mat('plaDark'));
    cupBody.position.y = ps.cupY[0] + 6 + (cupH - 6) / 2;
    (cupBody.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    cup.add(cupBody, box(31, 6, 31, mat('plaDark'), -2, ps.cupY[0] + 3, 0));
    piv.add(cup);
    const enc = tag(buildKind('as5600'), { id: 'as5600', name: 'Encoder AS5600 del brazo tensor', category: 'manos', kind: 'as5600', bomId: 'as5600', notes: ['Entra de lado en la ranura de abajo de la copa, a 1,5 mm del imán del eje', 'El ESP32 lo lee por I2C y corrige el motor que suelta'], step: 7, explode: [-1, 0, 0] });
    enc.position.y = a.as5600.y;
    piv.add(enc);
    staticGroup.add(piv);
    // resorte y ancla dentro del hueco
    const hookY = (ps.armY[0] + ps.armY[1]) / 2;
    const anchorG = tag(new THREE.Group(), { id: 'spring-anchor', name: 'I15 Ancla del resorte', category: 'transporte', bomId: 'print-petg', notes: [pnote('I15')], step: 7, explode: [0, 1, 0] });
    anchorG.add(cyl(4, 4, mat('plaDark'), ps.anchor.x, -B.layerT + 2, ps.anchor.y, 20));
    staticGroup.add(anchorG);
    const spring = tag(new THREE.Group(), { id: 'dancer-spring', name: 'Resorte del brazo tensor', category: 'transporte', bomId: 'dancer-spring', notes: [`De extensión, de la mitad del brazo al ancla, dentro del hueco de la cubierta: con el brazo al centro da unos ${p.transport.tensionN} N de tensión en la película. Se ajusta desde arriba`], step: 7, explode: [0, 1, 0] });
    spring.add(buildSpring(new THREE.Vector3(ps.hook.x, hookY, ps.hook.y), new THREE.Vector3(ps.anchor.x, hookY, ps.anchor.y), 1.8, 9));
    staticGroup.add(spring);

    // --- tapas con tres postes, el sensor de mano bajo su capuchón con canal, cono de lectura y la mano -------------------
    const hands: THREE.Object3D[] = [];
    const cones: THREE.MeshBasicMaterial[] = [];
    const range = handRangeMm(c.speedMap);
    const halfFov = ((r.sensor.fovDeg / 2) * Math.PI) / 180;
    const sensors: THREE.Object3D[] = [];
    a.covers.forEach((cv, i) => {
      const n = i + 1;
      const posts = tag(new THREE.Group(), { id: `cover-posts-${n}`, name: `Postes de la tapa ${n}`, category: 'manos', bomId: 'print-petg', notes: [pnote('I08'), pnote('I09')], step: 9, explode: [0, 1, 0] });
      cv.posts.forEach((s, k) => {
        const hollow = k === cv.hollow;
        const pr = hollow ? a.hollowPostR : a.postR;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, cv.y, 24, 1, hollow), mat(hollow ? 'pla' : 'plaDark'));
        post.position.set(s.x, cv.y / 2, s.y);
        post.castShadow = true;
        posts.add(post);
      });
      staticGroup.add(posts);
      const hood = tag(new THREE.Group(), { id: `hood-${n}`, name: `Capuchón del sensor ${n}`, category: 'manos', bomId: 'print-petg', notes: [pnote('I10')], step: 10, explode: [0, 1, 0] });
      hood.position.set(cv.x, cv.y + 3, cv.z);
      const hq = cv.posts[cv.hollow];
      const toH = Math.atan2(hq.y - cv.z, hq.x - cv.x);
      const hg = new THREE.Group();
      hg.rotation.y = -toH;
      const postAt = Math.hypot(hq.x - cv.x, hq.y - cv.z);
      hg.add(box(34, 1.6, 34, mat('plaDark'), 0, 7.2, 0));
      for (const [w, dd, x0, z0] of [
        [34, 4, 0, -15],
        [34, 4, 0, 15],
        [4, 34, -15, 0],
      ] as const)
        hg.add(box(w, 6.4, dd, mat('plaDark'), x0, 3.2, z0));
      hg.add(box(postAt - 13 + 9.5, 1.6, 19, mat('plaDark'), (13 + postAt + 9.5) / 2, 7.2, 0));
      for (const sz of [-1, 1]) hg.add(box(postAt - 13 + 9.5, 6.4, 1.6, mat('plaDark'), (13 + postAt + 9.5) / 2, 3.2, sz * 8.7));
      hood.add(hg);
      staticGroup.add(hood);
      const sen = tag(buildKind('vl53l4cd'), { id: `hand-sensor-${n}`, name: `Sensor de mano ${n} · ${r.sensor.label}`, category: 'manos', kind: 'vl53l4cd', bomId: 'hand-sensor', notes: [r.sensor.note, `Ve la mano hasta ${range / 10} cm: ${c.speedMap.map(([dd, f]) => `${dd / 10} cm → ${f} fps`).join(' · ')}`, n === 2 ? 'Su XSHUT va al GPIO4: al arrancar, el ESP32 lo apaga, le cambia la dirección I2C al otro y luego lo enciende' : 'Comparte el bus I2C con el sensor 2 y el AS5600', 'Bajo el capuchón I10, con su tira de pines en ángulo hacia el canal'], step: 10, explode: [0, 1, 0] });
      sen.position.set(cv.x, cv.y + 3, cv.z);
      sen.rotation.y = -toH - Math.PI / 2;
      staticGroup.add(sen);
      sensors.push(sen);
      const coneMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const cone = new THREE.Mesh(new THREE.ConeGeometry(range * Math.tan(halfFov), range, 40, 1, true), coneMat);
      cone.rotation.x = Math.PI;
      cone.position.set(cv.x, a.sensorFaceY + range / 2, cv.z);
      cone.raycast = () => {};
      cone.userData.assemblyHide = true;
      staticGroup.add(cone);
      cones.push(coneMat);
      const hand = buildHand();
      hand.visible = false;
      hand.position.set(cv.x, a.sensorFaceY + 150, cv.z);
      hand.traverse((o) => (o.raycast = () => {}));
      hand.userData.assemblyHide = true;
      staticGroup.add(hand);
      hands.push(hand);
    });

    // --- electrónica dentro de la base ------------------------------------------------------------------------------------
    const floorTop = B.floorTop;
    const put = (o: THREE.Object3D, x: number, y: number, z: number, rotY = 0) => {
      o.position.set(x, y, z);
      o.rotation.y = rotY;
      staticGroup.add(o);
      return o;
    };
    const el = (id: string, name: string, extra: Partial<Omit<PartNode, 'visible'>> = {}) => ({ id, name, category: 'potencia' as PartCategory, step: 3, explode: [0, 1, 0] as [number, number, number], ...extra });
    const psu = tag(buildKind('psu'), el('psu', 'Fuente 24 V 5 A', { kind: 'psu', bomId: 'psu-24v-5a', notes: ['De pie detrás del marco E11, entre los topes E12 y contra la tapa trasera: no lleva tornillos', 'Alimenta los dos DM542, el LED y los reguladores'] }));
    psu.rotation.x = Math.PI / 2;
    psu.position.set(a.psu.x, floorTop + 49, a.psu.z - 21);
    staticGroup.add(psu);
    const dms = a.dm542.map((m, i) => put(tag(buildKind('dm542'), el(`dm542-${i + 1}`, `Driver DM542 · motor ${i + 1}`, { kind: 'dm542', bomId: 'driver-dm542', notes: ['Dos cinchos por las ranuras del piso, sobre sus pestañas', 'Interruptores DIP: 1/16 de paso y 1,8 A (verificar la tabla impresa en el driver)'] })), m.x, floorTop, m.z, m.rotY));
    const bucks = a.bucks.map((b) => put(tag(buildKind('lm2596'), el(`buck-${b.volts}v`, `Regulador LM2596 a ${b.volts} V`, { kind: 'lm2596', bomId: 'buck-lm2596', notes: [b.volts === 5 ? 'Alimenta el ESP32, el sensor de marcas y las entradas de los drivers' : 'Alimenta el IR2101', 'Un cincho por las ranuras del piso'] })), b.x, floorTop, b.z));
    const fuseG = tag(new THREE.Group(), el('fuse', 'Portafusible en línea con fusible de 500 mA', { bomId: 'led-fuse', notes: ['En la línea de 24 V del LED, antes de los capacitores; va amarrado a los cables', 'Modelo aproximado'] }));
    const holder = cyl(6, 30, mat('black'), 0, 7, 0, 20);
    holder.rotation.z = Math.PI / 2;
    fuseG.add(holder);
    fuseG.userData.anchors = { in: new THREE.Vector3(-16, 7, 0), out: new THREE.Vector3(16, 7, 0) };
    put(fuseG, a.fuse.x, floorTop, a.fuse.z);
    const bb = put(tag(buildKind('breadboard'), el('breadboard', 'Protoboard 830 puntos', { category: 'control', kind: 'breadboard', bomId: 'breadboard-kit', notes: ['Pegada al piso con su propio adhesivo', 'Lleva el driver del LED y los cuatro S8050 de los dos drivers'] })), a.breadboard.x, floorTop, a.breadboard.y);
    const exp = put(tag(buildKind('expansion'), el('esp32-expansion', 'Placa de expansión del ESP32', { category: 'control', kind: 'expansion', bomId: 'esp32-expansion', notes: ['Dos cinchos por sus barrenos de esquina'] })), a.expansion.x, floorTop, a.expansion.y);
    const esp = tag(buildKind('esp32'), { id: 'esp32', name: 'ESP32 DevKitC V4 («el Arduino»)', category: 'control', kind: 'esp32', bomId: 'esp32', notes: ['Lee las dos manos, el brazo tensor y las marcas; mueve los dos motores con la misma rampa y dispara el LED', 'GPIO25/26 → motor 1 · GPIO32/33 → motor 2 · GPIO27 → LED · GPIO34 ← marcas · GPIO21/22 I2C · GPIO4 → XSHUT del sensor 2'] });
    esp.position.set(0, EXPANSION.socketTop + 2.5, 0);
    exp.add(esp);
    const res10 = put(tag(buildKind('res10w'), el('led-resistor', 'Resistencia 3,3 Ω 10 W', { category: 'control', kind: 'res10w', bomId: 'led-resistor', notes: ['Un cincho por las ranuras del piso'] })), a.res10.x, floorTop, a.res10.y);
    const onBB = (o: THREE.Object3D, col: number, row: string) => {
      const h = breadboardHole(col, row);
      o.position.set(h.x, BREADBOARD.h, h.z);
      bb.add(o);
      return o;
    };
    onBB(tag(buildKind('ir2101'), { id: 'ir2101', name: 'Driver de compuerta IR2101', category: 'control', kind: 'ir2101', bomId: 'led-gate-driver' }), 12.5, 'e').position.z = 0;
    onBB(tag(buildKind('irlz44n'), { id: 'irlz44n', name: 'MOSFET IRLZ44N', category: 'control', kind: 'irlz44n', bomId: 'led-mosfet' }), 24, 'b');
    const caps = tag(new THREE.Group(), { id: 'caps', name: 'Capacitores 3 × 1000 µF 50 V', category: 'control', kind: 'cap1000', bomId: 'led-caps' });
    bb.add(caps);
    for (const col of [32, 39, 46]) {
      const o = buildKind('cap1000');
      const h = breadboardHole(col, 'i');
      o.position.set(h.x, BREADBOARD.h, h.z);
      caps.add(o);
    }
    const npnCols = [50, 54, 58, 62];
    npnCols.forEach((col, k) => onBB(tag(buildKind('s8050'), { id: `s8050-${k}`, name: `Transistor S8050 · ${k % 2 ? 'DIR' : 'PUL'} del motor ${k < 2 ? 1 : 2}`, category: 'control', kind: 's8050', bomId: 'npn-s8050', notes: ['El quinto de la lista es repuesto'] }), col, 'c'));
    const smallR = tag(new THREE.Group(), { id: 'small-resistors', name: 'Resistencias 1/4 W', category: 'control', kind: 'resistor', bomId: 'small-resistors' });
    bb.add(smallR);
    for (const [col, row] of [[16, 'h'], [18, 'b'], [48, 'a'], [52, 'a'], [56, 'a'], [60, 'a']] as const) {
      const o = buildKind('resistor');
      const h = breadboardHole(col + 2, row);
      o.position.set(h.x, BREADBOARD.h, h.z);
      smallR.add(o);
    }
    // cinchos: bandas delgadas sobre los drivers, reguladores y resistencia
    const ties = tag(new THREE.Group(), el('cable-ties', 'Cinchos de nylon', { category: 'estructura', bomId: 'cable-ties', notes: ['Pasan por las ranuras chicas del piso: sujetan sin tornillos los drivers, la placa de expansión, los reguladores y la resistencia. Se cortan para cambiar una pieza'] }));
    for (const m of a.dm542) for (const dz2 of [-45, 45]) ties.add(box(86, 1.2, 3.6, mat('white'), m.x, floorTop + 34.6, m.z + dz2));
    a.bucks.forEach((b, k) => ties.add(box(3.6, 1.2, 30, mat('white'), b.x + (k ? 10 : -10), floorTop + 16.6, b.z)));
    ties.add(box(3.6, 1.2, 30, mat('white'), a.res10.x, floorTop + 15.6, a.res10.y));
    staticGroup.add(ties);

    buildGateOptics(d, p, a, a);

    // --- cables -------------------------------------------------------------------------------------------------------
    root.updateMatrixWorld(true);
    const wires = {
      control: tag(new THREE.Group(), { id: 'wires-control', name: 'Jumpers de señal', category: 'cableado', bomId: 'jumpers-hm', notes: ['GPIO25/26 → PUL y DIR del motor 1 · GPIO32/33 → los del motor 2 · GPIO27 → IR2101 · GPIO34 ← sensor de marcas; 5 V y GND'], step: 3, explode: [0, 1, 0] }),
      bus: tag(new THREE.Group(), { id: 'wires-i2c', name: 'Bus I2C de los sensores', category: 'cableado', bomId: 'jumpers-hh', notes: ['3,3 V, GND, SDA (GPIO21) y SCL (GPIO22) a los dos sensores de mano y al AS5600; XSHUT del sensor 2 al GPIO4', 'Suben por el poste hueco de cada tapa y corren bajo el canal del capuchón'], step: 9, explode: [0, 1, 0] }),
      power: tag(new THREE.Group(), { id: 'wires-power', name: 'Cables de 24 V y del LED', category: 'cableado', bomId: 'wire-18awg', notes: ['18 AWG: 24 V a los dos drivers y al LED, y el lazo del pulso (resistencia → LED → MOSFET)'], step: 3, explode: [0, 1, 0] }),
      motor: tag(new THREE.Group(), { id: 'wires-motor', name: 'Cables de los motores', category: 'cableado', bomId: `motor-${motor.id}`, notes: ['Vienen con cada motor: A+ A− B+ B− a su DM542; el conector sale por la muesca del costado de la torre'], step: 3, explode: [0, 1, 0] }),
      deck: tag(new THREE.Group(), { id: 'wires-deck', name: 'Cables al LED y al sensor de marcas', category: 'cableado', bomId: 'wire-18awg', notes: ['Suben por el paso de cables de la cubierta: el lazo del pulso al LED (18 AWG) y 5 V, GND y la salida del F249 (jumpers)'], step: 8, explode: [0, 1, 0] }),
    };
    const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const up = (p0: THREE.Vector3, h: number) => p0.clone().add(v3(0, h, 0));
    const hole = (col: number, row: string) => {
      const h = breadboardHole(col, row);
      return root.worldToLocal(bb.localToWorld(v3(h.x, BREADBOARD.h, h.z)));
    };
    const local = (from: THREE.Vector3, to: THREE.Vector3, color: number, h = 14, rad = 0.65, grp = wires.control) => grp.add(wireMesh([from, up(from, h), up(to, h), to], color, rad, true));
    const psuP = anchorPos(psu, '+V');
    const psuN = anchorPos(psu, '-V');
    wires.power.add(wireMesh([psuP, up(psuP, 8).add(v3(0, 0, 14)), up(anchorPos(fuseG, 'in'), 18), anchorPos(fuseG, 'in')], 0xc8372d, 1));
    dms.forEach((dm, i) => {
      wires.power.add(wireMesh([psuP, up(psuP, 10 + i * 3).add(v3(0, 0, 18)), up(anchorPos(dm, '+V'), 20), anchorPos(dm, '+V')], 0xc8372d, 1));
      wires.power.add(wireMesh([psuN, up(psuN, 6 + i * 3).add(v3(0, 0, 16)), up(anchorPos(dm, 'GND'), 18), anchorPos(dm, 'GND')], 0x222222, 1));
      const mConn = anchorPos(registry.get(`motor-${i + 1}`)!.obj, 'conn');
      ['A+', 'A-', 'B+', 'B-'].forEach((t, k) => wires.motor.add(wireMesh([mConn.clone().add(v3(k - 1.5, 0, 0)), mConn.clone().add(v3(k - 1.5, 0, 20)), up(anchorPos(dm, t), 24), anchorPos(dm, t)], [0x222222, 0x2b8a4b, 0xc8372d, 0x2a6fb5][k], 0.6)));
      local(hole(npnCols[2 * i] + 1, 'd'), anchorPos(dm, 'PUL-'), 0x2b8a4b, 20);
      local(hole(npnCols[2 * i + 1] + 1, 'd'), anchorPos(dm, 'DIR-'), 0x2a6fb5, 22);
      local(hole(5 + 2 * i, 'b+'), anchorPos(dm, 'PUL+'), 0xe07b26, 24);
      local(hole(6 + 2 * i, 'b+'), anchorPos(dm, 'DIR+'), 0xe07b26, 26);
    });
    for (const b of bucks) {
      wires.power.add(wireMesh([psuP, up(psuP, 16).add(v3(0, 0, 20)), up(anchorPos(b, 'IN+'), 14), anchorPos(b, 'IN+')], 0xc8372d, 0.8));
      wires.power.add(wireMesh([psuN, up(psuN, 14).add(v3(0, 0, 20)), up(anchorPos(b, 'IN-'), 12), anchorPos(b, 'IN-')], 0x222222, 0.8));
    }
    local(anchorPos(fuseG, 'out'), hole(3, 't+'), 0xc8372d, 16, 1, wires.power);
    local(anchorPos(bucks[0], 'OUT+'), hole(4, 'b+'), 0xe07b26, 18);
    local(anchorPos(bucks[1], 'OUT+'), hole(62, 'b+'), 0x7b4bb3, 20);
    local(anchorPos(bucks[0], 'OUT-'), hole(4, 'b-'), 0x222222, 16);
    (['GPIO25', 'GPIO26', 'GPIO32', 'GPIO33'] as const).forEach((pin, k) => local(anchorPos(exp, pin), hole(npnCols[k] - 2, 'a'), [0x2b8a4b, 0x2a6fb5, 0x2b8a4b, 0x2a6fb5][k], 12 + k * 2));
    local(anchorPos(exp, 'GPIO27'), hole(12, 'a'), 0xeeeeee);
    local(anchorPos(exp, '5V'), hole(10, 'b+'), 0xe07b26);
    local(anchorPos(exp, 'GND'), hole(10, 'b-'), 0x222222);
    // del interior a la cabeza del LED y al sensor de marcas por el paso de cables
    const deckHole = v3(a.bundle.x, 0, a.bundle.y);
    const under = v3(a.bundle.x, -24, a.bundle.y);
    const ledObj = registry.get('led')?.obj;
    if (ledObj) {
      const ledP = anchorPos(ledObj, '+');
      const ledN = anchorPos(ledObj, '-');
      local(hole(30, 't+'), anchorPos(res10, 'a'), 0xc8372d, 18, 1, wires.power);
      wires.deck.add(wireMesh([anchorPos(res10, 'b'), up(anchorPos(res10, 'b'), 12), under.clone().add(v3(2, 0, 0)), deckHole.clone().add(v3(2, 0, 0)), up(deckHole, 12).add(v3(2, 0, 0)), up(ledP, 18).add(v3(0, 0, -8)), ledP], 0xc8372d, 1));
      wires.deck.add(wireMesh([hole(25, 'a'), up(hole(25, 'a'), 12), under.clone().add(v3(-2, 0, 0)), deckHole.clone().add(v3(-2, 0, 0)), up(deckHole, 12).add(v3(-2, 0, 0)), up(ledN, 18).add(v3(0, 0, -8)), ledN], 0x222222, 1));
    }
    const sensorObj = registry.get('sensor')!.obj;
    sensorObj.updateMatrixWorld(true);
    (['VCC', 'GND', 'DO'] as const).forEach((pin, i) => {
      const from = i === 2 ? anchorPos(exp, 'GPIO34') : hole(8 + i, i ? 'b-' : 'b+');
      const to = anchorPos(sensorObj, pin);
      const off = v3(0, 0, (i - 1) * 2.4);
      wires.deck.add(wireMesh([from, up(from, 12), under.clone().add(off), deckHole.clone().add(off), up(deckHole, 20).add(off), up(to, 14), to], [0xe07b26, 0x222222, 0xeeeeee][i], 0.6, true));
    });
    // bus I2C: 3,3 V, GND, SDA, SCL al AS5600 y a cada sensor de mano por su poste hueco
    const bus = [anchorPos(exp, '3V3'), anchorPos(exp, 'GND2'), anchorPos(exp, 'GPIO21'), anchorPos(exp, 'GPIO22')];
    const busColors = [0xe07b26, 0x222222, 0x2a6fb5, 0x2b8a4b];
    const encBus = anchorPos(enc, 'bus');
    bus.forEach((from, k) => wires.bus.add(wireMesh([from, up(from, 10 + k * 2), v3(encBus.x - 30, -22 - k * 2, encBus.z + 10), encBus.clone().add(v3((k - 1.5) * 2.54, 0, 0))], busColors[k], 0.55, true)));
    sensors.forEach((sen, i) => {
      const cv = a.covers[i];
      const post = cv.posts[cv.hollow];
      const sBus = anchorPos(sen, 'bus');
      const lines = i === 1 ? [...bus, anchorPos(exp, 'GPIO4')] : bus;
      lines.forEach((from, k) => {
        const o = v3((k - 2) * 1.4, 0, 0);
        wires.bus.add(wireMesh([from, up(from, 14 + k * 2), v3(post.x, -20 - k * 2, post.y).add(o), v3(post.x, cv.y + 4.5, post.y).add(o), sBus.clone().add(v3((k - 2) * 2.54, 0.6, 0))], k < 4 ? busColors[k] : 0xeeeeee, 0.5, true));
      });
    });
    staticGroup.add(wires.control, wires.bus, wires.power, wires.motor, wires.deck);

    reelParts = { spins, motorSpins, wound, guides, dancerArm: rot, dancerSpin: dSpin, hands, cones };
    finishStatic(d, p, B);
    captureAssemblyHomes();
  }

  /** la película enrollada sigue al radio: el lado se escala y las tapas se rehacen cuando cambia de verdad */
  function setWound(w: { side: THREE.Mesh; caps: THREE.Mesh[]; r: number }, r: number, coreR: number): void {
    const rr = Math.max(coreR + 0.05, r - 0.3);
    w.side.scale.set(rr, 1, rr);
    if (Math.abs(rr - w.r) < 0.03) return;
    w.r = rr;
    for (const cap of w.caps) {
      cap.geometry.dispose();
      cap.geometry = new THREE.RingGeometry(coreR, rr, 72);
    }
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
    const fa = asm ?? reelAsm;
    if (L <= 0 || !fa) return;
    const yBottom = fa.filmBottom;
    const yTop = fa.filmTop;
    // con dos tambores la base sigue en las colas transparentes, antes del primer fotograma y después del último
    const s0 = d.reels ? -d.reels.design.tail1Mm : 0;
    const s1 = d.reels ? layout.totalLengthMm + d.reels.design.tail2Mm : L;
    const nSeg = Math.max(16, Math.ceil((s1 - s0) / 4));
    const bs: number[] = [];
    const by: number[] = [];
    const bIdx: number[] = [];
    for (let i = 0; i <= nSeg; i++) {
      const sigma = s0 + (i / nSeg) * (s1 - s0);
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
    placeRibbonAt(mesh, sigmas, ys, (sigma) => pointAt(geo, phi - sigma), offset);
  }

  /** coloca cada vértice de la cinta donde dice `at` para su coordenada σ */
  function placeRibbonAt(mesh: THREE.Mesh | null, sigmas: Float32Array, ys: Float32Array, at: (sigma: number) => PathPoint, offset: number): void {
    if (!mesh) return;
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < sigmas.length; i++) {
      const pt = at(sigmas[i]);
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
    if (e) e.obj.visible = !hidden.has(id) && (!isolated || related(isolated, id)) && (!assembly || e.node.step === undefined || e.node.step <= assembly.step);
  }

  // --- ensamble paso a paso ------------------------------------------------------------------------------------------
  /** paso visible, explosión (0–1) y cuándo empezó el paso (para que sus piezas lleguen volando) */
  let assembly: { step: number; explode: number; since: number } | null = null;
  const homes = new Map<THREE.Object3D, THREE.Vector3>();
  /** distancia de la vista explosionada (mm) */
  const EXPLODE_MM = 150;
  function captureAssemblyHomes(): void {
    homes.clear();
    for (const e of registry.values()) if (e.node.step !== undefined) homes.set(e.obj, e.obj.position.clone());
    applyAssemblyHides();
  }
  function applyAssemblyHides(): void {
    for (const grp of [staticGroup, gateGroup]) grp.traverse((o) => {
      if (o.userData.assemblyHide) o.visible = !assembly;
      if (o.userData.assemblyFilm) o.visible = !assembly || assembly.step >= 11;
      if (o.userData.assemblyFrom !== undefined) o.visible = !assembly || assembly.step >= (o.userData.assemblyFrom as number);
    });
  }
  function applyAssembly(): void {
    const A = assembly;
    const now = performance.now();
    const t = A ? Math.min(1, (now - A.since) / 900) : 1;
    const ease = 1 - (1 - t) ** 3;
    for (const e of registry.values()) {
      const st = e.node.step;
      const home = homes.get(e.obj);
      if (st === undefined || !home) continue;
      if (!A) {
        e.obj.position.copy(home);
        continue;
      }
      const dir = e.node.explode ?? [0, 1, 0];
      // las piezas de pasos anteriores se separan con la explosión; las del paso llegan desde afuera
      const f = st < A.step ? A.explode * (0.4 + (0.6 * st) / Math.max(1, A.step)) : st === A.step ? Math.max(A.explode, 1 - ease) : 0;
      e.obj.position.set(home.x + dir[0] * EXPLODE_MM * f, home.y + dir[1] * EXPLODE_MM * f, home.z + dir[2] * EXPLODE_MM * f);
    }
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
    if (!baseBox) return new THREE.Sphere(new THREE.Vector3(), 0.3);
    const B = baseBox;
    const c = new THREE.Vector3(((B.x0 + B.x1) / 2) * MM, ((B.bottom + topY) / 2) * MM, ((B.z0 + B.z1) / 2) * MM);
    return new THREE.Sphere(c, Math.hypot(B.x1 - B.x0, B.z1 - B.z0, topY - B.bottom) * 0.5 * MM);
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
        return lookFrom(s.center, new THREE.Vector3(0, 1, 0.0001), s.radius);
      case 'gate':
        return lookFrom(gate, gz.clone().multiplyScalar(1).add(gx.clone().multiplyScalar(0.8)).add(new THREE.Vector3(0, 0.6, 0)), 0.07);
      case 'drive':
        return reelAsm ? focusPart('motor-1', new THREE.Vector3(-1, -0.2, 0.9), 0.12) : focusPart('motor', new THREE.Vector3(-1, -0.2, 0.9), 0.1);
      case 'control':
        return reelAsm ? focusPart('breadboard', new THREE.Vector3(0.35, -0.12, 1), 0.13) : focusPart('control-box', new THREE.Vector3(0.5, 0.9, 0.8), undefined);
      case 'hands': {
        if (!reelAsm) return setView('home');
        // desde atrás y arriba, donde está el visitante: los dos tambores, sus sensores y las manos
        const t = new THREE.Vector3(0, (reelAsm.sensorFaceY + 70) * MM, ((reelAsm.reels[0].y + reelAsm.base.z1) / 2) * MM);
        return lookFrom(t, new THREE.Vector3(0.3, 0.85, -1), Math.max(0.2, (reelAsm.base.x1 - reelAsm.base.x0) * 0.72 * MM));
      }
      case 'base': {
        const b = baseBox;
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
    if (d.reels && reelParts && reelAsm) updateReels(d, state);
    else if (state.phiMm !== lastPhi) {
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
    if (assembly || homes.size) applyAssembly();
    controls.update();
    renderer.info.reset();
    renderer.render(scene, camera);
    syncLabels();
    const now = performance.now();
    frameTimes.push(now);
    while (frameTimes.length && now - frameTimes[0] > 1000) frameTimes.shift();
  }

  /**
   * Dos tambores: la película sigue el recorrido de este instante (radios reales y brazo tensor girado), los tambores
   * giran lo que enrollan, las guías y el brazo ruedan con ella y las manos suben o bajan sobre sus sensores.
   */
  function updateReels(d: Derived, state: MechSceneState): void {
    const r = d.reels!;
    const a = reelAsm!;
    const P = reelParts!;
    const live = state.reel?.live;
    // el brazo se abre un poco al acelerar (sube la tensión) y se cierra al frenar; el ESP32 lo regresa al centro
    const accel = live && Math.abs(live.vMmS) > 1e-6 ? live.aMmS2 * Math.sign(live.vMmS) : 0;
    const dancerRad = Math.max(-0.06, Math.min(0.06, (accel / r.spec.control.accelMmS2) * 0.05));
    const lp = livePath(r.design, state.phiMm, dancerRad);
    placeRibbonAt(baseMesh, baseSigma, baseY, lp.at, 0);
    placeRibbonAt(frameMesh, frameSigma, frameY, lp.at, FRAME_OFFSET);
    placeRibbonAt(syncMesh, syncSigma, syncY, lp.at, FRAME_OFFSET);
    lastPhi = state.phiMm;
    // un giro antihorario en la mesa es un giro negativo alrededor de +Y: el tambor 1 enrolla y el 2 suelta
    const ang = [-lp.pose.turn1, lp.pose.turn2];
    P.spins.forEach((s, i) => (s.rotation.y = ang[i]));
    P.motorSpins.forEach((list, i) => list.forEach((s) => (s.rotation.y = ang[i])));
    setWound(P.wound[0], lp.pose.r1, a.coreR);
    setWound(P.wound[1], lp.pose.r2, a.coreR);
    for (const g of P.guides) g.rotation.y = -state.phiMm / a.R;
    P.dancerArm.rotation.y = -dancerRad;
    P.dancerSpin.rotation.y = state.phiMm / a.dancerR;
    const hands = state.reel?.hands;
    P.hands.forEach((h, i) => {
      const hi = hands?.[i];
      h.visible = !!hi?.present;
      if (hi) h.position.y = a.sensorFaceY + hi.distanceMm;
    });
    P.cones.forEach((m, i) => (m.opacity = live && live.sensed[i] !== null ? (live.owner === i ? 0.2 : 0.12) : 0.05));
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
    const B = baseBox;
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
    setAssembly(step, explode = 0) {
      if (step === null || !reelStructure) assembly = null;
      else {
        const k = Math.max(1, Math.min(reelStructure.steps.length, Math.round(step)));
        assembly = { step: k, explode: Math.max(0, Math.min(1, explode)), since: assembly && assembly.step === k ? assembly.since : performance.now() };
      }
      applyAssemblyHides();
      applyIsolation();
      for (const cb of partsListeners) cb();
    },
    assemblySteps: () => reelStructure?.steps ?? [],
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
