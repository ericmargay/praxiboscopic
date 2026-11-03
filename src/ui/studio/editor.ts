// Animation Studio · editor: monta la biblioteca, las capas, el lienzo de edición, la línea de tiempo, las
// propiedades y el panel de loop sobre el AppContext; gestiona la reproducción (ctx.onTick) y los atajos de teclado.
// Estado del proyecto en ctx.store; estado efímero del editor en EditorStore.
import './studio.css';
import type { AppContext } from '../../app/context';
import { removeItem } from '../../animation/model';
import { resolveFrameCount } from '../../frames/settings';
import { el } from '../controls';
import { mountCanvas } from './canvas';
import { mountLayers } from './layers';
import { mountLibrary } from './library';
import { mountLoopPanel } from './loopPanel';
import { mountProperties } from './properties';
import { EditorStore, type Tool } from './state';
import { mountTimeline } from './timeline';
import { frameOfTime, timeOfFrame } from './tracks';

export interface EditorHandle {
  dispose(): void;
  /** vuelve a medir el lienzo (llamar al mostrar la sección) */
  resize(): void;
  /** encaja el lienzo en la vista */
  fit(): void;
  readonly editor: EditorStore;
}

const KEY_TOOLS: Record<string, Tool> = { v: 'select', c: 'circle', r: 'rect', p: 'polygon', l: 'line', b: 'path', t: 'text' };

export function mountEditor(ctx: AppContext, root: HTMLElement): EditorHandle {
  const es = new EditorStore();
  root.classList.add('studio-root');
  const left = el('div', { class: 'studio-col studio-col-left' });
  const center = el('div', { class: 'studio-center' });
  const right = el('div', { class: 'studio-col studio-col-right' });
  const library = el('div');
  const layers = el('div');
  const editor = el('div', { class: 'studio-editor' });
  const timeline = el('div');
  const props = el('div');
  const loop = el('div');
  left.append(library, layers);
  center.append(editor, timeline);
  right.append(props, loop);
  root.append(left, center, right);

  const parts = [mountLibrary(ctx, es, library), mountLayers(ctx, es, layers), mountTimeline(ctx, es, timeline), mountProperties(ctx, es, props), mountLoopPanel(ctx, loop)];
  const canvas = mountCanvas(ctx, es, editor);

  // reproducción: avanza el tiempo del proyecto; solo el lienzo y la línea de tiempo escuchan ui.time
  const unTick = ctx.onTick((dt) => {
    const p = ctx.project;
    if (!p.ui.playing) return;
    const d = p.animation.duration;
    if (d <= 0) return;
    const t = (((p.ui.time + dt * p.ui.timeScale) % d) + d) % d;
    ctx.store.update((q) => ({ ...q, ui: { ...q.ui, time: t } }));
  });

  // si la selección deja de existir (p. ej. regeneración del generador), se limpia
  const unSel = ctx.store.subscribe(
    (p) => p.animation,
    (doc) => {
      const s = es.get();
      if (s.selectedItemId && !doc.layers.some((l) => hasItem(l.items, s.selectedItemId!))) es.patch({ selectedItemId: null, selectedKey: null });
      if (s.selectedLayerId && !doc.layers.some((l) => l.id === s.selectedLayerId)) es.patch({ selectedLayerId: null });
    },
  );

  const onKey = (e: KeyboardEvent) => {
    try {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (!root.isConnected || root.getClientRects().length === 0) return;
      const p = ctx.project;
      const count = resolveFrameCount(p.animation.fps, p.animation.duration, p.frames).count;
      const key = e.key.toLowerCase();
      if (e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) ctx.store.update((q) => ({ ...q, ui: { ...q.ui, playing: !q.ui.playing } }));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const idx = frameOfTime(p.ui.time, count, p.animation.duration) + (e.key === 'ArrowLeft' ? -1 : 1);
        ctx.store.update((q) => ({ ...q, ui: { ...q.ui, playing: false, time: timeOfFrame(idx, count, q.animation.duration) } }));
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const s = es.get();
        if (s.selectedItemId) {
          e.preventDefault();
          ctx.setAnimation(removeItem(p.animation, s.selectedItemId));
          es.patch({ selectedItemId: null, selectedKey: null });
        }
      } else if (e.key === 'Escape') {
        canvas.cancelShape();
        es.patch({ selectedItemId: null, selectedKey: null, tool: 'select' });
      } else if (e.key === 'Enter') {
        canvas.finishShape();
      } else if (KEY_TOOLS[key] && !e.metaKey && !e.ctrlKey && !e.altKey) {
        canvas.cancelShape();
        es.patch({ tool: KEY_TOOLS[key] });
      } else if (key === 'f' && !e.metaKey && !e.ctrlKey) {
        canvas.fit();
      } else if (key === 'o' && !e.metaKey && !e.ctrlKey) {
        es.patch({ onionSkin: !es.get().onionSkin });
      }
    } catch (err) {
      console.error(err);
    }
  };
  window.addEventListener('keydown', onKey);

  return {
    editor: es,
    resize() {
      canvas.resize();
      canvas.fit();
    },
    fit() {
      canvas.fit();
    },
    dispose() {
      unTick();
      unSel();
      window.removeEventListener('keydown', onKey);
      canvas.dispose();
      for (const p of parts) p.dispose();
      root.replaceChildren();
      root.classList.remove('studio-root');
    },
  };
}

function hasItem(items: { id: string; type: string; children?: unknown }[], id: string): boolean {
  for (const it of items) {
    if (it.id === id) return true;
    if (it.type === 'group' && Array.isArray(it.children) && hasItem(it.children as typeof items, id)) return true;
  }
  return false;
}
