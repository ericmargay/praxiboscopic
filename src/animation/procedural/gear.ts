// Engranaje (o polígono) rotando con movimiento circular continuo. Loop perfecto: gira un número entero de pasos de
// diente por ciclo, así el fotograma N coincide con el 0 visualmente y la velocidad es constante.
import { identityTransform, makeLayer, type Item, type Vec2 } from '../model';
import { gcd } from '../../core/math';
import { TIME_PARAMS, bool, num, str, timeOf, type GeneratorDef, type ParamValue } from './types';

/** contorno de engranaje con dientes trapezoidales (aproximación de evolvente suficiente para animación) */
export function gearOutline(teeth: number, outerR: number, depth: number, pointsPerTooth = 6): Vec2[] {
  const pts: Vec2[] = [];
  const rootR = outerR - depth;
  const n = Math.max(3, Math.round(teeth));
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const step = (Math.PI * 2) / n;
    // perfil: raíz (0–0.2), flanco (0.2–0.35), cresta (0.35–0.65), flanco (0.65–0.8), raíz (0.8–1)
    const prof: [number, number][] = [
      [0.0, rootR],
      [0.2, rootR],
      [0.33, outerR],
      [0.67, outerR],
      [0.8, rootR],
    ];
    for (const [f, r] of prof.slice(0, pointsPerTooth)) {
      const a = a0 + f * step;
      pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
    }
  }
  return pts;
}

export function regularPolygon(sides: number, r: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
    pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return pts;
}

