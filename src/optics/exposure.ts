// Modelo de exposición: la imagen proyectada no es el archivo de animación, es lo que la ventana deja pasar mientras
// la película se mueve y el estroboscopio destella. Para cada destello se integra la tira en movimiento (K
// submuestras a lo largo de la duración del destello), se enmascara con la ventana, se atraviesa el medio
// (transmitancia), se pasa por la lente (aumento, inversión, desenfoque) y se acumula en la "retina" (persistencia).
import type { CanvasLike, CanvasFactory } from '../frames/generator';
import type { Ctx2D } from '../animation/render2d';
import type { FilmLayout } from '../film/layout';
import type { ExposureEvent } from '../mech/timing';
import { flashProfile, type StrobeSpec } from '../mech/strobe';
import { opticsReport, type OpticsSpec } from './projector';

export interface FrameImageSource {
  /** canvas del fotograma `frameIndex` (ideal o ya con el medio aplicado) */
  get(frameIndex: number): CanvasLike | null;
}

export interface ExposureOptions {
  /** píxeles por mm de película en el lienzo de la ventana */
  gatePxPerMm: number;
  /** posición de la ventana a lo largo del recorrido (mm) */
  gateMm: number;
  /** nivel de exposición de referencia: destello de esta duración (s) a intensidad 1 → brillo pleno */
  referenceExposureS: number;
  /** persistencia retiniana: constante de tiempo (s) del decaimiento entre destellos */
  retinaTauS: number;
  /** desenfoque adicional en px de pantalla (por el medio o la lente), además del óptico */
  extraBlurPx?: number;
  /**
   * periodo nominal entre destellos (s): con persistencia, el peso de cada destello se escala por (1 − e^(−T/τ)) para
   * que el brillo en régimen permanente sea 1 (la retina integra destellos sucesivos sin saturar la imagen)
   */
  flashPeriodS?: number;
}

export interface ExposureResult {
  /** destellos integrados en este paso */
  flashes: number;
  /** fotogramas vistos (índices) en este paso */
  frames: number[];
  /** desplazamiento máximo de la película durante un destello (mm) */
  maxBlurMm: number;
  /** ¿algún destello cayó con el fotograma descentrado más de un 10 % del paso? */
  misregistered: boolean;
  /** intensidad relativa acumulada del paso (suma de pesos de destellos) */
  energy: number;
}

/**
 * Compositor de proyección. Mantiene tres lienzos: la ventana (lo que pasa la máscara, en px de película), la
 * exposición del paso actual y la pantalla con persistencia. `screen` es la salida.
 */
export class ProjectionCompositor {
  readonly gate: CanvasLike;
  readonly exposure: CanvasLike;
  readonly screen: CanvasLike;
  private gateCtx: Ctx2D;
  private exposureCtx: Ctx2D;
  private screenCtx: Ctx2D;
  private lastT = 0;

  constructor(
    private readonly canvases: CanvasFactory,
    public gateWidthPx: number,
    public gateHeightPx: number,
    public screenWidthPx: number,
    public screenHeightPx: number,
  ) {
    this.gate = canvases.create(gateWidthPx, gateHeightPx);
    this.exposure = canvases.create(screenWidthPx, screenHeightPx);
    this.screen = canvases.create(screenWidthPx, screenHeightPx);
    this.gateCtx = this.gate.getContext('2d')!;
    this.exposureCtx = this.exposure.getContext('2d')!;
    this.screenCtx = this.screen.getContext('2d')!;
    this.clear();
  }

  clear(): void {
    this.screenCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.screenCtx.globalCompositeOperation = 'source-over';
    this.screenCtx.fillStyle = '#000';
    this.screenCtx.fillRect(0, 0, this.screenWidthPx, this.screenHeightPx);
  }

  resizeGate(w: number, h: number): void {
    this.gate.width = Math.max(1, w);
    this.gate.height = Math.max(1, h);
    this.gateWidthPx = this.gate.width;
    this.gateHeightPx = this.gate.height;
    this.gateCtx = this.gate.getContext('2d')!;
  }

