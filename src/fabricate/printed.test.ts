import { describe, expect, it } from 'vitest';
import Module from 'manifold-3d';
import { deriveProject } from '../core/project';
import { reelsDemoProject } from '../core/video';
import { reelsPrintedParts } from './printed';

const p = reelsDemoProject();
const d = deriveProject(p);

describe('piezas impresas de la mesa de dos tambores (ADR-0012)', () => {
  it('cada una es un sólido cerrado, cabe en una cama de 256 mm y pesa lo que dice su estimado', async () => {
    const mf = await Module();
    mf.setup();
    const parts = reelsPrintedParts(p, d);
    expect(parts.map((x) => x.id)).toEqual(Array.from({ length: 16 }, (_, i) => `I${String(i + 1).padStart(2, '0')}`));
    for (const part of parts) {
      const m = part.build(mf);
      expect(m.status(), part.id).toBe('NoError');
      expect(m.isEmpty(), part.id).toBe(false);
      const b = m.boundingBox();
      const size = [0, 1, 2].map((k) => b.max[k] - b.min[k]);
      for (const s of size) expect(s, part.id).toBeLessThanOrEqual(256);
      // apoyada en la cama
      expect(b.min[2], part.id).toBeCloseTo(0, 3);
      // el volumen estimado a mano (para la lista de compras) queda a ±30 % del sólido real
      const v = m.volume() / 1000;
      expect(Math.abs(v - part.solidCm3) / v, `${part.id}: ${v.toFixed(1)} frente a ${part.solidCm3.toFixed(1)} cm³`).toBeLessThan(0.3);
      m.delete();
    }
  });

  it('el núcleo del tambor tiene el diámetro del modelo y el boss que apoya en el 608', async () => {
    const mf = await Module();
    mf.setup();
    const core = reelsPrintedParts(p, d).find((x) => x.id === 'I01')!;
    const m = core.build(mf);
    const b = m.boundingBox();
    expect(b.max[0] - b.min[0]).toBeCloseTo(2 * d.reels!.design.geometry.coreR, 1);
    // alto = luz entre bridas + boss sobre la pista interior
    expect(b.max[2]).toBeCloseTo(core.bboxMm[2], 1);
    m.delete();
  });
});
