import { describe, expect, it } from 'vitest';
import { buildFilmLayout, checkCoherence, cyclesThatFit, defaultFilmSpec, loopLength, phiForSlotAtGate, sigmaAtGate, slotAt, stripLength } from './layout';
import { compatibility, defaultPrintSpec, tilePlan } from './print';
import { stripToSvg } from './strip2d';

describe('película física', () => {
  it('48 fotogramas de 40 mm de paso → 1920 mm de imágenes, más cabecera y cola', () => {
    const spec = defaultFilmSpec({ pitchMm: 40, leaderMm: 30, trailerMm: 30 });
    expect(stripLength(48, spec)).toBe(48 * 40 + 60);
    expect(loopLength(48, { ...spec, spliceOverlapMm: 10 })).toBe(48 * 40 + 50);
    expect(cyclesThatFit(2 * 1920 + 60, 48, spec)).toBe(2);
    expect(cyclesThatFit(2 * 1920 + 59, 48, spec)).toBe(1);
  });

  it('coloca cada fotograma centrado en su paso, con perforaciones y marcas', () => {
    const spec = defaultFilmSpec({ pitchMm: 36, stripWidthMm: 40 });
    const layout = buildFilmLayout({ frameCount: 24, alongMm: 32, acrossMm: 20 }, spec);
    expect(layout.frames.length).toBe(24);
    expect(layout.totalLengthMm).toBe(864);
    expect(layout.gapMm).toBe(4);
    for (let i = 0; i < 24; i++) {
      const f = layout.frames[i];
      expect(f.frameIndex).toBe(i);
      expect(f.centerMm).toBeCloseTo(i * 36 + 18, 9);
      expect(f.sMm).toBeCloseTo(i * 36 + 2, 9);
      expect(f.xMm).toBeCloseTo(10, 9);
      expect(f.alongMm).toBe(32);
      expect(f.acrossMm).toBe(20);
    }
    expect(layout.marks.filter((m) => m.kind === 'perforation').length).toBe(24 * 2 * 2);
    expect(layout.marks.filter((m) => m.kind === 'sync').length).toBe(24);
    expect(layout.clearFraction).toBeGreaterThan(0.2);
    expect(layout.warnings.filter((w) => w.level === 'error').length).toBe(0);
  });

  it('repite ciclos y avisa de incoherencias', () => {
    const spec = defaultFilmSpec({ pitchMm: 36, repeats: 2 });
    const layout = buildFilmLayout({ frameCount: 24, alongMm: 32, acrossMm: 20 }, spec);
    expect(layout.frames.length).toBe(48);
    expect(layout.frames[30].frameIndex).toBe(6);
    expect(layout.frames[30].cycle).toBe(1);
    const bad = buildFilmLayout({ frameCount: 24, alongMm: 45, acrossMm: 50 }, spec);
    expect(bad.warnings.some((w) => w.code === 'pitch<frame')).toBe(true);
    expect(bad.warnings.some((w) => w.code === 'frame>strip')).toBe(true);
  });

  it('la coherencia película ↔ recorrido informa del error y propone soluciones', () => {
    const layout = buildFilmLayout({ frameCount: 24, alongMm: 32, acrossMm: 20 }, defaultFilmSpec({ pitchMm: 36 }));
    const ok = checkCoherence(layout, 864);
    expect(ok.ok).toBe(true);
    const bad = checkCoherence(layout, 1728);
    expect(bad.ok).toBe(false);
    expect(bad.framesOff).toBeCloseTo(-24, 9);
    expect(bad.suggestions.some((s) => s.includes('Repetir 2 ciclo'))).toBe(true);
    const slight = checkCoherence(layout, 867);
    expect(slight.level).toBe('warning');
  });

  it('slotAt encuentra el fotograma más cercano, módulo loop; sigmaAtGate y phiForSlotAtGate son inversas', () => {
    const layout = buildFilmLayout({ frameCount: 24, alongMm: 32, acrossMm: 20 }, defaultFilmSpec({ pitchMm: 36 }));
    expect(slotAt(layout, 18)!.slot).toBe(0);
    expect(slotAt(layout, 19)!.offsetMm).toBeCloseTo(1, 9);
    expect(slotAt(layout, 863)!.slot).toBe(23);
    expect(slotAt(layout, 865)!.slot).toBe(0);
    const phi = phiForSlotAtGate(layout, 100, 5);
    expect(sigmaAtGate(layout, 100, phi)).toBeCloseTo(layout.frames[5].centerMm, 9);
    // al avanzar φ un paso, la ventana ve el fotograma siguiente
    expect(slotAt(layout, sigmaAtGate(layout, 100, phi + 36))!.slot).toBe(6);
  });
});

describe('impresión', () => {
  const layout = buildFilmLayout({ frameCount: 24, alongMm: 32, acrossMm: 20 }, defaultFilmSpec({ pitchMm: 36 }));

  it('divide la tira en segmentos que caben en la página y cortan entre fotogramas', () => {
    const plan = tilePlan(layout, defaultPrintSpec({ pageId: 'a4', landscape: true, marginMm: 10, overlapMm: 5 }));
    expect(plan.segments.length).toBeGreaterThan(1);
    const sum = plan.segments.reduce((a, s) => a + (s.toMm - s.fromMm), 0);
    expect(sum).toBeCloseTo(layout.totalLengthMm, 6);
    for (const s of plan.segments) {
      expect(s.toMm - s.fromMm + (s.cutAtMm !== null ? 5 : 0)).toBeLessThanOrEqual(297 - 20 + 1e-6);
      if (s.cutAtMm !== null) {
        // el corte cae en un hueco entre fotogramas
        const cut = s.fromMm + s.cutAtMm;
        const inside = layout.frames.some((f) => cut > f.sMm + 1e-6 && cut < f.sMm + f.alongMm - 1e-6);
        expect(inside).toBe(false);
      }
    }
    expect(plan.pxPerMm).toBeCloseTo(600 / 25.4, 6);
    expect(plan.stripPx.width).toBe(Math.ceil(864 * (600 / 25.4)));
  });

  it('avisa de combinaciones incompatibles de medio y ruta', () => {
    const lab = compatibility(defaultPrintSpec({ route: 'lab', mediumId: 'inkjet-transparency' }), layout);
    expect(lab.level).toBe('warning');
    const okLab = compatibility(defaultPrintSpec({ route: 'lab', mediumId: 'photo-lab-film' }), layout);
    expect(okLab.quality).toBe('optical');
    const direct = compatibility(defaultPrintSpec({ route: 'direct-film', mediumId: 'inkjet-transparency' }), layout);
    expect(direct.messages.some((m) => m.includes('alimentador'))).toBe(true);
  });

  it('el SVG de la tira declara el tamaño físico real en mm', () => {
    const svg = stripToSvg(layout);
    expect(svg).toContain('width="864mm"');
    expect(svg).toContain('height="40mm"');
    expect(svg.match(/<rect class="corte"/g)!.length).toBe(24 * 4 + 1); // perforaciones + contorno
  });
});