  /**
   * Pinta en `gate` lo que ve la ventana para una posición de cinta φ: los fotogramas cuyo rectángulo solapa la
   * ventana, desplazados exactamente. La ventana mide gateWidthMm (a lo largo del avance, horizontal) ×
   * gateHeightMm (cruzando la tira, vertical) centrada en gateMm. Vista desde la lente, la banda de canto corre de
   * derecha a izquierda: un fotograma que aún no ha llegado (σ mayor que la del centro) se dibuja a la derecha.
   */
  renderGate(layout: FilmLayout, frames: FrameImageSource, phiMm: number, gateMm: number, gateWidthMm: number, _gateHeightMm: number, pxPerMm: number): number[] {
    const ctx = this.gateCtx;
    const W = this.gateWidthPx;
    const H = this.gateHeightPx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    // sin película: la ventana deja pasar la luz (blanco) — la base transparente se modela en el medio
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    const L = layout.loopLengthMm;
    if (!layout.frames.length || L <= 0) return [];
    // coordenada de tira en el centro de la ventana: σ = φ − s_gate
    const sigmaCenter = (((phiMm - gateMm) % L) + L) % L;
    const seen: number[] = [];
    const half = gateWidthMm / 2;
    for (const pf of layout.frames) {
      // distancia (mm) del centro del fotograma al centro de la ventana, en el eje de avance, módulo L
      let d = pf.centerMm - sigmaCenter;
      d -= Math.round(d / L) * L;
      if (Math.abs(d) > half + pf.alongMm / 2) continue;
      const img = frames.get(pf.frameIndex);
      seen.push(pf.frameIndex);
      const xCenter = W / 2 + d * pxPerMm;
      const yCenter = H / 2 + (pf.xMm + pf.acrossMm / 2 - layout.spec.stripWidthMm / 2) * pxPerMm;
      const w = pf.alongMm * pxPerMm;
      const h = pf.acrossMm * pxPerMm;
      if (img) ctx.drawImage(img as unknown as CanvasImageSource, xCenter - w / 2, yCenter - h / 2, w, h);
      else {
        ctx.fillStyle = '#888';
        ctx.fillRect(xCenter - w / 2, yCenter - h / 2, w, h);
      }
    }
    return seen;
  }

