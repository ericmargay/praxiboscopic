// Sincronización entre la animación, el transporte y el estroboscopio. A partir de los FPS objetivo calcula la
// velocidad de cinta, las rpm de rodillo y motor, las rpm del tambor o la frecuencia del LED, el desfase, el tiempo
// máximo de exposición para un desenfoque dado, el brillo medio y el desenfoque por movimiento resultante.
import type { FilmLayout } from '../film/layout';
import { averageLumens, drumRpmFor, flashDuration, flashFrequency, type StrobeSpec } from './strobe';
import { filmSpeed, rpmForSpeed, torqueReport, type TorqueReport, type TransportSpec } from './transport';

export interface SyncTargets {
  /** FPS de proyección deseados (normalmente = FPS de la animación) */
  fps: number;
  filmSpeedMmS: number;
  rollerRpm: number;
  motorRpm: number;
  drumRpm: number | null;
  ledHz: number | null;
}

export interface SyncState {
  targets: SyncTargets;
  /** lo que ocurre con la orden actual */
  actual: {
    filmSpeedMmS: number;
    /** fotogramas por segundo que pasan por la ventana */
    transportFps: number;
    /** destellos por segundo */
    flashHz: number;
    flashDurationS: number;
    /** diferencia de frecuencia (Hz): > 0 la proyección adelanta a la película */
    beatHz: number;
    /** segundos hasta que el error acumulado es un fotograma entero (∞ si no hay deriva) */
    secondsPerFrameSlip: number;
    /** desplazamiento de la película durante un destello (mm) y en fracción del paso */
    blurMm: number;
    blurFraction: number;
    /** flujo medio proyectado (lm) */
    averageLumens: number;
    /** tiempo máximo de exposición (s) para que el desenfoque no supere `maxBlurMm` */
    maxExposureS: number;
  };
  torque: TorqueReport;
  warnings: string[];
}

export interface SyncOptions {
  /** desenfoque admisible (mm sobre la película) */
  maxBlurMm?: number;
}

export function syncTargets(fps: number, layout: FilmLayout, transport: TransportSpec, rollerRadiusMm: number, strobe: StrobeSpec): SyncTargets {
  const speed = fps * layout.spec.pitchMm;
  const { rollerRpm, motorRpm } = rpmForSpeed(speed, rollerRadiusMm, transport.gearRatio, transport.slip);
  return { fps, filmSpeedMmS: speed, rollerRpm, motorRpm, drumRpm: strobe.kind === 'drum' ? drumRpmFor(fps, strobe.slots) : null, ledHz: strobe.kind === 'led' ? fps : null };
}

export function syncState(fps: number, layout: FilmLayout, transport: TransportSpec, rollerRadiusMm: number, strobe: StrobeSpec, options: SyncOptions = {}): SyncState {
  const targets = syncTargets(fps, layout, transport, rollerRadiusMm, strobe);
  const v = filmSpeed(transport, rollerRadiusMm);
  const transportFps = v / layout.spec.pitchMm;
  // con disparo por sensor cada marca dispara un destello: la frecuencia la impone la película y no hay deriva
  const sensorDriven = strobe.kind === 'led' && strobe.trigger === 'sensor';
  const flashHz = sensorDriven ? transportFps : flashFrequency(strobe);
  const dur = flashDuration(strobe);
  const beat = flashHz - transportFps;
  const blurMm = v * dur;
  const maxBlur = options.maxBlurMm ?? 0.1;
  const warnings: string[] = [];
  if (transport.running && Math.abs(beat) > 1e-3) {
    const slip = 1 / Math.abs(beat);
    warnings.push(beat > 0 ? `El estroboscopio adelanta ${beat.toFixed(3)} Hz: la imagen deriva un fotograma cada ${slip.toFixed(1)} s (parece retroceder/arrastrarse).` : `El estroboscopio atrasa ${(-beat).toFixed(3)} Hz: la imagen deriva un fotograma cada ${slip.toFixed(1)} s.`);
  }
  if (blurMm > maxBlur) warnings.push(`Desenfoque por movimiento de ${blurMm.toFixed(3)} mm (${((blurMm / layout.spec.pitchMm) * 100).toFixed(1)} % del paso) con destellos de ${(dur * 1e6).toFixed(0)} µs: acorta el destello (máximo ${((maxBlur / Math.max(v, 1e-9)) * 1e6).toFixed(0)} µs) o baja la velocidad.`);
  if (!transport.running) warnings.push(sensorDriven ? 'Motor parado: sin marcas que pasen por el sensor no hay destellos y la pantalla queda negra.' : 'Motor parado: la película no avanza y el estroboscopio proyecta siempre el mismo fotograma.');
  if (strobe.kind === 'drum' && strobe.slotWidthMm > strobe.apertureWidthMm * 3) warnings.push('Ranura del tambor mucho más ancha que la abertura: el destello es largo y la imagen se emborrona.');
  if (strobe.kind === 'led' && strobe.pulseUs > 2000) warnings.push('Pulsos de más de 2 ms en LED: pierdes la ventaja del destello corto.');
  const torque = torqueReport(transport, rollerRadiusMm, targets.motorRpm);
  warnings.push(...torque.warnings);
  return {
    targets,
    actual: {
      filmSpeedMmS: v,
      transportFps,
      flashHz,
      flashDurationS: dur,
      beatHz: beat,
      secondsPerFrameSlip: Math.abs(beat) > 1e-9 ? 1 / Math.abs(beat) : Infinity,
      blurMm,
      blurFraction: blurMm / layout.spec.pitchMm,
      averageLumens: sensorDriven ? strobe.peakLumens * Math.min(1, flashHz * dur) : averageLumens(strobe),
      maxExposureS: v > 0 ? maxBlur / v : Infinity,
    },
    torque,
    warnings,
  };
}

/** Ajusta el transporte y el estroboscopio para que coincidan exactamente con los FPS pedidos. */
export function autoSync<T extends StrobeSpec>(fps: number, layout: FilmLayout, transport: TransportSpec, rollerRadiusMm: number, strobe: T): { transport: TransportSpec; strobe: T } {
  const t = syncTargets(fps, layout, transport, rollerRadiusMm, strobe);
  const nt: TransportSpec = { ...transport, motorRpm: t.motorRpm, speedErrorPct: 0, running: true };
  const ns = strobe.kind === 'drum' ? ({ ...strobe, rpm: t.drumRpm ?? strobe.rpm, speedErrorPct: 0 } as T) : ({ ...strobe, frequencyHz: fps, freqErrorPct: 0 } as T);
  return { transport: nt, strobe: ns };
}
