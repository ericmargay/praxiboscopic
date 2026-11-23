// Página del visor de conexiones (ADR-0015): los pasos para cablear y probar en banco la electrónica de la mesa de
// dos tambores. A la izquierda, el paso (qué se conecta, cómo se prueba); al centro, el banco en 3D con cada cable;
// a la derecha, los datos eléctricos de la pieza o el cable elegido y sus comentarios (ADR-0014).
import '../style.css';
import '../ui/panels.css';
import './electronica.css';
import { button, el } from '../ui/controls';
import { createFeedback, type FeedbackView } from '../ui/sim/feedback';
import { createBench, type Bench, type Sel, type ViewMode } from './bench';
import { CABLE, COLOR_LABEL, GROUP_LABEL, WIRE_COLOR, WIRING, cableCount, checkWiring, componentById, componentsOfStep, holeText, netOfPin, netOfWire, refText, splitRef, wiresOfStep, type ElecComponent, type NetKind, type Wire, type WiringStep } from './wiring';

declare global {
  interface Window {
    __elec: { ready: boolean; error: string | null; go(step: number): void; select(id: string | null): void; view(kind: 'iso' | 'top' | 'step'): void; drawn(): boolean };
  }
}

const SKETCH = 'electronica/prueba-banco/prueba-banco.ino';
const DONE_KEY = 'praxi-conexiones-hechas';
/** sin los huecos: lo que una condición dejó en nulo */
const compact = (xs: (Node | null | undefined)[]): Node[] => xs.filter((x): x is Node => !!x);
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const POWER: Record<WiringStep['power'], string> = { fuente: 'Se prueba con la fuente enchufada', usb: 'Se prueba solo con el USB', ambas: 'Se prueba con el USB y la fuente' };
const NET_COLOR: Record<NetKind, string> = { mains: '#ab2a22', v24: '#c8372d', v12: '#7b4bb3', v5: '#e07b26', v33: '#d4608c', gnd: '#23272b', signal: '#2b8a4b', i2c: '#8a5a3c', coil: '#2a6fb5', pulse: '#c8372d' };

function readDone(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}
function saveDone(done: Set<string>): void {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify([...done]));
  } catch {
    /* sin almacenamiento: las marcas duran lo que la pestaña */
  }
}

