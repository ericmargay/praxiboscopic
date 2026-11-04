// Construcción de la película física: a partir del conjunto de fotogramas y de la especificación de la tira calcula
// dónde va cada fotograma (posición a lo largo de la tira, rectángulo), perforaciones, marcas de registro y de
// sincronización óptica, longitud total, repeticiones de ciclo y la coherencia con el recorrido mecánico.
//
// Convención física (banda horizontal de canto, como el Théâtre Optique): la tira corre horizontalmente y su ancho es
// vertical. La imagen va derecha: su ancho (horizontal) corre A LO LARGO de la tira (`along`) y su alto (vertical)
// CRUZA la tira (`across`). `s` es la coordenada a lo largo de la tira (mm) desde la cabecera; `x` cruza la tira
// desde su borde superior. Los fotogramas ocupan `pitchMm` cada uno (ancho del fotograma + separación).
//
// Movimiento: un punto de la tira con coordenada σ está en la posición del recorrido s = φ − σ (la cabecera va
// delante, φ crece al avanzar). La ventana en s_gate ve σ = φ − s_gate, así que el índice de fotograma crece con φ.
import { z } from 'zod';

export interface PerforationSpec {
  enabled: boolean;
  /** perforaciones por paso de fotograma */
  perFrame: number;
  /** tamaño: alongMm a lo largo de la tira, acrossMm cruzando */
  alongMm: number;
  acrossMm: number;
  /** distancia del borde de la tira al centro de la perforación */
  edgeOffsetMm: number;
  bothEdges: boolean;
}

export interface FilmSpec {
  /** ancho total de la tira (cruza el sentido de avance; vertical cuando la banda va de canto) */
  stripWidthMm: number;
  /** paso entre fotogramas (de centro a centro) a lo largo de la tira */
  pitchMm: number;
  /** cabecera y cola transparentes (mm) para el empalme */
  leaderMm: number;
  trailerMm: number;
  /** ciclos completos de la animación repetidos en la tira */
  repeats: number;
  /** empalme del loop: solape (mm) que se descuenta de la longitud útil */
  spliceOverlapMm: number;
  spliceType: 'tape' | 'cement' | 'ultrasonic' | 'none';
  perforations: PerforationSpec;
  /** marcas de registro (cruces) en los márgenes a cada fotograma */
  registrationMarks: boolean;
  /** marcas de sincronización óptica (ventana opaca por fotograma para un sensor) */
  syncMarks: { enabled: boolean; alongMm: number; acrossMm: number; edge: 'top' | 'bottom'; perCycle: boolean };
  /** sentido de avance al montar (afecta a la numeración impresa y a la lectura de las marcas) */
  travel: 'forward' | 'reverse';
  /** borde opaco a lo largo de la tira (mm), para enmascarar luz parásita alrededor del fotograma */
  edgeMaskMm: number;
  /**
   * película laminada (ADR-0010): una cubierta transparente pegada sobre la cara de la tinta. Los rodillos de esa cara
   * tocan la cubierta y no la pintura. Grosores en mm; la cubierta incluye su adhesivo
   */
  laminate?: { baseMm: number; coverMm: number };
}

/** base de calibre 5 (0,127 mm) y laminado en frío de 75–80 µm con su adhesivo: 0,22 mm en total */
export const DEFAULT_LAMINATE = { baseMm: 0.127, coverMm: 0.09 } as const;

export const FilmSpecSchema = z.object({
  stripWidthMm: z.number().gt(0).max(500),
  pitchMm: z.number().gt(0).max(500),
  leaderMm: z.number().min(0).max(5000),
  trailerMm: z.number().min(0).max(5000),
  repeats: z.number().int().min(1).max(100),
  spliceOverlapMm: z.number().min(0).max(100),
  spliceType: z.enum(['tape', 'cement', 'ultrasonic', 'none']),
  perforations: z.object({ enabled: z.boolean(), perFrame: z.number().int().min(1).max(16), alongMm: z.number().gt(0), acrossMm: z.number().gt(0), edgeOffsetMm: z.number().min(0), bothEdges: z.boolean() }),
  registrationMarks: z.boolean(),
  syncMarks: z.object({ enabled: z.boolean(), alongMm: z.number().gt(0), acrossMm: z.number().gt(0), edge: z.enum(['top', 'bottom']), perCycle: z.boolean() }),
  travel: z.enum(['forward', 'reverse']),
  edgeMaskMm: z.number().min(0),
  laminate: z.object({ baseMm: z.number().gt(0).max(2), coverMm: z.number().gt(0).max(2) }).optional(),
});

