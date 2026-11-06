// El proyecto: un único objeto con la animación, los ajustes de fotogramas, la película, la mecánica, los
// estroboscopios, la óptica y la impresión. `deriveProject` calcula todo lo que se deduce (longitudes, recorrido,
// sincronía, avisos) sin pintar nada: es puro y se prueba en Node. El pintado de fotogramas lo hace el host con
// FrameGenerator a partir de estos mismos datos.
import { z } from 'zod';
import { AnimationDocSchema, type AnimationDoc } from '../animation/model';
import { buildFromGenerator } from '../animation/procedural';
import { buildFilmLayout, checkCoherence, defaultFilmSpec, FilmSpecSchema, type CoherenceReport, type FilmLayout, type FilmSpec } from '../film/layout';
import { defaultPrintSpec, type PrintSpec } from '../film/print';
import { defaultFrameGenSettings, FrameGenSettingsSchema, orientedSizeMm, resolveFrameCount, type FrameGenSettings } from '../frames/settings';
import { aspectForShortGap, buildPath, designFestoon, designRectangle, gateOnStraight, interiorClearance, rollerFaces, type PathGeometry, type PathSpec } from '../mech/path';
import { defaultReelsSpec, designReels, fpsRange, HAND_SENSORS, reelDuty, reelPulseS, reelRpm, reelsClearance, reelTorque, stillPulseS, type HandSensor, type ReelsDesign, type ReelsSpec } from '../mech/reels';
import { defaultDrumStrobe, defaultLedStrobe, type DrumStrobe, type LedStrobe, type StrobeSpec } from '../mech/strobe';
import { syncState, type SyncState } from '../mech/sync';
import { defaultTransportSpec, filmBending, type BendingReport, type TransportSpec } from '../mech/transport';
import { defaultOpticsSpec, focusFor, type OpticsSpec } from '../optics/projector';

export const PROJECT_SCHEMA_ID = 'praxiboscopic.project/1';

export type Section = 'studio' | 'mechanical' | 'laboratory';

export interface Project {
  schema: typeof PROJECT_SCHEMA_ID;
  name: string;
  animation: AnimationDoc;
  frames: FrameGenSettings;
  film: FilmSpec;
  path: PathSpec;
  transport: TransportSpec;
  /** estroboscopio activo */
  strobeKind: 'drum' | 'led';
  drum: DrumStrobe;
  led: LedStrobe;
  optics: OpticsSpec;
  print: PrintSpec;
  /** FPS de proyección objetivo (normalmente = animation.fps) */
  targetFps: number;
  /** si true, el recorrido se rediseña automáticamente para que coincida con la longitud de la película */
  autoPath: boolean;
  /** relación de lados del rectángulo de rodillos al autodiseñar */
  pathAspect: number;
  /**
   * forma del recorrido al autodiseñar: rectángulo de 4 rodillos, festón (zigzag) para películas largas, o dos tambores
   * entre los que la película va y viene con la mano del visitante (ADR-0011)
   */
  pathLayout?: 'rectangle' | 'festoon' | 'reels';
  /** festón: rodillos de la fila cercana a la ventana y hueco entre el tramo frontal y esa fila (mm) */
  festoon?: { passes: number; frontGapMm: number };
  /** dos tambores: medidas de la mesa y el programa de las manos. Sin él, `defaultReelsSpec` */
  reels?: ReelsSpec;
  ui: { section: Section; studioTab: string; time: number; playing: boolean; timeScale: number; compare: boolean };
}

const PathSpecSchema = z.object({ rollers: z.array(z.object({ x: z.number(), y: z.number() })).min(2), rollerRadiusMm: z.number().gt(0), driveRoller: z.number().int().min(0), tensionerRoller: z.number().int().min(0).optional(), gateMm: z.number().min(0), direction: z.union([z.literal(1), z.literal(-1)]), sides: z.array(z.union([z.literal(1), z.literal(-1)])).optional() });

