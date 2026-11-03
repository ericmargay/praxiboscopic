// Panel de propiedades: panel paramétrico del generador (si lo hay), propiedades del elemento seleccionado
// (nombre, visibilidad, transformación en el instante actual, estilo, deformaciones) y del documento. Se reconstruye
// solo cuando cambia la estructura (elemento, generador, tipo); los valores se refrescan sin perder el foco.
import type { AppContext } from '../../app/context';
import { resolveTransform, type EvalContext } from '../../animation/evaluate';
import type { AnimationDoc, Deform, Item, Track } from '../../animation/model';
import { fullParams, generatorById, type ParamDef } from '../../animation/procedural';
import { button, checkbox, colorControl, el, group, numberControl, selectControl, textControl } from '../controls';
import { findItemIn } from './canvas';
import type { EditorStore } from './state';
import { frameOfTime, overrideOf, setOverride, setPath, setTrackValueAt, trackKind, updateItem, valueAt } from './tracks';
import { resolveFrameCount } from '../../frames/settings';

const BLENDS: { value: string; label: string }[] = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiplicar' },
  { value: 'screen', label: 'Pantalla (aditivo)' },
  { value: 'overlay', label: 'Superponer' },
  { value: 'difference', label: 'Diferencia' },
  { value: 'lighter', label: 'Sumar' },
];

