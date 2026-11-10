// Estructura de la mesa de dos tambores para cortar con láser y armar sin tornillos (ADR-0012). Todo sale de
// `buildReelsAssembly`: piso y cubierta doble de MDF de 5,5 mm, paredes de acrílico transparente de 3 mm atrapadas en
// ranuras del MDF (para que se vea la electrónica), la tapa trasera de acrílico que se quita con dos cuñas, las torres
// donde se para cada motor, el marco y los topes de la fuente, las tapas, bridas y ventana de acrílico y las piezas de
// prueba para ajustar el encaje. Es puro: lo usan la escena 3D (que
// extruye los mismos contornos), la lista de compras, las pruebas y scripts/fabricar.mjs (que anida y escribe SVG y DXF
// con las herramientas de OMEGA).
//
// Coordenadas de la mesa (mm): x a la derecha, y hacia arriba con la cara de la cubierta en y = 0, z hacia la lente.
// Cada pieza plana vive en su marco local (u, v, w): el contorno en (u, v) y el espesor en w ∈ [0, t]; el punto de la
// mesa es o + u·U + v·V + w·N. La cara w = t es la que mira al láser en la hoja: ahí van los rótulos, siempre en una
// cara que no se ve con la mesa armada.
import { circlePolygon, normalizeProfile, perimeter, profileArea, type Point, type Polygon, type Profile } from '@aminoacid/omega/fabricate';
import type { Derived, Project } from '../core/project';
import { buildReelsAssembly, type ReelsAssembly } from './assembly';
import type { Vec2 } from './path';

export type V3 = [number, number, number];
/** marco de una pieza armada: punto = o + u·U + v·V + w·N, con (U, V, N) ortonormal de mano derecha */
export interface Frame3 {
  o: V3;
  u: V3;
  v: V3;
  n: V3;
}

export type SheetMaterial = 'mdf' | 'acrilico-3' | 'acrilico-negro-3';

export const SHEET_MATERIALS: Record<SheetMaterial, { label: string; short: string; thicknessMm: number; kerfMm: number }> = {
  // el MDF «de 6» que se vende en México mide 5,5 mm; el espesor real de cada pieza va en `LaserPart.thicknessMm`
  mdf: { label: 'MDF de 5,5 mm', short: 'MDF 5,5 mm', thicknessMm: 5.5, kerfMm: 0.2 },
  'acrilico-3': { label: 'acrílico transparente de 3 mm', short: 'Acrílico transparente 3 mm', thicknessMm: 3, kerfMm: 0.15 },
  'acrilico-negro-3': { label: 'acrílico negro de 3 mm', short: 'Acrílico negro 3 mm', thicknessMm: 3, kerfMm: 0.15 },
};

/** grupo de la pieza en el árbol del simulador */
export type PartGroup = 'estructura' | 'transporte' | 'manos' | 'optica';

export interface LaserPart {
  /** código grabado en la pieza: E = MDF, A = acrílico transparente, N = acrílico negro */
  id: string;
  group: PartGroup;
  name: string;
  material: SheetMaterial;
  thicknessMm: number;
  qty: number;
  /** contorno exterior y huecos, en (u, v) */
  profile: Profile;
  /** marcas de grabado vectorial (capa score), en (u, v) */
  marks: Polygon[];
  /** rótulo grabado (por omisión el id) */
  label: string;
  /** una por pieza armada (vacío = pieza de prueba, no va en la mesa) */
  frames: Frame3[];
  step: number;
  /** hacia dónde sale la pieza en la vista explosionada (unitario, marco de la mesa) */
  explode: V3;
  role: string;
  /** además de encajar, se pega */
  glue?: string;
}

export interface AssemblyStep {
  n: number;
  title: string;
  /** pasos para el taller, en orden */
  text: string[];
  /** piezas de corte (E/A/N), impresas (I) y compradas (id de la lista de compras) que entran en este paso */
  parts: string[];
}

export interface ReelsStructure {
  asm: ReelsAssembly;
  parts: LaserPart[];
  steps: AssemblyStep[];
  /** espesor del MDF con el que se dibujaron las ranuras */
  mdfMm: number;
  /** contornos que no salieron como un solo polígono (vacío = todo bien) */
  problems: string[];
}

