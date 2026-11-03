// Vista 2D desplegada de la película y su exportación: pinta la tira completa (fotogramas, márgenes, perforaciones,
// marcas de registro y de sincronización, rótulos, empalme) en un canvas a una escala px/mm dada, y produce el SVG
// equivalente (vectorial para marcas; los fotogramas van como imágenes embebidas o como vectores si el contenido lo
// permite y se pasan sus SVG). Eje s horizontal (cabecera a la izquierda), ancho de la tira vertical (x hacia abajo):
// la imagen se ve derecha, tal como la verá la lente con la banda de canto.
import type { CanvasLike } from '../frames/generator';
import type { Frame } from '../frames/generator';
import type { Ctx2D } from '../animation/render2d';
import type { FilmLayout, Mark } from './layout';

export interface StripRenderOptions {
  /** píxeles por mm */
  pxPerMm: number;
  /** espejo horizontal (impresión por el reverso / emulsión hacia la lente) */
  mirror?: boolean;
  /** dibujar guías de corte (contorno de la tira) */
  cutMarks?: boolean;
  /** fondo: transparente (película) o blanco (prueba en papel) */
  background?: 'transparent' | 'white' | 'checker';
  /** máscara opaca fuera de los fotogramas (todo negro salvo imágenes y perforaciones) */
  opaqueMask?: boolean;
  /** rótulos de texto */
  labels?: boolean;
  /** trozo a pintar: inicio y fin en mm (por defecto toda la tira) */
  fromMm?: number;
  toMm?: number;
  /** fotogramas (ideales o con el medio aplicado) */
  frames: Frame[] | { index: number; canvas: CanvasLike }[];
}

/** tamaño en px del canvas para una tira completa (horizontal: s → x, ancho de tira → y) */
export function stripCanvasSize(layout: FilmLayout, pxPerMm: number, fromMm = 0, toMm = layout.totalLengthMm): { width: number; height: number } {
  return { width: Math.max(1, Math.ceil((toMm - fromMm) * pxPerMm)), height: Math.max(1, Math.ceil(layout.spec.stripWidthMm * pxPerMm)) };
}

/** Pinta la tira en el contexto dado. El canvas debe tener el tamaño de stripCanvasSize. */
export function renderStrip(ctx: Ctx2D, layout: FilmLayout, options: StripRenderOptions): void {
  const k = options.pxPerMm;
  const from = options.fromMm ?? 0;
  const to = options.toMm ?? layout.totalLengthMm;
  const W = (to - from) * k;
  const H = layout.spec.stripWidthMm * k;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (options.background === 'white') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
  } else if (options.background === 'checker') {
    const c = Math.max(4, 2 * k);
    for (let y = 0; y < H; y += c)
      for (let x = 0; x < W; x += c) {
        ctx.fillStyle = ((x / c + y / c) | 0) % 2 ? '#d8d8d8' : '#f4f4f4';
        ctx.fillRect(x, y, c, c);
      }
  }
  if (options.mirror) {
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
  }
  const sx = (s: number) => (s - from) * k;
  const xy = (x: number) => x * k;
  if (options.opaqueMask) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
  }
  const byIndex = new Map<number, CanvasLike>();
  for (const fr of options.frames) byIndex.set(fr.index, fr.canvas);
  for (const pf of layout.frames) {
    if (pf.sMm + pf.alongMm < from || pf.sMm > to) continue;
    const img = byIndex.get(pf.frameIndex);
    const x = sx(pf.sMm);
    const y = xy(pf.xMm);
    const w = pf.alongMm * k;
    const h = pf.acrossMm * k;
    if (options.opaqueMask) ctx.clearRect(x, y, w, h);
    if (img) ctx.drawImage(img as unknown as CanvasImageSource, x, y, w, h);
    else {
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
    }
  }
  for (const m of layout.marks) {
    if (m.sMm + m.alongMm < from || m.sMm > to) continue;
    drawMark(ctx, m, sx, xy, k, options);
  }
  if (options.cutMarks ?? true) {
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = Math.max(1, 0.1 * k);
    ctx.setLineDash([]);
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }
  ctx.restore();
}

function drawMark(ctx: Ctx2D, m: Mark, sx: (s: number) => number, xy: (x: number) => number, k: number, o: StripRenderOptions): void {
  const x = sx(m.sMm);
  const y = xy(m.xMm);
  const w = m.alongMm * k;
  const h = m.acrossMm * k;
  switch (m.kind) {
    case 'perforation':
      ctx.clearRect(x, y, w, h);
      if (o.background === 'white') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, w, h);
      }
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = Math.max(1, 0.1 * k);
      roundRectPath(ctx, x, y, w, h, Math.min(w, h) * 0.25);
      ctx.stroke();
      break;
    case 'sync':
      ctx.fillStyle = '#000000';
      ctx.fillRect(x, y, w, h);
      break;
    case 'registration': {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(1, 0.15 * k);
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.beginPath();
      ctx.moveTo(x, cy);
      ctx.lineTo(x + w, cy);
      ctx.moveTo(cx, y);
      ctx.lineTo(cx, y + h);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(w, h) * 0.35, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'splice':
      ctx.fillStyle = 'rgba(255,0,0,0.12)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#ff0000';
      ctx.setLineDash([3 * k, 2 * k]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + h);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    case 'label':
      if (o.labels ?? true) {
        ctx.save();
        ctx.fillStyle = '#000000';
        ctx.font = `${Math.max(6, m.acrossMm * k)}px ui-monospace, monospace`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillText(m.text ?? '', x, y);
        ctx.restore();
      }
      break;
  }
}

function roundRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------------------------------------------
// SVG

export interface StripSvgOptions {
  /** data URLs PNG de cada fotograma por índice (raster) */
  frameImages?: Map<number, string>;
  /** SVG interno (sin <svg> envolvente) por índice, con viewBox del fotograma, para salida vectorial */
  frameSvg?: Map<number, { inner: string; viewBox: string }>;
  mirror?: boolean;
  labels?: boolean;
  opaqueMask?: boolean;
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/** SVG en mm de toda la tira (s horizontal). Convención de capas láser de OMEGA: corte rojo, marcado azul. */
export function stripToSvg(layout: FilmLayout, options: StripSvgOptions = {}): string {
  const W = layout.totalLengthMm;
  const H = layout.spec.stripWidthMm;
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${fmt(W)}mm" height="${fmt(H)}mm" viewBox="0 0 ${fmt(W)} ${fmt(H)}">`);
  parts.push(`<title>Película · ${layout.frameCount} fotogramas · ${fmt(W)} × ${fmt(H)} mm</title>`);
  parts.push(options.mirror ? `<g transform="translate(${fmt(W)} 0) scale(-1 1)">` : '<g>');
  if (options.opaqueMask) parts.push(`<rect id="mascara" x="0" y="0" width="${fmt(W)}" height="${fmt(H)}" fill="#000"/>`);
  parts.push('<g id="fotogramas">');
  for (const pf of layout.frames) {
    const x = pf.sMm;
    const y = pf.xMm;
    const w = pf.alongMm;
    const h = pf.acrossMm;
    if (options.opaqueMask) parts.push(`<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" fill="#fff"/>`);
    const vec = options.frameSvg?.get(pf.frameIndex);
    const img = options.frameImages?.get(pf.frameIndex);
    if (vec) parts.push(`<svg x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" viewBox="${vec.viewBox}" preserveAspectRatio="xMidYMid meet">${vec.inner}</svg>`);
    else if (img) parts.push(`<image x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" preserveAspectRatio="none" xlink:href="${img}" href="${img}"/>`);
    else parts.push(`<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" fill="none" stroke="#999" stroke-width="0.1"/>`);
  }
  parts.push('</g>');
  parts.push('<g id="marcas">');
  for (const m of layout.marks) {
    const x = m.sMm;
    const y = m.xMm;
    const w = m.alongMm;
    const h = m.acrossMm;
    if (m.kind === 'perforation') parts.push(`<rect class="corte" x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" rx="${fmt(Math.min(w, h) * 0.25)}" fill="${options.opaqueMask ? '#fff' : 'none'}" stroke="#ff0000" stroke-width="0.1"/>`);
    else if (m.kind === 'sync') parts.push(`<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" fill="#000"/>`);
    else if (m.kind === 'registration') parts.push(`<g stroke="#000" stroke-width="0.15" fill="none"><line x1="${fmt(x)}" y1="${fmt(y + h / 2)}" x2="${fmt(x + w)}" y2="${fmt(y + h / 2)}"/><line x1="${fmt(x + w / 2)}" y1="${fmt(y)}" x2="${fmt(x + w / 2)}" y2="${fmt(y + h)}"/><circle cx="${fmt(x + w / 2)}" cy="${fmt(y + h / 2)}" r="${fmt(Math.min(w, h) * 0.35)}"/></g>`);
    else if (m.kind === 'splice') parts.push(`<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" fill="#ff0000" fill-opacity="0.12"/><line class="marcado" x1="${fmt(x)}" y1="${fmt(y)}" x2="${fmt(x)}" y2="${fmt(y + h)}" stroke="#0000ff" stroke-width="0.1" stroke-dasharray="3 2"/>`);
    else if (m.kind === 'label' && (options.labels ?? true)) parts.push(`<text x="${fmt(x)}" y="${fmt(y + m.acrossMm)}" font-size="${fmt(m.acrossMm)}" font-family="monospace" fill="#000">${(m.text ?? '').replace(/[<&]/g, '')}</text>`);
  }
  parts.push('</g>');
  parts.push(`<rect class="corte" x="0" y="0" width="${fmt(W)}" height="${fmt(H)}" fill="none" stroke="#ff0000" stroke-width="0.1"/>`);
  parts.push('</g></svg>');
  return parts.join('\n');
}
