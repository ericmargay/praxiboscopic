// Documento de animación del Animation Studio: capas, elementos vectoriales/raster/3D, pistas animadas (keyframes
// con easing o expresiones periódicas conscientes del loop), deformaciones y ediciones por fotograma.
//
// Unidades: el lienzo lógico está en píxeles (width × height); el tiempo en segundos dentro del ciclo [0, duration).
// Todo el documento es JSON serializable (lo guarda el proyecto y lo valida `AnimationDocSchema`).
import { z } from 'zod';

export const ANIMATION_SCHEMA_ID = 'praxiboscopic.animation/1';

// ---------------------------------------------------------------------------------------------------------------
// Easing y pistas

export const EASING_NAMES = [
  'linear',
  'easeInQuad',
  'easeOutQuad',
  'easeInOutQuad',
  'easeInCubic',
  'easeOutCubic',
  'easeInOutCubic',
  'easeInSine',
  'easeOutSine',
  'easeInOutSine',
  'easeOutBounce',
  'easeInBounce',
  'easeOutElastic',
  'easeOutBack',
  'easeInBack',
  'step',
] as const;
export type EasingName = (typeof EASING_NAMES)[number];
/** nombre o curva cúbica de Bézier (x1, y1, x2, y2) como en CSS */
export type Easing = EasingName | [number, number, number, number];

export interface Keyframe {
  /** segundos dentro del ciclo */
  t: number;
  v: number;
  /** easing hacia el siguiente keyframe (por defecto linear) */
  e?: Easing;
}

/**
 * Expresión periódica: función del tiempo normalizado u = t / duration ∈ [0, 1). Todas son periódicas en u con
 * periodo 1 / cycles, así que cualquier número entero de ciclos cierra el loop a la perfección.
 */
export type Expr =
  | { kind: 'sin'; amp: number; cycles: number; phase?: number; offset?: number; power?: number }
  | { kind: 'abs-sin'; amp: number; cycles: number; phase?: number; offset?: number; power?: number }
  | { kind: 'saw'; from: number; to: number; cycles: number; phase?: number }
  | { kind: 'triangle'; amp: number; cycles: number; phase?: number; offset?: number }
  | { kind: 'square'; low: number; high: number; cycles: number; duty?: number; phase?: number }
  | { kind: 'bounce'; height: number; bounces: number; damping?: number; floor?: number }
  | { kind: 'noise'; amp: number; cycles: number; seed?: number; offset?: number }
  | { kind: 'sum'; terms: Expr[] };

export type Track = number | { keys: Keyframe[] } | { expr: Expr };

export type Vec2 = { x: number; y: number };

/** pista de puntos (morphing de polígonos y trazados) */
export type PointsTrack = Vec2[] | { keys: { t: number; v: Vec2[]; e?: Easing }[] };

export interface Transform {
  x: Track;
  y: Track;
  /** grados */
  rotation: Track;
  scaleX: Track;
  scaleY: Track;
  opacity: Track;
  /** grados */
  skewX?: Track;
  skewY?: Track;
  /** punto de anclaje en coordenadas locales del elemento (px) */
  anchorX?: number;
  anchorY?: number;
}

export interface Style {
  fill?: string | null;
  stroke?: string | null;
  strokeWidth?: Track;
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
  dash?: number[];
  /** CSS mix-blend / globalCompositeOperation */
  blend?: GlobalCompositeOperation;
}

/** Deformaciones de vértices aplicadas a polígonos y trazados (y a la aproximación poligonal de rect/círculo). */
export interface Deform {
  /** onda senoidal a lo largo de X (amplitud en px, frecuencia en ondas por anchura, fase en vueltas) */
  wave?: { amp: Track; freq: Track; phase: Track; axis?: 'x' | 'y' };
  /** compresión conservando área: >1 aplasta en Y y ensancha en X (squash & stretch) */
  squash?: Track;
  /** curvatura: desplaza X en función de Y² (px por px²) */
  bend?: Track;
  /** estrechamiento lineal hacia arriba (0 = nada, 1 = punta) */
  taper?: Track;
}

