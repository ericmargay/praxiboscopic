// Los dos estroboscopios: tambor analógico ranurado (obturador giratorio delante de la lámpara) y LED digital de
// alta potencia pulsado. Ambos producen una secuencia de destellos con instante, duración y perfil de intensidad;
// el modelo de exposición integra la película en movimiento durante cada destello.
import { TAU, rpmToRadS } from '../core/math';

export interface DrumStrobe {
  kind: 'drum';
  /** ranuras del tambor */
  slots: number;
  rpm: number;
  /** ancho de cada ranura (mm, medido en la periferia) */
  slotWidthMm: number;
  drumRadiusMm: number;
  /** ancho de la abertura fija por la que pasa la luz (mm) */
  apertureWidthMm: number;
  /** fase del tambor (grados) respecto a la posición en que una ranura está centrada en la abertura cuando φ = 0 */
  phaseDeg: number;
  /** error deliberado de velocidad del tambor (%) */
  speedErrorPct: number;
  /** flujo de la lámpara continua detrás del tambor (lm) */
  lampLumens: number;
  lampKelvin: number;
}

export interface LedStrobe {
  kind: 'led';
  frequencyHz: number;
  /** duración del pulso (µs) */
  pulseUs: number;
  /** desfase (ms) respecto al instante en que el fotograma está centrado */
  phaseMs: number;
  /** error deliberado de frecuencia (%) */
  freqErrorPct: number;
  /** jitter aleatorio del instante de disparo (µs, desviación típica) */
  jitterUs: number;
  /** flujo de pico del LED (lm) durante el pulso */
  peakLumens: number;
  kelvin: number;
  /** fuente de disparo: reloj propio (frecuencia fija) o sensor óptico sobre las marcas de sincronización */
  trigger: 'clock' | 'sensor';
}

export type StrobeSpec = DrumStrobe | LedStrobe;

/**
 * Tambor por defecto: 12 ranuras de 0,5 mm frente a una abertura de 0,5 mm en un tambor de 80 mm de radio a 120 rpm.
 * Periferia a ≈ 1 m/s → destello de ≈ 1 ms. Con transporte continuo a 864 mm/s eso desplaza la película ≈ 0,9 mm
 * durante el destello: el tambor mecánico no puede dar destellos tan cortos como un LED, y la simulación lo enseña.
 */
export function defaultDrumStrobe(over: Partial<DrumStrobe> = {}): DrumStrobe {
  return { kind: 'drum', slots: 12, rpm: 120, slotWidthMm: 0.5, drumRadiusMm: 80, apertureWidthMm: 0.5, phaseDeg: 0, speedErrorPct: 0, lampLumens: 2500, lampKelvin: 3200, ...over };
}

/** LED por defecto: 24 Hz, pulsos de 120 µs (≈ 0,1 mm de desplazamiento a 864 mm/s), 20 000 lm de pico. */
export function defaultLedStrobe(over: Partial<LedStrobe> = {}): LedStrobe {
  return { kind: 'led', frequencyHz: 24, pulseUs: 120, phaseMs: 0, freqErrorPct: 0, jitterUs: 0, peakLumens: 20000, kelvin: 5600, trigger: 'clock', ...over };
}

export interface Flash {
  /** inicio del destello (s, tiempo de simulación) */
  t: number;
  /** duración total (s) */
  duration: number;
  /** intensidad relativa de pico (0..1) y perfil */
  peak: number;
  profile: 'rect' | 'trapezoid';
  /** flujo luminoso de pico (lm) */
  lumens: number;
  kelvin: number;
  /** índice del destello (n-ésimo desde t = 0) */
  n: number;
}

/** destellos por segundo */
export function flashFrequency(s: StrobeSpec): number {
  if (s.kind === 'drum') return (s.slots * s.rpm * (1 + s.speedErrorPct / 100)) / 60;
  return s.frequencyHz * (1 + s.freqErrorPct / 100);
}