export function defaultFilmSpec(over: Partial<FilmSpec> = {}): FilmSpec {
  return {
    stripWidthMm: 40,
    pitchMm: 36,
    leaderMm: 0,
    trailerMm: 0,
    repeats: 1,
    spliceOverlapMm: 0,
    spliceType: 'tape',
    perforations: { enabled: true, perFrame: 2, alongMm: 2.8, acrossMm: 1.98, edgeOffsetMm: 2.5, bothEdges: true },
    registrationMarks: false,
    syncMarks: { enabled: true, alongMm: 3, acrossMm: 2, edge: 'bottom', perCycle: false },
    travel: 'forward',
    edgeMaskMm: 0,
    ...over,
  };
}

export interface PlacedFrame {
  /** índice en la tira (0 … repeats·N − 1) */
  slot: number;
  /** índice del fotograma del conjunto (0 … N − 1) */
  frameIndex: number;
  cycle: number;
  /** centro del fotograma a lo largo de la tira (mm) */
  centerMm: number;
  /** rectángulo: s (inicio a lo largo), x (desde el borde superior de la tira) */
  sMm: number;
  xMm: number;
  /** ancho de la imagen (a lo largo de la tira) y alto (cruzando) */
  alongMm: number;
  acrossMm: number;
}

export interface Mark {
  kind: 'perforation' | 'registration' | 'sync' | 'splice' | 'label';
  sMm: number;
  xMm: number;
  alongMm: number;
  acrossMm: number;
  text?: string;
}

export interface FilmLayout {
  spec: FilmSpec;
  frameCount: number;
  /** imagen: ancho a lo largo de la tira, alto cruzando */
  frameAlongMm: number;
  frameAcrossMm: number;
  /** separación entre fotogramas consecutivos a lo largo de la tira */
  gapMm: number;
  frames: PlacedFrame[];
  marks: Mark[];
  /** longitud útil de los fotogramas (repeats · N · pitch) */
  imageLengthMm: number;
  /** longitud total de la tira a imprimir (cabecera + imágenes + cola) */
  totalLengthMm: number;
  /** longitud del loop una vez empalmado (total − solape) */
  loopLengthMm: number;
  /** superficie transparente restante (mm²) y fracción */
  clearAreaMm2: number;
  clearFraction: number;
  /** s del empalme (fin de la tira que se une al inicio) */
  spliceMm: number;
  warnings: LayoutWarning[];
}

export interface LayoutWarning {
  level: 'error' | 'warning' | 'info';
  code: string;
  message: string;
}

/** número de ranuras de fotograma de la tira */
export function slotCount(frameCount: number, spec: Pick<FilmSpec, 'repeats'>): number {
  return Math.max(0, frameCount) * Math.max(1, spec.repeats);
}

/** longitud total de la tira a imprimir (mm) */
export function stripLength(frameCount: number, spec: Pick<FilmSpec, 'pitchMm' | 'leaderMm' | 'trailerMm' | 'repeats'>): number {
  return spec.leaderMm + slotCount(frameCount, spec) * spec.pitchMm + spec.trailerMm;
}

/** longitud del loop cerrado (mm) */
export function loopLength(frameCount: number, spec: Pick<FilmSpec, 'pitchMm' | 'leaderMm' | 'trailerMm' | 'repeats' | 'spliceOverlapMm'>): number {
  return stripLength(frameCount, spec) - spec.spliceOverlapMm;
}

