// Projection Laboratory: comparador de tres paneles sincronizados. A: la animación digital original, perfecta.
// B: la película en movimiento (esquema de la tira pasando por la ventana, con rodillos y área de exposición).
// C: la proyección simulada, obtenida solo del transporte físico, los destellos y la óptica. Con controles de medio
// (ideal frente a impreso), persistencia retiniana y lecturas de brillo, ventana y destellos.
import type { AppContext } from '../../app/context';
import type { SimulationRunner } from '../../app/simulation';
import { evaluate } from '../../animation/evaluate';
import { renderDisplayList } from '../../animation/render2d';
import { pointAt, samplePath } from '../../mech/path';
import { MEDIA, mediumById } from '../../optics/medium';
import { brightnessReport, opticsReport } from '../../optics/projector';
import { button, checkbox, el, fmtNum, group, numberControl, readout, selectControl } from '../controls';

export function mountLabPanel(ctx: AppContext, sim: SimulationRunner, root: HTMLElement): { dispose(): void; setActive(v: boolean): void } {
  root.classList.add('lab-panel');
  const panels = el('div', { class: 'lab-panels' });
  const side = el('aside', { class: 'panel lab-side' });
  root.append(panels, side);
  const mk = (title: string, hint: string) => {
    const c = document.createElement('canvas');
    c.className = 'lab-canvas';
    const cap = el('div', { class: 'lab-caption mono' });
    const box = el('div', { class: 'lab-box' }, el('h4', {}, el('b', { text: title }), el('span', { class: 'hint', text: ` ${hint}` })), el('div', { class: 'lab-canvas-wrap' }, c), cap);
    panels.append(box);
    return { c, cap };
  };
  const A = mk('A · Animación digital original', 'reproducción perfecta, sin defectos físicos');
  const B = mk('B · Película en movimiento', 'fotogramas sobre la tira, rodillos y área de exposición');
  const C = mk('C · Proyección simulada', 'solo transporte físico + destellos + óptica');
  let active = false;
  let showIdealInA = true;
  let bZoom: 'gate' | 'path' = 'gate';

  function sizeCanvas(c: HTMLCanvasElement): void {
    const wrap = c.parentElement!;
    const w = Math.max(64, Math.floor(wrap.clientWidth));
    const h = Math.max(48, Math.floor(wrap.clientHeight));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
  }

  function drawA(): void {
    const p = ctx.project;
    const doc = p.animation;
    const d = ctx.derived();
    sizeCanvas(A.c);
    const g = A.c.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, A.c.width, A.c.height);
    // la animación ideal avanza con el tiempo de simulación, a los FPS de proyección objetivo: fotograma = floor(t·fps)
    const t = ctx.engine.t;
    const frameIdx = Math.floor(t * p.targetFps) % Math.max(1, d.frameCount);
    const tAnim = (frameIdx * d.duration) / Math.max(1, d.frameCount);
    const list = evaluate({ ...doc, duration: d.duration }, tAnim, { frameIndex: frameIdx });
    const scale = Math.min(A.c.width / doc.width, A.c.height / doc.height) * 0.92;
    const ox = (A.c.width - doc.width * scale) / 2;
    const oy = (A.c.height - doc.height * scale) / 2;
    renderDisplayList(g, list, { scale, offsetX: ox, offsetY: oy, resources: ctx.resources, forceBackground: showIdealInA ? (doc.background.transparent ? '#ffffff' : null) : null });
    A.cap.textContent = `fotograma ${frameIdx + 1}/${d.frameCount} · t = ${tAnim.toFixed(3)} s · ${p.targetFps} fps digitales`;
  }

  function drawB(): void {
    const p = ctx.project;
    const d = ctx.derived();
    sizeCanvas(B.c);
    const g = B.c.getContext('2d')!;
    const W = B.c.width;
    const H = B.c.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#111317';
    g.fillRect(0, 0, W, H);
    const frames = sim.useIdealFrames ? ctx.frames().frames : ctx.printedFrames().frames;
    const byIndex = new Map(frames.map((f) => [f.index, f.canvas]));
    const layout = d.layout;
    const phi = ctx.engine.phiMm;
    const L = layout.loopLengthMm;
    if (bZoom === 'gate') {
      // tramo de tira alrededor de la ventana: s horizontal (la cinta avanza de derecha a izquierda vista desde la lente)
      const spanMm = Math.max(p.optics.gateWidthMm * 3, layout.spec.pitchMm * 3);
      const k = (W * 0.96) / spanMm;
      const stripH = layout.spec.stripWidthMm * k;
      const y0 = H / 2 - stripH / 2;
      const sigmaCenter = (((phi - d.pathSpec.gateMm) % L) + L) % L;
      g.fillStyle = 'rgba(200,210,230,0.12)';
      g.fillRect(0, y0, W, stripH);
      for (const pf of layout.frames) {
        let dd = pf.centerMm - sigmaCenter;
        dd -= Math.round(dd / L) * L;
        if (Math.abs(dd) > spanMm / 2 + pf.alongMm) continue;
        const x = W / 2 + dd * k - (pf.alongMm * k) / 2;
        const y = y0 + pf.xMm * k;
        const img = byIndex.get(pf.frameIndex);
        g.fillStyle = '#fff';
        g.fillRect(x, y, pf.alongMm * k, pf.acrossMm * k);
        if (img) g.drawImage(img as unknown as CanvasImageSource, x, y, pf.alongMm * k, pf.acrossMm * k);
        g.fillStyle = '#9aa';
        g.font = `${Math.max(9, 3 * k)}px ui-monospace, monospace`;
        g.textAlign = 'center';
        g.fillText(String(pf.frameIndex + 1), x + (pf.alongMm * k) / 2, y0 - 4);
      }
      for (const m of layout.marks) {
        if (m.kind !== 'perforation' && m.kind !== 'sync') continue;
        let dd = m.sMm + m.alongMm / 2 - sigmaCenter;
        dd -= Math.round(dd / L) * L;
        if (Math.abs(dd) > spanMm / 2) continue;
        g.fillStyle = m.kind === 'sync' ? '#000' : '#1a1c21';
        g.fillRect(W / 2 + dd * k - (m.alongMm * k) / 2, y0 + m.xMm * k, m.alongMm * k, m.acrossMm * k);
      }
      // ventana óptica (área de exposición)
      const gw = p.optics.gateWidthMm * k;
      const gh = p.optics.gateHeightMm * k;
      g.save();
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.beginPath();
      g.rect(0, 0, W, H);
      g.rect(W / 2 - gw / 2, H / 2 - gh / 2, gw, gh);
      g.fill('evenodd');
      g.restore();
      g.strokeStyle = sim.flashIntensity > 0.3 ? '#2a6fb5' : '#63b8d3';
      g.lineWidth = 2;
      g.strokeRect(W / 2 - gw / 2, H / 2 - gh / 2, gw, gh);
      // flecha de avance
      g.fillStyle = '#9aa';
      g.font = '11px ui-monospace, monospace';
      g.textAlign = 'left';
      g.fillText('◀ avance de la película', 8, H - 8);
      // destello
      if (sim.flashIntensity > 0.05) {
        g.fillStyle = `rgba(255, 220, 140, ${(sim.flashIntensity * 0.35).toFixed(3)})`;
        g.fillRect(W / 2 - gw / 2, H / 2 - gh / 2, gw, gh);
      }
    } else {
      // planta del recorrido con la cinta, los rodillos, la ventana y la posición de cada fotograma
      const pts = samplePath(d.path, 2);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const q of pts) {
        minX = Math.min(minX, q.position.x);
        maxX = Math.max(maxX, q.position.x);
        minY = Math.min(minY, q.position.y);
        maxY = Math.max(maxY, q.position.y);
      }
      const pad = d.pathSpec.rollerRadiusMm * 2 + 40;
      const k = Math.min(W / (maxX - minX + pad * 2), H / (maxY - minY + pad * 2));
      const X = (x: number) => (x - (minX + maxX) / 2) * k + W / 2;
      const Y = (y: number) => (y - (minY + maxY) / 2) * k + H / 2;
      g.strokeStyle = 'rgba(200,210,230,0.5)';
      g.lineWidth = Math.max(1, 1.5 * k);
      g.beginPath();
      pts.forEach((q, i) => (i ? g.lineTo(X(q.position.x), Y(q.position.y)) : g.moveTo(X(q.position.x), Y(q.position.y))));
      g.closePath();
      g.stroke();
      for (const r of d.pathSpec.rollers) {
        g.fillStyle = '#9fb2ba';
        g.beginPath();
        g.arc(X(r.x), Y(r.y), d.pathSpec.rollerRadiusMm * k, 0, Math.PI * 2);
        g.fill();
      }
      for (const pf of layout.frames) {
        const s = phi - pf.centerMm;
        const q = pointAt(d.path, s);
        const sz = Math.max(3, pf.alongMm * k * 0.9);
        g.save();
        g.translate(X(q.position.x), Y(q.position.y));
        g.rotate(Math.atan2(q.tangent.y, q.tangent.x));
        const img = byIndex.get(pf.frameIndex);
        g.fillStyle = '#fff';
        g.fillRect(-sz / 2, -sz * 0.3, sz, sz * 0.6);
        if (img) g.drawImage(img as unknown as CanvasImageSource, -sz / 2, -sz * 0.3, sz, sz * 0.6);
        g.restore();
      }
      const gq = pointAt(d.path, d.pathSpec.gateMm);
      g.strokeStyle = '#63b8d3';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(X(gq.position.x), Y(gq.position.y), Math.max(6, p.optics.gateWidthMm * k), 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#9aa';
      g.font = '11px ui-monospace, monospace';
      g.fillText('ventana', X(gq.position.x) + 10, Y(gq.position.y) - 10);
    }
    const gs = sim.gate();
    B.cap.textContent = gs ? `φ = ${phi.toFixed(1)} mm · ${gs.speedMmS.toFixed(1)} mm/s · en la ventana: fotograma ${gs.frameIndex + 1} (${gs.offsetMm >= 0 ? '+' : ''}${gs.offsetMm.toFixed(2)} mm)` : '';
  }

  function drawC(): void {
    sizeCanvas(C.c);
    const g = C.c.getContext('2d')!;
    const p = ctx.project;
    const rep = opticsReport(p.optics);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, C.c.width, C.c.height);
    // la pantalla real tiene la proporción de la ventana × aumento: encajamos la imagen de la pantalla del compositor
    const aspect = rep.imageWidthMm / Math.max(1e-6, rep.imageHeightMm);
    let w = C.c.width * 0.94;
    let h = w / aspect;
    if (h > C.c.height * 0.94) {
      h = C.c.height * 0.94;
      w = h * aspect;
    }
    const x = (C.c.width - w) / 2;
    const y = (C.c.height - h) / 2;
    // luz ambiente sobre la pantalla
    const amb = Math.min(60, p.optics.ambientLux * 0.4);
    g.fillStyle = `rgb(${amb},${amb},${amb})`;
    g.fillRect(x, y, w, h);
    g.globalCompositeOperation = 'lighter';
    g.drawImage(sim.screen as unknown as CanvasImageSource, x, y, w, h);
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = '#333';
    g.strokeRect(x, y, w, h);
    const ex = sim.lastExposure;
    C.cap.textContent = `${fmtNum(rep.imageWidthMm / 10, 0)} × ${fmtNum(rep.imageHeightMm / 10, 0)} cm en pantalla · ${sim.flashCount} destellos · ${ex && ex.flashes ? `último paso: ${ex.flashes} destello(s), fotograma(s) ${ex.frames.map((f) => f + 1).join('+')}${ex.misregistered ? ' · DESCENTRADO' : ''}` : 'sin destellos en el último paso'}`;
  }

  let sideKey = '';
  const ro: Record<string, ReturnType<typeof readout>> = {};
  function buildSide(): void {
    const p = ctx.project;
    const k = JSON.stringify({ m: p.print.mediumId, ideal: sim.useIdealFrames, tau: sim.retinaTauS, z: bZoom, a: showIdealInA, playing: p.ui.playing, ts: p.ui.timeScale, kind: p.strobeKind });
    if (k === sideKey) {
      updateSide();
      return;
    }
    sideKey = k;
    side.replaceChildren(el('h3', { text: 'Projection Laboratory' }));
    side.append(
      group('Reproducción', [
        el('div', { class: 'btn-row' }, button(p.ui.playing ? '⏸ Pausa' : '▶ Marcha', () => ctx.store.update((q) => ({ ...q, ui: { ...q.ui, playing: !q.ui.playing } })), { kind: 'primary' }), button('Reiniciar', () => sim.reset(), { kind: 'ghost' })),
        numberControl({ label: 'Escala de tiempo', value: p.ui.timeScale, min: 0.01, max: 2, step: 0.01, onChange: (v) => ctx.store.update((q) => ({ ...q, ui: { ...q.ui, timeScale: v } })) }).root,
        numberControl({ label: 'Persistencia retiniana', value: sim.retinaTauS * 1000, min: 0, max: 300, step: 1, unit: 'ms', onChange: (v) => { sim.retinaTauS = v / 1000; } , help: 'Constante de tiempo del decaimiento en la pantalla (≈ 40–60 ms para el ojo)' }).root,
      ]),
      group('Comparación ideal / impresa', [
        checkbox('Proyectar fotogramas ideales (sin medio)', sim.useIdealFrames, (v) => { sim.useIdealFrames = v; sideKey = ''; buildSide(); }).root,
        selectControl({ label: 'Medio impreso', value: p.print.mediumId, options: MEDIA.map((m) => ({ value: m.id, label: m.label })), onChange: (v) => ctx.store.update((q) => ({ ...q, print: { ...q.print, mediumId: v } })) }).root,
        el('p', { class: 'hint', text: mediumById(p.print.mediumId).description }),
        selectControl({ label: 'Panel B', value: bZoom, options: [{ value: 'gate', label: 'Detalle de la ventana' }, { value: 'path', label: 'Planta del recorrido' }], onChange: (v) => { bZoom = v; } }).root,
        checkbox('Panel A sobre fondo blanco (como la pantalla)', showIdealInA, (v) => { showIdealInA = v; }).root,
      ]),
      group('Lecturas', [
        (ro.gate = readout('Fotograma en la ventana', '')).root,
        (ro.flash = readout('Destellos', '')).root,
        (ro.sync = readout('Sincronía', '')).root,
        (ro.blur = readout('Desenfoque por movimiento', '')).root,
        (ro.focus = readout('Desenfoque óptico', '')).root,
        (ro.bright = readout('Brillo en pantalla', '')).root,
        (ro.trans = readout('Transmitancia media de la película', '')).root,
      ]),
      group('Qué mirar', [
        el('ul', { class: 'hint tips' },
          el('li', { text: 'Si A y C coinciden fotograma a fotograma, la ilusión funciona: el destello cae con el fotograma centrado.' }),
          el('li', { text: 'Con un error de velocidad o frecuencia, C deriva: la imagen se desplaza, se parte o muestra dos fotogramas mezclados.' }),
          el('li', { text: 'Con pulsos largos o cinta rápida, C se emborrona en horizontal (desenfoque por movimiento).' }),
          el('li', { text: 'Con el motor parado, A sigue; C se apaga si el LED lo dispara el sensor, o repite el fotograma si lo dispara un reloj.' }),
          el('li', { text: 'Cambia el medio para ver cómo la tinta limita el negro y la resolución.' }),
        ),
      ]),
    );
    updateSide();
  }

  function updateSide(): void {
    if (!ro.gate) return;
    const p = ctx.project;
    const d = ctx.derived();
    const g = sim.gate();
    ro.gate.set(g ? `${g.frameIndex + 1} (${g.offsetMm >= 0 ? '+' : ''}${g.offsetMm.toFixed(2)} mm)` : '—');
    ro.flash.set(`${sim.flashCount} · ${fmtNum(d.sync.actual.flashHz, 2)} Hz · ${fmtNum(d.sync.actual.flashDurationS * 1e6, 0)} µs`);
    ro.sync.set(Math.abs(d.sync.actual.beatHz) < 1e-3 ? 'en fase' : `deriva ${fmtNum(d.sync.actual.beatHz, 3)} Hz`, Math.abs(d.sync.actual.beatHz) < 1e-3 ? 'ok' : 'warn');
    ro.blur.set(`${fmtNum(d.sync.actual.blurMm, 3)} mm sobre la película`, d.sync.actual.blurMm <= 0.1 ? 'ok' : 'warn');
    const rep = opticsReport(p.optics);
    ro.focus.set(`${fmtNum(rep.blurCircleMm, 2)} mm en pantalla`, rep.blurCircleMm < 2 ? 'ok' : 'warn');
    const printed = ctx.printedFrames();
    const T = sim.useIdealFrames ? 1 : mediumById(p.print.mediumId).baseTransmittance * printed.meanTransmittance;
    const b = brightnessReport(p.optics, d.sync.actual.averageLumens, T, d.strobe.kind === 'drum' ? p.drum.lampKelvin : p.led.kelvin);
    ro.bright.set(`${fmtNum(b.imageNits, 1)} cd/m² · ${b.verdict}`, b.imageNits >= 5 ? 'ok' : 'warn');
    ro.trans.set(`${fmtNum(T * 100, 1)} %`);
  }

  let lastSide = 0;
  const untick = ctx.onTick(() => {
    if (!active) return;
    drawA();
    drawB();
    drawC();
    const now = performance.now();
    if (now - lastSide > 300) {
      lastSide = now;
      updateSide();
    }
  });
  const unsub = ctx.store.onChange(() => {
    if (active) buildSide();
  });
  buildSide();
  return {
    dispose() {
      untick();
      unsub();
    },
    setActive(v) {
      active = v;
      if (v) {
        sideKey = '';
        buildSide();
      }
    },
  };
}