interface ItemBase {
  id: string;
  name: string;
  visible?: boolean;
  locked?: boolean;
  transform: Transform;
  style: Style;
  deform?: Deform;
}

export type Item =
  | (ItemBase & { type: 'circle'; rx: Track; ry: Track })
  | (ItemBase & { type: 'rect'; w: Track; h: Track; radius?: Track })
  | (ItemBase & { type: 'polygon'; points: PointsTrack; closed: boolean })
  | (ItemBase & { type: 'line'; x1: Track; y1: Track; x2: Track; y2: Track })
  /** trazado Bézier cúbico: [p0, c1, c2, p1, c1, c2, p2, …] (3n+1 puntos abiertos; 3n cerrado) */
  | (ItemBase & { type: 'path'; points: PointsTrack; closed: boolean })
  | (ItemBase & { type: 'image'; src: string; w: Track; h: Track; smoothing?: boolean })
  | (ItemBase & { type: 'text'; text: string; fontSize: Track; font?: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline })
  | (ItemBase & { type: 'group'; children: Item[] })
  /** modelo o escena 3D (glTF/GLB) renderizado por el host con three.js y compuesto como imagen */
  | (ItemBase & {
      type: 'model3d';
      src: string;
      w: Track;
      h: Track;
      camera: { fovDeg: number; distance: number; elevationDeg: number; azimuthDeg: Track };
      modelRotationY?: Track;
      modelRotationX?: Track;
      lightKelvin?: number;
      environment?: 'studio' | 'none';
    });

export type ItemType = Item['type'];

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked?: boolean;
  transform: Transform;
  items: Item[];
  /** capa generada por un generador procedural: se regenera al cambiar sus parámetros */
  procedural?: boolean;
}

/** Edición individual de un fotograma: se aplica solo al renderizar ese índice. */
export interface FrameOverride {
  itemId: string;
  hidden?: boolean;
  transform?: Partial<Record<'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY' | 'opacity', number>>;
  style?: Pick<Style, 'fill' | 'stroke'>;
}

export interface GeneratorRef {
  id: string;
  params: Record<string, number | string | boolean>;
  /** descripción textual de la que salió (motor procedural o IA) */
  prompt?: string;
  /** 'procedural' hoy; 'ai:<servicio>' cuando haya un servicio conectado */
  engine?: string;
}

export interface AnimationDoc {
  schema: typeof ANIMATION_SCHEMA_ID;
  id: string;
  name: string;
  /** lienzo lógico en px */
  width: number;
  height: number;
  /** FPS del material animado (no confundir con la frecuencia de transporte ni con la de proyección) */
  fps: number;
  /** segundos por ciclo */
  duration: number;
  /** Seamless Loop: muestreo semiabierto y keyframes que envuelven */
  loop: boolean;
  background: { transparent: boolean; color: string };
  layers: Layer[];
  generator?: GeneratorRef;
  /** índice de fotograma → ediciones */
  frameOverrides: Record<string, FrameOverride[]>;
  /** índice de fotograma → imagen (data URL) que sustituye por completo al fotograma generado */
  frameReplacements?: Record<string, string>;
}

// ---------------------------------------------------------------------------------------------------------------
// Esquema Zod (validación al cargar un proyecto o importar una animación)

const EasingSchema = z.union([z.enum(EASING_NAMES), z.tuple([z.number(), z.number(), z.number(), z.number()])]);
const KeyframeSchema = z.object({ t: z.number().min(0), v: z.number(), e: EasingSchema.optional() });

const ExprSchema: z.ZodType<Expr> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('sin'), amp: z.number(), cycles: z.number(), phase: z.number().optional(), offset: z.number().optional(), power: z.number().optional() }),
    z.object({ kind: z.literal('abs-sin'), amp: z.number(), cycles: z.number(), phase: z.number().optional(), offset: z.number().optional(), power: z.number().optional() }),
    z.object({ kind: z.literal('saw'), from: z.number(), to: z.number(), cycles: z.number(), phase: z.number().optional() }),
    z.object({ kind: z.literal('triangle'), amp: z.number(), cycles: z.number(), phase: z.number().optional(), offset: z.number().optional() }),
    z.object({ kind: z.literal('square'), low: z.number(), high: z.number(), cycles: z.number(), duty: z.number().optional(), phase: z.number().optional() }),
    z.object({ kind: z.literal('bounce'), height: z.number(), bounces: z.number(), damping: z.number().optional(), floor: z.number().optional() }),
    z.object({ kind: z.literal('noise'), amp: z.number(), cycles: z.number(), seed: z.number().optional(), offset: z.number().optional() }),
    z.object({ kind: z.literal('sum'), terms: z.array(ExprSchema) }),
  ]),
);

