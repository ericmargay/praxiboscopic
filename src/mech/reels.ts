// Dos tambores con control por la mano (ADR-0011). La película ya no es un loop: va del tambor 2 al tambor 1 por el
// brazo tensor, dos rodillos guía y la ventana, y regresa. La mano sobre el sensor de cada tambor jala la película
// hacia él, más rápido entre más cerca; sin manos frena y se queda en un cuadro iluminado. Es puro: lo usan la
// derivación del proyecto, la simulación, la escena 3D, la lista de compras y las pruebas.
//
// Plano de la mesa como en path.ts, con +y hacia la lente. El avance (φ crece y con él el índice de fotograma, ADR-0002)
// lleva la película del tambor 2 (+x) al tambor 1 (−x): en la ventana corre hacia −x, de derecha a izquierda vista
// desde la lente, igual que en el loop. Un punto de la tira con coordenada σ está en s = φ − σ: s = 0 es donde la
// película deja el tambor 2 y s = L donde llega al tambor 1. Con s < 0 está enrollada en el tambor 2 y con s > L en el
// tambor 1. Las colas transparentes quedan fuera de la tira impresa: la del tambor 1 en σ < 0 y la del tambor 2 después
// del último fotograma.
import { motorTorqueAtRpm } from '@aminoacid/omega/mech';
import { gaussian, type LedStrobe } from './strobe';
import type { ExposureEvent } from './timing';
import { pointAt, type PathGeometry, type PathPoint, type PathSegment, type Vec2 } from './path';
import { motorOf, type TorqueReport, type TransportSpec } from './transport';

// --- especificación ---------------------------------------------------------------------------------------------------

export type HandSensorId = 'vl53l4cd' | 'vl53l0x';
export type TwoHands = 'first' | 'nearest' | 'stop';

export interface HandSensor {
  id: HandSensorId;
  label: string;
  /** lectura válida más cercana y más lejana (mm) */
  minMm: number;
  maxMm: number;
  /** cono de visión (grados, completo) */
  fovDeg: number;
  /** lecturas por segundo */
  rateHz: number;
  note: string;
}

export const HAND_SENSORS: Record<HandSensorId, HandSensor> = {
  vl53l4cd: { id: 'vl53l4cd', label: 'VL53L4CD', minMm: 1, maxMm: 1200, fovDeg: 18, rateHz: 100, note: 'Lee desde 1 mm, en un cono de 18°, hasta 100 veces por segundo' },
  vl53l0x: { id: 'vl53l0x', label: 'VL53L0X', minMm: 30, maxMm: 2000, fovDeg: 25, rateHz: 50, note: 'Pierde la mano a menos de unos 3 cm; cono de 25°, unas 50 lecturas por segundo' },
};

export interface ReelControlSpec {
  /** distancia de la mano sobre el sensor (mm) → fotogramas por segundo, de lejos a cerca. Más allá del primero no hay mano */
  speedMap: [number, number][];
  /** aceleración máxima de la película (mm/s²): de quieta a 24 fps en unos 0,4 s */
  accelMmS2: number;
  /** la mano tiene que quedarse este tiempo antes de mover la película (ms): una cabeza que pasa no la mueve */
  dwellMs: number;
  /** constante del filtro de la lectura (ms) */
  filterMs: number;
  /** dos manos a la vez: manda la que llegó primero, la más cercana, o la película se detiene */
  twoHands: TwoHands;
  /** sin visitantes: quieta en un cuadro iluminado, o va y viene sola despacio para invitar */
  idle: 'hold' | 'attract';
  /** segundos sin manos antes de invitar */
  idleS: number;
  attractFps: number;
  /** al final de la película: espera a que alguien use el otro tambor, o regresa sola */
  atEnd: 'wait' | 'return';
  returnFps: number;
  /** corrimiento máximo durante un destello (mm): el destello dura esto entre la velocidad */
  maxBlurMm: number;
  /** pulsos por segundo con la película quieta, con la misma luz promedio */
  stillHz: number;
  /** en reversa el sensor ve primero el otro borde de la marca: el ESP32 retrasa el destello lo justo */
  compensateMarkEdge: boolean;
}

export interface ReelsSpec {
  /** núcleo de los tambores (mm): el de los rodillos, así la película se dobla igual que en el loop */
  coreDiameterMm: number;
  flangeDiameterMm: number;
  /** entre los centros de los tambores (mm) */
  spacingMm: number;
  /** de los centros de los tambores al tramo de la ventana (mm) */
  depthMm: number;
  guideDiameterMm: number;
  /** rodillo del brazo tensor (mm) */
  dancerDiameterMm: number;
  /** vueltas de cola transparente que quedan en cada núcleo con la película en un extremo */
  tailTurns: number;
  sensor: HandSensorId;
  control: ReelControlSpec;
}

