// Contexto de la aplicación: la tienda del proyecto, las derivaciones memoizadas (recorrido, película, sincronía),
// el generador de fotogramas con caché, los fotogramas "impresos" (con el medio aplicado), el motor temporal y el
// compositor de proyección. Todas las secciones de la interfaz reciben este objeto y no guardan estado propio del
// proyecto: así se pasa de Animation Studio a Mechanical Simulation y Projection Laboratory sin perder nada.
import type { AnimationDoc } from '../animation/model';
import { buildFromGenerator } from '../animation/procedural';
import { ProceduralTextEngine, RemoteAiEngine, pickEngine } from '../animation/procedural/text';
import { hashValue } from '../core/hash';
import { adoptPrototypeDesign, demoProject, deriveProject, parseProject, type Derived, type Project } from '../core/project';
import { createStore, type Store } from '../core/store';
import { FrameGenerator, type CanvasFactory, type CanvasLike, type FrameSet } from '../frames/generator';
import { TimeEngine } from '../mech/timing';
import { applyMedium, mediumById } from '../optics/medium';
import { ProjectionCompositor } from '../optics/exposure';
import { BrowserResources } from '../host/browserCanvas';

export const STORAGE_KEY = 'praxiboscopic.project.v3';

export interface PrintedFrames {
  hash: string;
  mediumId: string;
  frames: { index: number; canvas: CanvasLike }[];
  meanTransmittance: number;
}

export class AppContext {
  readonly store: Store<Project>;
  readonly canvases: CanvasFactory;
  readonly resources: BrowserResources;
  readonly generator: FrameGenerator;
  readonly engine = new TimeEngine();
  readonly textEngine = new ProceduralTextEngine();
  readonly aiEngine = new RemoteAiEngine();
  compositor: ProjectionCompositor | null = null;

  private derivedCache: { project: Project; derived: Derived } | null = null;
  private framesCache: { key: string; frames: FrameSet } | null = null;
  private printedCache: PrintedFrames | null = null;
  private tickListeners = new Set<(dt: number) => void>();
  private raf = 0;
  private lastTick = 0;

  constructor(canvases: CanvasFactory, initial?: Project) {
    this.canvases = canvases;
    this.resources = new BrowserResources();
    this.generator = new FrameGenerator(canvases, this.resources);
    this.store = createStore<Project>(initial ?? loadProject() ?? demoProject());
    // una imagen nueva: el hash de cada fotograma incluye qué imágenes ya cargaron, así que basta con regenerar el
    // conjunto (solo se repintan los fotogramas afectados). Se agrupan las llegadas: un video trae cientos de cuadros
    let readyTimer = 0;
    this.resources.onReady = () => {
      clearTimeout(readyTimer);
      readyTimer = window.setTimeout(() => {
        this.framesCache = null;
        this.store.update((p) => ({ ...p }));
      }, 120);
    };
    this.store.onChange((p) => saveProject(p));
  }

  get project(): Project {
    return this.store.get();
  }

  /** derivaciones puras, memoizadas por identidad del proyecto */
  derived(): Derived {
    const p = this.store.get();
    if (this.derivedCache && this.derivedCache.project === p) return this.derivedCache.derived;
    const derived = deriveProject(p);
    this.derivedCache = { project: p, derived };
    return derived;
  }

  /** fotogramas ideales (con caché incremental por fotograma) */
  frames(): FrameSet {
    const p = this.store.get();
    const key = hashValue({ a: p.animation, f: p.frames });
    if (this.framesCache && this.framesCache.key === key) return this.framesCache.frames;
    const frames = this.generator.generate(p.animation, p.frames);
    this.framesCache = { key, frames };
    this.printedCache = null;
    return frames;
  }

