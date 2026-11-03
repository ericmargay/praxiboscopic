// Recorrido cerrado de la película alrededor de rodillos de radio igual (correa sobre poleas): tramos rectos entre
// puntos de tangencia y arcos sobre cada rodillo. Coordenadas en mm en el plano de la mesa (x, z); la tira va de
// canto (su ancho es vertical, eje y). `s` es la coordenada a lo largo del recorrido, en el sentido de avance.
import { TAU } from '../core/math';

export interface Vec2 {
  x: number;
  y: number;
}

export interface RollerSpec {
  /** centro (mm) en el plano de la mesa */
  x: number;
  y: number;
}

export interface PathSpec {
  rollers: RollerSpec[];
  /** radio de los rodillos (mm), igual para todos */
  rollerRadiusMm: number;
  /** índice del rodillo motriz (conviene el primero después de la ventana: tira de la película a través de ella) */
  driveRoller: number;
  /** índice del rodillo tensor con resorte (conviene el primero después del motriz, en el lado flojo) */
  tensionerRoller?: number;
  /** posición de la ventana óptica a lo largo del recorrido (mm) */
  gateMm: number;
  /** sentido de avance: +1 = antihorario alrededor del polígono de rodillos */
  direction: 1 | -1;
}

export type PathSegment = { kind: 'line'; s0: number; length: number; a: Vec2; b: Vec2; tangent: Vec2; normal: Vec2 } | { kind: 'arc'; s0: number; length: number; center: Vec2; radius: number; angle0: number; sweep: number; roller: number };

export interface PathGeometry {
  segments: PathSegment[];
  lengthMm: number;
  /** longitud recta total (donde puede ir la ventana) */
  straightMm: number;
  /** perímetro del polígono de centros */
  polygonMm: number;
}

export interface PathPoint {
  s: number;
  position: Vec2;
  /** unitario en el sentido de avance */
  tangent: Vec2;
  /** unitario hacia fuera (hacia la cara exterior de la tira) */
  normal: Vec2;
  segment: number;
  onRoller: number | null;
}

export function signedArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * Geometría de la correa alrededor de los rodillos. Los rodillos deben formar un polígono convexo (la película solo
 * toca sus caras exteriores); se recorren en sentido antihorario y la película va por fuera.
 */
