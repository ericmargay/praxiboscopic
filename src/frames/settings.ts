// Ajustes del generador de fotogramas y las tres frecuencias que no hay que confundir:
//   · FPS del material animado (doc.fps): cuántas muestras por segundo tiene la animación.
//   · Frecuencia de transporte: fotogramas por segundo que pasan por la ventana (velocidad de película / paso).
//   · Frecuencia de proyección efectiva: destellos por segundo que llegan a la pantalla (estroboscopio).
// Aquí viven los ajustes de muestreo, resolución, dimensiones físicas, color, orientación, dirección y numeración.
import { z } from 'zod';

export type FpsChangeMode = 'keep-duration' | 'keep-count';

export interface ColorAdjust {
  /** −1..1 */
  brightness: number;
  /** 0..3 (1 = sin cambio) */
  contrast: number;
  /** 0..2 (1 = sin cambio) */
  saturation: number;
  invert: boolean;
  grayscale: boolean;
  /** umbral 0..1 para película de alto contraste (0 = desactivado) */
  threshold: number;
}

export interface FrameGenSettings {
  /** qué se conserva al cambiar FPS */
  fpsMode: FpsChangeMode;
  /** número de fotogramas cuando fpsMode = keep-count */
  fixedCount: number;
  /** resolución del fotograma (px) antes de la orientación */
  widthPx: number;
  heightPx: number;
  /**
   * dimensiones físicas de la imagen sobre la película (mm). La banda corre de canto con la imagen derecha: el ancho
   * (horizontal) corre a lo largo del avance y el alto (vertical) cruza la tira.
   */
  widthMm: number;
  heightMm: number;
  /** fondo transparente (canal alfa) o color de fondo */
  transparent: boolean;
  backgroundColor: string;
  /** exportar con canal alfa (PNG RGBA); false → PNG opaco con el color de fondo */
  alphaChannel: boolean;
  color: ColorAdjust;
  /** rotación del fotograma sobre la película (grados) */
  orientation: 0 | 90 | 180 | 270;
  /** sentido en que se colocan los fotogramas sobre la tira */
  direction: 'forward' | 'reverse';
  numbering: { start: number; pad: number; prefix: string };
  /** supermuestreo al pintar (1–4): reduce el aliasing de bordes */
  supersample: number;
}

export const FrameGenSettingsSchema = z.object({
  fpsMode: z.enum(['keep-duration', 'keep-count']),
  fixedCount: z.number().int().min(1).max(4096),
  widthPx: z.number().int().min(8).max(8192),
  heightPx: z.number().int().min(8).max(8192),
  widthMm: z.number().gt(0).max(1000),
  heightMm: z.number().gt(0).max(1000),
  transparent: z.boolean(),
  backgroundColor: z.string(),
  alphaChannel: z.boolean(),
  color: z.object({ brightness: z.number().min(-1).max(1), contrast: z.number().min(0).max(3), saturation: z.number().min(0).max(2), invert: z.boolean(), grayscale: z.boolean(), threshold: z.number().min(0).max(1) }),
  orientation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  direction: z.enum(['forward', 'reverse']),
  numbering: z.object({ start: z.number().int(), pad: z.number().int().min(0).max(8), prefix: z.string() }),
  supersample: z.number().min(1).max(4),
});

export const DEFAULT_COLOR: ColorAdjust = { brightness: 0, contrast: 1, saturation: 1, invert: false, grayscale: false, threshold: 0 };

export function defaultFrameGenSettings(over: Partial<FrameGenSettings> = {}): FrameGenSettings {
  return {
    fpsMode: 'keep-duration',
    fixedCount: 24,
    widthPx: 480,
    heightPx: 300,
    widthMm: 32,
    heightMm: 20,
    transparent: true,
    backgroundColor: '#000000',
    alphaChannel: true,
    color: { ...DEFAULT_COLOR },
    orientation: 0,
    direction: 'forward',
    numbering: { start: 1, pad: 3, prefix: 'frame_' },
    supersample: 2,
    ...over,
  };
}

/** número de fotogramas y duración efectiva según el modo */
export function resolveFrameCount(fps: number, duration: number, s: Pick<FrameGenSettings, 'fpsMode' | 'fixedCount'>): { count: number; duration: number } {
  if (s.fpsMode === 'keep-count') {
    const count = Math.max(1, Math.round(s.fixedCount));
    return { count, duration: count / fps };
  }
  const count = Math.max(1, Math.round(fps * duration));
  return { count, duration };
}

/** resolución efectiva en px por mm (para avisar de resoluciones insuficientes al imprimir) */
export function pixelsPerMm(s: Pick<FrameGenSettings, 'widthPx' | 'widthMm'>): number {
  return s.widthPx / s.widthMm;
}

export function frameLabel(index: number, numbering: FrameGenSettings['numbering']): string {
  return `${numbering.prefix}${String(numbering.start + index).padStart(numbering.pad, '0')}`;
}

/** dimensiones en px tras la orientación */
export function orientedSize(s: Pick<FrameGenSettings, 'widthPx' | 'heightPx' | 'orientation'>): { width: number; height: number } {
  return s.orientation === 90 || s.orientation === 270 ? { width: s.heightPx, height: s.widthPx } : { width: s.widthPx, height: s.heightPx };
}

/** dimensiones en mm sobre la tira tras la orientación: width a lo largo del avance, height cruzando la tira */
export function orientedSizeMm(s: Pick<FrameGenSettings, 'widthMm' | 'heightMm' | 'orientation'>): { width: number; height: number } {
  return s.orientation === 90 || s.orientation === 270 ? { width: s.heightMm, height: s.widthMm } : { width: s.widthMm, height: s.heightMm };
}