  /** fotogramas con el medio de impresión aplicado (transmitancia, Dmax, desenfoque, velo) */
  printedFrames(): PrintedFrames {
    const frames = this.frames();
    const p = this.store.get();
    const mediumId = p.print.mediumId;
    const key = hashValue({ h: frames.hash, mediumId, w: frames.widthMm });
    if (this.printedCache && this.printedCache.hash === key) return this.printedCache;
    const medium = mediumById(mediumId);
    const pxPerMm = frames.widthPx / frames.widthMm;
    let sum = 0;
    const out = frames.frames.map((f) => {
      const c = this.canvases.create(frames.widthPx, frames.heightPx);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(f.canvas as unknown as CanvasImageSource, 0, 0);
      const img = ctx.getImageData(0, 0, frames.widthPx, frames.heightPx);
      const r = applyMedium(img.data, frames.widthPx, frames.heightPx, medium, { pxPerMm, alphaIsClear: true });
      ctx.putImageData(img, 0, 0);
      sum += r.meanTransmittance;
      return { index: f.index, canvas: c };
    });
    this.printedCache = { hash: key, mediumId, frames: out, meanTransmittance: out.length ? sum / out.length : 1 };
    return this.printedCache;
  }

  // -------------------------------------------------------------------------------------------------------------
  // Acciones sobre el proyecto

  setAnimation(doc: AnimationDoc): void {
    this.store.update((p) => ({ ...p, animation: doc }));
  }

  /** cambia parámetros del generador y reconstruye las capas procedurales */
  setGeneratorParams(params: Record<string, number | string | boolean>): void {
    this.store.update((p) => {
      if (!p.animation.generator) return p;
      const ref = { ...p.animation.generator, params: { ...p.animation.generator.params, ...params } };
      const animation = buildFromGenerator(ref, p.animation);
      return { ...p, animation, targetFps: p.targetFps === p.animation.fps ? animation.fps : p.targetFps };
    });
  }

  loadGenerator(id: string, params: Record<string, number | string | boolean> = {}): void {
    this.store.update((p) => {
      const animation = buildFromGenerator({ id, params });
      return { ...p, animation, targetFps: animation.fps };
    });
  }

  async generateFromText(prompt: string): Promise<string[]> {
    const engine = pickEngine([this.aiEngine, this.textEngine]);
    const { doc, notes } = await engine.generate(prompt);
    this.store.update((p) => ({ ...p, animation: doc, targetFps: doc.fps }));
    return [`Motor: ${engine.label}`, ...notes];
  }

  // -------------------------------------------------------------------------------------------------------------
  // Reloj de la interfaz

  onTick(fn: (dt: number) => void): () => void {
    this.tickListeners.add(fn);
    this.startLoop();
    return () => {
      this.tickListeners.delete(fn);
    };
  }

  private startLoop(): void {
    if (this.raf) return;
    this.lastTick = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.25, (now - this.lastTick) / 1000);
      this.lastTick = now;
      for (const l of this.tickListeners) l(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // -------------------------------------------------------------------------------------------------------------
  // Proyecto: guardar, cargar, reiniciar

  exportProjectJson(): string {
    return JSON.stringify(this.store.get(), null, 2);
  }

  importProjectJson(text: string): void {
    const p = parseProject(JSON.parse(text));
    this.generator.clear();
    this.framesCache = null;
    this.store.set(p);
  }

  /** sustituye el proyecto entero (p. ej. al cargar un video) y vacía las cachés de fotogramas */
  replaceProject(p: Project): void {
    this.generator.clear();
    this.framesCache = null;
    this.printedCache = null;
    this.store.set(p);
  }

  resetDemo(): void {
    this.generator.clear();
    this.framesCache = null;
    this.store.set(demoProject());
  }
}

/** clave anterior (rodillos Ø91,67 mm y marca abajo): se lee una vez y se adopta el diseño físico nuevo */
const LEGACY_KEY = 'praxiboscopic.project.v2';

export function loadProject(): Project | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return parseProject(JSON.parse(raw));
    const legacy = localStorage.getItem(LEGACY_KEY);
    return legacy ? adoptPrototypeDesign(parseProject(JSON.parse(legacy))) : null;
  } catch (e) {
    console.warn('Proyecto guardado no válido; se parte de la demostración.', e);
    return null;
  }
}

let saveTimer = 0;
export function saveProject(p: Project): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch (e) {
      console.warn('No se pudo guardar el proyecto en localStorage', e);
    }
  }, 400);
}