export const ProjectSchema = z.object({
  schema: z.literal(PROJECT_SCHEMA_ID),
  name: z.string(),
  animation: AnimationDocSchema,
  frames: FrameGenSettingsSchema,
  film: FilmSpecSchema,
  path: PathSpecSchema,
  transport: z.object({ motorId: z.string(), motorRpm: z.number().min(0), gearRatio: z.number().gt(0), slip: z.number().min(0).max(0.5), running: z.boolean(), speedErrorPct: z.number(), tensionN: z.number().min(0), friction: z.number().min(0) }),
  strobeKind: z.enum(['drum', 'led']),
  drum: z.object({ kind: z.literal('drum'), slots: z.number().int().min(1), rpm: z.number().min(0), slotWidthMm: z.number().gt(0), drumRadiusMm: z.number().gt(0), apertureWidthMm: z.number().gt(0), phaseDeg: z.number(), speedErrorPct: z.number(), lampLumens: z.number().min(0), lampKelvin: z.number().min(1000) }),
  led: z.object({ kind: z.literal('led'), frequencyHz: z.number().min(0), pulseUs: z.number().gt(0), phaseMs: z.number(), freqErrorPct: z.number(), jitterUs: z.number().min(0), peakLumens: z.number().min(0), kelvin: z.number().min(1000), trigger: z.enum(['clock', 'sensor']) }),
  optics: z.object({ focalMm: z.number().gt(0), fNumber: z.number().gt(0), filmToLensMm: z.number().gt(0), throwMm: z.number().gt(0), gateWidthMm: z.number().gt(0), gateHeightMm: z.number().gt(0), condenserEfficiency: z.number().min(0).max(1), lensTransmission: z.number().min(0).max(1), screenGain: z.number().gt(0), ambientLux: z.number().min(0), filmMountedInverted: z.boolean(), mirror: z.boolean() }),
  print: z.object({ ppi: z.number().min(36), pageId: z.string(), customPageMm: z.object({ width: z.number().gt(0), height: z.number().gt(0) }), landscape: z.boolean(), marginMm: z.number().min(0), overlapMm: z.number().min(0), mirror: z.boolean(), emulsion: z.enum(['toward-lens', 'toward-lamp']), mediumId: z.string(), route: z.enum(['direct-film', 'sheets', 'lab']), colorProfile: z.string(), cropMarks: z.boolean(), alignmentMarks: z.boolean(), segmentLabels: z.boolean() }),
  targetFps: z.number().gt(0),
  autoPath: z.boolean(),
  pathAspect: z.number().gt(0),
  pathLayout: z.enum(['rectangle', 'festoon', 'reels']).optional(),
  festoon: z.object({ passes: z.number().int().min(1).max(20), frontGapMm: z.number().min(40) }).optional(),
  reels: z
    .object({
      coreDiameterMm: z.number().min(40).max(400),
      flangeDiameterMm: z.number().min(40).max(600),
      spacingMm: z.number().min(60).max(1000),
      depthMm: z.number().min(60).max(1000),
      guideDiameterMm: z.number().min(10).max(200),
      dancerDiameterMm: z.number().min(10).max(200),
      tailTurns: z.number().min(0).max(10),
      sensor: z.enum(['vl53l4cd', 'vl53l0x']),
      control: z.object({
        speedMap: z.array(z.tuple([z.number().min(0), z.number().min(0).max(120)])).min(1),
        accelMmS2: z.number().gt(0),
        dwellMs: z.number().min(0),
        filterMs: z.number().min(0),
        twoHands: z.enum(['first', 'nearest', 'stop']),
        idle: z.enum(['hold', 'attract']),
        idleS: z.number().min(0),
        attractFps: z.number().gt(0),
        atEnd: z.enum(['wait', 'return']),
        returnFps: z.number().gt(0),
        maxBlurMm: z.number().gt(0),
        stillHz: z.number().gt(0),
        compensateMarkEdge: z.boolean(),
      }),
    })
    .optional(),
  ui: z.object({ section: z.enum(['studio', 'mechanical', 'laboratory']), studioTab: z.string(), time: z.number(), playing: z.boolean(), timeScale: z.number(), compare: z.boolean() }),
}) as unknown as z.ZodType<Project>;

export function parseProject(value: unknown): Project {
  return ProjectSchema.parse(value);
}

/**
 * Proyecto de la demostración, que es también el primer prototipo: pelota en loop, 24 fotogramas a 24 FPS sobre
 * película sin perforar (imagen 32 × 20 mm, paso 36 mm → 864 mm). Cuatro rodillos Ø103,1 mm juntos (9 fotogramas por
 * vuelta, 160 rpm): 10 mm entre los del lado corto y 54 mm en el lado de la ventana, donde pasa la luz del LED. Uno
 * motriz con acoplamiento directo, uno tensor y dos libres. LED de 10 W pulsado, disparado por la marca de cada
 * fotograma, y lente de 50 mm f/1.8 a 1 m (imagen de unos 60 cm). Ver ADR-0007.
 */
/** fotogramas por vuelta de rodillo en la demostración (fija el diámetro: 9 × 36 mm / π = 103,1 mm) */
export const DEMO_FRAMES_PER_TURN = 9;
/** hueco entre las superficies de los rodillos del lado corto (mm): las pestañas de 2 mm caben con holgura */
export const DEMO_SHORT_GAP_MM = 10;

