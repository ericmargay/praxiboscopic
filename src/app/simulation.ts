// Corredor de la simulación: avanza el motor temporal con la velocidad real de la cinta, dispara el estroboscopio
// y acumula la exposición en el compositor. Es único para toda la aplicación: al cambiar de sección la película
// sigue en la misma posición y la pantalla conserva su imagen. Con dos tambores (ADR-0011) la velocidad la pone el
// programa del ESP32 a partir de las manos simuladas (`hands`), en pasos de 2 ms.
import { phiForSlotAtGate, type FilmLayout } from '../film/layout';
import type { CanvasLike } from '../frames/generator';
import { filmSpeed, gateState, type GateState } from '../mech/transport';
import type { TimeStep } from '../mech/timing';
import { ProjectionCompositor, type ExposureResult, type FrameImageSource } from '../optics/exposure';
import { flashDuration, flashFrequency } from '../mech/strobe';
import { ReelController, reelEvents, reelPulseS, stillPulseS, type HandInput, type ReelLive } from '../mech/reels';
import type { Derived } from '../core/project';
import type { AppContext } from './context';

/** paso del programa de los tambores (s) */
const REEL_STEP_S = 0.002;

export class SimulationRunner {
  readonly compositor: ProjectionCompositor;
  /** usar fotogramas ideales (true) o impresos con el medio (false) en la proyección */
  useIdealFrames = false;
  /** persistencia retiniana (s): a 24 Hz, 25 ms deja el destello anterior al 19 % (fusión sin estela marcada) */
  retinaTauS = 0.025;
  lastStep: TimeStep | null = null;
  lastExposure: ExposureResult | null = null;
  /** brillo instantáneo del estroboscopio para la escena (0..1, decae) */
  flashIntensity = 0;
  /** destellos totales desde el último reinicio */
  flashCount = 0;
  /** dos tambores: las manos del visitante sobre el tambor 1 y el tambor 2 */
  readonly hands: [HandInput, HandInput] = [
    { present: false, distanceMm: 150 },
    { present: false, distanceMm: 150 },
  ];
  /** dos tambores: duración del último destello (s) */
  lastPulseS = 0;
  private reel: { ctrl: ReelController; key: string } | null = null;
  private initialized = false;

  constructor(private readonly ctx: AppContext) {
    this.compositor = new ProjectionCompositor(ctx.canvases, 320, 200, 640, 400);
    ctx.compositor = this.compositor;
  }

  get screen(): CanvasLike {
    return this.compositor.screen;
  }

  frameSource(): FrameImageSource {
    if (this.useIdealFrames) {
      const set = this.ctx.frames();
      const byIndex = new Map(set.frames.map((f) => [f.index, f.canvas]));
      return { get: (i) => byIndex.get(i) ?? null };
    }
    const printed = this.ctx.printedFrames();
    const byIndex = new Map(printed.frames.map((f) => [f.index, f.canvas]));
    return { get: (i) => byIndex.get(i) ?? null };
  }

  /** estado del programa de los tambores (null si el proyecto es un loop) */
  reelLive(): ReelLive | null {
    const d = this.ctx.derived();
    return d.reels ? this.reelController(d).live : null;
  }

  private reelController(d: Derived): ReelController {
    const r = d.reels!;
    const key = JSON.stringify([r.design.phiMin, r.design.phiMax, r.design.centers.length]);
    if (!this.reel || this.reel.key !== key) {
      const phi = this.reel ? this.reel.ctrl.live.phiMm : r.design.phiMin;
      const ctrl = new ReelController({ phiMin: r.design.phiMin, phiMax: r.design.phiMax, centers: r.design.centers }, r.spec.control, r.sensor);
      ctrl.reset(Math.max(r.design.phiMin, Math.min(r.design.phiMax, phi)));
      this.reel = { ctrl, key };
    }
    // el programa y el sensor se pueden cambiar en marcha
    this.reel.ctrl.control = r.spec.control;
    this.reel.ctrl.sensor = r.sensor;
    return this.reel.ctrl;
  }

  /** la ventana no envuelve la película abierta: el primer fotograma no tiene vecino al otro lado */
  exposureLayout(d: Derived): FilmLayout {
    return d.reels ? { ...d.layout, loopLengthMm: 1e9 } : d.layout;
  }

  /** coloca el fotograma 0 en la ventana y limpia la pantalla */
  reset(): void {
    const d = this.ctx.derived();
    this.ctx.engine.reset();
    if (d.reels) {
      this.ctx.engine.loopLengthMm = 0;
      const ctrl = this.reelController(d);
      ctrl.reset(d.reels.design.phiMin);
      this.ctx.engine.phiMm = ctrl.live.phiMm;
    } else {
      this.ctx.engine.loopLengthMm = d.layout.loopLengthMm;
      this.ctx.engine.phiMm = phiForSlotAtGate(d.layout, d.pathSpec.gateMm, 0);
    }
    this.compositor.clear();
    this.flashCount = 0;
    this.lastExposure = null;
    this.initialized = true;
  }

