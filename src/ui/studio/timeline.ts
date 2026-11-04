// Línea de tiempo: regla en fotogramas, cabezal arrastrable, reproducción, paso ±1, FPS y duración, factor de
// tiempo; filas de keyframes del elemento seleccionado (rombos arrastrables, borrado, easing) y editor de
// expresiones para las pistas procedurales.
import type { AppContext } from '../../app/context';
import { EASING_LABELS } from '../../animation/easing';
import { evalTrack } from '../../animation/evaluate';
import { EASING_NAMES, type Easing, type Expr, type Track } from '../../animation/model';
import { resolveFrameCount } from '../../frames/settings';
import { button, el, numberControl, selectControl } from '../controls';
import { findItemIn } from './canvas';
import type { EditorStore } from './state';
import { addKeyframe, exprOf, frameOfTime, getTrack, keyframesOf, moveKeyframe, removeKeyframe, setItemTrack, setKeyframeEasing, timeOfFrame, trackKind, trackPaths } from './tracks';

export function mountTimeline(ctx: AppContext, es: EditorStore, root: HTMLElement): { dispose(): void } {
  root.classList.add('timeline');
  const transport = el('div', { class: 'tl-transport' });
  const rulerWrap = el('div', { class: 'tl-ruler-wrap' });
  const ruler = el('canvas', { class: 'tl-ruler' }) as HTMLCanvasElement;
  const head = el('div', { class: 'tl-head' });
  const rows = el('div', { class: 'tl-rows' });
  rulerWrap.append(ruler, head);
  root.append(transport, rulerWrap, rows);
  const g = ruler.getContext('2d')!;

  // ---------------------------------------------------------------------------------------------- transporte
  const playBtn = button('▶', () => ctx.store.update((p) => ({ ...p, ui: { ...p.ui, playing: !p.ui.playing } })), { title: 'Reproducir / pausar (espacio)' });
  const toStart = button('⏮', () => setTime(0), { kind: 'ghost', title: 'Al inicio' });
  const prev = button('◀|', () => step(-1), { kind: 'ghost', title: 'Fotograma anterior (←)' });
  const next = button('|▶', () => step(1), { kind: 'ghost', title: 'Fotograma siguiente (→)' });
  const timeRo = el('span', { class: 'tl-time mono' });
  const fpsCtl = numberControl({ label: 'FPS', value: ctx.project.animation.fps, min: 1, max: 60, step: 0.1, decimals: 1, noSlider: true, onChange: (v) => setFps(v) });
  const durCtl = numberControl({ label: 'Duración', value: ctx.project.animation.duration, min: 0.05, max: 60, step: 0.01, unit: 's', decimals: 3, noSlider: true, onChange: (v) => setDuration(v) });
  const framesCtl = numberControl({ label: 'Fotogramas', value: 24, min: 1, max: 1000, step: 1, noSlider: true, onChange: (v) => setFrames(v) });
  const scaleCtl = numberControl({ label: 'Velocidad', value: ctx.project.ui.timeScale, min: 0.1, max: 2, step: 0.1, unit: '×', decimals: 1, onChange: (v) => ctx.store.update((p) => ({ ...p, ui: { ...p.ui, timeScale: v } })) });
  for (const c of [fpsCtl, durCtl, framesCtl, scaleCtl]) c.root.classList.add('ctl-inline');
  transport.append(toStart, prev, playBtn, next, timeRo, el('span', { class: 'toolbar-sep' }), fpsCtl.root, durCtl.root, framesCtl.root, scaleCtl.root);

  function info(): { count: number; duration: number; index: number; t: number } {
    const p = ctx.project;
    const count = resolveFrameCount(p.animation.fps, p.animation.duration, p.frames).count;
    return { count, duration: p.animation.duration, index: frameOfTime(p.ui.time, count, p.animation.duration), t: p.ui.time };
  }

  function setTime(t: number): void {
    const d = ctx.project.animation.duration;
    const tt = d > 0 ? ((t % d) + d) % d : 0;
    ctx.store.update((p) => ({ ...p, ui: { ...p.ui, time: tt } }));
  }

  function step(delta: number): void {
    const { count, duration, index } = info();
    ctx.store.update((p) => ({ ...p, ui: { ...p.ui, playing: false, time: timeOfFrame(index + delta, count, duration) } }));
  }

  function setFps(v: number): void {
    const p = ctx.project;
    if (p.animation.generator) ctx.setGeneratorParams({ fps: v });
    else ctx.store.update((q) => ({ ...q, animation: { ...q.animation, fps: v }, targetFps: q.targetFps === q.animation.fps ? v : q.targetFps }));
  }

  function setDuration(v: number): void {
    const p = ctx.project;
    if (p.animation.generator) ctx.setGeneratorParams({ frames: Math.max(2, Math.round(v * p.animation.fps)) });
    else ctx.setAnimation({ ...p.animation, duration: v });
  }

  function setFrames(v: number): void {
    const p = ctx.project;
    const n = Math.max(1, Math.round(v));
    if (p.animation.generator) ctx.setGeneratorParams({ frames: n });
    else ctx.setAnimation({ ...p.animation, duration: n / p.animation.fps });
  }

  // ---------------------------------------------------------------------------------------------- regla
  function xOf(t: number): number {
    const { duration } = info();
    const w = rulerWrap.clientWidth || 1;
    return (t / Math.max(1e-9, duration)) * w;
  }

  function tOf(x: number): number {
    const { duration } = info();
    const w = rulerWrap.clientWidth || 1;
    return Math.max(0, Math.min(duration, (x / w) * duration));
  }

  function snap(t: number): number {
    const { count, duration } = info();
    return timeOfFrame(Math.round((t / duration) * count) % count, count, duration);
  }

  function drawRuler(): void {
    const { count, duration, index, t } = info();
    const dpr = window.devicePixelRatio || 1;
    const w = rulerWrap.clientWidth || 1;
    const h = 26;
    ruler.width = w * dpr;
    ruler.height = h * dpr;
    ruler.style.width = `${w}px`;
    ruler.style.height = `${h}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#f6f9f9';
    g.fillRect(0, 0, w, h);
    const pxPerFrame = w / Math.max(1, count);
    const every = pxPerFrame > 28 ? 1 : pxPerFrame > 12 ? 2 : pxPerFrame > 6 ? 5 : 10;
    g.font = '10px ui-monospace, monospace';
    g.textBaseline = 'top';
    for (let i = 0; i < count; i++) {
      const x = i * pxPerFrame;
      g.fillStyle = i === index ? 'rgba(27,108,134,0.18)' : i % 2 ? 'rgba(19,36,44,0.03)' : 'transparent';
      g.fillRect(x, 0, pxPerFrame, h);
      g.fillStyle = '#c7d4d8';
      g.fillRect(x, i % every === 0 ? 12 : 18, 1, h);
      if (i % every === 0) {
        g.fillStyle = '#5f737b';
        g.fillText(String(i + 1), x + 3, 1);
      }
    }
    head.style.left = `${xOf(t)}px`;
    timeRo.textContent = `${t.toFixed(3)} s · f ${index + 1}/${count} · ${duration.toFixed(3)} s`;
    playBtn.textContent = ctx.project.ui.playing ? '❚❚' : '▶';
  }

  let scrubbing = false;
  rulerWrap.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.tl-rows')) return;
    scrubbing = true;
    rulerWrap.setPointerCapture(e.pointerId);
    const r = rulerWrap.getBoundingClientRect();
    ctx.store.update((p) => ({ ...p, ui: { ...p.ui, playing: false } }));
    setTime(snap(tOf(e.clientX - r.left)));
  });
  rulerWrap.addEventListener('pointermove', (e) => {
    if (!scrubbing) return;
    const r = rulerWrap.getBoundingClientRect();
    setTime(e.shiftKey ? tOf(e.clientX - r.left) : snap(tOf(e.clientX - r.left)));
  });
  rulerWrap.addEventListener('pointerup', () => {
    scrubbing = false;
  });

  // ---------------------------------------------------------------------------------------------- filas
  let rowsKey = '';
  function renderRows(force = false): void {
    const doc = ctx.project.animation;
    const s = es.get();
    const item = s.selectedItemId ? findItemIn(doc, s.selectedItemId) : null;
    const key = item ? `${item.id}|${JSON.stringify(trackPaths(item).map((p) => [p.path, getTrack(item, p.path)]))}|${s.selectedKey?.path}|${s.selectedKey?.t}` : 'none';
    if (!force && key === rowsKey) {
      positionDiamonds();
      return;
    }
    rowsKey = key;
    rows.replaceChildren();
    if (!item) {
      rows.append(el('div', { class: 'hint tl-empty', text: 'Selecciona un elemento para ver y editar sus keyframes. Las pistas con ∿ son expresiones procedurales periódicas.' }));
      return;
    }
    const { t } = info();
    for (const tp of trackPaths(item)) {
      const track = getTrack(item, tp.path);
      const kind = trackKind(track);
      const row = el('div', { class: 'tl-row' });
      const label = el('div', { class: 'tl-row-label' }, el('span', { text: tp.label }));
      const lane = el('div', { class: 'tl-lane' });
      row.append(label, lane);
      const addBtn = el('button', { class: 'icon-btn', title: 'Añadir keyframe en el instante actual', type: 'button', text: '◆+' });
      addBtn.addEventListener('click', () => {
        const ectx = { t, duration: doc.duration, loop: doc.loop };
        ctx.setAnimation(setItemTrack(doc, item.id, tp.path, addKeyframe(track, t, ectx, tp.fallback)));
        es.patch({ selectedKey: { itemId: item.id, path: tp.path, t } });
      });
      label.append(addBtn);
      if (kind === 'expr') {
        const e = exprOf(track)!;
        lane.classList.add('tl-lane-expr');
        lane.append(el('span', { class: 'expr-icon', text: '∿', title: 'Expresión procedural' }), exprEditor(e, (next) => ctx.setAnimation(setItemTrack(doc, item.id, tp.path, { expr: next }))));
        const toKeys = el('button', { class: 'icon-btn', title: 'Convertir a keyframes (una muestra por fotograma)', type: 'button', text: '→◆' });
        toKeys.addEventListener('click', () => {
          const { count, duration } = info();
          const keys = [];
          for (let i = 0; i < count; i++) {
            const ti = timeOfFrame(i, count, duration);
            keys.push({ t: ti, v: evalTrackSafe(track, ti, doc.duration, doc.loop, tp.fallback) });
          }
          ctx.setAnimation(setItemTrack(doc, item.id, tp.path, { keys }));
        });
        lane.append(toKeys);
      } else if (kind === 'keys') {
        for (const k of keyframesOf(track)) {
          const selected = s.selectedKey && s.selectedKey.itemId === item.id && s.selectedKey.path === tp.path && Math.abs(s.selectedKey.t - k.t) < 1e-6;
          const d = el('div', { class: `diamond${selected ? ' selected' : ''}`, title: `t = ${k.t.toFixed(3)} s · v = ${Number(k.v.toFixed(3))}${k.e ? ` · ${typeof k.e === 'string' ? EASING_LABELS[k.e] : 'Bézier'}` : ''}` });
          d.dataset.t = String(k.t);
          d.addEventListener('pointerdown', (ev) => {
            ev.stopPropagation();
            d.setPointerCapture(ev.pointerId);
            es.patch({ selectedKey: { itemId: item.id, path: tp.path, t: k.t } });
            let moved = false;
            const startT = k.t;
            let lastT = startT;
            const onMove = (mv: PointerEvent) => {
              const r = lane.getBoundingClientRect();
              const nt = mv.shiftKey ? tOf(mv.clientX - r.left) : snap(tOf(mv.clientX - r.left));
              if (Math.abs(nt - lastT) > 1e-9) {
                moved = true;
                lastT = nt;
                d.style.left = `${xOf(nt)}px`;
              }
            };
            const onUp = () => {
              d.removeEventListener('pointermove', onMove);
              d.removeEventListener('pointerup', onUp);
              if (moved && Math.abs(lastT - startT) > 1e-9) {
                const cur = ctx.project.animation;
                const it = findItemIn(cur, item.id);
                const tr = it ? getTrack(it, tp.path) : undefined;
                if (tr) ctx.setAnimation(setItemTrack(cur, item.id, tp.path, moveKeyframe(tr, startT, lastT)));
                es.patch({ selectedKey: { itemId: item.id, path: tp.path, t: lastT } });
              } else renderRows(true);
            };
            d.addEventListener('pointermove', onMove);
            d.addEventListener('pointerup', onUp);
          });
          d.addEventListener('dblclick', (ev) => {
            ev.stopPropagation();
            setTime(k.t);
          });
          d.addEventListener('contextmenu', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            ctx.setAnimation(setItemTrack(doc, item.id, tp.path, removeKeyframe(track as Track, k.t)));
            es.patch({ selectedKey: null });
          });
          lane.append(d);
        }
      } else {
        lane.append(el('span', { class: 'hint', text: kind === 'number' ? `valor fijo ${Number((track as number).toFixed(3))}` : 'sin pista' }));
      }
      rows.append(row);
    }
    // editor del keyframe seleccionado
    const sk = s.selectedKey;
    if (sk && sk.itemId === item.id) {
      const track = getTrack(item, sk.path);
      const k = keyframesOf(track).find((x) => Math.abs(x.t - sk.t) < 1e-6);
      if (k) {
        const bar = el('div', { class: 'tl-keybar' });
        const val = numberControl({ label: 'Valor', value: k.v, step: 0.01, decimals: 3, noSlider: true, onChange: (v) => ctx.setAnimation(setItemTrack(doc, item.id, sk.path, { keys: keyframesOf(track).map((x) => (Math.abs(x.t - sk.t) < 1e-6 ? { ...x, v } : x)) })) });
        const easing = selectControl<string>({
          label: 'Easing →',
          value: typeof k.e === 'string' ? k.e : k.e ? 'bezier' : 'linear',
          options: [...EASING_NAMES.map((n) => ({ value: n, label: EASING_LABELS[n] })), { value: 'bezier', label: 'Bézier personalizada (0.42, 0, 0.58, 1)' }],
          onChange: (v) => {
            const e: Easing = v === 'bezier' ? [0.42, 0, 0.58, 1] : (v as Easing);
            ctx.setAnimation(setItemTrack(doc, item.id, sk.path, setKeyframeEasing(track as Track, sk.t, e)));
          },
        });
        val.root.classList.add('ctl-inline');
        easing.root.classList.add('ctl-inline');
        bar.append(el('span', { class: 'mono', text: `◆ ${tp(sk.path, item)} · t = ${sk.t.toFixed(3)} s` }), val.root, easing.root, button('Borrar keyframe', () => {
          ctx.setAnimation(setItemTrack(doc, item.id, sk.path, removeKeyframe(track as Track, sk.t)));
          es.patch({ selectedKey: null });
        }, { kind: 'danger' }));
        rows.append(bar);
      }
    }
    positionDiamonds();
  }

  function tp(path: string, item: NonNullable<ReturnType<typeof findItemIn>>): string {
    return trackPaths(item).find((p) => p.path === path)?.label ?? path;
  }

  function positionDiamonds(): void {
    for (const d of rows.querySelectorAll<HTMLElement>('.diamond')) d.style.left = `${xOf(parseFloat(d.dataset.t ?? '0'))}px`;
  }

  function exprEditor(e: Expr, commit: (next: Expr) => void): HTMLElement {
    const box = el('span', { class: 'expr-editor' });
    const kinds = ['sin', 'abs-sin', 'saw', 'triangle', 'square', 'bounce', 'noise'];
    if (e.kind === 'sum') {
      box.append(el('span', { class: 'hint', text: `suma de ${e.terms.length} términos (edítala en JSON)` }));
      return box;
    }
    const kind = selectControl<string>({ label: '', value: e.kind, options: kinds.map((k) => ({ value: k, label: k })), onChange: (k) => commit(convertExpr(e, k)) });
    kind.root.classList.add('ctl-inline', 'ctl-tiny');
    box.append(kind.root);
    const fields = exprFields(e);
    for (const f of fields) {
      const c = numberControl({ label: f.label, value: f.value, step: f.step, decimals: 3, noSlider: true, onChange: (v) => commit({ ...e, [f.key]: v } as Expr) });
      c.root.classList.add('ctl-inline', 'ctl-tiny');
      box.append(c.root);
    }
    return box;
  }

  const unsubAnim = ctx.store.subscribe((p) => p.animation, (a) => {
    fpsCtl.set(a.fps);
    durCtl.set(a.duration);
    framesCtl.set(info().count);
    drawRuler();
    renderRows();
  });
  const unsubTime = ctx.store.subscribe((p) => p.ui, () => drawRuler());
  const unsubEs = es.subscribe(() => renderRows());
  const ro = new ResizeObserver(() => {
    drawRuler();
    positionDiamonds();
  });
  ro.observe(rulerWrap);
  framesCtl.set(info().count);
  drawRuler();
  renderRows(true);
  return {
    dispose() {
      unsubAnim();
      unsubTime();
      unsubEs();
      ro.disconnect();
    },
  };
}

function evalTrackSafe(track: Track | undefined, t: number, duration: number, loop: boolean, fallback: number): number {
  return evalTrack(track, { t, duration, loop }, fallback);
}

function exprFields(e: Exclude<Expr, { kind: 'sum' }>): { key: string; label: string; value: number; step: number }[] {
  switch (e.kind) {
    case 'sin':
    case 'abs-sin':
      return [
        { key: 'amp', label: 'amp', value: e.amp, step: 1 },
        { key: 'cycles', label: 'ciclos', value: e.cycles, step: 0.5 },
        { key: 'phase', label: 'fase', value: e.phase ?? 0, step: 0.05 },
        { key: 'offset', label: 'offset', value: e.offset ?? 0, step: 1 },
        { key: 'power', label: 'potencia', value: e.power ?? 1, step: 0.1 },
      ];
    case 'saw':
      return [
        { key: 'from', label: 'de', value: e.from, step: 1 },
        { key: 'to', label: 'a', value: e.to, step: 1 },
        { key: 'cycles', label: 'ciclos', value: e.cycles, step: 1 },
        { key: 'phase', label: 'fase', value: e.phase ?? 0, step: 0.05 },
      ];
    case 'triangle':
      return [
        { key: 'amp', label: 'amp', value: e.amp, step: 1 },
        { key: 'cycles', label: 'ciclos', value: e.cycles, step: 1 },
        { key: 'phase', label: 'fase', value: e.phase ?? 0, step: 0.05 },
        { key: 'offset', label: 'offset', value: e.offset ?? 0, step: 1 },
      ];
    case 'square':
      return [
        { key: 'low', label: 'bajo', value: e.low, step: 1 },
        { key: 'high', label: 'alto', value: e.high, step: 1 },
        { key: 'cycles', label: 'ciclos', value: e.cycles, step: 1 },
        { key: 'duty', label: 'duty', value: e.duty ?? 0.5, step: 0.05 },
        { key: 'phase', label: 'fase', value: e.phase ?? 0, step: 0.05 },
      ];
    case 'bounce':
      return [
        { key: 'height', label: 'altura', value: e.height, step: 1 },
        { key: 'bounces', label: 'rebotes', value: e.bounces, step: 1 },
        { key: 'damping', label: 'amortig.', value: e.damping ?? 0, step: 0.05 },
        { key: 'floor', label: 'suelo', value: e.floor ?? 0, step: 1 },
      ];
    case 'noise':
      return [
        { key: 'amp', label: 'amp', value: e.amp, step: 1 },
        { key: 'cycles', label: 'celdas', value: e.cycles, step: 1 },
        { key: 'seed', label: 'semilla', value: e.seed ?? 1, step: 1 },
        { key: 'offset', label: 'offset', value: e.offset ?? 0, step: 1 },
      ];
  }
}

function convertExpr(e: Expr, kind: string): Expr {
  const amp = 'amp' in e ? e.amp : 'height' in e ? e.height : 'to' in e ? e.to - e.from : 10;
  const cycles = 'cycles' in e ? e.cycles : 'bounces' in e ? e.bounces : 1;
  const offset = 'offset' in e ? (e.offset ?? 0) : 'from' in e ? e.from : 0;
  switch (kind) {
    case 'sin':
      return { kind: 'sin', amp, cycles, offset };
    case 'abs-sin':
      return { kind: 'abs-sin', amp, cycles, offset };
    case 'saw':
      return { kind: 'saw', from: offset, to: offset + amp, cycles };
    case 'triangle':
      return { kind: 'triangle', amp, cycles, offset };
    case 'square':
      return { kind: 'square', low: offset, high: offset + amp, cycles };
    case 'bounce':
      return { kind: 'bounce', height: amp, bounces: Math.max(1, Math.round(cycles)), floor: offset };
    default:
      return { kind: 'noise', amp, cycles: Math.max(1, Math.round(cycles)), offset };
  }
}