export function demoProject(): Project {
  const animation = buildFromGenerator({ id: 'ball', params: { frames: 24, fps: 24 } });
  const frames = defaultFrameGenSettings({ widthPx: 480, heightPx: 300, widthMm: 32, heightMm: 20 });
  // sin perforaciones: la mueve la fricción del motriz y la sincroniza la marca impresa de cada fotograma
  const baseFilm = defaultFilmSpec();
  // la marca va en el borde superior y mide 5 mm: el sensor de horquilla cuelga sobre ese borde y su haz queda a ~3 mm
  const film = defaultFilmSpec({ stripWidthMm: 40, pitchMm: 36, repeats: 1, perforations: { ...baseFilm.perforations, enabled: false }, syncMarks: { ...baseFilm.syncMarks, edge: 'top', acrossMm: 5 } });
  const count = resolveFrameCount(animation.fps, animation.duration, frames).count;
  const layout = buildFilmLayout({ frameCount: count, alongMm: 32, acrossMm: 20 }, film);
  // circunferencia = 9 pasos de fotograma: 160 rpm a 24 FPS. Con rodillos grandes el loop queda compacto
  const rollerRadius = (DEMO_FRAMES_PER_TURN * film.pitchMm) / (2 * Math.PI);
  // 10 mm entre los rodillos del lado corto; el lado largo (ventana) se queda con ~54 mm para la luz del LED
  const aspect = aspectForShortGap(layout.loopLengthMm, rollerRadius, DEMO_SHORT_GAP_MM);
  const design = designRectangle(layout.loopLengthMm, rollerRadius, aspect);
  const transport = defaultTransportSpec({ motorId: '17hs8401', gearRatio: 1, tensionN: 1 });
  const project: Project = {
    schema: PROJECT_SCHEMA_ID,
    name: 'Demostración · pelota en loop',
    animation,
    frames,
    film,
    // la ventana está en el lado 2→3: el rodillo 3 tira de la película a través de ella y el 0 absorbe el juego
    path: { rollers: design.rollers, rollerRadiusMm: rollerRadius, driveRoller: 3, tensionerRoller: 0, gateMm: design.gateMm, direction: 1 },
    transport,
    // a 864 mm/s, 115 µs dejan el desenfoque en 0,099 mm (120 µs pasarían de 0,1 mm). Flujo de pico estimado para un
    // LED de 10 W a unas 5 veces su corriente nominal: hay que medirlo. La ranura de 10,8 mm admite ~42 % a f/1.8.
    strobeKind: 'led',
    drum: defaultDrumStrobe({ slots: 12, rpm: 120 }),
    led: defaultLedStrobe({ frequencyHz: 24, pulseUs: 115, peakLumens: 3000, kelvin: 6000, jitterUs: 5, trigger: 'sensor' }),
    optics: (() => {
      const o = defaultOpticsSpec({ gateWidthMm: 32, gateHeightMm: 20, focalMm: 50, fNumber: 1.8, throwMm: 1000, condenserEfficiency: 0.42 });
      return { ...o, filmToLensMm: Math.round(focusFor(o) * 100) / 100 };
    })(),
    print: defaultPrintSpec(),
    targetFps: 24,
    autoPath: true,
    pathAspect: aspect,
    ui: { section: 'studio', studioTab: 'editor', time: 0, playing: true, timeScale: 1, compare: true },
  };
  // sincroniza la velocidad del motor con los 24 fps
  const d = deriveProject(project);
  project.transport = { ...transport, motorRpm: d.sync.targets.motorRpm };
  return project;
}

/**
 * Conserva la animación, los fotogramas, la impresión y la interfaz de un proyecto guardado, y le pone el diseño físico
 * del prototipo actual (rodillos, recorrido, marca de sincronía, transporte). Sirve para migrar proyectos guardados con
 * el diseño anterior sin perder el trabajo del estudio.
 */
export function adoptPrototypeDesign(p: Project): Project {
  const demo = demoProject();
  return { ...p, film: { ...p.film, syncMarks: demo.film.syncMarks }, path: demo.path, pathAspect: demo.pathAspect, autoPath: true, transport: { ...p.transport, motorId: demo.transport.motorId, gearRatio: demo.transport.gearRatio, motorRpm: demo.transport.motorRpm } };
}

export interface Derived {
  frameCount: number;
  duration: number;
  /** mm del fotograma orientado sobre la tira */
  frameMm: { width: number; height: number };
  layout: FilmLayout;
  path: PathGeometry;
  pathSpec: PathSpec;
  coherence: CoherenceReport;
  sync: SyncState;
  strobe: StrobeSpec;
  /** espacio dentro del loop frente a lo que ocupa la linterna (mm) */
  clearance: { depthMm: number; widthMm: number; requiredDepthMm: number; requiredWidthMm: number; ok: boolean };
  /**
   * rodillos que tocan cada cara de la película y cuántos tocan la de la tinta (ADR-0009). `covered`: la película es
   * laminada y esos rodillos tocan la cubierta, no la pintura (ADR-0010)
   */
  faces: { lampSide: number; lensSide: number; ink: 'lens' | 'lamp'; inkTouched: number; covered: boolean };
  /** rigidez de la película laminada sobre los rodillos; sin laminar, null */
  bending: BendingReport | null;
  /** avisos de todo el proyecto (coherencia, película, mecánica, óptica) */
  warnings: { level: 'error' | 'warning' | 'info'; source: string; message: string }[];
  /** dos tambores (ADR-0011): solo con `pathLayout: 'reels'` */
  reels?: ReelsDerived;
}

