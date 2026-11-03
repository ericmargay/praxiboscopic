// Registro de generadores procedurales y construcción de documentos a partir de un GeneratorRef.
import { emptyDoc, type AnimationDoc, type GeneratorRef } from '../model';
import { abstractGenerator } from './abstract';
import { ballGenerator } from './ball';
import { birdGenerator } from './bird';
import { gearGenerator } from './gear';
import type { GeneratorDef, ParamValue } from './types';
import { walkerGenerator } from './walker';

export * from './types';
export { ballGenerator, birdGenerator, walkerGenerator, gearGenerator, abstractGenerator };

export const GENERATORS: readonly GeneratorDef[] = [ballGenerator, birdGenerator, walkerGenerator, gearGenerator, abstractGenerator];

export function generatorById(id: string): GeneratorDef | undefined {
  return GENERATORS.find((g) => g.id === id);
}

/** parámetros completos: defaults del generador + los del ref */
export function fullParams(ref: GeneratorRef): Record<string, ParamValue> {
  const g = generatorById(ref.id);
  return { ...(g?.defaults ?? {}), ...ref.params };
}

/**
 * Construye (o reconstruye) el documento a partir del generador. Conserva id, nombre, ediciones por fotograma y las
 * capas no procedurales que el usuario haya añadido encima; las capas procedurales se regeneran.
 */
export function buildFromGenerator(ref: GeneratorRef, previous?: AnimationDoc): AnimationDoc {
  const g = generatorById(ref.id);
  if (!g) throw new Error(`Generador desconocido: ${ref.id}`);
  const params = fullParams(ref);
  const content = g.build(params);
  const userLayers = previous?.layers.filter((l) => !l.procedural) ?? [];
  const base = previous ?? emptyDoc({ name: g.label });
  return {
    ...base,
    name: previous && previous.generator?.id === ref.id ? previous.name : g.label,
    width: content.width,
    height: content.height,
    fps: content.fps,
    duration: content.duration,
    layers: [...content.layers, ...userLayers],
    background: content.background ?? base.background,
    generator: { ...ref, params },
    frameOverrides: previous?.frameOverrides ?? {},
  };
}

/** "Hornea" las capas procedurales: pasan a ser capas normales editables y el documento deja de regenerarse. */
export function bakeGenerator(doc: AnimationDoc): AnimationDoc {
  return { ...doc, generator: undefined, layers: doc.layers.map((l) => ({ ...l, procedural: false })) };
}
