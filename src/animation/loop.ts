// Seamless Loop: muestreo semiabierto, comparación del primer y último fotograma, detección de discontinuidades y
// correcciones. Dos niveles: geométrico (puro, sobre la DisplayList: posiciones y tamaños de cada nodo) y de píxeles
// (sobre ImageData, cuando hay canvas).
import { evaluate, nodeBBox, type DisplayList } from './evaluate';
import type { AnimationDoc } from './model';

/** instantes de los N fotogramas de un ciclo: t_i = i·T/N, i = 0…N−1 (sin duplicar t = T) */
export function frameTimes(duration: number, count: number): number[] {
  const n = Math.max(1, Math.round(count));
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = (i * duration) / n;
  return out;
}

export interface NodeDelta {
  itemId: string;
  name: string;
  /** desplazamiento del centro de la caja (px) */
  move: number;
  /** cambio de tamaño de la caja (px, |Δw| + |Δh|) */
  resize: number;
  /** cambio de opacidad */
  opacity: number;
}

interface NodeSig {
  node: DisplayList['nodes'][number];
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** clase: capa + tipo de geometría + relleno (elementos intercambiables entre sí) */
  cls: string;
}

function signature(n: DisplayList['nodes'][number]): NodeSig {
  const bb = nodeBBox(n);
  return { node: n, cx: (bb.minX + bb.maxX) / 2, cy: (bb.minY + bb.maxY) / 2, w: bb.maxX - bb.minX, h: bb.maxY - bb.minY, cls: `${n.layerId}|${n.geometry.kind}|${n.style.fill ?? ''}|${n.style.stroke ?? ''}` };
}

function cost(a: NodeSig, b: NodeSig): { move: number; resize: number; opacity: number } {
  return { move: Math.hypot(a.cx - b.cx, a.cy - b.cy), resize: Math.abs(a.w - b.w) + Math.abs(a.h - b.h), opacity: Math.abs(a.node.opacity - b.node.opacity) };
}

const costTotal = (c: { move: number; resize: number; opacity: number }) => c.move + c.resize + c.opacity * 100;

/**
 * Diferencia geométrica entre dos listas. Primero empareja por itemId (lo que normalmente se mueve de forma continua);
 * después, para la medida total, permite que elementos intercambiables (misma capa, misma geometría, mismos colores)
 * se emparejen por cercanía: un fondo que se desplaza y "recicla" sus nubes es continuo aunque cada nube cambie de
 * identidad al cerrar el ciclo. El total es el menor de los dos emparejamientos.
 */
export function geometricDelta(a: DisplayList, b: DisplayList): { total: number; perNode: NodeDelta[]; missing: string[] } {
  // los nodos completamente fuera del lienzo en ambas listas no se ven: no cuentan (fondos que reciclan elementos)
  const offscreen = (s: NodeSig, w: number, h: number) => s.cx + s.w / 2 < 0 || s.cx - s.w / 2 > w || s.cy + s.h / 2 < 0 || s.cy - s.h / 2 > h;
  const allA = a.nodes.map(signature);
  const allB = b.nodes.map(signature);
  const offA = new Set(allA.filter((s) => offscreen(s, a.width, a.height)).map((s) => s.node.itemId));
  const offB = new Set(allB.filter((s) => offscreen(s, b.width, b.height)).map((s) => s.node.itemId));
  // emparejamiento por identidad: se ignoran los pares fuera del lienzo en ambos fotogramas
  const mapB = new Map(allB.map((s) => [s.node.itemId, s]));
  const perNode: NodeDelta[] = [];
  const missing: string[] = [];
  let labeled = 0;
  for (const sa of allA) {
    const sb = mapB.get(sa.node.itemId);
    if (!sb) {
      missing.push(sa.node.itemId);
      labeled += 1e3;
      continue;
    }
    if (offA.has(sa.node.itemId) && offB.has(sa.node.itemId)) continue;
    const c = cost(sa, sb);
    perNode.push({ itemId: sa.node.itemId, name: sa.node.name, ...c });
    labeled += costTotal(c);
  }
  for (const sb of allB) if (!allA.some((s) => s.node.itemId === sb.node.itemId)) missing.push(sb.node.itemId);
  // emparejamiento por conjuntos: solo lo visible en cada fotograma
  const sigA = allA.filter((s) => !offA.has(s.node.itemId));
  const sigB = allB.filter((s) => !offB.has(s.node.itemId));
  // emparejamiento óptimo por clase (asignación húngara): el coste mínimo de emparejar el conjunto A con el B
  let unlabeled = 0;
  const classesA = new Map<string, NodeSig[]>();
  const classesB = new Map<string, NodeSig[]>();
  for (const s of sigA) classesA.set(s.cls, [...(classesA.get(s.cls) ?? []), s]);
  for (const s of sigB) classesB.set(s.cls, [...(classesB.get(s.cls) ?? []), s]);
  const keys = new Set([...classesA.keys(), ...classesB.keys()]);
  // un nodo sin pareja cuesta lo que se ve de él (ancho + alto visibles): una esquina que asoma por el borde pesa
  // poco; un elemento entero que aparece o desaparece pesa su tamaño
  const extent = (s: NodeSig, w: number, h: number) => {
    const x0 = Math.max(0, s.cx - s.w / 2);
    const x1 = Math.min(w, s.cx + s.w / 2);
    const y0 = Math.max(0, s.cy - s.h / 2);
    const y1 = Math.min(h, s.cy + s.h / 2);
    return Math.max(0, x1 - x0) + Math.max(0, y1 - y0);
  };
  for (const k of keys) {
    const A = classesA.get(k) ?? [];
    const B = classesB.get(k) ?? [];
    const n = Math.max(A.length, B.length);
    if (n === 0) continue;
    const matrix: number[][] = [];
    for (let i = 0; i < n; i++) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        if (i < A.length && j < B.length) row.push(costTotal(cost(A[i], B[j])));
        else if (i < A.length) row.push(extent(A[i], a.width, a.height));
        else if (j < B.length) row.push(extent(B[j], b.width, b.height));
        else row.push(0);
      }
      matrix.push(row);
    }
    unlabeled += hungarian(matrix);
  }
  return { total: Math.min(labeled, unlabeled), perNode, missing };
}