/** lo que se deduce de los dos tambores: diseño, sensor de mano, velocidades, rpm, destellos y par */
export interface ReelsDerived {
  spec: ReelsSpec;
  design: ReelsDesign;
  sensor: HandSensor;
  /** fotogramas por segundo: el más lento y el más rápido de la tabla de la mano, y el normal (los de proyección) */
  fps: { min: number; normal: number; max: number };
  /** rpm de un tambor con el núcleo vacío y lleno, a la velocidad normal y a la máxima */
  rpm: { normalCore: number; normalFull: number; maxCore: number; maxFull: number };
  /** destello a la velocidad mínima, normal y máxima, y los pulsos con la película quieta (µs) */
  pulseUs: { slow: number; normal: number; fast: number; still: number };
  /** fracción del tiempo con luz, igual a cualquier velocidad */
  duty: number;
  torque: ReturnType<typeof reelTorque>;
  /** cuánto abraza la película el rodillo del brazo tensor (°) y su rigidez ahí */
  dancerWrapDeg: number;
  dancerBending: BendingReport;
  guideBending: BendingReport;
  /** largo de película a comprar: la tira, las dos colas y 0,5 m para pruebas (m) */
  filmToBuyM: number;
}

/**
 * Espacio que ocupan dentro del loop la linterna y el estroboscopio (mm). Con LED, solo la cabeza de luz va a la altura
 * de la película (LED de 20 × 20 mm sobre disipador de 40 mm y condensador Ø36 mm): la electrónica sube a la caja de
 * control, sobre los rodillos.
 */
export function lanternEnvelopeMm(p: Pick<Project, 'strobeKind' | 'drum'>): { depthMm: number; widthMm: number } {
  return p.strobeKind === 'drum' ? { depthMm: 2 * p.drum.drumRadiusMm + 60, widthMm: 2 * p.drum.drumRadiusMm } : { depthMm: 80, widthMm: 46 };
}