export function defaultReelControl(over: Partial<ReelControlSpec> = {}): ReelControlSpec {
  return {
    speedMap: [
      [350, 6],
      [250, 15],
      [150, 24],
      [30, 30],
    ],
    accelMmS2: 2000,
    dwellMs: 150,
    filterMs: 60,
    twoHands: 'first',
    idle: 'hold',
    idleS: 20,
    attractFps: 12,
    atEnd: 'wait',
    returnFps: 24,
    maxBlurMm: 0.1,
    stillHz: 200,
    compensateMarkEdge: true,
    ...over,
  };
}

/** núcleo de Ø103,1 mm (9 fotogramas de 36 mm por vuelta, como los rodillos), bridas de Ø130 y mesa de unos 38 × 26 cm */
export function defaultReelsSpec(over: Partial<ReelsSpec> = {}): ReelsSpec {
  return { coreDiameterMm: (9 * 36) / Math.PI, flangeDiameterMm: 130, spacingMm: 194, depthMm: 160, guideDiameterMm: 60, dancerDiameterMm: 40, tailTurns: 1, sensor: 'vl53l4cd', control: defaultReelControl(), ...over };
}

/** extremo de la cola que entra en la ranura del núcleo (mm) */
export const TAIL_ANCHOR_MM = 40;

// --- enrollado -------------------------------------------------------------------------------------------------------

/** radio de un tambor con `lengthMm` de película de grosor `t` enrollada sobre un núcleo de radio r0: π(r² − r0²) = ℓ·t */
export function woundRadius(r0: number, lengthMm: number, t: number): number {
  return Math.sqrt(r0 * r0 + (Math.max(0, lengthMm) * t) / Math.PI);
}

/** giro de un tambor al enrollar `lengthMm` desde el núcleo (rad): ∫ dℓ / r(ℓ) = 2π (r − r0) / t */
export function woundAngle(r0: number, lengthMm: number, t: number): number {
  return t > 0 ? (2 * Math.PI * (woundRadius(r0, lengthMm, t) - r0)) / t : Math.max(0, lengthMm) / r0;
}

// --- recorrido abierto ------------------------------------------------------------------------------------------------

export type CircleId = 'reel2' | 'dancer' | 'guide2' | 'guide1' | 'reel1';

export interface PathCircle extends Vec2 {
  id: CircleId;
  r: number;
  /** +1: el círculo queda a la izquierda del avance y toca la cara de la lámpara; −1: a la derecha, la de la lente */
  side: 1 | -1;
}

export interface OpenPath extends PathGeometry {
  circles: PathCircle[];
  /** ángulo del punto donde la película deja el primer círculo y donde llega al último */
  startAngle: number;
  endAngle: number;
  /** ventana a la mitad del tramo entre las guías */
  gateMm: number;
  /** tramo recto de la ventana */
  front: Extract<PathSegment, { kind: 'line' }>;
}

/** tangente común del círculo a al b con la película yendo de a a b; `nrm` es la normal a la derecha del avance */
function tangent(a: PathCircle, b: PathCircle): { d: Vec2; nrm: Vec2; a: Vec2; b: Vec2; len: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1e-9;
  const k = a.side * a.r - b.side * b.r;
  const theta = Math.atan2(dy, dx) - Math.acos(Math.max(-1, Math.min(1, k / L)));
  const nrm = { x: Math.cos(theta), y: Math.sin(theta) };
  const pa = { x: a.x + a.side * a.r * nrm.x, y: a.y + a.side * a.r * nrm.y };
  const pb = { x: b.x + b.side * b.r * nrm.x, y: b.y + b.side * b.r * nrm.y };
  return { d: { x: -nrm.y, y: nrm.x }, nrm, a: pa, b: pb, len: Math.hypot(pb.x - pa.x, pb.y - pa.y) };
}

/**
 * Recorrido abierto por círculos de radios distintos: tramos tangentes entre círculos consecutivos y arcos sobre los
 * intermedios. Empieza donde la película deja el primero y termina donde llega al último.
 */
export function openPath(circles: PathCircle[]): OpenPath {
  if (circles.length < 2) throw new Error('Hacen falta al menos dos círculos');
  const segments: PathSegment[] = [];
  let s = 0;
  let straight = 0;
  let polygon = 0;
  const tans = circles.slice(0, -1).map((c, i) => tangent(c, circles[i + 1]));
  tans.forEach((t, i) => {
    segments.push({ kind: 'line', s0: s, length: t.len, a: t.a, b: t.b, tangent: t.d, normal: t.nrm });
    s += t.len;
    straight += t.len;
    polygon += Math.hypot(circles[i + 1].x - circles[i].x, circles[i + 1].y - circles[i].y);
    const next = tans[i + 1];
    if (!next) return;
    const c = circles[i + 1];
    const ang0 = Math.atan2(c.side * t.nrm.y, c.side * t.nrm.x);
    const ang1 = Math.atan2(c.side * next.nrm.y, c.side * next.nrm.x);
    let sweep = c.side > 0 ? ang1 - ang0 : ang0 - ang1;
    while (sweep < 0) sweep += 2 * Math.PI;
    while (sweep >= 2 * Math.PI) sweep -= 2 * Math.PI;
    segments.push({ kind: 'arc', s0: s, length: c.r * sweep, center: { x: c.x, y: c.y }, radius: c.r, angle0: ang0, sweep: c.side * sweep, roller: i + 1, side: c.side });
    s += c.r * sweep;
  });
  const first = circles[0];
  const last = circles[circles.length - 1];
  const t0 = tans[0];
  const tn = tans[tans.length - 1];
  const lines = segments.filter((x): x is Extract<PathSegment, { kind: 'line' }> => x.kind === 'line');
  const g1 = circles.findIndex((c) => c.id === 'guide2');
  const front = g1 >= 0 && lines[g1] ? lines[g1] : lines[Math.floor(lines.length / 2)];
  return {
    segments,
    lengthMm: s,
    straightMm: straight,
    polygonMm: polygon,
    circles,
    startAngle: Math.atan2(first.side * t0.nrm.y, first.side * t0.nrm.x),
    endAngle: Math.atan2(last.side * tn.nrm.y, last.side * tn.nrm.x),
    gateMm: front.s0 + front.length / 2,
    front,
  };
}

