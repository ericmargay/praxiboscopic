// Lienzo de edición 2D: pinta el documento en el instante actual (con onion skin), permite seleccionar, mover,
// escalar y rotar elementos, dibujar formas (círculo, rectángulo, polígono, línea, trazado Bézier, texto) e insertar
// imágenes y modelos 3D. Las escrituras pasan por `ctx.setAnimation` con documentos nuevos; en modo "editar
// fotograma" van a frameOverrides del fotograma actual.
import type { AppContext } from '../../app/context';
import { evaluate, hitTest, invert, mul, nodeBBox, resolveTransform, transformMatrix, type DisplayList, type EvalContext, type Mat2D } from '../../animation/evaluate';
import { identityTransform, makeLayer, uid, walkItems, type AnimationDoc, type Item, type Layer, type Vec2 } from '../../animation/model';
import { renderDisplayList } from '../../animation/render2d';
import { resolveFrameCount } from '../../frames/settings';
import { fileToDataUrl, imageSize } from '../../host/browserCanvas';
import { button, checkbox, el, numberControl } from '../controls';
import { TOOL_ICONS, TOOL_LABELS, type EditorStore, type Tool } from './state';
import { frameHasOverrides, frameOfTime, setOverride, setTrackValueAt, timeOfFrame, valueAt, clearFrameOverrides } from './tracks';

const TOOLS: Tool[] = ['select', 'circle', 'rect', 'polygon', 'line', 'path', 'text', 'image', 'model3d'];
const HANDLE = 7;

type Drag =
  | { mode: 'pan'; startX: number; startY: number; ox: number; oy: number }
  | { mode: 'move'; itemId: string; start: Vec2; startDoc: AnimationDoc; sx: number; sy: number; parent: Mat2D }
  | { mode: 'scale'; itemId: string; start: Vec2; startDoc: AnimationDoc; center: Vec2; sx: number; sy: number }
  | { mode: 'rotate'; itemId: string; start: Vec2; startDoc: AnimationDoc; center: Vec2; rot: number }
  | { mode: 'create'; tool: 'circle' | 'rect' | 'line'; start: Vec2; current: Vec2 }
  | { mode: 'pathHandle'; anchor: number; current: Vec2 };

interface Anchor {
  p: Vec2;
  in: Vec2;
  out: Vec2;
}

export interface CanvasView {
  root: HTMLElement;
  redraw(): void;
  resize(): void;
  fit(): void;
  /** termina la forma en curso (polígono / trazado) */
  finishShape(): void;
  cancelShape(): void;
  dispose(): void;
}

