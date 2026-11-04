// Generador de fotogramas: convierte el documento en N imágenes discretas con caché por fotograma (hash de todo lo
// que afecta a ese fotograma: documento, instante, ediciones del fotograma, resolución, color y orientación). Al
// editar la animación solo se vuelven a pintar los fotogramas cuyo hash cambió; al cambiar un ajuste global, todos.
// Independiente del host: recibe una fábrica de canvas (HTMLCanvasElement/OffscreenCanvas en el navegador,
// @napi-rs/canvas en Node).
import { evaluate } from '../animation/evaluate';
import { frameTimes } from '../animation/loop';
import { walkItems, type AnimationDoc } from '../animation/model';

/** ¿el documento tiene imágenes raster (fijas o secuencias)? se memoriza por documento */
const imageDocs = new WeakMap<AnimationDoc, boolean>();
function hasImages(doc: AnimationDoc): boolean {
  let v = imageDocs.get(doc);
  if (v === undefined) {
    v = doc.layers.some((l) => [...walkItems(l.items)].some((it) => it.type === 'image'));
    imageDocs.set(doc, v);
  }
  return v;
}
import { renderDisplayList, type Ctx2D, type ResourceProvider } from '../animation/render2d';
import { hashValue } from '../core/hash';
import { applyColorAdjust } from './adjust';
import { frameLabel, orientedSize, resolveFrameCount, type FrameGenSettings } from './settings';

export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d', options?: unknown): Ctx2D | null;
}

export interface CanvasFactory {
  create(width: number, height: number): CanvasLike;
  /** codifica el canvas como PNG */
  toPng(canvas: CanvasLike): Promise<Uint8Array>;
  /** libera recursos del canvas (opcional) */
  dispose?(canvas: CanvasLike): void;
}

export interface Frame {
  /** posición en la película (0…N−1, ya con la dirección aplicada) */
  index: number;
  /** índice de muestra de la animación (0…N−1 en orden temporal) */
  sourceIndex: number;
  /** instante muestreado (s) */
  t: number;
  label: string;
  canvas: CanvasLike;
  hash: string;
  /** true si este fotograma tiene ediciones individuales */
  edited: boolean;
}

export interface FrameSet {
  count: number;
  /** px tras la orientación */
  widthPx: number;
  heightPx: number;
  /** mm sobre la tira tras la orientación */
  widthMm: number;
  heightMm: number;
  fps: number;
  duration: number;
  frames: Frame[];
  /** hash del conjunto (cambia si cambia cualquier fotograma o la configuración) */
  hash: string;
  /** cuántos fotogramas se volvieron a pintar en la última generación */
  regenerated: number;
  /** cuántos salieron de la caché */
  cached: number;
}

export class FrameGenerator {
  private cache = new Map<string, CanvasLike>();
  private lastHashes: string[] = [];

  constructor(
    private readonly canvases: CanvasFactory,
    private resources: ResourceProvider,
  ) {}

  setResources(r: ResourceProvider): void {
    this.resources = r;
  }

  /** invalida toda la caché (p. ej. al cargar una imagen nueva) */
  clear(): void {
    for (const c of this.cache.values()) this.canvases.dispose?.(c);
    this.cache.clear();
    this.lastHashes = [];
  }

  generate(doc: AnimationDoc, settings: FrameGenSettings, extraKey: unknown = null): FrameSet {
    const { count, duration } = resolveFrameCount(doc.fps, doc.duration, settings);
    const effectiveDoc = duration !== doc.duration ? { ...doc, duration } : doc;
    const times = frameTimes(duration, count);
    const docHash = hashValue({ layers: doc.layers, width: doc.width, height: doc.height, background: doc.background, loop: doc.loop, duration });
    const globalKey = hashValue({ settings: { ...settings, numbering: undefined, fpsMode: undefined, fixedCount: undefined }, extraKey });
    const size = orientedSize(settings);
    const out: Frame[] = [];
    let regenerated = 0;
    let cached = 0;
    const used = new Set<string>();
    for (let i = 0; i < count; i++) {
      const t = times[i];
      const overrides = doc.frameOverrides[String(i)] ?? [];
      const replacement = doc.frameReplacements?.[String(i)];
      // las imágenes que aún cargan entran en el hash: al llegar, solo se repinta el fotograma que las usa
      const images = replacement ? null : this.imagesReady(effectiveDoc, t, i);
      const hash = hashValue({ docHash, globalKey, t, i, overrides, replacement: replacement ? hashValue(replacement) : null, hasImg: replacement ? !!this.resources.getImage(replacement) : null, images });
      used.add(hash);
      let canvas = this.cache.get(hash);
      if (!canvas) {
        canvas = replacement ? this.renderReplacement(replacement, settings) : this.renderFrame(effectiveDoc, t, i, settings);
        this.cache.set(hash, canvas);
        regenerated++;
      } else cached++;
      const filmIndex = settings.direction === 'reverse' ? count - 1 - i : i;
      out.push({ index: filmIndex, sourceIndex: i, t, label: frameLabel(i, settings.numbering), canvas, hash, edited: overrides.length > 0 || !!replacement });
    }
    // libera lo que ya no se usa
    for (const [k, c] of this.cache) {
      if (!used.has(k)) {
        this.canvases.dispose?.(c);
        this.cache.delete(k);
      }
    }
    out.sort((a, b) => a.index - b.index);
    const hashes = out.map((f) => f.hash);
    this.lastHashes = hashes;
    const mm = settings.orientation === 90 || settings.orientation === 270 ? { widthMm: settings.heightMm, heightMm: settings.widthMm } : { widthMm: settings.widthMm, heightMm: settings.heightMm };
    return { count, widthPx: size.width, heightPx: size.height, ...mm, fps: doc.fps, duration, frames: out, hash: hashValue({ hashes, globalKey, direction: settings.direction }), regenerated, cached };
  }

