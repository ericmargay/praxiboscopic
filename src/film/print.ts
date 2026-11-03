// Preparación para impresión: resolución (PPI), tamaño físico exacto, división de la tira en segmentos que caben en
// páginas, marcas de corte y alineación, solapes de ensamblaje, espejo/emulsión, y la ruta de producción (impresión
// directa, hojas transparentes a ensamblar, laboratorio) con sus compatibilidades.
import { mediumById, type MediumProfile } from '../optics/medium';
import type { FilmLayout } from './layout';

export interface PageSize {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
}

export const PAGE_SIZES: readonly PageSize[] = [
  { id: 'a4', label: 'A4 (210 × 297)', widthMm: 210, heightMm: 297 },
  { id: 'letter', label: 'Carta (215.9 × 279.4)', widthMm: 215.9, heightMm: 279.4 },
  { id: 'legal', label: 'Oficio (215.9 × 355.6)', widthMm: 215.9, heightMm: 355.6 },
  { id: 'a3', label: 'A3 (297 × 420)', widthMm: 297, heightMm: 420 },
  { id: 'tabloid', label: 'Tabloide (279.4 × 431.8)', widthMm: 279.4, heightMm: 431.8 },
  { id: 'roll-610', label: 'Rollo 610 mm (plotter)', widthMm: 610, heightMm: 5000 },
  { id: 'custom', label: 'Personalizado', widthMm: 300, heightMm: 300 },
];

export type ProductionRoute = 'direct-film' | 'sheets' | 'lab';

export const ROUTE_LABELS: Record<ProductionRoute, string> = {
  'direct-film': 'Impresión directa sobre película transparente compatible',
  sheets: 'Hojas transparentes impresas y ensambladas en tira',
  lab: 'Laboratorio especializado (película fotográfica / fotolito)',
};

export interface PrintSpec {
  /** resolución de salida de las imágenes (píxeles por pulgada) */
  ppi: number;
  pageId: string;
  customPageMm: { width: number; height: number };
  /** orientación de la página */
  landscape: boolean;
  /** margen no imprimible */
  marginMm: number;
  /** solape entre segmentos para el ensamblaje */
  overlapMm: number;
  /** espejo horizontal (para imprimir por el reverso y que la tinta quede hacia la lente) */
  mirror: boolean;
  /** lado de la tinta/emulsión al montar: hacia la lente o hacia la lámpara */
  emulsion: 'toward-lens' | 'toward-lamp';
  /** perfil del medio (ver optics/medium) */
  mediumId: string;
  route: ProductionRoute;
  /** nombre del perfil ICC a declarar (informativo; el navegador no gestiona color) */
  colorProfile: string;
  cropMarks: boolean;
  alignmentMarks: boolean;
  /** rótulo de identificación en cada segmento */
  segmentLabels: boolean;
}

export function defaultPrintSpec(over: Partial<PrintSpec> = {}): PrintSpec {
  return { ppi: 600, pageId: 'a4', customPageMm: { width: 300, height: 300 }, landscape: true, marginMm: 8, overlapMm: 6, mirror: false, emulsion: 'toward-lens', mediumId: 'inkjet-transparency', route: 'sheets', colorProfile: 'sRGB IEC61966-2.1', cropMarks: true, alignmentMarks: true, segmentLabels: true, ...over };
}

export function pageOf(spec: PrintSpec): { widthMm: number; heightMm: number; label: string } {
  const p = PAGE_SIZES.find((x) => x.id === spec.pageId) ?? PAGE_SIZES[0];
  let w = p.id === 'custom' ? spec.customPageMm.width : p.widthMm;
  let h = p.id === 'custom' ? spec.customPageMm.height : p.heightMm;
  if (spec.landscape && w < h) [w, h] = [h, w];
  if (!spec.landscape && w > h) [w, h] = [h, w];
  return { widthMm: w, heightMm: h, label: p.label };
}

export interface Segment {
  index: number;
  fromMm: number;
  toMm: number;
  /** longitud impresa incluido el solape al final (salvo el último) */
  printedLengthMm: number;
  /** cortar por aquí al ensamblar (mm desde el inicio del segmento) */
  cutAtMm: number | null;
  /** fotogramas que caen (al menos en parte) en el segmento */
  frameSlots: number[];
}

export interface TilePlan {
  page: { widthMm: number; heightMm: number; label: string };
  /** longitud de tira por página (sin solape) */
  usableMm: number;
  /** filas de tira por página (si la tira es estrecha caben varias en paralelo) */
  rowsPerPage: number;
  segments: Segment[];
  pages: number;
  /** px por mm a la resolución pedida */
  pxPerMm: number;
  /** píxeles de la tira completa */
  stripPx: { width: number; height: number };
  warnings: string[];
}

