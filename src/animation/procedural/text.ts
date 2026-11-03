// Motor procedural de texto → animación. Interpreta una descripción en español o inglés (qué se anima, color,
// tamaño, velocidad, cantidad de rebotes/aleteos/pasos, fotogramas, FPS) y la convierte en un GeneratorRef.
// No depende de ningún servicio: es determinista y explica qué entendió (`notes`). Un motor de IA (RemoteAiEngine)
// implementa la misma interfaz y, si está configurado, puede sustituirlo.
import { parseAnimationDoc, type AnimationDoc, type GeneratorRef } from '../model';
import { buildFromGenerator, generatorById } from './index';
import type { AnimationEngine, ParamValue } from './types';

const COLORS: Record<string, string> = {
  rojo: '#ff3b30',
  roja: '#ff3b30',
  red: '#ff3b30',
  azul: '#2f7cf6',
  blue: '#2f7cf6',
  verde: '#34c759',
  green: '#34c759',
  amarillo: '#ffd60a',
  amarilla: '#ffd60a',
  yellow: '#ffd60a',
  naranja: '#ff9500',
  orange: '#ff9500',
  morado: '#9b5de5',
  morada: '#9b5de5',
  púrpura: '#9b5de5',
  purple: '#9b5de5',
  violeta: '#9b5de5',
  rosa: '#ff6fae',
  pink: '#ff6fae',
  blanco: '#ffffff',
  blanca: '#ffffff',
  white: '#ffffff',
  negro: '#111111',
  negra: '#111111',
  black: '#111111',
  cian: '#30d5c8',
  cyan: '#30d5c8',
  dorado: '#d4a53a',
  gold: '#d4a53a',
  gris: '#9a9a9a',
  gray: '#9a9a9a',
  grey: '#9a9a9a',
};

const KIND_WORDS: [string, RegExp][] = [
  ['ball', /\b(pelota|bola|balón|balon|esfera|ball|bounc|rebot)/i],
  ['bird', /\b(ave|pájaro|pajaro|bird|gaviota|paloma|vuel|fly|flying|alas?)/i],
  ['walker', /\b(camin|anda|walk|persona|figura humana|humano|hombre|mujer|marcha|pasos?)/i],
  ['gear', /\b(engran|gear|rueda|dentad|gira|rotat|rot[aá]ndo|polígono|poligono|estrella|hexágono|hexagono)/i],
  ['abstract', /\b(abstract|geom[eé]tric|formas|patr[oó]n|pattern|anillo|mandala)/i],
];

function numberBefore(text: string, unit: RegExp): number | undefined {
  const m = text.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${unit.source}`, 'i'));
  if (m) return parseFloat(m[1].replace(',', '.'));
  const words: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, doce: 12, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, ten: 10, twelve: 12 };
  const m2 = text.match(new RegExp(`\\b(${Object.keys(words).join('|')})\\s+${unit.source}`, 'i'));
  if (m2) return words[m2[1].toLowerCase()];
  return undefined;
}

export interface TextInterpretation {
  ref: GeneratorRef;
  notes: string[];
}

export function interpretText(prompt: string): TextInterpretation {
  const text = prompt.trim();
  const notes: string[] = [];
  let kind = 'ball';
  for (const [k, re] of KIND_WORDS) {
    if (re.test(text)) {
      kind = k;
      break;
    }
  }
  const g = generatorById(kind)!;
  notes.push(`Tipo: ${g.label}`);
  const params: Record<string, ParamValue> = {};

  for (const [word, hex] of Object.entries(COLORS)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) {
      params.color = hex;
      notes.push(`Color: ${word}`);
      break;
    }
  }
  const hex = text.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/i);
  if (hex) params.color = `#${hex[1]}`;

  const frames = numberBefore(text, /(fotogramas?|frames?|cuadros?|imágenes|imagenes)/);
  if (frames) {
    params.frames = Math.round(frames);
    notes.push(`Fotogramas: ${params.frames}`);
  }
  const fps = numberBefore(text, /(fps|cuadros por segundo|fotogramas por segundo)/);
  if (fps) {
    params.fps = fps;
    notes.push(`FPS: ${fps}`);
  }
  const seconds = numberBefore(text, /(segundos?|s\b|sec)/);
  if (seconds && !frames) {
    params.frames = Math.round(seconds * (Number(params.fps) || Number(g.defaults.fps) || 24));
    notes.push(`Duración: ${seconds} s → ${params.frames} fotogramas`);
  }

  // "3 veces" / "twice" se refiere a la repetición principal de cada tipo
  const times = numberBefore(text, /(veces|times)/) ?? (/\b(twice|dos veces)\b/i.test(text) ? 2 : undefined);
  if (times) params[kind === 'ball' ? 'bounces' : kind === 'bird' ? 'flaps' : kind === 'walker' ? 'steps' : kind === 'gear' ? 'turnsTeeth' : 'pulses'] = Math.round(times);

  if (kind === 'ball') {
    const b = numberBefore(text, /(rebotes?|bounces?|botes?)/);
    if (b) params.bounces = Math.round(b);
    if (/\b(alto|alta|high)\b/i.test(text)) params.bounceHeight = 230;
    if (/\b(bajo|baja|low)\b/i.test(text)) params.bounceHeight = 90;
    if (/\b(r[ií]gid|dura|hard)\b/i.test(text)) params.squash = 0.05;
    if (/\b(blanda|elástica|elastica|soft|caricatura|cartoon)\b/i.test(text)) params.squash = 0.45;
  }
  if (kind === 'bird') {
    const f = numberBefore(text, /(aleteos?|flaps?|batidos?)/);
    if (f) params.flaps = Math.round(f);
    if (/\bsin nubes|no clouds\b/i.test(text)) params.clouds = false;
  }
  if (kind === 'walker') {
    const s = numberBefore(text, /(pasos?|zancadas?|steps?)/);
    if (s) params.steps = Math.round(s);
  }
  if (kind === 'gear') {
    const t = numberBefore(text, /(dientes|teeth|lados|sides|puntas)/);
    if (t) params.teeth = Math.round(t);
    if (/\b(estrella|star)\b/i.test(text)) params.shape = 'star';
    else if (/\b(pol[ií]gono|polygon|hex[aá]gono|tri[aá]ngulo|cuadrado)\b/i.test(text)) params.shape = 'polygon';
    if (/\b(antihorario|counter|izquierda)\b/i.test(text)) params.direction = 'ccw';
    if (/\b(solo|sola|single|uno)\b/i.test(text)) params.second = false;
  }
  if (kind === 'abstract') {
    const c = numberBefore(text, /(formas|shapes|figuras)/);
    if (c) params.count = Math.round(c);
    if (/\b(fr[ií]o|fria|cool|azul)\b/i.test(text)) params.palette = 'cool';
    if (/\b(mono|blanco y negro|gris)\b/i.test(text)) params.palette = 'mono';
    if (/\bbauhaus\b/i.test(text)) params.palette = 'bauhaus';
  }

  if (/\b(grande|big|large|enorme)\b/i.test(text)) {
    params[kind === 'ball' || kind === 'gear' ? 'radius' : 'size'] = kind === 'ball' ? 60 : kind === 'gear' ? 120 : 240;
    notes.push('Tamaño: grande');
  }
  if (/\b(pequeñ|chic|small|tiny)/i.test(text)) {
    params[kind === 'ball' || kind === 'gear' ? 'radius' : 'size'] = kind === 'ball' ? 18 : kind === 'gear' ? 50 : 120;
    notes.push('Tamaño: pequeño');
  }
  // velocidad: con el mismo número de fotogramas, "rápido" = más ciclos del movimiento por loop
  if (/\b(r[aá]pid|fast|quick|veloz)/i.test(text)) {
    const key = kind === 'ball' ? 'bounces' : kind === 'bird' ? 'flaps' : kind === 'walker' ? 'steps' : kind === 'gear' ? 'turnsTeeth' : 'pulses';
    params[key] = Math.max(2, Math.round(Number(params[key] ?? g.defaults[key]) * 2));
    notes.push('Velocidad: rápida');
  }
  if (/\b(lent|slow|despacio)/i.test(text)) {
    params.frames = Math.round(Number(params.frames ?? g.defaults.frames) * 2);
    notes.push('Velocidad: lenta (ciclo doble de largo)');
  }
  return { ref: { id: kind, params, prompt, engine: 'procedural' }, notes };
}

