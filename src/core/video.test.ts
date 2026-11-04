import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../animation/evaluate';
import { aspectForFootprint, buildPath, designFestoon, gateOnStraight, pointAt } from '../mech/path';
import { assemblyProblems, buildAssembly } from '../mech/assembly';
import { DEFAULT_LAMINATE } from '../film/layout';
import { demoProject, deriveProject, parseProject } from './project';
import { festoonPasses, laminatedDemoProject, videoAnimation, videoProject, type VideoManifest } from './video';

const manifest: VideoManifest = {
  name: 'prueba',
  title: 'Prueba',
  sourceFps: 30,
  frames: 217,
  durationS: 217 / 30,
  widthPx: 360,
  heightPx: 640,
  sequence: { base: 'videos/prueba/f', count: 217, digits: 4, ext: '.jpg' },
  palette: [],
};

describe('video como animación', () => {
  it('217 cuadros en 10 s: 21,7 fps y cada cuadro aparece una sola vez, en orden', () => {
    const doc = videoAnimation(manifest, { seconds: 10, fit: 'contain' });
    expect(doc.fps).toBeCloseTo(21.7, 9);
    const n = Math.round(doc.fps * doc.duration);
    expect(n).toBe(217);
    const srcs = Array.from({ length: n }, (_, i) => {
      const img = evaluate(doc, (i * doc.duration) / n).nodes.find((x) => x.geometry.kind === 'image')!;
      return (img.geometry as { src: string }).src;
    });
    expect(new Set(srcs).size).toBe(217);
    expect(srcs[0]).toBe('videos/prueba/f0000.jpg');
    expect(srcs[216]).toBe('videos/prueba/f0216.jpg');
  });

  it('5 s a 24 fps: 120 fotogramas en orden, con pasos de 1 o 2 cuadros, y el loop cierra igual', () => {
    const doc = videoAnimation(manifest, { seconds: 5, fit: 'contain', fps: 24 });
    expect(doc.fps).toBe(24);
    const n = Math.round(doc.fps * doc.duration);
    expect(n).toBe(120);
    const idx = Array.from({ length: n }, (_, i) => {
      const img = evaluate(doc, (i * doc.duration) / n).nodes.find((x) => x.geometry.kind === 'image')!;
      return Number((img.geometry as { src: string }).src.match(/f(\d+)\.jpg$/)![1]);
    });
    expect(idx[0]).toBe(0);
    const steps = idx.map((k, i) => (i + 1 < n ? idx[i + 1] : idx[0] + 217) - k);
    expect(new Set(steps)).toEqual(new Set([1, 2]));
    expect(steps.reduce((a, b) => a + b, 0)).toBe(217);
  });

  it('un video vertical entra completo en el fotograma de 32 × 20 mm con bandas negras', () => {
    const doc = videoAnimation(manifest, { seconds: 10, fit: 'contain' });
    const it0 = doc.layers[0].items[0] as { w: number; h: number };
    expect(it0.h).toBe(300);
    expect(it0.w).toBeCloseTo(300 * (360 / 640), 9);
    expect(doc.background.transparent).toBe(false);
  });
});

