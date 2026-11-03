// Corredor de la simulación: avanza el motor temporal con la velocidad real de la cinta, dispara el estroboscopio
// y acumula la exposición en el compositor. Es único para toda la aplicación: al cambiar de sección la película
// sigue en la misma posición y la pantalla conserva su imagen.
import { phiForSlotAtGate } from '../film/layout';
import type { CanvasLike } from '../frames/generator';
import { filmSpeed, gateState, type GateState } from '../mech/transport';
import type { TimeStep } from '../mech/timing';
import { ProjectionCompositor, type ExposureResult, type FrameImageSource } from '../optics/exposure';
import { flashDuration, flashFrequency } from '../mech/strobe';
import type { AppContext } from './context';

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

  /** coloca el fotograma 0 en la ventana y limpia la pantalla */
  reset(): void {
    const d = this.ctx.derived();
    this.ctx.engine.reset();
    this.ctx.engine.loopLengthMm = d.layout.loopLengthMm;
    this.ctx.engine.phiMm = phiForSlotAtGate(d.layout, d.pathSpec.gateMm, 0);
    this.compositor.clear();
    this.flashCount = 0;
    this.lastExposure = null;
    this.initialized = true;
  }

  gate(): GateState | null {
    const d = this.ctx.derived();
    const p = this.ctx.project;
    return gateState(d.layout, d.pathSpec.gateMm, this.ctx.engine.phiMm, filmSpeed(p.transport, d.pathSpec.rollerRadiusMm));
  }

  /** un paso de reloj real (s) */
  tick(dtRealS: number): void {
    const p = this.ctx.project;
    const d = this.ctx.derived();
    if (!this.initialized) this.reset();
    this.ctx.engine.loopLengthMm = d.layout.loopLengthMm;
    this.ctx.engine.timeScale = p.ui.timeScale;
    if (!p.ui.playing) {
      this.flashIntensity *= Math.exp(-dtRealS / 0.08);
      return;
    }
    const speed = filmSpeed(p.transport, d.pathSpec.rollerRadiusMm);
    const sensor = { positionsMm: d.layout.frames.map((f) => d.pathSpec.gateMm + f.centerMm), loopMm: d.layout.loopLengthMm };
    const step = this.ctx.engine.advance(dtRealS, speed, d.strobe, sensor);
    this.lastStep = step;
    const frames = this.ctx.frames();
    const pxPerMm = frames.widthPx / frames.widthMm;
    const gateW = Math.max(8, Math.round(p.optics.gateWidthMm * pxPerMm));
    const gateH = Math.max(8, Math.round(p.optics.gateHeightMm * pxPerMm));
    if (this.compositor.gateWidthPx !== gateW || this.compositor.gateHeightPx !== gateH) this.compositor.resizeGate(gateW, gateH);
    const ref = Math.max(50e-6, flashDuration(d.strobe) || 300e-6);
    const f = d.sync.actual.flashHz || flashFrequency(d.strobe);
    const result = this.compositor.expose(step.events, step.t, d.layout, this.frameSource(), d.strobe, p.optics, {
      gatePxPerMm: pxPerMm,
      gateMm: d.pathSpec.gateMm,
      referenceExposureS: ref,
      retinaTauS: this.retinaTauS,
      flashPeriodS: f > 0 ? 1 / f : undefined,
    });
    this.lastExposure = result;
    this.flashCount += result.flashes;
    // brillo de la escena: sube con cada destello y decae
    this.flashIntensity = Math.min(1, this.flashIntensity * Math.exp(-dtRealS / 0.06) + (result.flashes > 0 ? 0.9 : 0));
  }
}