/** cuántos ciclos completos caben en una tira de longitud dada */
export function cyclesThatFit(lengthMm: number, frameCount: number, spec: Pick<FilmSpec, 'pitchMm' | 'leaderMm' | 'trailerMm' | 'spliceOverlapMm'>): number {
  const usable = lengthMm - spec.leaderMm - spec.trailerMm + spec.spliceOverlapMm;
  return Math.floor(usable / (frameCount * spec.pitchMm) + 1e-9);
}

export interface LayoutInput {
  frameCount: number;
  /** mm del fotograma ya orientado: ancho de la imagen a lo largo de la tira, alto cruzándola */
  alongMm: number;
  acrossMm: number;
  labels?: string[];
}

export function buildFilmLayout(input: LayoutInput, spec: FilmSpec): FilmLayout {
  const warnings: LayoutWarning[] = [];
  const N = Math.max(0, Math.round(input.frameCount));
  const along = input.alongMm;
  const across = input.acrossMm;
  const gap = spec.pitchMm - along;
  if (gap < 0) warnings.push({ level: 'error', code: 'pitch<frame', message: `El paso (${spec.pitchMm} mm) es menor que el ancho del fotograma a lo largo de la tira (${along} mm): los fotogramas se solapan ${(-gap).toFixed(2)} mm.` });
  else if (gap < 0.5) warnings.push({ level: 'warning', code: 'gap-tight', message: `Separación entre fotogramas de ${gap.toFixed(2)} mm: la ventana óptica verá parte del fotograma vecino salvo que sea más estrecha que el fotograma.` });

  const perfBand = spec.perforations.enabled ? spec.perforations.edgeOffsetMm + spec.perforations.acrossMm / 2 : 0;
  const sideBand = Math.max(perfBand + 0.5, spec.edgeMaskMm);
  const avail = spec.stripWidthMm - 2 * sideBand;
  if (across > spec.stripWidthMm) warnings.push({ level: 'error', code: 'frame>strip', message: `El fotograma (${across} mm de alto) es mayor que el ancho de la tira (${spec.stripWidthMm} mm).` });
  else if (across > avail + 1e-6) warnings.push({ level: 'warning', code: 'frame-over-perfs', message: `El fotograma (${across} mm de alto) invade la banda de perforaciones/máscara (${sideBand.toFixed(1)} mm por lado): quedan ${avail.toFixed(1)} mm libres.` });
  const xFrame = (spec.stripWidthMm - across) / 2;

  const frames: PlacedFrame[] = [];
  const marks: Mark[] = [];
  const slots = slotCount(N, spec);
  for (let slot = 0; slot < slots; slot++) {
    const cycle = Math.floor(slot / Math.max(1, N));
    const frameIndex = N ? slot % N : 0;
    const s0 = spec.leaderMm + slot * spec.pitchMm;
    const center = s0 + spec.pitchMm / 2;
    frames.push({ slot, frameIndex, cycle, centerMm: center, sMm: center - along / 2, xMm: xFrame, alongMm: along, acrossMm: across });
    if (spec.perforations.enabled) {
      const per = Math.max(1, spec.perforations.perFrame);
      for (let k = 0; k < per; k++) {
        const ps = s0 + ((k + 0.5) * spec.pitchMm) / per - spec.perforations.alongMm / 2;
        marks.push({ kind: 'perforation', sMm: ps, xMm: spec.perforations.edgeOffsetMm - spec.perforations.acrossMm / 2, alongMm: spec.perforations.alongMm, acrossMm: spec.perforations.acrossMm });
        if (spec.perforations.bothEdges) marks.push({ kind: 'perforation', sMm: ps, xMm: spec.stripWidthMm - spec.perforations.edgeOffsetMm - spec.perforations.acrossMm / 2, alongMm: spec.perforations.alongMm, acrossMm: spec.perforations.acrossMm });
      }
    }
    if (spec.registrationMarks) {
      marks.push({ kind: 'registration', sMm: center - 1.5, xMm: Math.max(0.2, xFrame / 2 - 1.5), alongMm: 3, acrossMm: 3 });
      marks.push({ kind: 'registration', sMm: center - 1.5, xMm: Math.min(spec.stripWidthMm - 3.2, spec.stripWidthMm - xFrame / 2 - 1.5), alongMm: 3, acrossMm: 3 });
    }
    if (spec.syncMarks.enabled && (!spec.syncMarks.perCycle || frameIndex === 0)) {
      const sm = spec.syncMarks;
      const x = sm.edge === 'bottom' ? spec.stripWidthMm - sideBand - sm.acrossMm - 0.3 : sideBand + 0.3;
      marks.push({ kind: 'sync', sMm: center - sm.alongMm / 2, xMm: Math.max(0, Math.min(spec.stripWidthMm - sm.acrossMm, x)), alongMm: sm.alongMm, acrossMm: sm.acrossMm });
    }
    const label = input.labels?.[frameIndex] ?? String(frameIndex + 1);
    marks.push({ kind: 'label', sMm: s0 + 0.4, xMm: 0.4, alongMm: Math.min(10, spec.pitchMm - 1), acrossMm: Math.max(1, Math.min(1.8, xFrame - 0.5)), text: label });
  }
  const total = stripLength(N, spec);
  const loop = total - spec.spliceOverlapMm;
  if (spec.spliceOverlapMm > 0) marks.push({ kind: 'splice', sMm: total - spec.spliceOverlapMm, xMm: 0, alongMm: spec.spliceOverlapMm, acrossMm: spec.stripWidthMm, text: 'empalme' });
  if (spec.spliceOverlapMm > 0 && spec.spliceOverlapMm > spec.leaderMm + spec.trailerMm + 1e-9)
    warnings.push({ level: 'warning', code: 'splice-eats-frame', message: `El solape del empalme (${spec.spliceOverlapMm} mm) es mayor que cabecera + cola (${spec.leaderMm + spec.trailerMm} mm): tapará parte de un fotograma.` });
  if (spec.spliceType === 'tape' && spec.spliceOverlapMm === 0 && total > 0) warnings.push({ level: 'info', code: 'butt-splice', message: 'Empalme a tope con cinta: la cinta añade espesor local (~0.05–0.1 mm) y un cambio de rigidez que se nota como una pequeña perturbación de velocidad al pasar por los rodillos.' });

  const imageArea = slots * along * across;
  const marksArea = marks.filter((m) => m.kind !== 'label' && m.kind !== 'splice').reduce((a, m) => a + m.alongMm * m.acrossMm, 0);
  const stripArea = total * spec.stripWidthMm;
  const clear = Math.max(0, stripArea - imageArea - marksArea);

  return {
    spec,
    frameCount: N,
    frameAlongMm: along,
    frameAcrossMm: across,
    gapMm: gap,
    frames,
    marks,
    imageLengthMm: slots * spec.pitchMm,
    totalLengthMm: total,
    loopLengthMm: loop,
    clearAreaMm2: clear,
    clearFraction: stripArea > 0 ? clear / stripArea : 0,
    spliceMm: total - spec.spliceOverlapMm,
    warnings,
  };
}