/**
 * Punto del recorrido abierto, también fuera de él: antes de s = 0 la película sigue enrollada en el primer círculo y
 * después de L en el último. Fuera del recorrido se dibuja solo la vuelta exterior (`maxTurns`); más adentro todo cae en
 * el mismo punto.
 */
export function openPointAt(path: OpenPath, s: number, maxTurns = 1): PathPoint {
  const L = path.lengthMm;
  if (s >= 0 && s < L) return pointAt(path, s);
  const atStart = s < 0;
  const c = atStart ? path.circles[0] : path.circles[path.circles.length - 1];
  const lim = 2 * Math.PI * c.r * maxTurns;
  const u = atStart ? Math.max(s, -lim) : Math.min(s - L, lim);
  const ang = (atStart ? path.startAngle : path.endAngle) + (c.side * u) / c.r;
  const rad = { x: Math.cos(ang), y: Math.sin(ang) };
  return {
    s,
    position: { x: c.x + c.r * rad.x, y: c.y + c.r * rad.y },
    tangent: { x: -c.side * rad.y, y: c.side * rad.x },
    normal: { x: c.side * rad.x, y: c.side * rad.y },
    segment: atStart ? 0 : path.segments.length - 1,
    onRoller: atStart ? 0 : path.circles.length - 1,
  };
}

// --- diseño de la mesa ------------------------------------------------------------------------------------------------

export interface ReelsGeometry {
  /** tambor 1 (−x): hacia él avanza la película; tambor 2 (+x): de él sale al principio */
  reel1: Vec2;
  reel2: Vec2;
  guide1: Vec2;
  guide2: Vec2;
  /** rodillo del brazo tensor, su pivote y el largo del brazo */
  dancer: Vec2;
  pivot: Vec2;
  armMm: number;
  coreR: number;
  flangeR: number;
  guideR: number;
  dancerR: number;
}

/** cuánto empuja el rodillo del brazo tensor la película hacia dentro (mm) */
const DANCER_PUSH_MM = 22;

/**
 * Posiciones de la mesa compacta: los tambores atrás, la película baja recta del lado exterior de cada uno a su guía,
 * la guía la dobla 90° hacia la ventana y el brazo tensor queda entre el tambor 2 y su guía, del lado de la cubierta.
 * `midR` es el radio con la película a medias, que alinea el tramo con el exterior de la guía.
 */
export function reelsGeometry(spec: ReelsSpec, midR: number): ReelsGeometry {
  const coreR = spec.coreDiameterMm / 2;
  const guideR = spec.guideDiameterMm / 2;
  const dancerR = spec.dancerDiameterMm / 2;
  const hx = spec.spacingMm / 2;
  const xOut = hx + midR;
  const reel1 = { x: -hx, y: -spec.depthMm };
  const reel2 = { x: hx, y: -spec.depthMm };
  const guide2 = { x: xOut - guideR, y: -guideR };
  const guide1 = { x: -(xOut - guideR), y: -guideR };
  const dancer = { x: xOut - DANCER_PUSH_MM + dancerR, y: reel2.y + 0.6 * (guide2.y - reel2.y) };
  // pivote hacia la guía y hacia fuera: el brazo mueve el rodillo casi de lado, cruzando la película
  const pivot = { x: dancer.x + 24, y: dancer.y + 37 };
  return { reel1, reel2, guide1, guide2, dancer, pivot, armMm: Math.hypot(pivot.x - dancer.x, pivot.y - dancer.y), coreR, flangeR: spec.flangeDiameterMm / 2, guideR, dancerR };
}

