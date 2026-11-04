// Exportaciones de alto nivel: secuencia PNG (ZIP), spritesheet (PNG + JSON), SVG por fotograma (ZIP, solo si el
// contenido es vectorial), tira completa en PNG a la resolución pedida, SVG de la tira y PDF imprimible por
// segmentos con marcas de corte y alineación, todo a dimensiones físicas reales. Independiente del DOM: recibe la
// fábrica de canvas y un codificador JPEG opcional (para el PDF).
import { evaluate } from '../animation/evaluate';
import { frameTimes } from '../animation/loop';
import { isVectorOnly, type AnimationDoc } from '../animation/model';
import { displayListToSvg } from '../animation/svg';
import type { FilmLayout } from '../film/layout';
import { compatibility, pageOf, tilePlan, type PrintSpec, type TilePlan } from '../film/print';
import { renderStrip, stripCanvasSize, stripToSvg, type StripRenderOptions } from '../film/strip2d';
import type { CanvasFactory, CanvasLike, FrameSet } from '../frames/generator';
import { buildPdf, type PdfDoc, type PdfOp, type PdfPage } from './pdf';
import { zipStore, type ZipEntry } from './zip';

export interface ExportContext {
  canvases: CanvasFactory;
  /** codificador JPEG (calidad 0..1); si falta, el PDF embebe RGB sin comprimir */
  toJpeg?: (canvas: CanvasLike, quality: number) => Promise<Uint8Array>;
  /** data URL PNG de un canvas (para SVG con imágenes embebidas) */
  toDataUrl?: (canvas: CanvasLike) => string;
  /** compresor zlib: si está, el PDF guarda las imágenes sin pérdida (Flate) en vez de JPEG */
  deflate?: (data: Uint8Array) => Uint8Array;
}

/** extras de la plantilla impresa: perfil de color y página de paleta para igualar colores */
export interface StripPdfExtras {
  /** perfil ICC de las imágenes (sRGB): sin él, visores e impresoras interpretan el RGB cada uno a su manera */
  iccProfile?: Uint8Array;
  /** colores del material con su proporción, para una página de muestras */
  palette?: { hex: string; rgb: [number, number, number]; share: number }[];
  /** solo las primeras N páginas de tira (prueba de color) */
  maxStripPages?: number;
}

export interface ExportFile {
  name: string;
  data: Uint8Array | string;
  type: string;
}

const enc = (s: string) => new TextEncoder().encode(s);

/** secuencia de PNG numerados en un ZIP, con un manifest.json (orden, tiempos, mm, px) */
export async function exportPngSequence(frames: FrameSet, ctx: ExportContext, baseName = 'fotogramas'): Promise<ExportFile> {
  const entries: ZipEntry[] = [];
  const manifest = { count: frames.count, fps: frames.fps, duration: frames.duration, widthPx: frames.widthPx, heightPx: frames.heightPx, widthMm: frames.widthMm, heightMm: frames.heightMm, frames: [] as { file: string; index: number; sourceIndex: number; t: number; edited: boolean }[] };
  for (const f of frames.frames) {
    const png = await ctx.canvases.toPng(f.canvas);
    const file = `${baseName}/${f.label}.png`;
    entries.push({ name: file, data: png });
    manifest.frames.push({ file, index: f.index, sourceIndex: f.sourceIndex, t: f.t, edited: f.edited });
  }
  entries.push({ name: `${baseName}/manifest.json`, data: enc(JSON.stringify(manifest, null, 2)) });
  return { name: `${baseName}.zip`, data: zipStore(entries), type: 'application/zip' };
}

/** spritesheet en rejilla + JSON de celdas */
export async function exportSpritesheet(frames: FrameSet, ctx: ExportContext, baseName = 'spritesheet', columns?: number): Promise<ExportFile[]> {
  const n = frames.count;
  const cols = Math.max(1, columns ?? Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);
  const sheet = ctx.canvases.create(cols * frames.widthPx, rows * frames.heightPx);
  const c2 = sheet.getContext('2d')!;
  const cells: { index: number; x: number; y: number; w: number; h: number; t: number }[] = [];
  for (const f of frames.frames) {
    const x = (f.index % cols) * frames.widthPx;
    const y = Math.floor(f.index / cols) * frames.heightPx;
    c2.drawImage(f.canvas as unknown as CanvasImageSource, x, y);
    cells.push({ index: f.index, x, y, w: frames.widthPx, h: frames.heightPx, t: f.t });
  }
  const png = await ctx.canvases.toPng(sheet);
  const json = { image: `${baseName}.png`, columns: cols, rows, fps: frames.fps, duration: frames.duration, frameWidth: frames.widthPx, frameHeight: frames.heightPx, frameWidthMm: frames.widthMm, frameHeightMm: frames.heightMm, frames: cells.sort((a, b) => a.index - b.index) };
  return [
    { name: `${baseName}.png`, data: png, type: 'image/png' },
    { name: `${baseName}.json`, data: JSON.stringify(json, null, 2), type: 'application/json' },
  ];
}

