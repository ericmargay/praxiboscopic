import { describe, expect, it } from 'vitest';
import { buildFilmLayout, defaultFilmSpec, phiForSlotAtGate } from '../film/layout';
import { FrameGenerator } from '../frames/generator';
import { defaultFrameGenSettings } from '../frames/settings';
import { buildFromGenerator } from '../animation/procedural';
import { defaultLedStrobe } from '../mech/strobe';
import { imageDataOf, nodeCanvases } from '../test/nodeCanvas';
import { calibrationDoc } from './calibration';
import { ProjectionCompositor } from './exposure';
import { applyMedium, mediumById, mediumReport } from './medium';
import { brightnessReport, defaultOpticsSpec, focusFor, opticsReport } from './projector';

describe('óptica', () => {
  it('lente delgada: focal 50 mm a 1800 mm enfoca con la película a 51,43 mm y aumenta ×35', () => {
    const o = defaultOpticsSpec({ focalMm: 50, throwMm: 1800 });
    const f = focusFor(o);
    expect(f).toBeCloseTo(1 / (1 / 50 - 1 / 1800), 6);
    const rep = opticsReport({ ...o, filmToLensMm: f });
    expect(rep.magnification).toBeCloseTo(1800 / f, 6);
    expect(rep.imageWidthMm).toBeCloseTo(32 * (1800 / f), 3);
    expect(rep.blurCircleMm).toBeLessThan(1e-6);
    const off = opticsReport({ ...o, filmToLensMm: f + 1 });
    expect(off.blurCircleMm).toBeGreaterThan(5);
    expect(off.warnings.some((w) => w.includes('Desenfoque'))).toBe(true);
  });

  it('el brillo baja con la transmitancia y sube con la ganancia', () => {
    const o = defaultOpticsSpec();
    const a = brightnessReport(o, 500, 0.8, 5600);
    const b = brightnessReport(o, 500, 0.4, 5600);
    expect(a.imageNits).toBeGreaterThan(b.imageNits);
    expect(brightnessReport({ ...o, screenGain: 2 }, 500, 0.8, 5600).imageNits).toBeCloseTo(a.imageNits * 2, 6);
    expect(a.lightColor[0]).toBeGreaterThan(0);
  });
});

describe('medio transmisivo', () => {
  it('una película impresa no alcanza el negro ideal y la de laboratorio sí se acerca', () => {
    const ink = mediumReport(mediumById('inkjet-transparency'));
    const lab = mediumReport(mediumById('photo-lab-film'));
    expect(ink.minTransmittance).toBeGreaterThan(0.01);
    expect(lab.minTransmittance).toBeLessThan(0.001);
    expect(lab.contrastRatio).toBeGreaterThan(ink.contrastRatio * 10);
  });

  it('applyMedium: transparente → base limpia; negro → Dmax; aplica velo y desenfoque', () => {
    const w = 16;
    const h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const x = i % w;
      const black = x >= 8;
      data[i * 4] = black ? 0 : 255;
      data[i * 4 + 1] = black ? 0 : 255;
      data[i * 4 + 2] = black ? 0 : 255;
      data[i * 4 + 3] = x < 4 ? 0 : 255; // primeros 4 px transparentes (sin tinta)
    }
    const m = mediumById('inkjet-transparency');
    applyMedium(data, w, h, m, { pxPerMm: 1 }); // 1 px/mm: sin desenfoque apreciable
    const clear = data[0];
    const white = data[5 * 4];
    const black = data[12 * 4];
    expect(clear).toBeGreaterThan(230);
    expect(Math.abs(clear - white)).toBeLessThan(3);
    expect(black).toBeGreaterThan(20); // no es negro puro: Dmax limitado + velo
    expect(black).toBeLessThan(120);
    const ideal = new Uint8ClampedArray(data.length);
    ideal.set(data);
    const d2 = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) d2.set([i % w >= 8 ? 0 : 255, i % w >= 8 ? 0 : 255, i % w >= 8 ? 0 : 255, 255], i * 4);
    applyMedium(d2, w, h, mediumById('ideal'), { pxPerMm: 1 });
    expect(d2[12 * 4]).toBe(0);
  });

  it('las cartas de calibración se generan como documentos válidos', () => {
    const doc = calibrationDoc('all', { width: 480, height: 300, widthMm: 32 });
    expect(doc.layers[0].items.length).toBeGreaterThan(20);
    const gen = new FrameGenerator(nodeCanvases, { getImage: () => null });
    const set = gen.generate(doc, defaultFrameGenSettings({ widthPx: 96, heightPx: 60, supersample: 1 }));
    expect(set.count).toBe(1);
  });
});