/** círculos del recorrido para unos radios de tambor y un giro del brazo tensor (rad, + aleja el rodillo de la película) */
export function reelCircles(g: ReelsGeometry, r2: number, r1: number, dancerRad = 0): PathCircle[] {
  let dancer = g.dancer;
  if (dancerRad) {
    const a = Math.atan2(g.dancer.y - g.pivot.y, g.dancer.x - g.pivot.x) + dancerRad;
    dancer = { x: g.pivot.x + g.armMm * Math.cos(a), y: g.pivot.y + g.armMm * Math.sin(a) };
  }
  return [
    { id: 'reel2', ...g.reel2, r: r2, side: 1 },
    { id: 'dancer', ...dancer, r: g.dancerR, side: -1 },
    { id: 'guide2', ...g.guide2, r: g.guideR, side: 1 },
    { id: 'guide1', ...g.guide1, r: g.guideR, side: 1 },
    { id: 'reel1', ...g.reel1, r: r1, side: 1 },
  ];
}

export interface ReelsDesign {
  spec: ReelsSpec;
  geometry: ReelsGeometry;
  thicknessMm: number;
  /** recorrido con los dos tambores a medio llenar: fija la ventana y las colas */
  path: OpenPath;
  gateMm: number;
  /** colas transparentes: la del tambor 1 antes del primer fotograma y la del tambor 2 después del último (mm) */
  tail1Mm: number;
  tail2Mm: number;
  /** cola mínima en cada núcleo con la película en un extremo (mm) */
  wrapMinMm: number;
  /** largo de la tira impresa (mm) y total con las colas */
  stripMm: number;
  totalMm: number;
  /** φ con el primer y el último fotograma centrados en la ventana, y el de cada fotograma */
  phiMin: number;
  phiMax: number;
  centers: number[];
  /** lo más que se enrolla en un tambor (mm) y su radio */
  maxWoundMm: number;
  fullR: number;
  midR: number;
}

const ceil10 = (x: number) => Math.ceil(x / 10 - 1e-9) * 10;

/**
 * Diseño completo para una tira impresa: `centersMm` son los centros de los fotogramas a lo largo de la tira y `stripMm`
 * su largo. Las colas alcanzan para llegar de la ventana a cada núcleo y dejar ahí `tailTurns` vueltas con la película en
 * el extremo contrario.
 */
export function designReels(spec: ReelsSpec, centersMm: number[], stripMm: number, thicknessMm: number): ReelsDesign {
  const coreR = spec.coreDiameterMm / 2;
  const wrapMinMm = spec.tailTurns * 2 * Math.PI * coreR + TAIL_ANCHOR_MM;
  const c0 = centersMm[0] ?? 0;
  const cN = centersMm[centersMm.length - 1] ?? c0;
  // lo más enrollado en un tambor es (cN − c0) + la cola mínima; las colas redondeadas suman hasta 10 mm
  const fullGuess = woundRadius(coreR, cN - c0 + wrapMinMm + 10, thicknessMm);
  const midR = (coreR + fullGuess) / 2;
  const geometry = reelsGeometry(spec, midR);
  const path = openPath(reelCircles(geometry, midR, midR));
  const gateMm = path.gateMm;
  const Lp = path.lengthMm;
  const tail1Mm = ceil10(wrapMinMm + Lp - gateMm - c0);
  const tail2Mm = ceil10(wrapMinMm + gateMm + cN - stripMm);
  const phiMin = gateMm + c0;
  const phiMax = gateMm + cN;
  const maxWoundMm = Math.max(phiMax - Lp + tail1Mm, stripMm + tail2Mm - phiMin);
  return { spec, geometry, thicknessMm, path, gateMm, tail1Mm, tail2Mm, wrapMinMm, stripMm, totalMm: tail1Mm + stripMm + tail2Mm, phiMin, phiMax, centers: centersMm.map((c) => gateMm + c), maxWoundMm, fullR: woundRadius(coreR, maxWoundMm, thicknessMm), midR };
}

export interface ReelPose {
  /** película en cada tambor (mm), sus radios y cuánto han girado desde el núcleo vacío (rad) */
  on1: number;
  on2: number;
  r1: number;
  r2: number;
  turn1: number;
  turn2: number;
}

/** cuánta película hay en cada tambor para una posición φ */
export function reelPose(d: ReelsDesign, phiMm: number): ReelPose {
  const on1 = Math.max(0, phiMm - d.path.lengthMm + d.tail1Mm);
  const on2 = Math.max(0, d.stripMm + d.tail2Mm - phiMm);
  const r0 = d.geometry.coreR;
  return { on1, on2, r1: woundRadius(r0, on1, d.thicknessMm), r2: woundRadius(r0, on2, d.thicknessMm), turn1: woundAngle(r0, on1, d.thicknessMm), turn2: woundAngle(r0, on2, d.thicknessMm) };
}

/** rpm de un tambor de radio r con la película a v (mm/s) */
export const reelRpm = (vMmS: number, r: number) => (Math.abs(vMmS) / (2 * Math.PI * Math.max(1e-6, r))) * 60;

/**
 * Recorrido de este instante, con los radios reales y el brazo tensor girado, anclado en la ventana: un punto de la
 * tira con coordenada σ cae en s = gate + (φ − gateMm − σ), así que el fotograma de la ventana queda donde lo pone el
 * modelo y los extremos absorben el cambio de radio.
 */