// --- vectores --------------------------------------------------------------------------------------------------------
const X: V3 = [1, 0, 0];
const Y: V3 = [0, 1, 0];
const Z: V3 = [0, 0, 1];
const neg = (a: V3): V3 => [-a[0], -a[1], -a[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const frame = (o: V3, u: V3, v: V3, n: V3): Frame3 => ({ o, u, v, n });

/** punto de la mesa de unas coordenadas locales */
export function framePoint(f: Frame3, u: number, v: number, w: number): V3 {
  return [0, 1, 2].map((k) => f.o[k] + u * f.u[k] + v * f.v[k] + w * f.n[k]) as V3;
}

/** caja de la mesa (mm) */
interface Box3 {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}
interface R2 {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

/** proyección de una caja de la mesa sobre el plano (u, v) de un marco */
function boxToLocal(f: Frame3, b: Box3): R2 {
  const us: number[] = [];
  const vs: number[] = [];
  for (const x of [b.x0, b.x1])
    for (const y of [b.y0, b.y1])
      for (const z of [b.z0, b.z1]) {
        const d: V3 = [x - f.o[0], y - f.o[1], z - f.o[2]];
        us.push(dot(d, f.u));
        vs.push(dot(d, f.v));
      }
  return { u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs) };
}

/** punto de la mesa sobre el plano de un marco → (u, v) */
function toLocal(f: Frame3, p: V3): Point {
  const d: V3 = [p[0] - f.o[0], p[1] - f.o[1], p[2] - f.o[2]];
  return { x: dot(d, f.u), y: dot(d, f.v) };
}

// --- contorno rectilíneo: unión de rectángulos menos rectángulos ------------------------------------------------------
const key = (x: number, y: number) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;

/**
 * Traza el borde de (∪ add) − (∪ sub) en una rejilla con las coordenadas de todos los rectángulos. Devuelve los anillos
 * con el material a la izquierda: exteriores en sentido antihorario y huecos en horario.
 */
export function traceRects(add: R2[], sub: R2[]): Polygon[] {
  const us = [...new Set([...add, ...sub].flatMap((r) => [r.u0, r.u1]).map((x) => Math.round(x * 1e6) / 1e6))].sort((a, b) => a - b);
  const vs = [...new Set([...add, ...sub].flatMap((r) => [r.v0, r.v1]).map((x) => Math.round(x * 1e6) / 1e6))].sort((a, b) => a - b);
  const nu = us.length - 1;
  const nv = vs.length - 1;
  const inR = (r: R2, u: number, v: number) => u > r.u0 && u < r.u1 && v > r.v0 && v < r.v1;
  const full: boolean[] = [];
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const u = (us[i] + us[i + 1]) / 2;
      const v = (vs[j] + vs[j + 1]) / 2;
      full[i * nv + j] = add.some((r) => inR(r, u, v)) && !sub.some((r) => inR(r, u, v));
    }
  const at = (i: number, j: number) => i >= 0 && j >= 0 && i < nu && j < nv && full[i * nv + j];
  type E = { a: Point; b: Point; used: boolean };
  const edges: E[] = [];
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      if (!at(i, j)) continue;
      const [u0, u1, v0, v1] = [us[i], us[i + 1], vs[j], vs[j + 1]];
      if (!at(i, j - 1)) edges.push({ a: { x: u0, y: v0 }, b: { x: u1, y: v0 }, used: false });
      if (!at(i + 1, j)) edges.push({ a: { x: u1, y: v0 }, b: { x: u1, y: v1 }, used: false });
      if (!at(i, j + 1)) edges.push({ a: { x: u1, y: v1 }, b: { x: u0, y: v1 }, used: false });
      if (!at(i - 1, j)) edges.push({ a: { x: u0, y: v1 }, b: { x: u0, y: v0 }, used: false });
    }
  const from = new Map<string, E[]>();
  for (const e of edges) {
    const k = key(e.a.x, e.a.y);
    const l = from.get(k);
    if (l) l.push(e);
    else from.set(k, [e]);
  }
  const rings: Polygon[] = [];
  for (const e0 of edges) {
    if (e0.used) continue;
    const ring: Point[] = [];
    let e: E | undefined = e0;
    while (e && !e.used) {
      e.used = true;
      ring.push(e.a);
      const cand: E[] = (from.get(key(e.b.x, e.b.y)) ?? []).filter((c) => !c.used);
      if (cand.length > 1) {
        // vértice en pellizco: girar a la derecha separa las dos regiones
        const dx = e.b.x - e.a.x;
        const dy = e.b.y - e.a.y;
        cand.sort((p, q) => turn(dx, dy, q) - turn(dx, dy, p));
      }
      e = cand[0];
    }
    rings.push(simplifyRing(ring));
  }
  return rings;
}
function turn(dx: number, dy: number, c: { a: Point; b: Point }): number {
  // derecha = −1, recto = 0, izquierda = 1
  const ex = c.b.x - c.a.x;
  const ey = c.b.y - c.a.y;
  return Math.sign(dx * ey - dy * ex);
}
function simplifyRing(r: Point[]): Point[] {
  const out: Point[] = [];
  const n = r.length;
  for (let i = 0; i < n; i++) {
    const a = r[(i + n - 1) % n];
    const b = r[i];
    const c = r[(i + 1) % n];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) > 1e-9) out.push(b);
  }
  return out;
}
const ringArea = (r: Point[]) => {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i];
    const b = r[(i + 1) % r.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
};

// --- formas 2D ---------------------------------------------------------------------------------------------------------
const circle = (c: Point, d: number): Polygon => circlePolygon(c.x, c.y, d / 2, Math.max(24, Math.ceil(d * 2.2)));
const rectC = (c: Point, w: number, h: number): Polygon => [
  { x: c.x - w / 2, y: c.y - h / 2 },
  { x: c.x + w / 2, y: c.y - h / 2 },
  { x: c.x + w / 2, y: c.y + h / 2 },
  { x: c.x - w / 2, y: c.y + h / 2 },
];
/** ranura redondeada de ancho w entre los centros a y b */
function slot(a: Point, b: Point, w: number): Polygon {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const out: Point[] = [];
  const n = 12;
  for (let k = 0; k <= n; k++) {
    const t = ang - Math.PI / 2 - (Math.PI * k) / n;
    out.push({ x: a.x + (w / 2) * Math.cos(t), y: a.y + (w / 2) * Math.sin(t) });
  }
  for (let k = 0; k <= n; k++) {
    const t = ang + Math.PI / 2 - (Math.PI * k) / n;
    out.push({ x: b.x + (w / 2) * Math.cos(t), y: b.y + (w / 2) * Math.sin(t) });
  }
  return out;
}
const mapPoly = (poly: Polygon, fn: (p: Point) => Point): Polygon => poly.map(fn);

// --- la caja: seis caras con dientes ------------------------------------------------------------------------------------
type FaceKey = 'floor' | 'deck' | 'front' | 'back' | 'left' | 'right';
interface Face {
  key: FaceKey;
  axis: 0 | 1 | 2;
  lo: number;
  hi: number;
  prio: number;
}
const AX = ['x', 'y', 'z'] as const;

/** dientes de unos 25 mm, siempre en número impar: la pieza de más prioridad tiene diente en las dos puntas, junto a su esquina */
function fingerCount(len: number, target = 25): number {
  let n = Math.max(3, Math.round(len / target));
  if (n % 2 === 0) n += 1;
  return n;
}

interface Zone {
  owner: FaceKey;
  box: Box3;
  /** eje de la arista */
  axis: 0 | 1 | 2;
  /** el tramo k-ésimo de la arista (para elegir los dientes de las cuñas) */
  k: number;
  edge: string;
}

function boxFromRanges(r: [number, number][]): Box3 {
  return { x0: r[0][0], x1: r[0][1], y0: r[1][0], y1: r[1][1], z0: r[2][0], z1: r[2][1] };
}

function fingerZones(faces: Face[], ext: [number, number][]): Zone[] {
  const zones: Zone[] = [];
  for (let i = 0; i < faces.length; i++)
    for (let j = i + 1; j < faces.length; j++) {
      const A = faces[i];
      const B = faces[j];
      if (A.axis === B.axis) continue;
      const e = (3 - A.axis - B.axis) as 0 | 1 | 2;
      const ends = faces.filter((f) => f.axis === e).sort((a, b) => a.lo - b.lo);
      const [C1, C2] = ends;
      const range = (lo: number, hi: number): [number, number][] => {
        const r: [number, number][] = [
          [0, 0],
          [0, 0],
          [0, 0],
        ];
        r[A.axis] = [A.lo, A.hi];
        r[B.axis] = [B.lo, B.hi];
        r[e] = [lo, hi];
        return r;
      };
      const best = (...fs: Face[]) => fs.reduce((m, f) => (f.prio > m.prio ? f : m)).key;
      const edge = `${A.key}-${B.key}`;
      zones.push({ owner: best(A, B, C1), box: boxFromRanges(range(ext[e][0], C1.hi)), axis: e, k: -1, edge });
      zones.push({ owner: best(A, B, C2), box: boxFromRanges(range(C2.lo, ext[e][1])), axis: e, k: -2, edge });
      const lo = C1.hi;
      const hi = C2.lo;
      const n = fingerCount(hi - lo);
      const low = A.prio < B.prio ? A.key : B.key;
      const high = A.prio < B.prio ? B.key : A.key;
      // los tramos pares (los de las puntas) son de la pieza de más prioridad: así su esquina no queda suelta
      for (let k = 0; k < n; k++) zones.push({ owner: k % 2 === 0 ? high : low, box: boxFromRanges(range(lo + ((hi - lo) * k) / n, lo + ((hi - lo) * (k + 1)) / n)), axis: e, k, edge });
    }
  return zones;
}

