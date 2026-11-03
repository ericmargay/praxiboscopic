// Pestaña «Exportar»: diseñador de película imprimible (PPI, página, márgenes, solape, espejo, emulsión, medio,
// ruta de producción, perfil de color), compatibilidad, plan de segmentos, patrones de calibración y todas las
// exportaciones (PNG, secuencia, spritesheet, SVG, tira PNG/SVG, PDF, proyecto).
import type { AppContext } from '../../app/context';
import { calibrationDoc, CALIBRATION_LABELS, type CalibrationKind } from '../../optics/calibration';
import { compatibility, PAGE_SIZES, ROUTE_LABELS, tilePlan, type PrintSpec } from '../../film/print';
import { MEDIA, mediumReport } from '../../optics/medium';
import { exportPngSequence, exportSpritesheet, exportStripPdf, exportStripPng, exportStripSvg, exportSvgSequence, type ExportFile } from '../../export/exporters';
import { canvasToDataUrl, canvasToJpeg } from '../../host/browserCanvas';
import { isVectorOnly } from '../../animation/model';
import { buildBom } from '../../fabricate/bom';
import { button, checkbox, download, el, fmtNum, group, numberControl, readout, selectControl, textControl, warningsList } from '../controls';

export function mountExportPanel(ctx: AppContext, root: HTMLElement): { dispose(): void; refresh(): void } {
  root.classList.add('export-panel');
  const left = el('aside', { class: 'panel export-side' });
  const main = el('section', { class: 'export-main' });
  root.append(left, main);
  const setPrint = (patch: Partial<PrintSpec>) => ctx.store.update((p) => ({ ...p, print: { ...p.print, ...patch } }));
  const status = el('div', { class: 'export-status hint' });

  async function run(label: string, fn: () => Promise<ExportFile[] | ExportFile | null>): Promise<void> {
    status.textContent = `${label}…`;
    try {
      const out = await fn();
      const files = out === null ? [] : Array.isArray(out) ? out : [out];
      for (const f of files) download(f.name, f.data as Uint8Array | string, f.type);
      status.textContent = files.length ? `${label}: ${files.map((f) => f.name).join(', ')}` : `${label}: no disponible para este contenido.`;
    } catch (e) {
      status.textContent = `${label}: error · ${e instanceof Error ? e.message : String(e)}`;
      console.error(e);
    }
  }

  const exportCtx = () => ({ canvases: ctx.canvases, toJpeg: canvasToJpeg, toDataUrl: canvasToDataUrl });
  const slug = () => ctx.project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'praxiboscopic';

  let key = '';
  function build(): void {
    const p = ctx.project;
    const d = ctx.derived();
    const k = JSON.stringify({ print: p.print, film: p.film, fr: d.frameMm, n: d.frameCount, name: p.name, vec: isVectorOnly(p.animation) });
    if (k === key) return;
    key = k;
    const s = p.print;
    const plan = tilePlan(d.layout, s);
    const compat = compatibility(s, d.layout);
    const medium = compat.medium;
    const mrep = mediumReport(medium);
    const stripPx = plan.stripPx;
    left.replaceChildren(el('h3', { text: 'Diseñador de película imprimible' }));
    left.append(
      group('Salida', [
        numberControl({ label: 'Resolución de impresión', value: s.ppi, min: 72, max: 2400, step: 1, unit: 'ppi', onChange: (v) => setPrint({ ppi: Math.round(v) }), noSlider: true }).root,
        readout('Píxeles de la tira completa', `${stripPx.width} × ${stripPx.height} px`).root,
        readout('Tamaño final', `${fmtNum(d.layout.totalLengthMm, 1)} × ${fmtNum(p.film.stripWidthMm, 1)} mm (sin escalar)`).root,
        textControl('Perfil de color (declarado)', s.colorProfile, (v) => setPrint({ colorProfile: v })).root,
        checkbox('Inversión horizontal (espejo)', s.mirror, (v) => setPrint({ mirror: v }), 'Para imprimir por el reverso de la hoja y montar la tinta hacia la lente').root,
        selectControl({ label: 'Tinta / emulsión', value: s.emulsion, options: [{ value: 'toward-lens', label: 'Hacia la lente' }, { value: 'toward-lamp', label: 'Hacia la lámpara' }], onChange: (v) => setPrint({ emulsion: v }) }).root,
      ]),
      group('Página y segmentos', [
        selectControl({ label: 'Página', value: s.pageId, options: PAGE_SIZES.map((pg) => ({ value: pg.id, label: pg.label })), onChange: (v) => setPrint({ pageId: v }) }).root,
        s.pageId === 'custom' ? numberControl({ label: 'Ancho personalizado', value: s.customPageMm.width, min: 50, max: 5000, step: 1, unit: 'mm', onChange: (v) => setPrint({ customPageMm: { ...s.customPageMm, width: v } }), noSlider: true }).root : null,
        s.pageId === 'custom' ? numberControl({ label: 'Alto personalizado', value: s.customPageMm.height, min: 50, max: 5000, step: 1, unit: 'mm', onChange: (v) => setPrint({ customPageMm: { ...s.customPageMm, height: v } }), noSlider: true }).root : null,
        checkbox('Horizontal', s.landscape, (v) => setPrint({ landscape: v })).root,
        numberControl({ label: 'Margen', value: s.marginMm, min: 0, max: 40, step: 0.5, unit: 'mm', onChange: (v) => setPrint({ marginMm: v }) }).root,
        numberControl({ label: 'Solape entre segmentos', value: s.overlapMm, min: 0, max: 30, step: 0.5, unit: 'mm', onChange: (v) => setPrint({ overlapMm: v }) }).root,
        checkbox('Marcas de corte', s.cropMarks, (v) => setPrint({ cropMarks: v })).root,
        checkbox('Marcas de alineación', s.alignmentMarks, (v) => setPrint({ alignmentMarks: v })).root,
        checkbox('Rótulos por segmento', s.segmentLabels, (v) => setPrint({ segmentLabels: v })).root,
        readout('Plan', `${plan.segments.length} segmentos · ${plan.pages} páginas ${plan.page.label} · ${plan.rowsPerPage} tira(s) por página`).root,
        readout('Empalmes', `${Math.max(0, plan.segments.length - 1)} intermedios + 1 de cierre`).root,
        ...plan.warnings.map((w) => el('p', { class: 'hint warn', text: w })),
      ]),
      group('Medio y ruta de producción', [
        selectControl({ label: 'Ruta', value: s.route, options: (Object.keys(ROUTE_LABELS) as PrintSpec['route'][]).map((r) => ({ value: r, label: ROUTE_LABELS[r] })), onChange: (v) => setPrint({ route: v }) }).root,
        selectControl({ label: 'Medio', value: s.mediumId, options: MEDIA.map((m) => ({ value: m.id, label: m.label })), onChange: (v) => setPrint({ mediumId: v }) }).root,
        el('p', { class: 'hint', text: medium.description }),
        readout('Calidad', compat.quality === 'optical' ? 'Película de calidad óptica' : 'Prueba de escritorio', undefined).root,
        readout('Transmitancia base', `${fmtNum(medium.baseTransmittance * 100, 0)} %`).root,
        readout('Densidad máxima (Dmax)', `${fmtNum(medium.dMax, 2)} → ${fmtNum(mrep.minTransmittance * 100, 2)} % de luz en el negro`).root,
        readout('Contraste máximo', `${fmtNum(mrep.contrastRatio, 0)}:1`).root,
        readout('Resolución del medio', `${fmtNum(medium.dotsPerMm, 0)} puntos/mm (~${fmtNum(mrep.lpPerMm, 0)} lp/mm) · σ ${fmtNum(mrep.blurSigmaMm * 1000, 0)} µm`).root,
        readout('Velo (dispersión)', `${fmtNum(medium.haze * 100, 1)} %`).root,
        warningsList(compat.messages.map((m, i) => ({ level: i === 0 && compat.level !== 'ok' ? 'warning' : 'info', message: m }))),
      ]),
    );
    const vector = isVectorOnly(p.animation);
    main.replaceChildren(
      el('h3', { text: 'Exportaciones' }),
      el('div', { class: 'export-grid' },
        card('Fotogramas', `${d.frameCount} imágenes · ${p.frames.widthPx} × ${p.frames.heightPx} px${p.frames.transparent ? ' · fondo transparente' : ''}`, [
          button('Secuencia PNG (ZIP)', () => run('Secuencia PNG', () => exportPngSequence(ctx.frames(), exportCtx(), `${slug()}-fotogramas`)), { kind: 'primary' }),
          button('Spritesheet PNG + JSON', () => run('Spritesheet', () => exportSpritesheet(ctx.frames(), exportCtx(), `${slug()}-spritesheet`))),
          button(vector ? 'SVG por fotograma (ZIP)' : 'SVG por fotograma (no vectorial)', () => run('SVG por fotograma', async () => exportSvgSequence(ctx.project.animation, ctx.frames(), `${slug()}-svg`)), { kind: vector ? 'default' : 'ghost' }),
        ]),
        card('Película', `${fmtNum(d.layout.totalLengthMm, 1)} × ${fmtNum(p.film.stripWidthMm, 1)} mm · ${d.layout.frames.length} fotogramas`, [
          button(`PNG de la tira a ${s.ppi} ppi`, () => run('Tira PNG', () => exportStripPng(ctx.derived().layout, ctx.frames().frames, exportCtx(), { pxPerMm: ctx.project.print.ppi / 25.4, mirror: ctx.project.print.mirror, background: 'white', opaqueMask: false, labels: true }, `${slug()}-pelicula`)), { kind: 'primary' }),
          button('PNG de la tira (fotogramas impresos simulados)', () => run('Tira PNG (medio)', () => exportStripPng(ctx.derived().layout, ctx.printedFrames().frames, exportCtx(), { pxPerMm: ctx.project.print.ppi / 25.4, mirror: ctx.project.print.mirror, background: 'white', opaqueMask: false, labels: true }, `${slug()}-pelicula-simulada`))),
          button(vector ? 'SVG de la tira (vectorial)' : 'SVG de la tira (PNG embebidos)', () => run('Tira SVG', async () => exportStripSvg(ctx.derived().layout, ctx.project.animation, ctx.frames(), exportCtx(), { mirror: ctx.project.print.mirror, labels: true, opaqueMask: false, preferVector: true }, `${slug()}-pelicula`))),
          button('PDF imprimible por segmentos', () => run('PDF', async () => (await exportStripPdf(ctx.derived().layout, ctx.frames().frames, ctx.project.print, exportCtx(), ctx.project.name, `${slug()}-plantilla`)).file), { kind: 'primary' }),
        ]),
        card('Calibración', 'Cartas para evaluar contraste, nitidez, enfoque, registro y tamaño de imagen con el mismo pipeline', [
          ...(Object.keys(CALIBRATION_LABELS) as CalibrationKind[]).map((k) => button(CALIBRATION_LABELS[k], () => loadCalibration(k), { kind: 'ghost' })),
        ]),
        card('Instalación física', 'Lista de compras y de taller derivada del proyecto (formato SHOPPING.md de OMEGA)', [
          button('Lista de compras (Markdown)', () => run('Lista de compras', async () => ({ name: `${slug()}-compras.md`, data: buildBom(ctx.project, ctx.derived()).markdown, type: 'text/markdown' }))),
          button('BOM (CSV)', () => run('BOM CSV', async () => ({ name: `${slug()}-bom.csv`, data: buildBom(ctx.project, ctx.derived()).csv, type: 'text/csv' }))),
        ]),
        card('Proyecto', 'Todo el estado (animación, fotogramas, película, mecánica, óptica, impresión)', [
          button('Guardar proyecto (JSON)', () => download(`${slug()}.praxiboscopic.json`, ctx.exportProjectJson(), 'application/json')),
          button('Cargar proyecto…', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json';
            input.onchange = async () => {
              const f = input.files?.[0];
              if (!f) return;
              try {
                ctx.importProjectJson(await f.text());
                status.textContent = `Proyecto cargado: ${f.name}`;
              } catch (e) {
                status.textContent = `No se pudo cargar: ${e instanceof Error ? e.message : String(e)}`;
              }
            };
            input.click();
          }),
          button('Restablecer la demostración', () => {
            if (confirm('¿Sustituir el proyecto actual por la demostración de la pelota?')) ctx.resetDemo();
          }, { kind: 'danger' }),
        ]),
      ),
      status,
    );
  }

  function loadCalibration(kind: CalibrationKind): void {
    const p = ctx.project;
    const doc = calibrationDoc(kind, { width: p.animation.width, height: p.animation.height, widthMm: p.frames.widthMm, frames: 1, fps: p.animation.fps });
    // la carta se añade como animación de un fotograma; el usuario puede volver a la biblioteca después
    ctx.store.update((q) => ({ ...q, animation: doc, frames: { ...q.frames, fpsMode: 'keep-count', fixedCount: Math.max(1, q.frames.fixedCount) } }));
    status.textContent = `Carta «${CALIBRATION_LABELS[kind]}» cargada como animación estática (${ctx.derived().frameCount} fotogramas iguales). Vuelve a la Biblioteca para recuperar una animación.`;
  }

  function card(title: string, hint: string, buttons: HTMLElement[]): HTMLElement {
    return el('div', { class: 'export-card' }, el('h4', { text: title }), el('p', { class: 'hint', text: hint }), el('div', { class: 'btn-col' }, ...buttons));
  }

  const unsub = ctx.store.onChange(build);
  build();
  return {
    dispose: unsub,
    refresh() {
      key = '';
      build();
    },
  };
}