describe('festón para películas largas', () => {
  const R = (9 * 36) / (2 * Math.PI);

  it('mide exactamente lo que pide la película y la ventana queda en un tramo recto', () => {
    for (const L of [7812, 8640, 4000]) {
      const f = designFestoon(L, R, festoonPasses(L), 90);
      const geo = buildPath({ rollers: f.rollers, rollerRadiusMm: R, driveRoller: 0, gateMm: f.gateMm, direction: 1, sides: f.sides });
      expect(geo.lengthMm).toBeCloseTo(L, 6);
      expect(gateOnStraight(geo, f.gateMm, 32).ok).toBe(true);
      // la ventana mira hacia +y (la lente) y el tramo frontal es el más adelantado
      const g = pointAt(geo, f.gateMm);
      expect(g.normal.y).toBeCloseTo(1, 9);
      expect(Math.max(...f.rollers.map((r) => r.y)) + R).toBeCloseTo(g.position.y, 6);
    }
  });

  it('cada rodillo del festón se abraza 180° y las esquinas 90°', () => {
    const f = designFestoon(7812, R, 4, 90);
    const geo = buildPath({ rollers: f.rollers, rollerRadiusMm: R, driveRoller: 0, gateMm: f.gateMm, direction: 1, sides: f.sides });
    const sweeps = geo.segments.filter((s) => s.kind === 'arc').map((s) => (s.kind === 'arc' ? Math.abs(s.sweep) : 0));
    expect(sweeps.filter((x) => Math.abs(x - Math.PI) < 1e-9).length).toBe(f.rollers.length - 2);
    expect(sweeps.filter((x) => Math.abs(x - Math.PI / 2) < 1e-9).length).toBe(2);
  });

  it('el proyecto del video en festón: 7,81 m en 4 pasadas, sin errores, sensor sin deriva, todo cabe en la mesa', () => {
    const p = videoProject(demoProject(), manifest, { seconds: 10, fit: 'contain', layout: 'festoon' });
    const d = deriveProject(p);
    expect(p.frames.transparent).toBe(false);
    expect(p.frames.backgroundColor).toBe('#000000');
    expect(d.layout.loopLengthMm).toBeCloseTo(217 * 36, 6);
    expect(d.path.lengthMm).toBeCloseTo(217 * 36, 6);
    expect(p.festoon?.passes).toBe(4);
    expect(d.pathSpec.rollers.length).toBe(11);
    expect(d.warnings.filter((w) => w.level === 'error')).toEqual([]);
    expect(d.clearance.ok).toBe(true);
    expect(d.sync.actual.flashHz).toBeCloseTo(21.7, 6);
    expect(d.sync.actual.blurMm).toBeLessThan(0.1);
    expect(d.sync.torque.ok).toBe(true);
    const a = buildAssembly(p, d);
    expect(assemblyProblems(a, d)).toEqual([]);
    expect(a.base.x1 - a.base.x0).toBeLessThan(1000);
    expect(a.base.z1 - a.base.z0).toBeLessThan(800);
    // pero 4 de los 11 rodillos tocan la cara de la tinta
    expect(d.faces).toEqual({ lampSide: 7, lensSide: 4, ink: 'lens', inkTouched: 4, covered: false });
    expect(d.warnings.some((w) => w.source === 'rodillos' && w.level === 'warning')).toBe(true);
  });

  it('el video importado existe y coincide con su manifiesto', () => {
    const file = 'public/videos/cried-out/manifest.json';
    if (!existsSync(file)) return; // los cuadros no se versionan: solo se comprueba donde se importó
    const m = JSON.parse(readFileSync(file, 'utf8')) as VideoManifest;
    expect(m.frames).toBe(217);
    expect(existsSync(`public/${m.sequence.base}0216.jpg`)).toBe(true);
  });
});

describe('una sola cara en los rodillos (ADR-0009)', () => {
  const R = (9 * 36) / (2 * Math.PI);

  it('la huella de los rodillos sale 4:3 y los loops cortos conservan el rectángulo compacto', () => {
    const aspect = aspectForFootprint(4320, R, 4 / 3);
    const b = (4320 - 2 * Math.PI * R) / 2 / (1 + aspect);
    expect((aspect * b + 2 * R + 4) / (b + 2 * R + 4)).toBeCloseTo(4 / 3, 9);
    // 864 mm (la demostración): el lado corto no baja de 10 mm de hueco, igual que antes
    const short = aspectForFootprint(864, R, 4 / 3);
    expect((864 - 2 * Math.PI * R) / 2 / (1 + short)).toBeCloseTo(2 * R + 10, 9);
  });

  it('5 s a 24 fps: 4,32 m en el rectángulo de 4 rodillos, que solo tocan la cara de la lámpara', () => {
    const p = videoProject(demoProject(), manifest, { seconds: 5, fit: 'contain', fps: 24 });
    const d = deriveProject(p);
    expect(p.pathLayout).toBe('rectangle');
    expect(p.print.emulsion).toBe('toward-lens');
    expect(d.frameCount).toBe(120);
    expect(d.layout.loopLengthMm).toBeCloseTo(120 * 36, 6);
    expect(d.path.lengthMm).toBeCloseTo(120 * 36, 6);
    expect(d.pathSpec.rollers.length).toBe(4);
    expect(d.faces).toEqual({ lampSide: 4, lensSide: 0, ink: 'lens', inkTouched: 0, covered: false });
    expect(d.bending).toBeNull();
    expect(d.warnings.filter((w) => w.level !== 'info')).toEqual([]);
    expect(d.clearance.ok).toBe(true);
    expect(p.transport.motorRpm).toBeCloseTo(160, 9);
    expect(d.sync.actual.flashHz).toBeCloseTo(24, 6);
    expect(d.sync.actual.blurMm).toBeLessThanOrEqual(0.1);
    expect(d.sync.torque.ok).toBe(true);
    const a = buildAssembly(p, d);
    expect(assemblyProblems(a, d)).toEqual([]);
    expect(a.base.x1 - a.base.x0).toBeLessThan(1300);
    expect(a.base.z1 - a.base.z0).toBeLessThan(1000);
  });

  it('con la tinta hacia la lámpara el rectángulo la rozaría: avisa', () => {
    const p = videoProject(demoProject(), manifest, { seconds: 5, fit: 'contain', fps: 24 });
    const d = deriveProject({ ...p, print: { ...p.print, emulsion: 'toward-lamp' } });
    expect(d.faces.inkTouched).toBe(4);
    expect(d.warnings.some((w) => w.source === 'rodillos')).toBe(true);
  });
});