function faceSlab(f: Face, ext: [number, number][]): Box3 {
  const r = ext.map((x) => [...x] as [number, number]);
  r[f.axis] = [f.lo, f.hi];
  return boxFromRanges(r);
}

/** pieza plana: contorno trazado + huecos, ya orientado para los exportadores */
function flat(id: string, name: string, material: SheetMaterial, t: number, fr: Frame3[], outline: { add: R2[]; sub: R2[] }, holes: Polygon[], extra: Partial<LaserPart> & Pick<LaserPart, 'step' | 'explode' | 'role'>, problems: string[]): LaserPart {
  const rings = traceRects(outline.add, outline.sub);
  const outer = rings.filter((r) => ringArea(r) > 0).sort((a, b) => ringArea(b) - ringArea(a));
  if (outer.length !== 1) {
    const bb = (r: Polygon) => `[${Math.min(...r.map((q) => q.x)).toFixed(1)}…${Math.max(...r.map((q) => q.x)).toFixed(1)} × ${Math.min(...r.map((q) => q.y)).toFixed(1)}…${Math.max(...r.map((q) => q.y)).toFixed(1)}]`;
    problems.push(`${id} ${name}: el contorno salió en ${outer.length} piezas ${outer.slice(1).map(bb).join(' ')}`);
  }
  const inner = rings.filter((r) => ringArea(r) < 0);
  const profile = normalizeProfile({ outer: outer[0] ?? [], holes: [...inner, ...holes] });
  return { id, group: 'estructura', name, material, thicknessMm: t, qty: Math.max(1, fr.length), profile, marks: [], label: id, frames: fr, ...extra };
}

/** pieza plana de contorno libre (cuñas, discos) */
function freeform(id: string, name: string, material: SheetMaterial, t: number, fr: Frame3[], outer: Polygon, holes: Polygon[], extra: Partial<LaserPart> & Pick<LaserPart, 'step' | 'explode' | 'role'>): LaserPart {
  return { id, group: 'estructura', name, material, thicknessMm: t, qty: Math.max(1, fr.length), profile: normalizeProfile({ outer, holes }), marks: [], label: id, frames: fr, ...extra };
}

// --- la estructura ---------------------------------------------------------------------------------------------------
export interface StructureOptions {
  /** espesor real del MDF medido con vernier (mm): ranuras y dientes se dibujan con él */
  mdfMm?: number;
  /** espesor real del acrílico transparente (mm): las ranuras del MDF para las paredes */
  acrylicMm?: number;
}

/** holgura total de los dientes entre dos piezas de acrílico (a presión se estrella) */
export const ACRYLIC_PLAY_MM = 0.1;

