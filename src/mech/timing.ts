// Motor temporal: avanza el tiempo de simulación con resolución de microsegundos (los instantes se calculan de forma
// analítica, no por pasos fijos) aunque la pantalla se refresque a 60 Hz. En cada avance devuelve los eventos de
// exposición ocurridos: para cada destello, la posición de la cinta al inicio y su velocidad, con lo que el modelo
// de exposición integra la imagen vista por la ventana durante el destello.
import { flashesBetween, gaussian, type Flash, type LedStrobe, type StrobeSpec } from './strobe';

export interface ExposureEvent {
  flash: Flash;
  /** posición de la cinta al inicio del destello (mm) */
  phiMm: number;
  /** velocidad de la cinta durante el destello (mm/s) */
  speedMmS: number;
}

export interface TimeStep {
  /** tiempo de simulación al final del paso (s) */
  t: number;
  dt: number;
  phiMm: number;
  speedMmS: number;
  events: ExposureEvent[];
}

/** Disparo por sensor: cada marca que pasa dispara un destello. `positionsMm` son los φ en que un fotograma queda centrado. */
export interface SensorTrigger {
  positionsMm: number[];
  loopMm: number;
}

/** destellos centrados en cada cruce de marca dentro de (φ0, φ0 + v·dt]; sin película en movimiento no hay destellos */
export function sensorEvents(strobe: LedStrobe, sensor: SensorTrigger, t0: number, phi0: number, speedMmS: number, dt: number, rng: () => number): ExposureEvent[] {
  if (speedMmS <= 0 || dt <= 0 || sensor.loopMm <= 0) return [];
  const travel = speedMmS * dt;
  const dur = strobe.pulseUs * 1e-6;
  const out: ExposureEvent[] = [];
  sensor.positionsMm.forEach((pos, slot) => {
    let d = ((pos - phi0) % sensor.loopMm + sensor.loopMm) % sensor.loopMm;
    if (d === 0) d = sensor.loopMm;
    for (; d <= travel; d += sensor.loopMm) {
      const tCross = t0 + d / speedMmS;
      const jitter = strobe.jitterUs > 0 ? gaussian(rng) * strobe.jitterUs * 1e-6 : 0;
      const start = tCross + strobe.phaseMs * 1e-3 - dur / 2 + jitter;
      out.push({ flash: { t: start, duration: dur, peak: 1, profile: 'rect', lumens: strobe.peakLumens, kelvin: strobe.kelvin, n: slot }, phiMm: phi0 + speedMmS * (start - t0), speedMmS });
    }
  });
  return out.sort((a, b) => a.flash.t - b.flash.t);
}

export class TimeEngine {
  /** tiempo de simulación (s) */
  t = 0;
  /** posición de la cinta (mm) */
  phiMm = 0;
  /** factor de tiempo (1 = tiempo real; 0.1 = cámara lenta) */
  timeScale = 1;
  /** longitud del loop para mantener φ acotado (0 = sin acotar) */
  loopLengthMm = 0;
  /** generador para el jitter (determinista en pruebas) */
  rng: () => number = Math.random;
  /** máximo de eventos por paso, por si se queda la pestaña en segundo plano y dt es enorme */
  maxEvents = 240;

  reset(): void {
    this.t = 0;
    this.phiMm = 0;
  }

  /**
   * Avanza `dtRealS` segundos de reloj real: la cinta se mueve a `speedMmS` (constante dentro del paso) y el
   * estroboscopio dispara según su propio reloj. Los instantes de los destellos son exactos (resolución < 1 µs).
   */
  advance(dtRealS: number, speedMmS: number, strobe: StrobeSpec, sensor?: SensorTrigger): TimeStep {
    const dt = Math.max(0, dtRealS) * this.timeScale;
    const t0 = this.t;
    const t1 = t0 + dt;
    let events: ExposureEvent[];
    if (sensor && strobe.kind === 'led' && strobe.trigger === 'sensor') events = sensorEvents(strobe, sensor, t0, this.phiMm, speedMmS, dt, this.rng);
    else events = flashesBetween(strobe, t0, t1, this.rng).map((flash) => ({ flash, phiMm: this.phiMm + speedMmS * (flash.t - t0), speedMmS }));
    if (events.length > this.maxEvents) events = events.slice(events.length - this.maxEvents);
    this.phiMm += speedMmS * dt;
    if (this.loopLengthMm > 0) this.phiMm = ((this.phiMm % this.loopLengthMm) + this.loopLengthMm) % this.loopLengthMm;
    this.t = t1;
    return { t: t1, dt, phiMm: this.phiMm, speedMmS, events };
  }

  /** instante del siguiente destello después de `t` (s) */
  nextFlash(strobe: StrobeSpec, horizonS = 10): Flash | null {
    const f = flashesBetween(strobe, this.t, this.t + horizonS, this.rng);
    return f[0] ?? null;
  }
}
