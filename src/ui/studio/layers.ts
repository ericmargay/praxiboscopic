// Panel de capas y objetos: árbol capa → elementos (grupos desplegables), visibilidad, bloqueo, renombrar con doble
// clic, añadir/borrar/reordenar capas, selección. Las capas procedurales muestran su etiqueta y el botón "Hornear".
import type { AppContext } from '../../app/context';
import { makeLayer, removeItem, uid, walkItems, type AnimationDoc, type Item, type Layer } from '../../animation/model';
import { bakeGenerator } from '../../animation/procedural';
import { button, el } from '../controls';
import type { EditorStore } from './state';
import { updateItem } from './tracks';

export function mountLayers(ctx: AppContext, es: EditorStore, root: HTMLElement): { dispose(): void } {
  root.classList.add('panel', 'layers-panel');
  const head = el('h3', { text: 'Capas y objetos' });
  const body = el('div', { class: 'panel-body layers-body' });
  const actions = el('div', { class: 'btn-row layers-actions' });
  root.append(head, actions, body);
  const expanded = new Set<string>();

  actions.append(
    button('+ Capa', () => {
      const doc = ctx.project.animation;
      const layer = makeLayer(`Capa ${doc.layers.length + 1}`);
      ctx.setAnimation({ ...doc, layers: [...doc.layers, layer] });
      es.patch({ selectedLayerId: layer.id });
    }, { kind: 'ghost', title: 'Añadir capa vacía' }),
    button('+ Grupo', () => {
      const doc = ctx.project.animation;
      const s = es.get();
      const layer = doc.layers.find((l) => l.id === s.selectedLayerId) ?? doc.layers[doc.layers.length - 1];
      if (!layer) return;
      const grp: Item = { id: uid('grp'), name: 'Grupo', type: 'group', transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1 }, style: {}, children: [] };
      ctx.setAnimation({ ...doc, layers: doc.layers.map((l) => (l.id === layer.id ? { ...l, items: [...l.items, grp] } : l)) });
    }, { kind: 'ghost', title: 'Añadir grupo en la capa seleccionada' }),
    button('Borrar', () => {
      const doc = ctx.project.animation;
      const s = es.get();
      if (s.selectedItemId) {
        ctx.setAnimation(removeItem(doc, s.selectedItemId));
        es.patch({ selectedItemId: null, selectedKey: null });
      } else if (s.selectedLayerId) {
        ctx.setAnimation({ ...doc, layers: doc.layers.filter((l) => l.id !== s.selectedLayerId) });
        es.patch({ selectedLayerId: null });
      }
    }, { kind: 'danger', title: 'Borrar el elemento o la capa seleccionada (Supr)' }),
  );

  function render(): void {
    const doc = ctx.project.animation;
    const s = es.get();
    body.replaceChildren();
    if (!doc.layers.length) body.append(el('div', { class: 'hint', text: 'Sin capas. Añade una capa o carga una animación de la biblioteca.' }));
    // de arriba (última, encima) a abajo
    [...doc.layers].reverse().forEach((layer) => body.append(layerRow(doc, layer, s)));
  }

  function layerRow(doc: AnimationDoc, layer: Layer, s: ReturnType<EditorStore['get']>): HTMLElement {
    const idx = doc.layers.indexOf(layer);
    const row = el('div', { class: `layer-row${layer.id === s.selectedLayerId && !s.selectedItemId ? ' selected' : ''}` });
    const eye = iconBtn(layer.visible ? '👁' : '◌', 'Visible', () => ctx.setAnimation({ ...doc, layers: doc.layers.map((l) => (l.id === layer.id ? { ...l, visible: !l.visible } : l)) }));
    const lock = iconBtn(layer.locked ? '🔒' : '🔓', 'Bloquear', () => ctx.setAnimation({ ...doc, layers: doc.layers.map((l) => (l.id === layer.id ? { ...l, locked: !l.locked } : l)) }));
    const name = el('span', { class: 'layer-name', text: layer.name, title: 'Doble clic para renombrar' });
    name.addEventListener('dblclick', () => rename(name, layer.name, (v) => ctx.setAnimation({ ...doc, layers: doc.layers.map((l) => (l.id === layer.id ? { ...l, name: v } : l)) })));
    const up = iconBtn('▲', 'Subir', () => ctx.setAnimation({ ...doc, layers: swap(doc.layers, idx, idx + 1) }));
    const down = iconBtn('▼', 'Bajar', () => ctx.setAnimation({ ...doc, layers: swap(doc.layers, idx, idx - 1) }));
    row.append(eye, lock, name);
    if (layer.procedural) {
      row.append(el('span', { class: 'tag', text: 'procedural', title: 'Generada por el generador procedural: se regenera al cambiar sus parámetros' }));
      row.append(button('Hornear', () => ctx.setAnimation(bakeGenerator(doc)), { kind: 'ghost', title: 'Convertir las capas procedurales en capas normales editables' }));
    }
    row.append(up, down);
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      es.patch({ selectedLayerId: layer.id, selectedItemId: null, selectedKey: null });
    });
    const wrapper = el('div', { class: 'layer-block' }, row);
    const list = el('div', { class: 'item-list' });
    for (const it of [...layer.items].reverse()) list.append(itemRow(doc, layer, it, 0, s));
    wrapper.append(list);
    return wrapper;
  }

  function itemRow(doc: AnimationDoc, layer: Layer, item: Item, depth: number, s: ReturnType<EditorStore['get']>): HTMLElement {
    const row = el('div', { class: `item-row${item.id === s.selectedItemId ? ' selected' : ''}`, style: `padding-left:${8 + depth * 14}px` });
    const isGroup = item.type === 'group';
    const caret = isGroup ? iconBtn(expanded.has(item.id) ? '▾' : '▸', 'Desplegar', () => {
      if (expanded.has(item.id)) expanded.delete(item.id);
      else expanded.add(item.id);
      render();
    }) : el('span', { class: 'caret-space' });
    const eye = iconBtn(item.visible === false ? '◌' : '👁', 'Visible', () => ctx.setAnimation(updateItem(doc, item.id, (it) => ({ ...it, visible: it.visible === false ? true : false }))));
    const lock = iconBtn(item.locked ? '🔒' : '🔓', 'Bloquear', () => ctx.setAnimation(updateItem(doc, item.id, (it) => ({ ...it, locked: !it.locked }))));
    const name = el('span', { class: 'item-name', text: item.name || item.type, title: 'Doble clic para renombrar' });
    name.addEventListener('dblclick', () => rename(name, item.name, (v) => ctx.setAnimation(updateItem(doc, item.id, (it) => ({ ...it, name: v })))));
    const type = el('span', { class: 'item-type', text: TYPE_LABELS[item.type] ?? item.type });
    row.append(caret, eye, lock, name, type);
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      es.patch({ selectedItemId: item.id, selectedLayerId: layer.id, selectedKey: null });
    });
    const block = el('div', {}, row);
    if (isGroup && expanded.has(item.id)) for (const c of [...item.children].reverse()) block.append(itemRow(doc, layer, c, depth + 1, s));
    return block;
  }

  function rename(span: HTMLElement, value: string, commit: (v: string) => void): void {
    const input = el('input', { type: 'text', value, class: 'ctl-text rename-input' }) as HTMLInputElement;
    span.replaceWith(input);
    input.focus();
    input.select();
    const done = () => {
      const v = input.value.trim();
      if (v && v !== value) commit(v);
      else render();
    };
    input.addEventListener('blur', done);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') {
        input.value = value;
        input.blur();
      }
      e.stopPropagation();
    });
  }

  const unsub1 = ctx.store.subscribe((p) => p.animation, () => render());
  const unsub2 = es.subscribe(() => render());
  render();
  return {
    dispose() {
      unsub1();
      unsub2();
    },
  };
}

const TYPE_LABELS: Record<string, string> = { circle: 'círculo', rect: 'rectángulo', polygon: 'polígono', line: 'línea', path: 'trazado', image: 'imagen', text: 'texto', group: 'grupo', model3d: '3D' };

function iconBtn(icon: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', { class: 'icon-btn', title, type: 'button', text: icon }) as HTMLButtonElement;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  if (i < 0 || j < 0 || i >= arr.length || j >= arr.length) return arr;
  const out = [...arr];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export { walkItems };
