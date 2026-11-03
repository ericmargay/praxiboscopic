// Animación abstracta: formas geométricas dispuestas en anillo que se transforman (morph triángulo → hexágono →
// círculo), pulsan y giran, produciendo una secuencia visual repetitiva con loop exacto.
import { identityTransform, makeLayer, type Item, type Vec2 } from '../model';
import { regularPolygon } from './gear';
import { TIME_PARAMS, bool, num, str, timeOf, type GeneratorDef, type ParamValue } from './types';

const PALETTES: Record<string, string[]> = {
  warm: ['#ff5e3a', '#ff9f1c', '#ffd166', '#ef476f'],
  cool: ['#2ec4b6', '#3a86ff', '#8338ec', '#80ffdb'],
  mono: ['#ffffff', '#d0d0d0', '#a0a0a0', '#f5f5f5'],
  bauhaus: ['#d7263d', '#f4d35e', '#1b6ca8', '#f2f2f2'],
};

/** polígono de `n` lados remuestreado a `m` vértices (para morph entre polígonos de distinto número de lados) */
export function resamplePolygon(poly: Vec2[], m: number): Vec2[] {
  const out: Vec2[] = [];
  const n = poly.length;
  const total = n; // perímetro en "lados"
  for (let i = 0; i < m; i++) {
    const f = (i / m) * total;
    const k = Math.floor(f) % n;
    const t = f - Math.floor(f);
    const a = poly[k];
    const b = poly[(k + 1) % n];
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

export const abstractGenerator: GeneratorDef = {
  id: 'abstract',
  label: 'Abstracta geométrica',
  description: 'Formas en anillo que hacen morph (triángulo → hexágono → círculo), pulsan y giran en loop.',
  params: [
    { key: 'count', label: 'Número de formas', type: 'number', min: 1, max: 16, step: 1, group: 'Composición' },
    { key: 'ringRadius', label: 'Radio del anillo', type: 'number', min: 0, max: 130, step: 1, unit: 'px', group: 'Composición' },
    { key: 'shapeSize', label: 'Tamaño de cada forma', type: 'number', min: 8, max: 120, step: 1, unit: 'px', group: 'Composición' },
    { key: 'palette', label: 'Paleta', type: 'select', options: Object.keys(PALETTES).map((k) => ({ value: k, label: k })), group: 'Composición' },
    { key: 'rotations', label: 'Vueltas del anillo por ciclo', type: 'number', min: 0, max: 4, step: 1, group: 'Movimiento' },
    { key: 'pulse', label: 'Pulsación (escala)', type: 'number', min: 0, max: 0.8, step: 0.01, group: 'Movimiento' },
    { key: 'pulses', label: 'Pulsos por ciclo', type: 'number', min: 1, max: 8, step: 1, group: 'Movimiento' },
    { key: 'morph', label: 'Morph de forma', type: 'boolean', group: 'Movimiento' },
    { key: 'blend', label: 'Mezcla aditiva (screen)', type: 'boolean', group: 'Movimiento' },
    { key: 'center', label: 'Forma central', type: 'boolean', group: 'Composición' },
    ...TIME_PARAMS,
  ],
  defaults: { count: 6, ringRadius: 90, shapeSize: 48, palette: 'warm', rotations: 1, pulse: 0.35, pulses: 2, morph: true, blend: true, center: true, fps: 24, frames: 24 },
  build(p: Record<string, ParamValue>) {
    const { fps, duration } = timeOf(p);
    const width = 480;
    const height = 300;
    const count = Math.max(1, Math.round(num(p, 'count', 6)));
    const ringR = num(p, 'ringRadius', 90);
    const size = num(p, 'shapeSize', 48);
    const palette = PALETTES[str(p, 'palette', 'warm')] ?? PALETTES.warm;
    const rotations = Math.round(num(p, 'rotations', 1));
    const pulse = num(p, 'pulse', 0.35);
    const pulses = Math.max(1, Math.round(num(p, 'pulses', 2)));
    const morph = bool(p, 'morph', true);
    const blend = bool(p, 'blend', true);
    const M = 24;
    const tri = resamplePolygon(regularPolygon(3, size), M);
    const hex = resamplePolygon(regularPolygon(6, size), M);
    const circ = regularPolygon(M, size);
    const children: Item[] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const phase = i / count;
      const morphKeys = [
        { t: 0, v: tri, e: 'easeInOutSine' as const },
        { t: duration / 3, v: hex, e: 'easeInOutSine' as const },
        { t: (2 * duration) / 3, v: circ, e: 'easeInOutSine' as const },
      ];
      children.push({
        id: `shape-${i}`,
        name: `Forma ${i + 1}`,
        type: 'polygon',
        points: morph ? { keys: morphKeys } : hex,
        closed: true,
        transform: identityTransform({
          x: ringR * Math.cos(a),
          y: ringR * Math.sin(a),
          rotation: { expr: { kind: 'saw', from: 0, to: -360 * rotations * 2, cycles: 1 } },
          scaleX: { expr: { kind: 'sin', amp: pulse, cycles: pulses, phase, offset: 1 } },
          scaleY: { expr: { kind: 'sin', amp: pulse, cycles: pulses, phase, offset: 1 } },
          opacity: { expr: { kind: 'sin', amp: 0.2, cycles: pulses, phase: phase + 0.25, offset: 0.8 } },
        }),
        style: { fill: palette[i % palette.length], blend: blend ? 'screen' : 'source-over' },
      });
    }
    const items: Item[] = [
      {
        id: 'ring',
        name: 'Anillo',
        type: 'group',
        transform: identityTransform({ x: width / 2, y: height / 2, rotation: { expr: { kind: 'saw', from: 0, to: 360 * rotations, cycles: 1 } } }),
        style: {},
        children,
      },
    ];
    if (bool(p, 'center', true)) {
      items.push({
        id: 'center',
        name: 'Centro',
        type: 'circle',
        rx: size * 0.6,
        ry: size * 0.6,
        transform: identityTransform({ x: width / 2, y: height / 2, scaleX: { expr: { kind: 'sin', amp: pulse * 0.6, cycles: pulses, phase: 0.5, offset: 1 } }, scaleY: { expr: { kind: 'sin', amp: pulse * 0.6, cycles: pulses, phase: 0.5, offset: 1 } } }),
        style: { fill: palette[palette.length - 1], blend: blend ? 'screen' : 'source-over' },
      });
    }
    return { width, height, fps, duration, layers: [makeLayer('Abstracta', items, { id: 'layer-abstract', procedural: true })] };
  },
};