describe('compositor de proyección', () => {
  it('con el fotograma centrado la proyección es nítida; con desfase la imagen sale desplazada/mezclada', () => {
    const doc = buildFromGenerator({ id: 'ball', params: { frames: 24, fps: 24, shadow: false, ground: false } });
    const gen = new FrameGenerator(nodeCanvases, { getImage: () => null });
    const set = gen.generate(doc, defaultFrameGenSettings({ widthPx: 64, heightPx: 40, supersample: 1, transparent: false, backgroundColor: '#000000' }));
    const layout = buildFilmLayout({ frameCount: 24, alongMm: 32, acrossMm: 20 }, defaultFilmSpec({ pitchMm: 36 }));
    const frames = { get: (i: number) => set.frames[i]?.canvas ?? null };
    const strobe = defaultLedStrobe({ frequencyHz: 24, pulseUs: 300 });
    const optics = defaultOpticsSpec();
    optics.filmToLensMm = focusFor(optics);
    const make = () => new ProjectionCompositor(nodeCanvases, 64, 40, 64, 40);
    const gateMm = 100;
    const opts = { gatePxPerMm: 2, gateMm, referenceExposureS: 300e-6, retinaTauS: 0 };
    const phi0 = phiForSlotAtGate(layout, gateMm, 0);
    const centered = make();
    const flash = { t: 0, duration: 300e-6, peak: 1, profile: 'rect' as const, lumens: 1, kelvin: 5600, n: 0 };
    const r1 = centered.expose([{ flash, phiMm: phi0, speedMmS: 0 }], 0.001, layout, frames, strobe, optics, opts);
    expect(r1.flashes).toBe(1);
    expect(r1.frames).toEqual([0]);
    expect(r1.misregistered).toBe(false);
    const a = imageDataOf(centered.screen);
    // el fotograma 0 (pelota en el suelo) tiene píxeles rojos en la parte baja
    let red = 0;
    for (let i = 0; i < a.data.length; i += 4) if (a.data[i] > 120 && a.data[i + 1] < 90) red++;
    expect(red).toBeGreaterThan(10);

    const offset = make();
    const r2 = offset.expose([{ flash, phiMm: phi0 + 18, speedMmS: 0 }], 0.001, layout, frames, strobe, optics, opts);
    expect(r2.misregistered).toBe(true);
    expect(r2.frames.length).toBe(2); // dos fotogramas a medias en la ventana

    // destello largo con la película en movimiento → desenfoque horizontal: la mancha roja se ensancha en columnas
    const moving = make();
    const long = { ...flash, duration: 0.01 };
    const r3 = moving.expose([{ flash: long, phiMm: phi0, speedMmS: 864 }], 0.02, layout, frames, strobe, optics, { ...opts, referenceExposureS: 0.01 });
    expect(r3.maxBlurMm).toBeCloseTo(8.64, 6);
    const b = imageDataOf(moving.screen);
    const redCols = new Set<number>();
    const redColsA = new Set<number>();
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 64; x++) {
        const i = (y * 64 + x) * 4;
        if (b.data[i] > 40 && b.data[i + 1] < 60) redCols.add(x);
        if (a.data[i] > 40 && a.data[i + 1] < 60) redColsA.add(x);
      }
    expect(redCols.size).toBeGreaterThan(redColsA.size);
  });

  it('sin destellos la pantalla decae (persistencia) y no muestra nada nuevo', () => {
    const c = new ProjectionCompositor(nodeCanvases, 8, 8, 8, 8);
    const layout = buildFilmLayout({ frameCount: 1, alongMm: 32, acrossMm: 20 }, defaultFilmSpec({ pitchMm: 36 }));
    const r = c.expose([], 1, layout, { get: () => null }, defaultLedStrobe(), defaultOpticsSpec(), { gatePxPerMm: 1, gateMm: 0, referenceExposureS: 1e-3, retinaTauS: 0.05 });
    expect(r.flashes).toBe(0);
    expect(imageDataOf(c.screen).data[0]).toBe(0);
  });
});
