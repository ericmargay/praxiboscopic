// Óptica de la linterna: lente delgada (distancia película–lente, focal, distancia de proyección), aumento, tamaño
// de imagen, desenfoque por enfoque incorrecto (círculo de confusión), iluminancia en pantalla y luminancia percibida.
// Las fórmulas fotométricas se apoyan en @aminoacid/omega/render (lux, candela, Kelvin).
import { illuminanceLux, kelvinToLinearRgb } from '@aminoacid/omega/render';

export interface OpticsSpec {
  /** focal de la lente de proyección (mm) */
  focalMm: number;
  /** número f de la lente (apertura = focal / f) */
  fNumber: number;
  /** distancia de la película al centro óptico de la lente (mm): el enfoque */
  filmToLensMm: number;
  /** distancia de la lente a la pantalla (mm) */
  throwMm: number;
  /** ventana óptica (mm), lo que deja pasar la máscara; por defecto el tamaño del fotograma */
  gateWidthMm: number;
  gateHeightMm: number;
  /** fracción del flujo de la lámpara que el condensador mete por la ventana (0..1) */
  condenserEfficiency: number;
  /** transmitancia de la lente (0..1) */
  lensTransmission: number;
  /** ganancia de la pantalla (1 = blanco mate lambertiano) */
  screenGain: number;
  /** luz ambiente sobre la pantalla (lux) */
  ambientLux: number;
  /** la lente invierte la imagen: la película se monta invertida para compensar; true = ya compensada */
  filmMountedInverted: boolean;
  /** espejo de reenvío (invierte horizontalmente) */
  mirror: boolean;
}

export function defaultOpticsSpec(over: Partial<OpticsSpec> = {}): OpticsSpec {
  return {
    focalMm: 50,
    fNumber: 2.8,
    filmToLensMm: 51.4,
    throwMm: 1800,
    gateWidthMm: 32,
    gateHeightMm: 20,
    condenserEfficiency: 0.12,
    lensTransmission: 0.9,
    screenGain: 1,
    ambientLux: 5,
    filmMountedInverted: true,
    mirror: false,
    ...over,
  };
}

export interface OpticsReport {
  /** distancia película–lente que enfoca en la pantalla (mm) */
  focusFilmToLensMm: number;
  /** distancia a la que enfoca la posición actual (mm; Infinity si está en el foco o más cerca) */
  focusedAtMm: number;
  /** aumento lineal (imagen / película) */
  magnification: number;
  imageWidthMm: number;
  imageHeightMm: number;
  /** diámetro del círculo de confusión en pantalla (mm) por desenfoque */
  blurCircleMm: number;
  /** el mismo desenfoque referido a la película (mm) */
  blurOnFilmMm: number;
  /** profundidad de foco en la película (± mm) para un círculo de confusión de 0,05 mm en película */
  depthOfFocusMm: number;
  apertureMm: number;
  /** ángulo de campo horizontal (grados) */
  fieldDeg: number;
  warnings: string[];
}

export function opticsReport(o: OpticsSpec): OpticsReport {
  const f = o.focalMm;
  const di = o.throwMm;
  const warnings: string[] = [];
  // 1/f = 1/do + 1/di
  const focusDo = di > f ? 1 / (1 / f - 1 / di) : Infinity;
  const doNow = o.filmToLensMm;
  const diNow = doNow > f ? 1 / (1 / f - 1 / doNow) : Infinity;
  const m = Number.isFinite(diNow) ? diNow / doNow : di / f;
  const A = f / Math.max(0.5, o.fNumber);
  // círculo de confusión en pantalla: cono de la lente a la imagen nítida (diNow) cortado en di
  const blur = Number.isFinite(diNow) ? (A * Math.abs(di - diNow)) / diNow : A;
  const blurFilm = blur / Math.max(1e-6, m);
  // profundidad de foco en la película para c = 0,05 mm: Δdo ≈ 2·N·c (lado objeto, con m pequeño en el lado película)
  const dof = 2 * o.fNumber * 0.05;
  if (doNow <= f) warnings.push('La película está en el foco o más cerca: la lente no forma imagen real en la pantalla.');
  if (Math.abs(doNow - focusDo) > dof) warnings.push(`Desenfoque: la imagen está nítida a ${Number.isFinite(diNow) ? diNow.toFixed(0) : '∞'} mm y la pantalla está a ${di.toFixed(0)} mm. Ajusta la distancia película–lente a ${focusDo.toFixed(2)} mm.`);
  const imgW = o.gateWidthMm * m;
  const imgH = o.gateHeightMm * m;
  const field = 2 * Math.atan(o.gateWidthMm / 2 / doNow) * (180 / Math.PI);
  return { focusFilmToLensMm: focusDo, focusedAtMm: diNow, magnification: m, imageWidthMm: imgW, imageHeightMm: imgH, blurCircleMm: blur, blurOnFilmMm: blurFilm, depthOfFocusMm: dof, apertureMm: A, fieldDeg: field, warnings };
}

