// Simulación del material transmisivo: una película impresa no es la imagen digital. La base transparente absorbe
// algo, la tinta o el pigmento alcanza una densidad óptica máxima (Dmax) que limita el negro, el punto de impresión
// emborrona los bordes (resolución), parte de la luz se dispersa (velo/haze) y la base tiñe la luz transmitida.
//
// Modelo por píxel: la imagen deseada da la transmitancia objetivo por canal T_obj = c (0..1); la densidad impresa
// D = min(Dmax, −log10(T_obj)) ⇒ T = T_base · 10^(−D). Las zonas sin tinta (alfa 0) son base limpia: T_base.
// Después se aplica el desenfoque del punto (gaussiana) y el velo: T' = T·(1−h) + h·T̄.
export interface MediumProfile {
  id: string;
  label: string;
  /** descripción y para qué sirve (español) */
  description: string;
  /** transmitancia de la base sin tinta (0..1) */
  baseTransmittance: number;
  /** tinte de la base: multiplicador RGB (1 = neutro) */
  baseTint: [number, number, number];
  /** densidad óptica máxima alcanzable */
  dMax: number;
  /** resolución efectiva de impresión (puntos por mm) → desenfoque gaussiano σ ≈ 0.5 / dpmm */
  dotsPerMm: number;
  /** fracción de luz dispersada (velo) */
  haze: number;
  /** ¿material binario (sin medios tonos continuos)? las imágenes se tramarán al imprimir */
  binary: boolean;
  /** calidad: prueba de escritorio o película de calidad óptica */
  quality: 'desktop' | 'optical';
  /** compatibilidades y advertencias de fabricación */
  notes: string[];
}

export const MEDIA: readonly MediumProfile[] = [
  {
    id: 'ideal',
    label: 'Película ideal',
    description: 'Transmitancia perfecta: lo que ve la ventana es exactamente la imagen digital. Referencia para comparar.',
    baseTransmittance: 1,
    baseTint: [1, 1, 1],
    dMax: 6,
    dotsPerMm: 1000,
    haze: 0,
    binary: false,
    quality: 'optical',
    notes: [],
  },
  {
    id: 'inkjet-transparency',
    label: 'Inyección de tinta sobre acetato para inkjet',
    description: 'Impresora de escritorio de inyección de tinta sobre hoja transparente CON recubrimiento para inkjet (p. ej. acetatos "para inyección de tinta" o film de retroproyección). Dmax ≈ 1,6–2,0; punto de 1440 dpi con sangrado.',
    baseTransmittance: 0.9,
    baseTint: [1, 0.995, 0.98],
    dMax: 1.7,
    dotsPerMm: 20,
    haze: 0.04,
    binary: false,
    quality: 'desktop',
    notes: [
      'Solo acetato con recubrimiento para inyección de tinta: sobre acetato liso o "para láser" la tinta no fija y se corre.',
      'Tinta pigmentada aguanta la luz de la linterna mejor que la de colorante; ambas se degradan con calor directo.',
      'El negro no bloquea del todo la luz (Dmax ≈ 1,7 → 2 % de transmisión): los fondos "negros" se verán gris oscuro.',
      'Perfil de color: usa el ICC del papel/film del fabricante; sin él, espera un ligero dominante.',
    ],
  },
  {
    id: 'laser-transparency',
    label: 'Láser o copiadora sobre acetato para láser',
    description: 'Tóner sobre acetato resistente al calor del fusor. Punto de 600 dpi, tóner brillante que dispersa; Dmax ≈ 1,2–1,4.',
    baseTransmittance: 0.88,
    baseTint: [0.99, 0.99, 1],
    dMax: 1.3,
    dotsPerMm: 12,
    haze: 0.07,
    binary: true,
    quality: 'desktop',
    notes: [
      'Solo acetato marcado "para láser/copiadora": el acetato para inkjet se derrite en el fusor y daña la impresora.',
      'El tóner es binario: los medios tonos salen tramados; la trama se ve si el aumento es grande.',
      'Transmisión del negro ≈ 5 %: contraste bajo para proyección; sirve como prueba de registro y movimiento.',
    ],
  },
  {
    id: 'photo-lab-film',
    label: 'Laboratorio: película fotográfica (duplicado / filmación de salida)',
    description: 'Servicio de laboratorio que expone la secuencia sobre película fotográfica transparente (duplicado, filmadora de salida o impresión fotográfica sobre film "Duratrans"). Tono continuo, Dmax ≥ 3.',
    baseTransmittance: 0.93,
    baseTint: [1, 1, 1],
    dMax: 3.2,
    dotsPerMm: 80,
    haze: 0.01,
    binary: false,
    quality: 'optical',
    notes: ['Calidad óptica real: negros opacos (0,06 % de transmisión), bordes nítidos, sin trama.', 'Hay que enviar los fotogramas a resolución completa y la plantilla con dimensiones físicas exactas; pide una prueba de tamaño antes de la tirada.'],
  },
  {
    id: 'imagesetter-film',
    label: 'Laboratorio: fotolito (imagesetter) de alto contraste',
    description: 'Fotolito de artes gráficas: binario, Dmax ≈ 4, punto de 2400–3600 dpi. Ideal para animaciones de siluetas o línea; los grises salen tramados muy finos.',
    baseTransmittance: 0.92,
    baseTint: [1, 1, 1],
    dMax: 4,
    dotsPerMm: 100,
    haze: 0.01,
    binary: true,
    quality: 'optical',
    notes: ['Sin tono continuo: convierte la animación a línea o siluetas (ajuste de umbral) o acepta trama estocástica.', 'Película de poliéster estable dimensionalmente: el paso se mantiene a lo largo de la tira.'],
  },
];

