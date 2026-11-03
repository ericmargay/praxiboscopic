// Utilidades de edición de pistas: rutas de propiedad animables de un elemento, lectura/escritura inmutable por
// ruta con puntos, inserción/movimiento/borrado de keyframes, conversión número ↔ keyframes y ediciones por
// fotograma (FrameOverride). Todo puro: recibe y devuelve documentos nuevos.
import { evalTrack, type EvalContext } from '../../animation/evaluate';
import type { AnimationDoc, Easing, Expr, FrameOverride, Item, Keyframe, Track } from '../../animation/model';
import { mapItem } from '../../animation/model';

export interface TrackPath {
  path: string;
  label: string;
  fallback: number;
}

const TRANSFORM_PATHS: TrackPath[] = [
  { path: 'transform.x', label: 'X', fallback: 0 },
  { path: 'transform.y', label: 'Y', fallback: 0 },
  { path: 'transform.rotation', label: 'Rotación', fallback: 0 },
  { path: 'transform.scaleX', label: 'Escala X', fallback: 1 },
  { path: 'transform.scaleY', label: 'Escala Y', fallback: 1 },
  { path: 'transform.opacity', label: 'Opacidad', fallback: 1 },
];

/** rutas de pistas numéricas animables del elemento (las que existen o pueden existir) */
export function trackPaths(item: Item): TrackPath[] {
  const out: TrackPath[] = [...TRANSFORM_PATHS];
  if (item.transform.skewX !== undefined) out.push({ path: 'transform.skewX', label: 'Inclinación X', fallback: 0 });
  if (item.transform.skewY !== undefined) out.push({ path: 'transform.skewY', label: 'Inclinación Y', fallback: 0 });
  switch (item.type) {
    case 'circle':
      out.push({ path: 'rx', label: 'Radio X', fallback: 10 }, { path: 'ry', label: 'Radio Y', fallback: 10 });
      break;
    case 'rect':
      out.push({ path: 'w', label: 'Ancho', fallback: 10 }, { path: 'h', label: 'Alto', fallback: 10 });
      if (item.radius !== undefined) out.push({ path: 'radius', label: 'Esquinas', fallback: 0 });
      break;
    case 'line':
      out.push({ path: 'x1', label: 'X1', fallback: 0 }, { path: 'y1', label: 'Y1', fallback: 0 }, { path: 'x2', label: 'X2', fallback: 0 }, { path: 'y2', label: 'Y2', fallback: 0 });
      break;
    case 'image':
      out.push({ path: 'w', label: 'Ancho', fallback: 100 }, { path: 'h', label: 'Alto', fallback: 100 });
      break;
    case 'text':
      out.push({ path: 'fontSize', label: 'Tamaño de letra', fallback: 24 });
      break;
    case 'model3d':
      out.push({ path: 'w', label: 'Ancho', fallback: 200 }, { path: 'h', label: 'Alto', fallback: 200 }, { path: 'camera.azimuthDeg', label: 'Cámara (azimut)', fallback: 0 });
      if (item.modelRotationY !== undefined) out.push({ path: 'modelRotationY', label: 'Giro Y del modelo', fallback: 0 });
      if (item.modelRotationX !== undefined) out.push({ path: 'modelRotationX', label: 'Giro X del modelo', fallback: 0 });
      break;
    default:
      break;
  }
  if (item.style.strokeWidth !== undefined) out.push({ path: 'style.strokeWidth', label: 'Grosor de trazo', fallback: 2 });
  if (item.deform?.squash !== undefined) out.push({ path: 'deform.squash', label: 'Squash', fallback: 1 });
  if (item.deform?.bend !== undefined) out.push({ path: 'deform.bend', label: 'Curvatura', fallback: 0 });
  if (item.deform?.taper !== undefined) out.push({ path: 'deform.taper', label: 'Estrechamiento', fallback: 0 });
  if (item.deform?.wave) out.push({ path: 'deform.wave.amp', label: 'Onda: amplitud', fallback: 0 }, { path: 'deform.wave.freq', label: 'Onda: frecuencia', fallback: 1 }, { path: 'deform.wave.phase', label: 'Onda: fase', fallback: 0 });
  return out;
}

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** copia inmutable con el valor en la ruta (crea objetos intermedios) */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const rec = (cur: unknown, i: number): unknown => {
    const k = keys[i];
    const base = cur !== null && typeof cur === 'object' ? (cur as Record<string, unknown>) : {};
    if (i === keys.length - 1) return { ...base, [k]: value };
    return { ...base, [k]: rec(base[k], i + 1) };
  };
  return rec(obj, 0) as T;
}

export function getTrack(item: Item, path: string): Track | undefined {
  const v = getPath(item, path);
  if (v === undefined || v === null) return undefined;
  return v as Track;
}

export function trackKind(track: Track | undefined): 'none' | 'number' | 'keys' | 'expr' {
  if (track === undefined) return 'none';
  if (typeof track === 'number') return 'number';
  if ('expr' in track) return 'expr';
  return 'keys';
}

export function valueAt(item: Item, path: string, ctx: EvalContext, fallback = 0): number {
  return evalTrack(getTrack(item, path), ctx, fallback);
}

export interface SetValueResult {
  track: Track;
  /** aviso para la barra de estado (p. ej. expresión convertida a número) */
  note?: string;
}

const sameT = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/**
 * Escribe un valor en una pista en el instante t: número → número; keyframes → inserta/reemplaza el keyframe en t
 * (auto-key) o desplaza todos los keyframes (sin auto-key); expresión → se convierte en número (con aviso).
 */