function mount(app: HTMLElement): void {
  const wr = WIRING;
  const q = new URLSearchParams(location.search);
  const n = wr.steps.length;
  let step = Math.max(1, Math.min(n, Number(q.get('paso')) || 1));
  let mode: ViewMode = 'upto';
  let sel: Sel = null;
  let flipped = q.get('esp32') !== 'derecho';
  const done = readDone();
  const bench: Bench = createBench();
  bench.setFlipped(flipped);

  const stepsEl = el('aside', { class: 'ev-side ev-steps' });
  const infoEl = el('aside', { class: 'ev-side ev-info' });
  const toolbar = el('div', { class: 'ev-toolbar' });
  const view = el('main', { class: 'ev-view' }, bench.element, toolbar);

  const feedbackView = (): FeedbackView => ({ step, explode: 0, query: {}, view: 'electronica' });
  const feedback = createFeedback(() => {
    renderSteps();
    renderInfo();
  });

  const selParam = () => (sel ? (sel.kind === 'wire' ? `cable:${sel.id}` : sel.id) : null);
  function syncUrl(): void {
    const u = new URLSearchParams();
    u.set('paso', String(step));
    const s = selParam();
    if (s) u.set('sel', s);
    if (!flipped) u.set('esp32', 'derecho');
    history.replaceState(null, '', `${location.pathname}?${u.toString()}`);
  }

  function go(k: number, frame = true): void {
    step = Math.max(1, Math.min(n, k));
    // lo elegido se suelta si todavía no entra en este paso
    if (sel?.kind === 'component' && (componentById(sel.id)?.step ?? 0) > step && mode !== 'all') sel = null;
    if (sel?.kind === 'wire' && (wr.wires.find((x) => x.id === sel!.id)?.step ?? 0) > step && mode !== 'all') sel = null;
    bench.setStep(step, mode);
    bench.select(sel);
    if (frame) bench.view(step === 1 || mode === 'all' ? 'iso' : 'step');
    renderAll();
  }
  function select(s: Sel, focus = false): void {
    sel = s;
    bench.select(sel, focus);
    renderAll();
  }
  bench.onSelect = (s) => select(s);

  const chip = (text: string, cls = '') => el('span', { class: `ev-chip ${cls}`, text });
  const swatch = (color: number) => el('i', { class: 'ev-sw', style: `--c:${hex(color)}` });
  const list = (cls: string, items: string[]) => el('ul', { class: cls }, ...items.map((t) => el('li', { text: t })));

  function wireRow(x: Wire): HTMLElement {
    const box = el('input', { type: 'checkbox', title: 'Marcar como conectado' }) as HTMLInputElement;
    box.checked = done.has(x.id);
    box.onchange = () => {
      if (box.checked) done.add(x.id);
      else done.delete(x.id);
      saveDone(done);
      renderSteps();
    };
    const b = el('button', { class: 'ev-wire-b', type: 'button', title: x.note ?? `${CABLE[x.cable].label}, ${COLOR_LABEL[x.color]}` }, swatch(WIRE_COLOR[x.color]), el('span', { class: 'ev-wire-t' }, el('b', { text: refText(x.from) }), ' → ', el('b', { text: refText(x.to) })), el('span', { class: 'ev-wire-k', text: CABLE[x.cable].label.replace('Jumper ', '').replace('Cable ', '').replace('de alimentación ', '') })) as HTMLButtonElement;
    b.onclick = () => select({ kind: 'wire', id: x.id }, true);
    return el('div', { class: `ev-wire ${sel?.kind === 'wire' && sel.id === x.id ? 'on' : ''} ${box.checked ? 'done' : ''}` }, box, b);
  }

  function renderSteps(): void {
    const s = wr.steps[step - 1];
    const ws = wiresOfStep(step);
    const cs = componentsOfStep(step);
    const left = ws.filter((x) => !done.has(x.id)).length;
    const nav = el('div', { class: 'ev-nav' }, ...wr.steps.map((t) => {
      const all = wiresOfStep(t.n);
      const complete = all.length > 0 && all.every((x) => done.has(x.id));
      const b = el('button', { type: 'button', class: `ev-n ${complete ? 'done' : ''}`, 'aria-current': t.n === step ? 'step' : undefined, title: `${t.n}. ${t.title}`, text: String(t.n) }) as HTMLButtonElement;
      b.onclick = () => go(t.n);
      return b;
    }));
    const tests = el('ol', { class: 'ev-tests' }, ...s.test.map((t) => el('li', {}, el('div', {}, t.do, t.cmd ? el('code', { class: 'ev-cmd', text: t.cmd, title: 'Escríbelo en el monitor serie y pulsa Enter' }) : null), el('div', { class: 'ev-expect' }, el('b', { text: 'Debe dar: ' }), t.expect))));
    stepsEl.replaceChildren(...compact([
      el('div', { class: 'ev-head' }, el('div', { class: 'ev-kicker', text: `Paso ${step} de ${n}` }), el('div', { class: 'btn-row' }, button('◀', () => go(step - 1), { kind: 'ghost', title: 'Paso anterior' }), button('▶', () => go(step + 1), { kind: 'ghost', title: 'Paso siguiente' }))),
      nav,
      el('h2', { text: s.title }),
      el('p', { class: 'ev-goal', text: s.goal }),
      el('div', { class: 'ev-chips' }, chip('Se cablea con todo desenchufado', 'off'), chip(POWER[s.power], 'on')),
      ...(s.warn?.length ? [list('ev-warn', s.warn)] : []),
      el('h3', { text: 'Qué hacer' }),
      el('ol', { class: 'ev-todo' }, ...s.todo.map((t) => el('li', { text: t }))),
      cs.length ? el('div', { class: 'ev-parts' }, el('span', { class: 'hint', text: 'Entran: ' }), ...cs.map((c) => {
        const b = el('button', { type: 'button', class: `ev-part ${sel?.kind === 'component' && sel.id === c.id ? 'on' : ''}`, text: c.short, title: c.name }) as HTMLButtonElement;
        b.onclick = () => select({ kind: 'component', id: c.id }, true);
        return b;
      })) : null,
      el('h3', {}, `Cables de este paso`, el('span', { class: 'ev-count', text: left ? `faltan ${left} de ${ws.length}` : `los ${ws.length}, conectados` })),
      el('div', { class: 'ev-wires' }, ...ws.map(wireRow)),
      el('p', { class: 'hint', text: 'Toca un cable para verlo en el banco. La casilla es para ir marcando lo ya conectado: se guarda en este navegador.' }),
      el('h3', { text: 'Prueba' }),
      tests,
      ...(s.fail?.length ? [el('details', { class: 'ev-fail' }, el('summary', { text: 'Si no sale' }), list('', s.fail))] : []),
      feedback.stepList(step, 'electronica'),
      el('div', { class: 'btn-row ev-foot' }, step < n ? button(`Siguiente: ${wr.steps[step].title} ▶`, () => go(step + 1), { kind: 'primary' }) : el('a', { class: 'btn btn-primary', href: 'index.html?demo=tambores&section=mechanical&ensamble=3&explosion=0.4', text: 'Seguir con el ensamble: paso 3 ▶' })),
    ]));
  }

  /** con qué se une cada pin: su red y los cables que salen de él */
  function pinRows(c: ElecComponent): HTMLElement {
    const rows = c.pins.map((p) => {
      const ref = `${c.id}.${p.id}`;
      const net = netOfPin(ref);
      const hole = c.mount?.[p.id];
      const out = wr.wires.filter((x) => x.from === ref || x.to === ref);
      const to = out.map((x) => {
        const other = x.from === ref ? x.to : x.from;
        const b = el('button', { type: 'button', class: 'ev-link', text: refText(other), title: `Paso ${x.step} · ${CABLE[x.cable].label}, ${COLOR_LABEL[x.color]}` }) as HTMLButtonElement;
        b.onclick = () => {
          if (x.step > step) go(x.step, false);
          select({ kind: 'wire', id: x.id }, true);
        };
        return b;
      });
      return el('tr', { class: net ? '' : 'free' }, el('th', { text: p.label }), el('td', {}, net ? el('span', { class: 'ev-net', style: `--c:${NET_COLOR[net.kind]}`, text: net.label }) : el('span', { class: 'hint', text: 'libre' }), hole ? el('span', { class: 'ev-hole', text: holeText(hole) }) : null, ...to, p.what ? el('div', { class: 'hint', text: p.what }) : null));
    });
    return el('table', { class: 'ev-pins' }, el('tbody', {}, ...rows));
  }

  function componentInfo(c: ElecComponent): Node[] {
    const stepBtn = el('button', { type: 'button', class: 'ev-chip link', text: `Entra en el paso ${c.step}` }) as HTMLButtonElement;
    stepBtn.onclick = () => go(c.step);
    return compact([
      el('div', { class: 'ev-kicker', text: GROUP_LABEL[c.group] }),
      el('h2', { text: c.name }),
      el('div', { class: 'ev-chips' }, c.value ? chip(c.value) : null, stepBtn),
      ...(c.warn?.length ? [list('ev-warn', c.warn)] : []),
      ...(c.mount ? [el('h3', { text: 'Dónde va' }), el('p', { class: 'ev-where' }, ...Object.entries(c.mount).flatMap(([pin, hole], i) => [i ? ' · ' : '', el('b', { text: c.pins.find((p) => p.id === pin)?.label ?? pin }), ` en ${holeText(hole)}`])), c.orient ? el('p', { class: 'hint', text: c.orient }) : null] : []),
      el('h3', { text: 'Datos' }),
      el('dl', { class: 'ev-data' }, ...c.data.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])),
      ...(c.setup?.length ? [el('h3', { text: 'Antes de conectar' }), list('ev-setup', c.setup)] : []),
      ...(c.pins.length ? [el('h3', { text: 'Conexiones' }), pinRows(c)] : []),
      c.id === 'esp32' ? el('p', { class: 'hint' }, 'Programa de prueba: ', el('a', { href: SKETCH, download: 'prueba-banco.ino', text: 'prueba-banco.ino ↓' })) : null,
      feedback.section({ id: c.id, name: c.name }, feedbackView),
    ]);
  }

  function wireInfo(x: Wire): Node[] {
    const net = netOfWire(x);
    const end = (ref: string) => {
      if (ref.startsWith('bb:')) return el('span', { text: refText(ref, wr, true) });
      const [cid] = splitRef(ref);
      const b = el('button', { type: 'button', class: 'ev-link', text: refText(ref) }) as HTMLButtonElement;
      b.onclick = () => select({ kind: 'component', id: cid }, true);
      return b;
    };
    const stepBtn = el('button', { type: 'button', class: 'ev-chip link', text: `Paso ${x.step}` }) as HTMLButtonElement;
    stepBtn.onclick = () => go(x.step);
    return compact([
      el('div', { class: 'ev-kicker', text: 'Cable' }),
      el('h2', {}, swatch(WIRE_COLOR[x.color]), ` ${refText(x.from)} → ${refText(x.to)}`),
      el('div', { class: 'ev-chips' }, stepBtn, chip(done.has(x.id) ? 'Conectado' : 'Por conectar', done.has(x.id) ? 'on' : '')),
      x.note ? el('p', { class: 'ev-goal', text: x.note }) : null,
      el('dl', { class: 'ev-data' }, el('dt', { text: 'De' }), el('dd', {}, end(x.from)), el('dt', { text: 'A' }), el('dd', {}, end(x.to)), el('dt', { text: 'Cable' }), el('dd', { text: `${CABLE[x.cable].label}, ${COLOR_LABEL[x.color]}` }), el('dt', { text: 'Cómo' }), el('dd', { text: CABLE[x.cable].note }), ...(net ? [el('dt', { text: 'Lleva' }), el('dd', {}, el('span', { class: 'ev-net', style: `--c:${NET_COLOR[net.kind]}`, text: net.label })), el('dt', { text: 'Se mide' }), el('dd', { text: net.level })] : [])),
    ]);
  }

  function overview(): Node[] {
    const counts = cableCount();
    const problems = checkWiring();
    const legend: [number, string][] = [
      [WIRE_COLOR.rojo, '24 V'],
      [WIRE_COLOR.negro, 'Tierra'],
      [WIRE_COLOR.naranja, '5 V'],
      [WIRE_COLOR.morado, '12 V'],
      [WIRE_COLOR.rosa, '3,3 V'],
      [WIRE_COLOR.verde, 'Pasos (PUL)'],
      [WIRE_COLOR.azul, 'Sentido (DIR)'],
      [WIRE_COLOR.cafe, 'SDA'],
      [WIRE_COLOR.gris, 'SCL'],
      [WIRE_COLOR.blanco, 'LED y marcas'],
      [WIRE_COLOR.turquesa, 'XSHUT'],
    ];
    return compact([
      el('div', { class: 'ev-kicker', text: 'Mesa de dos tambores' }),
      el('h2', { text: 'Conexiones y prueba de la electrónica' }),
      el('p', { class: 'ev-goal', text: 'Diez pasos para cablear todo sobre la mesa de trabajo y probarlo por partes, antes de fijarlo al piso de la obra. Cada paso termina con una prueba: si no sale, el problema está en lo que se acaba de conectar.' }),
      list('ev-setup', ['Toca una pieza para ver sus datos y con qué se une cada pin.', 'Toca un cable para ver de dónde a dónde va y qué lleva.', 'Acércate con la rueda: cada pin tiene su letrero y la protoboard, sus letras y números.']),
      el('h3', { text: 'Colores de los cables' }),
      el('div', { class: 'ev-legend' }, ...legend.map(([c, t]) => el('span', {}, swatch(c), t))),
      el('p', { class: 'hint', text: 'Son los colores del modelo. En la mesa conviene respetar al menos rojo para positivo y negro para tierra.' }),
      el('h3', { text: 'Cables que se usan' }),
      el('dl', { class: 'ev-data' }, ...(['hm', 'mm', 'hh', 'tip', 'awg18'] as const).flatMap((k) => [el('dt', { text: CABLE[k].label }), el('dd', { text: `${counts[k]} · ${CABLE[k].note}` })])),
      el('h3', { text: 'Programa de prueba' }),
      el('p', {}, el('a', { class: 'btn', href: SKETCH, download: 'prueba-banco.ino', text: 'Descargar prueba-banco.ino ↓' })),
      el('p', { class: 'hint', text: 'Se carga desde el IDE de Arduino con la placa «ESP32 Dev Module». Se maneja desde el monitor serie a 115200: ? muestra los comandos. No usa bibliotecas.' }),
      problems.length ? list('ev-warn', problems) : el('p', { class: 'hint ok', text: `Revisado: los ${wr.wires.length} cables arman el esquema completo, con los rieles de la protoboard enteros o partidos.` }),
      feedback.overview(wr.components.map((c) => ({ id: c.id, name: c.name })), feedbackView, (id) => {
        const c = componentById(id);
        if (!c) return;
        if (c.step > step) go(c.step, false);
        select({ kind: 'component', id }, true);
      }),
    ]);
  }

  function renderInfo(): void {
    const c = sel?.kind === 'component' ? componentById(sel.id) : undefined;
    const x = sel?.kind === 'wire' ? wr.wires.find((y) => y.id === sel!.id) : undefined;
    const close = sel ? button('✕', () => select(null), { kind: 'ghost', title: 'Quitar la selección' }) : null;
    if (close) close.classList.add('ev-close');
    infoEl.replaceChildren(...(close ? [close] : []), ...(c ? componentInfo(c) : x ? wireInfo(x) : overview()));
    infoEl.scrollTop = 0;
  }

  function renderToolbar(): void {
    const seg = el('div', { class: 'ev-seg', role: 'group' }, ...([['upto', 'Hasta este paso'], ['step', 'Solo este paso'], ['all', 'Todo'] ] as const).map(([m, t]) => {
      const b = el('button', { type: 'button', 'aria-pressed': String(mode === m), text: t }) as HTMLButtonElement;
      b.onclick = () => {
        mode = m;
        bench.setStep(step, mode);
        renderToolbar();
      };
      return b;
    }));
    const flip = el('label', { class: 'ev-flip', title: 'Suelto va volteado, con las patas hacia arriba y jumpers hembra. En su placa de expansión va derecho.' }, el('input', { type: 'checkbox' }), 'ESP32 volteado');
    const cb = flip.querySelector('input')!;
    cb.checked = flipped;
    cb.onchange = () => {
      flipped = cb.checked;
      bench.setFlipped(flipped);
      syncUrl();
    };
    toolbar.replaceChildren(seg, button('Encuadrar el paso', () => bench.view('step'), { kind: 'ghost' }), button('Todo el banco', () => bench.view('iso'), { kind: 'ghost' }), button('Desde arriba', () => bench.view('top'), { kind: 'ghost' }), flip);
  }

  function renderAll(): void {
    renderSteps();
    renderInfo();
    syncUrl();
  }

  app.replaceChildren(
    el('header', { class: 'topbar' }, el('div', { class: 'brand' }, 'PRAXIBOSCOPIC', el('small', { text: 'Conexiones y prueba de la electrónica' })), el('span', { class: 'spacer' }), el('a', { class: 'btn btn-ghost', href: 'index.html?demo=tambores&section=mechanical&ensamble=2&explosion=0.4', text: '← Ensamble' }), el('a', { class: 'btn btn-ghost', href: 'compras.html?demo=tambores', text: 'Lista de compras' }), el('a', { class: 'btn btn-ghost', href: SKETCH, download: 'prueba-banco.ino', text: 'Programa de prueba ↓' })),
    el('div', { class: 'ev-main' }, stepsEl, view, infoEl),
  );

  // ?sel=<pieza> o ?sel=cable:<id>
  const s0 = q.get('sel');
  if (s0) {
    const id = s0.replace(/^cable:/, '');
    if (s0.startsWith('cable:') && wr.wires.some((x) => x.id === id)) sel = { kind: 'wire', id };
    else if (componentById(id)) sel = { kind: 'component', id };
  }
  renderToolbar();
  bench.setStep(step, mode);
  bench.select(sel);
  renderAll();
  requestAnimationFrame(() => requestAnimationFrame(() => bench.view(sel ? 'iso' : step === 1 ? 'iso' : 'step')));
  feedback.load();

  window.addEventListener('keydown', (ev) => {
    const t = ev.target as HTMLElement;
    if (t.closest('input, textarea, select')) return;
    if (ev.key === 'ArrowRight') go(step + 1);
    else if (ev.key === 'ArrowLeft') go(step - 1);
    else if (ev.key === 'Escape') select(null);
  });

  window.__elec.go = (k) => go(k);
  window.__elec.select = (id) => {
    if (!id) return select(null);
    const wid = id.replace(/^cable:/, '');
    select(id.startsWith('cable:') ? { kind: 'wire', id: wid } : { kind: 'component', id }, true);
  };
  window.__elec.view = (k) => bench.view(k);
  window.__elec.drawn = () => bench.ready();
}

window.__elec = { ready: false, error: null, go() {}, select() {}, view() {}, drawn: () => false };
try {
  mount(document.querySelector<HTMLElement>('#electronica')!);
  window.__elec.ready = true;
} catch (e) {
  window.__elec.error = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
  console.error(e);
  document.body.innerHTML = `<pre style="color:#ab2a22;padding:20px;white-space:pre-wrap">${window.__elec.error.replace(/[<&]/g, (ch) => (ch === '<' ? '&lt;' : '&amp;'))}</pre>`;
}
