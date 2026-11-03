// Funciones de easing (entrada u ∈ [0,1] → salida) y curvas cúbicas de Bézier como en CSS.
import type { Easing, EasingName } from './model';

const c1 = 1.70158;
const c3 = c1 + 1;
const c4 = (2 * Math.PI) / 3;

export const EASINGS: Record<EasingName, (u: number) => number> = {
  linear: (u) => u,
  easeInQuad: (u) => u * u,
  easeOutQuad: (u) => 1 - (1 - u) * (1 - u),
  easeInOutQuad: (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2),
  easeInCubic: (u) => u * u * u,
  easeOutCubic: (u) => 1 - (1 - u) ** 3,
  easeInOutCubic: (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2),
  easeInSine: (u) => 1 - Math.cos((u * Math.PI) / 2),
  easeOutSine: (u) => Math.sin((u * Math.PI) / 2),
  easeInOutSine: (u) => -(Math.cos(Math.PI * u) - 1) / 2,
  easeOutBounce: bounceOut,
  easeInBounce: (u) => 1 - bounceOut(1 - u),
  easeOutElastic: (u) => (u === 0 ? 0 : u === 1 ? 1 : 2 ** (-10 * u) * Math.sin((u * 10 - 0.75) * c4) + 1),
  easeOutBack: (u) => 1 + c3 * (u - 1) ** 3 + c1 * (u - 1) ** 2,
  easeInBack: (u) => c3 * u * u * u - c1 * u * u,
  step: (u) => (u < 1 ? 0 : 1),
};

function bounceOut(u: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (u < 1 / d1) return n1 * u * u;
  if (u < 2 / d1) return n1 * (u -= 1.5 / d1) * u + 0.75;
  if (u < 2.5 / d1) return n1 * (u -= 2.25 / d1) * u + 0.9375;
  return n1 * (u -= 2.625 / d1) * u + 0.984375;
}

/** y(x) de una Bézier cúbica (0,0)-(x1,y1)-(x2,y2)-(1,1), resolviendo t por Newton + bisección. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bx = (t: number) => 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t * t * x2 + t ** 3;
  const by = (t: number) => 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t * t * y2 + t ** 3;
  const dbx = (t: number) => 3 * (1 - t) ** 2 * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2);
  let t = x;
  for (let i = 0; i < 8; i++) {
    const d = dbx(t);
    if (Math.abs(d) < 1e-6) break;
    const err = bx(t) - x;
    if (Math.abs(err) < 1e-7) return by(t);
    t -= err / d;
    if (t < 0 || t > 1) break;
  }
  let lo = 0;
  let hi = 1;
  t = x;
  for (let i = 0; i < 40; i++) {
    const err = bx(t) - x;
    if (Math.abs(err) < 1e-7) break;
    if (err > 0) hi = t;
    else lo = t;
    t = (lo + hi) / 2;
  }
  return by(t);
}

export function ease(e: Easing | undefined, u: number): number {
  if (!e) return u;
  if (typeof e === 'string') return (EASINGS[e] ?? EASINGS.linear)(Math.min(1, Math.max(0, u)));
  return cubicBezier(e[0], e[1], e[2], e[3], u);
}

export const EASING_LABELS: Record<EasingName, string> = {
  linear: 'Lineal',
  easeInQuad: 'Entrada suave (cuadrática)',
  easeOutQuad: 'Salida suave (cuadrática)',
  easeInOutQuad: 'Entrada y salida (cuadrática)',
  easeInCubic: 'Entrada (cúbica)',
  easeOutCubic: 'Salida (cúbica)',
  easeInOutCubic: 'Entrada y salida (cúbica)',
  easeInSine: 'Entrada (seno)',
  easeOutSine: 'Salida (seno)',
  easeInOutSine: 'Entrada y salida (seno)',
  easeOutBounce: 'Rebote al final',
  easeInBounce: 'Rebote al inicio',
  easeOutElastic: 'Elástico',
  easeOutBack: 'Sobrepaso al final',
  easeInBack: 'Anticipación',
  step: 'Escalón',
};