export function setTrackValueAt(track: Track | undefined, t: number, value: number, autoKey: boolean, ctx: EvalContext): SetValueResult {
  if (track === undefined || typeof track === 'number') return { track: value };
  if ('expr' in track) return { track: value, note: 'La pista era una expresión procedural: se convirtió en un valor fijo.' };
  const keys = track.keys;
  if (autoKey || keys.length === 0) {
    const idx = keys.findIndex((k) => sameT(k.t, t));
    const next = idx >= 0 ? keys.map((k, i) => (i === idx ? { ...k, v: value } : k)) : [...keys, { t, v: value }].sort((a, b) => a.t - b.t);
    return { track: { keys: next } };
  }
  const current = evalTrack(track, ctx, value);
  const delta = value - current;
  return { track: { keys: keys.map((k) => ({ ...k, v: k.v + delta })) }, note: 'Sin auto-key: se desplazaron todos los keyframes.' };
}

/** añade (o reemplaza) un keyframe en t con el valor actual de la pista; número → pista de keyframes */
export function addKeyframe(track: Track | undefined, t: number, ctx: EvalContext, fallback: number, easing?: Easing): Track {
  const v = evalTrack(track, ctx, fallback);
  if (track !== undefined && typeof track !== 'number' && 'keys' in track) {
    const idx = track.keys.findIndex((k) => sameT(k.t, t));
    if (idx >= 0) return { keys: track.keys.map((k, i) => (i === idx ? { ...k, v, e: easing ?? k.e } : k)) };
    return { keys: [...track.keys, { t, v, e: easing }].sort((a, b) => a.t - b.t) };
  }
  // número o expresión → dos keyframes (inicio del ciclo con el valor actual y t) para que haya algo que animar
  const keys: Keyframe[] = sameT(t, 0) ? [{ t: 0, v, e: easing }] : [{ t: 0, v: typeof track === 'number' ? track : evalTrack(track, { ...ctx, t: 0 }, fallback), e: easing }, { t, v, e: easing }];
  return { keys };
}

export function removeKeyframe(track: Track, t: number): Track {
  if (typeof track === 'number' || !('keys' in track)) return track;
  const keys = track.keys.filter((k) => !sameT(k.t, t));
  if (keys.length === 0) return 0;
  if (keys.length === 1) return keys[0].v;
  return { keys };
}

export function moveKeyframe(track: Track, fromT: number, toT: number): Track {
  if (typeof track === 'number' || !('keys' in track)) return track;
  if (track.keys.some((k) => sameT(k.t, toT) && !sameT(k.t, fromT))) return track; // ya hay uno ahí
  return { keys: track.keys.map((k) => (sameT(k.t, fromT) ? { ...k, t: toT } : k)).sort((a, b) => a.t - b.t) };
}

export function setKeyframeEasing(track: Track, t: number, e: Easing): Track {
  if (typeof track === 'number' || !('keys' in track)) return track;
  return { keys: track.keys.map((k) => (sameT(k.t, t) ? { ...k, e } : k)) };
}

export function keyframesOf(track: Track | undefined): Keyframe[] {
  if (track === undefined || typeof track === 'number' || !('keys' in track)) return [];
  return track.keys;
}

export function exprOf(track: Track | undefined): Expr | null {
  if (track !== undefined && typeof track !== 'number' && 'expr' in track) return track.expr;
  return null;
}

/** sustituye la pista de un elemento (por id y ruta) en el documento */
export function setItemTrack(doc: AnimationDoc, itemId: string, path: string, track: Track | undefined): AnimationDoc {
  return mapItem(doc, itemId, (it) => setPath(it, path, track) as Item);
}

export function updateItem(doc: AnimationDoc, itemId: string, fn: (item: Item) => Item): AnimationDoc {
  return mapItem(doc, itemId, fn);
}

// ---------------------------------------------------------------------------------------------------------------
// Ediciones por fotograma

export function overrideOf(doc: AnimationDoc, frameIndex: number, itemId: string): FrameOverride | undefined {
  return (doc.frameOverrides[String(frameIndex)] ?? []).find((o) => o.itemId === itemId);
}

export function setOverride(doc: AnimationDoc, frameIndex: number, itemId: string, fn: (o: FrameOverride) => FrameOverride): AnimationDoc {
  const key = String(frameIndex);
  const list = doc.frameOverrides[key] ?? [];
  const idx = list.findIndex((o) => o.itemId === itemId);
  const base: FrameOverride = idx >= 0 ? list[idx] : { itemId };
  const next = fn(base);
  const out = idx >= 0 ? list.map((o, i) => (i === idx ? next : o)) : [...list, next];
  return { ...doc, frameOverrides: { ...doc.frameOverrides, [key]: out } };
}

export function clearFrameOverrides(doc: AnimationDoc, frameIndex: number): AnimationDoc {
  const next = { ...doc.frameOverrides };
  delete next[String(frameIndex)];
  return { ...doc, frameOverrides: next };
}

export function frameHasOverrides(doc: AnimationDoc, frameIndex: number): boolean {
  return (doc.frameOverrides[String(frameIndex)]?.length ?? 0) > 0;
}

/** instante exacto del fotograma i con muestreo semiabierto */
export function timeOfFrame(i: number, count: number, duration: number): number {
  return (((i % count) + count) % count) * (duration / Math.max(1, count));
}

export function frameOfTime(t: number, count: number, duration: number): number {
  if (duration <= 0) return 0;
  const f = Math.floor(((((t % duration) + duration) % duration) / duration) * count + 1e-9);
  return Math.min(count - 1, Math.max(0, f));
}
