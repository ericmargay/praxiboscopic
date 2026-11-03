import { describe, expect, it } from 'vitest';
import { demoProject, deriveProject } from '../core/project';
import { buildBom } from './bom';

describe('lista de materiales', () => {
  it('la demostración produce una BOM con motor, driver, 4 rodillos, óptica, LED y película, con totales', () => {
    const p = demoProject();
    const bom = buildBom(p, deriveProject(p), '30/10/2026');
    const ids = bom.lines.map((l) => l.id);
    expect(ids.some((i) => i.startsWith('motor-'))).toBe(true);
    expect(ids).toContain('driver-dm542');
    expect(ids).toContain('psu-24v-5a');
    expect(ids).toContain('sensor-f249');
    expect(ids).not.toContain('psu-12v-5a');
    expect(bom.lines.find((l) => l.id === 'rollers')!.qty).toBe(4);
    expect(bom.lines.find((l) => l.id === 'bearing-608')!.qty).toBe(8);
    expect(ids).toContain('led-10w');
    expect(ids).toContain('gate-plate');
    expect(bom.markdown).toContain('| P-01 |');
    expect(bom.markdown).toContain('MXN 225');
    expect(bom.markdown).toContain('**Total con precio:**');
    expect(bom.csv.split('\n')[0]).toContain('id,name,category');
    const drum = buildBom({ ...p, strobeKind: 'drum' }, deriveProject({ ...p, strobeKind: 'drum' }));
    expect(drum.lines.some((l) => l.id === 'drum-shutter')).toBe(true);
  });
});