export function mountProperties(ctx: AppContext, es: EditorStore, root: HTMLElement): { dispose(): void } {
  root.classList.add('panel', 'props-panel');
  root.append(el('h3', { text: 'Propiedades' }));
  const body = el('div', { class: 'props-body' });
  root.append(body);
  let key = '';
  let refresh: (() => void)[] = [];

  function ectxOf(doc: AnimationDoc): EvalContext {
    return { t: ctx.project.ui.time, duration: doc.duration, loop: doc.loop };
  }

  function currentFrameIndex(doc: AnimationDoc): number {
    const p = ctx.project;
    return frameOfTime(p.ui.time, resolveFrameCount(doc.fps, doc.duration, p.frames).count, doc.duration);
  }

  function render(): void {
    const doc = ctx.project.animation;
    const s = es.get();
    const item = s.selectedItemId ? findItemIn(doc, s.selectedItemId) : null;
    const layer = s.selectedLayerId ? doc.layers.find((l) => l.id === s.selectedLayerId) : null;
    const k = `${doc.id}|${doc.generator?.id ?? ''}|${item?.id ?? ''}|${item?.type ?? ''}|${JSON.stringify(item ? deformKeys(item) : null)}|${item?.style.strokeWidth !== undefined}|${s.frameEdit}|${layer?.id ?? ''}|${!item && layer ? 'layer' : ''}`;
    if (k === key) {
      for (const r of refresh) r();
      return;
    }
    key = k;
    refresh = [];
    body.replaceChildren();
    if (doc.generator) body.append(generatorPanel(doc));
    if (item) body.append(itemPanel(doc, item));
    else if (layer) body.append(layerPanel(doc, layer));
    body.append(documentPanel(doc));
  }

  // ---------------------------------------------------------------------------------------------- generador
  function generatorPanel(doc: AnimationDoc): HTMLElement {
    const g = generatorById(doc.generator!.id);
    if (!g) return el('div', { class: 'hint', text: `Generador desconocido: ${doc.generator!.id}` });
    const params = fullParams(doc.generator!);
    const groups = new Map<string, ParamDef[]>();
    for (const p of g.params) {
      const gk = p.group ?? 'Parámetros';
      if (!groups.has(gk)) groups.set(gk, []);
      groups.get(gk)!.push(p);
    }
    const children: HTMLElement[] = [el('div', { class: 'hint', text: g.description })];
    if (doc.generator!.prompt) children.push(el('div', { class: 'hint prompt-echo', text: `«${doc.generator!.prompt}» · ${doc.generator!.engine ?? 'procedural'}` }));
    for (const [name, defs] of groups) {
      const controls = defs.map((d) => paramControl(d, params[d.key]));
      children.push(group(name, controls, { open: true }));
    }
    return el('div', { class: 'props-section' }, el('h4', { text: `Panel paramétrico · ${g.label}` }), ...children);
  }

  function paramControl(d: ParamDef, value: number | string | boolean | undefined): HTMLElement {
    const set = (v: number | string | boolean) => ctx.setGeneratorParams({ [d.key]: v });
    switch (d.type) {
      case 'number': {
        const c = numberControl({ label: d.label, value: Number(value ?? d.min ?? 0), min: d.min, max: d.max, step: d.step, unit: d.unit, help: d.help, onChange: set });
        refresh.push(() => {
          const g = ctx.project.animation.generator;
          if (g) c.set(Number(fullParams(g)[d.key]));
        });
        return c.root;
      }
      case 'color': {
        const c = colorControl(d.label, String(value ?? '#ffffff'), set);
        refresh.push(() => {
          const g = ctx.project.animation.generator;
          if (g) c.set(String(fullParams(g)[d.key]));
        });
        return c.root;
      }
      case 'select': {
        const c = selectControl<string>({ label: d.label, value: String(value ?? d.options?.[0]?.value ?? ''), options: d.options ?? [], onChange: set, help: d.help });
        refresh.push(() => {
          const g = ctx.project.animation.generator;
          if (g) c.set(String(fullParams(g)[d.key]));
        });
        return c.root;
      }
      case 'boolean': {
        const c = checkbox(d.label, Boolean(value), set, d.help);
        refresh.push(() => {
          const g = ctx.project.animation.generator;
          if (g) c.set(Boolean(fullParams(g)[d.key]));
        });
        return c.root;
      }
    }
  }

  // ---------------------------------------------------------------------------------------------- elemento
  function itemPanel(doc0: AnimationDoc, item0: Item): HTMLElement {
    const id = item0.id;
    const live = () => {
      const doc = ctx.project.animation;
      return { doc, item: findItemIn(doc, id) ?? item0 };
    };
    const name = textControl('Nombre', item0.name, (v) => {
      const { doc } = live();
      ctx.setAnimation(updateItem(doc, id, (it) => ({ ...it, name: v })));
    });
    const visible = checkbox('Visible', item0.visible !== false, (v) => {
      const { doc } = live();
      const s = es.get();
      if (s.frameEdit) ctx.setAnimation(setOverride(doc, currentFrameIndex(doc), id, (o) => ({ ...o, hidden: !v })));
      else ctx.setAnimation(updateItem(doc, id, (it) => ({ ...it, visible: v })));
    });
    refresh.push(() => {
      const { doc, item } = live();
      const s = es.get();
      const ov = s.frameEdit ? overrideOf(doc, currentFrameIndex(doc), id) : undefined;
      visible.set(ov?.hidden !== undefined ? !ov.hidden : item.visible !== false);
    });
    const frameNote = el('div', { class: 'hint frame-note' });
    refresh.push(() => {
      const s = es.get();
      frameNote.textContent = s.frameEdit ? `Modo fotograma: los cambios de transformación y color afectan solo al fotograma ${currentFrameIndex(ctx.project.animation) + 1}.` : '';
      frameNote.style.display = s.frameEdit ? 'block' : 'none';
    });

    const trCtl = (keyName: 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY' | 'opacity', label: string, step: number, min?: number, max?: number) => {
      const c = numberControl({
        label,
        value: 0,
        step,
        min,
        max,
        decimals: 3,
        noSlider: true,
        onChange: (v) => {
          const { doc, item } = live();
          const s = es.get();
          if (s.frameEdit) {
            ctx.setAnimation(setOverride(doc, currentFrameIndex(doc), id, (o) => ({ ...o, transform: { ...(o.transform ?? {}), [keyName]: v } })));
            return;
          }
          const ectx = ectxOf(doc);
          const r = setTrackValueAt(item.transform[keyName], ectx.t, v, s.autoKey, ectx);
          if (r.note) es.setStatus(r.note);
          ctx.setAnimation(updateItem(doc, id, (it) => ({ ...it, transform: { ...it.transform, [keyName]: r.track } })));
        },
      });
      const kindTag = el('span', { class: 'track-kind' });
      c.root.querySelector('.ctl-field')?.append(kindTag);
      refresh.push(() => {
        const { doc, item } = live();
        const s = es.get();
        const ov = s.frameEdit ? overrideOf(doc, currentFrameIndex(doc), id) : undefined;
        const r = resolveTransform(item.transform, ectxOf(doc), ov?.transform);
        c.set(r[keyName]);
        const kind = trackKind(item.transform[keyName]);
        kindTag.textContent = kind === 'keys' ? '◆' : kind === 'expr' ? '∿' : '';
        kindTag.title = kind === 'keys' ? 'Pista con keyframes' : kind === 'expr' ? 'Expresión procedural (editar en la línea de tiempo)' : '';
      });
      return c.root;
    };
    const anchorX = numberControl({ label: 'Anclaje X', value: item0.transform.anchorX ?? 0, step: 1, noSlider: true, onChange: (v) => ctx.setAnimation(updateItem(live().doc, id, (it) => ({ ...it, transform: { ...it.transform, anchorX: v } }))) });
    const anchorY = numberControl({ label: 'Anclaje Y', value: item0.transform.anchorY ?? 0, step: 1, noSlider: true, onChange: (v) => ctx.setAnimation(updateItem(live().doc, id, (it) => ({ ...it, transform: { ...it.transform, anchorY: v } }))) });

    // estilo
    const fill = colorControl('Relleno', item0.style.fill ?? '', (v) => {
      const { doc } = live();
      const s = es.get();
      if (s.frameEdit) ctx.setAnimation(setOverride(doc, currentFrameIndex(doc), id, (o) => ({ ...o, style: { ...(o.style ?? {}), fill: v || null } })));
      else ctx.setAnimation(updateItem(doc, id, (it) => ({ ...it, style: { ...it.style, fill: v || null } })));
    });
    const noFill = checkbox('Sin relleno', item0.style.fill === null, (v) => ctx.setAnimation(updateItem(live().doc, id, (it) => ({ ...it, style: { ...it.style, fill: v ? null : (it.style.fill ?? '#ffffff') } }))));
    const stroke = colorControl('Trazo', item0.style.stroke ?? '', (v) => {
      const { doc } = live();
      const s = es.get();
      if (s.frameEdit) ctx.setAnimation(setOverride(doc, currentFrameIndex(doc), id, (o) => ({ ...o, style: { ...(o.style ?? {}), stroke: v || null } })));
      else ctx.setAnimation(updateItem(doc, id, (it) => ({ ...it, style: { ...it.style, stroke: v || null, strokeWidth: it.style.strokeWidth ?? (v ? 2 : undefined) } })));
    });
    const strokeW = numberControl({
      label: 'Grosor',
      value: 0,
      min: 0,
      max: 100,
      step: 0.5,
      decimals: 2,
      onChange: (v) => {
        const { doc, item } = live();
        const ectx = ectxOf(doc);
        const r = setTrackValueAt(item.style.strokeWidth, ectx.t, v, es.get().autoKey, ectx);
        ctx.setAnimation(updateItem(doc, id, (it) => ({ ...it, style: { ...it.style, strokeWidth: r.track } })));
      },
    });
    const blend = selectControl<string>({ label: 'Mezcla', value: item0.style.blend ?? 'source-over', options: BLENDS, onChange: (v) => ctx.setAnimation(updateItem(live().doc, id, (it) => ({ ...it, style: { ...it.style, blend: v as GlobalCompositeOperation } }))) });
    refresh.push(() => {
      const { doc, item } = live();
      const s = es.get();
      const ov = s.frameEdit ? overrideOf(doc, currentFrameIndex(doc), id) : undefined;
      fill.set(ov?.style?.fill !== undefined ? (ov.style.fill ?? '') : (item.style.fill ?? ''));
      noFill.set(item.style.fill === null);
      stroke.set(ov?.style?.stroke !== undefined ? (ov.style.stroke ?? '') : (item.style.stroke ?? ''));
      strokeW.set(valueAt(item, 'style.strokeWidth', ectxOf(doc), item.style.stroke ? 2 : 0));
      blend.set(item.style.blend ?? 'source-over');
    });

    // forma
    const shape: HTMLElement[] = [];
    const shapeNum = (path: string, label: string, fallback: number, step = 1, min?: number) => {
      const c = numberControl({
        label,
        value: 0,
        step,
        min,
        decimals: 3,
        noSlider: true,
        onChange: (v) => {
          const { doc, item } = live();
          const ectx = ectxOf(doc);
          const cur = (item as unknown as Record<string, unknown>)[path] as Track | undefined;
          const r = setTrackValueAt(cur, ectx.t, v, es.get().autoKey, ectx);
          if (r.note) es.setStatus(r.note);
          ctx.setAnimation(updateItem(doc, id, (it) => setPath(it, path, r.track) as Item));
        },
      });
      refresh.push(() => {
        const { doc, item } = live();
        c.set(valueAt(item, path, ectxOf(doc), fallback));
      });
      return c.root;
    };
    switch (item0.type) {
      case 'circle':
        shape.push(shapeNum('rx', 'Radio X', 10, 1, 0), shapeNum('ry', 'Radio Y', 10, 1, 0));
        break;
      case 'rect':
        shape.push(shapeNum('w', 'Ancho', 10, 1, 0), shapeNum('h', 'Alto', 10, 1, 0), shapeNum('radius', 'Esquinas', 0, 1, 0));
        break;
      case 'line':
        shape.push(shapeNum('x1', 'X1', 0), shapeNum('y1', 'Y1', 0), shapeNum('x2', 'X2', 0), shapeNum('y2', 'Y2', 0));
        break;
      case 'image':
      case 'model3d':
        shape.push(shapeNum('w', 'Ancho', 100, 1, 1), shapeNum('h', 'Alto', 100, 1, 1));
        break;
      case 'text': {
        const txt = textControl('Texto', item0.text, (v) => ctx.setAnimation(updateItem(live().doc, id, (it) => (it.type === 'text' ? { ...it, text: v } : it))));
        const font = textControl('Fuente', item0.font ?? 'sans-serif', (v) => ctx.setAnimation(updateItem(live().doc, id, (it) => (it.type === 'text' ? { ...it, font: v } : it))));
        shape.push(txt.root, font.root, shapeNum('fontSize', 'Tamaño', 24, 1, 1));
        break;
      }
      case 'polygon':
      case 'path': {
        const closed = checkbox('Cerrado', item0.closed, (v) => ctx.setAnimation(updateItem(live().doc, id, (it) => (it.type === 'polygon' || it.type === 'path' ? { ...it, closed: v } : it))));
        const pts = Array.isArray(item0.points) ? item0.points.length : item0.points.keys[0]?.v.length ?? 0;
        shape.push(closed.root, el('div', { class: 'hint', text: `${pts} puntos${Array.isArray(item0.points) ? '' : ' · morph con keyframes'}` }));
        if (Array.isArray(item0.points)) {
          shape.push(
            button('Convertir en morph (keyframe de puntos en t)', () => {
              const { doc, item } = live();
              if ((item.type !== 'polygon' && item.type !== 'path') || !Array.isArray(item.points)) return;
              const pts0 = item.points;
              ctx.setAnimation(updateItem(doc, id, (it) => (it.type === 'polygon' || it.type === 'path' ? { ...it, points: { keys: [{ t: 0, v: pts0, e: 'easeInOutSine' }, { t: ctx.project.ui.time || doc.duration / 2, v: pts0.map((p) => ({ x: p.x * 1.2, y: p.y * 0.8 })), e: 'easeInOutSine' }] } } : it)));
            }, { kind: 'ghost' }),
          );
        }
        break;
      }
      case 'model3d': {
        break;
      }
      default:
        break;
    }
    if (item0.type === 'model3d') {
      const cam = item0.camera;
      const fov = numberControl({ label: 'FOV cámara', value: cam.fovDeg, min: 10, max: 120, step: 1, unit: '°', onChange: (v) => ctx.setAnimation(updateItem(live().doc, id, (it) => (it.type === 'model3d' ? { ...it, camera: { ...it.camera, fovDeg: v } } : it))) });
      const dist = numberControl({ label: 'Distancia', value: cam.distance, min: 0.1, max: 20, step: 0.1, decimals: 2, onChange: (v) => ctx.setAnimation(updateItem(live().doc, id, (it) => (it.type === 'model3d' ? { ...it, camera: { ...it.camera, distance: v } } : it))) });
      const elev = numberControl({ label: 'Elevación', value: cam.elevationDeg, min: -89, max: 89, step: 1, unit: '°', onChange: (v) => ctx.setAnimation(updateItem(live().doc, id, (it) => (it.type === 'model3d' ? { ...it, camera: { ...it.camera, elevationDeg: v } } : it))) });
      shape.push(fov.root, dist.root, elev.root, shapeNum('camera.azimuthDeg', 'Azimut cámara', 0, 1), shapeNum('modelRotationY', 'Giro Y modelo', 0, 1), shapeNum('modelRotationX', 'Giro X modelo', 0, 1));
    }

    // deformaciones
    const deformToggles: HTMLElement[] = [];
    const defToggle = (k: 'squash' | 'bend' | 'taper', label: string, def: number) => {
      const c = checkbox(label, item0.deform?.[k] !== undefined, (v) =>
        ctx.setAnimation(
          updateItem(live().doc, id, (it) => {
            const d: Deform = { ...(it.deform ?? {}) };
            if (v) d[k] = def;
            else delete d[k];
            return { ...it, deform: Object.keys(d).length ? d : undefined };
          }),
        ),
      );
      deformToggles.push(c.root);
      if (item0.deform?.[k] !== undefined) deformToggles.push(shapeNum(`deform.${k}`, `${label}: valor`, def, 0.01));
    };
    defToggle('squash', 'Squash & stretch', 1);
    defToggle('bend', 'Curvatura', 0);
    defToggle('taper', 'Estrechamiento', 0);
    const wave = checkbox('Onda', !!item0.deform?.wave, (v) =>
      ctx.setAnimation(
        updateItem(live().doc, id, (it) => {
          const d: Deform = { ...(it.deform ?? {}) };
          if (v) d.wave = { amp: 6, freq: 2, phase: { expr: { kind: 'saw', from: 0, to: 1, cycles: 1 } } };
          else delete d.wave;
          return { ...it, deform: Object.keys(d).length ? d : undefined };
        }),
      ),
    );
    deformToggles.push(wave.root);
    if (item0.deform?.wave) deformToggles.push(shapeNum('deform.wave.amp', 'Onda: amplitud', 6, 0.5), shapeNum('deform.wave.freq', 'Onda: frecuencia', 2, 0.5), shapeNum('deform.wave.phase', 'Onda: fase', 0, 0.05));
    const skew = checkbox('Inclinación (skew)', item0.transform.skewX !== undefined, (v) => ctx.setAnimation(updateItem(live().doc, id, (it) => ({ ...it, transform: { ...it.transform, skewX: v ? 0 : undefined, skewY: v ? 0 : undefined } }))));
    deformToggles.push(skew.root);
    if (item0.transform.skewX !== undefined) deformToggles.push(shapeNum('transform.skewX', 'Skew X', 0, 1), shapeNum('transform.skewY', 'Skew Y', 0, 1));

    return el(
      'div',
      { class: 'props-section' },
      el('h4', { text: `Elemento · ${item0.type}` }),
      frameNote,
      group('General', [name.root, visible.root], { open: true }),
      group('Transformación (en t)', [trCtl('x', 'X', 1), trCtl('y', 'Y', 1), trCtl('rotation', 'Rotación', 1), trCtl('scaleX', 'Escala X', 0.01), trCtl('scaleY', 'Escala Y', 0.01), trCtl('opacity', 'Opacidad', 0.01, 0, 1), anchorX.root, anchorY.root, el('div', { class: 'hint', text: 'Con auto-key, escribir en una pista con keyframes crea o reemplaza el keyframe en el instante actual.' })], { open: true }),
      shape.length ? group('Forma', shape, { open: true }) : null,
      item0.type !== 'group' && item0.type !== 'image' && item0.type !== 'model3d' ? group('Estilo', [fill.root, noFill.root, stroke.root, strokeW.root, blend.root], { open: true }) : null,
      group('Deformaciones', deformToggles, { open: false }),
    );
  }

  // ---------------------------------------------------------------------------------------------- capa
  function layerPanel(doc0: AnimationDoc, layer0: AnimationDoc['layers'][number]): HTMLElement {
    const id = layer0.id;
    const upd = (fn: (l: typeof layer0) => typeof layer0) => {
      const doc = ctx.project.animation;
      ctx.setAnimation({ ...doc, layers: doc.layers.map((l) => (l.id === id ? fn(l) : l)) });
    };
    const name = textControl('Nombre', layer0.name, (v) => upd((l) => ({ ...l, name: v })));
    const vis = checkbox('Visible', layer0.visible, (v) => upd((l) => ({ ...l, visible: v })));
    const lock = checkbox('Bloqueada', !!layer0.locked, (v) => upd((l) => ({ ...l, locked: v })));
    const opacity = numberControl({ label: 'Opacidad', value: 1, min: 0, max: 1, step: 0.01, decimals: 2, onChange: (v) => {
      const doc = ctx.project.animation;
      const l = doc.layers.find((x) => x.id === id);
      if (!l) return;
      const ectx = ectxOf(doc);
      const r = setTrackValueAt(l.transform.opacity, ectx.t, v, es.get().autoKey, ectx);
      upd((ly) => ({ ...ly, transform: { ...ly.transform, opacity: r.track } }));
    } });
    const x = numberControl({ label: 'X', value: 0, step: 1, noSlider: true, decimals: 2, onChange: (v) => {
      const doc = ctx.project.animation;
      const l = doc.layers.find((q) => q.id === id);
      if (!l) return;
      const ectx = ectxOf(doc);
      const r = setTrackValueAt(l.transform.x, ectx.t, v, es.get().autoKey, ectx);
      upd((ly) => ({ ...ly, transform: { ...ly.transform, x: r.track } }));
    } });
    const y = numberControl({ label: 'Y', value: 0, step: 1, noSlider: true, decimals: 2, onChange: (v) => {
      const doc = ctx.project.animation;
      const l = doc.layers.find((q) => q.id === id);
      if (!l) return;
      const ectx = ectxOf(doc);
      const r = setTrackValueAt(l.transform.y, ectx.t, v, es.get().autoKey, ectx);
      upd((ly) => ({ ...ly, transform: { ...ly.transform, y: r.track } }));
    } });
    refresh.push(() => {
      const doc = ctx.project.animation;
      const l = doc.layers.find((q) => q.id === id);
      if (!l) return;
      const r = resolveTransform(l.transform, ectxOf(doc));
      opacity.set(r.opacity);
      x.set(r.x);
      y.set(r.y);
      vis.set(l.visible);
      lock.set(!!l.locked);
    });
    return el('div', { class: 'props-section' }, el('h4', { text: `Capa · ${layer0.name}` }), group('Capa', [name.root, vis.root, lock.root, opacity.root, x.root, y.root], { open: true }));
  }

  // ---------------------------------------------------------------------------------------------- documento
  function documentPanel(doc0: AnimationDoc): HTMLElement {
    const upd = (fn: (d: AnimationDoc) => AnimationDoc) => ctx.setAnimation(fn(ctx.project.animation));
    const name = textControl('Nombre', doc0.name, (v) => upd((d) => ({ ...d, name: v })));
    const width = numberControl({ label: 'Ancho', value: doc0.width, min: 8, max: 8192, step: 1, unit: 'px', noSlider: true, onChange: (v) => upd((d) => ({ ...d, width: Math.round(v) })) });
    const height = numberControl({ label: 'Alto', value: doc0.height, min: 8, max: 8192, step: 1, unit: 'px', noSlider: true, onChange: (v) => upd((d) => ({ ...d, height: Math.round(v) })) });
    const transparent = checkbox('Fondo transparente', doc0.background.transparent, (v) => upd((d) => ({ ...d, background: { ...d.background, transparent: v } })));
    const bg = colorControl('Color de fondo', doc0.background.color, (v) => upd((d) => ({ ...d, background: { ...d.background, color: v } })));
    const loop = checkbox('Seamless Loop', doc0.loop, (v) => upd((d) => ({ ...d, loop: v })), 'Muestreo semiabierto y pistas que envuelven del último al primer keyframe');
    refresh.push(() => {
      const d = ctx.project.animation;
      width.set(d.width);
      height.set(d.height);
      transparent.set(d.background.transparent);
      bg.set(d.background.color);
      loop.set(d.loop);
    });
    const overrides = Object.keys(doc0.frameOverrides).filter((k) => doc0.frameOverrides[k].length).length;
    return el(
      'div',
      { class: 'props-section' },
      el('h4', { text: 'Documento' }),
      group('Documento', [name.root, width.root, height.root, transparent.root, bg.root, loop.root, el('div', { class: 'hint', text: `${doc0.layers.length} capa(s) · ${overrides} fotograma(s) con ediciones individuales` })], { open: !doc0.generator }),
    );
  }

  const unsub1 = ctx.store.subscribe((p) => p.animation, () => render());
  const unsub2 = ctx.store.subscribe((p) => p.ui.time, () => {
    for (const r of refresh) r();
  });
  const unsub3 = es.subscribe(() => render());
  render();
  return {
    dispose() {
      unsub1();
      unsub2();
      unsub3();
    },
  };
}

function deformKeys(item: Item): string[] {
  const d = item.deform;
  const out = d ? Object.keys(d) : [];
  if (item.transform.skewX !== undefined) out.push('skew');
  return out;
}