/** calcula todo lo que se deduce del proyecto (sin pintar) */
export function deriveProject(p: Project): Derived {
  const { count, duration } = resolveFrameCount(p.animation.fps, p.animation.duration, p.frames);
  const frameMm = orientedSizeMm(p.frames);
  // la imagen va derecha sobre la banda de canto: su ancho corre a lo largo de la tira y su alto la cruza
  const layout = buildFilmLayout({ frameCount: count, alongMm: frameMm.width, acrossMm: frameMm.height }, p.film);
  if (p.pathLayout === 'reels' && layout.frames.length) return deriveReels(p, count, duration, frameMm, layout);
  let pathSpec = p.path;
  if (p.autoPath && layout.loopLengthMm > 0) {
    try {
      if (p.pathLayout === 'festoon') {
        const f = designFestoon(layout.loopLengthMm, p.path.rollerRadiusMm, p.festoon?.passes ?? 4, p.festoon?.frontGapMm ?? 90);
        pathSpec = { ...p.path, rollers: f.rollers, sides: f.sides, gateMm: f.gateMm, driveRoller: f.driveRoller, tensionerRoller: f.tensionerRoller };
      } else {
        const d = designRectangle(layout.loopLengthMm, p.path.rollerRadiusMm, p.pathAspect);
        pathSpec = { ...p.path, rollers: d.rollers, sides: undefined, gateMm: d.gateMm };
      }
    } catch {
      // loop demasiado corto: se conserva el recorrido manual y la coherencia avisará
    }
  }
  const path = buildPath(pathSpec);
  const coherence = checkCoherence(layout, path.lengthMm);
  const strobe: StrobeSpec = p.strobeKind === 'drum' ? p.drum : p.led;
  // el par depende de cuántos rodillos arrastra el motriz y de cuánto lo abraza la película
  const driveArc = path.segments.find((x) => x.kind === 'arc' && x.roller === pathSpec.driveRoller);
  const sync = syncState(p.targetFps, layout, p.transport, pathSpec.rollerRadiusMm, strobe, { freeRollers: pathSpec.rollers.length - 1, driveWrapRad: driveArc && driveArc.kind === 'arc' ? Math.abs(driveArc.sweep) : Math.PI / 2 });
  const warnings: Derived['warnings'] = [];
  for (const w of layout.warnings) warnings.push({ level: w.level, source: 'película', message: w.message });
  if (!coherence.ok) warnings.push({ level: coherence.level === 'error' ? 'error' : 'warning', source: 'coherencia', message: `${coherence.message} ${coherence.suggestions[0] ?? ''}` });
  const gate = gateOnStraight(path, pathSpec.gateMm, p.optics.gateHeightMm);
  if (!gate.ok && gate.message) warnings.push({ level: 'warning', source: 'ventana', message: gate.message });
  for (const w of sync.warnings) warnings.push({ level: 'warning', source: 'sincronía', message: w });
  if (Math.abs(p.targetFps - p.animation.fps) > 1e-9) warnings.push({ level: 'info', source: 'tiempo', message: `La animación está muestreada a ${p.animation.fps} FPS y se proyecta a ${p.targetFps} FPS: el movimiento irá ${(p.targetFps / p.animation.fps).toFixed(2)}× más rápido.` });
  if (p.optics.gateWidthMm > frameMm.width + 1e-6 || p.optics.gateHeightMm > frameMm.height + 1e-6) warnings.push({ level: 'warning', source: 'ventana', message: `La ventana óptica (${p.optics.gateWidthMm} × ${p.optics.gateHeightMm} mm) es mayor que el fotograma (${frameMm.width} × ${frameMm.height} mm): se verán los bordes y el fotograma vecino.` });
  const flangeGapMm = 2 * 2 + 3; // pestañas de 2 mm por rodillo + holgura mínima
  let minCenterMm = Infinity;
  pathSpec.rollers.forEach((a, i) => pathSpec.rollers.slice(i + 1).forEach((b) => (minCenterMm = Math.min(minCenterMm, Math.hypot(a.x - b.x, a.y - b.y)))));
  if (minCenterMm < 2 * pathSpec.rollerRadiusMm + flangeGapMm) warnings.push({ level: 'error', source: 'rodillos', message: `Dos rodillos quedan a ${minCenterMm.toFixed(1)} mm entre centros y necesitan al menos ${(2 * pathSpec.rollerRadiusMm + flangeGapMm).toFixed(1)} mm: chocarían. Acerca la proporción a 1, reduce los rodillos o alarga el loop.` });
  const need = lanternEnvelopeMm(p);
  const room = interiorClearance(pathSpec, path, need.depthMm);
  const clearance = { depthMm: room.depthMm, widthMm: room.widthMm, requiredDepthMm: need.depthMm, requiredWidthMm: need.widthMm, ok: room.depthMm >= need.depthMm && room.widthMm >= need.widthMm };
  if (!clearance.ok) {
    warnings.push({
      level: 'error',
      source: 'espacio',
      message: `La linterna${p.strobeKind === 'drum' ? ` y el tambor (Ø${(2 * p.drum.drumRadiusMm).toFixed(0)} mm)` : ''} ocupan ${need.widthMm.toFixed(0)} × ${need.depthMm.toFixed(0)} mm y dentro del loop hay ${room.widthMm.toFixed(0)} × ${room.depthMm.toFixed(0)} mm: chocarían con los rodillos o la película. Repite ciclos en la tira, cambia la proporción del rectángulo o reduce los rodillos.`,
    });
  }
  // la tinta no debe rozar: los rodillos tienen que tocar solo la cara limpia
  const ink = p.print.emulsion === 'toward-lens' ? 'lens' : 'lamp';
  const touched = rollerFaces(pathSpec);
  const lam = p.film.laminate;
  const faces = { ...touched, ink, inkTouched: ink === 'lens' ? touched.lensSide : touched.lampSide, covered: !!lam } as const;
  if (faces.inkTouched > 0 && faces.covered) {
    const marginMm = (p.film.stripWidthMm - frameMm.height) / 2;
    warnings.push({ level: 'info', source: 'rodillos', message: `${faces.inkTouched} de ${pathSpec.rollers.length} rodillos tocan la cubierta que tapa la tinta. Hazlos con el centro rebajado, apoyados solo en los márgenes de ${marginMm.toFixed(0)} mm, para que no la rayen donde va la imagen.` });
  } else if (faces.inkTouched > 0) {
    const where = ink === 'lens' ? 'la de la lente' : 'la de la lámpara';
    const fix = ink === 'lens' ? 'El rectángulo de 4 rodillos solo toca la cara de la lámpara; o lamina la película para cubrir la tinta.' : 'Imprime con la tinta hacia la lente: en un loop convexo los rodillos tocan solo la cara de la lámpara.';
    warnings.push({ level: 'warning', source: 'rodillos', message: `${faces.inkTouched} de ${pathSpec.rollers.length} rodillos tocan la cara de la tinta (${where}): la rozarán. ${fix}` });
  }
  // la laminada pegada se dobla como una sola hoja: 0,2–0,3 mm en total abrazan bien los rodillos
  const bending = lam ? filmBending(lam.baseMm + lam.coverMm, p.film.stripWidthMm, pathSpec.rollerRadiusMm, p.transport.tensionN) : null;
  if (bending && bending.stiffnessRatio > 0.1) warnings.push({ level: 'warning', source: 'película', message: `La película laminada de ${bending.thicknessMm.toFixed(2)} mm es rígida para rodillos de Ø${(2 * pathSpec.rollerRadiusMm).toFixed(1)} mm: doblarla pide el ${(100 * bending.stiffnessRatio).toFixed(0)} % de lo que da la tensión (conviene menos del 10 %). Se despegará de los rodillos y el empalme golpeará: usa de 0,2 a 0,3 mm en total.` });
  else if (bending && bending.thicknessMm < 0.15) warnings.push({ level: 'info', source: 'película', message: `La película laminada de ${bending.thicknessMm.toFixed(2)} mm es delgada: se arruga al manipularla y ondula en la ventana. Conviene de 0,2 a 0,3 mm en total.` });
  return { frameCount: count, duration, frameMm, layout, path, pathSpec, coherence, sync, strobe, clearance, faces, bending, warnings };
}

