import { describe, expect, it } from 'vitest';
import { buildPdf } from './pdf';
import { srgbIccProfile } from './icc';

describe('color y texto del PDF', () => {
  it('el perfil sRGB es un ICC v2 de monitor RGB → XYZ con su tamaño declarado', () => {
    const icc = srgbIccProfile();
    const dv = new DataView(icc.buffer, icc.byteOffset, icc.byteLength);
    const str = (o: number) => String.fromCharCode(...icc.slice(o, o + 4));
    expect(dv.getUint32(0)).toBe(icc.length);
    expect(str(36)).toBe('acsp');
    expect(str(12)).toBe('mntr');
    expect(str(16)).toBe('RGB ');
    expect(str(20)).toBe('XYZ ');
    expect(dv.getUint32(128)).toBe(9); // desc, cprt, wtpt, r/g/bXYZ, r/g/bTRC
  });

  it('con perfil, las imágenes se declaran ICCBased; los acentos van en WinAnsi y no como «?»', () => {
    const pdf = buildPdf({ title: 'Película', pages: [{ widthMm: 100, heightMm: 100, ops: [{ op: 'image', image: 0, rect: { xMm: 0, yMm: 0, wMm: 10, hMm: 10 } }, { op: 'text', xMm: 5, yMm: 5, text: 'Película · 32 × 20 mm – año', sizePt: 10 }] }], images: [{ data: new Uint8Array([255, 0, 0]), width: 1, height: 1, format: 'rgb' }], iccProfile: srgbIccProfile() });
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text).toContain('/ColorSpace [/ICCBased');
    expect(text).toContain('/N 3 /Alternate /DeviceRGB');
    expect(text).toContain('Pel\\355cula \\267 32 \\327 20 mm \\226 a\\361o');
    expect(text).not.toContain('Pel?cula');
  });
});
