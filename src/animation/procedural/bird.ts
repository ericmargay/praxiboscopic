// Ave volando: alas que baten periódicamente (morph de polígonos), cuerpo que sube y baja y nubes que pasan.
// Todo con un número entero de ciclos por loop.
import { identityTransform, makeLayer, type Item, type Vec2 } from '../model';
import { TIME_PARAMS, bool, num, str, timeOf, type GeneratorDef, type ParamValue } from './types';

export const birdGenerator: GeneratorDef = {
  id: 'bird',
  label: 'Ave volando',
  description: 'Alas que baten con morph de polígonos, cuerpo que oscila y nubes de fondo que se desplazan en loop.',
  params: [
    { key: 'size', label: 'Tamaño', type: 'number', min: 40, max: 260, step: 1, unit: 'px', group: 'Ave' },
    { key: 'color', label: 'Color del ave', type: 'color', group: 'Ave' },
    { key: 'flaps', label: 'Aleteos por ciclo', type: 'number', min: 1, max: 8, step: 1, group: 'Movimiento' },
    { key: 'wingAngle', label: 'Amplitud del aleteo', type: 'number', min: 10, max: 80, step: 1, unit: '°', group: 'Movimiento' },
    { key: 'bob', label: 'Oscilación vertical', type: 'number', min: 0, max: 60, step: 1, unit: 'px', group: 'Movimiento' },
    { key: 'clouds', label: 'Nubes de fondo', type: 'boolean', group: 'Escena' },
    { key: 'cloudPasses', label: 'Nubes: pasos de fondo por ciclo', type: 'number', min: 1, max: 4, step: 1, group: 'Escena', help: 'Entero para que el fondo cierre el loop' },
    ...TIME_PARAMS,
  ],
  defaults: { size: 150, color: '#1f2a44', flaps: 2, wingAngle: 55, bob: 14, clouds: true, cloudPasses: 1, fps: 24, frames: 24 },
  build(p: Record<string, ParamValue>) {
    const { fps, duration } = timeOf(p);
    const width = 480;
    const height = 300;
    const S = num(p, 'size', 150);
    const color = str(p, 'color', '#1f2a44');
    const flaps = Math.max(1, Math.round(num(p, 'flaps', 2)));
    const amp = num(p, 'wingAngle', 55);
    const bob = num(p, 'bob', 14);
    const items: Item[] = [];
    const bg: Item[] = [];

    if (bool(p, 'clouds', true)) {
      // dos filas de nubes idénticas que recorren el fondo y vuelven a entrar por la derecha: cada fila tiene
      // `count` nubes separadas `sp` sobre un periodo count·sp, y el conjunto avanza `passes` separaciones por ciclo.
      // Como todas las nubes de una fila son iguales, el conjunto al cerrar el ciclo es idéntico al inicial.
      const passes = Math.max(1, Math.round(num(p, 'cloudPasses', 1)));
      const rows: { y: number; count: number; scale: number; opacity: number }[] = [
        { y: 58, count: 5, scale: 0.8, opacity: 0.7 },
        { y: 150, count: 4, scale: 1.1, opacity: 0.9 },
      ];
      rows.forEach((row, r) => {
        const sp = width / (row.count - 2); // una nube fuera por cada lado
        const total = row.count * sp;
        for (let i = 0; i < row.count; i++) {
          bg.push({
            id: `cloud-${r}-${i}`,
            name: `Nube ${r + 1}.${i + 1}`,
            type: 'group',
            // x = −sp + total · frac(i/count − passes·u/count): recorre `passes` separaciones hacia la izquierda y envuelve
            transform: identityTransform({ x: { expr: { kind: 'saw', from: -sp, to: -sp + total, cycles: -passes / row.count, phase: i / row.count } }, y: row.y, scaleX: row.scale, scaleY: row.scale, opacity: row.opacity }),
            style: {},
            children: [
              { id: `cloud-${r}-${i}-a`, name: 'a', type: 'circle', rx: 34, ry: 22, transform: identityTransform(), style: { fill: '#dfe7f2' } },
              { id: `cloud-${r}-${i}-b`, name: 'b', type: 'circle', rx: 26, ry: 18, transform: identityTransform({ x: -30, y: 6 }), style: { fill: '#dfe7f2' } },
              { id: `cloud-${r}-${i}-c`, name: 'c', type: 'circle', rx: 24, ry: 16, transform: identityTransform({ x: 32, y: 8 }), style: { fill: '#dfe7f2' } },
            ],
          });
        }
      });
    }

    const cx = width / 2;
    const cy = height / 2 + 10;
    const bodyY = bob > 0 ? { expr: { kind: 'sin' as const, amp: bob, cycles: flaps, phase: 0.25, offset: cy } } : cy;
    const u = S / 150;

    const wing = (side: 1 | -1): Item => {
      // morph entre ala arriba y ala abajo (polígono de 6 puntos), fase: ambas alas sincronizadas
      const up: Vec2[] = [
        { x: 0, y: 0 },
        { x: side * 20 * u, y: -10 * u },
        { x: side * 70 * u, y: -60 * u },
        { x: side * 92 * u, y: -52 * u },
        { x: side * 48 * u, y: -6 * u },
        { x: side * 16 * u, y: 10 * u },
      ];
      const k = amp / 55;
      const down: Vec2[] = up.map((pt, i) => (i === 0 ? pt : { x: pt.x * (1 - 0.1 * k), y: -pt.y * 0.9 * k + 6 * u }));
      const T = duration / flaps;
      const keys = [];
      for (let f = 0; f < flaps; f++) {
        keys.push({ t: f * T, v: up, e: 'easeInOutSine' as const });
        keys.push({ t: f * T + T * 0.45, v: down, e: 'easeInOutSine' as const });
      }
      return { id: `wing-${side > 0 ? 'r' : 'l'}`, name: side > 0 ? 'Ala derecha' : 'Ala izquierda', type: 'polygon', points: { keys }, closed: true, transform: identityTransform({ x: side * 6 * u, y: -4 * u }), style: { fill: color, stroke: color, strokeWidth: 2 * u, lineJoin: 'round' } };
    };

    const bird: Item = {
      id: 'bird',
      name: 'Ave',
      type: 'group',
      transform: identityTransform({ x: cx, y: bodyY }),
      style: {},
      children: [
        wing(-1),
        wing(1),
        { id: 'body', name: 'Cuerpo', type: 'circle', rx: 38 * u, ry: 18 * u, transform: identityTransform(), style: { fill: color } },
        { id: 'tail', name: 'Cola', type: 'polygon', points: [{ x: -34 * u, y: 0 }, { x: -62 * u, y: -12 * u }, { x: -66 * u, y: 10 * u }], closed: true, transform: identityTransform(), style: { fill: color } },
        { id: 'head', name: 'Cabeza', type: 'circle', rx: 16 * u, ry: 15 * u, transform: identityTransform({ x: 40 * u, y: -8 * u }), style: { fill: color } },
        { id: 'beak', name: 'Pico', type: 'polygon', points: [{ x: 54 * u, y: -8 * u }, { x: 72 * u, y: -4 * u }, { x: 54 * u, y: -1 * u }], closed: true, transform: identityTransform(), style: { fill: '#f0a830' } },
        { id: 'eye', name: 'Ojo', type: 'circle', rx: 3 * u, ry: 3 * u, transform: identityTransform({ x: 46 * u, y: -11 * u }), style: { fill: '#ffffff' } },
      ],
    };
    items.push(bird);
    const layers = [];
    if (bg.length) layers.push(makeLayer('Fondo', bg, { id: 'layer-sky', procedural: true }));
    layers.push(makeLayer('Ave', items, { id: 'layer-bird', procedural: true }));
    return { width, height, fps, duration, layers };
  },
};