/**
 * Dos tambores (ADR-0011): la película abierta va de un tambor a otro con la mano del visitante. No hay loop que
 * cerrar; se comprueba que la película quepa en los tambores, que nada choque, que los motores alcancen a la velocidad
 * máxima, que el destello siga a la velocidad y que la tinta vaya cubierta.
 */
function deriveReels(p: Project, count: number, duration: number, frameMm: { width: number; height: number }, layout: FilmLayout): Derived {
  const spec = p.reels ?? defaultReelsSpec({ coreDiameterMm: 2 * p.path.rollerRadiusMm });
  const lam = p.film.laminate;
  // sin laminar se modela una sola hoja de calibre 5
  const t = lam ? lam.baseMm + lam.coverMm : 0.127;
  const design = designReels(spec, layout.frames.map((f) => f.centerMm), layout.totalLengthMm, t);
  const g = design.geometry;
  const path = design.path;
  const pitch = p.film.pitchMm;
  const c = spec.control;
  const T = p.transport.tensionN;
  const pathSpec: PathSpec = { rollers: [g.guide2, g.guide1], rollerRadiusMm: g.guideR, driveRoller: 0, gateMm: design.gateMm, direction: 1, sides: [1, 1] };
  const coherence: CoherenceReport = {
    loopLengthMm: layout.totalLengthMm,
    pathLengthMm: path.lengthMm,
    errorMm: 0,
    framesOff: 0,
    ok: true,
    level: 'ok',
    message: `Película abierta entre dos tambores: ${layout.frames.length} fotogramas en ${(layout.totalLengthMm / 1000).toFixed(2)} m, con colas transparentes de ${design.tail1Mm} mm (tambor 1) y ${design.tail2Mm} mm (tambor 2). No cierra un loop: su largo no tiene que coincidir con el recorrido.`,
    suggestions: [],
  };
  const strobe: StrobeSpec = p.strobeKind === 'drum' ? p.drum : p.led;
  const fr = fpsRange(c.speedMap);
  const normalFps = p.targetFps;
  const vN = normalFps * pitch;
  const pulseN = reelPulseS(vN, c, pitch);
  const torque = reelTorque(p.transport, design, c, pitch, p.film.stripWidthMm);
  const sync: SyncState = {
    targets: { fps: normalFps, filmSpeedMmS: vN, rollerRpm: reelRpm(vN, g.coreR), motorRpm: reelRpm(vN, g.coreR), drumRpm: null, ledHz: normalFps },
    actual: { filmSpeedMmS: vN, transportFps: normalFps, flashHz: normalFps, flashDurationS: pulseN, beatHz: 0, secondsPerFrameSlip: Infinity, blurMm: vN * pulseN, blurFraction: (vN * pulseN) / pitch, averageLumens: p.led.peakLumens * Math.min(1, normalFps * pulseN), maxExposureS: c.maxBlurMm / vN },
    torque,
    warnings: [...torque.warnings],
  };
  const warnings: Derived['warnings'] = [];
  // sin loop no hay empalme de cierre: el aviso del empalme a tope no aplica
  for (const w of layout.warnings) if (w.code !== 'butt-splice') warnings.push({ level: w.level, source: 'película', message: w.message });
  const gate = gateOnStraight(path, design.gateMm, p.optics.gateHeightMm);
  if (!gate.ok && gate.message) warnings.push({ level: 'warning', source: 'ventana', message: gate.message });
  for (const w of sync.warnings) warnings.push({ level: 'warning', source: 'sincronía', message: w });
  if (Math.abs(p.targetFps - p.animation.fps) > 1e-9) warnings.push({ level: 'info', source: 'tiempo', message: `La animación está muestreada a ${p.animation.fps} FPS y la velocidad normal es de ${p.targetFps} FPS: el movimiento irá ${(p.targetFps / p.animation.fps).toFixed(2)}× más rápido.` });
  if (p.optics.gateWidthMm > frameMm.width + 1e-6 || p.optics.gateHeightMm > frameMm.height + 1e-6) warnings.push({ level: 'warning', source: 'ventana', message: `La ventana óptica (${p.optics.gateWidthMm} × ${p.optics.gateHeightMm} mm) es mayor que el fotograma (${frameMm.width} × ${frameMm.height} mm): se verán los bordes y el fotograma vecino.` });
  if (p.strobeKind === 'drum') warnings.push({ level: 'error', source: 'estroboscopio', message: 'Con dos tambores la velocidad la pone la mano: el destello lo tiene que disparar cada marca. El tambor de ranuras gira a velocidad fija y no sirve; usa el LED.' });
  else if (p.led.trigger !== 'sensor') warnings.push({ level: 'error', source: 'estroboscopio', message: 'Con dos tambores la velocidad cambia con la mano: el LED tiene que dispararse con el sensor de marcas, no con un reloj propio.' });
  if (!lam) warnings.push({ level: 'error', source: 'película', message: 'En un tambor cada vuelta se aprieta contra la siguiente y el brazo tensor toca la cara de la tinta: sin cubierta, la tinta se raya. Usa la película laminada (ADR-0010).' });
  const margin = g.flangeR - design.fullR;
  if (margin < 3) warnings.push({ level: 'error', source: 'tambores', message: `La película no cabe: el tambor lleno mide Ø${(2 * design.fullR).toFixed(1)} mm y las bridas Ø${(2 * g.flangeR).toFixed(0)} mm. Usa bridas más grandes o una película más corta.` });
  else if (margin < 8) warnings.push({ level: 'warning', source: 'tambores', message: `El tambor lleno mide Ø${(2 * design.fullR).toFixed(1)} mm y las bridas Ø${(2 * g.flangeR).toFixed(0)} mm: quedan ${margin.toFixed(1)} mm por lado. Con menos de 8 mm la película puede saltar la brida.` });
  // choques entre tambores (por sus bridas), guías y brazo tensor, con 3 mm de holgura
  const bodies = path.circles.map((x) => ({ id: x.id, x: x.x, y: x.y, r: x.id === 'reel1' || x.id === 'reel2' ? g.flangeR : x.r + 2 }));
  const NAME: Record<string, string> = { reel1: 'el tambor 1', reel2: 'el tambor 2', guide1: 'la guía 1', guide2: 'la guía 2', dancer: 'el brazo tensor' };
  bodies.forEach((a, i) => bodies.slice(i + 1).forEach((b) => {
    const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
    if (gap < 3) warnings.push({ level: 'error', source: 'tambores', message: `${NAME[a.id]} y ${NAME[b.id]} quedan a ${gap.toFixed(1)} mm: chocarían. Separa los tambores o achica las bridas.` });
  }));
  const need = lanternEnvelopeMm(p);
  const room = reelsClearance(design, need.depthMm);
  const clearance = { depthMm: room.depthMm, widthMm: room.widthMm, requiredDepthMm: need.depthMm, requiredWidthMm: need.widthMm, ok: room.depthMm >= need.depthMm && room.widthMm >= need.widthMm };
  if (!clearance.ok) warnings.push({ level: 'error', source: 'espacio', message: `La cabeza del LED ocupa ${need.widthMm.toFixed(0)} × ${need.depthMm.toFixed(0)} mm y detrás de la ventana hay ${room.widthMm.toFixed(0)} × ${room.depthMm.toFixed(0)} mm: chocaría con los tambores o las guías.` });
  // la película se dobla en el núcleo como en los rodillos de hoy; en las guías y el brazo tensor, más
  const bending = filmBending(t, p.film.stripWidthMm, g.coreR, T);
  const guideBending = filmBending(t, p.film.stripWidthMm, g.guideR, T);
  const dancerBending = filmBending(t, p.film.stripWidthMm, g.dancerR, T);
  const dancerArc = path.segments.find((x) => x.kind === 'arc' && x.roller === 1);
  const dancerWrapDeg = dancerArc && dancerArc.kind === 'arc' ? (Math.abs(dancerArc.sweep) * 180) / Math.PI : 0;
  if (bending.stiffnessRatio > 0.1) warnings.push({ level: 'warning', source: 'película', message: `La película de ${t.toFixed(2)} mm es rígida para el núcleo de Ø${(2 * g.coreR).toFixed(1)} mm: doblarla pide el ${(100 * bending.stiffnessRatio).toFixed(0)} % de la tensión. Usa de 0,2 a 0,3 mm en total.` });
  if (guideBending.stiffnessRatio > 0.1) warnings.push({ level: 'warning', source: 'película', message: `Las guías de Ø${(2 * g.guideR).toFixed(0)} mm doblan la película 90°: con ${T} N su rigidez pide el ${(100 * guideBending.stiffnessRatio).toFixed(0)} % de la tensión y no las abrazará. Usa guías más grandes o más tensión.` });
  if (dancerBending.stiffnessRatio > 0.1) warnings.push({ level: 'info', source: 'película', message: `El rodillo del brazo tensor (Ø${(2 * g.dancerR).toFixed(0)} mm) solo desvía la película ${dancerWrapDeg.toFixed(0)}°: con ${T} N su rigidez pide el ${(100 * dancerBending.stiffnessRatio).toFixed(0)} % de la tensión y no lo abraza del todo. Basta para que el brazo sienta la tensión.` });
  // caras: tambores y guías tocan la de la lámpara; el brazo tensor, la de la lente. En el tambor cada vuelta apoya en la anterior
  const ink = p.print.emulsion === 'toward-lens' ? 'lens' : 'lamp';
  const faces = { lampSide: 4, lensSide: 1, ink, inkTouched: ink === 'lens' ? 1 : 4, covered: !!lam } as const;
  if (lam) warnings.push({ level: 'info', source: 'rodillos', message: `El rodillo del brazo tensor toca la cubierta que tapa la tinta: hazlo con el centro rebajado, apoyado solo en los márgenes de ${((p.film.stripWidthMm - frameMm.height) / 2).toFixed(0)} mm. En los tambores cada vuelta apoya la cubierta sobre la base de la anterior.` });
  const sensor = HAND_SENSORS[spec.sensor];
  if (spec.sensor === 'vl53l0x') warnings.push({ level: 'info', source: 'manos', message: `El VL53L0X pierde la mano a menos de unos 3 cm: la velocidad máxima de la tabla (a ${Math.min(...c.speedMap.map((m) => m[0])) / 10} cm) no siempre se alcanza. Sirve para la prueba de banco; para la mesa, el VL53L4CD.` });
  const slowUs = reelPulseS(fr.min * pitch, c, pitch) * 1e6;
  if (fr.min < 16) warnings.push({ level: 'info', source: 'luz', message: `A ${fr.min} fps cada destello dura ${slowUs.toFixed(0)} µs, ${(slowUs / (pulseN * 1e6)).toFixed(1)} veces el de ${normalFps} fps: mide en banco que el LED aguante el pulso. Abajo de unos 16 fps se nota el parpadeo.` });
  const reels: ReelsDerived = {
    spec,
    design,
    sensor,
    fps: { min: fr.min, normal: normalFps, max: fr.max },
    rpm: { normalCore: reelRpm(vN, g.coreR), normalFull: reelRpm(vN, design.fullR), maxCore: reelRpm(fr.max * pitch, g.coreR), maxFull: reelRpm(fr.max * pitch, design.fullR) },
    pulseUs: { slow: slowUs, normal: pulseN * 1e6, fast: reelPulseS(fr.max * pitch, c, pitch) * 1e6, still: stillPulseS(c, pitch) * 1e6 },
    duty: reelDuty(c, pitch),
    torque,
    dancerWrapDeg,
    dancerBending,
    guideBending,
    filmToBuyM: design.totalMm / 1000 + 0.5,
  };
  return { frameCount: count, duration, frameMm, layout, path, pathSpec, coherence, sync, strobe, clearance, faces, bending, warnings, reels };
}

/** cuando el usuario cambia el tamaño físico del fotograma, la ventana óptica lo sigue si estaba igualada */
export function followFrameSize(p: Project, next: Pick<FrameGenSettings, 'widthMm' | 'heightMm' | 'orientation'>): Project {
  const before = orientedSizeMm(p.frames);
  const after = orientedSizeMm({ ...p.frames, ...next });
  const gateFollows = Math.abs(p.optics.gateWidthMm - before.width) < 1e-6 && Math.abs(p.optics.gateHeightMm - before.height) < 1e-6;
  const out: Project = { ...p, frames: { ...p.frames, ...next } };
  if (gateFollows) out.optics = { ...p.optics, gateWidthMm: after.width, gateHeightMm: after.height };
  // el paso no puede ser menor que el ancho del fotograma a lo largo de la tira: se sigue con la misma separación
  const gap = p.film.pitchMm - before.width;
  if (gap >= 0 && gap < 10) out.film = { ...p.film, pitchMm: Math.round((after.width + gap) * 100) / 100 };
  return out;
}
