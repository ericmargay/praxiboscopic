// Pelota rebotando con squash & stretch. Loop perfecto: `bounces` rebotes enteros por ciclo; cada rebote es una
// parábola (o la curva elegida) que vuelve al suelo exactamente al final del ciclo.
import { makeLayer, type Item, type Keyframe, type Track, identityTransform } from '../model';
import { TIME_PARAMS, bool, num, str, timeOf, type GeneratorDef, type ParamValue } from './types';

const CURVES = [
  { value: 'parabola', label: 'Parábola balística' },
  { value: 'sine', label: 'Seno rectificado' },
  { value: 'easeOutQuad', label: 'Easing cuadrático' },
  { value: 'easeOutCubic', label: 'Easing cúbico' },
  { value: 'easeInOutSine', label: 'Seno suave (flotante)' },
];

export const ballGenerator: GeneratorDef = {
  id: 'ball',
  label: 'Pelota rebotando',
  description: 'Movimiento vertical con squash & stretch, sombra de contacto y suelo.',
  params: [
    { key: 'radius', label: 'Radio', type: 'number', min: 4, max: 120, step: 1, unit: 'px', group: 'Pelota' },
    { key: 'color', label: 'Color', type: 'color', group: 'Pelota' },
    { key: 'bounceHeight', label: 'Altura del rebote', type: 'number', min: 10, max: 300, step: 1, unit: 'px', group: 'Movimiento' },
    { key: 'bounces', label: 'Cantidad de rebotes por ciclo', type: 'number', min: 1, max: 8, step: 1, group: 'Movimiento' },
    { key: 'curve', label: 'Curva de movimiento', type: 'select', options: CURVES, group: 'Movimiento' },
    { key: 'squash', label: 'Squash & stretch', type: 'number', min: 0, max: 0.6, step: 0.01, group: 'Movimiento', help: '0 = rígida; 0.3 = caricatura' },
    { key: 'damping', label: 'Amortiguación entre rebotes', type: 'number', min: 0, max: 0.6, step: 0.01, group: 'Movimiento', help: 'Reduce la altura de cada rebote dentro del ciclo' },
    { key: 'shadow', label: 'Sombra', type: 'boolean', group: 'Escena' },
    { key: 'ground', label: 'Línea de suelo', type: 'boolean', group: 'Escena' },
    { key: 'drift', label: 'Desplazamiento horizontal', type: 'number', min: 0, max: 200, step: 1, unit: 'px', group: 'Movimiento', help: 'Va y vuelve dentro del ciclo (seno) para conservar el loop' },
    ...TIME_PARAMS,
  ],
  defaults: { radius: 36, color: '#ff4b3e', bounceHeight: 170, bounces: 1, curve: 'parabola', squash: 0.28, damping: 0, shadow: true, ground: true, drift: 0, fps: 24, frames: 24 },
  build(p: Record<string, ParamValue>) {
    const { fps, duration } = timeOf(p);
    const width = 480;
    const height = 300;
    const r = num(p, 'radius', 36);
    const H = num(p, 'bounceHeight', 170);
    const n = Math.max(1, Math.round(num(p, 'bounces', 1)));
    const k = num(p, 'squash', 0.28);
    const damping = num(p, 'damping', 0);
    const curve = str(p, 'curve', 'parabola');
    const floorY = height - 28;
    const restY = floorY - r;

    // altura h(u) ≥ 0 sobre el suelo
    let yTrack: Track;
    if (curve === 'parabola') yTrack = { expr: { kind: 'sum', terms: [{ kind: 'bounce', height: -H, bounces: n, damping }, { kind: 'saw', from: restY, to: restY, cycles: 1 }] } };
    else if (curve === 'sine') yTrack = { expr: { kind: 'abs-sin', amp: -H, cycles: n / 2, offset: restY } };
    else {
      const keys: Keyframe[] = [];
      const Tb = duration / n;
      for (let i = 0; i < n; i++) {
        const h = H * (1 - damping * (i / n));
        keys.push({ t: i * Tb, v: restY, e: curve as Keyframe['e'] });
        // subida con el easing elegido, bajada con su inverso aproximado (easeIn)
        keys.push({ t: i * Tb + Tb / 2, v: restY - h, e: curve === 'easeOutQuad' ? 'easeInQuad' : curve === 'easeOutCubic' ? 'easeInCubic' : 'easeInOutSine' });
      }
      yTrack = { keys };
    }

    // squash en el contacto, stretch mientras sube/baja rápido, redonda en el ápice
    const squashKeys: Keyframe[] = [];
    const Tb = duration / n;
    for (let i = 0; i < n; i++) {
      const t0 = i * Tb;
      squashKeys.push({ t: t0, v: 1 + k, e: 'easeOutQuad' });
      squashKeys.push({ t: t0 + 0.12 * Tb, v: 1 - 0.55 * k, e: 'easeInOutSine' });
      squashKeys.push({ t: t0 + 0.5 * Tb, v: 1, e: 'easeInOutSine' });
      squashKeys.push({ t: t0 + 0.88 * Tb, v: 1 - 0.55 * k, e: 'easeInQuad' });
    }

    const drift = num(p, 'drift', 0);
    const xTrack: Track = drift > 0 ? { expr: { kind: 'sin', amp: drift, cycles: 1, offset: width / 2 } } : width / 2;

    const items: Item[] = [];
    if (bool(p, 'ground', true)) {
      items.push({
        id: 'ground',
        name: 'Suelo',
        type: 'line',
        x1: 24,
        y1: floorY,
        x2: width - 24,
        y2: floorY,
        transform: identityTransform(),
        // oscura: sobre película transparente se proyecta como línea oscura en la pantalla blanca
        style: { fill: null, stroke: '#2b2b2b', strokeWidth: 3, lineCap: 'round' },
      });
    }
    if (bool(p, 'shadow', true)) {
      // la sombra se encoge y aclara con la altura: escala y opacidad siguen la misma forma que la altura
      const shadowScale: Track = curve === 'parabola' ? { expr: { kind: 'sum', terms: [{ kind: 'bounce', height: -0.55, bounces: n, damping }, { kind: 'saw', from: 1, to: 1, cycles: 1 }] } } : { expr: { kind: 'abs-sin', amp: -0.55, cycles: n / 2, offset: 1 } };
      items.push({
        id: 'shadow',
        name: 'Sombra',
        type: 'circle',
        rx: r * 0.95,
        ry: r * 0.28,
        transform: identityTransform({ x: xTrack, y: floorY, scaleX: shadowScale, scaleY: shadowScale, opacity: shadowScale }),
        style: { fill: '#000000', blend: 'multiply' },
      });
    }
    items.push({
      id: 'ball',
      name: 'Pelota',
      type: 'circle',
      rx: r,
      ry: r,
      transform: identityTransform({ x: xTrack, y: yTrack }),
      // el anclaje de la deformación está en la base de la pelota (el squash aplasta hacia el suelo)
      deform: k > 0 ? { squash: { keys: squashKeys } } : undefined,
      style: { fill: str(p, 'color', '#ff4b3e') },
    });
    items.push({
      id: 'highlight',
      name: 'Brillo',
      type: 'circle',
      rx: r * 0.22,
      ry: r * 0.16,
      transform: identityTransform({ x: typeof xTrack === 'number' ? xTrack - r * 0.35 : { expr: { kind: 'sin', amp: drift, cycles: 1, offset: width / 2 - r * 0.35 } }, y: typeof yTrack === 'number' ? yTrack - r * 0.4 : shiftTrack(yTrack, -r * 0.4), opacity: 0.55 }),
      style: { fill: '#ffffff' },
    });
    return { width, height, fps, duration, layers: [makeLayer('Pelota', items, { id: 'layer-ball', procedural: true })] };
  },
};

/** desplaza una pista numérica una constante (para elementos que siguen a otro) */
export function shiftTrack(track: Track, by: number): Track {
  if (typeof track === 'number') return track + by;
  if ('keys' in track) return { keys: track.keys.map((k) => ({ ...k, v: k.v + by })) };
  return { expr: { kind: 'sum', terms: [track.expr, { kind: 'saw', from: by, to: by, cycles: 1 }] } };
}