export function mountCanvas(ctx: AppContext, es: EditorStore, root: HTMLElement): CanvasView {
  const toolbar = el('div', { class: 'studio-toolbar' });
  const wrap = el('div', { class: 'studio-canvas-wrap' });
  const canvas = el('canvas', { class: 'studio-canvas' }) as HTMLCanvasElement;
  const badge = el('div', { class: 'studio-badge', style: 'display:none' });
  const status = el('div', { class: 'studio-status hint' });
  wrap.append(canvas, badge);
  root.append(toolbar, wrap, status);
  const g = canvas.getContext('2d')!;

  let drag: Drag | null = null;
  let polyPoints: Vec2[] = [];
  let anchors: Anchor[] = [];
  let hover: Vec2 | null = null;
  let spaceDown = false;
  let raf = 0;
  const fileInput = el('input', { type: 'file', style: 'display:none' }) as HTMLInputElement;
  root.append(fileInput);

  // ------------------------------------------------------------------------------------------------- barra
  const toolButtons = new Map<Tool, HTMLButtonElement>();
  for (const t of TOOLS) {
    const b = el('button', { class: 'tool-btn', title: TOOL_LABELS[t], type: 'button', text: TOOL_ICONS[t] }) as HTMLButtonElement;
    b.addEventListener('click', () => setTool(t));
    toolButtons.set(t, b);
    toolbar.append(b);
  }
  toolbar.append(el('span', { class: 'toolbar-sep' }));
  toolbar.append(button('Ajustar', () => fit(), { kind: 'ghost', title: 'Encajar el lienzo en la vista' }));
  const onion = checkbox('Onion skin', es.get().onionSkin, (v) => es.patch({ onionSkin: v }), 'Fotogramas anteriores (rojo) y siguientes (verde)');
  const onionN = numberControl({ label: '', value: es.get().onionCount, min: 1, max: 3, step: 1, noSlider: true, onChange: (v) => es.patch({ onionCount: Math.round(v) }) });
  onionN.root.classList.add('ctl-inline');
  const autoKey = checkbox('Auto-key', es.get().autoKey, (v) => es.patch({ autoKey: v }), 'Al mover un elemento animado, crea o reemplaza el keyframe en el instante actual');
  const frameEdit = checkbox('Editar fotograma individual', es.get().frameEdit, (v) => es.patch({ frameEdit: v }), 'Las ediciones se aplican solo al fotograma actual (frameOverrides)');
  const clearBtn = button('Limpiar ediciones del fotograma', () => {
    const p = ctx.project;
    ctx.setAnimation(clearFrameOverrides(p.animation, currentFrame().index));
  }, { kind: 'ghost' });
  toolbar.append(onion.root, onionN.root, autoKey.root, frameEdit.root, clearBtn);

  function setTool(t: Tool): void {
    cancelShape();
    es.patch({ tool: t });
    if (t === 'image' || t === 'model3d') openFile(t);
  }

  function openFile(t: 'image' | 'model3d'): void {
    fileInput.accept = t === 'image' ? 'image/png,image/jpeg,image/svg+xml,image/webp,image/gif' : '.glb,.gltf,model/gltf-binary,model/gltf+json';
    fileInput.value = '';
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const src = await fileToDataUrl(file);
        const doc = ctx.project.animation;
        const center = { x: doc.width / 2, y: doc.height / 2 };
        if (t === 'image') {
          const size = await imageSize(src).catch(() => ({ width: 200, height: 200 }));
          const k = Math.min(1, (doc.width * 0.6) / size.width, (doc.height * 0.6) / size.height);
          insertItem({ id: uid('img'), name: file.name, type: 'image', src, w: size.width * k, h: size.height * k, transform: identityTransform(), style: {} }, center);
        } else {
          insertItem(
            {
              id: uid('m3d'),
              name: file.name,
              type: 'model3d',
              src,
              w: Math.round(doc.width * 0.5),
              h: Math.round(doc.height * 0.6),
              camera: { fovDeg: 35, distance: 1.2, elevationDeg: 15, azimuthDeg: 0 },
              modelRotationY: { expr: { kind: 'saw', from: 0, to: 360, cycles: 1 } },
              transform: identityTransform(),
              style: {},
            },
            center,
          );
        }
        es.setStatus(`${file.name} insertado.`);
      } catch (e) {
        es.setStatus(`No se pudo leer el archivo: ${e instanceof Error ? e.message : e}`);
      } finally {
        es.patch({ tool: 'select' });
      }
    };
    fileInput.click();
  }

  // ------------------------------------------------------------------------------------------------- tiempo
  function evalCtx(doc: AnimationDoc): EvalContext {
    return { t: ctx.project.ui.time, duration: doc.duration, loop: doc.loop };
  }

  function currentFrame(): { index: number; count: number } {
    const p = ctx.project;
    const count = resolveFrameCount(p.animation.fps, p.animation.duration, p.frames).count;
    return { index: frameOfTime(p.ui.time, count, p.animation.duration), count };
  }

  // ------------------------------------------------------------------------------------------------- vista
  function cssSize(): { w: number; h: number } {
    return { w: wrap.clientWidth || 1, h: wrap.clientHeight || 1 };
  }

  function toDoc(px: number, py: number): Vec2 {
    const v = es.get().view;
    return { x: (px - v.ox) / v.scale, y: (py - v.oy) / v.scale };
  }

  function toScreen(p: Vec2): Vec2 {
    const v = es.get().view;
    return { x: v.ox + p.x * v.scale, y: v.oy + p.y * v.scale };
  }

  function fit(): void {
    const doc = ctx.project.animation;
    const { w, h } = cssSize();
    const scale = Math.max(0.05, Math.min((w - 48) / doc.width, (h - 48) / doc.height));
    es.patch({ view: { scale, ox: (w - doc.width * scale) / 2, oy: (h - doc.height * scale) / 2 } });
  }

  function resize(): void {
    const { w, h } = cssSize();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    redraw();
  }

  function pointerPos(e: PointerEvent | MouseEvent): Vec2 {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ------------------------------------------------------------------------------------------------- pintado
  function redraw(): void {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      try {
        paint();
      } catch (e) {
        console.error(e);
      }
    });
  }

  function paint(): void {
    const p = ctx.project;
    const doc = p.animation;
    const s = es.get();
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = cssSize();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#dfe6e9';
    g.fillRect(0, 0, w, h);
    const v = s.view;
    const dx = v.ox;
    const dy = v.oy;
    const dw = doc.width * v.scale;
    const dh = doc.height * v.scale;
    // fondo del lienzo
    g.save();
    g.beginPath();
    g.rect(dx, dy, dw, dh);
    g.clip();
    if (doc.background.transparent) {
      const c = 12;
      for (let y = 0; y < dh + c; y += c) for (let x = 0; x < dw + c; x += c) {
        g.fillStyle = ((x / c + y / c) | 0) % 2 ? '#e6ecee' : '#f7f9fa';
        g.fillRect(dx + x, dy + y, c, c);
      }
    } else {
      g.fillStyle = doc.background.color;
      g.fillRect(dx, dy, dw, dh);
    }
    const { index, count } = currentFrame();
    const t = p.ui.time;
    // onion skin
    if (s.onionSkin && count > 1) {
      for (let k = s.onionCount; k >= 1; k--) {
        const alpha = 0.28 / k;
        const prev = evaluate(doc, timeOfFrame(index - k, count, doc.duration), { frameIndex: ((index - k) % count + count) % count });
        const next = evaluate(doc, timeOfFrame(index + k, count, doc.duration), { frameIndex: (index + k) % count });
        renderDisplayList(g, prev, { scale: v.scale, offsetX: dx, offsetY: dy, resources: ctx.resources, globalAlpha: alpha, tint: '#ff5a5a', forceBackground: null });
        renderDisplayList(g, next, { scale: v.scale, offsetX: dx, offsetY: dy, resources: ctx.resources, globalAlpha: alpha, tint: '#4fdc8a', forceBackground: null });
      }
    }
    const list = evaluate(doc, t, { frameIndex: index });
    renderDisplayList(g, list, { scale: v.scale, offsetX: dx, offsetY: dy, resources: ctx.resources, forceBackground: null });
    g.restore();
    // borde del lienzo
    g.strokeStyle = '#9fb2ba';
    g.lineWidth = 1;
    g.strokeRect(dx + 0.5, dy + 0.5, dw, dh);
    // selección
    if (s.selectedItemId) drawSelection(list, s.selectedItemId, doc);
    drawInProgress();
    // badge
    const edited = frameHasOverrides(doc, index);
    badge.style.display = s.frameEdit || edited ? 'block' : 'none';
    badge.textContent = edited ? `Fotograma ${index + 1} editado` : `Editando fotograma ${index + 1}`;
    badge.classList.toggle('edited', edited);
    status.textContent = `${s.status}${s.status ? ' · ' : ''}t = ${t.toFixed(3)} s · fotograma ${index + 1}/${count} · zoom ${(v.scale * 100).toFixed(0)} %`;
  }

  function selectedBBox(list: DisplayList, itemId: string, doc: AnimationDoc): { minX: number; minY: number; maxX: number; maxY: number } | null {
    const ids = descendantIds(doc, itemId);
    let bb: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
    for (const n of list.nodes) {
      if (!ids.has(n.itemId)) continue;
      const b = nodeBBox(n);
      bb = bb ? { minX: Math.min(bb.minX, b.minX), minY: Math.min(bb.minY, b.minY), maxX: Math.max(bb.maxX, b.maxX), maxY: Math.max(bb.maxY, b.maxY) } : b;
    }
    return bb;
  }

  function drawSelection(list: DisplayList, itemId: string, doc: AnimationDoc): void {
    const bb = selectedBBox(list, itemId, doc);
    if (!bb) return;
    const a = toScreen({ x: bb.minX, y: bb.minY });
    const b = toScreen({ x: bb.maxX, y: bb.maxY });
    g.save();
    g.strokeStyle = '#2a6fb5';
    g.lineWidth = 1;
    g.setLineDash([4, 3]);
    g.strokeRect(a.x + 0.5, a.y + 0.5, b.x - a.x, b.y - a.y);
    g.setLineDash([]);
    g.fillStyle = '#ffffff';
    for (const c of corners(a, b)) {
      g.fillRect(c.x - HANDLE / 2, c.y - HANDLE / 2, HANDLE, HANDLE);
      g.strokeRect(c.x - HANDLE / 2 + 0.5, c.y - HANDLE / 2 + 0.5, HANDLE - 1, HANDLE - 1);
    }
    const cx = (a.x + b.x) / 2;
    g.beginPath();
    g.moveTo(cx, a.y);
    g.lineTo(cx, a.y - 22);
    g.stroke();
    g.beginPath();
    g.arc(cx, a.y - 26, 5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.restore();
  }

  function corners(a: Vec2, b: Vec2): Vec2[] {
    return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
  }

  function drawInProgress(): void {
    g.save();
    g.strokeStyle = '#1b6c86';
    g.fillStyle = 'rgba(27,108,134,0.12)';
    g.lineWidth = 1.5;
    if (drag?.mode === 'create') {
      const a = toScreen(drag.start);
      const b = toScreen(drag.current);
      if (drag.tool === 'line') {
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
      } else if (drag.tool === 'rect') {
        g.beginPath();
        g.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        g.fill();
        g.stroke();
      } else {
        g.beginPath();
        g.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
    }
    if (polyPoints.length) {
      g.beginPath();
      polyPoints.forEach((p, i) => {
        const s = toScreen(p);
        if (i === 0) g.moveTo(s.x, s.y);
        else g.lineTo(s.x, s.y);
      });
      if (hover) {
        const hs = toScreen(hover);
        g.lineTo(hs.x, hs.y);
      }
      g.stroke();
      for (const p of polyPoints) {
        const s = toScreen(p);
        g.fillStyle = '#1b6c86';
        g.fillRect(s.x - 3, s.y - 3, 6, 6);
      }
    }
    if (anchors.length) {
      g.beginPath();
      anchors.forEach((a, i) => {
        const s = toScreen(a.p);
        if (i === 0) g.moveTo(s.x, s.y);
        else {
          const prev = anchors[i - 1];
          const c1 = toScreen(prev.out);
          const c2 = toScreen(a.in);
          g.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, s.x, s.y);
        }
      });
      if (hover && drag?.mode !== 'pathHandle') {
        const last = anchors[anchors.length - 1];
        const c1 = toScreen(last.out);
        const hs = toScreen(hover);
        g.bezierCurveTo(c1.x, c1.y, hs.x, hs.y, hs.x, hs.y);
      }
      g.stroke();
      g.strokeStyle = '#2a6fb5';
      for (const a of anchors) {
        const s = toScreen(a.p);
        const i = toScreen(a.in);
        const o = toScreen(a.out);
        g.beginPath();
        g.moveTo(i.x, i.y);
        g.lineTo(o.x, o.y);
        g.stroke();
        g.fillStyle = '#ffffff';
        g.fillRect(s.x - 3, s.y - 3, 6, 6);
        g.fillStyle = '#2a6fb5';
        g.fillRect(i.x - 2, i.y - 2, 4, 4);
        g.fillRect(o.x - 2, o.y - 2, 4, 4);
      }
    }
    g.restore();
  }

  // ------------------------------------------------------------------------------------------------- edición
  function targetLayer(doc: AnimationDoc): { doc: AnimationDoc; layer: Layer } {
    const s = es.get();
    let layer = doc.layers.find((l) => l.id === s.selectedLayerId && !l.locked);
    if (!layer && s.selectedItemId) layer = doc.layers.find((l) => [...walkItems(l.items)].some((it) => it.id === s.selectedItemId) && !l.locked);
    if (!layer) layer = [...doc.layers].reverse().find((l) => l.visible && !l.locked && !l.procedural) ?? [...doc.layers].reverse().find((l) => l.visible && !l.locked);
    if (!layer) {
      layer = makeLayer('Dibujo');
      return { doc: { ...doc, layers: [...doc.layers, layer] }, layer };
    }
    return { doc, layer };
  }

  /** inserta un elemento en la capa de destino colocándolo en `docPoint` (coordenadas del lienzo) */
  function insertItem(item: Item, docPoint: Vec2): void {
    const base = ctx.project.animation;
    const { doc, layer } = targetLayer(base);
    const lm = transformMatrix(resolveTransform(layer.transform, evalCtx(doc)));
    const local = applyMat(invert(lm), docPoint);
    const placed: Item = { ...item, transform: { ...item.transform, x: local.x, y: local.y } };
    const next: AnimationDoc = { ...doc, layers: doc.layers.map((l) => (l.id === layer.id ? { ...l, items: [...l.items, placed] } : l)) };
    ctx.setAnimation(next);
    es.patch({ selectedItemId: placed.id, selectedLayerId: layer.id });
  }

  function finishShape(): void {
    const s = es.get();
    if (s.tool === 'polygon' && polyPoints.length >= 2) {
      const c = centroid(polyPoints);
      const pts = polyPoints.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
      const closed = polyPoints.length >= 3;
      insertItem({ id: uid('poly'), name: closed ? 'Polígono' : 'Polilínea', type: 'polygon', points: pts, closed, transform: identityTransform(), style: closed ? { fill: '#13242c' } : { fill: null, stroke: '#13242c', strokeWidth: 3 } }, c);
    } else if (s.tool === 'path' && anchors.length >= 2) {
      const c = centroid(anchors.map((a) => a.p));
      const rel = (p: Vec2) => ({ x: p.x - c.x, y: p.y - c.y });
      const pts: Vec2[] = [rel(anchors[0].p)];
      for (let i = 1; i < anchors.length; i++) pts.push(rel(anchors[i - 1].out), rel(anchors[i].in), rel(anchors[i].p));
      insertItem({ id: uid('path'), name: 'Trazado', type: 'path', points: pts, closed: false, transform: identityTransform(), style: { fill: null, stroke: '#13242c', strokeWidth: 3 } }, c);
    }
    polyPoints = [];
    anchors = [];
    redraw();
  }

  function cancelShape(): void {
    polyPoints = [];
    anchors = [];
    drag = null;
    redraw();
  }

  function centroid(pts: Vec2[]): Vec2 {
    const n = Math.max(1, pts.length);
    return { x: pts.reduce((a, p) => a + p.x, 0) / n, y: pts.reduce((a, p) => a + p.y, 0) / n };
  }

  /** escribe x/y (o escala/rotación) del elemento a partir del documento de inicio del arrastre */
  function writeTransform(startDoc: AnimationDoc, itemId: string, values: Partial<Record<'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation', number>>): void {
    const s = es.get();
    const { index } = currentFrame();
    let doc = startDoc;
    const found = findItemIn(doc, itemId);
    if (!found) return;
    if (s.frameEdit) {
      doc = setOverride(doc, index, itemId, (o) => ({ ...o, transform: { ...(o.transform ?? {}), ...values } }));
    } else {
      const ectx = evalCtx(doc);
      let note = '';
      let item = found;
      for (const [k, v] of Object.entries(values) as [keyof typeof values, number][]) {
        const r = setTrackValueAt(item.transform[k], ectx.t, v, s.autoKey, ectx);
        if (r.note) note = r.note;
        item = { ...item, transform: { ...item.transform, [k]: r.track } };
      }
      const final = item;
      doc = { ...doc, layers: doc.layers.map((l) => ({ ...l, items: replaceItem(l.items, itemId, final) })) };
      if (note) es.setStatus(note);
    }
    ctx.setAnimation(doc);
  }

  // ------------------------------------------------------------------------------------------------- punteros
  canvas.addEventListener('pointerdown', (e) => {
    try {
      onDown(e);
    } catch (err) {
      console.error(err);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    try {
      onMove(e);
    } catch (err) {
      console.error(err);
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    try {
      onUp(e);
    } catch (err) {
      console.error(err);
    }
  });
  canvas.addEventListener('dblclick', () => finishShape());
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const v = es.get().view;
    const p = pointerPos(e);
    const factor = Math.exp(-e.deltaY * 0.0015);
    const scale = Math.max(0.05, Math.min(40, v.scale * factor));
    const k = scale / v.scale;
    es.patch({ view: { scale, ox: p.x - (p.x - v.ox) * k, oy: p.y - (p.y - v.oy) * k } });
  }, { passive: false });

  function onDown(e: PointerEvent): void {
    canvas.setPointerCapture(e.pointerId);
    canvas.focus();
    const sp = pointerPos(e);
    const dp = toDoc(sp.x, sp.y);
    const s = es.get();
    const doc = ctx.project.animation;
    if (e.button === 1 || spaceDown || (e.button === 0 && e.altKey)) {
      drag = { mode: 'pan', startX: sp.x, startY: sp.y, ox: s.view.ox, oy: s.view.oy };
      return;
    }
    if (e.button !== 0) return;
    switch (s.tool) {
      case 'select': {
        const { index } = currentFrame();
        const list = evaluate(doc, ctx.project.ui.time, { frameIndex: index });
        // asas de la selección actual
        if (s.selectedItemId) {
          const bb = selectedBBox(list, s.selectedItemId, doc);
          if (bb) {
            const a = toScreen({ x: bb.minX, y: bb.minY });
            const b = toScreen({ x: bb.maxX, y: bb.maxY });
            const center = { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 };
            const item = findItemIn(doc, s.selectedItemId);
            const ectx = evalCtx(doc);
            if (item && !isLocked(doc, item.id)) {
              const cx = (a.x + b.x) / 2;
              if (Math.hypot(sp.x - cx, sp.y - (a.y - 26)) <= 8) {
                drag = { mode: 'rotate', itemId: item.id, start: dp, startDoc: doc, center, rot: currentValue(doc, item, 'rotation', ectx) };
                return;
              }
              for (const c of corners(a, b)) {
                if (Math.abs(sp.x - c.x) <= HANDLE && Math.abs(sp.y - c.y) <= HANDLE) {
                  drag = { mode: 'scale', itemId: item.id, start: dp, startDoc: doc, center, sx: currentValue(doc, item, 'scaleX', ectx), sy: currentValue(doc, item, 'scaleY', ectx) };
                  return;
                }
              }
            }
          }
        }
        const hit = hitTest(list, dp);
        if (hit) {
          const item = findItemIn(doc, hit.itemId);
          es.patch({ selectedItemId: hit.itemId, selectedLayerId: hit.layerId, selectedKey: null });
          if (item && !isLocked(doc, item.id)) {
            const ectx = evalCtx(doc);
            drag = { mode: 'move', itemId: item.id, start: dp, startDoc: doc, sx: currentValue(doc, item, 'x', ectx), sy: currentValue(doc, item, 'y', ectx), parent: parentMatrixOf(doc, item.id, ectx) };
          }
        } else es.patch({ selectedItemId: null, selectedKey: null });
        break;
      }
      case 'circle':
      case 'rect':
      case 'line':
        drag = { mode: 'create', tool: s.tool, start: dp, current: dp };
        break;
      case 'polygon':
        polyPoints = [...polyPoints, dp];
        redraw();
        break;
      case 'path': {
        anchors = [...anchors, { p: dp, in: dp, out: dp }];
        drag = { mode: 'pathHandle', anchor: anchors.length - 1, current: dp };
        redraw();
        break;
      }
      case 'text': {
        const text = window.prompt('Texto:', 'Texto');
        if (text) insertItem({ id: uid('txt'), name: text.slice(0, 20), type: 'text', text, fontSize: Math.max(12, Math.round(doc.height / 8)), font: 'sans-serif', transform: identityTransform(), style: { fill: '#13242c' } }, dp);
        es.patch({ tool: 'select' });
        break;
      }
      case 'image':
      case 'model3d':
        openFile(s.tool);
        break;
    }
  }

  function onMove(e: PointerEvent): void {
    const sp = pointerPos(e);
    const dp = toDoc(sp.x, sp.y);
    hover = dp;
    const s = es.get();
    canvas.style.cursor = spaceDown || drag?.mode === 'pan' ? 'grab' : s.tool === 'select' ? 'default' : 'crosshair';
    if (!drag) {
      if (polyPoints.length || anchors.length) redraw();
      return;
    }
    switch (drag.mode) {
      case 'pan':
        es.patch({ view: { ...s.view, ox: drag.ox + (sp.x - drag.startX), oy: drag.oy + (sp.y - drag.startY) } });
        break;
      case 'create':
        drag.current = e.shiftKey ? square(drag.start, dp) : dp;
        redraw();
        break;
      case 'pathHandle': {
        drag.current = dp;
        const a = anchors[drag.anchor];
        if (a) {
          a.out = dp;
          a.in = { x: 2 * a.p.x - dp.x, y: 2 * a.p.y - dp.y };
        }
        redraw();
        break;
      }
      case 'move': {
        const dx = dp.x - drag.start.x;
        const dy = dp.y - drag.start.y;
        const inv = invert(drag.parent);
        const lx = inv[0] * dx + inv[2] * dy;
        const ly = inv[1] * dx + inv[3] * dy;
        writeTransform(drag.startDoc, drag.itemId, { x: drag.sx + lx, y: drag.sy + ly });
        break;
      }
      case 'scale': {
        const v0 = { x: drag.start.x - drag.center.x, y: drag.start.y - drag.center.y };
        const v1 = { x: dp.x - drag.center.x, y: dp.y - drag.center.y };
        let fx = Math.abs(v0.x) > 1e-3 ? v1.x / v0.x : 1;
        let fy = Math.abs(v0.y) > 1e-3 ? v1.y / v0.y : 1;
        if (e.shiftKey) fx = fy = Math.max(fx, fy);
        writeTransform(drag.startDoc, drag.itemId, { scaleX: drag.sx * fx, scaleY: drag.sy * fy });
        break;
      }
      case 'rotate': {
        const a0 = Math.atan2(drag.start.y - drag.center.y, drag.start.x - drag.center.x);
        const a1 = Math.atan2(dp.y - drag.center.y, dp.x - drag.center.x);
        let deg = ((a1 - a0) * 180) / Math.PI;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        writeTransform(drag.startDoc, drag.itemId, { rotation: drag.rot + deg });
        break;
      }
    }
  }

  function onUp(e: PointerEvent): void {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.mode === 'create') {
      const a = d.start;
      const b = e.shiftKey ? square(a, toDoc(pointerPos(e).x, pointerPos(e).y)) : toDoc(pointerPos(e).x, pointerPos(e).y);
      const w = Math.abs(b.x - a.x);
      const h = Math.abs(b.y - a.y);
      if (w < 2 && h < 2) {
        redraw();
        return;
      }
      const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (d.tool === 'circle') insertItem({ id: uid('circ'), name: 'Círculo', type: 'circle', rx: w / 2, ry: h / 2, transform: identityTransform(), style: { fill: '#13242c' } }, c);
      else if (d.tool === 'rect') insertItem({ id: uid('rect'), name: 'Rectángulo', type: 'rect', w, h, transform: identityTransform(), style: { fill: '#13242c' } }, c);
      else insertItem({ id: uid('line'), name: 'Línea', type: 'line', x1: a.x - c.x, y1: a.y - c.y, x2: b.x - c.x, y2: b.y - c.y, transform: identityTransform(), style: { fill: null, stroke: '#13242c', strokeWidth: 3 } }, c);
    }
    redraw();
  }

  function square(a: Vec2, b: Vec2): Vec2 {
    const d = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    return { x: a.x + Math.sign(b.x - a.x || 1) * d, y: a.y + Math.sign(b.y - a.y || 1) * d };
  }

  // ------------------------------------------------------------------------------------------------- teclado
  const onKey = (e: KeyboardEvent) => {
    if (e.key === ' ') spaceDown = e.type === 'keydown';
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  // ------------------------------------------------------------------------------------------------- suscripciones
  const unsubStore = ctx.store.onChange(() => redraw());
  const unsubEs = es.subscribe((s) => {
    for (const [t, b] of toolButtons) b.classList.toggle('active', t === s.tool);
    onion.set(s.onionSkin);
    onionN.set(s.onionCount);
    autoKey.set(s.autoKey);
    frameEdit.set(s.frameEdit);
    redraw();
  });
  const ro = new ResizeObserver(() => resize());
  ro.observe(wrap);
  canvas.tabIndex = 0;
  requestAnimationFrame(() => {
    resize();
    fit();
  });

  return {
    root,
    redraw,
    resize,
    fit,
    finishShape,
    cancelShape,
    dispose() {
      unsubStore();
      unsubEs();
      ro.disconnect();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      if (raf) cancelAnimationFrame(raf);
    },
  };

  // ------------------------------------------------------------------------------------------------- helpers
  function currentValue(doc: AnimationDoc, item: Item, key: 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation', ectx: EvalContext): number {
    const s = es.get();
    if (s.frameEdit) {
      const ov = overrideNum(doc, item.id, key);
      if (ov !== undefined) return ov;
    }
    return valueAt(item, `transform.${key}`, ectx, key === 'scaleX' || key === 'scaleY' ? 1 : 0);
  }

  function overrideNum(doc: AnimationDoc, itemId: string, key: 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity'): number | undefined {
    const { index } = currentFrame();
    const o = (doc.frameOverrides[String(index)] ?? []).find((x) => x.itemId === itemId);
    return o?.transform?.[key];
  }
}

