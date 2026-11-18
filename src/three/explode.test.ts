import { describe, expect, it } from 'vitest';
import { deriveProject } from '../core/project';
import { reelsDemoProject } from '../core/video';
import { buildParts } from '../fabricate/bom';
import { reelsPrintedParts } from '../fabricate/printed';
import { assemblySteps } from '../mech/structure';
import { buildReel, buildSpool, roleOf } from './parts';
import { explodeOffset, supplyColor } from './mechScene';

const y = (id: string) => explodeOffset(id)!.total[1];

describe('vista explosionada de la mesa de dos tambores', () => {
  it('apila las capas sin encimarlas: piso, torres y motores, cubierta y lo que va sobre ella', () => {
    expect(y('E01')).toBe(0);
    expect(y('rubber-feet')).toBeLessThan(0);
    expect(y('E04-1')).toBeGreaterThan(0);
    expect(y('coupling-1')).toBeGreaterThan(y('motor-1'));
    expect(y('bearing-reel1-b')).toBeGreaterThan(y('E06-1'));
    expect(y('E03')).toBeGreaterThan(y('E06-1') + 40);
    expect(y('E03')).toBeGreaterThan(y('psu') + 100);
    expect(y('glue-deck')).toBeGreaterThan(y('E03'));
    expect(y('E02')).toBeGreaterThan(y('glue-deck'));
    expect(y('bearing-reel1-a')).toBeGreaterThan(y('E02'));
    expect(y('pivot-cup')).toBeLessThan(y('E03'));
    expect(y('bearing-pivot-b')).toBeLessThan(y('pivot-cup'));
    for (const id of ['reel-1', 'guide-2', 'dancer', 'led-head', 'lens-cradle', 'cover-posts-1']) expect(y(id), id).toBeGreaterThan(y('E02') + 40);
    expect(y('A05-1')).toBeGreaterThan(y('cover-posts-1'));
    expect(y('hood-2')).toBeGreaterThan(y('hand-sensor-2'));
    // las paredes y la tapa trasera salen de lado
    expect(explodeOffset('A02')!.total[0]).toBeLessThan(-100);
    expect(explodeOffset('A04')!.total[2]).toBeLessThan(-100);
  });

  it('tambores y rodillos se desarman en bridas y cuerpo', () => {
    const reel = buildReel(40, 65, 40, 3);
    for (const role of ['flangeLow', 'core', 'flangeHigh']) expect(roleOf(reel, role).children.length, role).toBeGreaterThan(0);
    const spool = buildSpool(30, 40, 3, 32);
    for (const role of ['flangeLow', 'body', 'flangeHigh']) expect(roleOf(spool, role).children.length, role).toBeGreaterThan(0);
  });
});

describe('pegamentos, cintas y cinchos del ensamble', () => {
  const p = reelsDemoProject();
  const d = deriveProject(p);
  const bom = new Set(buildParts(p, d).parts.map((r) => r.id));
  const steps = assemblySteps();

  it('cada uno entra en su paso, con su renglón de la lista de compras y un color', () => {
    const ids = new Set<string>();
    for (const s of steps)
      for (const u of s.supplies) {
        expect(ids.has(u.id), u.id).toBe(false);
        ids.add(u.id);
        if (u.bomId) {
          expect(bom.has(u.bomId), `${u.id}: ${u.bomId}`).toBe(true);
          expect(s.parts, `paso ${s.n}`).toContain(u.bomId);
        }
        expect(supplyColor(u)).toBeGreaterThan(0);
      }
    // lo que se pega según los textos de los pasos
    for (const id of ['glue-deck', 'epoxy-cup', 'epoxy-reel', 'ca-reel', 'epoxy-guide-shafts', 'ca-rollers', 'epoxy-arm', 'epoxy-magnet', 'ca-rails', 'epoxy-led-dowels', 'epoxy-lens-dowels', 'epoxy-posts', 'psu-tape']) expect(ids.has(id), id).toBe(true);
  });

  it('cada pieza impresa entra en algún paso', () => {
    const inSteps = new Set(steps.flatMap((s) => s.parts));
    for (const q of reelsPrintedParts(p, d)) expect(inSteps.has(q.id), q.id).toBe(true);
  });
});
