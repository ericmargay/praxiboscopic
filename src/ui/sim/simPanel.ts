// Mechanical Simulation: la escena three.js (mesa, rodillos, película con los fotogramas reales, ventana, linterna,
// estroboscopio, pantalla) y el panel de control temporal y estroboscópico: transporte, recorrido, estroboscopio
// (tambor o LED), óptica, sincronía (objetivo frente a real) y errores deliberados.
import type { AppContext } from '../../app/context';
import type { SimulationRunner } from '../../app/simulation';
import { createMechScene, type MechScene, type ViewId } from '../../three';
import type { PartNode } from '../../three/mechScene';
import { CATEGORY_LABEL, type PartCategory } from '../../three/parts';
import { buildParts } from '../../fabricate/bom';
import { OFFERS } from '../../fabricate/offers';
import { MOTORS, type TransportSpec } from '../../mech/transport';
import { festoonPasses, reelsProject } from '../../core/video';
import { DEFAULT_LAMINATE } from '../../film/layout';
import { defaultReelsSpec, handFps, reelPose, reelPulseS, reelRpm, type ReelControlSpec, type ReelsSpec } from '../../mech/reels';
import { deriveProject, type Project } from '../../core/project';
import { buildReelsAssembly } from '../../mech/assembly';
import { assemblySteps } from '../../mech/structure';
import { autoSync } from '../../mech/sync';
import type { DrumStrobe, LedStrobe } from '../../mech/strobe';
import type { OpticsSpec } from '../../optics/projector';
import { brightnessReport, focusFor, opticsReport } from '../../optics/projector';
import { mediumById } from '../../optics/medium';
import { button, checkbox, el, fmtNum, group, numberControl, readout, selectControl, warningsList } from '../controls';