// ---------------------------------------------------------------------------------------------------------------
// funciones puras auxiliares

export function findItemIn(doc: AnimationDoc, id: string): Item | null {
  for (const l of doc.layers) for (const it of walkItems(l.items)) if (it.id === id) return it;
  return null;
}

export function isLocked(doc: AnimationDoc, itemId: string): boolean {
  for (const l of doc.layers) {
    for (const it of walkItems(l.items)) {
      if (it.id === itemId) return !!l.locked || !!it.locked;
    }
  }
  return false;
}

/** ids del elemento y de todos sus descendientes */
export function descendantIds(doc: AnimationDoc, itemId: string): Set<string> {
  const out = new Set<string>([itemId]);
  const item = findItemIn(doc, itemId);
  if (item?.type === 'group') for (const it of walkItems(item.children)) out.add(it.id);
  return out;
}

/** matriz capa→lienzo acumulada hasta el padre del elemento (capa + grupos ancestros) */
export function parentMatrixOf(doc: AnimationDoc, itemId: string, ectx: EvalContext): Mat2D {
  for (const layer of doc.layers) {
    const lm = transformMatrix(resolveTransform(layer.transform, ectx));
    const found = search(layer.items, lm);
    if (found) return found;
  }
  return [1, 0, 0, 1, 0, 0];
  function search(items: Item[], parent: Mat2D): Mat2D | null {
    for (const it of items) {
      if (it.id === itemId) return parent;
      if (it.type === 'group') {
        const m = mul(parent, transformMatrix(resolveTransform(it.transform, ectx)));
        const r = search(it.children, m);
        if (r) return r;
      }
    }
    return null;
  }
}

export function replaceItem(items: Item[], id: string, next: Item): Item[] {
  return items.map((it) => (it.id === id ? next : it.type === 'group' ? { ...it, children: replaceItem(it.children, id, next) } : it));
}

function applyMat(m: Mat2D, p: Vec2): Vec2 {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}
