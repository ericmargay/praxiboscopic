// Un video importado (scripts/video.mjs → public/videos/<nombre>/) convertido en animación y en proyecto completo:
// secuencia de cuadros repartida en la duración pedida, película del largo que haga falta, recorrido convexo de 4
// rodillos que solo toca la cara limpia (o festón si se pide o si la película va laminada) y la impresión preparada en
// hojas carta para acetato de inyección. Ver ADR-0008, ADR-0009 y ADR-0010.
import { emptyDoc, identityTransform, makeLayer, uid, type AnimationDoc, type ImageSequence } from '../animation/model';
import { DEFAULT_LAMINATE } from '../film/layout';
import { defaultPrintSpec } from '../film/print';
import { aspectForFootprint } from '../mech/path';
import { defaultReelsSpec, type ReelsSpec } from '../mech/reels';
import { demoProject, deriveProject, type Project } from './project';

export interface VideoManifest {
  name: string;
  title: string;
  source?: string;
  sourceFps: number;
  frames: number;
  durationS: number;
  widthPx: number;
  heightPx: number;
  sequence: ImageSequence;
  color?: string;
  palette: { hex: string; rgb: [number, number, number]; share: number }[];
}

export interface VideoOptions {
  /** duración del ciclo en segundos (el video se alenta o acelera para llenarla) */
  seconds: number;
  /**
   * cómo entra el cuadro del video en el fotograma: `contain` lo muestra completo (con bandas negras si las
   * proporciones no coinciden) y `cover` llena el fotograma recortando lo que sobra
   */
  fit: 'contain' | 'cover';
  /**
   * FPS de proyección. Sin ellos salen de cuadros ÷ segundos y cada cuadro del video aparece una vez; con ellos cada
   * fotograma toma el cuadro del video que toca en su instante (se saltan o se repiten cuadros)
   */
  fps?: number;
  /**
   * recorrido: `rectangle` es convexo y sus rodillos solo tocan la cara de la lámpara; `festoon` es más compacto, pero
   * toca la película por las dos caras: sin laminar roza la tinta (ADR-0009). Por omisión, festón si la película va
   * laminada y rectángulo si no
   */
  layout?: 'rectangle' | 'festoon';
  /** película laminada: cubierta pegada sobre la tinta (ADR-0010). Ver `DEFAULT_LAMINATE` */
  laminate?: { baseMm: number; coverMm: number };
}

/** lienzo del documento: la proporción del fotograma físico (32 × 20 mm → 480 × 300 px) */
const DOC_W = 480;
const DOC_H = 300;

/**
 * Animación con el video como secuencia. Sin `fps`, salen de cuadros ÷ segundos para que cada cuadro del video aparezca
 * exactamente una vez por ciclo (217 cuadros en 10 s → 21,7 fps): alentarlo no inventa ni repite cuadros. Con `fps`
 * fijos, el fotograma k toma el cuadro ⌊k · cuadros / fotogramas⌋ (217 en 5 s a 24 fps → 120 fotogramas, pasos de 1 y 2).
 */
export function videoAnimation(m: VideoManifest, o: VideoOptions): AnimationDoc {
  const aspect = m.widthPx / m.heightPx;
  const docAspect = DOC_W / DOC_H;
  const containW = aspect < docAspect ? DOC_H * aspect : DOC_W;
  const containH = aspect < docAspect ? DOC_H : DOC_W / aspect;
  const w = o.fit === 'contain' ? containW : aspect < docAspect ? DOC_W : DOC_H * aspect;
  const h = o.fit === 'contain' ? containH : aspect < docAspect ? DOC_W / aspect : DOC_H;
  return emptyDoc({
    name: m.title,
    width: DOC_W,
    height: DOC_H,
    fps: o.fps ?? Math.round((m.frames / o.seconds) * 1000) / 1000,
    duration: o.seconds,
    loop: true,
    // negro opaco: en la película el negro es tinta que tapa la luz, igual que el fondo del video
    background: { transparent: false, color: '#000000' },
    layers: [
      makeLayer('Video', [
        {
          id: uid('video'),
          name: `Video · ${m.title}`,
          type: 'image',
          src: `${m.sequence.base}${'0'.repeat(m.sequence.digits)}${m.sequence.ext}`,
          w,
          h,
          smoothing: true,
          sequence: m.sequence,
          transform: identityTransform({ x: DOC_W / 2, y: DOC_H / 2 }),
          style: {},
        },
      ]),
    ],
  });
}

/**
 * Proyecto completo a partir de un video. Conserva el resto del proyecto (óptica, estroboscopio, motor) y cambia la
 * animación, los fotogramas, la película (marcas de sincronía arriba, sin perforar, laminada o no), el recorrido
 * (rectángulo convexo con huella 4:3, o festón) y la impresión (carta horizontal, acetato de inyección, 400 ppi, hojas
 * a ensamblar, tinta hacia la lente: la cara que el rectángulo no toca).
 */
