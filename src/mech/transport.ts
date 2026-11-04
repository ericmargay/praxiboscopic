// Transporte de la película: el motor gira el rodillo motriz a través de una relación; la velocidad lineal de la
// cinta es ω·R (menos deslizamiento). La posición de la cinta φ (mm) avanza con el tiempo; el fotograma que está en
// la ventana es el que satisface σ_k + φ ≡ s_gate (mod L).
import { MOTOR_MODELS, motorModel, motorTorqueAtRpm, type MotorModel } from '@aminoacid/omega/mech';
import { radSToRpm, rpmToRadS } from '../core/math';
import type { FilmLayout } from '../film/layout';

export interface TransportSpec {
  /** id del catálogo de motores de OMEGA */
  motorId: string;
  /** rpm ordenadas al motor */
  motorRpm: number;
  /** vueltas del motor por vuelta del rodillo motriz (>1 = reducción) */
  gearRatio: number;
  /** deslizamiento cinta/rodillo (0..0.2) */
  slip: number;
  /** marcha o paro */
  running: boolean;
  /** error deliberado de velocidad (%), para estudiar la pérdida de sincronía */
  speedErrorPct: number;
  /** tensión de la cinta (N) para el cálculo de par y fricción */
  tensionN: number;
  /** coeficiente de fricción global en guías y ventana (0..1) */
  friction: number;
}

export function defaultTransportSpec(over: Partial<TransportSpec> = {}): TransportSpec {
  return { motorId: 'nema17-42x38', motorRpm: 120, gearRatio: 1, slip: 0, running: true, speedErrorPct: 0, tensionN: 1, friction: 0.15, ...over };
}

/** Motor elegido para el prototipo; aún no está en el catálogo de OMEGA. */
export const MOTOR_17HS8401: MotorModel = {
  id: '17hs8401',
  label: 'NEMA 17 17HS8401 42 × 48 mm, 1,8 A',
  type: 'stepper',
  voltageV: 24,
  currentA: 1.8,
  torqueNcm: 52,
  maxRpm: 300,
  ratedRpm: 180,
  stepsPerRev: 200,
  noiseDb: 38,
  body: { shape: 'box', wMm: 42.3, hMm: 42.3, lengthMm: 48 },
  shaft: { diameterMm: 5, lengthMm: 24, flat: 'd', flatDepthMm: 0.5 },
  mount: 'cuatro M3 a 31 mm (patrón NEMA 17), centrador Ø22 mm',
  massG: 350,
  source: { title: 'UNIT Electronics · Nema 17 17HS8401', url: 'https://uelectronics.com/producto/nema-17-motor-a-pasos-17hs8401/', values: '1,8 A · 5,5 kg·cm · 48 mm' },
  estimated: 'el par de 52 N·cm viene de vendedores; sin hoja de datos con inductancia ni curva par-velocidad; 300 rpm es un máximo práctico prudente, no medido; ruido y masa estimados',
  supplier: { name: 'UNIT Electronics', url: 'https://uelectronics.com/producto/nema-17-motor-a-pasos-17hs8401/', unitCost: 225, currency: 'MXN' },
  notes: 'Con driver DM542 a 24 V y microstepping 1/16.',
};

export const MOTORS: readonly MotorModel[] = [MOTOR_17HS8401, ...MOTOR_MODELS];

export function motorOf(spec: Pick<TransportSpec, 'motorId'>): MotorModel {
  if (spec.motorId === MOTOR_17HS8401.id) return MOTOR_17HS8401;
  try {
    return motorModel(spec.motorId);
  } catch {
    return MOTOR_MODELS[0];
  }
}

/** velocidad lineal de la cinta (mm/s) para la orden actual */
export function filmSpeed(spec: TransportSpec, rollerRadiusMm: number): number {
  if (!spec.running) return 0;
  const rpmRoller = (spec.motorRpm * (1 + spec.speedErrorPct / 100)) / Math.max(1e-6, spec.gearRatio);
  return rpmToRadS(rpmRoller) * rollerRadiusMm * (1 - spec.slip);
}

/** rpm de rodillo y motor necesarias para una velocidad de cinta */
export function rpmForSpeed(speedMmS: number, rollerRadiusMm: number, gearRatio: number, slip = 0): { rollerRpm: number; motorRpm: number } {
  const rollerRpm = radSToRpm(speedMmS / Math.max(1e-6, rollerRadiusMm * (1 - slip)));
  return { rollerRpm, motorRpm: rollerRpm * gearRatio };
}

export interface GateState {
  /** posición de la cinta (mm) */
  phiMm: number;
  /** slot de la tira centrado o más cercano a la ventana */
  slot: number;
  frameIndex: number;
  /** desplazamiento del centro del fotograma respecto al centro de la ventana (mm, + = aún no ha llegado) */
  offsetMm: number;
  /** fracción del paso (−0.5..0.5) */
  offsetFraction: number;
  speedMmS: number;
}

/**
 * Qué fotograma está en la ventana para una posición de cinta φ. Un punto de la tira con coordenada σ está en
 * s = φ − σ (la cabecera va delante), así que la ventana ve σ = φ − s_gate y el índice crece al avanzar.
 */