  /** estado de carga de las imágenes que usa un fotograma (null si no usa ninguna); también dispara su carga */
  private imagesReady(doc: AnimationDoc, t: number, frameIndex: number): string | null {
    if (!hasImages(doc)) return null;
    let out = '';
    for (const n of evaluate(doc, t, { frameIndex }).nodes) if (n.geometry.kind === 'image') out += this.resources.getImage(n.geometry.src) ? '1' : '0';
    return out || null;
  }

  /** pinta un fotograma: supermuestreo → ajustes de color → orientación */
  renderFrame(doc: AnimationDoc, t: number, frameIndex: number, settings: FrameGenSettings): CanvasLike {
    const ss = Math.max(1, Math.min(4, Math.round(settings.supersample)));
    const w = settings.widthPx;
    const h = settings.heightPx;
    const big = this.canvases.create(w * ss, h * ss);
    const bctx = big.getContext('2d')!;
    const list = evaluate(doc, t, { frameIndex });
    const scale = Math.min((w * ss) / doc.width, (h * ss) / doc.height);
    const ox = ((w * ss) - doc.width * scale) / 2;
    const oy = ((h * ss) - doc.height * scale) / 2;
    const forceBackground = settings.transparent ? null : settings.backgroundColor;
    if (forceBackground) {
      bctx.fillStyle = forceBackground;
      bctx.fillRect(0, 0, w * ss, h * ss);
    }
    renderDisplayList(bctx, list, { scale, offsetX: ox, offsetY: oy, resources: this.resources, forceBackground: forceBackground ? null : undefined });
    if (!settings.transparent && list.background.transparent) {
      // el documento es transparente pero el fotograma no: el fondo ya se pintó arriba
    }
    // reducción al tamaño final
    let base = big;
    if (ss > 1) {
      const small = this.canvases.create(w, h);
      const sctx = small.getContext('2d')!;
      sctx.imageSmoothingEnabled = true;
      (sctx as CanvasRenderingContext2D).imageSmoothingQuality = 'high';
      sctx.drawImage(big as unknown as CanvasImageSource, 0, 0, w, h);
      this.canvases.dispose?.(big);
      base = small;
    }
    // ajustes de color sobre píxeles
    const ctx = base.getContext('2d')!;
    if (needsAdjust(settings)) {
      const img = ctx.getImageData(0, 0, w, h);
      applyColorAdjust(img.data, settings.color);
      ctx.putImageData(img, 0, 0);
    }
    // orientación
    if (settings.orientation !== 0) {
      const size = orientedSize(settings);
      const rot = this.canvases.create(size.width, size.height);
      const rctx = rot.getContext('2d')!;
      rctx.translate(size.width / 2, size.height / 2);
      rctx.rotate((settings.orientation * Math.PI) / 180);
      rctx.drawImage(base as unknown as CanvasImageSource, -w / 2, -h / 2);
      this.canvases.dispose?.(base);
      return rot;
    }
    return base;
  }

  /** fotograma sustituido por una imagen: se encaja (contain) en la resolución y se aplican color y orientación */
  renderReplacement(src: string, settings: FrameGenSettings): CanvasLike {
    const w = settings.widthPx;
    const h = settings.heightPx;
    const base = this.canvases.create(w, h);
    const ctx = base.getContext('2d')!;
    if (!settings.transparent) {
      ctx.fillStyle = settings.backgroundColor;
      ctx.fillRect(0, 0, w, h);
    }
    const img = this.resources.getImage(src);
    if (img) {
      const iw = (img as { width?: number }).width ?? w;
      const ih = (img as { height?: number }).height ?? h;
      const s = Math.min(w / iw, h / ih);
      const dw = iw * s;
      const dh = ih * s;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else {
      ctx.strokeStyle = '#888';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(1, 1, w - 2, h - 2);
    }
    if (needsAdjust(settings)) {
      const data = ctx.getImageData(0, 0, w, h);
      applyColorAdjust(data.data, settings.color);
      ctx.putImageData(data, 0, 0);
    }
    if (settings.orientation !== 0) {
      const size = orientedSize(settings);
      const rot = this.canvases.create(size.width, size.height);
      const rctx = rot.getContext('2d')!;
      rctx.translate(size.width / 2, size.height / 2);
      rctx.rotate((settings.orientation * Math.PI) / 180);
      rctx.drawImage(base as unknown as CanvasImageSource, -w / 2, -h / 2);
      this.canvases.dispose?.(base);
      return rot;
    }
    return base;
  }

  /** hashes de la última generación (para pruebas de regeneración incremental) */
  get hashes(): readonly string[] {
    return this.lastHashes;
  }
}

function needsAdjust(s: FrameGenSettings): boolean {
  const c = s.color;
  return c.brightness !== 0 || c.contrast !== 1 || c.saturation !== 1 || c.invert || c.grayscale || c.threshold > 0;
}
