// Patrones de calibración como documentos de animación estáticos (una capa, sin movimiento) que se generan con el
// mismo pipeline: estrella de Siemens (enfoque y resolución), pares de líneas (resolución en lp/mm), cuña de
// densidades (contraste y Dmax), cruz y marco con graduación en mm (registro y tamaño de imagen), parches de color.
import { emptyDoc, identityTransform, makeLayer, type AnimationDoc, type Item } from '../animation/model';

export type CalibrationKind = 'siemens' | 'linepairs' | 'stepwedge' | 'registration' | 'color' | 'all';

export const CALIBRATION_LABELS: Record<CalibrationKind, string> = {
  siemens: 'Estrella de Siemens (enfoque)',
  linepairs: 'Pares de líneas (resolución)',
  stepwedge: 'Cuña de densidades (contraste)',
  registration: 'Cruz y marco graduado (registro y tamaño)',
  color: 'Parches de color',
  all: 'Carta completa',
};

export interface CalibrationOptions {
  width: number;
  height: number;
  /** mm que representa el ancho del lienzo (para graduar en mm) */
  widthMm: number;
  frames?: number;
  fps?: number;
}

export function calibrationDoc(kind: CalibrationKind, o: CalibrationOptions): AnimationDoc {
  const items: Item[] = [];
  const W = o.width;
  const H = o.height;
  const pxPerMm = W / o.widthMm;
  const add = (its: Item[]) => items.push(...its);
  if (kind === 'all') {
    add(siemens(W * 0.25, H * 0.5, Math.min(W, H) * 0.22, 36));
    add(linePairs(W * 0.5, H * 0.08, W * 0.46, H * 0.3, pxPerMm));
    add(stepWedge(W * 0.5, H * 0.45, W * 0.46, H * 0.16, 11));
    add(registration(W, H, pxPerMm));
    add(colorPatches(W * 0.5, H * 0.67, W * 0.46, H * 0.25));
  } else if (kind === 'siemens') add(siemens(W / 2, H / 2, Math.min(W, H) * 0.45, 48));
  else if (kind === 'linepairs') add(linePairs(W * 0.05, H * 0.1, W * 0.9, H * 0.8, pxPerMm));
  else if (kind === 'stepwedge') add(stepWedge(W * 0.05, H * 0.3, W * 0.9, H * 0.4, 21));
  else if (kind === 'registration') add(registration(W, H, pxPerMm));
  else add(colorPatches(W * 0.05, H * 0.1, W * 0.9, H * 0.8));
  const frames = o.frames ?? 1;
  const fps = o.fps ?? 24;
  return emptyDoc({ name: `Calibración · ${CALIBRATION_LABELS[kind]}`, width: W, height: H, fps, duration: frames / fps, loop: true, background: { transparent: true, color: '#000000' }, layers: [makeLayer('Calibración', items, { id: 'layer-cal' })] });
}

function siemens(cx: number, cy: number, r: number, spokes: number): Item[] {
  const pts = [];
  for (let i = 0; i < spokes; i++) {
    const a0 = (i / spokes) * Math.PI * 2;
    const a1 = ((i + 0.5) / spokes) * Math.PI * 2;
    pts.push({ id: `siemens-${i}`, name: `Radio ${i}`, type: 'polygon' as const, closed: true, points: [{ x: 0, y: 0 }, { x: r * Math.cos(a0), y: r * Math.sin(a0) }, { x: r * Math.cos(a1), y: r * Math.sin(a1) }], transform: identityTransform({ x: cx, y: cy }), style: { fill: '#000000' } });
  }
  pts.push({ id: 'siemens-ring', name: 'Anillo', type: 'circle' as const, rx: r, ry: r, transform: identityTransform({ x: cx, y: cy }), style: { fill: null, stroke: '#000000', strokeWidth: 2 } } as unknown as Item);
  return pts as Item[];
}