export function gateState(layout: FilmLayout, gateMm: number, phiMm: number, speedMmS: number): GateState | null {
  if (!layout.frames.length) return null;
  const L = layout.loopLengthMm;
  const sigma = (((phiMm - gateMm) % L) + L) % L;
  let best = layout.frames[0];
  let bestD = Infinity;
  for (const f of layout.frames) {
    let d = f.centerMm - sigma;
    d -= Math.round(d / L) * L;
    if (Math.abs(d) < Math.abs(bestD)) {
      bestD = d;
      best = f;
    }
  }
  return { phiMm, slot: best.slot, frameIndex: best.frameIndex, offsetMm: bestD, offsetFraction: bestD / layout.spec.pitchMm, speedMmS };
}

export interface TorqueReport {
  /** par necesario en el rodillo (N·cm) */
  rollerTorqueNcm: number;
  /** par necesario en el motor (N·cm), con la relación y un rendimiento del 85 % por etapa */
  motorTorqueNcm: number;
  /** par disponible del motor a esas rpm (N·cm) */
  availableNcm: number;
  motorRpm: number;
  maxRpm: number;
  margin: number;
  ok: boolean;
  warnings: string[];
}

/** módulo de Young supuesto de la película (N/mm²): PVC rígido ~3000, PET ~4000–4500 */
const FILM_MODULUS_NMM2 = 3000;

export interface BendingReport {
  thicknessMm: number;
  /** estiramiento de la cara exterior sobre el rodillo (%) */
  strainPct: number;
  /** momento para curvarla al radio del rodillo frente al que le da la tensión: EI / (T·R²) */
  stiffnessRatio: number;
}

/**
 * Cuánto se resiste la película a abrazar los rodillos. Pegada, la laminada se comporta como una hoja del grosor total y
 * su rigidez EI = E·b·t³/12 crece con el cubo del grosor. Con `stiffnessRatio` por debajo de ~0,1 la tensión la asienta
 * sobre el rodillo; por encima se despega a la entrada y a la salida, y el empalme golpea.
 */
export function filmBending(thicknessMm: number, stripWidthMm: number, rollerRadiusMm: number, tensionN: number): BendingReport {
  const EI = (FILM_MODULUS_NMM2 * stripWidthMm * thicknessMm ** 3) / 12;
  return { thicknessMm, strainPct: (100 * thicknessMm) / (2 * rollerRadiusMm), stiffnessRatio: EI / (Math.max(1e-6, tensionN) * rollerRadiusMm ** 2) };
}

/** fricción supuesta por rodamiento 608 (N·mm): estimación alta, sin dato de fabricante; hay que medirla */
const BEARING_DRAG_NMM = 3;
/** coeficiente de fricción supuesto película–goma y arco abrazado por el motriz (rad) */
const GRIP_MU = 0.5;
const GRIP_WRAP_RAD = Math.PI / 2;

/**
 * Par de arrastre: la película tira de los rodillos libres (tres en el rectángulo; dos rodamientos cada uno) y roza en la ventana; eso es el
 * salto de tensión ΔT que da el motriz. La tensión mínima sale de la ecuación del cabrestante, T₁/T₂ = e^(μθ).
 */
export function torqueReport(spec: TransportSpec, rollerRadiusMm: number, requiredMotorRpm?: number, path: { freeRollers?: number; wrapRad?: number } = {}): TorqueReport {
  const m = motorOf(spec);
  const free = path.freeRollers ?? 3;
  const wrap = path.wrapRad ?? GRIP_WRAP_RAD;
  const deltaT = (free * 2 * BEARING_DRAG_NMM) / Math.max(1e-6, rollerRadiusMm) + spec.friction * spec.tensionN;
  const rollerTorque = (deltaT * rollerRadiusMm + 2 * BEARING_DRAG_NMM) / 10; // N·mm → N·cm
  const minTensionN = deltaT / (Math.exp(GRIP_MU * wrap) - 1);
  const eff = spec.gearRatio > 1 ? 0.85 : 1;
  const motorTorque = rollerTorque / Math.max(1e-6, spec.gearRatio) / eff;
  const rpm = requiredMotorRpm ?? spec.motorRpm;
  const available = motorTorqueAtRpm(m, rpm);
  const warnings: string[] = [];
  if (rpm > m.maxRpm) warnings.push(`${m.label}: ${rpm.toFixed(0)} rpm supera su máximo práctico (${m.maxRpm} rpm). Aumenta el radio del rodillo motriz o baja los FPS; una reducción motor:rodillo mayor que 1 sube las rpm del motor.`);
  if (spec.tensionN < minTensionN) warnings.push(`La película puede patinar: con ${spec.tensionN} N de tensión, el motriz necesita al menos ${minTensionN.toFixed(2)} N.`);
  if (available < motorTorque) warnings.push(`Par insuficiente: hacen falta ${motorTorque.toFixed(2)} N·cm y el motor da ${available.toFixed(2)} N·cm a ${rpm.toFixed(0)} rpm.`);
  if (m.type === 'stepper' && rpm > 200) warnings.push('Un paso a paso por encima de ~200 rpm pierde par con rapidez y puede saltar pasos: usa microstepping y un driver a 24 V, o una reducción.');
  return { rollerTorqueNcm: rollerTorque, motorTorqueNcm: motorTorque, availableNcm: available, motorRpm: rpm, maxRpm: m.maxRpm, margin: available / Math.max(1e-6, motorTorque), ok: warnings.length === 0, warnings };
}