export function livePath(d: ReelsDesign, phiMm: number, dancerRad = 0): { path: OpenPath; pose: ReelPose; at: (sigma: number) => PathPoint } {
  const pose = reelPose(d, phiMm);
  const path = openPath(reelCircles(d.geometry, pose.r2, pose.r1, dancerRad));
  const shift = path.gateMm - d.gateMm;
  return { path, pose, at: (sigma: number) => openPointAt(path, phiMm - sigma + shift) };
}

// --- velocidad, luz y par ---------------------------------------------------------------------------------------------

/** fotogramas por segundo para una distancia de mano (mm); sin mano o más lejos que el primer punto, 0 */
export function handFps(distanceMm: number | null, map: [number, number][]): number {
  if (distanceMm === null || !map.length) return 0;
  const pts = [...map].sort((a, b) => b[0] - a[0]);
  if (distanceMm > pts[0][0]) return 0;
  const near = pts[pts.length - 1];
  if (distanceMm <= near[0]) return near[1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [d0, f0] = pts[i];
    const [d1, f1] = pts[i + 1];
    if (distanceMm <= d0 && distanceMm >= d1) return d0 === d1 ? f1 : f0 + ((d0 - distanceMm) / (d0 - d1)) * (f1 - f0);
  }
  return 0;
}

/** distancia más lejana a la que cuenta una mano (mm) */
export const handRangeMm = (map: [number, number][]) => Math.max(...map.map((m) => m[0]));
export const fpsRange = (map: [number, number][]) => ({ min: Math.min(...map.map((m) => m[1])), max: Math.max(...map.map((m) => m[1])) });

/** duración del destello (s) a la velocidad v: el corrimiento no pasa de maxBlur; a poca velocidad, el de la mínima */
export function reelPulseS(vMmS: number, c: ReelControlSpec, pitchMm: number): number {
  const maxS = c.maxBlurMm / Math.max(1e-6, fpsRange(c.speedMap).min * pitchMm);
  const v = Math.abs(vMmS);
  return v > 1e-6 ? Math.min(maxS, c.maxBlurMm / v) : maxS;
}

/** fracción del tiempo con luz: maxBlur / paso, la misma a cualquier velocidad de la tabla */
export const reelDuty = (c: ReelControlSpec, pitchMm: number) => c.maxBlurMm / pitchMm;

/** pulso con la película quieta: la misma luz promedio repartida en stillHz (s) */
export const stillPulseS = (c: ReelControlSpec, pitchMm: number) => reelDuty(c, pitchMm) / c.stillHz;

/** fricción supuesta por rodamiento 608 (N·mm), la misma estimación que el loop */
const BEARING_DRAG_NMM = 3;

/**
 * Par de cada motor: el que jala sostiene la tensión en el radio del tambor lleno, más dos rodamientos y la inercia del
 * tambor con su película a la aceleración máxima. Las rpm más altas son las del núcleo vacío a la velocidad máxima.
 */
export function reelTorque(transport: TransportSpec, d: ReelsDesign, control: ReelControlSpec, pitchMm: number, stripWidthMm: number): TorqueReport & { inertiaNcm: number; tensionNcm: number } {
  const m = motorOf(transport);
  const vMax = fpsRange(control.speedMap).max * pitchMm;
  const rpm = reelRpm(vMax, d.geometry.coreR);
  const tensionNcm = (transport.tensionN * d.fullR) / 10;
  // tambor impreso de unos 90 g con giro de 50 mm, y la película (1,38 g/cm³) en el radio lleno
  const filmKg = (d.maxWoundMm * stripWidthMm * d.thicknessMm * 1.38e-6) / 1000;
  const inertia = 0.09 * 0.05 ** 2 + filmKg * (d.fullR / 1000) ** 2;
  const inertiaNcm = ((inertia * (control.accelMmS2 / 1000)) / (d.geometry.coreR / 1000)) * 100;
  const rollerTorque = tensionNcm + (2 * BEARING_DRAG_NMM) / 10 + inertiaNcm;
  const available = motorTorqueAtRpm(m, rpm);
  const warnings: string[] = [];
  if (rpm > m.maxRpm) warnings.push(`${m.label}: ${rpm.toFixed(0)} rpm a la velocidad máxima supera su máximo práctico (${m.maxRpm} rpm). Baja la velocidad máxima de la tabla.`);
  if (available < rollerTorque) warnings.push(`Par insuficiente en los tambores: hacen falta ${rollerTorque.toFixed(1)} N·cm y el motor da ${available.toFixed(1)} N·cm a ${rpm.toFixed(0)} rpm. Baja la velocidad máxima o la tensión.`);
  if (m.type === 'stepper' && rpm > 205) warnings.push('Un paso a paso por encima de ~200 rpm pierde par con rapidez y puede saltar pasos: baja la velocidad máxima de la tabla.');
  return { rollerTorqueNcm: rollerTorque, motorTorqueNcm: rollerTorque, availableNcm: available, motorRpm: rpm, maxRpm: m.maxRpm, margin: available / Math.max(1e-6, rollerTorque), ok: warnings.length === 0, warnings, inertiaNcm, tensionNcm };
}