const TrackSchema: z.ZodType<Track> = z.union([z.number(), z.object({ keys: z.array(KeyframeSchema) }), z.object({ expr: ExprSchema })]);
const Vec2Schema = z.object({ x: z.number(), y: z.number() });
const PointsTrackSchema: z.ZodType<PointsTrack> = z.union([z.array(Vec2Schema), z.object({ keys: z.array(z.object({ t: z.number(), v: z.array(Vec2Schema), e: EasingSchema.optional() })) })]);

const TransformSchema = z.object({
  x: TrackSchema,
  y: TrackSchema,
  rotation: TrackSchema,
  scaleX: TrackSchema,
  scaleY: TrackSchema,
  opacity: TrackSchema,
  skewX: TrackSchema.optional(),
  skewY: TrackSchema.optional(),
  anchorX: z.number().optional(),
  anchorY: z.number().optional(),
});

const StyleSchema = z.object({
  fill: z.string().nullable().optional(),
  stroke: z.string().nullable().optional(),
  strokeWidth: TrackSchema.optional(),
  lineCap: z.enum(['butt', 'round', 'square']).optional(),
  lineJoin: z.enum(['miter', 'round', 'bevel']).optional(),
  dash: z.array(z.number()).optional(),
  blend: z.string().optional(),
});

const DeformSchema = z.object({
  wave: z.object({ amp: TrackSchema, freq: TrackSchema, phase: TrackSchema, axis: z.enum(['x', 'y']).optional() }).optional(),
  squash: TrackSchema.optional(),
  bend: TrackSchema.optional(),
  taper: TrackSchema.optional(),
});

const itemBase = { id: z.string().min(1), name: z.string(), visible: z.boolean().optional(), locked: z.boolean().optional(), transform: TransformSchema, style: StyleSchema, deform: DeformSchema.optional() };

export const ItemSchema: z.ZodType<Item> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ ...itemBase, type: z.literal('circle'), rx: TrackSchema, ry: TrackSchema }),
    z.object({ ...itemBase, type: z.literal('rect'), w: TrackSchema, h: TrackSchema, radius: TrackSchema.optional() }),
    z.object({ ...itemBase, type: z.literal('polygon'), points: PointsTrackSchema, closed: z.boolean() }),
    z.object({ ...itemBase, type: z.literal('line'), x1: TrackSchema, y1: TrackSchema, x2: TrackSchema, y2: TrackSchema }),
    z.object({ ...itemBase, type: z.literal('path'), points: PointsTrackSchema, closed: z.boolean() }),
    z.object({ ...itemBase, type: z.literal('image'), src: z.string(), w: TrackSchema, h: TrackSchema, smoothing: z.boolean().optional() }),
    z.object({ ...itemBase, type: z.literal('text'), text: z.string(), fontSize: TrackSchema, font: z.string().optional(), align: z.string().optional(), baseline: z.string().optional() }),
    z.object({ ...itemBase, type: z.literal('group'), children: z.array(ItemSchema) }),
    z.object({
      ...itemBase,
      type: z.literal('model3d'),
      src: z.string(),
      w: TrackSchema,
      h: TrackSchema,
      camera: z.object({ fovDeg: z.number(), distance: z.number(), elevationDeg: z.number(), azimuthDeg: TrackSchema }),
      modelRotationY: TrackSchema.optional(),
      modelRotationX: TrackSchema.optional(),
      lightKelvin: z.number().optional(),
      environment: z.enum(['studio', 'none']).optional(),
    }),
  ]) as unknown as z.ZodType<Item>,
);

const LayerSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  visible: z.boolean(),
  locked: z.boolean().optional(),
  transform: TransformSchema,
  items: z.array(ItemSchema),
  procedural: z.boolean().optional(),
});

const FrameOverrideSchema = z.object({
  itemId: z.string(),
  hidden: z.boolean().optional(),
  transform: z.record(z.enum(['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity']), z.number()).optional(),
  style: z.object({ fill: z.string().nullable().optional(), stroke: z.string().nullable().optional() }).optional(),
});

export const AnimationDocSchema = z.object({
  schema: z.literal(ANIMATION_SCHEMA_ID),
  id: z.string().min(1),
  name: z.string(),
  width: z.number().int().min(8).max(8192),
  height: z.number().int().min(8).max(8192),
  fps: z.number().min(1).max(240),
  duration: z.number().gt(0).max(600),
  loop: z.boolean(),
  background: z.object({ transparent: z.boolean(), color: z.string() }),
  layers: z.array(LayerSchema),
  generator: z.object({ id: z.string(), params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])), prompt: z.string().optional(), engine: z.string().optional() }).optional(),
  frameOverrides: z.record(z.string(), z.array(FrameOverrideSchema)),
  frameReplacements: z.record(z.string(), z.string()).optional(),
}) as unknown as z.ZodType<AnimationDoc>;

export function parseAnimationDoc(value: unknown): AnimationDoc {
  return AnimationDocSchema.parse(value);
}

// ---------------------------------------------------------------------------------------------------------------
// Constructores

let counter = 0;
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function identityTransform(over: Partial<Transform> = {}): Transform {
  return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, ...over };
}

export function emptyDoc(over: Partial<AnimationDoc> = {}): AnimationDoc {
  return {
    schema: ANIMATION_SCHEMA_ID,
    id: uid('anim'),
    name: 'Sin título',
    width: 512,
    height: 384,
    fps: 24,
    duration: 1,
    loop: true,
    background: { transparent: true, color: '#000000' },
    layers: [],
    frameOverrides: {},
    ...over,
  };
}

export function makeLayer(name: string, items: Item[] = [], over: Partial<Layer> = {}): Layer {
  return { id: uid('layer'), name, visible: true, transform: identityTransform(), items, ...over };
}

/** número de fotogramas de un documento (redondeado; mínimo 1) */
export function frameCount(doc: Pick<AnimationDoc, 'fps' | 'duration'>): number {
  return Math.max(1, Math.round(doc.fps * doc.duration));
}

/** recorre todos los elementos (incluidos los de grupos) */
export function* walkItems(items: Item[]): Generator<Item> {
  for (const it of items) {
    yield it;
    if (it.type === 'group') yield* walkItems(it.children);
  }
}

export function findItem(doc: AnimationDoc, id: string): { layer: Layer; item: Item } | null {
  for (const layer of doc.layers) for (const item of walkItems(layer.items)) if (item.id === id) return { layer, item };
  return null;
}

/** sustituye (inmutablemente) un elemento por id en todo el documento */
export function mapItem(doc: AnimationDoc, id: string, fn: (item: Item) => Item): AnimationDoc {
  const mapItems = (items: Item[]): Item[] =>
    items.map((it) => {
      if (it.id === id) return fn(it);
      if (it.type === 'group') return { ...it, children: mapItems(it.children) };
      return it;
    });
  return { ...doc, layers: doc.layers.map((l) => ({ ...l, items: mapItems(l.items) })) };
}

export function removeItem(doc: AnimationDoc, id: string): AnimationDoc {
  const rm = (items: Item[]): Item[] => items.filter((it) => it.id !== id).map((it) => (it.type === 'group' ? { ...it, children: rm(it.children) } : it));
  return { ...doc, layers: doc.layers.map((l) => ({ ...l, items: rm(l.items) })) };
}

/** ¿el documento es íntegramente vectorial? (sin imágenes raster ni 3D) → permite exportar SVG */
export function isVectorOnly(doc: AnimationDoc): boolean {
  for (const l of doc.layers) for (const it of walkItems(l.items)) if (it.type === 'image' || it.type === 'model3d') return false;
  return true;
}