/** SVG por fotograma (solo documentos vectoriales) en un ZIP, con tamaño físico real */
export function exportSvgSequence(doc: AnimationDoc, frames: FrameSet, baseName = 'fotogramas-svg'): ExportFile | null {
  if (!isVectorOnly(doc)) return null;
  const times = frameTimes(frames.duration, frames.count);
  const entries: ZipEntry[] = frames.frames.map((f) => {
    const list = evaluate({ ...doc, duration: frames.duration }, times[f.sourceIndex], { frameIndex: f.sourceIndex });
    return { name: `${baseName}/${f.label}.svg`, data: enc(displayListToSvg(list, { widthMm: frames.widthMm, heightMm: frames.heightMm })) };
  });
  return { name: `${baseName}.zip`, data: zipStore(entries), type: 'application/zip' };
}

export interface StripExportOptions {
  pxPerMm: number;
  mirror: boolean;
  background: 'transparent' | 'white' | 'checker';
  opaqueMask: boolean;
  labels: boolean;
  /** límite de píxeles por lado: si la tira es más larga, se divide en trozos */
  maxSidePx?: number;
}

/** PNG(s) de la tira completa a la resolución pedida (dividida si supera el límite de canvas) */
export async function exportStripPng(layout: FilmLayout, frames: StripRenderOptions['frames'], ctx: ExportContext, options: StripExportOptions, baseName = 'pelicula'): Promise<ExportFile[]> {
  const maxSide = options.maxSidePx ?? 16000;
  const total = layout.totalLengthMm;
  const mmPerChunk = Math.floor(maxSide / options.pxPerMm);
  const chunks = Math.max(1, Math.ceil(total / mmPerChunk));
  const out: ExportFile[] = [];
  for (let i = 0; i < chunks; i++) {
    const from = i * mmPerChunk;
    const to = Math.min(total, (i + 1) * mmPerChunk);
    const size = stripCanvasSize(layout, options.pxPerMm, from, to);
    const canvas = ctx.canvases.create(size.width, size.height);
    renderStrip(canvas.getContext('2d')!, layout, { ...options, frames, fromMm: from, toMm: to, cutMarks: true });
    const png = await ctx.canvases.toPng(canvas);
    out.push({ name: chunks > 1 ? `${baseName}_${String(i + 1).padStart(2, '0')}_${from.toFixed(0)}-${to.toFixed(0)}mm.png` : `${baseName}.png`, data: png, type: 'image/png' });
    ctx.canvases.dispose?.(canvas);
  }
  return out;
}

/** SVG de la tira (fotogramas vectoriales si el documento lo permite; si no, PNG embebidos) */
export function exportStripSvg(layout: FilmLayout, doc: AnimationDoc, frames: FrameSet, ctx: ExportContext, options: { mirror: boolean; labels: boolean; opaqueMask: boolean; preferVector: boolean }, baseName = 'pelicula'): ExportFile {
  const frameSvg = new Map<number, { inner: string; viewBox: string }>();
  const frameImages = new Map<number, string>();
  if (options.preferVector && isVectorOnly(doc)) {
    const times = frameTimes(frames.duration, frames.count);
    for (const f of frames.frames) {
      const list = evaluate({ ...doc, duration: frames.duration }, times[f.sourceIndex], { frameIndex: f.sourceIndex });
      const svg = displayListToSvg(list);
      const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
      frameSvg.set(f.index, { inner, viewBox: `0 0 ${list.width} ${list.height}` });
    }
  } else if (ctx.toDataUrl) {
    for (const f of frames.frames) frameImages.set(f.index, ctx.toDataUrl(f.canvas));
  }
  return { name: `${baseName}.svg`, data: stripToSvg(layout, { frameSvg: frameSvg.size ? frameSvg : undefined, frameImages: frameImages.size ? frameImages : undefined, mirror: options.mirror, labels: options.labels, opaqueMask: options.opaqueMask }), type: 'image/svg+xml' };
}

