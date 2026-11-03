import { describe, expect, it } from 'vitest';
import { buildFromGenerator } from '../animation/procedural';
import { analyzeLoopPixels } from '../animation/loop';
import { imageDataOf, nodeCanvases, pngHeader } from '../test/nodeCanvas';
import { FrameGenerator } from './generator';
import { defaultFrameGenSettings, frameLabel, orientedSize, resolveFrameCount } from './settings';

const doc = buildFromGenerator({ id: 'ball', params: { frames: 24, fps: 24 } });

describe('generador de fotogramas', () => {
  it('2 s a 24 FPS producen 48 imágenes individuales distintas', () => {
    const d = buildFromGenerator({ id: 'ball', params: { frames: 48, fps: 24 } });
    const gen = new FrameGenerator(nodeCanvases, { getImage: () => null });
    const set = gen.generate(d, defaultFrameGenSettings({ widthPx: 96, heightPx: 60, supersample: 1 }));
    expect(set.count).toBe(48);
    expect(set.frames.length).toBe(48);
    expect(set.duration).toBeCloseTo(2, 9);
    const hashes = new Set(set.frames.map((f) => f.hash));
    expect(hashes.size).toBe(48);
    // imágenes distintas de verdad (la pelota se mueve)
    const a = imageDataOf(set.frames[0].canvas);
    const b = imageDataOf(set.frames[12].canvas);
    let diff = 0;
    for (let i = 0; i < a.data.length; i += 4) diff += Math.abs(a.data[i + 3] - b.data[i + 3]);
    expect(diff).toBeGreaterThan(1000);
  });

  it('respeta resolución, orientación y numeración', () => {
    const gen = new FrameGenerator(nodeCanvases, { getImage: () => null });
    const s = defaultFrameGenSettings({ widthPx: 120, heightPx: 75, orientation: 90, supersample: 1, numbering: { start: 1, pad: 3, prefix: 'f_' } });
    const set = gen.generate(doc, s);
    expect(orientedSize(s)).toEqual({ width: 75, height: 120 });
    expect(set.widthPx).toBe(75);
    expect(set.heightPx).toBe(120);
    expect(set.frames[0].canvas.width).toBe(75);
    expect(set.frames[0].canvas.height).toBe(120);
    expect(set.widthMm).toBe(20);
    expect(set.heightMm).toBe(32);
    expect(set.frames[0].label).toBe('f_001');
    expect(frameLabel(23, s.numbering)).toBe('f_024');
  });

  it('orden correcto: índice de película = índice temporal (y al revés con dirección inversa)', () => {
    const gen = new FrameGenerator(nodeCanvases, { getImage: () => null });
    const fwd = gen.generate(doc, defaultFrameGenSettings({ widthPx: 48, heightPx: 30, supersample: 1 }));
    for (let i = 0; i < fwd.count; i++) {
      expect(fwd.frames[i].index).toBe(i);
      expect(fwd.frames[i].sourceIndex).toBe(i);
      expect(fwd.frames[i].t).toBeCloseTo((i * fwd.duration) / fwd.count, 12);
    }
    const rev = gen.generate(doc, defaultFrameGenSettings({ widthPx: 48, heightPx: 30, supersample: 1, direction: 'reverse' }));
    expect(rev.frames[0].sourceIndex).toBe(23);
    expect(rev.frames[23].sourceIndex).toBe(0);
  });

  it('modo keep-count recalcula la duración al cambiar FPS; keep-duration recalcula el número', () => {
    expect(resolveFrameCount(12, 1, { fpsMode: 'keep-duration', fixedCount: 24 })).toEqual({ count: 12, duration: 1 });
    expect(resolveFrameCount(12, 1, { fpsMode: 'keep-count', fixedCount: 24 })).toEqual({ count: 24, duration: 2 });
  });

  it('regeneración incremental: editar un fotograma solo repinta ese; cambiar la animación repinta todos', () => {
    const gen = new FrameGenerator(nodeCanvases, { getImage: () => null });
    const s = defaultFrameGenSettings({ widthPx: 48, heightPx: 30, supersample: 1 });
    const first = gen.generate(doc, s);
    expect(first.regenerated).toBe(24);
    const again = gen.generate(doc, s);
    expect(again.regenerated).toBe(0);
    expect(again.cached).toBe(24);
    expect(again.hash).toBe(first.hash);
    const edited = { ...doc, frameOverrides: { '5': [{ itemId: 'ball', transform: { x: 10 } }] } };
    const third = gen.generate(edited, s);
    expect(third.regenerated).toBe(1);
    expect(third.frames[5].edited).toBe(true);
    expect(third.hash).not.toBe(first.hash);
    const bigger = buildFromGenerator({ id: 'ball', params: { frames: 24, fps: 24, radius: 50 } });
    const fourth = gen.generate(bigger, s);
    expect(fourth.regenerated).toBe(24);
  });

  it('los fotogramas pintados cierran el loop (comparación de píxeles)', () => {
    const gen = new FrameGenerator(nodeCanvases, { getImage: () => null });
    const set = gen.generate(doc, defaultFrameGenSettings({ widthPx: 96, heightPx: 60, supersample: 1 }));
    const rep = analyzeLoopPixels(set.frames.map((f) => imageDataOf(f.canvas)));
    expect(rep.seamless, JSON.stringify(rep)).toBe(true);
  });

  it('exporta PNG con canal alfa y dimensiones exactas', async () => {
    const gen = new FrameGenerator(nodeCanvases, { getImage: () => null });
    const set = gen.generate(doc, defaultFrameGenSettings({ widthPx: 64, heightPx: 40, supersample: 1 }));
    const png = await nodeCanvases.toPng(set.frames[0].canvas);
    const h = pngHeader(png);
    expect(h.width).toBe(64);
    expect(h.height).toBe(40);
    expect(h.colorType).toBe(6); // RGBA
  });

  it('ajustes de color: invertir cambia los píxeles opacos y el umbral los vuelve binarios', () => {
    const gen = new FrameGenerator(nodeCanvases, { getImage: () => null });
    const base = defaultFrameGenSettings({ widthPx: 48, heightPx: 30, supersample: 1, transparent: false, backgroundColor: '#808080' });
    const a = imageDataOf(gen.generate(doc, base).frames[0].canvas);
    const b = imageDataOf(gen.generate(doc, { ...base, color: { ...base.color, invert: true } }).frames[0].canvas);
    expect(a.data[0] + b.data[0]).toBeGreaterThanOrEqual(254);
    const c = imageDataOf(gen.generate(doc, { ...base, color: { ...base.color, threshold: 0.5 } }).frames[0].canvas);
    for (let i = 0; i < c.data.length; i += 4) expect(c.data[i] === 0 || c.data[i] === 255).toBe(true);
  });
});
