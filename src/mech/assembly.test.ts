import { describe, expect, it } from 'vitest';
import { demoProject, deriveProject } from '../core/project';
import { assemblyProblems, buildAssembly } from './assembly';

describe('ensamble físico del prototipo', () => {
  const p = demoProject();
  const d = deriveProject(p);
  const a = buildAssembly(p, d);

  it('todo cabe: sin choques dentro de la base ni con los rodillos', () => {
    expect(assemblyProblems(a, d)).toEqual([]);
  });

  it('la base abraza los rodillos: 12 mm de margen y menos de 300 mm de ancho', () => {
    const R = d.pathSpec.rollerRadiusMm;
    const maxX = Math.max(...d.pathSpec.rollers.map((r) => r.x)) + R + 2;
    expect(a.base.x1 - maxX).toBeCloseTo(12, 6);
    expect(a.base.x1 - a.base.x0).toBeLessThan(300);
  });

  it('el motor cuelga bajo el rodillo motriz y el acoplamiento une ejes de 24 mm y del rodillo', () => {
    const drive = d.pathSpec.rollers[d.pathSpec.driveRoller];
    expect(a.motor.x).toBe(drive.x);
    expect(a.motor.z).toBe(drive.y);
    // el eje del motor (24 mm) entra 12,5 mm en el cople de 25 mm
    expect(a.motor.faceY + 24 - (a.motor.couplingY - 12.5)).toBeCloseTo(12.5, 6);
    expect(a.motor.faceY - 48).toBeGreaterThan(a.base.floorTop);
  });

  it('el haz del sensor cae dentro de la marca de sincronía del borde superior', () => {
    const sm = p.film.syncMarks;
    expect(sm.edge).toBe('top');
    const fromEdge = a.filmTop - a.sensor.beamY;
    expect(fromEdge).toBeGreaterThan(0.8);
    expect(fromEdge).toBeLessThan(0.8 + sm.acrossMm);
  });

  it('la cabeza del LED cabe en el hueco de 54 mm entre los rodillos de la ventana', () => {
    expect(a.ledHead.width).toBeLessThanOrEqual(d.clearance.widthMm);
    expect(a.ledHead.depth).toBeLessThanOrEqual(d.clearance.depthMm);
  });
});