export function buildReelsStructure(p: Project, d: Derived, opts: StructureOptions = {}): ReelsStructure {
  const a = buildReelsAssembly(p, d, { mdfMm: opts.mdfMm, acrylicMm: opts.acrylicMm });
  const problems: string[] = [];
  const B = a.base;
  const t = B.mdfT;
  const tA = B.acrT;
  const e = B.inset;
  const L = B.layerT;
  const yT = 0;
  const yB = B.bottom;
  const x0 = B.x0;
  const x1 = B.x1;
  const zK = B.z0;
  const zF = B.z1;
  const floorTop = yB + t;
  const deckBottom = yT - 2 * L;
  // la caja de las paredes: piso y cubierta sobresalen `e` al frente y a los lados, así sus ranuras quedan cerradas y las
  // paredes de acrílico no pueden salirse; atrás la tapa trasera queda al ras para poder quitarla
  const wx0 = x0 + e;
  const wx1 = x1 - e;
  const wzF = zF - e;
  const ext: [number, number][] = [
    [wx0, wx1],
    [yB, yT],
    [zK, wzF],
  ];
  const faces: Face[] = [
    { key: 'floor', axis: 1, lo: yB, hi: yB + t, prio: 5 },
    { key: 'deck', axis: 1, lo: deckBottom, hi: yT, prio: 6 },
    { key: 'front', axis: 2, lo: wzF - tA, hi: wzF, prio: 4 },
    { key: 'back', axis: 2, lo: zK, hi: zK + tA, prio: 3 },
    { key: 'left', axis: 0, lo: wx0, hi: wx0 + tA, prio: 2 },
    { key: 'right', axis: 0, lo: wx1 - tA, hi: wx1, prio: 2 },
  ];
  const acrylicFace = (k: FaceKey) => k !== 'floor' && k !== 'deck';
  const zones = fingerZones(faces, ext);
  const faceOf = (k: FaceKey) => faces.find((f) => f.key === k)!;
  const grow = (b: Box3, axis: 0 | 1 | 2, c: number): Box3 => {
    const r: [number, number][] = [
      [b.x0, b.x1],
      [b.y0, b.y1],
      [b.z0, b.z1],
    ];
    r[axis] = [r[axis][0] - c, r[axis][1] + c];
    return boxFromRanges(r);
  };
  /** contorno de una cara: su losa menos lo que es de las otras caras en sus aristas (entre acrílicos, con holgura) */
  const faceOutline = (k: FaceKey, f: Frame3, plus: Box3[] = []) => {
    const F = faceOf(k);
    const slab = faceSlab(F, ext);
    const mine = zones.filter((z) => z.edge.split('-').includes(k) && z.owner !== k);
    const play = (z: Zone) => (z.edge.split('-').every((q) => acrylicFace(q as FaceKey)) ? grow(z.box, z.axis, ACRYLIC_PLAY_MM / 4) : z.box);
    return { add: [boxToLocal(f, slab), ...plus.map((b) => boxToLocal(f, b))], sub: mine.map((z) => boxToLocal(f, play(z))) };
  };
  /** piso y cubierta ocupan toda la huella */
  const footprint = (F: Face): Box3 => ({ x0, x1, y0: F.lo, y1: F.hi, z0: zK, z1: zF });

  // marcos de las caras (los rótulos van en la cara de adentro)
  const fFloor = frame([0, yB, 0], X, neg(Z), Y);
  const fDeckTop = frame([0, yT, 0], X, Z, neg(Y));
  const fDeckLow = frame([0, yT - L, 0], X, Z, neg(Y));
  const fFront = frame([0, 0, wzF], neg(X), Y, neg(Z));
  const fBack = frame([0, 0, zK], X, Y, Z);
  const fLeft = frame([wx0, 0, 0], neg(Z), Y, X);
  const fRight = frame([wx1, 0, 0], Z, Y, neg(X));

  const deckXZ = (f: Frame3) => (q: Vec2): Point => toLocal(f, [q.x, f.o[1], q.y]);
  const floorXZ = (q: Vec2): Point => toLocal(fFloor, [q.x, yB, q.y]);

  // cuñas: dos dientes de la cubierta atraviesan la tapa trasera y salen 14 mm con una ventana para la cuña
  const backEdge = zones.filter((z) => z.edge === 'deck-back' || z.edge === 'back-deck').filter((z) => z.owner === 'deck' && z.k >= 0).sort((p, q) => p.box.x0 - q.box.x0);
  const wedgeTabs = backEdge.length >= 4 ? [backEdge[1], backEdge[backEdge.length - 2]] : backEdge.slice(0, 2);
  const tenonLen = 14;
  const wedgeGap = 7;
  const tenons: Box3[] = wedgeTabs.map((z) => ({ ...z.box, z0: zK - tenonLen, z1: zK }));
  const wedgeHoles = wedgeTabs.map((z) => ({ x: (z.box.x0 + z.box.x1) / 2, z0: zK - wedgeGap, z1: zK + 0.5 }));
  const wedgeT = t + 0.4;

  // --- E01 piso -----------------------------------------------------------------------------------------------------
  const floorHoles: Polygon[] = [];
  const floorSlot = (cx: number, cz: number, wx: number, wz: number) => floorHoles.push(mapPoly(rectC({ x: cx, y: cz }, wx, wz), (q) => floorXZ({ x: q.x, y: q.y })));
  const tabZ = [-18, 18];
  for (const tw of a.towers) for (const sx of tw.sideX) for (const dz of tabZ) floorSlot(sx, tw.z + dz, t, 8);
  for (const dx of [-39, 39]) floorSlot(dx, (a.psuFrame.z0 + a.psuFrame.z1) / 2, 12, t);
  for (const s of a.psuStops) floorSlot(s.x, s.y, t, 12);
  // ranuras para cinchos de 3,6 mm
  const tie = (x: number, z: number, along: 'x' | 'z') => floorSlot(x, z, along === 'x' ? 4.2 : 2, along === 'x' ? 2 : 4.2);
  for (const m of a.dm542) for (const sx of [-41.25, 41.25]) for (const dz of [-45, 45]) tie(m.x + sx, m.z + dz, 'z');
  for (const [cx, cz] of [
    [-35, -23],
    [35, 23],
  ]) {
    tie(a.expansion.x + cx, a.expansion.y + cz, 'z');
    tie(a.expansion.x + cx + Math.sign(cx) * 5.5, a.expansion.y + cz, 'z');
  }
  a.bucks.forEach((b, i) => {
    const xx = b.x + (i === 0 ? -10 : 10);
    tie(xx, b.z - 14, 'x');
    tie(xx, b.z + 14, 'x');
  });
  tie(a.res10.x, a.res10.y - 14, 'x');
  tie(a.res10.x, a.res10.y + 14, 'x');
  const feet = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: (x0 + x1) / 2 + sx * ((x1 - x0) / 2 - 18), y: (zK + zF) / 2 + sz * ((zF - zK) / 2 - 18) })));
  const floor = flat('E01', 'Piso', 'mdf', t, [fFloor], faceOutline('floor', fFloor, [footprint(faceOf('floor'))]), floorHoles, { step: 1, explode: [0, -1, 0], role: 'Base de todo: en sus ranuras entran las paredes de acrílico, las torres de los motores, el marco y los topes de la fuente; los cinchos de los drivers y de las tarjetas pasan por sus ranuras chicas. Sobresale 8 mm de las paredes al frente y a los lados' }, problems);
  floor.marks = feet.map((q) => mapPoly(circle(q, 16), (r) => floorXZ({ x: r.x, y: r.y })));

  // --- A01–A03 paredes de acrílico y A04 tapa trasera ------------------------------------------------------------------
  const wallRole = 'Transparente para que se vea la electrónica. Sus pestañas entran en ranuras cerradas del piso y de la cubierta, que la atrapan: no lleva tornillos ni pegamento. Con las otras paredes encaja con 0,1 mm de holgura (el acrílico a presión se estrella)';
  const front = flat('A01', 'Frente', 'acrilico-3', tA, [fFront], faceOutline('front', fFront), [], { step: 4, explode: [0, 0, 1], role: `Pared del lado de la lente. ${wallRole}` }, problems);
  const left = flat('A02', 'Costado izquierdo', 'acrilico-3', tA, [fLeft], faceOutline('left', fLeft), [], { step: 4, explode: [-1, 0, 0], role: `Pared del lado del tambor 1. ${wallRole}` }, problems);
  const right = flat('A03', 'Costado derecho', 'acrilico-3', tA, [fRight], faceOutline('right', fRight), [], { step: 4, explode: [1, 0, 0], role: `Pared del lado del tambor 2 y del brazo tensor. ${wallRole}` }, problems);
  const backHoles: Polygon[] = [];
  const backXY = (x: number, y: number): Point => toLocal(fBack, [x, y, zK]);
  // dos agujeros para jalarla con los dedos (a los lados de la fuente, donde adentro no hay nada), entrada del cable de
  // CA con amarre y ventilas detrás de la fuente
  for (const sx of [-1, 1]) backHoles.push(mapPoly(circle({ x: sx * 150, y: -62 }, 24), (q) => backXY(q.x, q.y)));
  backHoles.push(mapPoly(circle({ x: 112, y: -100 }, 8), (q) => backXY(q.x, q.y)));
  for (const yy of [-110, -90]) backHoles.push(mapPoly(rectC({ x: 124, y: yy }, 4.2, 2), (q) => backXY(q.x, q.y)));
  for (let k = 0; k < 9; k++) backHoles.push(mapPoly(slot({ x: -80 + k * 20, y: -90 }, { x: -80 + k * 20, y: -45 }, 4), (q) => backXY(q.x, q.y)));
  const back = flat('A04', 'Tapa trasera', 'acrilico-3', tA, [fBack], faceOutline('back', fBack), backHoles, { step: 12, explode: [0, 0, -1], role: 'Transparente y removible: entra en los dientes del piso, de los costados y de la cubierta, y la sujetan dos cuñas. Se quita para llegar a la electrónica' }, problems);

  // --- E02 cubierta (capa de arriba) y E03 contracubierta (capa de abajo) ------------------------------------------------
  const posts = a.covers.flatMap((c) => c.posts.map((q, k) => ({ q, hollow: k === c.hollow })));
  const deckCommon = (f: Frame3): Polygon[] => {
    const at = deckXZ(f);
    const h: Polygon[] = [];
    for (const g of a.guides) h.push(circle(at(g), 7.9));
    for (const s of posts) h.push(circle(at(s.q), s.hollow ? 12.2 : 8.1));
    h.push(circle(at(a.bundle), 20));
    h.push(mapPoly(rectC({ x: a.gate.x, y: (a.gate.plateZ[0] + a.gate.plateZ[1]) / 2 }, 40.2, a.gate.plateZ[1] - a.gate.plateZ[0] + 0.2), at));
    for (const q of a.ledPegs) h.push(circle(at(q), 6.2));
    h.push(mapPoly(rectC(a.f249Peg, 6.2, 6.2), at));
    for (const q of a.lensPegs) h.push(mapPoly(slot({ x: q.x, y: q.y - 3 }, { x: q.x, y: q.y + 3 }, 6.2), at));
    for (const w of wedgeHoles) h.push(mapPoly(rectC({ x: w.x, y: (w.z0 + w.z1) / 2 }, wedgeT, w.z1 - w.z0), at));
    return h;
  };
  const topHoles = deckCommon(fDeckTop);
  for (const q of a.reels) topHoles.push(circle(deckXZ(fDeckTop)(q), 22.0));
  topHoles.push(mapPoly(a.pivotStack.pocket, deckXZ(fDeckTop)));
  const deckTop = flat('E02', 'Cubierta (capa de arriba)', 'mdf', t, [fDeckTop], faceOutline('deck', fDeckTop, [footprint(faceOf('deck')), ...tenons]), topHoles, { step: 5, explode: [0, 1, 0], role: 'Lleva los dos 608 de los tambores, los ejes de las guías y el hueco donde gira el brazo tensor; todo lo de arriba se posiciona con ella', glue: 'Cola blanca en toda la cara de abajo, con los 608 ya puestos: queda pegada a la contracubierta' }, problems);
  const lowHoles = deckCommon(fDeckLow);
  const atLow = deckXZ(fDeckLow);
  for (const q of a.reels) lowHoles.push(circle(atLow(q), 19.5));
  lowHoles.push(circle(atLow(a.pivot), 22.0));
  lowHoles.push(circle(atLow(a.pivotStack.anchor), 5.0));
  for (const q of cupPegs(a)) lowHoles.push(circle(atLow(q), 5.2));
  for (const tw of a.towers) for (const sx of tw.sideX) for (const dz of tabZ) lowHoles.push(mapPoly(rectC({ x: sx, y: tw.z + dz }, t, 8), atLow));
  for (const dx of [-39, 39]) lowHoles.push(mapPoly(rectC({ x: dx, y: (a.psuFrame.z0 + a.psuFrame.z1) / 2 }, 12, t), atLow));
  const deckLow = flat('E03', 'Contracubierta (capa de abajo)', 'mdf', t, [fDeckLow], faceOutline('deck', fDeckLow, [footprint(faceOf('deck')), ...tenons]), lowHoles, { step: 5, explode: [0, 1, 0], role: 'Le hace tope a los 608 de la capa de arriba, lleva el 608 de arriba del pivote y recibe las pestañas de las paredes, las torres y el marco de la fuente' }, problems);

  // --- E04 costados de las torres, E05 collares y E06 placas del segundo 608 ---------------------------------------------
  const tw0 = a.towers[0];
  const halfZ = (tw0.z1 - tw0.z0) / 2;
  const sideFrames = a.towers.flatMap((tw) => tw.sideX.map((sx) => frame([sx - t / 2, 0, tw.z], neg(Z), Y, X)));
  const sideLocal = frame([0, 0, 0], neg(Z), Y, X);
  const sb = (z0: number, z1: number, y0: number, y1: number) => boxToLocal(sideLocal, { x0: 0, x1: t, y0, y1, z0, z1 });
  const sideAdd = [sb(-halfZ, halfZ, floorTop, deckBottom), ...tabZ.flatMap((dz) => [sb(dz - 4, dz + 4, floorTop - t, floorTop), sb(dz - 4, dz + 4, deckBottom, deckBottom + L)])];
  const sideSub = [sb(-12, 12, floorTop, floorTop + 18), ...tabZ.flatMap((dz) => [sb(dz - 4, dz + 4, tw0.collarY[0], tw0.collarY[1]), sb(dz - 4, dz + 4, tw0.bearingY[0], tw0.bearingY[1])])];
  const towerSide = flat('E04', 'Costado de torre', 'mdf', t, sideFrames, { add: sideAdd, sub: sideSub }, [], { step: 1, explode: [0, 1, 0], role: 'Cuatro iguales: dos por motor. Abajo entran en el piso, arriba en la contracubierta; sostienen el collar del motor y la placa del segundo 608. La muesca de abajo deja salir el conector del motor' }, problems);
  const plateLocal = (y1: number) => frame([0, y1, 0], X, Z, neg(Y));
  const plateOutline = (y0: number, y1: number) => {
    const f = plateLocal(y1);
    const pb = (bx0: number, bx1: number, bz0: number, bz1: number) => boxToLocal(f, { x0: bx0, x1: bx1, y0, y1, z0: bz0, z1: bz1 });
    const inner = 31 - t / 2;
    return { add: [pb(-inner, inner, -halfZ, halfZ), ...tabZ.flatMap((dz) => [pb(-inner - t, -inner, dz - 4, dz + 4), pb(inner, inner + t, dz - 4, dz + 4)])], sub: [] };
  };
  const collarFrames = a.towers.map((tw) => frame([tw.x, tw.collarY[1], tw.z], X, Z, neg(Y)));
  const collar = flat('E05', 'Collar del motor', 'mdf', t, collarFrames, plateOutline(tw0.collarY[0], tw0.collarY[1]), [rectC({ x: 0, y: 0 }, 42.6, 42.6)], { step: 1, explode: [0, 1, 0], role: 'El cuerpo del motor entra en su hueco cuadrado de 42,6 mm: no gira ni se mueve. Forrar el hueco con cinta de espuma si queda juego' }, problems);
  const bearingFrames = a.towers.map((tw) => frame([tw.x, tw.bearingY[1], tw.z], X, Z, neg(Y)));
  const bearingPlate = flat('E06', 'Placa del segundo 608', 'mdf', t, bearingFrames, plateOutline(tw0.bearingY[0], tw0.bearingY[1]), [circle({ x: 0, y: 0 }, 22.0)], { step: 2, explode: [0, 1, 0], role: 'Lleva el segundo 608 del eje del tambor, 25 mm abajo del de la cubierta: el tambor no cabecea' }, problems);

  // --- E07 marco y E08 topes de la fuente ---------------------------------------------------------------------------------
  const fPsu = frame([0, 0, a.psuFrame.z0], X, Y, Z);
  const pf = (bx0: number, bx1: number, by0: number, by1: number) => boxToLocal(fPsu, { x0: bx0, x1: bx1, y0: by0, y1: by1, z0: a.psuFrame.z0, z1: a.psuFrame.z1 });
  const psuFrame = flat('E07', 'Marco de la fuente', 'mdf', t, [fPsu], { add: [pf(a.psuFrame.x0, a.psuFrame.x1, floorTop, deckBottom), ...[-39, 39].flatMap((dx) => [pf(dx - 6, dx + 6, floorTop - t, floorTop), pf(dx - 6, dx + 6, deckBottom, deckBottom + L)])], sub: [pf(-48, 48, floorTop + 12, deckBottom - 10)] }, [], { step: 1, explode: [0, 1, 0], role: 'La fuente se para detrás de él, contra la tapa trasera; por la ventana se ven sus bornes' }, problems);
  const stopFrames = a.psuStops.map((s) => frame([s.x - t / 2, 0, s.y], neg(Z), Y, X));
  const stopL = frame([0, 0, 0], neg(Z), Y, X);
  const st = (z0: number, z1: number, y0: number, y1: number) => boxToLocal(stopL, { x0: 0, x1: t, y0, y1, z0, z1 });
  const psuStop = flat('E08', 'Tope de la fuente', 'mdf', t, stopFrames, { add: [st(-15, 15, floorTop, floorTop + 20), st(-6, 6, floorTop - t, floorTop)], sub: [] }, [], { step: 1, explode: [0, 1, 0], role: 'Dos: no dejan que la fuente se corra de lado' }, problems);

  // --- E09 cuñas ----------------------------------------------------------------------------------------------------------
  // la cuña baja por la ventana del diente y se atora contra la cara de afuera de la tapa trasera a media cubierta
  const wedgeOuter: Polygon = [
    { x: -2.5, y: 0 },
    { x: 2.5, y: 0 },
    { x: 4, y: 34 },
    { x: 8, y: 34 },
    { x: 8, y: 46 },
    { x: -8, y: 46 },
    { x: -8, y: 34 },
    { x: -4, y: 34 },
  ];
  const wedgeJam = 22.7;
  const wedgeFrames = wedgeHoles.map((w) => frame([w.x - t / 2, -L - wedgeJam, (w.z0 + zK) / 2], neg(Z), Y, X));
  const wedges = freeform('E09', 'Cuña', 'mdf', t, wedgeFrames, wedgeOuter, [circle({ x: 0, y: 40.5 }, 5)], { step: 12, explode: [0, 1, 0], role: 'Dos (y dos de repuesto): entran por las ventanas de los dientes de la cubierta y aprietan la tapa trasera. Se sacan jalando de la cabeza' });
  wedges.qty = 4;

  // --- E10 pieza de prueba de MDF ------------------------------------------------------------------------------------------
  // dos filas de ranuras: para el MDF (torres, marco) y para el acrílico de las paredes; marcas de 1 a 5 rayas debajo
  const testHoles: Polygon[] = [];
  const fits = [-0.3, -0.15, 0, 0.15, 0.3];
  fits.forEach((df, k) => testHoles.push(rectC({ x: 10 + k * 16, y: 22 }, t + df, 12)));
  fits.forEach((df, k) => testHoles.push(rectC({ x: 10 + k * 16, y: 44 }, tA + df, 12)));
  [21.9, 22.0, 22.1].forEach((dd, k) => testHoles.push(circle({ x: 16 + k * 28, y: 68 }, dd)));
  [7.8, 7.9, 8.0].forEach((dd, k) => testHoles.push(circle({ x: 92, y: 14 + k * 14 }, dd)));
  const n1 = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
  const testPlate = freeform('E10', 'Pieza de prueba (ranuras, 608 y eje)', 'mdf', t, [], rectC({ x: 50, y: 41 }, 100, 82), testHoles, { step: 0, explode: [0, 0, 0], role: `Se corta primero. La llave E11 (MDF) va de canto en la fila de abajo y la A11 (acrílico) en la de en medio: se elige la ranura que entra justa. Con un 608 se prueba el barreno del rodamiento y con el eje el de 8 mm. Si la buena no es la del centro (${n1(t)} y ${n1(tA)} mm, 22,0 y 7,9 mm), se regeneran los archivos con lo medido` });
  testPlate.qty = 1;
  // la ranura k lleva k + 1 rayitas de 3 mm en el hueco libre de su lado (entre las filas o junto al borde), sin tocar
  // ninguna ranura: las filas quedan a 22 mm y las ranuras miden 12, así que sobran 10 mm entre una fila y otra
  testPlate.marks = [22, 44].flatMap((yy) => fits.flatMap((_, k) => Array.from({ length: k + 1 }, (_, j) => rectC({ x: 10 + k * 16 + (j - k / 2) * 1.6, y: yy - 11 }, 0.6, 3))));
  const testKey = freeform('E11', 'Llave de prueba (MDF)', 'mdf', t, [], rectC({ x: 0, y: 0 }, 30, 12), [], { step: 0, explode: [0, 0, 0], role: 'Tira del mismo MDF: se mete de canto en las ranuras de abajo de la E10' });

  // --- acrílico transparente: tapas y bridas ----------------------------------------------------------------------------
  const cv = a.covers[0];
  const coverHoles: Polygon[] = cv.posts.map((q, k) => circle({ x: q.x - cv.x, y: -(q.y - cv.z) }, k === cv.hollow ? 11.4 : 6.4));
  // capuchón del sensor: dos broches del lado contrario al canal; el canal cierra sobre el poste hueco
  const hq = cv.posts[cv.hollow];
  const toHollow = Math.atan2(-(hq.y - cv.z), hq.x - cv.x);
  for (const q of hoodPins(toHollow)) coverHoles.push(circle(q, 4.2));
  const coverFrames = a.covers.map((c, i) => (i === 0 ? frame([c.x, c.y, c.z], X, neg(Z), Y) : frame([c.x, c.y + 3, c.z], neg(X), neg(Z), neg(Y))));
  const covers = freeform('A05', 'Tapa del tambor', 'acrilico-3', tA, coverFrames, circle({ x: 0, y: 0 }, 2 * cv.r), coverHoles, { step: 10, explode: [0, 1, 0], role: 'Dos iguales: la del tambor 2 va volteada. Encajan a presión en los broches de sus tres postes; el capuchón del sensor y su canal se abrochan encima' });
  const reelFrames = (y0: number) => a.reels.map((q) => frame([q.x, y0, q.y], X, neg(Z), Y));
  const flangeLow = freeform('A06', 'Brida de abajo del tambor', 'acrilico-3', tA, reelFrames(a.flangeLowY - a.flangeT), circle({ x: 0, y: 0 }, 2 * a.flangeR), [circle({ x: 0, y: 0 }, 11.7)], { step: 6, explode: [0, -1, 0], role: 'Entra en el cubo del núcleo impreso y se pega a su orilla con cemento de acrílico o cianoacrilato' });
  const flangeHigh = freeform('A07', 'Brida de arriba del tambor', 'acrilico-3', tA, reelFrames(a.flangeHighY), circle({ x: 0, y: 0 }, 2 * a.flangeR), [circle({ x: 0, y: 0 }, 8.2)], { step: 6, explode: [0, 1, 0], role: 'La centra el eje de 8 mm; se pega a la orilla del núcleo' });
  const guideFrames = a.guides.flatMap((q) => [frame([q.x, a.flangeLowY - a.flangeT, q.y], X, neg(Z), Y), frame([q.x, a.flangeHighY, q.y], X, neg(Z), Y)]);
  const guideFlange = freeform('A08', 'Brida de guía', 'acrilico-3', tA, guideFrames, circle({ x: 0, y: 0 }, 2 * a.R + 4), [circle({ x: 0, y: 0 }, 22.1)], { step: 7, explode: [0, 1, 0], role: 'Cuatro: dos por guía. El 608 atraviesa su barreno y la centra' });
  const dFrames = [frame([a.dancer.x, a.flangeLowY - a.flangeT, a.dancer.y], X, neg(Z), Y), frame([a.dancer.x, a.flangeHighY, a.dancer.y], X, neg(Z), Y)];
  const dancerFlange = freeform('A09', 'Brida del rodillo tensor', 'acrilico-3', tA, dFrames, circle({ x: 0, y: 0 }, 2 * a.dancerR + 4), [circle({ x: 0, y: 0 }, 22.1)], { step: 7, explode: [0, 1, 0], role: 'Dos: igual que las de las guías' });
  const acrylicTest = freeform('A10', 'Pieza de prueba de acrílico', 'acrilico-3', tA, [], rectC({ x: 45, y: 20 }, 90, 40), [6.2, 6.4, 6.6, 11.2, 11.4, 11.6, 22.0, 22.1, 22.2].map((dd, k) => circle({ x: k < 6 ? 8 + k * 13.5 : 18 + (k - 6) * 27, y: k < 6 ? 30 : 12 }, dd)), { step: 0, explode: [0, 0, 0], role: 'Barrenos de los broches de los postes (6,4 y 11,4) y del 608 (22,1) con ±0,2 mm: se prueba con las piezas impresas antes de cortar las tapas' });

  const acrylicKey = freeform('A11', 'Llave de prueba (acrílico)', 'acrilico-3', tA, [], rectC({ x: 0, y: 0 }, 30, 12), [], { step: 0, explode: [0, 0, 0], role: 'Tira del mismo acrílico: se mete de canto en la fila de en medio de la E10 para elegir la ranura de las paredes' });

  // --- acrílico negro: placa de la ventana y sus guías ------------------------------------------------------------------
  const plateFrame = frame([a.gate.x, 0, a.gate.plateZ[0]], X, Y, Z);
  const gp = (bx0: number, bx1: number, by0: number, by1: number): R2 => ({ u0: bx0, u1: bx1, v0: by0, v1: by1 });
  const winY: [number, number] = [a.filmMid - p.optics.gateWidthMm / 2, a.filmMid + p.optics.gateWidthMm / 2];
  const gateTop = a.filmTop + 12;
  const gatePlate = flat('N01', 'Placa de la ventana', 'acrilico-negro-3', 3, [plateFrame], { add: [gp(-30, 30, 0, gateTop), gp(-20, 20, -2 * L, 0)], sub: [gp(-p.optics.gateHeightMm / 2, p.optics.gateHeightMm / 2, winY[0], winY[1])] }, [], { step: 8, explode: [0, 1, 0], role: `Máscara del fotograma de ${p.optics.gateWidthMm} × ${p.optics.gateHeightMm} mm, del lado de la lámpara. Su diente entra 12 mm en la ranura de la cubierta` }, problems);
  const railYs = [a.filmBottom + 0.5, a.filmTop - 3.5];
  const railFrames = railYs.map((y) => frame([a.gate.x, y, a.gate.railZ[0]], X, Y, Z));
  const rails = freeform('N02', 'Guía de la ventana', 'acrilico-negro-3', 3, railFrames, rectC({ x: 0, y: 1.5 }, 60, 3), [], { step: 8, explode: [0, 0, 1], role: 'Dos tiras de 60 × 3 × 3 mm pegadas a la placa: tocan el dorso de la película solo por los márgenes y la dejan plana en el plano de foco. La cara de fábrica (lisa) hacia la película y las puntas redondeadas con lija fina; si rayan, se forran con cinta de PTFE (ADR-0013)', glue: 'Cemento para acrílico (cloroformo) o cianoacrilato' });

  covers.group = 'manos';
  for (const pt of [flangeLow, flangeHigh, guideFlange, dancerFlange]) pt.group = 'transporte';
  gatePlate.group = 'optica';
  rails.group = 'optica';
  const parts = [floor, deckTop, deckLow, towerSide, collar, bearingPlate, psuFrame, psuStop, wedges, testPlate, testKey, front, left, right, back, covers, flangeLow, flangeHigh, guideFlange, dancerFlange, acrylicTest, acrylicKey, gatePlate, rails];
  for (const pt of parts) if (!pt.profile.outer.length) problems.push(`${pt.id} ${pt.name}: sin contorno`);
  return { asm: a, parts, steps: assemblySteps(), mdfMm: t, problems };
}