export const gearGenerator: GeneratorDef = {
  id: 'gear',
  label: 'Engranaje rotando',
  description: 'Rotación continua de un engranaje (o polígono) con un segundo engranaje opcional engranado en contrarrotación.',
  params: [
    { key: 'shape', label: 'Forma', type: 'select', options: [{ value: 'gear', label: 'Engranaje' }, { value: 'polygon', label: 'Polígono' }, { value: 'star', label: 'Estrella' }], group: 'Forma' },
    { key: 'teeth', label: 'Dientes / lados', type: 'number', min: 3, max: 40, step: 1, group: 'Forma' },
    { key: 'radius', label: 'Radio exterior', type: 'number', min: 20, max: 140, step: 1, unit: 'px', group: 'Forma' },
    { key: 'color', label: 'Color', type: 'color', group: 'Forma' },
    { key: 'hub', label: 'Cubo y rayos', type: 'boolean', group: 'Forma' },
    { key: 'turnsTeeth', label: 'Avance por ciclo (en dientes)', type: 'number', min: 1, max: 40, step: 1, group: 'Movimiento', help: 'Entero: cada ciclo avanza este número de pasos de diente; el loop cierra exacto' },
    { key: 'direction', label: 'Sentido', type: 'select', options: [{ value: 'cw', label: 'Horario' }, { value: 'ccw', label: 'Antihorario' }], group: 'Movimiento' },
    { key: 'second', label: 'Segundo engranaje engranado', type: 'boolean', group: 'Movimiento' },
    { key: 'secondTeeth', label: 'Dientes del segundo', type: 'number', min: 3, max: 40, step: 1, group: 'Movimiento' },
    ...TIME_PARAMS,
  ],
  defaults: { shape: 'gear', teeth: 12, radius: 90, color: '#d4a53a', hub: true, turnsTeeth: 1, direction: 'cw', second: true, secondTeeth: 8, fps: 24, frames: 24 },
  build(p: Record<string, ParamValue>) {
    const { fps, duration } = timeOf(p);
    const width = 480;
    const height = 300;
    const shape = str(p, 'shape', 'gear');
    const teeth = Math.max(3, Math.round(num(p, 'teeth', 12)));
    const R = num(p, 'radius', 90);
    const color = str(p, 'color', '#d4a53a');
    const turnsTeeth = Math.max(1, Math.round(num(p, 'turnsTeeth', 1)));
    const dir = str(p, 'direction', 'cw') === 'cw' ? 1 : -1;
    const second = bool(p, 'second', true) && shape === 'gear';
    const depth = Math.min(R * 0.3, 2.25 * ((2 * R) / (teeth + 2)));
    const pitchR = R - depth / 2;
    const degPerCycle = dir * turnsTeeth * (360 / teeth);

    const cx = second ? width / 2 - (second ? 40 : 0) : width / 2;
    const cy = height / 2;
    const outline = shape === 'gear' ? gearOutline(teeth, R, depth) : shape === 'star' ? starOutline(teeth, R, R * 0.5) : regularPolygon(teeth, R);
    const children: Item[] = [{ id: 'gear-body', name: 'Cuerpo', type: 'polygon', points: outline, closed: true, transform: identityTransform(), style: { fill: color, stroke: '#2a2a2a', strokeWidth: 2, lineJoin: 'round' } }];
    if (bool(p, 'hub', true)) {
      // El avance por ciclo es turnsTeeth/teeth de vuelta = (turnsTeeth/g)/(teeth/g) con g = mcd. Un patrón con N
      // rayos es invariante bajo ese giro solo si q = teeth/g divide a N: usamos q rayos (o ninguno si son demasiados)
      // para que el loop cierre exacto también en el cubo.
      const g = gcd(teeth, turnsTeeth);
      const q = teeth / g;
      const spokes = q <= 16 ? q : 0;
      for (let i = 0; i < spokes; i++) children.push({ id: `spoke-${i}`, name: `Rayo ${i + 1}`, type: 'rect', w: Math.max(2, (R * 0.16 * 4) / spokes), h: R * 1.3, transform: identityTransform({ rotation: (i * 180) / spokes }), style: { fill: '#2a2a2a', blend: 'multiply' } });
      children.push({ id: 'hub', name: 'Cubo', type: 'circle', rx: R * 0.22, ry: R * 0.22, transform: identityTransform(), style: { fill: color, stroke: '#2a2a2a', strokeWidth: 2 } });
      children.push({ id: 'axle', name: 'Eje', type: 'circle', rx: R * 0.07, ry: R * 0.07, transform: identityTransform(), style: { fill: '#2a2a2a' } });
    }
    const items: Item[] = [
      {
        id: 'gear',
        name: 'Engranaje',
        type: 'group',
        transform: identityTransform({ x: cx, y: cy, rotation: { expr: { kind: 'saw', from: 0, to: degPerCycle, cycles: 1 } } }),
        style: {},
        children,
      },
    ];
    if (second) {
      const t2 = Math.max(3, Math.round(num(p, 'secondTeeth', 8)));
      // mismo módulo: radio de paso proporcional a los dientes; contrarrotación y fase de medio diente para engranar
      const module = (2 * pitchR) / teeth;
      const pitch2 = (module * t2) / 2;
      const R2 = pitch2 + depth / 2;
      const deg2 = -degPerCycle * (teeth / t2);
      const children2: Item[] = [{ id: 'gear2-body', name: 'Cuerpo', type: 'polygon', points: gearOutline(t2, R2, depth), closed: true, transform: identityTransform(), style: { fill: '#c0c0c0', stroke: '#2a2a2a', strokeWidth: 2, lineJoin: 'round' } }];
      children2.push({ id: 'hub2', name: 'Cubo', type: 'circle', rx: R2 * 0.2, ry: R2 * 0.2, transform: identityTransform(), style: { fill: '#2a2a2a' } });
      items.push({
        id: 'gear2',
        name: 'Engranaje secundario',
        type: 'group',
        transform: identityTransform({ x: cx + pitchR + pitch2, y: cy, rotation: { expr: { kind: 'saw', from: (180 / t2) * (t2 % 2 === 0 ? 1 : 0) + 180 / t2, to: (180 / t2) * (t2 % 2 === 0 ? 1 : 0) + 180 / t2 + deg2, cycles: 1 } } }),
        style: {},
        children: children2,
      });
    }
    return { width, height, fps, duration, layers: [makeLayer('Engranajes', items, { id: 'layer-gear', procedural: true })] };
  },
};

export function starOutline(points: number, outerR: number, innerR: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return pts;
}