// --- programa del ESP32 ------------------------------------------------------------------------------------------------

export interface HandInput {
  /** hay una mano sobre el sensor */
  present: boolean;
  /** distancia de la mano a la cara del sensor (mm) */
  distanceMm: number;
}

export type ReelState = 'quieta' | 'hacia el tambor 1' | 'hacia el tambor 2' | 'frenando' | 'al final' | 'regresa sola' | 'invita';

export interface ReelLive {
  phiMm: number;
  /** velocidad con signo (mm/s): + hacia el tambor 1 */
  vMmS: number;
  aMmS2: number;
  /** mano que manda: 0 la del tambor 1, 1 la del tambor 2 */
  owner: 0 | 1 | null;
  /** lecturas filtradas (mm) y cuánto lleva cada mano (s) */
  sensed: [number | null, number | null];
  presentS: [number, number];
  /** la mano que llevó la película al extremo deja de contar con «regresa sola» hasta que se retira */
  ignored: [boolean, boolean];
  /** fotograma donde se va a detener */
  stopPhi: number | null;
  idleS: number;
  /** quieta en un extremo: 0 el del tambor 1, 1 el del tambor 2 */
  atEnd: 0 | 1 | null;
  endS: number;
  /** marcha sola: +1 hacia el tambor 1, −1 hacia el tambor 2 */
  auto: 1 | -1 | 0;
  autoKind: 'return' | 'attract' | null;
  /** la última marcha la dio una mano (con «regresa sola», solo entonces regresa) */
  byHand: boolean;
  /** quieta con un fotograma centrado: el LED pulsa a stillHz */
  still: boolean;
  state: ReelState;
}

export interface ReelBounds {
  phiMin: number;
  phiMax: number;
  /** φ de cada fotograma centrado, de menor a mayor */
  centers: number[];
}

/**
 * El programa de la propuesta: lee las dos manos, decide cuál manda, convierte la distancia en velocidad con rampa,
 * frena antes del final y, sin manos, se detiene con un fotograma centrado. Avanza en pasos de unos 2 ms.
 */
export class ReelController {
  live: ReelLive;

  constructor(
    public bounds: ReelBounds,
    public control: ReelControlSpec,
    public sensor: HandSensor,
    phi0 = bounds.phiMin,
  ) {
    this.live = ReelController.rest(phi0);
  }

  static rest(phi: number): ReelLive {
    return { phiMm: phi, vMmS: 0, aMmS2: 0, owner: null, sensed: [null, null], presentS: [0, 0], ignored: [false, false], stopPhi: phi, idleS: 0, atEnd: null, endS: 0, auto: 0, autoKind: null, byHand: false, still: true, state: 'quieta' };
  }

  reset(phi = this.bounds.phiMin): void {
    this.live = ReelController.rest(this.nearestCenter(phi));
  }

  nearestCenter(phi: number): number {
    const c = this.bounds.centers;
    if (!c.length) return phi;
    let best = c[0];
    for (const x of c) if (Math.abs(x - phi) < Math.abs(best - phi)) best = x;
    return best;
  }

  /** el primer fotograma en el sentido de la marcha que deja frenar con la aceleración máxima */
  stopTarget(phi: number, v: number): number {
    const c = this.bounds.centers;
    if (!c.length) return phi;
    if (Math.abs(v) < 1e-6) return this.nearestCenter(phi);
    const dMin = (v * v) / (2 * this.control.accelMmS2);
    if (v > 0) {
      for (const x of c) if (x - phi >= dMin - 1e-6) return x;
      return this.bounds.phiMax;
    }
    for (let i = c.length - 1; i >= 0; i--) if (phi - c[i] >= dMin - 1e-6) return c[i];
    return this.bounds.phiMin;
  }

