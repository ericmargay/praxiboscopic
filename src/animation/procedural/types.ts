// Contratos de los generadores procedurales y de los motores de generación (procedural hoy, IA después).
import type { AnimationDoc, GeneratorRef, Layer } from '../model';

export type ParamValue = number | string | boolean;

export interface ParamDef {
  key: string;
  label: string;
  type: 'number' | 'color' | 'select' | 'boolean';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { value: string; label: string }[];
  /** agrupación en el panel */
  group?: string;
  /** explicación corta (tooltip) */
  help?: string;
}

/** Lo que un generador produce: capas + dimensiones y tiempo del ciclo. */
export interface GeneratedContent {
  width: number;
  height: number;
  fps: number;
  duration: number;
  layers: Layer[];
  background?: { transparent: boolean; color: string };
}

export interface GeneratorDef {
  id: string;
  label: string;
  description: string;
  params: ParamDef[];
  defaults: Record<string, ParamValue>;
  build(params: Record<string, ParamValue>): GeneratedContent;
}

/** Parámetros comunes de tiempo que todos los generadores exponen. */
export const TIME_PARAMS: ParamDef[] = [
  { key: 'fps', label: 'FPS de la animación', type: 'number', min: 1, max: 60, step: 1, group: 'Tiempo' },
  { key: 'frames', label: 'Número de fotogramas por ciclo', type: 'number', min: 2, max: 240, step: 1, group: 'Tiempo', help: 'La duración del ciclo es fotogramas / FPS' },
];

export function timeOf(p: Record<string, ParamValue>): { fps: number; frames: number; duration: number } {
  const fps = Math.max(1, Number(p.fps) || 24);
  const frames = Math.max(2, Math.round(Number(p.frames) || 24));
  return { fps, frames, duration: frames / fps };
}

export const num = (p: Record<string, ParamValue>, k: string, d: number): number => {
  const v = Number(p[k]);
  return Number.isFinite(v) ? v : d;
};
export const str = (p: Record<string, ParamValue>, k: string, d: string): string => (typeof p[k] === 'string' ? (p[k] as string) : d);
export const bool = (p: Record<string, ParamValue>, k: string, d: boolean): boolean => (typeof p[k] === 'boolean' ? (p[k] as boolean) : d);

/** Motor de generación: convierte una descripción en un documento. */
export interface AnimationEngine {
  id: string;
  label: string;
  /** 'procedural' no necesita nada; un motor de IA necesita configuración (endpoint, llave) */
  available(): boolean;
  /** descripción de por qué no está disponible (para la interfaz) */
  unavailableReason?(): string;
  generate(prompt: string, base?: Partial<AnimationDoc>): Promise<{ doc: AnimationDoc; ref: GeneratorRef; notes: string[] }>;
}