export function tilePlan(layout: FilmLayout, spec: PrintSpec): TilePlan {
  const page = pageOf(spec);
  const pxPerMm = spec.ppi / 25.4;
  const warnings: string[] = [];
  const innerW = page.widthMm - 2 * spec.marginMm;
  const innerH = page.heightMm - 2 * spec.marginMm;
  const stripW = layout.spec.stripWidthMm;
  const rowGap = 6;
  const rows = Math.max(1, Math.floor((innerH + rowGap) / (stripW + rowGap)));
  const usable = innerW - spec.overlapMm;
  if (usable <= layout.spec.pitchMm) warnings.push('La página es demasiado estrecha para la tira con el solape pedido.');
  const segments: Segment[] = [];
  const total = layout.totalLengthMm;
  // cortes preferentes entre fotogramas: cada segmento termina en una frontera de paso para que el empalme no cruce una imagen
  let from = 0;
  let i = 0;
  while (from < total - 1e-6 && i < 10_000) {
    let to = Math.min(total, from + usable);
    if (to < total) {
      // retrocede hasta la frontera de fotograma más cercana (centro del hueco entre fotogramas)
      const boundary = nearestGapBelow(layout, to);
      if (boundary > from + layout.spec.pitchMm) to = boundary;
    }
    const printedEnd = Math.min(total, to + (to < total ? spec.overlapMm : 0));
    const slots = layout.frames.filter((f) => f.sMm < printedEnd && f.sMm + f.alongMm > from).map((f) => f.slot);
    segments.push({ index: i, fromMm: from, toMm: to, printedLengthMm: printedEnd - from, cutAtMm: to < total ? to - from : null, frameSlots: slots });
    from = to;
    i++;
  }
  const pages = Math.ceil(segments.length / rows);
  if (pxPerMm * layout.frameAlongMm > 4000) warnings.push('Resolución muy alta para el tamaño del fotograma: archivos enormes sin ganancia visible.');
  const medium = mediumById(spec.mediumId);
  if (spec.ppi < medium.dotsPerMm * 25.4 * 0.5) warnings.push(`A ${spec.ppi} ppi la imagen tiene menos resolución que el medio (${Math.round(medium.dotsPerMm * 25.4)} dpi): sube los PPI o acepta bordes suavizados.`);
  return { page, usableMm: usable, rowsPerPage: rows, segments, pages, pxPerMm, stripPx: { width: Math.ceil(total * pxPerMm), height: Math.ceil(stripW * pxPerMm) }, warnings };
}

function nearestGapBelow(layout: FilmLayout, s: number): number {
  // centro del hueco entre fotogramas: fin del fotograma k + gap/2
  let best = 0;
  for (const f of layout.frames) {
    const gapCenter = f.sMm + f.alongMm + Math.max(0, layout.gapMm) / 2;
    if (gapCenter <= s && gapCenter > best) best = gapCenter;
  }
  return best;
}

export interface CompatibilityReport {
  medium: MediumProfile;
  route: ProductionRoute;
  quality: 'desktop' | 'optical';
  level: 'ok' | 'warning' | 'error';
  messages: string[];
}

/** Compatibilidad entre ruta de producción y medio: no todo acetato va con toda impresora. */
export function compatibility(spec: PrintSpec, layout: FilmLayout): CompatibilityReport {
  const m = mediumById(spec.mediumId);
  const messages: string[] = [...m.notes];
  let level: CompatibilityReport['level'] = 'ok';
  if (spec.route === 'lab' && m.quality !== 'optical') {
    level = 'warning';
    messages.unshift('Has elegido laboratorio pero el perfil del medio es de escritorio: elige un perfil de laboratorio (película fotográfica o fotolito) para simular lo que entregarán.');
  }
  if (spec.route !== 'lab' && m.quality === 'optical') {
    level = 'warning';
    messages.unshift('El perfil es de laboratorio pero la ruta es de escritorio: en casa no alcanzarás esa densidad ni esa resolución.');
  }
  if (spec.route === 'direct-film') {
    messages.unshift('Impresión directa: la impresora debe aceptar el ancho y el grosor de la película (rollo o tira) y la tinta debe fijar sobre esa base. Solo algunas impresoras de inyección con alimentación recta admiten film de 0,1–0,2 mm.');
    if (layout.spec.stripWidthMm < 50) messages.push(`Una tira de ${layout.spec.stripWidthMm} mm no la toma el alimentador de hojas de una impresora doméstica: imprime sobre hoja y recorta (ruta "Hojas").`);
  }
  if (spec.route === 'sheets') {
    const plan = tilePlan(layout, spec);
    messages.unshift(`${plan.segments.length} segmento(s) en ${plan.pages} página(s) ${plan.page.label}; cada unión añade un empalme con ${spec.overlapMm} mm de solape: ${plan.segments.length - 1} empalme(s) intermedios más el de cierre.`);
    if (plan.segments.length > 1) messages.push('Cada empalme intermedio es una discontinuidad de espesor y transmisión: hazlo caer en el hueco entre fotogramas (el plan ya corta ahí) y alinéalo con las marcas.');
  }
  if (spec.mirror && spec.emulsion === 'toward-lamp') messages.push('Espejo activado y tinta hacia la lámpara: la imagen proyectada saldrá invertida horizontalmente. Normalmente la tinta va hacia la lente y el espejo se usa solo si se imprime por el reverso.');
  const quality = m.quality;
  if (quality === 'desktop') messages.push('Esto es una prueba de escritorio: sirve para validar el movimiento, el registro y el mecanismo, no el contraste ni la nitidez finales.');
  return { medium: m, route: spec.route, quality, level, messages };
}