/** duración de un destello (s) */
export function flashDuration(s: StrobeSpec): number {
  if (s.kind === 'led') return s.pulseUs * 1e-6;
  const v = rpmToRadS(s.rpm * (1 + s.speedErrorPct / 100)) * s.drumRadiusMm; // mm/s en la periferia
  if (v <= 0) return 0;
  return (s.slotWidthMm + s.apertureWidthMm) / v;
}

/** fracción de tiempo con luz (ciclo de trabajo); para el tambor, también fracción del flujo de la lámpara que pasa */
export function dutyCycle(s: StrobeSpec): number {
  const f = flashFrequency(s);
  if (f <= 0) return 0;
  if (s.kind === 'drum') {
    // integral del perfil trapezoidal = ancho de ranura (la abertura solo lo "ensancha" en el tiempo)
    const v = rpmToRadS(s.rpm * (1 + s.speedErrorPct / 100)) * s.drumRadiusMm;
    return v > 0 ? Math.min(1, (s.slots * s.slotWidthMm) / (TAU * s.drumRadiusMm)) : 0;
  }
  return Math.min(1, f * s.pulseUs * 1e-6);
}

/** flujo medio en el tiempo (lm) que llega del estroboscopio */
export function averageLumens(s: StrobeSpec): number {
  if (s.kind === 'drum') return s.lampLumens * dutyCycle(s);
  return s.peakLumens * dutyCycle(s);
}

/** desfase temporal del primer destello respecto a t = 0 (s) */
export function phaseOffsetS(s: StrobeSpec): number {
  if (s.kind === 'led') return s.phaseMs * 1e-3;
  const f = flashFrequency(s);
  if (f <= 0) return 0;
  // phaseDeg de tambor → fracción del periodo entre ranuras
  const slotAngle = 360 / s.slots;
  return (((s.phaseDeg / slotAngle) % 1) + 1) % 1 / f;
}

/** destellos cuyo inicio cae en [t0, t1) */
export function flashesBetween(s: StrobeSpec, t0: number, t1: number, rng: () => number = Math.random): Flash[] {
  const f = flashFrequency(s);
  const out: Flash[] = [];
  if (f <= 0 || t1 <= t0) return out;
  const T = 1 / f;
  const dur = flashDuration(s);
  const phase = phaseOffsetS(s);
  const lumens = s.kind === 'drum' ? s.lampLumens : s.peakLumens;
  const kelvin = s.kind === 'drum' ? s.lampKelvin : s.kelvin;
  // el destello n empieza en n·T + phase − dur/2 (centrado en el instante nominal)
  const first = Math.ceil((t0 - phase + dur / 2) / T);
  const last = Math.ceil((t1 - phase + dur / 2) / T);
  for (let n = first; n < last; n++) {
    let t = n * T + phase - dur / 2;
    if (s.kind === 'led' && s.jitterUs > 0) t += gaussian(rng) * s.jitterUs * 1e-6;
    out.push({ t, duration: dur, peak: 1, profile: s.kind === 'drum' ? 'trapezoid' : 'rect', lumens, kelvin, n });
  }
  return out;
}

/** perfil de intensidad (0..1) en el instante relativo u ∈ [0,1] del destello */
export function flashProfile(flash: Flash, s: StrobeSpec, u: number): number {
  if (flash.profile === 'rect') return u >= 0 && u <= 1 ? 1 : 0;
  if (s.kind !== 'drum') return 1;
  // trapecio: la ranura entra en la abertura (rampa), plena luz mientras se solapan del todo, sale (rampa)
  const a = s.apertureWidthMm;
  const w = s.slotWidthMm;
  const total = a + w;
  const x = u * total; // posición del borde delantero de la ranura respecto al borde de la abertura
  const overlap = Math.max(0, Math.min(x, a, w, total - x));
  return overlap / Math.min(a, w);
}

export function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** rpm del tambor para una frecuencia de proyección */
export function drumRpmFor(fps: number, slots: number): number {
  return (fps * 60) / Math.max(1, slots);
}
