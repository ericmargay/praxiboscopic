import { describe, expect, it } from 'vitest';
import { pointInPolygon } from '@aminoacid/omega/fabricate';
import { deriveProject } from '../core/project';
import { reelsDemoProject } from '../core/video';
import { buildReelsStructure, type LaserPart, type V3 } from './structure';
import { laserQuantities, printQuantities } from '../fabricate/quantities';
import { reelsPrintedParts } from '../fabricate/printed';
import { laserRequestText, printRequestText } from '../fabricate/shops';

const p = reelsDemoProject();
const d = deriveProject(p);
const st = buildReelsStructure(p, d);
const byId = (id: string) => st.parts.find((x) => x.id === id)!;

/** ¿el punto de la mesa cae dentro del material de la pieza (en alguno de sus marcos)? */
function inside(part: LaserPart, q: V3): boolean {
  return part.frames.some((f) => {
    const dd: V3 = [q[0] - f.o[0], q[1] - f.o[1], q[2] - f.o[2]];
    const dot = (a: V3) => a[0] * dd[0] + a[1] * dd[1] + a[2] * dd[2];
    const w = dot(f.n);
    if (w < 0 || w > part.thicknessMm) return false;
    const pt = { x: dot(f.u), y: dot(f.v) };
    return pointInPolygon(pt, part.profile.outer) && !(part.profile.holes ?? []).some((h) => pointInPolygon(pt, h));
  });
}