  /**
   * Integra los eventos de exposición de un paso y actualiza la pantalla. `t` es el tiempo de simulación al final
   * del paso (para la persistencia).
   */
  expose(events: ExposureEvent[], t: number, layout: FilmLayout, frames: FrameImageSource, strobe: StrobeSpec, optics: OpticsSpec, options: ExposureOptions): ExposureResult {
    const dt = Math.max(0, t - this.lastT);
    this.lastT = t;
    // 1. decaimiento retiniano de lo que ya había
    const decay = options.retinaTauS > 0 ? Math.exp(-dt / options.retinaTauS) : 0;
    const sctx = this.screenCtx;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalCompositeOperation = 'source-over';
    sctx.globalAlpha = 1;
    if (decay < 0.999) {
      sctx.fillStyle = `rgba(0,0,0,${(1 - decay).toFixed(4)})`;
      sctx.fillRect(0, 0, this.screenWidthPx, this.screenHeightPx);
    }
    if (!events.length) return { flashes: 0, frames: [], maxBlurMm: 0, misregistered: false, energy: 0 };

    const rep = opticsReport(optics);
    const ectx = this.exposureCtx;
    const seenAll = new Set<number>();
    let maxBlur = 0;
    let misreg = false;
    let energy = 0;
    for (const ev of events) {
      const flash = ev.flash;
      const dur = flash.duration;
      const blurMm = Math.abs(ev.speedMmS) * dur;
      maxBlur = Math.max(maxBlur, blurMm);
      // submuestras: una por cada ~0,35 px de desplazamiento en el lienzo de la ventana, entre 1 y 24
      const K = Math.max(1, Math.min(24, Math.ceil((blurMm * options.gatePxPerMm) / 0.35)));
      // peso del destello: intensidad × duración relativa a la exposición de referencia, normalizado para que la
      // suma geométrica de destellos con persistencia tienda a 1
      const steady = options.retinaTauS > 0 && options.flashPeriodS ? 1 - Math.exp(-options.flashPeriodS / options.retinaTauS) : 1;
      const weight = Math.min(1.5, (dur / Math.max(1e-9, options.referenceExposureS)) * flash.peak) * steady;
      energy += weight;
      ectx.setTransform(1, 0, 0, 1, 0, 0);
      ectx.globalCompositeOperation = 'source-over';
      ectx.globalAlpha = 1;
      ectx.fillStyle = '#000';
      ectx.fillRect(0, 0, this.screenWidthPx, this.screenHeightPx);
      ectx.globalCompositeOperation = 'lighter';
      let profileSum = 0;
      const profiles: number[] = [];
      for (let k = 0; k < K; k++) {
        const u = (k + 0.5) / K;
        const p = flashProfile(flash, strobe, u);
        profiles.push(p);
        profileSum += p;
      }
      for (let k = 0; k < K; k++) {
        const u = (k + 0.5) / K;
        const phi = ev.phiMm + ev.speedMmS * dur * u;
        const seen = this.renderGate(layout, frames, phi, options.gateMm, optics.gateWidthMm, optics.gateHeightMm, options.gatePxPerMm);
        for (const s of seen) seenAll.add(s);
        if (k === Math.floor(K / 2)) {
          // ¿fotograma centrado en el instante medio del destello?
          const L = layout.loopLengthMm;
          const sigma = (((phi - options.gateMm) % L) + L) % L;
          let best = Infinity;
          for (const pf of layout.frames) {
            let d = pf.centerMm - sigma;
            d -= Math.round(d / L) * L;
            if (Math.abs(d) < Math.abs(best)) best = d;
          }
          if (Math.abs(best) > layout.spec.pitchMm * 0.1) misreg = true;
        }
        const alpha = profileSum > 0 ? (profiles[k] / profileSum) * weight : weight / K;
        this.projectGate(ectx, rep.magnification, optics, alpha);
      }
      // desenfoque óptico (+ extra) sobre la exposición de este destello
      const blurScreenMm = rep.blurCircleMm;
      const blurPx = (blurScreenMm / Math.max(1e-6, rep.imageWidthMm)) * this.screenWidthPx * 0.5 + (options.extraBlurPx ?? 0);
      // 2. suma a la pantalla
      sctx.globalCompositeOperation = 'lighter';
      const f = (sctx as CanvasRenderingContext2D).filter;
      if (blurPx > 0.4 && f !== undefined) (sctx as CanvasRenderingContext2D).filter = `blur(${blurPx.toFixed(2)}px)`;
      sctx.drawImage(this.exposure as unknown as CanvasImageSource, 0, 0);
      if (f !== undefined) (sctx as CanvasRenderingContext2D).filter = 'none';
      sctx.globalCompositeOperation = 'source-over';
    }
    return { flashes: events.length, frames: [...seenAll], maxBlurMm: maxBlur, misregistered: misreg, energy };
  }

  /** proyecta el lienzo de la ventana en la exposición: la lente invierte (180°); el espejo refleja en x */
  private projectGate(ectx: Ctx2D, _magnification: number, optics: OpticsSpec, alpha: number): void {
    const W = this.screenWidthPx;
    const H = this.screenHeightPx;
    ectx.save();
    ectx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ectx.translate(W / 2, H / 2);
    // la lente invierte la imagen; si la película se montó invertida para compensarlo, la imagen sale derecha
    if (!optics.filmMountedInverted) ectx.rotate(Math.PI);
    if (optics.mirror) ectx.scale(-1, 1);
    // la banda corre de canto con la imagen derecha: el lienzo de la ventana ya tiene la orientación de la pantalla
    const scale = Math.min(W / this.gateWidthPx, H / this.gateHeightPx);
    ectx.scale(scale, scale);
    ectx.drawImage(this.gate as unknown as CanvasImageSource, -this.gateWidthPx / 2, -this.gateHeightPx / 2);
    ectx.restore();
  }
}