export function buildPath(spec: PathSpec): PathGeometry {
  const R = spec.rollerRadiusMm;
  let centers = spec.rollers.map((r) => ({ x: r.x, y: r.y }));
  if (centers.length < 2) throw new Error('Hacen falta al menos dos rodillos');
  if (signedArea(centers) < 0) centers = [...centers].reverse();
  const n = centers.length;
  const segments: PathSegment[] = [];
  let s = 0;
  let polygon = 0;
  let straight = 0;
  // normal exterior de cada lado (hacia fuera del polígono antihorario = a la derecha de la dirección de avance)
  const sideNormal = (i: number): { d: Vec2; nrm: Vec2; len: number } => {
    const a = centers[i];
    const b = centers[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1e-9;
    const d = { x: dx / len, y: dy / len };
    return { d, nrm: { x: d.y, y: -d.x }, len };
  };
  for (let i = 0; i < n; i++) {
    const { d, nrm, len } = sideNormal(i);
    const a = { x: centers[i].x + R * nrm.x, y: centers[i].y + R * nrm.y };
    const b = { x: centers[(i + 1) % n].x + R * nrm.x, y: centers[(i + 1) % n].y + R * nrm.y };
    segments.push({ kind: 'line', s0: s, length: len, a, b, tangent: d, normal: nrm });
    s += len;
    polygon += len;
    straight += len;
    // arco sobre el rodillo i+1: desde la normal de este lado hasta la del siguiente
    const next = sideNormal((i + 1) % n);
    const ang0 = Math.atan2(nrm.y, nrm.x);
    const ang1 = Math.atan2(next.nrm.y, next.nrm.x);
    let sweep = ang1 - ang0;
    while (sweep < 0) sweep += TAU;
    while (sweep >= TAU) sweep -= TAU;
    // para un polígono convexo el giro exterior está en (0, π); si sale ≥ π es cóncavo: lo ignoramos como arco nulo
    if (sweep > Math.PI) sweep = 0;
    const roller = (i + 1) % n;
    segments.push({ kind: 'arc', s0: s, length: R * sweep, center: centers[roller], radius: R, angle0: ang0, sweep, roller });
    s += R * sweep;
  }
  return { segments, lengthMm: s, straightMm: straight, polygonMm: polygon };
}

export function pointAt(geo: PathGeometry, s: number): PathPoint {
  const L = geo.lengthMm;
  let sm = ((s % L) + L) % L;
  for (let i = 0; i < geo.segments.length; i++) {
    const seg = geo.segments[i];
    const isLast = i === geo.segments.length - 1;
    if (sm <= seg.s0 + seg.length + 1e-9 || isLast) {
      const u = seg.length > 0 ? Math.min(1, Math.max(0, (sm - seg.s0) / seg.length)) : 0;
      if (seg.kind === 'line') {
        return { s: sm, position: { x: seg.a.x + (seg.b.x - seg.a.x) * u, y: seg.a.y + (seg.b.y - seg.a.y) * u }, tangent: seg.tangent, normal: seg.normal, segment: i, onRoller: null };
      }
      const ang = seg.angle0 + seg.sweep * u;
      const nrm = { x: Math.cos(ang), y: Math.sin(ang) };
      return { s: sm, position: { x: seg.center.x + seg.radius * nrm.x, y: seg.center.y + seg.radius * nrm.y }, tangent: { x: -nrm.y, y: nrm.x }, normal: nrm, segment: i, onRoller: seg.roller };
    }
  }
  sm = 0;
  const seg = geo.segments[0] as Extract<PathSegment, { kind: 'line' }>;
  return { s: 0, position: seg.a, tangent: seg.tangent, normal: seg.normal, segment: 0, onRoller: null };
}

/** polilínea del recorrido (para dibujar en 2D o construir la malla 3D) */
export function samplePath(geo: PathGeometry, step = 2): PathPoint[] {
  const out: PathPoint[] = [];
  const n = Math.max(8, Math.ceil(geo.lengthMm / step));
  for (let i = 0; i < n; i++) out.push(pointAt(geo, (i * geo.lengthMm) / n));
  return out;
}

/** longitud del recorrido para una disposición rectangular de 4 rodillos */
export function rectangleLoopLength(aMm: number, bMm: number, rollerRadiusMm: number): number {
  return 2 * (aMm + bMm) + TAU * rollerRadiusMm;
}

export interface RectangleDesign {
  aMm: number;
  bMm: number;
  rollerRadiusMm: number;
  lengthMm: number;
  rollers: RollerSpec[];
  /** s de la mitad del primer lado largo (sitio natural de la ventana) */
  gateMm: number;
}

/**
 * Diseña un recorrido rectangular de cuatro rodillos cuya longitud sea exactamente `loopLengthMm`, con la relación
 * de lados pedida (a/b) y rodillos de radio dado. Devuelve centros en mm con el rectángulo centrado en el origen y
 * el lado largo `a` a lo largo de x.
 */
export function designRectangle(loopLengthMm: number, rollerRadiusMm: number, aspect = 2): RectangleDesign {
  const straight = loopLengthMm - TAU * rollerRadiusMm;
  if (straight <= 0) throw new Error(`El loop (${loopLengthMm.toFixed(1)} mm) es más corto que el perímetro de un solo rodillo (${(TAU * rollerRadiusMm).toFixed(1)} mm)`);
  const half = straight / 2; // a + b
  const b = half / (1 + aspect);
  const a = half - b;
  const rollers: RollerSpec[] = [
    { x: -a / 2, y: -b / 2 },
    { x: a / 2, y: -b / 2 },
    { x: a / 2, y: b / 2 },
    { x: -a / 2, y: b / 2 },
  ];
  // el recorrido antihorario empieza en el lado inferior (rodillo 0 → 1), que para la escena es el lado frontal;
  // la ventana va a la mitad del lado superior (lado 2 → 3), lejos del rodillo motriz
  const geo = buildPath({ rollers, rollerRadiusMm, driveRoller: 0, gateMm: 0, direction: 1 });
  const side2 = geo.segments.filter((s) => s.kind === 'line')[2];
  return { aMm: a, bMm: b, rollerRadiusMm, lengthMm: geo.lengthMm, rollers, gateMm: side2.s0 + side2.length / 2 };
}

/**
 * Proporción a/b del rectángulo de rodillos que deja `shortGapMm` de hueco entre los rodillos del lado corto (entre
 * sus superficies, no entre centros). El lado largo se queda con el resto del loop: ahí va la ventana.
 */
export function aspectForShortGap(loopLengthMm: number, rollerRadiusMm: number, shortGapMm: number): number {
  const half = (loopLengthMm - TAU * rollerRadiusMm) / 2; // a + b
  const b = 2 * rollerRadiusMm + shortGapMm;
  const a = half - b;
  if (a <= 0) throw new Error('El loop no alcanza para ese hueco');
  return a / b;
}

/**
 * Espacio libre dentro del loop frente a la ventana, donde van la linterna y el condensador (mm). La película corre por
 * la cara exterior de los rodillos, así que entre el tramo de la ventana y el opuesto hay (separación de centros + 2R).
 * El ancho útil es el hueco entre los rodillos de las esquinas, a lo largo del tramo: (separación de centros − 2R).
 */
export function interiorClearance(spec: PathSpec, geo: PathGeometry): { depthMm: number; widthMm: number } {
  const g = pointAt(geo, spec.gateMm);
  const span = (ax: Vec2) => {
    let min = Infinity;
    let max = -Infinity;
    for (const r of spec.rollers) {
      const d = r.x * ax.x + r.y * ax.y;
      min = Math.min(min, d);
      max = Math.max(max, d);
    }
    return max - min;
  };
  const R = spec.rollerRadiusMm;
  return { depthMm: span(g.normal) + 2 * R, widthMm: Math.max(0, span(g.tangent) - 2 * R) };
}

/** ¿la ventana cae en un tramo recto? (sobre un rodillo la película está curvada y el plano focal no es plano) */
export function gateOnStraight(geo: PathGeometry, gateMm: number, gateHeightMm: number): { ok: boolean; message?: string } {
  const a = pointAt(geo, gateMm - gateHeightMm / 2);
  const b = pointAt(geo, gateMm + gateHeightMm / 2);
  const c = pointAt(geo, gateMm);
  if (a.onRoller !== null || b.onRoller !== null || c.onRoller !== null) return { ok: false, message: 'La ventana óptica cae sobre un rodillo: la película está curvada y no enfoca plana. Mueve la ventana a un tramo recto.' };
  if (a.segment !== b.segment) return { ok: false, message: 'La ventana óptica abarca dos tramos: muévela a la mitad de un lado recto.' };
  return { ok: true };
}