/**
 * PDF imprimible: cada segmento de la tira en su página (varias filas por página si caben), a tamaño real, con
 * marcas de corte en las esquinas de cada segmento, marcas de alineación en los solapes, rótulo del segmento y una
 * portada con el resumen (medio, ruta, dimensiones, PPI).
 */
export async function exportStripPdf(layout: FilmLayout, frames: StripRenderOptions['frames'], spec: PrintSpec, ctx: ExportContext, projectName: string, baseName = 'plantilla-pelicula', extras: StripPdfExtras = {}): Promise<{ file: ExportFile; plan: TilePlan }> {
  const plan = tilePlan(layout, spec);
  const page = pageOf(spec);
  const compat = compatibility(spec, layout);
  const images: PdfDoc['images'] = [];
  const pages: PdfPage[] = [];
  const m = spec.marginMm;
  const stripW = layout.spec.stripWidthMm;
  const rowGap = 6;
  // portada
  const cover: PdfOp[] = [];
  let y = m + 6;
  const line = (text: string, size = 10) => {
    cover.push({ op: 'text', xMm: m, yMm: y, text, sizePt: size });
    y += size * 0.5;
  };
  line(`Praxiboscopic · plantilla de película · ${projectName}`, 14);
  y += 3;
  line(`Tira: ${layout.totalLengthMm.toFixed(1)} × ${stripW} mm · ${layout.frames.length} fotogramas (${layout.frameCount} por ciclo × ${layout.spec.repeats}) · paso ${layout.spec.pitchMm} mm · imagen ${layout.frameAlongMm} × ${layout.frameAcrossMm} mm`);
  line(`Loop: ${layout.loopLengthMm.toFixed(1)} mm · empalme ${layout.spec.spliceType} con ${layout.spec.spliceOverlapMm} mm de solape · cabecera ${layout.spec.leaderMm} mm · cola ${layout.spec.trailerMm} mm`);
  line(`Impresión: ${spec.ppi} ppi · ${page.label} ${spec.landscape ? 'horizontal' : 'vertical'} · margen ${m} mm · solape entre segmentos ${spec.overlapMm} mm · ${plan.segments.length} segmentos en ${plan.pages} páginas`);
  line(`Medio: ${compat.medium.label} (${compat.quality === 'optical' ? 'calidad óptica' : 'prueba de escritorio'}) · ruta: ${spec.route} · perfil de color: ${spec.colorProfile}${extras.iccProfile ? ' (incrustado en las imágenes)' : ' (declarado, no incrustado)'}`);
  line(`Espejo: ${spec.mirror ? 'sí (impresión por el reverso)' : 'no'} · tinta/emulsión: ${spec.emulsion === 'toward-lens' ? 'hacia la lente' : 'hacia la lámpara'}`);
  y += 2;
  const para = (text: string, size: number, bullet = false) => {
    const max = Math.floor(((page.widthMm - 2 * m) / (size * 0.18)) * 1.0);
    wrap(text, max).forEach((w, i) => line(`${bullet ? (i === 0 ? '• ' : '   ') : ''}${w}`, size));
  };
  para('Imprimir: abre el PDF en Vista Previa o Acrobat y elige «Tamaño real» o escala 100 % (nunca «Ajustar a la página»). Tipo de papel: transparencia; calidad máxima; sin corrección automática de color. Comprueba la regla de 50 mm con una regla antes de seguir.', 8);
  y += 1;
  para('Ensamblaje: corta cada segmento por las marcas rojas, superpón el solape sobre las marcas azules del segmento siguiente y une con cinta transparente sin cubrir ningún fotograma. El último segmento se une al primero para cerrar el loop.', 8);
  y += 2;
  for (const msg of compat.messages.slice(0, 8)) para(msg, 7.5, true);
  pages.push({ widthMm: page.widthMm, heightMm: page.heightMm, ops: cover });
  if (extras.palette?.length) {
    // cada muestra es una imagen de 1 × 1 px: así lleva el mismo perfil de color que la tira
    const swatch = (rgb: [number, number, number]) => {
      images.push({ data: new Uint8Array(rgb), width: 1, height: 1, format: 'rgb' });
      return images.length - 1;
    };
    pages.push({ widthMm: page.widthMm, heightMm: page.heightMm, ops: paletteOps(extras.palette, page, m, swatch) });
  }

  const rows = plan.rowsPerPage;
  const stripPages = Math.min(plan.pages, extras.maxStripPages ?? Infinity);
  for (let pi = 0; pi < stripPages; pi++) {
    const ops: PdfOp[] = [];
    for (let r = 0; r < rows; r++) {
      const seg = plan.segments[pi * rows + r];
      if (!seg) break;
      const x0 = m;
      const y0 = m + r * (stripW + rowGap);
      const len = seg.printedLengthMm;
      // imagen del segmento
      const size = stripCanvasSize(layout, plan.pxPerMm, seg.fromMm, seg.fromMm + len);
      const canvas = ctx.canvases.create(size.width, size.height);
      renderStrip(canvas.getContext('2d')!, layout, { pxPerMm: plan.pxPerMm, frames, fromMm: seg.fromMm, toMm: seg.fromMm + len, mirror: spec.mirror, background: 'white', cutMarks: false, labels: spec.segmentLabels });
      let image: PdfDoc['images'][number];
      if (ctx.toJpeg && !ctx.deflate) image = { data: await ctx.toJpeg(canvas, 0.95), width: size.width, height: size.height, format: 'jpeg' };
      else {
        const data = canvas.getContext('2d')!.getImageData(0, 0, size.width, size.height).data;
        const rgb = new Uint8Array(size.width * size.height * 3);
        for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
          rgb[j] = data[i];
          rgb[j + 1] = data[i + 1];
          rgb[j + 2] = data[i + 2];
        }
        image = ctx.deflate ? { data: ctx.deflate(rgb), width: size.width, height: size.height, format: 'rgb-flate' } : { data: rgb, width: size.width, height: size.height, format: 'rgb' };
      }
      ctx.canvases.dispose?.(canvas);
      images.push(image);
      ops.push({ op: 'image', image: images.length - 1, rect: { xMm: x0, yMm: y0, wMm: len, hMm: stripW } });
      // contorno de corte (rojo) y marcas de esquina
      if (spec.cropMarks) {
        ops.push({ op: 'rect', rect: { xMm: x0, yMm: y0, wMm: len, hMm: stripW }, stroke: [1, 0, 0], lineMm: 0.1 });
        for (const [cx, cy] of [
          [x0, y0],
          [x0 + len, y0],
          [x0, y0 + stripW],
          [x0 + len, y0 + stripW],
        ]) {
          ops.push({ op: 'line', x1: cx - 4, y1: cy, x2: cx + 4, y2: cy, stroke: [0, 0, 0], lineMm: 0.1 });
          ops.push({ op: 'line', x1: cx, y1: cy - 4, x2: cx, y2: cy + 4, stroke: [0, 0, 0], lineMm: 0.1 });
        }
      }
      // línea de corte del solape (azul) y marcas de alineación
      if (seg.cutAtMm !== null) {
        const cx = x0 + seg.cutAtMm;
        ops.push({ op: 'line', x1: cx, y1: y0 - 3, x2: cx, y2: y0 + stripW + 3, stroke: [0, 0, 1], lineMm: 0.1, dash: [2, 1] });
        if (spec.alignmentMarks) {
          ops.push({ op: 'circle', cx, cy: y0 - 2, r: 1, stroke: [0, 0, 1], lineMm: 0.1 });
          ops.push({ op: 'circle', cx, cy: y0 + stripW + 2, r: 1, stroke: [0, 0, 1], lineMm: 0.1 });
          ops.push({ op: 'text', xMm: cx + 1.5, yMm: y0 - 1, text: `solape ${spec.overlapMm} mm → seg. ${seg.index + 2}`, sizePt: 5, color: [0, 0, 1] });
        }
      }
      if (spec.alignmentMarks && seg.index > 0) {
        // al inicio del segmento: círculos que deben coincidir con los del solape anterior
        ops.push({ op: 'circle', cx: x0, cy: y0 - 2, r: 1, stroke: [0, 0, 1], lineMm: 0.1 });
        ops.push({ op: 'circle', cx: x0, cy: y0 + stripW + 2, r: 1, stroke: [0, 0, 1], lineMm: 0.1 });
      }
      if (spec.segmentLabels) ops.push({ op: 'text', xMm: x0, yMm: y0 + stripW + 4.5, text: `Segmento ${seg.index + 1}/${plan.segments.length} · ${seg.fromMm.toFixed(1)}–${seg.toMm.toFixed(1)} mm · fotogramas ${seg.frameSlots[0] + 1}–${seg.frameSlots[seg.frameSlots.length - 1] + 1} · ${spec.ppi} ppi · tamaño real: no escalar`, sizePt: 6 });
      // regla de verificación de escala: 50 mm
      ops.push({ op: 'line', x1: x0 + len - 50, y1: y0 + stripW + 7, x2: x0 + len, y2: y0 + stripW + 7, stroke: [0, 0, 0], lineMm: 0.2 });
      ops.push({ op: 'text', xMm: x0 + len - 50, yMm: y0 + stripW + 9.5, text: '50 mm (comprueba la escala con una regla)', sizePt: 5 });
    }
    pages.push({ widthMm: page.widthMm, heightMm: page.heightMm, ops });
  }
  const pdf = buildPdf({ title: `Plantilla de película · ${projectName}`, pages, images, iccProfile: extras.iccProfile });
  return { file: { name: `${baseName}.pdf`, data: pdf, type: 'application/pdf' }, plan };
}