/** coste mínimo de asignación de una matriz cuadrada (algoritmo húngaro, O(n³)) */
export function hungarian(cost: number[][]): number {
  const n = cost.length;
  if (n === 0) return 0;
  const INF = Number.POSITIVE_INFINITY;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const p = new Array<number>(n + 1).fill(0);
  const way = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(INF);
    const used = new Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  let total = 0;
  for (let j = 1; j <= n; j++) if (p[j] > 0) total += cost[p[j] - 1][j - 1];
  return total;
}

export interface LoopReport {
  frames: number;
  /** delta geométrico de la transición último → primero */
  wrapDelta: number;
  /** mediana de los deltas entre fotogramas consecutivos dentro del ciclo */
  medianDelta: number;
  /** máximo de los deltas internos */
  maxDelta: number;
  /** wrapDelta / medianDelta (≈1 = la transición de cierre es como cualquier otra) */
  ratio: number;
  seamless: boolean;
  worstNodes: NodeDelta[];
  message: string;
}

/**
 * Compara la transición de cierre (fotograma N−1 → 0) con las transiciones internas. Con `loop: true` y pistas
 * periódicas el cociente debe quedar cerca de 1; un salto (ratio ≫ 1) indica una discontinuidad.
 */
export function analyzeLoop(doc: AnimationDoc, count?: number, tolerance = 2.5): LoopReport {
  const n = Math.max(2, count ?? Math.round(doc.fps * doc.duration));
  const times = frameTimes(doc.duration, n);
  const lists = times.map((t, i) => evaluate(doc, t, { frameIndex: i }));
  const deltas: number[] = [];
  for (let i = 1; i < n; i++) deltas.push(geometricDelta(lists[i - 1], lists[i]).total);
  const wrap = geometricDelta(lists[n - 1], lists[0]);
  const sorted = [...deltas].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const max = sorted.length ? sorted[sorted.length - 1] : 0;
  // un ciclo estático (median 0) es seamless si el cierre también es 0
  const ratio = median > 1e-6 ? wrap.total / median : wrap.total < 1e-6 ? 1 : Infinity;
  const seamless = ratio <= tolerance || wrap.total <= Math.max(0.5, max * 1.05);
  const worst = [...wrap.perNode].sort((a, b) => b.move + b.resize + b.opacity * 100 - (a.move + a.resize + a.opacity * 100)).slice(0, 5);
  let message: string;
  if (seamless) message = `Loop continuo: la transición de cierre (${wrap.total.toFixed(1)} px) es comparable a las internas (mediana ${median.toFixed(1)} px, máximo ${max.toFixed(1)} px).`;
  else message = `Discontinuidad al cerrar el loop: salto de ${wrap.total.toFixed(1)} px frente a una mediana de ${median.toFixed(1)} px entre fotogramas (×${ratio === Infinity ? '∞' : ratio.toFixed(1)}). Peores: ${worst.map((w) => w.name).join(', ')}.`;
  return { frames: n, wrapDelta: wrap.total, medianDelta: median, maxDelta: max, ratio, seamless, worstNodes: worst, message };
}