describe('película laminada (ADR-0010)', () => {
  const laminated = () => videoProject(demoProject(), manifest, { seconds: 5, fit: 'contain', fps: 24, laminate: DEFAULT_LAMINATE });

  it('5 s a 24 fps laminada: festón de 7 rodillos en una base de unos 54 × 68 cm, sin avisos', () => {
    const p = laminated();
    const d = deriveProject(p);
    expect(p.pathLayout).toBe('festoon');
    expect(p.festoon?.passes).toBe(2);
    expect(d.path.lengthMm).toBeCloseTo(120 * 36, 6);
    expect(d.pathSpec.rollers.length).toBe(7);
    // 2 rodillos tocan la cara de la tinta, pero sobre la cubierta: solo una nota
    expect(d.faces).toEqual({ lampSide: 5, lensSide: 2, ink: 'lens', inkTouched: 2, covered: true });
    expect(d.warnings.filter((w) => w.level !== 'info')).toEqual([]);
    expect(d.warnings.some((w) => w.source === 'rodillos' && /cubierta/.test(w.message))).toBe(true);
    expect(d.clearance.ok).toBe(true);
    expect(p.transport.motorRpm).toBeCloseTo(160, 9);
    expect(d.sync.actual.blurMm).toBeLessThanOrEqual(0.1);
    expect(d.sync.torque.ok).toBe(true);
    const a = buildAssembly(p, d);
    expect(assemblyProblems(a, d)).toEqual([]);
    expect(a.base.x1 - a.base.x0).toBeLessThan(560);
    expect(a.base.z1 - a.base.z0).toBeLessThan(700);
  });

  it('0,22 mm abraza los rodillos; 2 × calibre 15 es demasiado rígida y una sola capa delgada avisa', () => {
    const p = laminated();
    const ok = deriveProject(p).bending!;
    expect(ok.thicknessMm).toBeCloseTo(0.217, 9);
    expect(ok.stiffnessRatio).toBeLessThan(0.03);
    expect(ok.strainPct).toBeLessThan(0.25);
    const stiff = deriveProject({ ...p, film: { ...p.film, laminate: { baseMm: 0.381, coverMm: 0.381 } } });
    expect(stiff.bending!.stiffnessRatio).toBeGreaterThan(0.8);
    expect(stiff.warnings.some((w) => w.source === 'película' && w.level === 'warning')).toBe(true);
    const thin = deriveProject({ ...p, film: { ...p.film, laminate: { baseMm: 0.075, coverMm: 0.05 } } });
    expect(thin.warnings.some((w) => w.source === 'película' && w.level === 'info' && /delgada/.test(w.message))).toBe(true);
  });

  it('?demo=laminada: la pelota 5 veces da la misma máquina que el video, sin el video', () => {
    const p = laminatedDemoProject();
    const d = deriveProject(p);
    const v = deriveProject(laminated());
    expect(d.frameCount).toBe(24);
    expect(d.layout.frames.length).toBe(120);
    expect(d.path.lengthMm).toBeCloseTo(v.path.lengthMm, 6);
    expect(d.pathSpec.rollers).toEqual(v.pathSpec.rollers);
    expect(d.pathSpec.sides).toEqual(v.pathSpec.sides);
    expect(d.faces).toEqual(v.faces);
    expect(d.bending).toEqual(v.bending);
    expect(d.warnings.filter((w) => w.level !== 'info')).toEqual([]);
    expect(d.coherence.ok).toBe(true);
    expect(p.transport.motorRpm).toBeCloseTo(160, 9);
    expect(p.transport.tensionN).toBe(2);
    expect(d.sync.actual.blurMm).toBeLessThanOrEqual(0.1);
    expect(assemblyProblems(buildAssembly(p, d), d)).toEqual([]);
    expect(() => parseProject(JSON.parse(JSON.stringify(p)))).not.toThrow();
  });

  it('el proyecto laminado se guarda y se vuelve a leer; la sencilla sigue en el rectángulo', () => {
    const p = laminated();
    expect(parseProject(JSON.parse(JSON.stringify(p))).film.laminate).toEqual(DEFAULT_LAMINATE);
    const single = videoProject(p, manifest, { seconds: 5, fit: 'contain', fps: 24 });
    expect(single.film.laminate).toBeUndefined();
    expect(single.pathLayout).toBe('rectangle');
  });
});