/**
 * Página de muestras: cada color del material (k-medias sobre todos los fotogramas) en un cuadro de 30 × 22 mm con su
 * valor sRGB y su proporción. Se imprime en el mismo acetato que la tira y se compara contra la pantalla y, encendida la
 * linterna, contra la proyección.
 */
function paletteOps(palette: NonNullable<StripPdfExtras['palette']>, page: { widthMm: number; heightMm: number }, m: number, swatch: (rgb: [number, number, number]) => number): PdfOp[] {
  const ops: PdfOp[] = [];
  ops.push({ op: 'text', xMm: m, yMm: m + 6, text: 'Colores del material (sRGB) · imprime esta página en el mismo acetato y con los mismos ajustes que la tira', sizePt: 11 });
  ops.push({ op: 'text', xMm: m, yMm: m + 12, text: 'Compárala con la pantalla y con la proyección. Si un color se corre, corrige el ajuste de la impresora, no los fotogramas.', sizePt: 8 });
  const w = 30;
  const h = 22;
  const gap = 6;
  const perRow = Math.max(1, Math.floor((page.widthMm - 2 * m + gap) / (w + gap)));
  palette.forEach((c, i) => {
    const x = m + (i % perRow) * (w + gap);
    const y = m + 20 + Math.floor(i / perRow) * (h + 16);
    ops.push({ op: 'image', image: swatch(c.rgb), rect: { xMm: x, yMm: y, wMm: w, hMm: h } });
    ops.push({ op: 'rect', rect: { xMm: x, yMm: y, wMm: w, hMm: h }, stroke: [0.6, 0.6, 0.6], lineMm: 0.1 });
    ops.push({ op: 'text', xMm: x, yMm: y + h + 4, text: `${c.hex.toUpperCase()} · ${(c.share * 100).toFixed(1)} %`, sizePt: 7 });
    ops.push({ op: 'text', xMm: x, yMm: y + h + 8, text: `R ${c.rgb[0]}  G ${c.rgb[1]}  B ${c.rgb[2]}`, sizePt: 6 });
  });
  const yNote = m + 20 + Math.ceil(palette.length / perRow) * (h + 16) + 6;
  const notes = [
    'Las muestras y la tira llevan el mismo perfil sRGB incrustado: si aquí el color sale bien, en la tira también.',
    'Una impresora de tintas CMYK no alcanza el azul ni el rojo puros de una pantalla: saldrán más apagados. Es el límite del medio.',
    'En acetato para inyección, el negro deja pasar algo de luz (Dmax ≈ 1,6–2): en la proyección se verá gris muy oscuro.',
    'Imprime por la cara rugosa (la que absorbe la tinta), con el tipo de papel "transparencia" y la calidad más alta, sin ajustes automáticos de color.',
  ];
  notes.forEach((t, i) => ops.push({ op: 'text', xMm: m, yMm: yNote + i * 5, text: `• ${t}`, sizePt: 7.5 }));
  return ops;
}

function wrap(text: string, max: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) {
      lines.push(cur.trim());
      cur = w;
    } else cur += ` ${w}`;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}