/**
 * Coherencia entre la película y el recorrido mecánico (loop cerrado): la longitud del loop debe coincidir con la
 * longitud del camino de la película. Devuelve el error y propuestas: repetir ciclos, ajustar paso o mover rodillos.
 */
export interface CoherenceReport {
  loopLengthMm: number;
  pathLengthMm: number;
  errorMm: number;
  /** fotogramas (fraccionarios) que sobran (+) o faltan (−) para llenar el recorrido */
  framesOff: number;
  ok: boolean;
  level: 'ok' | 'warning' | 'error';
  message: string;
  suggestions: string[];
}

export function checkCoherence(layout: FilmLayout, pathLengthMm: number, toleranceMm = 0.5): CoherenceReport {
  const err = layout.loopLengthMm - pathLengthMm;
  const framesOff = err / layout.spec.pitchMm;
  const suggestions: string[] = [];
  const N = layout.frameCount;
  const abs = Math.abs(err);
  let level: CoherenceReport['level'] = 'ok';
  let message = `Película y recorrido coinciden (${layout.loopLengthMm.toFixed(1)} mm, error ${err.toFixed(2)} mm).`;
  if (abs > toleranceMm) {
    level = abs > layout.spec.pitchMm * 0.25 ? 'error' : 'warning';
    message = err > 0 ? `La película (${layout.loopLengthMm.toFixed(1)} mm) es ${abs.toFixed(1)} mm más larga que el recorrido (${pathLengthMm.toFixed(1)} mm): quedaría floja (${framesOff.toFixed(2)} fotogramas de más).` : `La película (${layout.loopLengthMm.toFixed(1)} mm) es ${abs.toFixed(1)} mm más corta que el recorrido (${pathLengthMm.toFixed(1)} mm): no cierra (${(-framesOff).toFixed(2)} fotogramas de menos).`;
    const cycles = N > 0 ? pathLengthMm / (N * layout.spec.pitchMm) : 0;
    const nearest = Math.max(1, Math.round(cycles));
    if (N > 0 && Math.abs(cycles - nearest) * N * layout.spec.pitchMm <= toleranceMm) suggestions.push(`Repetir ${nearest} ciclo(s) completos (${nearest * N} fotogramas) llena el recorrido exactamente.`);
    else if (N > 0) suggestions.push(`Con ${nearest} ciclo(s) harían falta ${(nearest * N * layout.spec.pitchMm).toFixed(1)} mm; el recorrido mide ${pathLengthMm.toFixed(1)} mm (${(cycles * N).toFixed(2)} fotogramas).`);
    if (N > 0) {
      const pitchFit = (pathLengthMm - layout.spec.leaderMm - layout.spec.trailerMm + layout.spec.spliceOverlapMm) / (N * layout.spec.repeats);
      suggestions.push(`Ajustar el paso a ${pitchFit.toFixed(3)} mm (ancho ${layout.frameAlongMm} mm + separación ${(pitchFit - layout.frameAlongMm).toFixed(3)} mm) cierra el loop con ${N * layout.spec.repeats} fotogramas.`);
    }
    suggestions.push(`Ajustar los rodillos para que el recorrido mida ${layout.loopLengthMm.toFixed(1)} mm (diferencia ${err > 0 ? '+' : ''}${err.toFixed(1)} mm, repartida en el perímetro).`);
    if (layout.spec.leaderMm + layout.spec.trailerMm > 0) suggestions.push(`Cabecera + cola suman ${(layout.spec.leaderMm + layout.spec.trailerMm).toFixed(1)} mm: ajustarlas a ${Math.max(0, layout.spec.leaderMm + layout.spec.trailerMm - err).toFixed(1)} mm cierra el loop sin tocar los fotogramas.`);
  }
  return { loopLengthMm: layout.loopLengthMm, pathLengthMm, errorMm: err, framesOff, ok: level === 'ok', level, message, suggestions };
}