export function videoProject(base: Project, m: VideoManifest, o: VideoOptions = { seconds: 10, fit: 'contain' }): Project {
  const animation = videoAnimation(m, o);
  const count = Math.round(animation.fps * animation.duration);
  const loopMm = count * base.film.pitchMm;
  const R = base.path.rollerRadiusMm;
  const layout = o.layout ?? (o.laminate ? 'festoon' : 'rectangle');
  const long = loopMm > 1500;
  const p: Project = {
    ...base,
    name: `${m.title} · ${o.seconds} s${o.fps ? ` a ${o.fps} fps` : ''}`,
    animation,
    targetFps: animation.fps,
    // fondo negro opaco: las bandas a los lados del video deben tapar la luz, no dejarla pasar
    frames: { ...base.frames, fpsMode: 'keep-duration', fixedCount: count, transparent: false, backgroundColor: '#000000', alphaChannel: false },
    film: { ...base.film, repeats: 1, laminate: o.laminate ? { ...o.laminate } : undefined },
    autoPath: true,
    pathLayout: layout,
    pathAspect: layout === 'rectangle' ? aspectForFootprint(loopMm, R, 4 / 3) : base.pathAspect,
    festoon: layout === 'festoon' ? { passes: festoonPasses(loopMm, R), frontGapMm: 90 } : base.festoon,
    // película larga: tramos libres de más de un metro en el rectángulo o 10 rodillos libres en el festón. Con 2 N la
    // película flamea menos en la ventana y el motriz no patina
    transport: { ...base.transport, tensionN: long ? 2 : base.transport.tensionN },
    print: defaultPrintSpec({ ...base.print, pageId: 'letter', landscape: true, ppi: 400, mediumId: 'inkjet-transparency', route: 'sheets', mirror: false, emulsion: 'toward-lens' }),
  };
  const d = deriveProject(p);
  p.transport = { ...p.transport, motorRpm: d.sync.targets.motorRpm };
  // destello lo bastante corto para no pasar de 0,1 mm de desenfoque (a 24 fps la película va a 864 mm/s: 115 µs)
  const synced = deriveProject(p);
  p.led = { ...p.led, pulseUs: Math.min(p.led.pulseUs, Math.floor((synced.sync.actual.maxExposureS * 1e6) / 5) * 5) };
  return p;
}

/**
 * La máquina de la película laminada de 5 s (ADR-0010) sin el video, que es de terceros y no se publica: la pelota de
 * 24 fotogramas repetida 5 veces llena los mismos 4,32 m, en el mismo festón de 7 rodillos, a 160 rpm y con 115 µs.
 * Es lo que abre `?demo=laminada` en el sitio publicado.
 */
export function laminatedDemoProject(base: Project = demoProject()): Project {
  const repeats = 5;
  const loopMm = deriveProject(base).layout.loopLengthMm * repeats;
  const p: Project = {
    ...base,
    name: 'Demostración · pelota en película laminada (5 s)',
    film: { ...base.film, repeats, laminate: { ...DEFAULT_LAMINATE } },
    autoPath: true,
    pathLayout: 'festoon',
    festoon: { passes: festoonPasses(loopMm, base.path.rollerRadiusMm), frontGapMm: 90 },
    // la misma tensión que el video de 5 s laminado
    transport: { ...base.transport, tensionN: 2 },
  };
  p.transport = { ...p.transport, motorRpm: deriveProject(p).sync.targets.motorRpm };
  return p;
}

/**
 * La misma película en la mesa de dos tambores (ADR-0011): laminada, sin empalme de cierre, con tensión de 1,5 N y el
 * programa de la mano de la propuesta. Conserva la animación, los fotogramas, la óptica y la impresión.
 */
export function reelsProject(base: Project, spec: ReelsSpec = base.reels ?? defaultReelsSpec({ coreDiameterMm: 2 * base.path.rollerRadiusMm })): Project {
  const p: Project = {
    ...base,
    film: { ...base.film, laminate: base.film.laminate ? { ...base.film.laminate } : { ...DEFAULT_LAMINATE }, spliceOverlapMm: 0, spliceType: 'none' },
    autoPath: true,
    pathLayout: 'reels',
    reels: spec,
    strobeKind: 'led',
    led: { ...base.led, trigger: 'sensor' },
    transport: { ...base.transport, tensionN: 1.5, running: true, speedErrorPct: 0 },
  };
  p.transport = { ...p.transport, motorRpm: Math.round(deriveProject(p).sync.targets.motorRpm * 10) / 10 };
  return p;
}

/** la demostración de 5 s en película laminada, en la mesa de dos tambores: lo que abre `?demo=tambores` */
export function reelsDemoProject(): Project {
  return { ...reelsProject(laminatedDemoProject()), name: 'Demostración · dos tambores con la mano (5 s)' };
}

/**
 * Pasadas del festón: las que dejan la mesa más cerca de una proporción 4:3 con filas de al menos 300 mm. Para 7,8 m
 * salen 4 pasadas: mesa de unos 96 × 74 cm. Para 4,32 m salen 2: siete rodillos en una base de unos 54 × 68 cm.
 */
export function festoonPasses(loopMm: number, R = (9 * 36) / (2 * Math.PI), gap = 90): number {
  let best = 1;
  let bestScore = Infinity;
  for (let k = 1; k <= 12; k++) {
    const S = (loopMm - 2 * gap - 4 * R * k) / (2 * k + 2) - Math.PI * R;
    if (S < 300) continue;
    const width = 4 * R * k + 2 * R + 28;
    const depth = S + gap + 2 * R + 28;
    const score = Math.abs(Math.log(width / depth / (4 / 3)));
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return best;
}