  step(dt: number, hands: [HandInput, HandInput], pitchMm: number): ReelLive {
    const c = this.control;
    const L = this.live;
    const a = c.accelMmS2;
    const range = handRangeMm(c.speedMap);
    // 1. sensores: lectura válida dentro del alcance, filtrada
    for (const i of [0, 1] as const) {
      const h = hands[i];
      const raw = h.present && h.distanceMm >= this.sensor.minMm && h.distanceMm <= Math.min(range, this.sensor.maxMm) ? h.distanceMm : null;
      if (raw === null) {
        L.sensed[i] = null;
        L.presentS[i] = 0;
        L.ignored[i] = false;
      } else {
        const prev = L.sensed[i];
        L.sensed[i] = prev === null ? raw : prev + (raw - prev) * (1 - Math.exp((-dt * 1000) / Math.max(1, c.filterMs)));
        L.presentS[i] += dt;
      }
    }
    const active = ([0, 1] as const).filter((i) => L.sensed[i] !== null && L.presentS[i] * 1000 >= c.dwellMs && !L.ignored[i]);
    // 2. quién manda
    let owner: 0 | 1 | null = null;
    if (active.length === 1) owner = active[0];
    else if (active.length === 2 && c.twoHands !== 'stop') {
      const cur = L.owner !== null && active.includes(L.owner) ? L.owner : null;
      if (c.twoHands === 'first') owner = cur ?? (L.presentS[0] >= L.presentS[1] ? 0 : 1);
      else {
        const d0 = L.sensed[0]!;
        const d1 = L.sensed[1]!;
        owner = cur === null ? (d0 <= d1 ? 0 : 1) : L.sensed[1 - cur]! < L.sensed[cur]! - 20 ? ((1 - cur) as 0 | 1) : cur;
      }
    }
    const anyHand = L.sensed[0] !== null || L.sensed[1] !== null;
    L.idleS = anyHand ? 0 : L.idleS + dt;
    if (owner !== null) {
      L.auto = 0;
      L.autoKind = null;
    }
    // 3. velocidad deseada: la de la mano, la de la marcha sola, o la curva de frenado al fotograma de paro
    const { phiMin, phiMax } = this.bounds;
    const remF = phiMax - L.phiMm;
    const remB = L.phiMm - phiMin;
    let vT: number | null = null;
    if (owner !== null) vT = (owner === 0 ? 1 : -1) * handFps(L.sensed[owner], c.speedMap) * pitchMm;
    else if (L.auto !== 0) vT = L.auto * (L.autoKind === 'attract' ? c.attractFps : c.returnFps) * pitchMm;
    if (vT !== null && Math.abs(vT) > 1e-9) {
      L.stopPhi = null;
      // frena antes de los extremos para quedar con el primer o el último fotograma centrado
      if (vT > 0) vT = Math.min(vT, Math.sqrt(2 * a * Math.max(0, remF)));
      else vT = Math.max(vT, -Math.sqrt(2 * a * Math.max(0, remB)));
    } else {
      if (L.stopPhi === null) L.stopPhi = this.stopTarget(L.phiMm, L.vMmS);
      const d = L.stopPhi - L.phiMm;
      vT = Math.sign(d) * Math.sqrt(2 * a * Math.abs(d));
    }
    // 4. rampa: aceleración limitada
    const v0 = L.vMmS;
    let v1 = v0 + Math.max(-a * dt, Math.min(a * dt, vT - v0));
    let phi1 = L.phiMm + 0.5 * (v0 + v1) * dt;
    if (phi1 >= phiMax) {
      phi1 = phiMax;
      if (v1 > 0) v1 = 0;
    }
    if (phi1 <= phiMin) {
      phi1 = phiMin;
      if (v1 < 0) v1 = 0;
    }
    if (L.stopPhi !== null && Math.abs(L.stopPhi - phi1) < 0.02 && Math.abs(v1) < 1.5 * a * dt) {
      phi1 = L.stopPhi;
      v1 = 0;
    }
    L.aMmS2 = dt > 0 ? (v1 - v0) / dt : 0;
    L.vMmS = v1;
    L.phiMm = phi1;
    // 5. extremos, marcha sola y cuadro fijo
    const stopped = Math.abs(v1) < 1e-9;
    const atMax = phi1 >= phiMax - 0.02;
    const atMin = phi1 <= phiMin + 0.02;
    L.atEnd = stopped && atMax ? 0 : stopped && atMin ? 1 : null;
    L.endS = L.atEnd !== null ? L.endS + dt : 0;
    if (owner !== null && !stopped) L.byHand = true;
    if (L.auto !== 0) L.byHand = false;
    if (L.auto !== 0 && ((L.auto > 0 && atMax) || (L.auto < 0 && atMin)) && stopped) {
      if (L.autoKind === 'attract') L.auto = L.auto > 0 ? -1 : 1;
      else {
        L.auto = 0;
        L.autoKind = null;
      }
    }
    // «regresa sola»: si una mano la llevó al extremo, al segundo y medio vuelve al otro y ahí se queda
    if (c.atEnd === 'return' && L.atEnd !== null && L.endS >= 1.5 && L.auto === 0 && L.byHand) {
      L.auto = L.atEnd === 0 ? -1 : 1;
      L.autoKind = 'return';
      L.byHand = false;
      if (owner !== null) L.ignored[owner] = true;
      owner = null;
    }
    if (c.idle === 'attract' && L.idleS >= c.idleS && L.auto === 0 && owner === null) {
      L.auto = remF >= remB ? 1 : -1;
      L.autoKind = 'attract';
    }
    L.still = stopped && Math.abs(this.nearestCenter(phi1) - phi1) < 0.05;
    L.owner = owner;
    L.state =
      L.auto !== 0 ? (L.autoKind === 'attract' ? 'invita' : 'regresa sola') : owner !== null && L.atEnd !== null && (owner === 0 ? atMax : atMin) ? 'al final' : owner !== null ? (owner === 0 ? 'hacia el tambor 1' : 'hacia el tambor 2') : !stopped ? 'frenando' : 'quieta';
    return L;
  }
}