/** fotograma (slot) cuyo centro está más cerca de una coordenada σ de la tira (módulo loop) */
export function slotAt(layout: FilmLayout, sigmaMm: number): { slot: number; offsetMm: number } | null {
  if (!layout.frames.length) return null;
  const L = layout.loopLengthMm;
  const s = ((sigmaMm % L) + L) % L;
  let best = layout.frames[0];
  let bestD = Infinity;
  for (const f of layout.frames) {
    let d = s - f.centerMm;
    d -= Math.round(d / L) * L;
    if (Math.abs(d) < Math.abs(bestD)) {
      bestD = d;
      best = f;
    }
  }
  return { slot: best.slot, offsetMm: bestD };
}

/** coordenada de tira σ que está frente a la ventana para una posición de cinta φ */
export function sigmaAtGate(layout: FilmLayout, gateMm: number, phiMm: number): number {
  const L = layout.loopLengthMm;
  if (L <= 0) return 0;
  return (((phiMm - gateMm) % L) + L) % L;
}

/** posición de cinta φ que centra el fotograma `slot` en la ventana */
export function phiForSlotAtGate(layout: FilmLayout, gateMm: number, slot = 0): number {
  const f = layout.frames[slot] ?? layout.frames[0];
  if (!f) return gateMm;
  return gateMm + f.centerMm;
}