/** el orden de armado: lo mismo que muestra la vista «Ensamble» y lo que dice docs/FABRICACION-TAMBORES.md */
export function assemblySteps(): AssemblyStep[] {
  return [
    { n: 1, title: 'Piso, torres y marco de la fuente', text: ['Cortar primero las piezas de prueba (E10, E11, A10 y A11) y ajustar si hace falta.', 'Armar cada torre: dos costados E04 con su collar E05 en las ranuras de abajo.', 'Encajar las dos torres, el marco E07 y los dos topes E08 en las ranuras del piso E01.'], parts: ['E01', 'E04', 'E05', 'E07', 'E08'] },
    { n: 2, title: 'Motores, coples y segundo 608', text: ['Bajar cada motor por el collar hasta el piso, con el conector hacia la muesca del costado.', 'Poner el cople en el eje del motor (13 mm de eje dentro del cople) y apretar su prisionero.', 'Meter un 608 a presión en cada placa E06 y encajarla en las ranuras de arriba de la torre: los costados se abren un poco.'], parts: ['motor-17hs8401', 'coupling-5-8', 'E06', 'bearing-608'] },
    { n: 3, title: 'Electrónica en el piso', text: ['La fuente de pie detrás del marco E07, entre los topes.', 'Cada DM542 delante de su motor con dos cinchos; la placa de expansión con el ESP32, los reguladores y la resistencia con un cincho cada uno.', 'La protoboard con su adhesivo. Cablear potencia y señales (ver la vista Electrónica): con las paredes de acrílico todo queda a la vista, así que conviene peinar los cables.'], parts: ['psu-24v-5a', 'driver-dm542', 'esp32-expansion', 'esp32', 'buck-lm2596', 'led-resistor', 'breadboard-kit', 'cable-ties'] },
    { n: 4, title: 'Paredes de acrílico', text: ['Quitar la película protectora de la cara de adentro de cada pared; la de afuera, al final.', 'Encajar el frente A01 y los costados A02 y A03 en las ranuras del piso: las esquinas entran holgadas, no se fuerzan ni se pegan.'], parts: ['A01', 'A02', 'A03'] },
    { n: 5, title: 'Cubierta doble', text: ['Pegar la copa impresa del pivote (I05) bajo la contracubierta E03 con sus tres espigas y epóxico.', 'Bajar la E03 sobre las pestañas de las paredes, las torres y el marco de la fuente: cada una entra en su ranura y las paredes quedan atrapadas.', 'Meter a presión los dos 608 de los tambores en la cubierta E02, poner cola blanca en su cara de abajo y bajarla sobre la E03 con los ejes de las guías como guía; prensar con peso una hora. Las pestañas de acrílico quedan al ras.', 'Meter el 608 de arriba del pivote desde el hueco: apoya en la copa.'], parts: ['E02', 'E03', 'I05', 'bearing-608', 'glue-wood'] },
    { n: 6, title: 'Tambores', text: ['Pegar con epóxico cada núcleo impreso (I01) a su eje de 100 mm, con 2 mm de eje arriba.', 'Pegar la brida de abajo A06 (barreno de 11,7) y la de arriba A07 (8,2) a las orillas del núcleo.', 'Bajar cada tambor por su 608 de la cubierta y el de la torre hasta el cople y apretar el prisionero: el cubo apoya en la pista interior del 608.'], parts: ['I01', 'A06', 'A07', 'shaft-8mm', 'epoxy'] },
    { n: 7, title: 'Guías y brazo tensor', text: ['Pegar con epóxico los ejes de 70 mm de las guías en la cubierta, a plomo.', 'Rondana M8, guía (I02 con dos 608 y sus bridas A08) y tapón I07.', 'Brazo I04 pegado al eje del pivote, eje del rodillo en su casquillo, rodillo I03 con sus 608 y bridas A09, tapón I07.', 'Resorte del brazo a la mitad del brazo y al ancla I15; tapa del imán (I06) en la punta de abajo del eje y el AS5600 en la ranura de la copa.'], parts: ['I02', 'I03', 'I04', 'I06', 'I07', 'I15', 'A08', 'A09', 'washers-m8', 'dancer-spring', 'as5600'] },
    { n: 8, title: 'Ventana, LED, sensor de marcas y lente', text: ['Pegar las dos guías N02 a la placa N01 y encajarla en su ranura.', 'Cabeza del LED (I11) con el disipador, el LED y el tubo del condensador (I12); brazo del sensor de marcas (I14) con el F249.', 'Cuna de la lente (I13) en sus dos ranuras del frente: se corre ±3 mm para enfocar.'], parts: ['N01', 'N02', 'I11', 'I12', 'I13', 'I14', 'led-10w', 'led-heatsink', 'condenser', 'sensor-f249', 'lens-50mm'] },
    { n: 9, title: 'Postes', text: ['Pegar con epóxico las espigas de los cuatro postes (I08) y los dos postes huecos (I09) en la cubierta.', 'Pasar el bus I2C de cada sensor por su poste hueco.'], parts: ['I08', 'I09', 'jumpers-hh'] },
    { n: 10, title: 'Tapas y sensores de mano', text: ['Abrochar cada tapa A05 en sus tres postes (la del tambor 2, volteada).', 'Poner cada VL53L4CD con su tira de pines en ángulo y cubrirlo con su capuchón con canal (I10): el canal tapa los cables hasta el poste hueco.'], parts: ['A05', 'I10', 'hand-sensor', 'pin-headers'] },
    { n: 11, title: 'Película', text: ['Meter la punta de la cola del tambor 1 en la ranura de su núcleo y enrollarla; pasar la película por la guía 1, la ventana, la guía 2 y el rodillo tensor hasta el tambor 2.', 'Con el programa en banco, tensar a 1,5 N y probar las dos manos.'], parts: ['film'] },
    { n: 12, title: 'Tapa trasera y cuñas', text: ['Empujar la tapa trasera A04 sobre los dientes del piso, de los costados y de la cubierta.', 'Bajar las dos cuñas E09 por las ventanas de los dientes de la cubierta hasta que aprieten. Quitar la película protectora de afuera de las paredes.'], parts: ['A04', 'E09'] },
  ];
}