export function mediumById(id: string): MediumProfile {
  return MEDIA.find((m) => m.id === id) ?? MEDIA[0];
}

/** contraste máximo (relación de transmitancias claro/oscuro) */
export function contrastRatio(m: MediumProfile): number {
  return 10 ** m.dMax;
}

export interface MediumReport {
  minTransmittance: number;
  maxTransmittance: number;
  contrastRatio: number;
  /** desenfoque gaussiano σ en mm */
  blurSigmaMm: number;
  /** pares de líneas por mm resolubles (≈ dpmm / 2) */
  lpPerMm: number;
  /** transmitancia media de la imagen (para el brillo) */
  meanTransmittance: number;
}

export function mediumReport(m: MediumProfile, meanImageTransmittance = 0.5): MediumReport {
  const tMin = m.baseTransmittance * 10 ** -m.dMax;
  return { minTransmittance: tMin, maxTransmittance: m.baseTransmittance, contrastRatio: m.baseTransmittance / tMin, blurSigmaMm: 0.5 / m.dotsPerMm, lpPerMm: m.dotsPerMm / 2, meanTransmittance: m.baseTransmittance * meanImageTransmittance };
}

export interface ApplyMediumOptions {
  /** píxeles por mm de la imagen, para convertir el desenfoque a píxeles */
  pxPerMm: number;
  /** color de la luz (lineal, luminancia 1) con el que se ilumina la película */
  lightColor?: [number, number, number];
  /** tratar el alfa como "sin tinta" (true) o como negro (false) */
  alphaIsClear?: boolean;
}

/**
 * Aplica el medio a una imagen RGBA: devuelve la luz transmitida (RGB opaco, alfa 255) tal como se vería sobre una
 * pantalla blanca. Devuelve además la transmitancia media.
 */
export function applyMedium(data: Uint8ClampedArray, width: number, height: number, m: MediumProfile, options: ApplyMediumOptions): { meanTransmittance: number } {
  const n = width * height;
  const T = new Float32Array(n * 3);
  const base = m.baseTransmittance;
  const tint = m.baseTint;
  const light = options.lightColor ?? [1, 1, 1];
  const alphaClear = options.alphaIsClear ?? true;
  const tMin = 10 ** -m.dMax;
  const thr = m.binary ? 0.5 : -1;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) {
      // transmitancia objetivo del píxel: color (lo que debe verse) mezclado con base limpia según el alfa
      let tObj = data[i * 4 + c] / 255;
      if (thr >= 0) tObj = tObj >= thr ? 1 : 0;
      // densidad limitada por el Dmax de la tinta
      let t = Math.max(tMin, tObj);
      if (alphaClear) t = a * t + (1 - a);
      else t = a * t + (1 - a) * tMin;
      T[i * 3 + c] = base * tint[c] * t;
    }
    sum += (T[i * 3] + T[i * 3 + 1] + T[i * 3 + 2]) / 3;
  }
  const mean = n ? sum / n : 0;
  // desenfoque del punto de impresión
  const sigmaPx = (0.5 / m.dotsPerMm) * options.pxPerMm;
  if (sigmaPx > 0.3) gaussianBlur(T, width, height, 3, sigmaPx);
  // velo: parte de la luz se reparte uniformemente
  const h = m.haze;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      const t = T[i * 3 + c] * (1 - h) + h * mean * base * tint[c];
      // la luz transmitida es luz × T; la salida es sRGB sobre pantalla blanca (sin gamma adicional: la pantalla
      // del simulador ya muestra sRGB y T es lineal en energía → aplicamos la curva sRGB para que se vea bien)
      const lin = Math.min(1, Math.max(0, t * light[c]));
      data[i * 4 + c] = Math.round(linToSrgb(lin) * 255);
    }
    data[i * 4 + 3] = 255;
  }
  return { meanTransmittance: mean };
}

function linToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** gaussiana separable sobre un buffer float con `channels` canales */
export function gaussianBlur(buf: Float32Array, width: number, height: number, channels: number, sigma: number): void {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(radius * 2 + 1);
  let ks = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = v;
    ks += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= ks;
  const tmp = new Float32Array(buf.length);
  // horizontal
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < channels; c++) {
        let acc = 0;
        for (let k = -radius; k <= radius; k++) {
          const xx = Math.min(width - 1, Math.max(0, x + k));
          acc += buf[(y * width + xx) * channels + c] * kernel[k + radius];
        }
        tmp[(y * width + x) * channels + c] = acc;
      }
    }
  }
  // vertical
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < channels; c++) {
        let acc = 0;
        for (let k = -radius; k <= radius; k++) {
          const yy = Math.min(height - 1, Math.max(0, y + k));
          acc += tmp[(yy * width + x) * channels + c] * kernel[k + radius];
        }
        buf[(y * width + x) * channels + c] = acc;
      }
    }
  }
}
