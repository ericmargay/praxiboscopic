// Pestaña «Película»: especificación de la tira (ancho, paso, márgenes, repeticiones, perforaciones, marcas,
// empalme), lecturas (longitud, loop, superficie transparente, coherencia con el recorrido) y la vista 2D
// desplegada con zoom y desplazamiento, pintada con los fotogramas reales del generador (ideales o impresos).
import type { AppContext } from '../../app/context';
import type { FilmSpec } from '../../film/layout';
import { renderStrip, stripCanvasSize } from '../../film/strip2d';
import { button, checkbox, el, fmtNum, group, numberControl, readout, selectControl, warningsList } from '../controls';

export function mountFilmPanel(ctx: AppContext, root: HTMLElement): { dispose(): void; refresh(): void } {
  root.classList.add('film-panel');
  const side = el('aside', { class: 'panel film-side' });
  const main = el('section', { class: 'film-main' });
  root.append(side, main);
  const setFilm = (patch: Partial<FilmSpec>) => ctx.store.update((p) => ({ ...p, film: { ...p.film, ...patch } }));

  let sideKey = '';
  function buildSide(): void {
    const p = ctx.project;
    const d = ctx.derived();
    const f = p.film;
    const key = JSON.stringify({ f, c: d.coherence, w: d.layout.warnings, auto: p.autoPath, lw: d.layout.totalLengthMm });
    if (key === sideKey) return;
    sideKey = key;
    side.replaceChildren();
    side.append(el('h3', { text: 'Construcción de la película' }));
    side.append(
      group('Dimensiones', [
        readout('Imagen sobre la tira', `${fmtNum(d.layout.frameAlongMm, 2)} × ${fmtNum(d.layout.frameAcrossMm, 2)} mm (ancho × alto)`, 'Se ajusta en la pestaña Fotogramas (tamaño físico)').root,
        numberControl({ label: 'Ancho total de la tira', value: f.stripWidthMm, min: 8, max: 200, step: 0.5, unit: 'mm', decimals: 1, onChange: (v) => setFilm({ stripWidthMm: v }) }).root,
        numberControl({ label: 'Paso entre fotogramas', value: f.pitchMm, min: 2, max: 200, step: 0.5, unit: 'mm', decimals: 2, onChange: (v) => setFilm({ pitchMm: v }), help: 'De centro a centro, a lo largo de la tira' }).root,
        readout('Separación resultante', `${fmtNum(d.layout.gapMm, 2)} mm`, undefined).root,
        numberControl({ label: 'Cabecera transparente', value: f.leaderMm, min: 0, max: 500, step: 1, unit: 'mm', onChange: (v) => setFilm({ leaderMm: v }) }).root,
        numberControl({ label: 'Cola transparente', value: f.trailerMm, min: 0, max: 500, step: 1, unit: 'mm', onChange: (v) => setFilm({ trailerMm: v }) }).root,
        numberControl({ label: 'Máscara opaca en bordes', value: f.edgeMaskMm, min: 0, max: 20, step: 0.5, unit: 'mm', onChange: (v) => setFilm({ edgeMaskMm: v }) }).root,
      ]),
      group('Ciclos y empalme', [
        numberControl({ label: 'Ciclos repetidos en la tira', value: f.repeats, min: 1, max: 20, step: 1, onChange: (v) => setFilm({ repeats: Math.round(v) }) }).root,
        selectControl({ label: 'Tipo de empalme', value: f.spliceType, options: [{ value: 'tape', label: 'Cinta transparente' }, { value: 'cement', label: 'Cemento (solape)' }, { value: 'ultrasonic', label: 'Ultrasónico' }, { value: 'none', label: 'Sin empalme (tira abierta)' }], onChange: (v) => setFilm({ spliceType: v }) }).root,
        numberControl({ label: 'Solape del empalme', value: f.spliceOverlapMm, min: 0, max: 30, step: 0.5, unit: 'mm', onChange: (v) => setFilm({ spliceOverlapMm: v }) }).root,
        selectControl({ label: 'Sentido de montaje', value: f.travel, options: [{ value: 'forward', label: 'Cabecera primero' }, { value: 'reverse', label: 'Cola primero' }], onChange: (v) => setFilm({ travel: v }) }).root,
      ]),
      group('Perforaciones', [
        checkbox('Perforaciones', f.perforations.enabled, (v) => setFilm({ perforations: { ...f.perforations, enabled: v } })).root,
        numberControl({ label: 'Por fotograma', value: f.perforations.perFrame, min: 1, max: 8, step: 1, onChange: (v) => setFilm({ perforations: { ...f.perforations, perFrame: Math.round(v) } }) }).root,
        numberControl({ label: 'Largo (a lo largo)', value: f.perforations.alongMm, min: 0.5, max: 10, step: 0.1, unit: 'mm', decimals: 2, onChange: (v) => setFilm({ perforations: { ...f.perforations, alongMm: v } }) }).root,
        numberControl({ label: 'Alto (cruzando)', value: f.perforations.acrossMm, min: 0.5, max: 10, step: 0.1, unit: 'mm', decimals: 2, onChange: (v) => setFilm({ perforations: { ...f.perforations, acrossMm: v } }) }).root,
        numberControl({ label: 'Distancia al borde', value: f.perforations.edgeOffsetMm, min: 0.5, max: 20, step: 0.1, unit: 'mm', decimals: 2, onChange: (v) => setFilm({ perforations: { ...f.perforations, edgeOffsetMm: v } }) }).root,
        checkbox('En ambos bordes', f.perforations.bothEdges, (v) => setFilm({ perforations: { ...f.perforations, bothEdges: v } })).root,
      ]),
      group('Marcas', [
        checkbox('Marcas de registro (cruces)', f.registrationMarks, (v) => setFilm({ registrationMarks: v })).root,
        checkbox('Marcas de sincronización óptica', f.syncMarks.enabled, (v) => setFilm({ syncMarks: { ...f.syncMarks, enabled: v } })).root,
        checkbox('Solo una marca por ciclo', f.syncMarks.perCycle, (v) => setFilm({ syncMarks: { ...f.syncMarks, perCycle: v } }), 'Una marca por ciclo sirve para re-sincronizar la fase; una por fotograma, para disparar el LED con un sensor').root,
        selectControl({ label: 'Borde de las marcas', value: f.syncMarks.edge, options: [{ value: 'bottom', label: 'Inferior' }, { value: 'top', label: 'Superior' }], onChange: (v) => setFilm({ syncMarks: { ...f.syncMarks, edge: v } }) }).root,
        numberControl({ label: 'Largo de la marca', value: f.syncMarks.alongMm, min: 0.5, max: 20, step: 0.5, unit: 'mm', onChange: (v) => setFilm({ syncMarks: { ...f.syncMarks, alongMm: v } }) }).root,
        numberControl({ label: 'Alto de la marca', value: f.syncMarks.acrossMm, min: 0.5, max: 10, step: 0.5, unit: 'mm', onChange: (v) => setFilm({ syncMarks: { ...f.syncMarks, acrossMm: v } }) }).root,
      ]),
      group('Resultado', [
        readout('Fotogramas en la tira', `${d.layout.frames.length} (${d.layout.frameCount} × ${f.repeats})`).root,
        readout('Longitud de imágenes', `${fmtNum(d.layout.imageLengthMm, 1)} mm`).root,
        readout('Longitud total a imprimir', `${fmtNum(d.layout.totalLengthMm, 1)} mm`).root,
        ...(d.reels
          ? [
              readout('Colas transparentes', `${fmtNum(d.reels.design.tail1Mm, 0)} mm (tambor 1) y ${fmtNum(d.reels.design.tail2Mm, 0)} mm (tambor 2), sin imprimir: van fijas a los núcleos`).root,
              readout('Película total', `${fmtNum(d.reels.design.totalMm / 1000, 2)} m entre los dos tambores; comprar ${fmtNum(d.reels.filmToBuyM, 1)} m de base y de laminado`).root,
              readout('Recorrido libre', `${fmtNum(d.path.lengthMm, 1)} mm de tambor a tambor`).root,
            ]
          : [
              readout('Longitud del loop', `${fmtNum(d.layout.loopLengthMm, 1)} mm`).root,
              readout('Recorrido mecánico', `${fmtNum(d.path.lengthMm, 1)} mm`, 'Longitud del camino de la película alrededor de los rodillos').root,
            ]),
        readout('Superficie transparente restante', `${fmtNum(d.layout.clearAreaMm2 / 100, 1)} cm² (${fmtNum(d.layout.clearFraction * 100, 0)} %)`).root,
        d.reels ? null : readout('Ciclos que caben en el recorrido', `${fmtNum(d.path.lengthMm / Math.max(1e-9, d.layout.frameCount * f.pitchMm), 3)}`).root,
      ]),
      group('Coherencia con el recorrido', [
        el('p', { class: `coherence ${d.coherence.level}`, text: d.coherence.message }),
        ...d.coherence.suggestions.map((s) => el('p', { class: 'hint', text: `→ ${s}` })),
        checkbox('Rediseñar el recorrido automáticamente para la película', p.autoPath, (v) => ctx.store.update((q) => ({ ...q, autoPath: v }))).root,
        !p.autoPath && !d.coherence.ok ? button('Ajustar el paso para cerrar el loop', () => setFilm({ pitchMm: Math.round(((d.path.lengthMm - f.leaderMm - f.trailerMm + f.spliceOverlapMm) / (d.layout.frameCount * f.repeats)) * 1000) / 1000 }), { kind: 'primary' }) : null,
      ]),
      group('Avisos', [warningsList(d.layout.warnings.map((w) => ({ level: w.level, message: w.message })))]),
    );
  }

  // vista 2D
  const toolbar = el('div', { class: 'strip-toolbar' });
  const scroller = el('div', { class: 'strip-scroller' });
  const canvas = document.createElement('canvas');
  canvas.className = 'strip-canvas';
  scroller.append(canvas);
  main.append(toolbar, scroller);
  let pxPerMm = 3;
  let source: 'ideal' | 'printed' = 'ideal';
  let background: 'transparent' | 'white' | 'checker' = 'checker';
  let mask = false;
  let stripKey = '';
  function buildStrip(): void {
    const p = ctx.project;
    const d = ctx.derived();
    const frames = source === 'ideal' ? ctx.frames().frames : ctx.printedFrames().frames;
    const hash = source === 'ideal' ? ctx.frames().hash : ctx.printedFrames().hash;
    const key = JSON.stringify({ hash, pxPerMm, source, background, mask, film: p.film, fr: d.frameMm });
    if (key === stripKey) return;
    stripKey = key;
    const size = stripCanvasSize(d.layout, pxPerMm);
    const maxW = 16000;
    if (size.width > maxW) {
      pxPerMm = Math.floor((maxW / d.layout.totalLengthMm) * 100) / 100;
      stripKey = '';
      buildStrip();
      return;
    }
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    renderStrip(canvas.getContext('2d')!, d.layout, { pxPerMm, frames, background, opaqueMask: mask, labels: true, mirror: p.print.mirror });
    toolbar.replaceChildren(
      el('span', { class: 'mono', text: `Vista desplegada · ${fmtNum(d.layout.totalLengthMm, 1)} × ${fmtNum(p.film.stripWidthMm, 1)} mm · ${pxPerMm} px/mm${p.print.mirror ? ' · espejo' : ''}` }),
      el('span', { class: 'spacer' }),
      selectControl({ label: 'Fotogramas', value: source, options: [{ value: 'ideal', label: 'Ideales' }, { value: 'printed', label: 'Impresos (medio)' }], onChange: (v) => { source = v; buildStrip(); } }).root,
      selectControl({ label: 'Fondo', value: background, options: [{ value: 'checker', label: 'Cuadrícula' }, { value: 'white', label: 'Blanco' }, { value: 'transparent', label: 'Transparente' }], onChange: (v) => { background = v; buildStrip(); } }).root,
      checkbox('Máscara opaca', mask, (v) => { mask = v; buildStrip(); }).root,
      button('−', () => { pxPerMm = Math.max(0.5, Math.round((pxPerMm / 1.5) * 100) / 100); buildStrip(); }, { kind: 'ghost' }),
      button('+', () => { pxPerMm = Math.min(40, Math.round(pxPerMm * 1.5 * 100) / 100); buildStrip(); }, { kind: 'ghost' }),
    );
  }

  const unsub = ctx.store.onChange(() => {
    buildSide();
    buildStrip();
  });
  buildSide();
  buildStrip();
  return {
    dispose: unsub,
    refresh() {
      sideKey = '';
      stripKey = '';
      buildSide();
      buildStrip();
    },
  };
}
