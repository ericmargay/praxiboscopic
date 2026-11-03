import { describe, expect, it } from 'vitest';
import { cubicBezier, ease } from './easing';
import { evalExpr, evalTrack, evaluate, nodeBBox } from './evaluate';
import { analyzeLoop, closeKeyframeTracks, frameTimes } from './loop';
import { emptyDoc, frameCount, identityTransform, isVectorOnly, makeLayer, parseAnimationDoc } from './model';
import { GENERATORS, buildFromGenerator, generatorById } from './procedural';
import { interpretText, ProceduralTextEngine } from './procedural/text';
import { displayListToSvg } from './svg';

describe('easing', () => {
  it('curvas CSS pasan por los extremos y son monótonas', () => {
    expect(cubicBezier(0.42, 0, 0.58, 1, 0)).toBe(0);
    expect(cubicBezier(0.42, 0, 0.58, 1, 1)).toBe(1);
    let prev = 0;
    for (let i = 1; i <= 20; i++) {
      const v = cubicBezier(0.42, 0, 0.58, 1, i / 20);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
    expect(ease('easeInOutSine', 0.5)).toBeCloseTo(0.5, 6);
  });
});

describe('pistas', () => {
  it('las expresiones periódicas cierran el ciclo: f(0) = f(1)', () => {
    const exprs = [
      { kind: 'sin', amp: 10, cycles: 3 },
      { kind: 'saw', from: 0, to: 360, cycles: 2 },
      { kind: 'bounce', height: 100, bounces: 2 },
      { kind: 'noise', amp: 5, cycles: 4, seed: 3 },
      { kind: 'triangle', amp: 5, cycles: 1 },
    ] as const;
    for (const e of exprs) {
      const a = evalExpr(e as never, 0);
      const b = evalExpr(e as never, 1 - 1e-12);
      // saw salta de 360 a 0 (equivalente módulo 360): distancia al múltiplo de 360 más cercano
      if (e.kind === 'saw') expect(Math.abs(b - a - 360 * Math.round((b - a) / 360))).toBeLessThan(1e-3);
      else expect(b).toBeCloseTo(a, 3);
    }
  });

  it('los keyframes envuelven con loop y se mantienen sin loop', () => {
    const keys = { keys: [{ t: 0, v: 0 }, { t: 0.5, v: 100 }] };
    const loop = { t: 0.75, duration: 1, loop: true };
    // entre 0.5 (100) y 1.0 (= 0 del siguiente ciclo): a mitad → 50
    expect(evalTrack(keys, loop)).toBeCloseTo(50, 6);
    expect(evalTrack(keys, { ...loop, loop: false })).toBe(100);
    expect(evalTrack(keys, { t: 0.25, duration: 1, loop: true })).toBeCloseTo(50, 6);
  });
});

describe('generadores', () => {
  it('los cinco generadores construyen documentos válidos y vectoriales', () => {
    expect(GENERATORS.length).toBeGreaterThanOrEqual(5);
    for (const g of GENERATORS) {
      const doc = buildFromGenerator({ id: g.id, params: {} });
      expect(() => parseAnimationDoc(doc)).not.toThrow();
      expect(doc.layers.length).toBeGreaterThan(0);
      expect(isVectorOnly(doc)).toBe(true);
      const list = evaluate(doc, 0.1);
      expect(list.nodes.length).toBeGreaterThan(0);
    }
  });

  it('cambiar un parámetro cambia la animación (no es una secuencia precalculada)', () => {
    const a = buildFromGenerator({ id: 'ball', params: { radius: 20 } });
    const b = buildFromGenerator({ id: 'ball', params: { radius: 60 } });
    const na = evaluate(a, 0).nodes.find((n) => n.itemId === 'ball')!;
    const nb = evaluate(b, 0).nodes.find((n) => n.itemId === 'ball')!;
    const wa = nodeBBox(na);
    const wb = nodeBBox(nb);
    expect(wb.maxX - wb.minX).toBeGreaterThan(wa.maxX - wa.minX);
    const c = buildFromGenerator({ id: 'ball', params: { frames: 48, fps: 24 } });
    expect(frameCount(c)).toBe(48);
    expect(c.duration).toBeCloseTo(2, 9);
  });

  it('la pelota toca el suelo en t = 0 y está arriba a mitad del ciclo', () => {
    const doc = buildFromGenerator({ id: 'ball', params: { bounces: 1, bounceHeight: 150 } });
    const y0 = nodeBBox(evaluate(doc, 0).nodes.find((n) => n.itemId === 'ball')!).maxY;
    const yMid = nodeBBox(evaluate(doc, doc.duration / 2).nodes.find((n) => n.itemId === 'ball')!).maxY;
    expect(y0 - yMid).toBeGreaterThan(100);
  });

  it('regenera conservando capas del usuario y ediciones por fotograma', () => {
    const base = buildFromGenerator({ id: 'gear', params: {} });
    const withUser = { ...base, layers: [...base.layers, makeLayer('Mía', [{ id: 'u1', name: 'u', type: 'circle', rx: 5, ry: 5, transform: identityTransform(), style: {} }])], frameOverrides: { '3': [{ itemId: 'gear', hidden: true }] } };
    const regen = buildFromGenerator({ id: 'gear', params: { teeth: 20 } }, withUser);
    expect(regen.layers.some((l) => l.name === 'Mía')).toBe(true);
    expect(regen.frameOverrides['3']).toBeDefined();
    expect(regen.generator?.params.teeth).toBe(20);
  });
});

describe('texto → animación', () => {
  it('interpreta tipo, color, cantidad y fotogramas', () => {
    const { ref } = interpretText('una pelota roja rebotando 3 veces, 36 fotogramas a 12 fps');
    expect(ref.id).toBe('ball');
    expect(ref.params.color).toBe('#ff3b30');
    expect(ref.params.bounces).toBe(3);
    expect(ref.params.frames).toBe(36);
    expect(ref.params.fps).toBe(12);
    expect(interpretText('a blue bird flying fast').ref.id).toBe('bird');
    expect(interpretText('persona caminando').ref.id).toBe('walker');
    expect(interpretText('engranaje de 16 dientes antihorario').ref.params.teeth).toBe(16);
    expect(interpretText('formas geométricas abstractas').ref.id).toBe('abstract');
  });
  it('el motor procedural produce un documento válido', async () => {
    const { doc, notes } = await new ProceduralTextEngine().generate('ave volando lenta');
    expect(() => parseAnimationDoc(doc)).not.toThrow();
    expect(notes.length).toBeGreaterThan(0);
    expect(doc.generator?.id).toBe('bird');
  });
});

describe('seamless loop', () => {
  it('muestreo semiabierto: N instantes sin duplicar t = T', () => {
    const t = frameTimes(2, 48);
    expect(t.length).toBe(48);
    expect(t[0]).toBe(0);
    expect(t[47]).toBeCloseTo(2 - 2 / 48, 12);
  });

  it('los generadores son continuos al cerrar el loop', () => {
    for (const g of GENERATORS) {
      const doc = buildFromGenerator({ id: g.id, params: {} });
      const rep = analyzeLoop(doc);
      expect(rep.seamless, `${g.id}: ${rep.message}`).toBe(true);
    }
  });

  it('detecta una discontinuidad y la corrige cerrando la pista', () => {
    const doc = emptyDoc({ duration: 1, fps: 12, loop: false, layers: [makeLayer('L', [{ id: 'c', name: 'c', type: 'circle', rx: 10, ry: 10, transform: identityTransform({ x: { keys: [{ t: 0, v: 0 }, { t: 1, v: 400 }] }, y: 100 }), style: {} }])] });
    const bad = analyzeLoop(doc);
    expect(bad.seamless).toBe(false);
    const fixed = closeKeyframeTracks({ ...doc, loop: true });
    expect(fixed.changes.length).toBeGreaterThan(0);
    const good = analyzeLoop(fixed.doc);
    expect(good.seamless).toBe(true);
  });
});

describe('SVG', () => {
  it('exporta una lista de dibujo vectorial con tamaño físico', () => {
    const doc = buildFromGenerator({ id: 'gear', params: {} });
    const svg = displayListToSvg(evaluate(doc, 0), { widthMm: 32, heightMm: 20 });
    expect(svg).toContain('width="32mm"');
    expect(svg).toContain('<path');
    expect(generatorById('gear')).toBeDefined();
  });
});
