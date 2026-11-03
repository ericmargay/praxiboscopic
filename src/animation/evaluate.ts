// Evaluación del documento en un instante t: resuelve pistas, transforma y aplana la jerarquía en una lista de
// dibujo (`DisplayList`) con geometría numérica y matrices de mundo. Pura (sin canvas): la usan el renderizador 2D,
// el exportador SVG, el análisis de continuidad del loop y las pruebas.
import { ease } from './easing';
import type { AnimationDoc, Deform, Expr, FrameOverride, Item, Keyframe, Layer, PointsTrack, Style, Track, Transform, Vec2 } from './model';
import { mod } from '../core/math';

/** matriz afín 2D [a b c d e f] como CanvasRenderingContext2D.transform */
export type Mat2D = [number, number, number, number, number, number];

export const IDENTITY: Mat2D = [1, 0, 0, 1, 0, 0];

export function mul(m: Mat2D, n: Mat2D): Mat2D {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}

export function apply(m: Mat2D, p: Vec2): Vec2 {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

export function invert(m: Mat2D): Mat2D {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

// ---------------------------------------------------------------------------------------------------------------
// Pistas

export interface EvalContext {
  /** segundos dentro del ciclo */
  t: number;
  /** duración del ciclo (s) */
  duration: number;
  loop: boolean;
}

export function evalExpr(e: Expr, u: number): number {
  switch (e.kind) {
    case 'sin':
    case 'abs-sin': {
      const s = Math.sin(2 * Math.PI * (u * e.cycles + (e.phase ?? 0)));
      const base = e.kind === 'abs-sin' ? Math.abs(s) : s;
      const p = e.power ?? 1;
      const v = p === 1 ? base : Math.sign(base) * Math.abs(base) ** p;
      return (e.offset ?? 0) + e.amp * v;
    }
    case 'saw': {
      const f = mod(u * e.cycles + (e.phase ?? 0), 1);
      return e.from + (e.to - e.from) * f;
    }
    case 'triangle': {
      const f = mod(u * e.cycles + (e.phase ?? 0), 1);
      return (e.offset ?? 0) + e.amp * (1 - Math.abs(2 * f - 1));
    }
    case 'square': {
      const f = mod(u * e.cycles + (e.phase ?? 0), 1);
      return f < (e.duty ?? 0.5) ? e.high : e.low;
    }
    case 'bounce': {
      // trayectoria balística con `bounces` rebotes por ciclo; damping reduce la altura de cada rebote y vuelve
      // a la altura inicial al cerrar el ciclo (el último rebote se interpola hacia el primero)
      const n = Math.max(1, Math.round(e.bounces));
      const f = mod(u, 1) * n;
      const i = Math.floor(f);
      const local = f - i;
      const d = e.damping ?? 0;
      const amp = (idx: number) => e.height * (1 - d * (idx / n));
      const h = amp(i);
      return (e.floor ?? 0) + h * 4 * local * (1 - local);
    }
    case 'noise': {
      // ruido periódico: interpolación cúbica entre valores hash en una rejilla de `cycles` celdas que envuelve
      const n = Math.max(1, Math.round(e.cycles));
      const seed = e.seed ?? 1;
      const f = mod(u, 1) * n;
      const i0 = Math.floor(f);
      const fr = f - i0;
      const h = (k: number) => {
        const x = Math.sin((mod(k, n) + 1) * 12.9898 + seed * 78.233) * 43758.5453;
        return (x - Math.floor(x)) * 2 - 1;
      };
      const p0 = h(i0 - 1);
      const p1 = h(i0);
      const p2 = h(i0 + 1);
      const p3 = h(i0 + 2);
      const v = p1 + 0.5 * fr * (p2 - p0 + fr * (2 * p0 - 5 * p1 + 4 * p2 - p3 + fr * (3 * (p1 - p2) + p3 - p0)));
      return (e.offset ?? 0) + e.amp * v;
    }
    case 'sum':
      return e.terms.reduce((acc, term) => acc + evalExpr(term, u), 0);
  }
}

/**
 * Interpola keyframes. Con loop, la pista es periódica: después del último keyframe se interpola hacia el primero
 * (desplazado un ciclo), así la transición último → primero vale lo mismo que cualquier otra.
 */
export function evalKeys<T>(keys: { t: number; v: T; e?: Keyframe['e'] }[], ctx: EvalContext, lerpV: (a: T, b: T, u: number) => T): T | undefined {
  if (keys.length === 0) return undefined;
  const sorted = keys.length > 1 && !isSorted(keys) ? [...keys].sort((a, b) => a.t - b.t) : keys;
  if (sorted.length === 1) return sorted[0].v;
  const D = ctx.duration;
  const t = ctx.loop ? mod(ctx.t, D) : ctx.t;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (t <= first.t) {
    if (!ctx.loop) return first.v;
    // entre el último (ciclo anterior) y el primero
    const span = first.t + D - last.t;
    if (span <= 1e-9) return first.v;
    const u = (t + D - last.t) / span;
    return lerpV(last.v, first.v, ease(last.e, u));
  }
  if (t >= last.t) {
    if (!ctx.loop) return last.v;
    const span = first.t + D - last.t;
    if (span <= 1e-9) return first.v;
    const u = (t - last.t) / span;
    return lerpV(last.v, first.v, ease(last.e, u));
  }
  let lo = 0;
  let hi = sorted.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = sorted[lo];
  const b = sorted[hi];
  const span = b.t - a.t;
  if (span <= 1e-9) return b.v;
  return lerpV(a.v, b.v, ease(a.e, (t - a.t) / span));
}

function isSorted(keys: { t: number }[]): boolean {
  for (let i = 1; i < keys.length; i++) if (keys[i].t < keys[i - 1].t) return false;
  return true;
}

const lerpNum = (a: number, b: number, u: number) => a + (b - a) * u;

export function evalTrack(track: Track | undefined, ctx: EvalContext, fallback = 0): number {
  if (track === undefined) return fallback;
  if (typeof track === 'number') return track;
  if ('expr' in track) return evalExpr(track.expr, ctx.duration > 0 ? ctx.t / ctx.duration : 0);
  return evalKeys(track.keys, ctx, lerpNum) ?? fallback;
}

export function evalPoints(track: PointsTrack, ctx: EvalContext): Vec2[] {
  if (Array.isArray(track)) return track;
  return (
    evalKeys(track.keys, ctx, (a, b, u) => {
      const n = Math.max(a.length, b.length);
      const out: Vec2[] = [];
      for (let i = 0; i < n; i++) {
        const pa = a[Math.min(i, a.length - 1)] ?? { x: 0, y: 0 };
        const pb = b[Math.min(i, b.length - 1)] ?? pa;
        out.push({ x: lerpNum(pa.x, pb.x, u), y: lerpNum(pa.y, pb.y, u) });
      }
      return out;
    }) ?? []
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Transformaciones

export interface ResolvedTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  skewX: number;
  skewY: number;
  anchorX: number;
  anchorY: number;
}

export function resolveTransform(tr: Transform, ctx: EvalContext, over?: FrameOverride['transform']): ResolvedTransform {
  const r: ResolvedTransform = {
    x: evalTrack(tr.x, ctx),
    y: evalTrack(tr.y, ctx),
    rotation: evalTrack(tr.rotation, ctx),
    scaleX: evalTrack(tr.scaleX, ctx, 1),
    scaleY: evalTrack(tr.scaleY, ctx, 1),
    opacity: evalTrack(tr.opacity, ctx, 1),
    skewX: evalTrack(tr.skewX, ctx),
    skewY: evalTrack(tr.skewY, ctx),
    anchorX: tr.anchorX ?? 0,
    anchorY: tr.anchorY ?? 0,
  };
  if (over) Object.assign(r, over);
  return r;
}

export function transformMatrix(r: ResolvedTransform): Mat2D {
  const rad = (r.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const tanX = Math.tan((r.skewX * Math.PI) / 180);
  const tanY = Math.tan((r.skewY * Math.PI) / 180);
  // T(x,y) · R · Skew · S · T(−anchor)
  let m: Mat2D = [1, 0, 0, 1, r.x, r.y];
  m = mul(m, [cos, sin, -sin, cos, 0, 0]);
  m = mul(m, [1, tanY, tanX, 1, 0, 0]);
  m = mul(m, [r.scaleX, 0, 0, r.scaleY, 0, 0]);
  m = mul(m, [1, 0, 0, 1, -r.anchorX, -r.anchorY]);
  return m;
}

// ---------------------------------------------------------------------------------------------------------------
// Lista de dibujo

export interface ResolvedStyle {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  dash: number[];
  blend: GlobalCompositeOperation;
}

export type Geometry =
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; radius: number }
  | { kind: 'polyline'; points: Vec2[]; closed: boolean }
  | { kind: 'bezier'; points: Vec2[]; closed: boolean }
  | { kind: 'image'; src: string; x: number; y: number; w: number; h: number; smoothing: boolean }
  | { kind: 'text'; text: string; x: number; y: number; fontSize: number; font: string; align: CanvasTextAlign; baseline: CanvasTextBaseline }
  | { kind: 'model3d'; src: string; x: number; y: number; w: number; h: number; camera: { fovDeg: number; distance: number; elevationDeg: number; azimuthDeg: number }; rotY: number; rotX: number; lightKelvin: number; environment: 'studio' | 'none' };

export interface DrawNode {
  itemId: string;
  layerId: string;
  name: string;
  /** local → lienzo */
  matrix: Mat2D;
  opacity: number;
  style: ResolvedStyle;
  geometry: Geometry;
}

export interface DisplayList {
  width: number;
  height: number;
  background: { transparent: boolean; color: string };
  t: number;
  frameIndex?: number;
  nodes: DrawNode[];
}

const DEFAULT_STYLE: ResolvedStyle = { fill: '#ffffff', stroke: null, strokeWidth: 0, lineCap: 'round', lineJoin: 'round', dash: [], blend: 'source-over' };

function resolveStyle(s: Style, ctx: EvalContext, over?: FrameOverride['style']): ResolvedStyle {
  return {
    fill: over?.fill !== undefined ? over.fill : s.fill === undefined ? DEFAULT_STYLE.fill : s.fill,
    stroke: over?.stroke !== undefined ? over.stroke : (s.stroke ?? null),
    strokeWidth: evalTrack(s.strokeWidth, ctx, s.stroke ? 2 : 0),
    lineCap: s.lineCap ?? 'round',
    lineJoin: s.lineJoin ?? 'round',
    dash: s.dash ?? [],
    blend: (s.blend as GlobalCompositeOperation) ?? 'source-over',
  };
}

/** aproximación poligonal para poder deformar rectángulos y elipses */
function ellipsePoints(cx: number, cy: number, rx: number, ry: number, n = 48): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return out;
}

function rectPoints(x: number, y: number, w: number, h: number, perSide = 8): Vec2[] {
  const out: Vec2[] = [];
  const corners = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  for (let s = 0; s < 4; s++) {
    const a = corners[s];
    const b = corners[(s + 1) % 4];
    for (let i = 0; i < perSide; i++) out.push({ x: a.x + ((b.x - a.x) * i) / perSide, y: a.y + ((b.y - a.y) * i) / perSide });
  }
  return out;
}

export function applyDeform(points: Vec2[], d: Deform | undefined, ctx: EvalContext): Vec2[] {
  if (!d) return points;
  let pts = points;
  const bb = bboxOf(pts);
  const squash = d.squash ? evalTrack(d.squash, ctx, 1) : 1;
  const bend = d.bend ? evalTrack(d.bend, ctx) : 0;
  const taper = d.taper ? evalTrack(d.taper, ctx) : 0;
  const wave = d.wave;
  const wAmp = wave ? evalTrack(wave.amp, ctx) : 0;
  const wFreq = wave ? evalTrack(wave.freq, ctx, 1) : 1;
  const wPhase = wave ? evalTrack(wave.phase, ctx) : 0;
  const cx = (bb.minX + bb.maxX) / 2;
  const bottom = bb.maxY;
  const h = Math.max(1e-6, bb.maxY - bb.minY);
  const w = Math.max(1e-6, bb.maxX - bb.minX);
  pts = pts.map((p) => {
    let x = p.x;
    let y = p.y;
    if (squash !== 1 && squash > 0) {
      // conserva el área: y se comprime hacia la base, x se ensancha desde el centro
      y = bottom - (bottom - y) / squash;
      x = cx + (x - cx) * Math.sqrt(squash);
    }
    if (taper !== 0) {
      const k = 1 - taper * ((bottom - y) / h);
      x = cx + (x - cx) * k;
    }
    if (bend !== 0) {
      const dy = bottom - y;
      x += bend * dy * dy;
    }
    if (wave && wAmp !== 0) {
      if ((wave.axis ?? 'x') === 'x') y += wAmp * Math.sin(2 * Math.PI * (((x - bb.minX) / w) * wFreq + wPhase));
      else x += wAmp * Math.sin(2 * Math.PI * (((y - bb.minY) / h) * wFreq + wPhase));
    }
    return { x, y };
  });
  return pts;
}

export function bboxOf(points: Vec2[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!points.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

function overridesFor(doc: AnimationDoc, frameIndex: number | undefined): Map<string, FrameOverride> {
  const map = new Map<string, FrameOverride>();
  if (frameIndex === undefined) return map;
  for (const o of doc.frameOverrides[String(frameIndex)] ?? []) map.set(o.itemId, o);
  return map;
}

export interface EvaluateOptions {
  /** índice de fotograma (para aplicar ediciones por fotograma) */
  frameIndex?: number;
  /** ignorar la visibilidad de capas (p. ej. para onion skin) */
  includeHidden?: boolean;
}

/** Evalúa el documento en el instante t (segundos). */
export function evaluate(doc: AnimationDoc, t: number, options: EvaluateOptions = {}): DisplayList {
  const ctx: EvalContext = { t, duration: doc.duration, loop: doc.loop };
  const overrides = overridesFor(doc, options.frameIndex);
  const nodes: DrawNode[] = [];
  for (const layer of doc.layers) {
    if (!layer.visible && !options.includeHidden) continue;
    const lt = resolveTransform(layer.transform, ctx);
    const lm = transformMatrix(lt);
    emitItems(layer, layer.items, lm, lt.opacity, ctx, overrides, nodes, options);
  }
  return { width: doc.width, height: doc.height, background: doc.background, t, frameIndex: options.frameIndex, nodes };
}

function emitItems(layer: Layer, items: Item[], parent: Mat2D, parentOpacity: number, ctx: EvalContext, overrides: Map<string, FrameOverride>, out: DrawNode[], options: EvaluateOptions): void {
  for (const item of items) {
    const ov = overrides.get(item.id);
    if (ov?.hidden) continue;
    if (item.visible === false && !options.includeHidden) continue;
    const rt = resolveTransform(item.transform, ctx, ov?.transform);
    const m = mul(parent, transformMatrix(rt));
    const opacity = parentOpacity * rt.opacity;
    if (item.type === 'group') {
      emitItems(layer, item.children, m, opacity, ctx, overrides, out, options);
      continue;
    }
    const style = resolveStyle(item.style, ctx, ov?.style);
    const geometry = geometryOf(item, ctx);
    if (!geometry) continue;
    out.push({ itemId: item.id, layerId: layer.id, name: item.name, matrix: m, opacity, style, geometry });
  }
}

function geometryOf(item: Item, ctx: EvalContext): Geometry | null {
  switch (item.type) {
    case 'circle': {
      const rx = evalTrack(item.rx, ctx, 10);
      const ry = evalTrack(item.ry, ctx, rx);
      if (item.deform) return { kind: 'polyline', points: applyDeform(ellipsePoints(0, 0, rx, ry), item.deform, ctx), closed: true };
      return { kind: 'ellipse', cx: 0, cy: 0, rx, ry };
    }
    case 'rect': {
      const w = evalTrack(item.w, ctx, 10);
      const h = evalTrack(item.h, ctx, 10);
      if (item.deform) return { kind: 'polyline', points: applyDeform(rectPoints(-w / 2, -h / 2, w, h), item.deform, ctx), closed: true };
      return { kind: 'rect', x: -w / 2, y: -h / 2, w, h, radius: evalTrack(item.radius, ctx, 0) };
    }
    case 'polygon':
      return { kind: 'polyline', points: applyDeform(evalPoints(item.points, ctx), item.deform, ctx), closed: item.closed };
    case 'line':
      return {
        kind: 'polyline',
        points: [
          { x: evalTrack(item.x1, ctx), y: evalTrack(item.y1, ctx) },
          { x: evalTrack(item.x2, ctx), y: evalTrack(item.y2, ctx) },
        ],
        closed: false,
      };
    case 'path':
      return { kind: 'bezier', points: applyDeform(evalPoints(item.points, ctx), item.deform, ctx), closed: item.closed };
    case 'image': {
      const w = evalTrack(item.w, ctx, 100);
      const h = evalTrack(item.h, ctx, 100);
      return { kind: 'image', src: item.src, x: -w / 2, y: -h / 2, w, h, smoothing: item.smoothing ?? true };
    }
    case 'text':
      return { kind: 'text', text: item.text, x: 0, y: 0, fontSize: evalTrack(item.fontSize, ctx, 24), font: item.font ?? 'sans-serif', align: item.align ?? 'center', baseline: item.baseline ?? 'middle' };
    case 'model3d': {
      const w = evalTrack(item.w, ctx, 200);
      const h = evalTrack(item.h, ctx, 200);
      return {
        kind: 'model3d',
        src: item.src,
        x: -w / 2,
        y: -h / 2,
        w,
        h,
        camera: { fovDeg: item.camera.fovDeg, distance: item.camera.distance, elevationDeg: item.camera.elevationDeg, azimuthDeg: evalTrack(item.camera.azimuthDeg, ctx) },
        rotY: evalTrack(item.modelRotationY, ctx),
        rotX: evalTrack(item.modelRotationX, ctx),
        lightKelvin: item.lightKelvin ?? 5600,
        environment: item.environment ?? 'studio',
      };
    }
    case 'group':
      return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Utilidades geométricas para análisis y selección

/** puntos de muestra en coordenadas del lienzo de un nodo (para cajas, selección y comparación de fotogramas) */
export function nodeSamplePoints(node: DrawNode): Vec2[] {
  const g = node.geometry;
  let local: Vec2[];
  switch (g.kind) {
    case 'ellipse':
      local = ellipsePoints(g.cx, g.cy, g.rx, g.ry, 24);
      break;
    case 'rect':
    case 'image':
    case 'model3d':
      local = [
        { x: g.x, y: g.y },
        { x: g.x + g.w, y: g.y },
        { x: g.x + g.w, y: g.y + g.h },
        { x: g.x, y: g.y + g.h },
      ];
      break;
    case 'polyline':
    case 'bezier':
      local = g.points;
      break;
    case 'text': {
      const w = g.text.length * g.fontSize * 0.55;
      local = [
        { x: g.x - w / 2, y: g.y - g.fontSize / 2 },
        { x: g.x + w / 2, y: g.y - g.fontSize / 2 },
        { x: g.x + w / 2, y: g.y + g.fontSize / 2 },
        { x: g.x - w / 2, y: g.y + g.fontSize / 2 },
      ];
      break;
    }
  }
  return local.map((p) => apply(node.matrix, p));
}

export function nodeBBox(node: DrawNode): { minX: number; minY: number; maxX: number; maxY: number } {
  return bboxOf(nodeSamplePoints(node));
}

/** nodo bajo un punto del lienzo (el último dibujado gana) */
export function hitTest(list: DisplayList, p: Vec2): DrawNode | null {
  for (let i = list.nodes.length - 1; i >= 0; i--) {
    const n = list.nodes[i];
    const bb = nodeBBox(n);
    const pad = Math.max(4, n.style.strokeWidth);
    if (p.x >= bb.minX - pad && p.x <= bb.maxX + pad && p.y >= bb.minY - pad && p.y <= bb.maxY + pad) return n;
  }
  return null;
}
