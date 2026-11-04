import { describe, expect, it } from 'vitest';
import { FrameGenerator } from '../frames/generator';
import { nodeCanvases } from '../test/nodeCanvas';
import { createStore } from './store';
import { adoptPrototypeDesign, demoProject, deriveProject, followFrameSize, parseProject } from './project';
import { hashValue } from './hash';

describe('proyecto de demostración', () => {
  it('prototipo: 864 mm sin perforar, Ø103,1 mm a 160 rpm, rodillos juntos, motriz tras la ventana, tensor y LED con sitio', () => {
    const p = demoProject();
    const d = deriveProject(p);
    expect(d.frameCount).toBe(24);
    expect(d.layout.frames.length).toBe(24);
    expect(d.layout.totalLengthMm).toBe(864);
    expect(d.layout.marks.filter((m) => m.kind === 'perforation').length).toBe(0);
    expect(d.layout.marks.filter((m) => m.kind === 'sync').length).toBe(24);
    expect(d.pathSpec.rollers.length).toBe(4);
    expect(d.path.lengthMm).toBeCloseTo(864, 6);
    expect(2 * d.pathSpec.rollerRadiusMm).toBeCloseTo(103.13, 2);
    expect(p.transport.motorRpm).toBeCloseTo(160, 6);
    // huecos entre superficies: 10 mm en el lado corto y ~54 mm en el lado de la ventana
    const xs = d.pathSpec.rollers.map((r) => r.x);
    const ysr = d.pathSpec.rollers.map((r) => r.y);
    const R2 = 2 * d.pathSpec.rollerRadiusMm;
    expect(Math.max(...ysr) - Math.min(...ysr) - R2).toBeCloseTo(10, 6);
    expect(Math.max(...xs) - Math.min(...xs) - R2).toBeCloseTo(53.74, 1);
    expect(d.clearance.widthMm).toBeGreaterThanOrEqual(46);
    expect(p.path.tensionerRoller).toBe(0);
    expect(d.sync.torque.ok).toBe(true);
    expect(d.sync.torque.motorTorqueNcm).toBeLessThan(4);
    expect(d.coherence.ok).toBe(true);
    expect(d.sync.actual.transportFps).toBeCloseTo(24, 6);
    expect(d.sync.actual.flashHz).toBeCloseTo(24, 6);
    expect(d.clearance.ok).toBe(true);
    expect(d.warnings.filter((w) => w.level === 'error').length).toBe(0);
    // ni avisos: el destello de 115 µs deja el desenfoque en 0,1 mm
    expect(d.warnings.filter((w) => w.level !== 'info')).toEqual([]);
    expect(d.sync.actual.blurMm).toBeLessThanOrEqual(0.1);
    expect(() => parseProject(JSON.parse(JSON.stringify(p)))).not.toThrow();
  });

  it('un proyecto guardado con el diseño anterior conserva su animación y adopta los rodillos nuevos', () => {
    const p = demoProject();
    const old = { ...p, name: 'mío', path: { ...p.path, rollerRadiusMm: (8 * 36) / (2 * Math.PI) }, pathAspect: 1.85, film: { ...p.film, syncMarks: { ...p.film.syncMarks, edge: 'bottom' as const, acrossMm: 2 } } };
    const m = adoptPrototypeDesign(old);
    expect(m.name).toBe('mío');
    expect(m.animation).toBe(old.animation);
    expect(m.path.rollerRadiusMm).toBeCloseTo(p.path.rollerRadiusMm, 9);
    expect(m.film.syncMarks.edge).toBe('top');
    expect(deriveProject(m).warnings.filter((w) => w.level === 'error')).toEqual([]);
  });

  it('el modelo detecta rodillos que se traslapan', () => {
    const p = demoProject();
    expect(deriveProject(p).warnings.some((w) => w.source === 'rodillos')).toBe(false);
    expect(deriveProject({ ...p, pathAspect: 2.5 }).warnings.some((w) => w.source === 'rodillos' && w.level === 'error')).toBe(true);
  });

  it('el espacio interior cuenta la separación real entre tramos: el LED cabe y el tambor de Ø160 mm no', () => {
    const p = demoProject();
    const led = deriveProject(p);
    const R = led.pathSpec.rollerRadiusMm;
    const ys = led.pathSpec.rollers.map((r) => r.y);
    expect(led.clearance.depthMm).toBeCloseTo(Math.max(...ys) - Math.min(...ys) + 2 * R, 6);
    expect(led.clearance.ok).toBe(true);
    const drum = deriveProject({ ...p, strobeKind: 'drum' });
    expect(drum.clearance.ok).toBe(false);
    expect(drum.warnings.some((w) => w.source === 'espacio' && w.level === 'error')).toBe(true);
  });

  it('los fotogramas generados coinciden exactamente con la película (misma cantidad, mismo orden, mismos mm)', () => {
    const p = demoProject();
    const d = deriveProject(p);
    const gen = new FrameGenerator(nodeCanvases, { getImage: () => null });
    const set = gen.generate(p.animation, { ...p.frames, widthPx: 48, heightPx: 30, supersample: 1 });
    expect(set.count).toBe(d.layout.frameCount);
    expect(set.widthMm).toBe(d.layout.frameAlongMm);
    expect(set.heightMm).toBe(d.layout.frameAcrossMm);
    for (const pf of d.layout.frames) expect(set.frames[pf.slot % set.count].index).toBe(pf.frameIndex);
  });

  it('cambiar las dimensiones del fotograma recalcula la película y la ventana sigue al fotograma', () => {
    const p = demoProject();
    const q = followFrameSize(p, { widthMm: 40, heightMm: 25, orientation: 0 });
    const d = deriveProject(q);
    expect(d.layout.frameAlongMm).toBe(40);
    expect(d.layout.frameAcrossMm).toBe(25);
    expect(q.optics.gateWidthMm).toBe(40);
    expect(q.film.pitchMm).toBeCloseTo(44, 6); // misma separación de 4 mm
    expect(d.layout.totalLengthMm).toBeCloseTo(24 * 44, 6);
    expect(d.path.lengthMm).toBeCloseTo(24 * 44, 6); // el recorrido se rediseñó solo (autoPath)
  });

  it('cambiar el número de fotogramas actualiza el ciclo y la coherencia con un recorrido fijo', () => {
    const p = { ...demoProject(), autoPath: false };
    const d0 = deriveProject(p);
    expect(d0.coherence.ok).toBe(true);
    const q = { ...p, frames: { ...p.frames, fpsMode: 'keep-count' as const, fixedCount: 36 } };
    const d = deriveProject(q);
    expect(d.frameCount).toBe(36);
    expect(d.duration).toBeCloseTo(1.5, 9);
    expect(d.coherence.ok).toBe(false);
    expect(d.warnings.some((w) => w.source === 'coherencia')).toBe(true);
  });

  it('la tienda notifica solo a quien mira lo que cambió', () => {
    const store = createStore(demoProject());
    let anim = 0;
    let film = 0;
    store.subscribe((p) => p.animation, () => anim++);
    store.subscribe((p) => p.film, () => film++);
    store.update((p) => ({ ...p, film: { ...p.film, pitchMm: 30 } }));
    expect(anim).toBe(0);
    expect(film).toBe(1);
    store.batch(() => {
      store.update((p) => ({ ...p, film: { ...p.film, pitchMm: 31 } }));
      store.update((p) => ({ ...p, film: { ...p.film, pitchMm: 32 } }));
    });
    expect(film).toBe(2);
    expect(hashValue({ a: 1, b: [1, 2] })).toBe(hashValue({ b: [1, 2], a: 1 }));
  });
});
