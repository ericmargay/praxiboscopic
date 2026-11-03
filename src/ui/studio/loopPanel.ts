// Panel de loop: analiza la continuidad del ciclo (transición último → primero frente a las internas), muestra el
// primer y el último fotograma lado a lado con una superposición de diferencia, y ofrece las correcciones.
import type { AppContext } from '../../app/context';
import { evaluate } from '../../animation/evaluate';
import { analyzeLoop, closeKeyframeTracks, fixLoopMode, frameTimes } from '../../animation/loop';
import { renderDisplayList } from '../../animation/render2d';
import { resolveFrameCount } from '../../frames/settings';
import { button, el } from '../controls';

export function mountLoopPanel(ctx: AppContext, root: HTMLElement): { dispose(): void } {
  root.classList.add('panel', 'loop-panel');
  root.append(el('h3', { text: 'Seamless Loop' }));
  const body = el('div', { class: 'panel-body' });
  const message = el('div', { class: 'loop-message' });
  const worst = el('ul', { class: 'loop-worst' });
  const previews = el('div', { class: 'loop-previews' });
  const first = el('canvas', { class: 'loop-thumb checker', width: 160, height: 100 }) as HTMLCanvasElement;
  const last = el('canvas', { class: 'loop-thumb checker', width: 160, height: 100 }) as HTMLCanvasElement;
  const diff = el('canvas', { class: 'loop-thumb', width: 160, height: 100 }) as HTMLCanvasElement;
  previews.append(el('figure', {}, first, el('figcaption', { text: 'Primero (f 1)' })), el('figure', {}, last, el('figcaption', { text: 'Último (f N)' })), el('figure', {}, diff, el('figcaption', { text: 'Diferencia' })));
  const actions = el(
    'div',
    { class: 'btn-row' },
    button('Activar Seamless Loop', () => {
      const r = fixLoopMode(ctx.project.animation);
      ctx.setAnimation(r.doc);
      note(r.changes.length ? r.changes : ['El modo loop ya estaba activo.']);
    }, { kind: 'ghost' }),
    button('Cerrar pistas de keyframes', () => {
      const r = closeKeyframeTracks(ctx.project.animation);
      ctx.setAnimation(r.doc);
      note(r.changes.length ? r.changes : ['Todas las pistas de keyframes ya cerraban.']);
    }, { kind: 'ghost', title: 'Añade un keyframe de cierre con el valor inicial a cada pista cuyo primer y último valor difieren' }),
  );
  const notes = el('div', { class: 'hint notes' });
  body.append(message, worst, previews, actions, notes);
  root.append(body);

  function note(lines: string[]): void {
    notes.replaceChildren(...lines.map((l) => el('div', { text: `· ${l}` })));
  }

  let timer = 0;
  function schedule(): void {
    clearTimeout(timer);
    timer = window.setTimeout(run, 120);
  }

  function run(): void {
    try {
      const p = ctx.project;
      const doc = p.animation;
      const count = resolveFrameCount(doc.fps, doc.duration, p.frames).count;
      const rep = analyzeLoop(doc, count);
      message.textContent = rep.message;
      message.className = `loop-message ${rep.seamless ? 'ok' : 'bad'}`;
      worst.replaceChildren();
      if (!rep.seamless) for (const w of rep.worstNodes.slice(0, 4)) worst.append(el('li', { text: `${w.name}: salto ${w.move.toFixed(1)} px, tamaño ${w.resize.toFixed(1)} px, opacidad ${w.opacity.toFixed(2)}` }));
      // previsualizaciones
      const times = frameTimes(doc.duration, count);
      const l0 = evaluate(doc, times[0], { frameIndex: 0 });
      const lN = evaluate(doc, times[count - 1], { frameIndex: count - 1 });
      const scale = Math.min(first.width / doc.width, first.height / doc.height);
      const ox = (first.width - doc.width * scale) / 2;
      const oy = (first.height - doc.height * scale) / 2;
      for (const [c, list] of [
        [first, l0],
        [last, lN],
      ] as const) {
        const g = c.getContext('2d')!;
        g.clearRect(0, 0, c.width, c.height);
        renderDisplayList(g, list, { scale, offsetX: ox, offsetY: oy, resources: ctx.resources });
      }
      const dg = diff.getContext('2d')!;
      dg.globalCompositeOperation = 'source-over';
      dg.fillStyle = '#000';
      dg.fillRect(0, 0, diff.width, diff.height);
      renderDisplayList(dg, l0, { scale, offsetX: ox, offsetY: oy, resources: ctx.resources, forceBackground: null });
      dg.globalCompositeOperation = 'difference';
      renderDisplayList(dg, lN, { scale, offsetX: ox, offsetY: oy, resources: ctx.resources, forceBackground: null });
      dg.globalCompositeOperation = 'source-over';
    } catch (e) {
      message.textContent = `No se pudo analizar el loop: ${e instanceof Error ? e.message : e}`;
      message.className = 'loop-message bad';
    }
  }

  const unsub = ctx.store.subscribe((p) => p.animation, () => schedule());
  run();
  return {
    dispose() {
      unsub();
      clearTimeout(timer);
    },
  };
}