  gate(): GateState | null {
    const d = this.ctx.derived();
    const p = this.ctx.project;
    if (d.reels) return gateState(this.exposureLayout(d), d.pathSpec.gateMm, this.ctx.engine.phiMm, this.reelController(d).live.vMmS);
    return gateState(d.layout, d.pathSpec.gateMm, this.ctx.engine.phiMm, filmSpeed(p.transport, d.pathSpec.rollerRadiusMm));
  }

  /** un paso de reloj real (s) */
  tick(dtRealS: number): void {
    const p = this.ctx.project;
    const d = this.ctx.derived();
    if (!this.initialized) this.reset();
    this.ctx.engine.timeScale = p.ui.timeScale;
    if (!p.ui.playing) {
      this.flashIntensity *= Math.exp(-dtRealS / 0.08);
      return;
    }
    if (d.reels) return this.tickReels(dtRealS, d);
    this.ctx.engine.loopLengthMm = d.layout.loopLengthMm;
    const speed = filmSpeed(p.transport, d.pathSpec.rollerRadiusMm);
    const sensor = { positionsMm: d.layout.frames.map((f) => d.pathSpec.gateMm + f.centerMm), loopMm: d.layout.loopLengthMm };
    const step = this.ctx.engine.advance(dtRealS, speed, d.strobe, sensor);
    this.lastStep = step;
    const ref = Math.max(50e-6, flashDuration(d.strobe) || 300e-6);
    const f = d.sync.actual.flashHz || flashFrequency(d.strobe);
    this.exposeStep(step, d, ref, f > 0 ? 1 / f : undefined);
  }

  /** dos tambores: el programa mueve la película con rampa según las manos y cada fotograma centrado dispara el LED */
  private tickReels(dtRealS: number, d: Derived): void {
    const p = this.ctx.project;
    const r = d.reels!;
    const ctrl = this.reelController(d);
    const engine = this.ctx.engine;
    engine.loopLengthMm = 0;
    const total = Math.max(0, dtRealS) * p.ui.timeScale;
    const n = Math.max(1, Math.ceil(total / REEL_STEP_S));
    const h = total / n;
    const pitch = p.film.pitchMm;
    const events: TimeStep['events'] = [];
    for (let i = 0; i < n; i++) {
      const phi0 = ctrl.live.phiMm;
      const live = ctrl.step(h, this.hands, pitch);
      events.push(...reelEvents({ t0: engine.t, dt: h, phi0, phi1: live.phiMm, still: live.still, centers: r.design.centers, control: r.spec.control, pitchMm: pitch, markAlongMm: p.film.syncMarks.alongMm, led: p.led, rng: engine.rng }));
      engine.t += h;
    }
    engine.phiMm = ctrl.live.phiMm;
    const live = ctrl.live;
    const step: TimeStep = { t: engine.t, dt: total, phiMm: live.phiMm, speedMmS: live.vMmS, events: events.length > engine.maxEvents ? events.slice(events.length - engine.maxEvents) : events };
    this.lastStep = step;
    // la luz promedio es la misma a cualquier velocidad: cada destello pesa como uno completo de su propio periodo
    const c = r.spec.control;
    const v = Math.abs(live.vMmS);
    const ref = live.still ? stillPulseS(c, pitch) : reelPulseS(v, c, pitch);
    const period = live.still ? 1 / c.stillHz : v > 1e-6 ? pitch / v : undefined;
    if (step.events.length) this.lastPulseS = step.events[step.events.length - 1].flash.duration;
    this.exposeStep(step, d, ref, period);
  }

  private exposeStep(step: TimeStep, d: Derived, referenceExposureS: number, flashPeriodS: number | undefined): void {
    const p = this.ctx.project;
    const frames = this.ctx.frames();
    const pxPerMm = frames.widthPx / frames.widthMm;
    const gateW = Math.max(8, Math.round(p.optics.gateWidthMm * pxPerMm));
    const gateH = Math.max(8, Math.round(p.optics.gateHeightMm * pxPerMm));
    if (this.compositor.gateWidthPx !== gateW || this.compositor.gateHeightPx !== gateH) this.compositor.resizeGate(gateW, gateH);
    const result = this.compositor.expose(step.events, step.t, this.exposureLayout(d), this.frameSource(), d.strobe, p.optics, {
      gatePxPerMm: pxPerMm,
      gateMm: d.pathSpec.gateMm,
      referenceExposureS,
      retinaTauS: this.retinaTauS,
      flashPeriodS,
    });
    this.lastExposure = result;
    this.flashCount += result.flashes;
    // brillo de la escena: sube con cada destello y decae
    const dt = step.dt / Math.max(1e-6, p.ui.timeScale);
    this.flashIntensity = Math.min(1, this.flashIntensity * Math.exp(-dt / 0.06) + (result.flashes > 0 ? 0.9 : 0));
  }
}