export function mountSimPanel(ctx: AppContext, sim: SimulationRunner, root: HTMLElement): { dispose(): void; resize(): void; setActive(v: boolean): void } {
  root.classList.add('sim-panel');
  const viewport = el('div', { class: 'sim-viewport' });
  const canvas = document.createElement('canvas');
  canvas.className = 'sim-canvas';
  const hud = el('div', { class: 'sim-hud mono' });
  const toolbar = el('div', { class: 'sim-toolbar' });
  const browser = el('aside', { class: 'sim-browser' });
  const props = el('aside', { class: 'sim-props' });
  const overlay = el('div', { class: 'sim-overlay' });
  viewport.append(canvas, overlay, toolbar, browser, props, hud);
  const side = el('aside', { class: 'panel sim-side' });
  root.append(viewport, side);
  let scene: MechScene | null = null;
  let active = false;
  let highlightGate = true;
  const urlParams = new URLSearchParams(location.search);
  const urlSel = urlParams.get('sel');
  // ?bom=<renglón> llega desde la lista de compras: selecciona la primera pieza de ese renglón
  const urlBom = urlParams.get('bom');
  let urlSelDone = false;
  // ?ensamble=<paso>&explosion=<0–1>: la mesa de dos tambores abre en ese paso del ensamble
  let asmStep: number | null = urlParams.has('ensamble') ? Math.max(1, Number(urlParams.get('ensamble')) || 1) : null;
  let asmExplode = Math.max(0, Math.min(1, Number(urlParams.get('explosion') ?? 0) || 0));
  let asmTimer = 0;

  // --- barra del visor: vistas estándar y herramientas -------------------------------------------------------------
  const views: { id: ViewId; label: string; title: string }[] = [
    { id: 'home', label: 'Inicio', title: 'Vista isométrica de toda la obra' },
    { id: 'front', label: 'Frente', title: 'Desde el lado de la lente' },
    { id: 'top', label: 'Arriba', title: 'Planta' },
    { id: 'right', label: 'Derecha', title: 'Lateral derecho' },
    { id: 'gate', label: 'Ventana', title: 'Ventana, sensor y cabeza del LED' },
    { id: 'drive', label: 'Motor', title: 'Motor y transmisión bajo el rodillo motriz' },
    { id: 'control', label: 'Electrónica', title: 'Caja de control: protoboard, ESP32, MOSFET' },
    { id: 'base', label: 'Interior', title: 'Fuente, driver y reguladores dentro de la base' },
    { id: 'screen', label: 'Pantalla', title: 'La imagen proyectada' },
    { id: 'hands', label: 'Manos', title: 'Dos tambores: las manos del visitante sobre los sensores' },
  ];
  const viewBtns = el('div', { class: 'seg' });
  let handsViewBtn: HTMLButtonElement | null = null;
  for (const v of views) {
    const b = el('button', { text: v.label, title: v.title }) as HTMLButtonElement;
    b.onclick = () => scene?.setView(v.id);
    if (v.id === 'hands') handsViewBtn = b;
    viewBtns.append(b);
  }
  const toggle = (label: string, title: string, on: boolean, cb: (v: boolean) => void) => {
    const b = el('button', { class: 'tool', text: label, title, 'aria-pressed': String(on) }) as HTMLButtonElement;
    b.onclick = () => {
      const v = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(v));
      cb(v);
    };
    return b;
  };
  const fitBtn = el('button', { class: 'tool', text: 'Encuadrar', title: 'Encuadra la pieza seleccionada (o todo). También doble clic.' }) as HTMLButtonElement;
  fitBtn.onclick = () => scene?.fit();
  const orthoBtn = toggle('Ortográfica', 'Proyección ortográfica, como en los planos', false, (v) => scene?.setProjection(v ? 'ortho' : 'persp'));
  const measureBtn = toggle('Medir', 'Haz clic en dos puntos para medir la distancia en mm. Esc cancela.', false, (v) => scene?.setMeasure(v));
  const labelsBtn = toggle('Rótulos', 'Nombres de las piezas sobre el modelo', false, (v) => scene?.setLabels(v));
  const shellBtn = toggle('Base transparente', 'Paredes de la base en transparencia para ver lo que hay dentro', true, (v) => scene?.setShell(v));
  const gateBtn = toggle('Ventana', 'Resalta el hueco de la ventana óptica', true, (v) => { highlightGate = v; });
  toolbar.append(viewBtns, el('span', { class: 'sep' }), fitBtn, orthoBtn, measureBtn, labelsBtn, shellBtn, gateBtn);
  // dos tambores: mantener presionada la tecla 1 o 2 pone la mano sobre ese tambor, a la distancia elegida
  const keyHeld = [false, false];
  window.addEventListener('keydown', (e) => {
    if (!active || (e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
    if (e.key === 'Escape') {
      if (measureBtn.getAttribute('aria-pressed') === 'true') measureBtn.click();
      else scene?.select(null);
    }
    if (e.key === 'f' || e.key === 'F') scene?.fit();
    if ((e.key === '1' || e.key === '2') && ctx.derived().reels && !e.repeat) {
      const i = Number(e.key) - 1;
      keyHeld[i] = true;
      sim.hands[i].present = true;
      handBoxes[i]?.set(true);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key !== '1' && e.key !== '2') return;
    const i = Number(e.key) - 1;
    if (!keyHeld[i]) return;
    keyHeld[i] = false;
    sim.hands[i].present = false;
    handBoxes[i]?.set(false);
  });
  const handBoxes: ({ set(v: boolean): void } | null)[] = [null, null];

  // --- navegador de piezas (árbol) --------------------------------------------------------------------------------
  let browserOpen = true;
  const openCats = new Set<PartCategory>(['transporte', 'manos', 'optica', 'control', 'potencia']);
  function renderBrowser(): void {
    if (!scene) return;
    const parts = scene.parts();
    const sel = scene.selected();
    const head = el('div', { class: 'sb-head' }, el('b', { text: 'Navegador' }), el('span', { class: 'hint', text: `${parts.length} piezas` }));
    const collapse = el('button', { class: 'tool small', text: browserOpen ? '‹' : '›', title: browserOpen ? 'Ocultar el navegador' : 'Mostrar el navegador' }) as HTMLButtonElement;
    collapse.onclick = () => {
      browserOpen = !browserOpen;
      renderBrowser();
    };
    head.append(collapse);
    browser.classList.toggle('closed', !browserOpen);
    if (!browserOpen) {
      browser.replaceChildren(head);
      return;
    }
    const list = el('div', { class: 'sb-list' });
    const byParent = new Map<string | undefined, PartNode[]>();
    for (const n of parts) {
      const k = n.parent;
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k)!.push(n);
    }
    const row = (n: PartNode, depth: number): HTMLElement[] => {
      const r = el('div', { class: `sb-row${n.id === sel ? ' on' : ''}${n.visible ? '' : ' off'}`, style: `padding-left:${8 + depth * 14}px` });
      const eye = el('button', { class: 'eye', text: n.visible ? '◉' : '○', title: n.visible ? 'Ocultar' : 'Mostrar' }) as HTMLButtonElement;
      eye.onclick = (e) => {
        e.stopPropagation();
        scene?.setVisible(n.id, !n.visible);
      };
      r.append(eye, el('span', { class: 'nm', text: n.name }));
      r.onclick = () => scene?.select(n.id);
      r.ondblclick = () => scene?.select(n.id, true);
      const kids = byParent.get(n.id) ?? [];
      return [r, ...kids.flatMap((c) => row(c, depth + 1))];
    };
    for (const cat of Object.keys(CATEGORY_LABEL) as PartCategory[]) {
      const top = (byParent.get(undefined) ?? []).filter((n) => n.category === cat);
      if (!top.length) continue;
      const open = openCats.has(cat) || top.some((n) => n.id === sel || (sel && isInside(parts, sel, n.id)));
      const h = el('div', { class: 'sb-cat' }, el('span', { text: `${open ? '▾' : '▸'} ${CATEGORY_LABEL[cat]}` }), el('span', { class: 'hint', text: String(top.length) }));
      h.onclick = () => {
        if (openCats.has(cat)) openCats.delete(cat);
        else openCats.add(cat);
        renderBrowser();
      };
      list.append(h);
      if (open) for (const n of top) list.append(...row(n, 0));
    }
    const foot = el('div', { class: 'sb-foot' });
    const all = el('button', { class: 'tool small', text: 'Mostrar todo' }) as HTMLButtonElement;
    all.onclick = () => scene?.showAll();
    foot.append(all, el('span', { class: 'hint', text: 'Clic: seleccionar · doble clic: encuadrar' }));
    browser.replaceChildren(head, list, foot);
    list.querySelector('.sb-row.on')?.scrollIntoView({ block: 'nearest' });
  }
  function isInside(parts: PartNode[], id: string, ancestor: string): boolean {
    const byId = new Map(parts.map((n) => [n.id, n]));
    for (let x = byId.get(id)?.parent; x; x = byId.get(x)?.parent) if (x === ancestor) return true;
    return false;
  }

  // --- propiedades de la pieza seleccionada -------------------------------------------------------------------------
  let isolatedId: string | null = null;
  function renderProps(): void {
    const id = scene?.selected();
    const det = id ? scene?.details(id) : null;
    props.classList.toggle('open', !!det);
    if (!det || !scene) {
      props.replaceChildren();
      return;
    }
    const n = det.node;
    const spec = det.spec;
    const p = ctx.project;
    const d = ctx.derived();
    const bom = buildParts(p, d);
    const row = n.bomId ? bom.parts.find((q) => q.id === n.bomId) : undefined;
    const note = row ? bom.notes[row.id] : undefined;
    const extra = n.bomId ? OFFERS[n.bomId] : undefined;
    const mm = (v: number) => fmtNum(v, Math.abs(v - Math.round(v)) < 0.05 ? 0 : 1);
    const close = el('button', { class: 'x', text: '×', title: 'Quitar la selección (Esc)' }) as HTMLButtonElement;
    close.onclick = () => scene?.select(null);
    const head = el('div', { class: 'sp-head' }, el('div', {}, el('div', { class: 'sp-title', text: n.name }), el('div', { class: 'hint', text: `${CATEGORY_LABEL[n.category]}${n.bomId ? ` · ${n.bomId}` : ''}` })), close);
    const fit = el('button', { class: 'tool small', text: 'Encuadrar' }) as HTMLButtonElement;
    fit.onclick = () => scene?.fit(n.id);
    const iso = el('button', { class: 'tool small', text: isolatedId === n.id ? 'Salir de aislar' : 'Aislar', 'aria-pressed': String(isolatedId === n.id) }) as HTMLButtonElement;
    iso.onclick = () => {
      isolatedId = isolatedId === n.id ? null : n.id;
      scene?.isolate(isolatedId);
      renderProps();
    };
    const hide = el('button', { class: 'tool small', text: 'Ocultar' }) as HTMLButtonElement;
    hide.onclick = () => scene?.setVisible(n.id, false);
    const actions = el('div', { class: 'sp-actions' }, fit, iso, hide);
    const dl = (pairs: [string, string | Node | undefined][]) => {
      const out = el('dl', { class: 'sp-dl' });
      for (const [k, v] of pairs) if (v !== undefined && v !== '') out.append(el('dt', { text: k }), typeof v === 'string' ? el('dd', { text: v }) : el('dd', {}, v));
      return out;
    };
    const sec = (title: string, ...body: Node[]) => el('section', { class: 'sp-sec' }, el('h4', { text: title }), ...body);
    const list = (items: string[]) => el('ul', { class: 'sp-ul' }, ...items.map((t) => el('li', { text: t })));
    const [w, dd, h] = det.modelMm;
    const real = spec?.realMm ?? (n.kind === 'roller' ? [2 * d.pathSpec.rollerRadiusMm + 4, 2 * d.pathSpec.rollerRadiusMm + 4, p.film.stripWidthMm + 11.6] as [number, number, number] : undefined);
    const body: Node[] = [];
    body.push(sec('Medidas', dl([
      ['Catálogo', real ? `${real.map(mm).join(' × ')} mm${spec?.approx ? ' (aprox.)' : ''}` : undefined],
      ['Modelo 3D', `${mm(w)} × ${mm(dd)} × ${mm(h)} mm${n.kind === 'nema17' ? ' (con eje y conector)' : ''}`],
      ['Posición', `x ${fmtNum(det.positionMm[0], 0)} · z ${fmtNum(det.positionMm[1], 0)} · y ${fmtNum(det.positionMm[2], 0)} mm`],
      ['Material', spec?.material],
    ]), el('p', { class: 'hint', text: 'Ancho × fondo × alto. La posición se mide desde el centro de la cubierta; y = 0 es su cara superior.' })));
    if (spec?.specs?.length || n.notes?.length) body.push(sec('Especificaciones', list([...(n.notes ?? []), ...(spec?.specs ?? [])])));
    if (spec?.pins?.length) body.push(sec('Conexiones', list(spec.pins)));
    if (row) {
      const unitCost = row.supplier?.unitCost;
      const link = row.supplier?.url ? el('a', { href: row.supplier.url, target: '_blank', rel: 'noopener', text: row.supplier.name ?? 'Abrir' }) : el('span', { text: row.supplier?.name ?? (row.process === 'print3d' ? 'Impresión 3D' : row.process === 'laser' ? 'Corte láser' : '—') });
      const ev = note?.evidence === 'read' ? 'precio leído' : note?.evidence === 'estimated' ? 'precio estimado' : 'sin verificar';
      body.push(sec('Compra', dl([
        ['Renglón', row.name],
        ["Cantidad", String(row.qty ?? 1)],
        ['Precio', unitCost !== undefined ? `${fmtNum(unitCost, unitCost < 10 ? 2 : 0)} MXN c/u · ${fmtNum(unitCost * (row.qty ?? 1), 0)} total (${ev})` : '—'],
        ['Dónde', link],
        ['Por qué', note?.why],
        ['Alternativa', note?.alternative],
        ['Antes de pagar', extra?.check],
      ]), ...(extra?.offers.length ? [el('div', { class: 'sp-offers' }, ...extra.offers.map((o) => el('a', { href: o.url, target: '_blank', rel: 'noopener', class: 'offer' }, el('b', { text: o.store }), el('span', { text: o.price !== undefined ? `${fmtNum(o.price, 2)} MXN${o.pack ? ` · ${o.pack}` : ''}` : o.range ? `~${o.range[0]}–${o.range[1]} MXN${o.pack ? ` · ${o.pack}` : ''}` : o.pack ?? '' }))))] : []), el('a', { class: 'tool small linkbtn', href: `./compras.html?row=${encodeURIComponent(row.id)}`, target: '_blank', text: 'Ver en la lista de compras ↗' })));
    }
    if (spec?.source) body.push(el('p', { class: 'hint', text: `Medidas: ${spec.source}.${spec.approx ? ' Aproximadas: confirmar con la pieza en mano.' : ''}` }));
    props.replaceChildren(head, actions, el('div', { class: 'sp-body' }, ...body));
  }

  const measureHint = el('div', { class: 'sim-measure-hint' });
  viewport.append(measureHint);
  function attachScene(s: MechScene): void {
    s.onSelect(() => {
      renderBrowser();
      renderProps();
    });
    s.onPartsChanged(() => {
      renderBrowser();
      renderProps();
    });
    s.onMeasure((mmv, step) => {
      measureHint.style.display = measureBtn.getAttribute('aria-pressed') === 'true' ? '' : 'none';
      measureHint.textContent = step === 2 && mmv !== null ? `Distancia: ${fmtNum(mmv, 1)} mm · clic para medir otra` : step === 1 ? 'Ahora el segundo punto' : 'Medir: clic en el primer punto';
    });
    (window as unknown as { __praxiScene?: MechScene }).__praxiScene = s;
  }

  const setTransport = (patch: Partial<TransportSpec>) => ctx.store.update((p) => ({ ...p, transport: { ...p.transport, ...patch } }));
  const setDrum = (patch: Partial<DrumStrobe>) => ctx.store.update((p) => ({ ...p, drum: { ...p.drum, ...patch } }));
  const setLed = (patch: Partial<LedStrobe>) => ctx.store.update((p) => ({ ...p, led: { ...p.led, ...patch } }));
  const setOptics = (patch: Partial<OpticsSpec>) => ctx.store.update((p) => ({ ...p, optics: { ...p.optics, ...patch } }));

  let sideKey = '';
  const readouts: Record<string, ReturnType<typeof readout>> = {};
  /** forma del recorrido: del loop a los dos tambores y de regreso */
  const layoutOptions = [
    { value: 'rectangle', label: 'Rectángulo de 4 rodillos (toca una cara)' },
    { value: 'festoon', label: 'Festón (zigzag): compacto, toca las dos caras' },
    { value: 'reels', label: 'Dos tambores: la película va y viene con la mano' },
  ];
  const setLayout = (v: string) =>
    ctx.store.update((q): Project => {
      if (v === 'reels') return reelsProject(q);
      const next: Project = { ...q, pathLayout: v as 'rectangle' | 'festoon', festoon: q.festoon ?? { passes: festoonPasses(ctx.derived().layout.loopLengthMm, q.path.rollerRadiusMm), frontGapMm: 90 }, film: { ...q.film, spliceType: q.film.spliceType === 'none' ? 'tape' : q.film.spliceType } };
      if (q.pathLayout !== 'reels') return next;
      // del recorrido abierto al loop: el motor vuelve a seguir los FPS de proyección
      const r = autoSync(next.targetFps, deriveProject(next).layout, next.transport, next.path.rollerRadiusMm, next.led);
      return { ...next, transport: { ...r.transport, tensionN: 2 } };
    });
  function buildSide(): void {
    const p = ctx.project;
    const d = ctx.derived();
    // la vista «Manos» solo tiene sentido con los dos tambores
    if (handsViewBtn) handsViewBtn.style.display = d.reels ? '' : 'none';
    if (d.reels) return buildReelsSide(p, d);
    const k = JSON.stringify({ t: p.transport, path: p.path.rollerRadiusMm, aspect: p.pathAspect, layout: p.pathLayout, festoon: p.festoon, lam: p.film.laminate ?? null, auto: p.autoPath, gate: p.path.gateMm, kind: p.strobeKind, drum: p.drum, led: p.led, o: p.optics, fps: p.targetFps, ts: p.ui.timeScale, playing: p.ui.playing, w: d.warnings.length, af: p.animation.fps });
    if (k === sideKey) {
      updateReadouts();
      return;
    }
    sideKey = k;
    handBoxes[0] = handBoxes[1] = null;
    const motor = MOTORS.find((m) => m.id === p.transport.motorId) ?? MOTORS[0];
    const orep = opticsReport(p.optics);
    side.replaceChildren(el('h3', { text: 'Mechanical Simulation' }));
    side.append(
      group('Control', [
        el('div', { class: 'btn-row' },
          button(p.ui.playing ? '⏸ Pausa' : '▶ Marcha', () => ctx.store.update((q) => ({ ...q, ui: { ...q.ui, playing: !q.ui.playing } })), { kind: 'primary' }),
          button(p.transport.running ? 'Parar motor' : 'Arrancar motor', () => setTransport({ running: !p.transport.running })),
          button('Reiniciar (fotograma 0 en ventana)', () => sim.reset(), { kind: 'ghost' }),
        ),
        numberControl({ label: 'Escala de tiempo', value: p.ui.timeScale, min: 0.01, max: 2, step: 0.01, onChange: (v) => ctx.store.update((q) => ({ ...q, ui: { ...q.ui, timeScale: v } })), help: '0,05 = cámara lenta para ver cada destello' }).root,
        numberControl({ label: 'FPS de proyección objetivo', value: p.targetFps, min: 1, max: 60, step: 0.1, decimals: 1, onChange: (v) => ctx.store.update((q) => ({ ...q, targetFps: v })), help: 'Normalmente igual a los FPS de la animación' }).root,
        button('Sincronizar motor y estroboscopio con los FPS', () => ctx.store.update((q) => {
          const dd = ctx.derived();
          const r = autoSync(q.targetFps, dd.layout, q.transport, dd.pathSpec.rollerRadiusMm, q.strobeKind === 'drum' ? q.drum : q.led);
          return { ...q, transport: r.transport, ...(q.strobeKind === 'drum' ? { drum: r.strobe as DrumStrobe } : { led: r.strobe as LedStrobe }) };
        }), { kind: 'primary' }),
      ]),
      group('Transporte', [
        selectControl({ label: 'Motor (catálogo OMEGA)', value: p.transport.motorId, options: MOTORS.map((m) => ({ value: m.id, label: m.label })), onChange: (v) => setTransport({ motorId: v }) }).root,
        el('p', { class: 'hint', text: `${motor.type} · ${motor.voltageV} V · ${motor.currentA} A · ${fmtNum(motor.torqueNcm, 1)} N·cm · máx. ${motor.maxRpm} rpm · ${motor.noiseDb} dB(A)` }),
        numberControl({ label: 'RPM del motor', value: p.transport.motorRpm, min: 0, max: Math.max(600, motor.maxRpm * 1.5), step: 0.1, unit: 'rpm', decimals: 1, onChange: (v) => setTransport({ motorRpm: v }) }).root,
        numberControl({ label: 'Reducción (motor : rodillo)', value: p.transport.gearRatio, min: 0.1, max: 50, step: 0.1, decimals: 2, onChange: (v) => setTransport({ gearRatio: v }) }).root,
        numberControl({ label: 'Radio de los rodillos', value: p.path.rollerRadiusMm, min: 5, max: 100, step: 0.5, unit: 'mm', decimals: 1, onChange: (v) => ctx.store.update((q) => ({ ...q, path: { ...q.path, rollerRadiusMm: v } })) }).root,
        numberControl({ label: 'Deslizamiento', value: p.transport.slip * 100, min: 0, max: 20, step: 0.1, unit: '%', decimals: 1, onChange: (v) => setTransport({ slip: v / 100 }) }).root,
        numberControl({ label: 'Tensión de la cinta', value: p.transport.tensionN, min: 0, max: 5, step: 0.1, unit: 'N', decimals: 1, onChange: (v) => setTransport({ tensionN: v }) }).root,
        numberControl({ label: 'Error deliberado de velocidad', value: p.transport.speedErrorPct, min: -20, max: 20, step: 0.1, unit: '%', decimals: 2, onChange: (v) => setTransport({ speedErrorPct: v }), help: 'Para estudiar la pérdida de sincronía' }).root,
      ]),
      group('Recorrido', [
        checkbox('Diseñar el recorrido automáticamente para la película', p.autoPath, (v) => ctx.store.update((q) => ({ ...q, autoPath: v }))).root,
        selectControl({ label: 'Película', value: p.film.laminate ? 'laminated' : 'single', options: [{ value: 'laminated', label: 'Laminada: una cubierta tapa la tinta' }, { value: 'single', label: 'Sencilla: la tinta queda expuesta' }], onChange: (v) => ctx.store.update((q) => ({ ...q, film: { ...q.film, laminate: v === 'laminated' ? { ...DEFAULT_LAMINATE } : undefined } })), help: 'Laminada, los rodillos pueden tocar las dos caras y cabe el festón (ADR-0010)' }).root,
        ...(p.film.laminate
          ? [
              numberControl({ label: 'Base', value: p.film.laminate.baseMm, min: 0.05, max: 1, step: 0.001, unit: 'mm', decimals: 3, onChange: (v) => ctx.store.update((q) => ({ ...q, film: { ...q.film, laminate: { coverMm: q.film.laminate?.coverMm ?? DEFAULT_LAMINATE.coverMm, baseMm: v } } })), help: 'Calibre 5 = 0,127 mm · 7,5 = 0,19 mm · 10 = 0,254 mm (milésimas de pulgada)' }).root,
              numberControl({ label: 'Cubierta', value: p.film.laminate.coverMm, min: 0.02, max: 1, step: 0.005, unit: 'mm', decimals: 3, onChange: (v) => ctx.store.update((q) => ({ ...q, film: { ...q.film, laminate: { baseMm: q.film.laminate?.baseMm ?? DEFAULT_LAMINATE.baseMm, coverMm: v } } })), help: 'Laminado en frío brillante de 75–80 µm con su adhesivo: unos 0,09 mm' }).root,
              readout('Grosor y rigidez', d.bending ? `${fmtNum(d.bending.thicknessMm, 3)} mm · doblarla pide ${fmtNum(100 * d.bending.stiffnessRatio, 1)} % de la tensión` : '—').root,
            ]
          : []),
        selectControl({ label: 'Forma', value: p.pathLayout ?? 'rectangle', options: layoutOptions, onChange: setLayout, help: 'Dos tambores (ADR-0011): sin loop, la mano del visitante jala la película hacia un tambor o el otro' }).root,
        ...(p.pathLayout === 'festoon'
          ? [
              numberControl({ label: 'Pasadas del festón', value: p.festoon?.passes ?? 4, min: 1, max: 12, step: 1, onChange: (v) => ctx.store.update((q) => ({ ...q, festoon: { passes: Math.round(v), frontGapMm: q.festoon?.frontGapMm ?? 90 } })), disabled: !p.autoPath, help: 'Rodillos de la fila cercana a la ventana: más pasadas = mesa más ancha y menos profunda' }).root,
              numberControl({ label: 'Hueco para el LED', value: p.festoon?.frontGapMm ?? 90, min: 60, max: 200, step: 5, unit: 'mm', onChange: (v) => ctx.store.update((q) => ({ ...q, festoon: { passes: q.festoon?.passes ?? 4, frontGapMm: v } })), disabled: !p.autoPath, help: 'Entre el tramo de la ventana y la fila de rodillos más cercana' }).root,
            ]
          : [numberControl({ label: 'Proporción del rectángulo (a/b)', value: p.pathAspect, min: 1, max: 6, step: 0.1, decimals: 2, onChange: (v) => ctx.store.update((q) => ({ ...q, pathAspect: v })), disabled: !p.autoPath }).root]),
        readout('Mesa (rodillos)', rollerFootprint(d)).root,
        readout('Rodillos por cara', `${d.faces.lampSide} lámpara · ${d.faces.lensSide} lente`).root,
        readout('Tinta', `hacia la ${d.faces.ink === 'lens' ? 'lente' : 'lámpara'} · ${!d.faces.inkTouched ? 'no la toca ningún rodillo' : d.faces.covered ? `cubierta: ${d.faces.inkTouched} rodillos tocan la cubierta` : `la rozan ${d.faces.inkTouched} rodillos`}`).root,
        numberControl({ label: 'Posición de la ventana', value: d.pathSpec.gateMm, min: 0, max: Math.max(1, d.path.lengthMm), step: 1, unit: 'mm', onChange: (v) => ctx.store.update((q) => ({ ...q, autoPath: false, path: { ...ctx.derived().pathSpec, gateMm: v } })), help: 'A lo largo del recorrido; debe caer en un tramo recto' }).root,
        readout('Longitud del recorrido', `${fmtNum(d.path.lengthMm, 1)} mm (recto ${fmtNum(d.path.straightMm, 1)} mm)`).root,
        readout('Rodillos', d.pathSpec.rollers.map((r) => `(${fmtNum(r.x, 0)}, ${fmtNum(r.y, 0)})`).join(' ')).root,
        el('p', { class: `coherence ${d.coherence.level}`, text: d.coherence.message }),
      ]),
      group('Estroboscopio', [
        selectControl({ label: 'Tipo', value: p.strobeKind, options: [{ value: 'drum', label: 'Tambor analógico ranurado' }, { value: 'led', label: 'LED digital de alta potencia' }], onChange: (v) => ctx.store.update((q) => ({ ...q, strobeKind: v })) }).root,
        ...(p.strobeKind === 'drum'
          ? [
              numberControl({ label: 'Ranuras', value: p.drum.slots, min: 1, max: 48, step: 1, onChange: (v) => setDrum({ slots: Math.round(v) }) }).root,
              numberControl({ label: 'RPM del tambor', value: p.drum.rpm, min: 0, max: 3000, step: 0.1, unit: 'rpm', decimals: 1, onChange: (v) => setDrum({ rpm: v }) }).root,
              numberControl({ label: 'Radio del tambor', value: p.drum.drumRadiusMm, min: 10, max: 200, step: 1, unit: 'mm', onChange: (v) => setDrum({ drumRadiusMm: v }) }).root,
              numberControl({ label: 'Ancho de ranura', value: p.drum.slotWidthMm, min: 0.2, max: 30, step: 0.1, unit: 'mm', decimals: 1, onChange: (v) => setDrum({ slotWidthMm: v }) }).root,
              numberControl({ label: 'Abertura fija', value: p.drum.apertureWidthMm, min: 0.2, max: 30, step: 0.1, unit: 'mm', decimals: 1, onChange: (v) => setDrum({ apertureWidthMm: v }) }).root,
              numberControl({ label: 'Fase del tambor', value: p.drum.phaseDeg, min: -180, max: 180, step: 0.1, unit: '°', decimals: 1, onChange: (v) => setDrum({ phaseDeg: v }) }).root,
              numberControl({ label: 'Error deliberado de velocidad', value: p.drum.speedErrorPct, min: -20, max: 20, step: 0.1, unit: '%', decimals: 2, onChange: (v) => setDrum({ speedErrorPct: v }) }).root,
              numberControl({ label: 'Lámpara continua', value: p.drum.lampLumens, min: 0, max: 20000, step: 50, unit: 'lm', onChange: (v) => setDrum({ lampLumens: v }) }).root,
              numberControl({ label: 'Temperatura de color', value: p.drum.lampKelvin, min: 1800, max: 8000, step: 50, unit: 'K', onChange: (v) => setDrum({ lampKelvin: v }) }).root,
            ]
          : [
              numberControl({ label: 'Frecuencia', value: p.led.frequencyHz, min: 0, max: 120, step: 0.01, unit: 'Hz', decimals: 3, onChange: (v) => setLed({ frequencyHz: v }) }).root,
              numberControl({ label: 'Duración del pulso', value: p.led.pulseUs, min: 5, max: 20000, step: 5, unit: 'µs', onChange: (v) => setLed({ pulseUs: v }) }).root,
              numberControl({ label: 'Desfase', value: p.led.phaseMs, min: -50, max: 50, step: 0.01, unit: 'ms', decimals: 3, onChange: (v) => setLed({ phaseMs: v }) }).root,
              numberControl({ label: 'Error deliberado de frecuencia', value: p.led.freqErrorPct, min: -20, max: 20, step: 0.01, unit: '%', decimals: 3, onChange: (v) => setLed({ freqErrorPct: v }) }).root,
              numberControl({ label: 'Jitter', value: p.led.jitterUs, min: 0, max: 5000, step: 10, unit: 'µs', onChange: (v) => setLed({ jitterUs: v }) }).root,
              numberControl({ label: 'Flujo de pico', value: p.led.peakLumens, min: 0, max: 100000, step: 500, unit: 'lm', onChange: (v) => setLed({ peakLumens: v }) }).root,
              numberControl({ label: 'Temperatura de color', value: p.led.kelvin, min: 1800, max: 8000, step: 50, unit: 'K', onChange: (v) => setLed({ kelvin: v }) }).root,
              selectControl({ label: 'Disparo', value: p.led.trigger, options: [{ value: 'clock', label: 'Reloj propio' }, { value: 'sensor', label: 'Sensor sobre marcas de sincronía' }], onChange: (v) => setLed({ trigger: v }) }).root,
            ]),
      ]),
      group('Óptica', [
        numberControl({ label: 'Focal de la lente', value: p.optics.focalMm, min: 10, max: 300, step: 1, unit: 'mm', onChange: (v) => setOptics({ focalMm: v }) }).root,
        numberControl({ label: 'Número f', value: p.optics.fNumber, min: 1, max: 16, step: 0.1, decimals: 1, onChange: (v) => setOptics({ fNumber: v }) }).root,
        numberControl({ label: 'Distancia película–lente', value: p.optics.filmToLensMm, min: 5, max: 400, step: 0.01, unit: 'mm', decimals: 2, onChange: (v) => setOptics({ filmToLensMm: v }) }).root,
        button(`Enfocar (${fmtNum(focusFor(p.optics), 2)} mm)`, () => setOptics({ filmToLensMm: Math.round(focusFor(ctx.project.optics) * 100) / 100 }), { kind: 'ghost' }),
        numberControl({ label: 'Distancia de proyección', value: p.optics.throwMm, min: 200, max: 10000, step: 10, unit: 'mm', onChange: (v) => setOptics({ throwMm: v }) }).root,
        numberControl({ label: 'Ventana: ancho', value: p.optics.gateWidthMm, min: 1, max: 200, step: 0.5, unit: 'mm', decimals: 1, onChange: (v) => setOptics({ gateWidthMm: v }) }).root,
        numberControl({ label: 'Ventana: alto', value: p.optics.gateHeightMm, min: 1, max: 200, step: 0.5, unit: 'mm', decimals: 1, onChange: (v) => setOptics({ gateHeightMm: v }) }).root,
        numberControl({ label: 'Eficiencia del condensador', value: p.optics.condenserEfficiency, min: 0.01, max: 1, step: 0.01, onChange: (v) => setOptics({ condenserEfficiency: v }) }).root,
        numberControl({ label: 'Ganancia de pantalla', value: p.optics.screenGain, min: 0.5, max: 3, step: 0.1, decimals: 1, onChange: (v) => setOptics({ screenGain: v }) }).root,
        numberControl({ label: 'Luz ambiente en pantalla', value: p.optics.ambientLux, min: 0, max: 500, step: 1, unit: 'lux', onChange: (v) => setOptics({ ambientLux: v }) }).root,
        checkbox('Película montada invertida (compensa la lente)', p.optics.filmMountedInverted, (v) => setOptics({ filmMountedInverted: v })).root,
        checkbox('Espejo de reenvío', p.optics.mirror, (v) => setOptics({ mirror: v })).root,
        readout('Aumento', `×${fmtNum(orep.magnification, 2)} → imagen ${fmtNum(orep.imageWidthMm, 0)} × ${fmtNum(orep.imageHeightMm, 0)} mm`).root,
        readout('Desenfoque', `${fmtNum(orep.blurCircleMm, 2)} mm en pantalla`).root,
      ]),
      group('Sincronía: objetivo frente a real', [
        (readouts.speed = readout('Velocidad de cinta', '')).root,
        (readouts.rollerRpm = readout('RPM del rodillo', '')).root,
        (readouts.motorRpm = readout('RPM del motor', '')).root,
        (readouts.drum = readout(p.strobeKind === 'drum' ? 'RPM del tambor' : 'Frecuencia del LED', '')).root,
        (readouts.flash = readout('Destellos / fotogramas por s', '')).root,
        (readouts.beat = readout('Desfase (batido)', '')).root,
        (readouts.exposure = readout('Duración del destello / máx.', '')).root,
        (readouts.blur = readout('Desenfoque por movimiento', '')).root,
        (readouts.bright = readout('Brillo estimado', '')).root,
        (readouts.torque = readout('Par: necesario / disponible', '')).root,
        (readouts.gate = readout('En la ventana', '')).root,
      ]),
      group('Avisos', [warningsList(d.warnings)]),
    );
    updateReadouts();
  }

  // --- dos tambores (ADR-0011): las manos del visitante, el programa del ESP32 y lo que pasa en vivo ------------------
  const rr: Record<string, ReturnType<typeof readout>> = {};
  const specOf = (q: Project): ReelsSpec => q.reels ?? defaultReelsSpec({ coreDiameterMm: 2 * q.path.rollerRadiusMm });
  const setReels = (patch: Partial<ReelsSpec>) => ctx.store.update((q) => ({ ...q, reels: { ...specOf(q), ...patch } }));
  const setControl = (patch: Partial<ReelControlSpec>) => ctx.store.update((q) => ({ ...q, reels: { ...specOf(q), control: { ...specOf(q).control, ...patch } } }));
  const STATE_HINT: Record<string, string> = {
    quieta: 'quieta en un cuadro iluminado',
    'hacia el tambor 1': 'hacia el tambor 1: la animación avanza',
    'hacia el tambor 2': 'hacia el tambor 2: la animación va al revés',
    frenando: 'frenando para quedar en un cuadro',
    'al final': 'al final de la película: espera al otro tambor',
    'regresa sola': 'regresa sola al otro extremo',
    invita: 'sin visitantes: va y viene despacio para invitar',
  };

  /** ensamble paso a paso de la mesa de dos tambores: lo que se arma, en qué orden y con qué piezas (ADR-0012) */
  function assemblyGroup(): HTMLElement {
    const steps = assemblySteps();
    const n = steps.length;
    const stopPlay = () => {
      if (asmTimer) window.clearInterval(asmTimer);
      asmTimer = 0;
    };
    const go = (k: number | null, keepPlay = false) => {
      if (!keepPlay) stopPlay();
      asmStep = k === null ? null : Math.max(1, Math.min(n, k));
      scene?.setAssembly(asmStep, asmExplode);
      sideKey = '';
      buildSide();
    };
    const play = () => {
      stopPlay();
      go(1, true);
      asmTimer = window.setInterval(() => {
        if (asmStep === null || asmStep >= n) {
          stopPlay();
          sideKey = '';
          buildSide();
          return;
        }
        go(asmStep + 1, true);
      }, 1800);
    };
    const cur = asmStep ? steps[asmStep - 1] : null;
    return group('Ensamble sin tornillos', [
      el('p', { class: 'hint', text: 'Piso y cubierta de MDF de 5,5 mm y paredes de acrílico transparente de 3 mm, cortados con láser y armados a mano: las paredes quedan atrapadas en ranuras del piso y de la cubierta, para que se vea la electrónica, y la tapa trasera se aprieta con dos cuñas. Cada pieza lleva grabado su código (E: MDF, A: acrílico, N: acrílico negro); las impresas en 3D empiezan con I. El único tornillo es el prisionero del cople.' }),
      el('div', { class: 'btn-row' },
        button('◀', () => go((asmStep ?? n + 1) - 1), { kind: 'ghost', title: 'Paso anterior' }),
        button(asmStep ? `Paso ${asmStep} de ${n}` : `Ver los ${n} pasos`, () => go(asmStep ?? 1), { kind: asmStep ? 'default' : 'primary' }),
        button('▶', () => go((asmStep ?? 0) + 1), { kind: 'ghost', title: 'Paso siguiente' }),
        button(asmTimer ? '⏸ Detener' : '▶ Armar', () => {
          if (asmTimer) {
            stopPlay();
            sideKey = '';
            buildSide();
          } else play();
        }, { kind: 'ghost', title: 'Recorre los pasos uno tras otro' }),
        button('Mesa armada', () => {
          asmExplode = 0;
          go(null);
        }, { kind: 'ghost' }),
      ),
      numberControl({ label: 'Explosión', value: asmExplode, min: 0, max: 1, step: 0.05, decimals: 2, onChange: (v) => {
        asmExplode = v;
        if (asmStep === null) asmStep = n;
        scene?.setAssembly(asmStep, asmExplode);
      }, help: 'Separa las piezas ya armadas para ver cómo encajan' }).root,
      cur
        ? el('div', { class: 'asm-step' }, el('b', { text: `${cur.n}. ${cur.title}` }), el('ol', {}, ...cur.text.map((t) => el('li', { text: t }))), el('p', { class: 'hint', text: `Entran: ${cur.parts.join(' · ')}` }))
        : el('p', { class: 'hint', text: steps.map((q) => `${q.n}. ${q.title}`).join(' · ') }),
      el('p', { class: 'hint' }, 'Archivos y textos para el taller: ', el('a', { href: 'compras.html?demo=tambores#fabricacion', target: '_blank', text: 'corte láser e impresión 3D' })),
    ]);
  }

  function buildReelsSide(p: Project, d: ReturnType<AppContext['derived']>): void {
    const r = d.reels!;
    const c = r.spec.control;
    const k = JSON.stringify({ reels: r.spec, t: p.transport, lam: p.film.laminate ?? null, led: p.led, o: p.optics, fps: p.targetFps, ts: p.ui.timeScale, playing: p.ui.playing, w: d.warnings.length, af: p.animation.fps, kind: p.strobeKind });
    if (k === sideKey) {
      updateReelReadouts();
      return;
    }
    sideKey = k;
    const orep = opticsReport(p.optics);
    const handRow = (i: 0 | 1) => {
      const box = checkbox(`Mano sobre el tambor ${i + 1} · ${i === 0 ? 'la animación avanza' : 'va al revés'}`, sim.hands[i].present, (v) => (sim.hands[i].present = v), `Tecla ${i + 1}: mantenla presionada para poner la mano`);
      handBoxes[i] = box;
      const dist = numberControl({ label: `Altura sobre el sensor ${i + 1}`, value: sim.hands[i].distanceMm / 10, min: 0.2, max: 45, step: 0.1, unit: 'cm', decimals: 1, onChange: (v) => (sim.hands[i].distanceMm = v * 10), help: 'Más cerca, más rápido. Más allá del alcance de la tabla no cuenta' });
      return [box.root, dist.root];
    };
    const place = (i: 0 | 1 | null, cm = 15) => {
      for (const j of [0, 1] as const) {
        sim.hands[j].present = j === i;
        if (j === i) sim.hands[j].distanceMm = cm * 10;
        handBoxes[j]?.set(j === i);
      }
      sideKey = '';
      buildSide();
    };
    const mapRows = c.speedMap.map(([dist, fps], idx) =>
      el('div', { class: 'btn-row' },
        numberControl({ label: `Punto ${idx + 1}: distancia`, value: dist / 10, min: 0.1, max: 120, step: 0.5, unit: 'cm', decimals: 1, noSlider: true, onChange: (v) => setControl({ speedMap: c.speedMap.map((m, j) => (j === idx ? [v * 10, m[1]] : m)) as [number, number][] }) }).root,
        numberControl({ label: 'velocidad', value: fps, min: 1, max: 60, step: 1, unit: 'fps', noSlider: true, onChange: (v) => setControl({ speedMap: c.speedMap.map((m, j) => (j === idx ? [m[0], v] : m)) as [number, number][] }) }).root,
      ),
    );
    side.replaceChildren(el('h3', { text: 'Mechanical Simulation · dos tambores' }));
    side.append(
      group('Control', [
        el('div', { class: 'btn-row' },
          button(p.ui.playing ? '⏸ Pausa' : '▶ Marcha', () => ctx.store.update((q) => ({ ...q, ui: { ...q.ui, playing: !q.ui.playing } })), { kind: 'primary' }),
          button('Reiniciar (fotograma 1 en ventana)', () => sim.reset(), { kind: 'ghost' }),
        ),
        numberControl({ label: 'Escala de tiempo', value: p.ui.timeScale, min: 0.01, max: 2, step: 0.01, onChange: (v) => ctx.store.update((q) => ({ ...q, ui: { ...q.ui, timeScale: v } })), help: '0,05 = cámara lenta para ver cada destello' }).root,
      ]),
      assemblyGroup(),
      group('Manos del visitante', [
        el('p', { class: 'hint', text: 'La mano sobre un tambor jala la película hacia él, más rápido entre más cerca; al retirarla, frena y se queda en un cuadro. Las teclas 1 y 2 ponen la mano mientras las mantienes presionadas.' }),
        ...handRow(0),
        ...handRow(1),
        el('div', { class: 'btn-row' }, button('Mano a 15 cm · tambor 1', () => place(0), { kind: 'ghost' }), button('Mano a 15 cm · tambor 2', () => place(1), { kind: 'ghost' }), button('Retirar las manos', () => place(null), { kind: 'ghost' })),
        (rr.state = readout('Estado', '')).root,
        (rr.speed = readout('Velocidad', '')).root,
        (rr.gate = readout('En la ventana', '')).root,
        (rr.sensed = readout('Lecturas de los sensores', '')).root,
        (rr.pulse = readout('Destello ahora', '')).root,
      ]),
      group('Programa del ESP32', [
        selectControl({ label: 'Dos manos a la vez', value: c.twoHands, options: [{ value: 'first', label: 'Manda la primera que llegó' }, { value: 'nearest', label: 'Manda la más cercana' }, { value: 'stop', label: 'La película se detiene' }], onChange: (v) => setControl({ twoHands: v }) }).root,
        selectControl({ label: 'Sin visitantes', value: c.idle, options: [{ value: 'hold', label: 'Quieta en un cuadro iluminado' }, { value: 'attract', label: 'Va y viene sola despacio para invitar' }], onChange: (v) => setControl({ idle: v }) }).root,
        ...(c.idle === 'attract' ? [numberControl({ label: 'Invita después de', value: c.idleS, min: 2, max: 300, step: 1, unit: 's', onChange: (v) => setControl({ idleS: v }) }).root, numberControl({ label: 'Velocidad al invitar', value: c.attractFps, min: 1, max: 30, step: 1, unit: 'fps', onChange: (v) => setControl({ attractFps: v }) }).root] : []),
        selectControl({ label: 'Al final de la película', value: c.atEnd, options: [{ value: 'wait', label: 'Espera a que alguien use el otro tambor' }, { value: 'return', label: 'Regresa sola al otro extremo' }], onChange: (v) => setControl({ atEnd: v }) }).root,
        el('p', { class: 'hint', text: 'De la mano a la velocidad (punto de partida para ajustar en la prueba de banco): entre los puntos se interpola; más lejos que el primero no hay mano.' }),
        ...mapRows,
        numberControl({ label: 'Aceleración máxima', value: c.accelMmS2 / 1000, min: 0.2, max: 10, step: 0.1, unit: 'm/s²', decimals: 1, onChange: (v) => setControl({ accelMmS2: v * 1000 }), help: 'De quieta a 24 fps en 0,4 s con 2 m/s²' }).root,
        numberControl({ label: 'La mano espera', value: c.dwellMs, min: 0, max: 1000, step: 10, unit: 'ms', onChange: (v) => setControl({ dwellMs: v }), help: 'Una cabeza o la ropa que pasan no mueven la película' }).root,
        checkbox('Compensar el borde de la marca en reversa', c.compensateMarkEdge, (v) => setControl({ compensateMarkEdge: v }), 'Al regresar el sensor ve primero el otro borde de la marca, 3 mm antes: sin compensar, la imagen salta al cambiar de sentido').root,
        selectControl({ label: 'Sensor de mano', value: r.spec.sensor, options: [{ value: 'vl53l4cd', label: 'VL53L4CD (para la mesa)' }, { value: 'vl53l0x', label: 'VL53L0X (para la prueba de banco)' }], onChange: (v) => setReels({ sensor: v }), help: r.sensor.note }).root,
      ]),
      group('Tambores', [
        (rr.reel1 = readout('Tambor 1', '')).root,
        (rr.reel2 = readout('Tambor 2', '')).root,
        (rr.dancer = readout('Brazo tensor (AS5600)', '')).root,
        readout('Tambor lleno', `Ø${fmtNum(2 * r.design.fullR, 1)} mm con ${fmtNum(r.design.maxWoundMm / 1000, 2)} m · bridas de Ø${fmtNum(r.spec.flangeDiameterMm, 0)} (${fmtNum(r.design.geometry.flangeR - r.design.fullR, 1)} mm de margen)`).root,
        readout('Colas transparentes', `${fmtNum(r.design.tail1Mm, 0)} mm (tambor 1) y ${fmtNum(r.design.tail2Mm, 0)} mm (tambor 2): ${r.spec.tailTurns} vuelta en el núcleo con la película en un extremo`).root,
        readout('Película', `${fmtNum(d.layout.totalLengthMm / 1000, 2)} m de fotogramas + colas = ${fmtNum(r.design.totalMm / 1000, 2)} m; comprar ${fmtNum(r.filmToBuyM, 1)} m`).root,
        readout('Mesa', (() => {
          const b = buildReelsAssembly(p, d).base;
          return `${fmtNum(b.x1 - b.x0, 0)} × ${fmtNum(b.z1 - b.z0, 0)} × ${fmtNum(b.deckT + b.innerH + b.floorT, 0)} mm, con la electrónica dentro`;
        })()).root,
        readout('Rpm de los motores', `a ${r.fps.normal} fps de ${fmtNum(r.rpm.normalFull, 0)} a ${fmtNum(r.rpm.normalCore, 0)}; a ${r.fps.max} fps hasta ${fmtNum(r.rpm.maxCore, 0)}`).root,
        readout('Par: necesario / disponible', `${fmtNum(r.torque.rollerTorqueNcm, 1)} / ${fmtNum(r.torque.availableNcm, 1)} N·cm a ${fmtNum(r.torque.motorRpm, 0)} rpm (margen ×${fmtNum(r.torque.margin, 1)})`, r.torque.margin >= 1.5 ? undefined : 'Margen bajo').root,
        numberControl({ label: 'Tensión del brazo tensor', value: p.transport.tensionN, min: 0.5, max: 4, step: 0.1, unit: 'N', decimals: 1, onChange: (v) => setTransport({ tensionN: v }) }).root,
        numberControl({ label: 'Núcleo de los tambores', value: r.spec.coreDiameterMm, min: 40, max: 200, step: 0.1, unit: 'mm', decimals: 1, onChange: (v) => setReels({ coreDiameterMm: v }) }).root,
        numberControl({ label: 'Bridas', value: r.spec.flangeDiameterMm, min: 60, max: 300, step: 1, unit: 'mm', onChange: (v) => setReels({ flangeDiameterMm: v }) }).root,
        numberControl({ label: 'Entre centros de los tambores', value: r.spec.spacingMm, min: 120, max: 600, step: 1, unit: 'mm', onChange: (v) => setReels({ spacingMm: v }) }).root,
        numberControl({ label: 'Guías', value: r.spec.guideDiameterMm, min: 20, max: 120, step: 1, unit: 'mm', onChange: (v) => setReels({ guideDiameterMm: v }) }).root,
        numberControl({ label: 'Rodillo del brazo tensor', value: r.spec.dancerDiameterMm, min: 16, max: 80, step: 1, unit: 'mm', onChange: (v) => setReels({ dancerDiameterMm: v }) }).root,
        numberControl({ label: 'Vueltas de cola en el núcleo', value: r.spec.tailTurns, min: 0.5, max: 4, step: 0.5, decimals: 1, onChange: (v) => setReels({ tailTurns: v }) }).root,
      ]),
      group('Recorrido y película', [
        selectControl({ label: 'Forma', value: 'reels', options: layoutOptions, onChange: setLayout }).root,
        selectControl({ label: 'Película', value: p.film.laminate ? 'laminated' : 'single', options: [{ value: 'laminated', label: 'Laminada: una cubierta tapa la tinta' }, { value: 'single', label: 'Sencilla: la tinta queda expuesta' }], onChange: (v) => ctx.store.update((q) => ({ ...q, film: { ...q.film, laminate: v === 'laminated' ? { ...DEFAULT_LAMINATE } : undefined } })), help: 'En un tambor cada vuelta se aprieta contra la siguiente: tiene que ser laminada' }).root,
        ...(p.film.laminate
          ? [
              numberControl({ label: 'Base', value: p.film.laminate.baseMm, min: 0.05, max: 1, step: 0.001, unit: 'mm', decimals: 3, onChange: (v) => ctx.store.update((q) => ({ ...q, film: { ...q.film, laminate: { coverMm: q.film.laminate?.coverMm ?? DEFAULT_LAMINATE.coverMm, baseMm: v } } })) }).root,
              numberControl({ label: 'Cubierta', value: p.film.laminate.coverMm, min: 0.02, max: 1, step: 0.005, unit: 'mm', decimals: 3, onChange: (v) => ctx.store.update((q) => ({ ...q, film: { ...q.film, laminate: { baseMm: q.film.laminate?.baseMm ?? DEFAULT_LAMINATE.baseMm, coverMm: v } } })) }).root,
            ]
          : []),
        readout('Grosor y rigidez', d.bending ? `${fmtNum(d.bending.thicknessMm, 3)} mm · núcleo ${fmtNum(100 * d.bending.stiffnessRatio, 1)} % · guías ${fmtNum(100 * r.guideBending.stiffnessRatio, 1)} % de la tensión` : '—').root,
        readout('Caras', `tambores y guías tocan la lámpara; el brazo tensor, la cubierta (abraza ${fmtNum(r.dancerWrapDeg, 0)}°)`).root,
        readout('Recorrido libre', `${fmtNum(d.path.lengthMm, 0)} mm de tambor a tambor · ventana a ${fmtNum(d.pathSpec.gateMm, 0)} mm`).root,
        el('p', { class: `coherence ${d.coherence.level}`, text: d.coherence.message }),
      ]),
      group('Luz', [
        readout('Destello', `${fmtNum(r.pulseUs.slow, 0)} µs a ${r.fps.min} fps · ${fmtNum(r.pulseUs.normal, 0)} µs a ${r.fps.normal} · ${fmtNum(r.pulseUs.fast, 0)} µs a ${r.fps.max}`).root,
        readout('Quieta', `pulsos de ${fmtNum(r.pulseUs.still, 1)} µs a ${c.stillHz} Hz: la misma luz promedio (${fmtNum(100 * r.duty, 2)} % del tiempo)`).root,
        numberControl({ label: 'Corrimiento máximo por destello', value: c.maxBlurMm, min: 0.02, max: 0.5, step: 0.01, unit: 'mm', decimals: 2, onChange: (v) => setControl({ maxBlurMm: v }) }).root,
        numberControl({ label: 'Pulsos con la película quieta', value: c.stillHz, min: 60, max: 2000, step: 10, unit: 'Hz', onChange: (v) => setControl({ stillHz: v }) }).root,
        numberControl({ label: 'Flujo de pico', value: p.led.peakLumens, min: 0, max: 100000, step: 500, unit: 'lm', onChange: (v) => setLed({ peakLumens: v }) }).root,
        numberControl({ label: 'Jitter', value: p.led.jitterUs, min: 0, max: 5000, step: 5, unit: 'µs', onChange: (v) => setLed({ jitterUs: v }) }).root,
      ]),
      group('Óptica', [
        numberControl({ label: 'Focal de la lente', value: p.optics.focalMm, min: 10, max: 300, step: 1, unit: 'mm', onChange: (v) => setOptics({ focalMm: v }) }).root,
        numberControl({ label: 'Distancia película–lente', value: p.optics.filmToLensMm, min: 5, max: 400, step: 0.01, unit: 'mm', decimals: 2, onChange: (v) => setOptics({ filmToLensMm: v }) }).root,
        button(`Enfocar (${fmtNum(focusFor(p.optics), 2)} mm)`, () => setOptics({ filmToLensMm: Math.round(focusFor(ctx.project.optics) * 100) / 100 }), { kind: 'ghost' }),
        numberControl({ label: 'Distancia de proyección', value: p.optics.throwMm, min: 200, max: 10000, step: 10, unit: 'mm', onChange: (v) => setOptics({ throwMm: v }) }).root,
        readout('Aumento', `×${fmtNum(orep.magnification, 2)} → imagen ${fmtNum(orep.imageWidthMm, 0)} × ${fmtNum(orep.imageHeightMm, 0)} mm`).root,
        (rr.bright = readout('Brillo estimado', '')).root,
      ]),
      group('Avisos', [warningsList(d.warnings)]),
    );
    updateReelReadouts();
  }

  function updateReelReadouts(): void {
    if (!rr.state) return;
    const p = ctx.project;
    const d = ctx.derived();
    const r = d.reels;
    const live = sim.reelLive();
    if (!r || !live) return;
    const pitch = p.film.pitchMm;
    const fps = Math.abs(live.vMmS) / pitch;
    rr.state.set(STATE_HINT[live.state] ?? live.state, live.state === 'al final' ? 'warn' : undefined);
    rr.speed.set(`${fmtNum(fps, 1)} fps · ${fmtNum(Math.abs(live.vMmS), 0)} mm/s${live.vMmS > 0 ? ' → tambor 1' : live.vMmS < 0 ? ' → tambor 2' : ''}`);
    const g = sim.gate();
    rr.gate.set(g ? `fotograma ${g.frameIndex + 1}${d.layout.frames.length > d.layout.frameCount ? ` · ${g.slot + 1} de ${d.layout.frames.length} en la tira` : ` de ${d.layout.frames.length}`} · ${fmtNum(g.offsetMm, 2)} mm del centro` : '—');
    const sens = live.sensed.map((x, i) => (x === null ? `${i + 1}: sin mano` : `${i + 1}: ${fmtNum(x / 10, 1)} cm → ${fmtNum(handFps(x, r.spec.control.speedMap), 1)} fps${live.owner === i ? ' (manda)' : ''}`));
    rr.sensed.set(sens.join(' · '));
    rr.pulse.set(live.still ? `${fmtNum(r.pulseUs.still, 1)} µs a ${r.spec.control.stillHz} Hz (cuadro fijo)` : fps > 0.01 ? `${fmtNum(reelPulseS(live.vMmS, r.spec.control, pitch) * 1e6, 0)} µs, ${fmtNum(fps, 1)} por segundo` : '—');
    const pose = reelPose(r.design, live.phiMm);
    rr.reel1.set(`${fmtNum(pose.on1 / 1000, 2)} m · Ø${fmtNum(2 * pose.r1, 1)} mm · ${fmtNum(reelRpm(live.vMmS, pose.r1), 0)} rpm`);
    rr.reel2.set(`${fmtNum(pose.on2 / 1000, 2)} m · Ø${fmtNum(2 * pose.r2, 1)} mm · ${fmtNum(reelRpm(live.vMmS, pose.r2), 0)} rpm`);
    const accel = Math.abs(live.vMmS) > 1e-6 ? live.aMmS2 * Math.sign(live.vMmS) : 0;
    rr.dancer.set(`${fmtNum((Math.max(-0.06, Math.min(0.06, (accel / r.spec.control.accelMmS2) * 0.05)) * 180) / Math.PI, 1)}° · ${accel > 1 ? 'acelera: sube la tensión' : accel < -1 ? 'frena: baja la tensión' : 'al centro'}`);
    const printed = ctx.printedFrames();
    const b = brightnessReport(p.optics, p.led.peakLumens * r.duty, mediumById(p.print.mediumId).baseTransmittance * printed.meanTransmittance, p.led.kelvin);
    rr.bright.set(`${fmtNum(b.imageNits, 1)} cd/m² a cualquier velocidad · contraste ${fmtNum(b.contrastRatio, 0)}:1`, b.imageNits >= 5 ? 'ok' : 'warn');
  }

  function updateReadouts(): void {
    if (ctx.derived().reels) return updateReelReadouts();
    if (!readouts.speed) return;
    const p = ctx.project;
    const d = ctx.derived();
    const s = d.sync;
    const cls = (ok: boolean) => (ok ? 'ok' : 'warn');
    readouts.speed.set(`${fmtNum(s.actual.filmSpeedMmS, 1)} mm/s (objetivo ${fmtNum(s.targets.filmSpeedMmS, 1)})`, cls(Math.abs(s.actual.filmSpeedMmS - s.targets.filmSpeedMmS) < 1));
    readouts.rollerRpm.set(`${fmtNum((p.transport.motorRpm * (1 + p.transport.speedErrorPct / 100)) / p.transport.gearRatio, 1)} (objetivo ${fmtNum(s.targets.rollerRpm, 1)})`);
    readouts.motorRpm.set(`${fmtNum(p.transport.motorRpm, 1)} (objetivo ${fmtNum(s.targets.motorRpm, 1)}) · máx. ${s.torque.maxRpm}`, cls(s.targets.motorRpm <= s.torque.maxRpm));
    readouts.drum.set(p.strobeKind === 'drum' ? `${fmtNum(p.drum.rpm, 1)} rpm (objetivo ${fmtNum(s.targets.drumRpm ?? 0, 1)})` : `${fmtNum(p.led.frequencyHz, 3)} Hz (objetivo ${fmtNum(s.targets.ledHz ?? 0, 2)})`);
    readouts.flash.set(`${fmtNum(s.actual.flashHz, 3)} Hz / ${fmtNum(s.actual.transportFps, 3)} fot/s`);
    readouts.beat.set(Math.abs(s.actual.beatHz) < 1e-6 ? '0 Hz · sin deriva' : `${fmtNum(s.actual.beatHz, 4)} Hz · 1 fotograma cada ${fmtNum(s.actual.secondsPerFrameSlip, 1)} s`, cls(Math.abs(s.actual.beatHz) < 1e-3));
    readouts.exposure.set(`${fmtNum(s.actual.flashDurationS * 1e6, 0)} µs / ${fmtNum(s.actual.maxExposureS * 1e6, 0)} µs (≤ 0,1 mm)`, cls(s.actual.flashDurationS <= s.actual.maxExposureS));
    readouts.blur.set(`${fmtNum(s.actual.blurMm, 3)} mm (${fmtNum(s.actual.blurFraction * 100, 2)} % del paso)`, cls(s.actual.blurMm <= 0.1));
    const printed = ctx.printedFrames();
    const b = brightnessReport(p.optics, s.actual.averageLumens, mediumById(p.print.mediumId).baseTransmittance * printed.meanTransmittance, d.strobe.kind === 'drum' ? p.drum.lampKelvin : p.led.kelvin);
    readouts.bright.set(`${fmtNum(b.imageNits, 1)} cd/m² · ${fmtNum(b.imageLux, 0)} lux · contraste ${fmtNum(b.contrastRatio, 0)}:1`, cls(b.imageNits >= 5));
    readouts.torque.set(`${fmtNum(s.torque.motorTorqueNcm, 2)} / ${fmtNum(s.torque.availableNcm, 2)} N·cm (margen ×${fmtNum(s.torque.margin, 1)})`, cls(s.torque.margin >= 1.5));
    const g = sim.gate();
    readouts.gate.set(g ? `fotograma ${g.frameIndex + 1} · desplazado ${fmtNum(g.offsetMm, 2)} mm (${fmtNum(g.offsetFraction * 100, 1)} %)` : '—');
  }

  function ensureScene(): void {
    if (scene) return;
    try {
      scene = createMechScene(canvas, overlay);
      attachScene(scene);
    } catch (e) {
      hud.textContent = `No se pudo crear la escena 3D: ${e instanceof Error ? e.message : String(e)}`;
      console.error(e);
    }
  }

  let lastHud = 0;
  const untick = ctx.onTick(() => {
    if (!active) return;
    ensureScene();
    if (!scene) return;
    const p = ctx.project;
    const live = sim.reelLive();
    scene.update({ derived: ctx.derived(), project: p, frames: ctx.frames(), phiMm: ctx.engine.phiMm, simTime: ctx.engine.t, flashIntensity: sim.flashIntensity, screenCanvas: sim.screen, highlightGate, reel: live ? { live, hands: sim.hands } : undefined });
    if (!urlSelDone) {
      urlSelDone = true;
      renderBrowser();
      const fromBom = urlBom ? scene.parts().find((n) => n.bomId === urlBom)?.id : undefined;
      if (urlSel || fromBom) scene.select((urlSel ?? fromBom)!, true);
      if (asmStep !== null || asmExplode > 0) scene.setAssembly(asmStep ?? assemblySteps().length, asmExplode);
    }
    const now = performance.now();
    if (now - lastHud > 250) {
      lastHud = now;
      const st = scene.stats();
      const g = sim.gate();
      const speed = live ? ` · ${(Math.abs(live.vMmS) / p.film.pitchMm).toFixed(1)} fps ${live.vMmS > 0 ? '→ tambor 1' : live.vMmS < 0 ? '→ tambor 2' : ''} · ${live.state}` : '';
      hud.textContent = `t = ${ctx.engine.t.toFixed(2)} s · φ = ${ctx.engine.phiMm.toFixed(1)} mm · fotograma ${g ? g.frameIndex + 1 : '—'} (${g ? (g.offsetMm >= 0 ? '+' : '') + g.offsetMm.toFixed(2) : '—'} mm)${speed} · destellos ${sim.flashCount} · ${st.drawCalls} draw calls · ${st.triangles} tri · ${st.fps} fps`;
      updateReadouts();
    }
  });
  const unsub = ctx.store.onChange(() => {
    if (active) buildSide();
  });
  const ro = new ResizeObserver(() => scene?.resize());
  ro.observe(viewport);
  buildSide();
  return {
    dispose() {
      untick();
      unsub();
      ro.disconnect();
      scene?.dispose();
    },
    resize() {
      scene?.resize();
    },
    setActive(v) {
      active = v;
      if (v) {
        ensureScene();
        scene?.resize();
        sideKey = '';
        buildSide();
      }
    },
  };
}

/** tamaño que ocupan los rodillos (ancho × fondo, con pestañas) */
function rollerFootprint(d: ReturnType<AppContext['derived']>): string {
  const R = d.pathSpec.rollerRadiusMm + 2;
  const xs = d.pathSpec.rollers.map((r) => r.x);
  const ys = d.pathSpec.rollers.map((r) => r.y);
  return `${fmtNum(Math.max(...xs) - Math.min(...xs) + 2 * R, 0)} × ${fmtNum(Math.max(...ys) - Math.min(...ys) + 2 * R, 0)} mm · ${d.pathSpec.rollers.length} rodillos`;
}
