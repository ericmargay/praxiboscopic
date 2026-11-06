import { describe, expect, it } from 'vitest';
import { demoProject, deriveProject } from '../core/project';
import { reelsDemoProject } from '../core/video';
import { buildParts } from '../fabricate/bom';
import { BOM_KIND, BREADBOARD, breadboardHole, buildKind, buildReel, buildRoller, KINDS, localBox } from './parts';

const size = (kind: string) => {
  const b = localBox(buildKind(kind));
  const s = b.max.clone().sub(b.min);
  return { w: s.x, h: s.y, d: s.z };
};

describe('catálogo de piezas a escala real', () => {
  it('NEMA 17: 42,3 mm de lado y 48 mm de cuerpo más 24 mm de eje', () => {
    const s = size('nema17');
    expect(s.w).toBeCloseTo(42.3, 1);
    expect(s.h).toBeCloseTo(48 + 24, 1);
  });

  it('protoboard de 830 puntos: 165 × 55 mm y agujeros a 2,54 mm con canal de 7,62 mm', () => {
    const s = size('breadboard');
    expect(s.w).toBeCloseTo(BREADBOARD.w, 6);
    expect(s.d).toBeCloseTo(BREADBOARD.d, 6);
    expect(breadboardHole(2, 'a').x - breadboardHole(1, 'a').x).toBeCloseTo(2.54, 6);
    expect(breadboardHole(1, 'f').z - breadboardHole(1, 'e').z).toBeCloseTo(7.62, 6);
  });

  it('ESP32 DevKitC: placa de 54,4 × 27,9 mm', () => {
    const s = size('esp32');
    expect(s.w).toBeCloseTo(54.4, 1);
    expect(s.d).toBeCloseTo(27.9, 1);
  });

  it('rodillo del prototipo: Ø103,1 mm más pestañas de 2 mm', () => {
    const p = demoProject();
    const d = deriveProject(p);
    const R = d.pathSpec.rollerRadiusMm;
    const b = localBox(buildRoller(R, p.film.stripWidthMm + 10));
    expect(b.max.x - b.min.x).toBeCloseTo(2 * R + 4, 1);
  });

  it('cada renglón con forma 3D existe en el catálogo y en la lista de compras del loop o de los dos tambores', () => {
    const loop = demoProject();
    const reels = reelsDemoProject();
    const ids = new Set([...buildParts(loop, deriveProject(loop)).parts, ...buildParts(reels, deriveProject(reels)).parts].map((x) => x.id));
    for (const [row, kind] of Object.entries(BOM_KIND)) {
      // el rodillo y el tambor dependen del proyecto: se construyen con sus medidas
      if (kind !== 'roller' && kind !== 'reel') expect(KINDS[kind], kind).toBeDefined();
      expect(ids.has(row), row).toBe(true);
    }
  });

  it('tambor de dos tambores: bridas de Ø130 mm y 42 mm de luz entre ellas', () => {
    const b = localBox(buildReel((9 * 36) / (2 * Math.PI), 65, 42, 2));
    expect(b.max.x - b.min.x).toBeCloseTo(130, 1);
    // dos bridas de 2 mm y 42 mm de luz, más la marca de giro de 0,6 mm
    expect(b.max.y - b.min.y).toBeCloseTo(46.6, 1);
  });

  it('el rodillo chico del brazo tensor (Ø40) se construye sin aligeramientos que choquen con el cubo', () => {
    const b = localBox(buildRoller(20, 50));
    expect(b.max.x - b.min.x).toBeCloseTo(44, 1);
  });
});