describe('mesa de dos tambores: estructura de corte láser sin tornillos (ADR-0012)', () => {
  it('todos los contornos salen de una pieza y con sus huecos dentro', () => {
    expect(st.problems).toEqual([]);
    for (const part of st.parts) for (const h of part.profile.holes ?? []) for (const q of h) expect(pointInPolygon(q, part.profile.outer), `${part.id}`).toBe(true);
  });

  it('en cada arista de la caja los dientes de una pieza llenan las muescas de la otra: nunca se enciman y solo queda la holgura entre acrílicos', () => {
    const faces = ['E01', 'E02', 'E03', 'A01', 'A02', 'A03', 'A04'].map(byId);
    const B = st.asm.base;
    const tA = B.acrT;
    const wx = [B.x0 + B.inset, B.x1 - B.inset];
    const wzF = B.z1 - B.inset;
    const xs = [wx[0] + tA / 2, wx[1] - tA / 2];
    const ys = [B.bottom + B.mdfT / 2, -B.layerT / 2, -1.5 * B.layerT];
    const zs = [B.z0 + tA / 2, wzF - tA / 2];
    // recorre cada arista a lo largo, en su centro, cada 1,37 mm (un paso que no cae en la frontera entre dientes)
    const samples: V3[] = [];
    for (let x = wx[0] + 0.43; x < wx[1]; x += 1.37) for (const y of ys) for (const z of zs) samples.push([x, y, z]);
    for (let z = B.z0 + 0.43; z < wzF; z += 1.37) for (const y of ys) for (const x of xs) samples.push([x, y, z]);
    for (let y = B.bottom + 0.43; y < 0; y += 1.37) for (const x of xs) for (const z of zs) samples.push([x, y, z]);
    // la ventana de cada cuña entra 0,5 mm en la tapa trasera a propósito
    const wedge = (q: V3) => q[2] < B.z0 + tA && q[1] > -2 * B.layerT && byId('E09').frames.some((f) => Math.abs(q[0] - (f.o[0] + B.mdfT / 2)) < 4);
    let one = 0;
    let gaps = 0;
    for (const q of samples) {
      if (wedge(q)) continue;
      const n = faces.filter((f) => inside(f, q)).length;
      expect(n, `(${q.map((v) => v.toFixed(1)).join(', ')})`).toBeLessThanOrEqual(1);
      if (n === 1) one++;
      else gaps++;
    }
    expect(one).toBeGreaterThan(1500);
    // los huecos son la holgura de 0,1 mm entre dientes de acrílico: pocos puntos caen en ella
    expect(gaps / (one + gaps)).toBeLessThan(0.01);
  });

  it('las paredes de acrílico quedan atrapadas: sus pestañas entran en ranuras cerradas del piso y de la cubierta', () => {
    const B = st.asm.base;
    expect(byId('A01').material).toBe('acrilico-3');
    expect(byId('A04').material).toBe('acrilico-3');
    expect(byId('E01').material).toBe('mdf');
    // a 2 mm de la orilla, sobre la pared de enfrente, el piso es MDF continuo (la ranura no llega a la orilla)
    for (let x = B.x0 + 20; x < B.x1 - 20; x += 3) expect(inside(byId('E01'), [x, B.bottom + B.mdfT / 2, B.z1 - 2])).toBe(true);
  });

  it('con el MDF y el acrílico que se midan (5,7 y 2,8 mm) se redibujan ranuras, dientes y alturas', () => {
    const s2 = buildReelsStructure(p, d, { mdfMm: 5.7, acrylicMm: 2.8 });
    expect(s2.problems).toEqual([]);
    expect(s2.mdfMm).toBe(5.7);
    expect(s2.asm.base.deckT).toBeCloseTo(11.4, 6);
    const shortSides = (s: typeof st) => {
      const floor = s.parts.find((x) => x.id === 'E01')!;
      return floor.profile.holes!.filter((h) => h.length === 4).map((h) => {
        const xs = h.map((q) => q.x);
        const ys = h.map((q) => q.y);
        return Math.round(Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 100) / 100;
      });
    };
    // ranuras de las torres (MDF) y de las paredes (acrílico)
    expect(shortSides(st)).toContain(5.5);
    expect(shortSides(st)).toContain(3);
    expect(shortSides(s2)).toContain(5.7);
    expect(shortSides(s2)).toContain(2.8);
  });

  it('cada pieza que va en la mesa entra en uno de los 12 pasos del ensamble', () => {
    expect(st.steps).toHaveLength(12);
    const named = new Set(st.steps.flatMap((s) => s.parts));
    for (const part of st.parts.filter((x) => x.frames.length)) {
      expect(part.step, part.id).toBeGreaterThanOrEqual(1);
      expect(part.step, part.id).toBeLessThanOrEqual(12);
      expect(named.has(part.id), part.id).toBe(true);
    }
  });

  it('las cuñas sujetan la tapa trasera: dos dientes de la cubierta la atraviesan con su ventana', () => {
    const wedges = byId('E09');
    expect(wedges.frames).toHaveLength(2);
    expect(wedges.qty).toBe(4);
    // la ventana está en las dos capas de la cubierta
    for (const id of ['E02', 'E03']) {
      const deck = byId(id);
      for (const f of wedges.frames) expect(inside(deck, [f.o[0] + st.mdfMm / 2, -st.asm.base.layerT / 2, st.asm.base.z0 - 3])).toBe(false);
    }
  });

  it('todo cabe en hojas de 87 × 57 cm: una de MDF y una de acrílico; la impresión pesa unos 370 g', () => {
    const laser = laserQuantities(st);
    for (const e of laser) expect(e.nest.unplaced, e.material).toEqual([]);
    const mdf = laser.find((e) => e.material === 'mdf')!;
    expect(mdf.sheets).toBe(1);
    expect(mdf.cutM).toBeGreaterThan(12);
    expect(laser.find((e) => e.material === 'acrilico-3')!.sheets).toBe(1);
    const pq = printQuantities(reelsPrintedParts(p, d));
    expect(pq.pieces).toBe(28);
    expect(pq.grams).toBeGreaterThan(250);
    expect(pq.grams).toBeLessThan(550);
  });

  it('los textos para los talleres dicen material, archivos, kerf y piezas de prueba', () => {
    const laser = laserQuantities(st);
    const t = laserRequestText(st, laser);
    expect(t).toContain('MDF de 5,5 mm');
    expect(t).toContain('E10');
    expect(t).toContain('cuatro paredes');
    expect(t).toContain('DXF R12');
    const parts = reelsPrintedParts(p, d);
    const u = printRequestText(parts, printQuantities(parts));
    expect(u).toContain('PETG');
    expect(u).toContain('I01-nucleo-tambor.stl × 2');
    expect(u).toContain('Ø22,05');
    // lo que se manda a los talleres no lleva precios ni tarifas
    for (const txt of [t, u]) expect(txt).not.toMatch(/\$|MXN|FIC/);
  });
});
