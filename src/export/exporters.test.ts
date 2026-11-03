import { describe, expect, it } from 'vitest';
import { buildFromGenerator } from '../animation/procedural';
import { buildFilmLayout, defaultFilmSpec } from '../film/layout';
import { defaultPrintSpec } from '../film/print';
import { FrameGenerator } from '../frames/generator';
import { defaultFrameGenSettings } from '../frames/settings';
import { nodeCanvases, pngHeader } from '../test/nodeCanvas';
import { exportPngSequence, exportSpritesheet, exportStripPdf, exportStripPng, exportStripSvg, exportSvgSequence } from './exporters';
import { pdfPageSizesMm } from './pdf';
import { zipExtract, zipList } from './zip';

const doc = buildFromGenerator({ id: 'ball', params: { frames: 24, fps: 24 } });
const gen = new FrameGenerator(nodeCanvases, { getImage: () => null });
const frames = gen.generate(doc, defaultFrameGenSettings({ widthPx: 64, heightPx: 40, supersample: 1 }));
const layout = buildFilmLayout({ frameCount: frames.count, alongMm: frames.widthMm, acrossMm: frames.heightMm }, defaultFilmSpec({ pitchMm: 36 }));
const ctx = { canvases: nodeCanvases };

describe('exportaciones', () => {
  it('la secuencia PNG contiene 24 archivos íntegros en orden y un manifiesto coherente', async () => {
    const file = await exportPngSequence(frames, ctx);
    const list = zipList(file.data as Uint8Array);
    const pngs = list.filter((e) => e.name.endsWith('.png'));
    expect(pngs.length).toBe(24);
    expect(pngs.map((e) => e.name)).toEqual(frames.frames.map((f) => `fotogramas/${f.label}.png`));
    for (const e of pngs) {
      const h = pngHeader(zipExtract(file.data as Uint8Array, e));
      expect(h.width).toBe(64);
      expect(h.height).toBe(40);
    }
    const manifest = JSON.parse(new TextDecoder().decode(zipExtract(file.data as Uint8Array, list.find((e) => e.name.endsWith('manifest.json'))!)));
    expect(manifest.count).toBe(24);
    expect(manifest.frames[5].index).toBe(5);
    expect(manifest.widthMm).toBe(32);
  });

  it('el spritesheet tiene la rejilla declarada', async () => {
    const [png, json] = await exportSpritesheet(frames, ctx);
    const h = pngHeader(png.data as Uint8Array);
    const meta = JSON.parse(json.data as string);
    expect(h.width).toBe(meta.columns * 64);
    expect(h.height).toBe(meta.rows * 40);
    expect(meta.frames.length).toBe(24);
  });

  it('el SVG por fotograma solo existe para contenido vectorial y lleva el tamaño físico', () => {
    const file = exportSvgSequence(doc, frames)!;
    expect(file).not.toBeNull();
    const list = zipList(file.data as Uint8Array);
    expect(list.length).toBe(24);
    const svg = new TextDecoder().decode(zipExtract(file.data as Uint8Array, list[0]));
    expect(svg).toContain('width="32mm"');
    const raster = { ...doc, layers: [...doc.layers, { id: 'l', name: 'img', visible: true, transform: doc.layers[0].transform, items: [{ id: 'i', name: 'i', type: 'image' as const, src: 'data:,', w: 10, h: 10, transform: doc.layers[0].transform, style: {} }] }] };
    expect(exportSvgSequence(raster, frames)).toBeNull();
  });

  it('la tira PNG mide exactamente mm × px/mm y el SVG declara mm; la tira simulada y la exportada coinciden fotograma a fotograma', async () => {
    const files = await exportStripPng(layout, frames.frames, ctx, { pxPerMm: 4, mirror: false, background: 'white', opaqueMask: false, labels: true });
    expect(files.length).toBe(1);
    const h = pngHeader(files[0].data as Uint8Array);
    expect(h.width).toBe(Math.ceil(layout.totalLengthMm * 4));
    expect(h.height).toBe(Math.ceil(layout.spec.stripWidthMm * 4));
    const svg = exportStripSvg(layout, doc, frames, ctx, { mirror: false, labels: true, opaqueMask: false, preferVector: true });
    expect(svg.data as string).toContain(`width="${layout.totalLengthMm}mm"`);
    expect((svg.data as string).match(/<svg x=/g)!.length).toBe(24); // 24 fotogramas vectoriales anidados
    // trozos: con un límite pequeño se divide
    const chunks = await exportStripPng(layout, frames.frames, ctx, { pxPerMm: 4, mirror: false, background: 'white', opaqueMask: false, labels: false, maxSidePx: 1000 });
    expect(chunks.length).toBe(Math.ceil(layout.totalLengthMm / Math.floor(1000 / 4)));
  });

  it('el PDF tiene portada + páginas de segmentos a tamaño real', async () => {
    const spec = defaultPrintSpec({ pageId: 'a4', landscape: true, ppi: 150 });
    const { file, plan } = await exportStripPdf(layout, frames.frames, spec, ctx, 'prueba');
    const sizes = pdfPageSizesMm(file.data as Uint8Array);
    expect(sizes.length).toBe(1 + plan.pages);
    expect(sizes[1].widthMm).toBeCloseTo(297, 1);
    expect(sizes[1].heightMm).toBeCloseTo(210, 1);
    const text = new TextDecoder('latin1').decode(file.data as Uint8Array);
    expect(text).toContain('Segmento 1/');
    expect((text.match(/\/Subtype \/Image/g) ?? []).length).toBe(plan.segments.length);
  });
});
