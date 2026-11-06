import { describe, expect, it } from 'vitest';
import { pointInPolygon } from '@aminoacid/omega/fabricate';
import { deriveProject } from '../core/project';
import { reelsDemoProject } from '../core/video';
import { buildReelsStructure, type LaserPart, type V3 } from './structure';
import { estimateLaser, estimatePrint } from '../fabricate/estimate';
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

  it('en cada arista de la caja los dientes de una cara llenan justo las muescas de la otra: ni hueco ni empalme', () => {
    const faces = ['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07'].map(byId);
    const B = st.asm.base;
    const t = B.mdfT;
    const xs = [B.x0 + t / 2, B.x1 - t / 2];
    const ys = [B.bottom + t / 2, -t / 2, -1.5 * t];
    const zs = [B.z0 + t / 2, B.z1 - t / 2];
    // recorre cada arista a lo largo, en su centro, cada 1,37 mm (un paso que no cae en la frontera entre dientes)
    const samples: V3[] = [];
    for (let x = B.x0 + 0.43; x < B.x1; x += 1.37) for (const y of ys) for (const z of zs) samples.push([x, y, z]);
    for (let z = B.z0 + 0.43; z < B.z1; z += 1.37) for (const y of ys) for (const x of xs) samples.push([x, y, z]);
    for (let y = B.bottom + 0.43; y < 0; y += 1.37) for (const x of xs) for (const z of zs) samples.push([x, y, z]);
    // la ventana de cada cuña entra 0,5 mm en la tapa trasera a propósito
    const wedge = (q: V3) => q[2] < B.z0 + t && q[1] > -2 * B.layerT && byId('E13').frames.some((f) => Math.abs(q[0] - (f.o[0] + t / 2)) < 4);
    let checked = 0;
    for (const q of samples) {
      if (wedge(q)) continue;
      const n = faces.filter((f) => inside(f, q)).length;
      expect(n, `(${q.map((v) => v.toFixed(1)).join(', ')})`).toBe(1);
      checked++;
    }
    expect(checked).toBeGreaterThan(1500);
  });

  it('con el MDF que se mida (5,7 mm) se redibujan ranuras, dientes y alturas', () => {
    const s57 = buildReelsStructure(p, d, { mdfMm: 5.7 });
    expect(s57.problems).toEqual([]);
    expect(s57.mdfMm).toBe(5.7);
    expect(s57.asm.base.deckT).toBeCloseTo(11.4, 6);
    const w = (s: typeof st) => {
      const floor = s.parts.find((x) => x.id === 'E01')!;
      // ranura de un costado de torre: el lado corto es el espesor
      const slot = floor.profile.holes!.find((h) => h.length === 4)!;
      const xs = slot.map((q) => q.x);
      const ys = slot.map((q) => q.y);
      return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    };
    expect(w(st)).toBeCloseTo(5.5, 6);
    expect(w(s57)).toBeCloseTo(5.7, 6);
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
    const wedges = byId('E13');
    expect(wedges.frames).toHaveLength(2);
    expect(wedges.qty).toBe(4);
    // la ventana está en las dos capas de la cubierta
    for (const id of ['E05', 'E06']) {
      const deck = byId(id);
      for (const f of wedges.frames) expect(inside(deck, [f.o[0] + st.mdfMm / 2, -st.asm.base.layerT / 2, st.asm.base.z0 - 3])).toBe(false);
    }
  });

  it('todo cabe en hojas de 87 × 57 cm: dos de MDF y una de acrílico; el estimado queda en el rango de las tarifas', () => {
    const laser = estimateLaser(st);
    for (const e of laser) expect(e.nest.unplaced, e.material).toEqual([]);
    const mdf = laser.find((e) => e.material === 'mdf')!;
    expect(mdf.sheets).toBe(2);
    expect(mdf.cutM).toBeGreaterThan(15);
    expect(mdf.mxn.mid).toBeGreaterThan(400);
    expect(mdf.mxn.mid).toBeLessThan(1200);
    expect(laser.find((e) => e.material === 'acrilico-3')!.sheets).toBe(1);
    const pe = estimatePrint(reelsPrintedParts(p, d));
    expect(pe.pieces).toBe(28);
    expect(pe.grams).toBeGreaterThan(250);
    expect(pe.grams).toBeLessThan(550);
    expect(pe.mxn.low).toBeLessThan(pe.mxn.mid);
    expect(pe.mxn.mid).toBeLessThan(pe.mxn.high);
  });

  it('los textos para los talleres dicen material, archivos, kerf y piezas de prueba', () => {
    const laser = estimateLaser(st);
    const t = laserRequestText(st, laser);
    expect(t).toContain('MDF de 5,5 mm');
    expect(t).toContain('E14');
    expect(t).toContain('DXF R12');
    const parts = reelsPrintedParts(p, d);
    const u = printRequestText(parts, estimatePrint(parts));
    expect(u).toContain('PETG');
    expect(u).toContain('I01-nucleo-tambor.stl × 2');
    expect(u).toContain('Ø22,05');
  });
});