export class ProceduralTextEngine implements AnimationEngine {
  id = 'procedural';
  label = 'Motor procedural (sin servicios externos)';
  available(): boolean {
    return true;
  }
  async generate(prompt: string, base?: Partial<AnimationDoc>) {
    const { ref, notes } = interpretText(prompt);
    const doc = buildFromGenerator(ref, base ? ({ ...base } as AnimationDoc) : undefined);
    return { doc: { ...doc, name: prompt.slice(0, 48) || doc.name }, ref, notes };
  }
}

export interface RemoteAiConfig {
  endpoint?: string;
  apiKey?: string;
  model?: string;
}

/**
 * Adaptador para un servicio de generación por IA. Espera un endpoint HTTP que reciba `{ prompt, schema, base }` y
 * devuelva un documento `praxiboscopic.animation/1` (o un `{ generator }` con id y params de un generador conocido).
 * Si no hay endpoint configurado, no está disponible y la interfaz usa el motor procedural.
 */
export class RemoteAiEngine implements AnimationEngine {
  id = 'ai';
  label = 'Servicio de IA (configurable)';
  constructor(private config: RemoteAiConfig = {}) {}
  configure(config: RemoteAiConfig): void {
    this.config = { ...this.config, ...config };
  }
  available(): boolean {
    return !!this.config.endpoint;
  }
  unavailableReason(): string {
    return 'No hay servicio de IA configurado (endpoint vacío). Se usa el motor procedural.';
  }
  async generate(prompt: string, base?: Partial<AnimationDoc>) {
    if (!this.config.endpoint) throw new Error(this.unavailableReason());
    const res = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}) },
      body: JSON.stringify({ prompt, model: this.config.model, schema: 'praxiboscopic.animation/1', base }),
    });
    if (!res.ok) throw new Error(`El servicio de IA respondió ${res.status}`);
    const json = (await res.json()) as { generator?: GeneratorRef; doc?: unknown };
    if (json.generator) {
      const ref = { ...json.generator, prompt, engine: `ai:${this.config.model ?? 'remoto'}` };
      return { doc: buildFromGenerator(ref, base as AnimationDoc | undefined), ref, notes: ['Generador elegido por el servicio de IA'] };
    }
    const doc = parseAnimationDoc(json.doc);
    return { doc, ref: { id: 'ai', params: {}, prompt, engine: `ai:${this.config.model ?? 'remoto'}` }, notes: ['Documento devuelto por el servicio de IA'] };
  }
}

/** Elige el motor: IA si está disponible, si no el procedural. */
export function pickEngine(engines: AnimationEngine[]): AnimationEngine {
  return engines.find((e) => e.id === 'ai' && e.available()) ?? engines.find((e) => e.available()) ?? new ProceduralTextEngine();
}