export interface BrightnessReport {
  /** flujo medio en la pantalla (lm) */
  screenLumens: number;
  /** iluminancia media en la imagen (lux) */
  imageLux: number;
  /** luminancia de la imagen (cd/m²) con la ganancia de la pantalla */
  imageNits: number;
  /** luminancia del ambiente sobre la pantalla (cd/m²) */
  ambientNits: number;
  /** contraste imagen+ambiente / ambiente */
  contrastRatio: number;
  /** color de la luz transmitida sin película (lineal sRGB, luminancia 1) */
  lightColor: [number, number, number];
  verdict: string;
}

/**
 * Brillo estimado: el flujo medio del estroboscopio pasa por el condensador, la película (transmitancia media) y la
 * lente y se reparte en el área de la imagen. La iluminancia en el eje de una fuente puntual (illuminanceLux de OMEGA)
 * se usa para comprobar la coherencia del cono.
 */
export function brightnessReport(o: OpticsSpec, averageSourceLumens: number, filmTransmittance: number, kelvin: number): BrightnessReport {
  const rep = opticsReport(o);
  const flux = averageSourceLumens * o.condenserEfficiency * filmTransmittance * o.lensTransmission;
  const areaM2 = Math.max(1e-6, (rep.imageWidthMm / 1000) * (rep.imageHeightMm / 1000));
  const lux = flux / areaM2;
  // coherencia: una fuente puntual de I = flux / Ω candela a la distancia de proyección debería dar la misma lux
  const halfW = rep.imageWidthMm / 2 / o.throwMm;
  const halfH = rep.imageHeightMm / 2 / o.throwMm;
  const solid = 4 * Math.atan((halfW * halfH) / Math.sqrt(1 + halfW * halfW + halfH * halfH));
  const cd = flux / Math.max(1e-9, solid);
  const luxCheck = illuminanceLux(cd, o.throwMm / 1000);
  const nits = ((lux + luxCheck) / 2) * (o.screenGain / Math.PI);
  const ambientNits = o.ambientLux / Math.PI;
  const contrast = (nits + ambientNits) / Math.max(1e-6, ambientNits);
  let verdict: string;
  if (nits < 1) verdict = 'Muy tenue: solo visible en oscuridad total y a tamaño pequeño.';
  else if (nits < 5) verdict = 'Tenue: sala a oscuras, imagen pequeña (como una linterna mágica histórica).';
  else if (nits < 20) verdict = 'Aceptable en sala oscura.';
  else if (nits < 50) verdict = 'Buena: comparable a un proyector doméstico modesto.';
  else verdict = 'Brillante.';
  if (contrast < 5) verdict += ` Contraste ${contrast.toFixed(1)}:1 con la luz ambiente: baja el ambiente o acerca la pantalla.`;
  return { screenLumens: flux, imageLux: lux, imageNits: nits, ambientNits, contrastRatio: contrast, lightColor: kelvinToLinearRgb(kelvin), verdict };
}

/** distancia película–lente que enfoca en la pantalla actual */
export function focusFor(o: OpticsSpec): number {
  return opticsReport(o).focusFilmToLensMm;
}