/**
 * Destellos de un paso del programa, de φ0 a φ1 en dt. En marcha, cada fotograma que se centra dispara uno de
 * maxBlur / v; sin compensar, en reversa el sensor ve el otro borde de la marca y el destello llega `markAlongMm` antes.
 * Quieta, el LED pulsa a stillHz con la misma luz promedio.
 */
export function reelEvents(o: { t0: number; dt: number; phi0: number; phi1: number; still: boolean; centers: number[]; control: ReelControlSpec; pitchMm: number; markAlongMm: number; led: LedStrobe; rng?: () => number }): ExposureEvent[] {
  const { t0, dt, phi0, phi1, control: c, led } = o;
  const rng = o.rng ?? Math.random;
  const out: ExposureEvent[] = [];
  const flash = (t: number, duration: number, n: number) => ({ t, duration, peak: 1, profile: 'rect' as const, lumens: led.peakLumens, kelvin: led.kelvin, n });
  if (dt <= 0) return out;
  if (o.still) {
    const dur = stillPulseS(c, o.pitchMm);
    for (let n = Math.ceil(t0 * c.stillHz - 1e-9); n / c.stillHz < t0 + dt - 1e-12; n++) out.push({ flash: flash(n / c.stillHz, dur, n), phiMm: phi1, speedMmS: 0 });
    return out;
  }
  const dphi = phi1 - phi0;
  if (Math.abs(dphi) < 1e-9) return out;
  const v = dphi / dt;
  const dur = reelPulseS(v, c, o.pitchMm);
  const edge = v < 0 && !c.compensateMarkEdge ? o.markAlongMm : 0;
  const lo = Math.min(phi0, phi1);
  const hi = Math.max(phi0, phi1);
  o.centers.forEach((center, k) => {
    const trig = center + edge;
    const inside = v > 0 ? trig > lo && trig <= hi : trig >= lo && trig < hi;
    if (!inside) return;
    const tCross = t0 + (trig - phi0) / v;
    const jitter = led.jitterUs > 0 ? gaussian(rng) * led.jitterUs * 1e-6 : 0;
    const start = tCross + led.phaseMs * 1e-3 - dur / 2 + jitter;
    out.push({ flash: flash(start, dur, k), phiMm: trig + v * (start - tCross), speedMmS: v });
  });
  return out.sort((x, y) => x.flash.t - y.flash.t);
}

/**
 * Espacio libre detrás de la ventana para la cabeza del LED (mm): hasta dónde se entra desde la película sin tocar
 * tambores (por sus bridas), guías, el brazo tensor ni otro tramo, y el ancho libre mínimo hasta `probeDepthMm`.
 */
export function reelsClearance(d: ReelsDesign, probeDepthMm = 80): { depthMm: number; widthMm: number } {
  const path = d.path;
  const g = pointAt(path, d.gateMm);
  const circles = path.circles.map((c) => ({ x: c.x, y: c.y, r: c.id === 'reel1' || c.id === 'reel2' ? d.geometry.flangeR : c.r + 2 }));
  const lines = path.segments.filter((x): x is Extract<PathSegment, { kind: 'line' }> => x.kind === 'line' && x !== path.front);
  const cast = (o: Vec2, dir: Vec2) => {
    let best = 5000;
    for (const c of circles) {
      const fx = o.x - c.x;
      const fy = o.y - c.y;
      const b = fx * dir.x + fy * dir.y;
      const cc = fx * fx + fy * fy - c.r * c.r;
      const disc = b * b - cc;
      if (disc < 0) continue;
      const t1 = -b - Math.sqrt(disc);
      const t2 = -b + Math.sqrt(disc);
      if (t1 > 1e-6) best = Math.min(best, t1);
      else if (t2 > 1e-6) best = Math.min(best, cc < 0 ? 0 : t2);
    }
    for (const l of lines) {
      const ex = l.b.x - l.a.x;
      const ey = l.b.y - l.a.y;
      const den = dir.x * ey - dir.y * ex;
      if (Math.abs(den) < 1e-12) continue;
      const ax = l.a.x - o.x;
      const ay = l.a.y - o.y;
      const t = (ax * ey - ay * ex) / den;
      const u = (ax * dir.y - ay * dir.x) / den;
      if (t > 1e-6 && u >= 0 && u <= 1) best = Math.min(best, t);
    }
    return best;
  };
  const inward = { x: -g.normal.x, y: -g.normal.y };
  const depthMm = cast(g.position, inward);
  let widthMm = Infinity;
  for (let dd = 0.5; dd <= Math.min(probeDepthMm, depthMm - 0.5); dd += 1) {
    const q = { x: g.position.x + inward.x * dd, y: g.position.y + inward.y * dd };
    widthMm = Math.min(widthMm, cast(q, g.tangent) + cast(q, { x: -g.tangent.x, y: -g.tangent.y }));
  }
  return { depthMm, widthMm: Number.isFinite(widthMm) ? widthMm : 0 };
}
