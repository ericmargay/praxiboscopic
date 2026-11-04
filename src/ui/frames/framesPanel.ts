// Pestaña «Fotogramas» del Animation Studio: ajustes del generador (FPS, duración/cantidad, resolución, mm, fondo,
// alfa, color, orientación, dirección, numeración) y la hoja de contactos con todos los fotogramas, cada uno
// editable (salta al editor en modo fotograma) o reemplazable por una imagen.
import type { AppContext } from '../../app/context';
import { fileToDataUrl } from '../../host/browserCanvas';
import { orientedSize, pixelsPerMm, type FrameGenSettings } from '../../frames/settings';
import { analyzeLoopPixels } from '../../animation/loop';
import { button, checkbox, colorControl, el, fmtNum, group, numberControl, readout, selectControl, textControl } from '../controls';

export function mountFramesPanel(ctx: AppContext, root: HTMLElement): { dispose(): void; refresh(): void } {
  root.classList.add('frames-panel');
  const side = el('aside', { class: 'panel frames-side' });
  const main = el('section', { class: 'frames-main' });
  root.append(side, main);
  const setFrames = (patch: Partial<FrameGenSettings>) => ctx.store.update((p) => ({ ...p, frames: { ...p.frames, ...patch } }));
  const setColor = (patch: Partial<FrameGenSettings['color']>) => ctx.store.update((p) => ({ ...p, frames: { ...p.frames, color: { ...p.frames.color, ...patch } } }));

  let sideKey = '';
  function buildSide(): void {
    const p = ctx.project;
    const s = p.frames;
    const key = JSON.stringify({ s, fps: p.animation.fps, dur: p.animation.duration });
    if (key === sideKey) return;
    sideKey = key;
    side.replaceChildren();
    const d = ctx.derived();
    const sizePx = orientedSize(s);
    side.append(el('h3', { text: 'Generador de fotogramas' }));
    side.append(
      group('Tiempo', [
        selectControl({ label: 'Al cambiar FPS', value: s.fpsMode, options: [{ value: 'keep-duration', label: 'Conservar duración (recalcula fotogramas)' }, { value: 'keep-count', label: 'Conservar fotogramas (recalcula duración)' }], onChange: (v) => setFrames({ fpsMode: v }) }).root,
        numberControl({ label: 'FPS de la animación', value: p.animation.fps, min: 1, max: 60, step: 0.1, decimals: 1, onChange: (v) => (p.animation.generator ? ctx.setGeneratorParams({ fps: v }) : ctx.setAnimation({ ...ctx.project.animation, fps: v })) }).root,
        numberControl({ label: 'Duración del ciclo', value: p.animation.duration, min: 0.05, max: 60, step: 0.05, unit: 's', decimals: 3, onChange: (v) => (p.animation.generator ? ctx.setGeneratorParams({ frames: Math.max(2, Math.round(v * ctx.project.animation.fps)) }) : ctx.setAnimation({ ...ctx.project.animation, duration: v })), disabled: s.fpsMode === 'keep-count' }).root,
        numberControl({ label: 'Fotogramas fijos', value: s.fixedCount, min: 1, max: 1024, step: 1, onChange: (v) => setFrames({ fixedCount: Math.round(v) }), disabled: s.fpsMode !== 'keep-count' }).root,
        readout('Fotogramas resultantes', `${d.frameCount} (${fmtNum(d.duration, 3)} s)`).root,
        readout('Frecuencia de transporte', `${fmtNum(d.sync.actual.transportFps, 2)} fot/s`, 'fotogramas por segundo que pasan por la ventana con la velocidad actual del motor').root,
        readout('Frecuencia de proyección', `${fmtNum(d.sync.actual.flashHz, 2)} Hz`, 'destellos por segundo del estroboscopio').root,
      ]),
      group('Resolución y tamaño físico', [
        numberControl({ label: 'Ancho', value: s.widthPx, min: 16, max: 4096, step: 1, unit: 'px', onChange: (v) => setFrames({ widthPx: Math.round(v) }), noSlider: true }).root,
        numberControl({ label: 'Alto', value: s.heightPx, min: 16, max: 4096, step: 1, unit: 'px', onChange: (v) => setFrames({ heightPx: Math.round(v) }), noSlider: true }).root,
        button('Ajustar al lienzo de la animación', () => setFrames({ widthPx: ctx.project.animation.width, heightPx: ctx.project.animation.height }), { kind: 'ghost' }),
        numberControl({ label: 'Ancho físico', value: s.widthMm, min: 2, max: 300, step: 0.5, unit: 'mm', decimals: 2, onChange: (v) => ctx.store.update((q) => followSize(q, { widthMm: v })) }).root,
        numberControl({ label: 'Alto físico', value: s.heightMm, min: 2, max: 300, step: 0.5, unit: 'mm', decimals: 2, onChange: (v) => ctx.store.update((q) => followSize(q, { heightMm: v })) }).root,
        button('Alto según la proporción del lienzo', () => setFrames({ heightMm: Math.round((ctx.project.frames.widthMm * ctx.project.animation.height / ctx.project.animation.width) * 100) / 100 }), { kind: 'ghost' }),
        readout('Resolución', `${fmtNum(pixelsPerMm(s), 1)} px/mm · ${fmtNum(pixelsPerMm(s) * 25.4, 0)} ppi`).root,
        readout('Sobre la tira', `${fmtNum(sizePx.width, 0)} × ${fmtNum(sizePx.height, 0)} px · ${fmtNum(d.frameMm.width, 2)} × ${fmtNum(d.frameMm.height, 2)} mm`).root,
        numberControl({ label: 'Supermuestreo', value: s.supersample, min: 1, max: 4, step: 1, onChange: (v) => setFrames({ supersample: v }), help: 'Pinta a mayor tamaño y reduce: bordes más limpios' }).root,
      ]),
      group('Fondo y canal alfa', [
        checkbox('Fondo transparente', s.transparent, (v) => setFrames({ transparent: v })).root,
        colorControl('Color de fondo', s.backgroundColor, (v) => setFrames({ backgroundColor: v })).root,
        checkbox('Exportar con canal alfa (RGBA)', s.alphaChannel, (v) => setFrames({ alphaChannel: v })).root,
      ]),
      group('Color y contraste', [
        numberControl({ label: 'Brillo', value: s.color.brightness, min: -1, max: 1, step: 0.01, onChange: (v) => setColor({ brightness: v }) }).root,
        numberControl({ label: 'Contraste', value: s.color.contrast, min: 0, max: 3, step: 0.01, onChange: (v) => setColor({ contrast: v }) }).root,
        numberControl({ label: 'Saturación', value: s.color.saturation, min: 0, max: 2, step: 0.01, onChange: (v) => setColor({ saturation: v }) }).root,
        numberControl({ label: 'Umbral (alto contraste)', value: s.color.threshold, min: 0, max: 1, step: 0.01, onChange: (v) => setColor({ threshold: v }), help: '0 = desactivado. Para fotolito o láser: convierte a blanco y negro puros.' }).root,
        checkbox('Escala de grises', s.color.grayscale, (v) => setColor({ grayscale: v })).root,
        checkbox('Invertir (negativo)', s.color.invert, (v) => setColor({ invert: v })).root,
      ]),
      group('Orientación, dirección y numeración', [
        selectControl({ label: 'Orientación', value: String(s.orientation), options: [{ value: '0', label: '0°' }, { value: '90', label: '90°' }, { value: '180', label: '180°' }, { value: '270', label: '270°' }], onChange: (v) => setFrames({ orientation: Number(v) as 0 | 90 | 180 | 270 }) }).root,
        selectControl({ label: 'Dirección en la tira', value: s.direction, options: [{ value: 'forward', label: 'Adelante (0 → N−1)' }, { value: 'reverse', label: 'Inversa (N−1 → 0)' }], onChange: (v) => setFrames({ direction: v }) }).root,
        textControl('Prefijo', s.numbering.prefix, (v) => setFrames({ numbering: { ...s.numbering, prefix: v } })).root,
        numberControl({ label: 'Primer número', value: s.numbering.start, min: 0, max: 10000, step: 1, onChange: (v) => setFrames({ numbering: { ...s.numbering, start: Math.round(v) } }), noSlider: true }).root,
        numberControl({ label: 'Ceros a la izquierda', value: s.numbering.pad, min: 0, max: 8, step: 1, onChange: (v) => setFrames({ numbering: { ...s.numbering, pad: Math.round(v) } }), noSlider: true }).root,
      ]),
    );
  }

  function followSize(q: typeof ctx.project, next: Partial<Pick<FrameGenSettings, 'widthMm' | 'heightMm'>>) {
    // reutiliza followFrameSize del proyecto para que la ventana óptica y el paso sigan al fotograma
    return followFrameSizeLazy(q, { widthMm: next.widthMm ?? q.frames.widthMm, heightMm: next.heightMm ?? q.frames.heightMm, orientation: q.frames.orientation });
  }

  // hoja de contactos
  let sheetHash = '';
  const toolbar = el('div', { class: 'sheet-toolbar' });
  const grid = el('div', { class: 'contact-sheet' });
  const info = el('div', { class: 'sheet-info hint' });
  main.append(toolbar, info, grid);
  let thumbSize = 120;
  function buildSheet(): void {
    const p = ctx.project;
    const set = ctx.frames();
    const key = `${set.hash}|${thumbSize}|${p.ui.time}|${Object.keys(p.animation.frameReplacements ?? {}).join(',')}`;
    if (key === sheetHash) return;
    const structural = !sheetHash.startsWith(`${set.hash}|${thumbSize}|`);
    sheetHash = key;
    const current = Math.floor(((p.ui.time % set.duration) + set.duration) % set.duration * set.fps + 1e-6) % set.count;
    if (!structural) {
      // solo cambió el fotograma actual: actualiza la clase
      grid.querySelectorAll('.thumb').forEach((n, i) => n.classList.toggle('current', i === current));
      return;
    }
    toolbar.replaceChildren(
      el('span', { class: 'mono', text: `${set.count} fotogramas · ${set.widthPx} × ${set.heightPx} px · ${fmtNum(set.widthMm, 2)} × ${fmtNum(set.heightMm, 2)} mm · ${set.regenerated} repintados, ${set.cached} de caché` }),
      el('span', { class: 'spacer' }),
      button('−', () => {
        thumbSize = Math.max(60, thumbSize - 20);
        sheetHash = '';
        buildSheet();
      }, { kind: 'ghost', title: 'Miniaturas más pequeñas' }),
      button('+', () => {
        thumbSize = Math.min(320, thumbSize + 20);
        sheetHash = '';
        buildSheet();
      }, { kind: 'ghost', title: 'Miniaturas más grandes' }),
    );
    const loop = analyzeLoopPixels(set.frames.map((f) => f.canvas.getContext('2d')!.getImageData(0, 0, f.canvas.width, f.canvas.height)));
    info.textContent = loop.seamless ? `Continuidad del loop (píxeles): cierre ${loop.wrap.toFixed(2)} frente a mediana ${loop.median.toFixed(2)} por canal → continuo.` : `Continuidad del loop (píxeles): el cierre (${loop.wrap.toFixed(2)}) salta ×${loop.ratio.toFixed(1)} respecto a la mediana (${loop.median.toFixed(2)}): revisa la pestaña Editor → Seamless Loop.`;
    info.className = `sheet-info hint ${loop.seamless ? 'ok' : 'warn'}`;
    grid.replaceChildren();
    const scale = thumbSize / Math.max(set.widthPx, set.heightPx);
    for (const f of set.frames) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(set.widthPx * scale));
      c.height = Math.max(1, Math.round(set.heightPx * scale));
      const g = c.getContext('2d')!;
      g.drawImage(f.canvas as unknown as CanvasImageSource, 0, 0, c.width, c.height);
      const replaced = !!p.animation.frameReplacements?.[String(f.sourceIndex)];
      const card = el('div', { class: `thumb${f.index === current ? ' current' : ''}${f.edited ? ' edited' : ''}` });
      card.append(el('div', { class: 'thumb-img checker' }, c), el('div', { class: 'thumb-meta' }, el('span', { class: 'mono', text: `#${f.index + 1}` }), el('span', { class: 'hint', text: `${f.label} · t=${f.t.toFixed(3)} s` }), f.edited ? el('span', { class: 'tag', text: replaced ? 'reemplazado' : 'editado' }) : null));
      const actions = el('div', { class: 'thumb-actions' });
      actions.append(
        button('Editar', () => {
          ctx.store.update((q) => ({ ...q, ui: { ...q.ui, time: f.t, playing: false, studioTab: 'editor' } }));
          document.dispatchEvent(new CustomEvent('praxi:edit-frame', { detail: { frameIndex: f.sourceIndex, t: f.t } }));
        }, { kind: 'ghost', title: 'Abrir este fotograma en el editor en modo edición individual' }),
        button('Reemplazar…', () => replaceFrame(f.sourceIndex), { kind: 'ghost', title: 'Sustituir este fotograma por una imagen PNG/JPG/SVG' }),
      );
      if (replaced) actions.append(button('Quitar', () => ctx.setAnimation({ ...ctx.project.animation, frameReplacements: without(ctx.project.animation.frameReplacements ?? {}, String(f.sourceIndex)) }), { kind: 'danger' }));
      card.append(actions);
      card.addEventListener('dblclick', () => ctx.store.update((q) => ({ ...q, ui: { ...q.ui, time: f.t, playing: false } })));
      grid.append(card);
    }
  }

  function replaceFrame(sourceIndex: number): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/svg+xml,image/webp';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = await fileToDataUrl(file);
      ctx.setAnimation({ ...ctx.project.animation, frameReplacements: { ...(ctx.project.animation.frameReplacements ?? {}), [String(sourceIndex)]: url } });
    };
    input.click();
  }

  const unsub = ctx.store.onChange(() => {
    buildSide();
    buildSheet();
  });
  buildSide();
  buildSheet();
  return {
    dispose: unsub,
    refresh() {
      sideKey = '';
      sheetHash = '';
      buildSide();
      buildSheet();
    },
  };
}

function without<T>(o: Record<string, T>, k: string): Record<string, T> {
  const { [k]: _omit, ...rest } = o;
  return rest;
}

// import diferido para no crear un ciclo de dependencias con core/project en tiempo de carga
import { followFrameSize } from '../../core/project';
import type { Project } from '../../core/project';
function followFrameSizeLazy(p: Project, next: Pick<FrameGenSettings, 'widthMm' | 'heightMm' | 'orientation'>): Project {
  return followFrameSize(p, next);
}