function linePairs(x: number, y: number, w: number, h: number, pxPerMm: number): Item[] {
  // grupos de 5 líneas a 1, 2, 3, 4, 5, 6, 8, 10 lp/mm (si la resolución lo permite)
  const freqs = [1, 2, 3, 4, 5, 6, 8, 10];
  const items: Item[] = [];
  const colW = w / freqs.length;
  freqs.forEach((f, i) => {
    const period = pxPerMm / f; // px por par de líneas
    const lw = period / 2;
    if (lw < 0.5) return;
    const x0 = x + i * colW + colW * 0.1;
    for (let k = 0; k < 5; k++) {
      const lx = x0 + k * period;
      if (lx + lw > x + (i + 1) * colW) break;
      items.push({ id: `lp-${f}-${k}`, name: `${f} lp/mm`, type: 'rect', w: lw, h: h * 0.7, transform: identityTransform({ x: lx + lw / 2, y: y + h * 0.4 }), style: { fill: '#000000' } });
    }
    items.push({ id: `lp-label-${f}`, name: 'etiqueta', type: 'text', text: `${f}`, fontSize: Math.max(8, h * 0.14), transform: identityTransform({ x: x0 + colW * 0.4, y: y + h * 0.9 }), style: { fill: '#000000' } });
  });
  return items;
}

function stepWedge(x: number, y: number, w: number, h: number, steps: number): Item[] {
  const items: Item[] = [];
  const sw = w / steps;
  for (let i = 0; i < steps; i++) {
    const v = Math.round((i / (steps - 1)) * 255);
    const hex = `#${v.toString(16).padStart(2, '0').repeat(3)}`;
    items.push({ id: `wedge-${i}`, name: `Paso ${i}`, type: 'rect', w: sw, h, transform: identityTransform({ x: x + sw * (i + 0.5), y: y + h / 2 }), style: { fill: hex } });
  }
  items.push({ id: 'wedge-frame', name: 'Marco', type: 'rect', w, h, transform: identityTransform({ x: x + w / 2, y: y + h / 2 }), style: { fill: null, stroke: '#000000', strokeWidth: 1 } });
  return items;
}

function registration(W: number, H: number, pxPerMm: number): Item[] {
  const items: Item[] = [];
  items.push({ id: 'frame', name: 'Marco', type: 'rect', w: W - 2, h: H - 2, transform: identityTransform({ x: W / 2, y: H / 2 }), style: { fill: null, stroke: '#000000', strokeWidth: 1.5 } });
  items.push({ id: 'cross-h', name: 'Cruz H', type: 'line', x1: 0, y1: H / 2, x2: W, y2: H / 2, transform: identityTransform(), style: { fill: null, stroke: '#000000', strokeWidth: 1 } });
  items.push({ id: 'cross-v', name: 'Cruz V', type: 'line', x1: W / 2, y1: 0, x2: W / 2, y2: H, transform: identityTransform(), style: { fill: null, stroke: '#000000', strokeWidth: 1 } });
  // graduación en mm sobre el eje horizontal
  const mmTotal = Math.floor(W / pxPerMm);
  for (let mm = 0; mm <= mmTotal; mm++) {
    const px = mm * pxPerMm;
    const len = mm % 10 === 0 ? 12 : mm % 5 === 0 ? 8 : 4;
    items.push({ id: `tick-${mm}`, name: `${mm} mm`, type: 'line', x1: px, y1: H / 2 - len, x2: px, y2: H / 2 + len, transform: identityTransform(), style: { fill: null, stroke: '#000000', strokeWidth: 1 } });
  }
  // esquinas
  const c = Math.min(W, H) * 0.08;
  for (const [sx, sy] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ]) {
    const cx = W / 2 - (sx * W) / 2 + sx * c;
    const cy = H / 2 - (sy * H) / 2 + sy * c;
    items.push({ id: `corner-${sx}-${sy}`, name: 'Esquina', type: 'circle', rx: c * 0.5, ry: c * 0.5, transform: identityTransform({ x: cx, y: cy }), style: { fill: null, stroke: '#000000', strokeWidth: 1.5 } });
    items.push({ id: `corner-dot-${sx}-${sy}`, name: 'Punto', type: 'circle', rx: 2, ry: 2, transform: identityTransform({ x: cx, y: cy }), style: { fill: '#000000' } });
  }
  return items;
}

function colorPatches(x: number, y: number, w: number, h: number): Item[] {
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#00ffff', '#ff00ff', '#ffff00', '#ff8000', '#8000ff', '#ffffff', '#808080', '#404040', '#000000'];
  const cols = 6;
  const rows = 2;
  const pw = w / cols;
  const ph = h / rows;
  return colors.map((col, i) => ({ id: `patch-${i}`, name: col, type: 'rect' as const, w: pw * 0.9, h: ph * 0.85, transform: identityTransform({ x: x + (i % cols) * pw + pw / 2, y: y + Math.floor(i / cols) * ph + ph / 2 }), style: { fill: col, stroke: '#000000', strokeWidth: 0.5 } }));
}