/** espigas de la copa del pivote: tres a 15 mm del eje, del lado contrario a la pared derecha */
export function cupPegs(a: ReelsAssembly): Vec2[] {
  return [Math.PI / 2, Math.PI, -Math.PI / 2].map((t) => ({ x: a.pivot.x + 15 * Math.cos(t), y: a.pivot.y + 15 * Math.sin(t) }));
}

/** broches del capuchón del sensor: los dos del lado contrario al canal, que apunta al poste hueco (marco de la tapa) */
export function hoodPins(toHollow: number): Point[] {
  return [-1, 1].map((s) => ({ x: -15 * Math.cos(toHollow) - s * 15 * Math.sin(toHollow), y: -15 * Math.sin(toHollow) + s * 15 * Math.cos(toHollow) }));
}

// --- resumen para cotizar --------------------------------------------------------------------------------------------
export interface MaterialSummary {
  material: SheetMaterial;
  pieces: number;
  /** área de material (contorno menos huecos) y de las cajas, mm² */
  areaMm2: number;
  bboxAreaMm2: number;
  /** metros de corte (contornos + huecos) y marcas vectoriales */
  cutM: number;
  scoreM: number;
  /** contornos a perforar (uno por anillo) */
  pierces: number;
}

export function structureSummary(s: ReelsStructure): MaterialSummary[] {
  const out = new Map<SheetMaterial, MaterialSummary>();
  for (const p of s.parts) {
    const m = out.get(p.material) ?? { material: p.material, pieces: 0, areaMm2: 0, bboxAreaMm2: 0, cutM: 0, scoreM: 0, pierces: 0 };
    const rings = [p.profile.outer, ...(p.profile.holes ?? [])];
    const xs = p.profile.outer.map((q) => q.x);
    const ys = p.profile.outer.map((q) => q.y);
    m.pieces += p.qty;
    m.areaMm2 += p.qty * profileArea(p.profile);
    m.bboxAreaMm2 += p.qty * (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    m.cutM += (p.qty * rings.reduce((acc, r) => acc + perimeter(r), 0)) / 1000;
    m.scoreM += (p.qty * p.marks.reduce((acc, r) => acc + perimeter(r), 0)) / 1000;
    m.pierces += p.qty * rings.length;
    out.set(p.material, m);
  }
  return [...out.values()];
}