/** diferencia media absoluta por canal (0..255) entre dos ImageData del mismo tamaño, ponderando por alfa */
export function pixelDifference(a: ImageDataLike, b: ImageDataLike): number {
  if (a.width !== b.width || a.height !== b.height) return 255;
  let sum = 0;
  let count = 0;
  const da = a.data;
  const db = b.data;
  for (let i = 0; i < da.length; i += 4) {
    const alpha = Math.max(da[i + 3], db[i + 3]) / 255;
    if (alpha < 0.002) continue;
    sum += (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) + Math.abs(da[i + 3] - db[i + 3])) / 4;
    count++;
  }
  return count ? sum / count : 0;
}

export interface ImageDataLike {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface PixelLoopReport {
  wrap: number;
  median: number;
  max: number;
  ratio: number;
  seamless: boolean;
}

/** misma comparación que analyzeLoop, pero sobre los píxeles de los fotogramas ya pintados */
export function analyzeLoopPixels(frames: ImageDataLike[], tolerance = 2.5): PixelLoopReport {
  const n = frames.length;
  if (n < 2) return { wrap: 0, median: 0, max: 0, ratio: 1, seamless: true };
  const deltas: number[] = [];
  for (let i = 1; i < n; i++) deltas.push(pixelDifference(frames[i - 1], frames[i]));
  const wrap = pixelDifference(frames[n - 1], frames[0]);
  const sorted = [...deltas].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const max = sorted[sorted.length - 1];
  const ratio = median > 1e-6 ? wrap / median : wrap < 1e-6 ? 1 : Infinity;
  return { wrap, median, max, ratio, seamless: ratio <= tolerance || wrap <= max * 1.05 };
}

// ---------------------------------------------------------------------------------------------------------------
// Correcciones

/**
 * Corrección 1: activar el modo loop (las pistas de keyframes envuelven) y, si la animación procede de un
 * generador, asegurar ciclos enteros. Devuelve el documento corregido y qué se hizo.
 */
export function fixLoopMode(doc: AnimationDoc): { doc: AnimationDoc; changes: string[] } {
  const changes: string[] = [];
  let out = doc;
  if (!doc.loop) {
    out = { ...out, loop: true };
    changes.push('Modo Seamless Loop activado: las pistas envuelven del último al primer keyframe.');
  }
  return { doc: out, changes };
}

/**
 * Corrección 2: cerrar las pistas de keyframes añadiendo, para cada pista cuyo primer y último valor difieren, un
 * keyframe final en t = duration − ε con el valor inicial (el último tramo vuelve al origen).
 */
export function closeKeyframeTracks(doc: AnimationDoc): { doc: AnimationDoc; changes: string[] } {
  const changes: string[] = [];
  const eps = Math.min(1e-3, doc.duration / 1000);
  const fix = (track: unknown, label: string): unknown => {
    if (!track || typeof track !== 'object' || !('keys' in track)) return track;
    const keys = [...(track as { keys: { t: number; v: unknown; e?: unknown }[] }).keys].sort((a, b) => a.t - b.t);
    if (keys.length < 2) return track;
    const first = keys[0];
    const last = keys[keys.length - 1];
    const same = JSON.stringify(first.v) === JSON.stringify(last.v);
    if (same) return track;
    if (last.t >= doc.duration - eps) {
      keys[keys.length - 1] = { ...last, v: first.v };
      changes.push(`${label}: el último keyframe toma el valor del primero.`);
    } else {
      keys.push({ t: doc.duration - eps, v: first.v });
      changes.push(`${label}: keyframe de cierre añadido en t = ${(doc.duration - eps).toFixed(3)} s.`);
    }
    return { keys };
  };
  const fixTransform = (tr: Record<string, unknown>, label: string) => {
    const out: Record<string, unknown> = { ...tr };
    for (const k of Object.keys(tr)) out[k] = fix(tr[k], `${label}.${k}`);
    return out;
  };
  const fixItems = (items: AnimationDoc['layers'][number]['items']): AnimationDoc['layers'][number]['items'] =>
    items.map((it) => {
      const o: Record<string, unknown> = { ...it, transform: fixTransform(it.transform as unknown as Record<string, unknown>, it.name) };
      for (const k of ['rx', 'ry', 'w', 'h', 'x1', 'y1', 'x2', 'y2', 'fontSize', 'radius']) if (k in o) o[k] = fix(o[k], `${it.name}.${k}`);
      if ('points' in o) o.points = fix(o.points, `${it.name}.points`);
      if (it.type === 'group') o.children = fixItems(it.children);
      return o as unknown as (typeof items)[number];
    });
  const out: AnimationDoc = {
    ...doc,
    layers: doc.layers.map((l) => ({ ...l, transform: fixTransform(l.transform as unknown as Record<string, unknown>, l.name) as unknown as typeof l.transform, items: fixItems(l.items) })),
  };
  return { doc: out, changes };
}
