import { describe, expect, it } from 'vitest';
import { buildPdf, pdfPageSizesMm } from './pdf';
import { crc32, zipExtract, zipList, zipStore } from './zip';

describe('ZIP', () => {
  it('empaqueta y vuelve a leer entradas con CRC correcto', () => {
    const a = new TextEncoder().encode('hola');
    const b = new Uint8Array([1, 2, 3, 4, 5]);
    const zip = zipStore([
      { name: 'frames/a.txt', data: a },
      { name: 'b.bin', data: b },
    ]);
    const list = zipList(zip);
    expect(list.map((e) => e.name)).toEqual(['frames/a.txt', 'b.bin']);
    expect(list[0].crc).toBe(crc32(a));
    expect(Array.from(zipExtract(zip, list[1]))).toEqual([1, 2, 3, 4, 5]);
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('PDF', () => {
  it('respeta el tamaño físico de página en mm y contiene las operaciones', () => {
    const pdf = buildPdf({
      title: 'prueba',
      images: [{ data: new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]), width: 2, height: 2, format: 'rgb' }],
      pages: [
        { widthMm: 297, heightMm: 210, ops: [{ op: 'image', image: 0, rect: { xMm: 10, yMm: 10, wMm: 100, hMm: 40 } }, { op: 'line', x1: 0, y1: 0, x2: 10, y2: 10 }, { op: 'text', xMm: 5, yMm: 5, text: 'hola', sizePt: 8 }] },
        { widthMm: 210, heightMm: 297, ops: [{ op: 'rect', rect: { xMm: 0, yMm: 0, wMm: 50, hMm: 50 }, stroke: [1, 0, 0] }] },
      ],
    });
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Im0 Do');
    expect(text.trim().endsWith('%%EOF')).toBe(true);
    const sizes = pdfPageSizesMm(pdf);
    expect(sizes.length).toBe(2);
    expect(sizes[0].widthMm).toBeCloseTo(297, 2);
    expect(sizes[0].heightMm).toBeCloseTo(210, 2);
    expect(sizes[1].widthMm).toBeCloseTo(210, 2);
    // xref apunta a objetos reales
    const start = parseInt(text.match(/startxref\n(\d+)/)![1], 10);
    expect(text.slice(start, start + 4)).toBe('xref');
  });
});
