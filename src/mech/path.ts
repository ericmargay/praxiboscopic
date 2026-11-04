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
  /**
   * lado de cada rodillo respecto al avance: +1 = el rodillo queda a la izquierda y la película lo abraza en sentido
   * antihorario (todos, en un loop convexo); −1 = a la derecha, abrazado en sentido horario (festón). Sin este campo el
   * recorrido se trata como polígono convexo y se ordena en sentido antihorario.
   */
  sides?: (1 | -1)[];
}

export type PathSegment = { kind: 'line'; s0: number; length: number; a: Vec2; b: Vec2; tangent: Vec2; normal: Vec2 } | { kind: 'arc'; s0: number; length: number; center: Vec2; radius: number; angle0: number; sweep: number; roller: number; side: 1 | -1 };

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
 * Geometría de la correa alrededor de los rodillos. Sin `sides`, los rodillos forman un polígono convexo: se recorren
 * en sentido antihorario y la película va por fuera. Con `sides`, cada rodillo se abraza por el lado indicado y el
 * recorrido puede ser cóncavo (festón); entre rodillos de lados opuestos la película cruza por la tangente interior.
 */
export function buildPath(spec: PathSpec): PathGeometry {
  const R = spec.rollerRadiusMm;
  let centers = spec.rollers.map((r) => ({ x: r.x, y: r.y }));
  if (centers.length < 2) throw new Error('Hacen falta al menos dos rodillos');
  const free = !!spec.sides && spec.sides.length === centers.length;
  const sides: (1 | -1)[] = free ? [...spec.sides!] : centers.map(() => 1);
  if (!free && signedArea(centers) < 0) centers = [...centers].reverse();
  const n = centers.length;
  const segments: PathSegment[] = [];
  let s = 0;
  let polygon = 0;
  let straight = 0;
  // tangente común del rodillo i al j: normal unitaria `nrm` (a la derecha del avance) con
  // (c_j − c_i)·nrm = s_i·R − s_j·R; los puntos de contacto son c + s·R·nrm
  const tangentOf = (i: number): { d: Vec2; nrm: Vec2; a: Vec2; b: Vec2; len: number } => {
    const j = (i + 1) % n;
    const ci = centers[i];
    const cj = centers[j];
    const dx = cj.x - ci.x;
    const dy = cj.y - ci.y;
    const L = Math.hypot(dx, dy) || 1e-9;
    const k = sides[i] * R - sides[j] * R;
    const phi = Math.atan2(dy, dx);
    const theta = phi - Math.acos(Math.max(-1, Math.min(1, k / L)));
    const nrm = { x: Math.cos(theta), y: Math.sin(theta) };
    const d = { x: -nrm.y, y: nrm.x };
    const a = { x: ci.x + sides[i] * R * nrm.x, y: ci.y + sides[i] * R * nrm.y };
    const b = { x: cj.x + sides[j] * R * nrm.x, y: cj.y + sides[j] * R * nrm.y };
    return { d, nrm, a, b, len: Math.hypot(b.x - a.x, b.y - a.y) };
  };
  for (let i = 0; i < n; i++) {
    const t = tangentOf(i);
    segments.push({ kind: 'line', s0: s, length: t.len, a: t.a, b: t.b, tangent: t.d, normal: t.nrm });
    s += t.len;
    straight += t.len;
    polygon += Math.hypot(centers[(i + 1) % n].x - centers[i].x, centers[(i + 1) % n].y - centers[i].y);
    // arco sobre el rodillo i+1: del radio de contacto de este tramo al del siguiente
    const roller = (i + 1) % n;
    const side = sides[roller];
    const next = tangentOf(roller);
    const ang0 = Math.atan2(side * t.nrm.y, side * t.nrm.x);
    const ang1 = Math.atan2(side * next.nrm.y, side * next.nrm.x);
    let sweep = side > 0 ? ang1 - ang0 : ang0 - ang1;
    while (sweep < 0) sweep += TAU;
    while (sweep >= TAU) sweep -= TAU;
    // en modo convexo un giro ≥ π indica concavidad: se ignora como arco nulo
    if (!free && sweep > Math.PI) sweep = 0;
    segments.push({ kind: 'arc', s0: s, length: R * sweep, center: centers[roller], radius: R, angle0: ang0, sweep: side * sweep, roller, side });
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
      const rad = { x: Math.cos(ang), y: Math.sin(ang) };
      const sd = seg.side;
      // la normal sigue siendo la de la derecha del avance: hacia fuera del rodillo si se abraza en antihorario
      return { s: sm, position: { x: seg.center.x + seg.radius * rad.x, y: seg.center.y + seg.radius * rad.y }, tangent: { x: -sd * rad.y, y: sd * rad.x }, normal: { x: sd * rad.x, y: sd * rad.y }, segment: i, onRoller: seg.roller };
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
 * Proporción a/b del rectángulo de rodillos cuya huella (rodillos con pestañas de 2 mm) mida `ratio` de ancho por 1 de
 * fondo. Con loops cortos el lado corto no baja de `minShortGapMm` de hueco entre rodillos y la huella sale más alargada.
 */
export function aspectForFootprint(loopLengthMm: number, rollerRadiusMm: number, ratio: number, minShortGapMm = 10): number {
  const half = (loopLengthMm - TAU * rollerRadiusMm) / 2; // a + b
  const c = 2 * rollerRadiusMm + 4;
  const b = Math.max((half - (ratio - 1) * c) / (1 + ratio), 2 * rollerRadiusMm + minShortGapMm);
  const a = half - b;
  if (a <= 0) throw new Error('El loop no alcanza para ese hueco');
  return a / b;
}

/**
 * Qué cara de la película toca cada rodillo. Los rodillos abrazados en sentido antihorario (`sides` +1, todos en un
 * loop convexo) quedan dentro del loop y tocan la cara de la lámpara; los del festón abrazados en sentido horario (−1)
 * tocan la cara de la lente. La película no se tuerce, así que cada cara es la misma en todo el recorrido.
 */
export function rollerFaces(spec: PathSpec): { lampSide: number; lensSide: number } {
  const sides = spec.sides && spec.sides.length === spec.rollers.length ? spec.sides : spec.rollers.map(() => 1);
  const lensSide = sides.filter((s) => s < 0).length;
  return { lampSide: sides.length - lensSide, lensSide };
}

export interface FestoonDesign {
  rollers: RollerSpec[];
  sides: (1 | -1)[];
  rollerRadiusMm: number;
  lengthMm: number;
  /** ventana a la mitad del tramo frontal */
  gateMm: number;
  /** el rodillo de la esquina justo después de la ventana tira de la película */
  driveRoller: number;
  /** un rodillo de la fila trasera del festón, con resorte */
  tensionerRoller: number;
  /** separación entre las dos filas del festón (centros) */
  rowSpanMm: number;
  /** hueco entre el tramo frontal y la fila de rodillos más cercana (para la cabeza del LED) */
  frontGapMm: number;
  /** pasadas del festón (rodillos de la fila cercana a la ventana) */
  passes: number;
}

/**
 * Recorrido en festón (zigzag) para películas largas: dos filas de rodillos escalonados con la película haciendo idas y
 * vueltas entre ellas, más un tramo frontal recto donde va la ventana, con dos rodillos de esquina. `passes` es cuántos
 * rodillos tiene la fila cercana a la ventana; la lejana tiene uno más. Cada rodillo del festón se abraza 180° y cada
 * esquina 90°, así que la longitud es lineal en la separación de filas y se resuelve exacta:
 *   L = (2k+2)(πR + S) + 2G + 4Rk.
 * Coordenadas: el tramo frontal queda en +y (hacia la lente), el recorrido es antihorario y el rodillo 0 es la esquina
 * que sigue a la ventana.
 */
export function designFestoon(loopLengthMm: number, rollerRadiusMm: number, passes: number, frontGapMm: number): FestoonDesign {
  const R = rollerRadiusMm;
  const k = Math.max(1, Math.round(passes));
  const G = frontGapMm;
  const S = (loopLengthMm - 2 * G - 4 * R * k) / (2 * k + 2) - Math.PI * R;
  if (S < 2 * R + 7) throw new Error(`Con ${k} pasadas el loop (${loopLengthMm.toFixed(0)} mm) es corto: las filas quedarían a ${S.toFixed(0)} mm. Usa menos pasadas o el rectángulo de 4 rodillos.`);
  // diseño con el tramo frontal abajo (y < 0) recorrido hacia +x; al final se gira 180° para dejarlo en +y
  const xT = (i: number) => -2 * R * k + 4 * R * i;
  const xB = (j: number) => -2 * R * k + 2 * R + 4 * R * j;
  const yT = S / 2;
  const yB = -S / 2;
  const yC = yB - G;
  const rollers: RollerSpec[] = [];
  const sides: (1 | -1)[] = [];
  const push = (x: number, y: number, side: 1 | -1) => {
    rollers.push({ x: -x, y: -y });
    sides.push(side);
  };
  push(xT(k), yC, 1); // esquina tras la ventana (motriz)
  for (let i = k; i >= 0; i--) {
    push(xT(i), yT, 1); // fila lejana: se abraza por arriba, antihorario
    if (i > 0) push(xB(i - 1), yB, -1); // fila cercana: por abajo, horario
  }
  push(xT(0), yC, 1); // esquina antes de la ventana
  const geo = buildPath({ rollers, rollerRadiusMm: R, driveRoller: 0, gateMm: 0, direction: 1, sides });
  const front = geo.segments.filter((x) => x.kind === 'line').at(-1)!;
  return { rollers, sides, rollerRadiusMm: R, lengthMm: geo.lengthMm, gateMm: front.s0 + front.length / 2, driveRoller: 0, tensionerRoller: 2, rowSpanMm: S, frontGapMm: G, passes: k };
}

/** distancia a lo largo de un rayo desde `o` en dirección unitaria `d` hasta un círculo o un segmento (Infinity si no cruza) */
function rayToCircle(o: Vec2, d: Vec2, c: Vec2, r: number): number {
  const fx = o.x - c.x;
  const fy = o.y - c.y;
  const b = fx * d.x + fy * d.y;
  const cc = fx * fx + fy * fy - r * r;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const sq = Math.sqrt(disc);
  const t1 = -b - sq;
  const t2 = -b + sq;
  if (t1 > 1e-6) return t1;
  if (t2 > 1e-6) return cc < 0 ? 0 : t2; // dentro del círculo: obstáculo inmediato
  return Infinity;
}
function rayToSegment(o: Vec2, d: Vec2, a: Vec2, b: Vec2): number {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const den = d.x * ey - d.y * ex;
  if (Math.abs(den) < 1e-12) return Infinity;
  const ax = a.x - o.x;
  const ay = a.y - o.y;
  const t = (ax * ey - ay * ex) / den;
  const u = (ax * d.y - ay * d.x) / den;
  return t > 1e-6 && u >= 0 && u <= 1 ? t : Infinity;
}

/**
 * Espacio libre detrás de la ventana, donde van la linterna y el condensador (mm). Mide en el recorrido real: hasta qué
 * profundidad se puede entrar desde la película (en −normal) sin tocar un rodillo (con sus pestañas de 2 mm) ni otro
 * tramo de película, y el ancho libre mínimo a lo largo de la tangente hasta `probeDepthMm`. Sirve igual para el
 * rectángulo convexo que para el festón.
 */
export function interiorClearance(spec: PathSpec, geo: PathGeometry, probeDepthMm = 80): { depthMm: number; widthMm: number } {
  const g = pointAt(geo, spec.gateMm);
  const Rf = spec.rollerRadiusMm + 2;
  const lines = geo.segments.filter((x): x is Extract<PathSegment, { kind: 'line' }> => x.kind === 'line' && x !== geo.segments[g.segment]);
  const cast = (o: Vec2, d: Vec2) => {
    let best = 5000;
    for (const r of spec.rollers) best = Math.min(best, rayToCircle(o, d, r, Rf));
    for (const l of lines) best = Math.min(best, rayToSegment(o, d, l.a, l.b));
    return best;
  };
  const inward = { x: -g.normal.x, y: -g.normal.y };
  const depthMm = cast(g.position, inward);
  let widthMm = Infinity;
  const until = Math.min(probeDepthMm, depthMm - 0.5);
  for (let dd = 0.5; dd <= until; dd += 1) {
    const q = { x: g.position.x + inward.x * dd, y: g.position.y + inward.y * dd };
    const w = cast(q, g.tangent) + cast(q, { x: -g.tangent.x, y: -g.tangent.y });
    widthMm = Math.min(widthMm, w);
  }
  return { depthMm, widthMm: Number.isFinite(widthMm) ? widthMm : 0 };
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
