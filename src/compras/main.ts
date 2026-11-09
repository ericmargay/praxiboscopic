// Lista de compras en su propia página (como las listas de precios de lumaprima): resumen por proveedor, renglones
// agrupados por tipo de pieza, y el renglón elegido abierto al lado con su pieza en 3D a escala real, sus precios en
// UNIT, Amazon y MercadoLibre, por qué está y qué revisar antes de pagar. Lee el mismo proyecto que el simulador
// (localStorage) o la demostración, así que la lista sigue al diseño. Lo que marcas (fuera de la compra, comprado) se
// guarda en este navegador.
import './compras.css';
import type { PartMeta } from '@aminoacid/omega/parts';
import { bomCsv } from '@aminoacid/omega/fabricate';
import { bomFromParts } from '@aminoacid/omega/parts';
import { loadProject } from '../app/context';
import { demoProject, deriveProject, type Project } from '../core/project';
import { laminatedDemoProject, reelsDemoProject } from '../core/video';
import { buildReelsAssembly } from '../mech/assembly';
import { buildReelsStructure, SHEET_MATERIALS } from '../mech/structure';
import { reelsPrintedParts } from '../fabricate/printed';
import { laserQuantities, printQuantities } from '../fabricate/quantities';
import { FAB_DIR, LASER_PREFIX, laserRequestText, printRequestText, ZIP_NAME } from '../fabricate/shops';
import { buildParts } from '../fabricate/bom';
import { OFFERS, UNIT_SHIPPING, type Offer } from '../fabricate/offers';
import { BOM_KIND } from '../three/parts';
import { createPreview, type PartShape } from './preview';

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T | null;
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll(s)] as T[];
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const mxn = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

// --- proyecto ---------------------------------------------------------------------------------------------------------
const q = new URLSearchParams(location.search);
function load(): { project: Project; fromDemo: boolean } {
  const saved = q.get('demo') ? null : loadProject();
  const demo = q.get('demo');
  return saved ? { project: saved, fromDemo: false } : { project: demo === 'laminada' ? laminatedDemoProject() : demo === 'tambores' ? reelsDemoProject() : demoProject(), fromDemo: true };
}
const { project, fromDemo } = load();
const derived = deriveProject(project);
/** si la lista viene de una demostración, el simulador abre la misma */
const simDemo = fromDemo && q.get('demo') ? `&demo=${encodeURIComponent(q.get('demo')!)}` : '';
const { parts, notes } = buildParts(project, derived);
const ROWS = new Map(parts.map((p) => [p.id, p]));

// --- estado guardado en el navegador ----------------------------------------------------------------------------------
const KEY = 'praxiboscopic.compras.v1';
interface Saved {
  out: string[];
  bought: string[];
}
const saved: Saved = (() => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { out: s.out ?? [], bought: s.bought ?? [] };
  } catch {
    return { out: [], bought: [] };
  }
})();
const persist = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* almacenamiento no disponible */
  }
};
let sel: string | null = q.get('row');
let tab = 'all';
let filt = 'all';
let search = '';
let dtab: 'sum' | 'buy' | 'check' = 'sum';
let sheet = !!sel;

// --- taller (dos tambores): lo que se manda a cortar e imprimir, con sus textos y estimados (ADR-0012) -------------
const fab = derived.reels
  ? (() => {
      const st = buildReelsStructure(project, derived);
      const printed = reelsPrintedParts(project, derived, {}, st.asm);
      return { st, printed, laser: laserQuantities(st), pe: printQuantities(printed) };
    })()
  : null;
if (fab && location.hash === '#fabricacion') tab = 'fab';

// --- datos derivados --------------------------------------------------------------------------------------------------
const CATS: [string, string][] = [
  ['electronic', 'Electrónica'],
  ['wiring', 'Cableado'],
  ['mechanical', 'Mecánica'],
  ['optical', 'Óptica'],
  ['structural', 'Estructura y taller'],
  ['material', 'Película y materiales'],
];
const catLabel = (c: string) => CATS.find(([k]) => k === c)?.[1] ?? c;
const qty = (r: PartMeta) => r.qty ?? 1;
const unitOf = (r: PartMeta) => r.supplier?.unitCost;
const counted = (r: PartMeta) => !saved.out.includes(r.id);
const bought = (r: PartMeta) => saved.bought.includes(r.id);
const total = (rs: PartMeta[]) => rs.reduce((a, r) => a + (counted(r) && unitOf(r) !== undefined ? unitOf(r)! * qty(r) : 0), 0);
const isUnit = (r: PartMeta) => r.supplier?.name === 'UNIT Electronics';
const ev = (r: PartMeta) => notes[r.id]?.evidence ?? 'unverified';
const EV_LABEL = { read: 'precio leído', estimated: 'precio estimado', unverified: 'sin verificar' } as const;
const shapeOf = (r: PartMeta): PartShape | null => {
  const kind = BOM_KIND[r.id] ?? (r.id.startsWith('motor-17hs8401') ? 'nema17' : r.id.startsWith('lens-') ? 'lens' : undefined);
  if (!kind) return null;
  if (kind === 'reel' && derived.reels) {
    const a = buildReelsAssembly(project, derived);
    return { kind, reel: { coreR: a.coreR, flangeR: a.flangeR, gap: a.flangeHighY - a.flangeLowY } };
  }
  return kind === 'roller' ? { kind, rollerRadiusMm: derived.pathSpec.rollerRadiusMm, rollerBodyMm: project.film.stripWidthMm + 10 } : { kind };
};
const processLabel = (r: PartMeta) => (r.process === 'print3d' ? 'impresión 3D' : r.process === 'laser' ? 'corte láser' : r.process === 'buy' ? 'compra' : r.process ?? '');
const offersOf = (r: PartMeta): Offer[] => OFFERS[r.id]?.offers ?? [];

const pass = (r: PartMeta) => {
  if (tab !== 'all' && r.category !== tab) return false;
  if (search) {
    const h = `${r.id} ${r.name} ${r.supplier?.name ?? ''} ${r.supplier?.sku ?? ''}`.toLowerCase();
    if (!h.includes(search.toLowerCase())) return false;
  }
  if (filt === 'check') return ev(r) !== 'read' || !!OFFERS[r.id]?.check;
  if (filt === 'noprice') return unitOf(r) === undefined;
  if (filt === 'pending') return counted(r) && !bought(r);
  if (filt === 'bought') return bought(r);
  return true;
};

// --- piezas de la página ----------------------------------------------------------------------------------------------
const preview = createPreview();
function thumb(r: PartMeta, big = false): string {
  const s = shapeOf(r);
  if (!s) return `<div class="thumb none">${big ? '' : esc(processLabel(r) || '—')}</div>`;
  return `<div class="thumb"><img alt="" src="${preview.thumbnail(s)}"></div>`;
}
const dots = (r: PartMeta) => `<span class="dots"><i class="dot d-${ev(r) === 'read' ? 'green' : ev(r) === 'estimated' ? 'yellow' : 'red'}" title="${esc(EV_LABEL[ev(r)])}"></i></span>`;
function rowHtml(r: PartMeta): string {
  const u = unitOf(r);
  const sub = [r.supplier?.name, r.supplier?.sku, r.process !== 'buy' ? processLabel(r) : ''].filter(Boolean).join(' · ');
  return `<div class="row${r.id === sel ? ' on' : ''}${counted(r) ? '' : ' off'}${bought(r) ? ' got' : ''}" data-r="${esc(r.id)}">
    <button class="sw" data-sw="${esc(r.id)}" title="${counted(r) ? 'Sacar de la compra' : 'Volver a la compra'}">${counted(r) ? '●' : '○'}</button>
    ${thumb(r)}
    <div class="nm"><b>${esc(r.name)}${bought(r) ? '<span class="chip ok">comprado</span>' : ''}</b><span>${esc(sub || '—')}</span></div>
    <div class="px"><b>${u !== undefined ? mxn(u * qty(r)) : '—'}${dots(r)}</b><span>${qty(r)} × ${u !== undefined ? mxn(u) : 'sin precio'}</span></div>
  </div>`;
}
function listHtml(): string {
  let out = '';
  let sum = 0;
  let n = 0;
  for (const [c, label] of CATS) {
    const rs = parts.filter((r) => r.category === c && pass(r));
    if (!rs.length) continue;
    out += `<div class="grp">${esc(label)}</div>` + rs.map(rowHtml).join('');
    sum += total(rs);
    n += rs.length;
  }
  return `<div class="list">${out || '<div class="empty">Nada coincide.</div>'}<div class="foot"><span>Total de lo mostrado · ${n} renglones</span><b>${mxn(sum)}</b></div></div>`;
}
function priceTable(r: PartMeta): string {
  const offers = offersOf(r);
  const amz = offers.find((o) => o.store === 'Amazon México');
  const ml = offers.find((o) => o.store === 'MercadoLibre');
  const cell = (label: string, v: string, on = false) => `<div class="${on ? 'on' : ''}"><span>${esc(label)}</span><b>${esc(v)}</b></div>`;
  const offerText = (o?: Offer) => (!o ? '—' : o.price !== undefined ? mxn(o.price) + (o.pack ? ' *' : '') : o.range ? `~${o.range[0]}–${o.range[1]}` : '—');
  const u = unitOf(r);
  return `<div class="tp">${cell(r.supplier?.name === 'UNIT Electronics' ? 'UNIT c/u' : 'Precio c/u', u !== undefined ? mxn(u) : '—', true)}${cell('Amazon', offerText(amz))}${cell('MercadoLibre', offerText(ml))}${cell('Cantidad', String(qty(r)))}</div>${offers.some((o) => o.pack) ? '<p class="hint">* precio del paquete, no por pieza</p>' : ''}`;
}
function detailHtml(): string {
  const r = sel ? ROWS.get(sel) : undefined;
  if (!r) return '<div class="db"><p class="hint">Elige un renglón para ver su detalle.</p></div>';
  const n = notes[r.id] ?? {};
  const x = OFFERS[r.id];
  const u = unitOf(r);
  const dl = (pairs: [string, string | undefined][]) => `<dl class="dl">${pairs.filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
  let body = '';
  if (dtab === 'sum') {
    body = dl([
      ['Para qué', n.forWhat],
      ['Por qué', n.why],
      ['Alternativa', n.alternative],
      ['Material', r.material],
      ['Proceso', processLabel(r)],
      ['Medidas', r.dimsMm ? `${r.dimsMm.x.toFixed(0)} × ${r.dimsMm.y.toFixed(0)} × ${r.dimsMm.z.toFixed(0)} mm` : undefined],
      ['Precio', u !== undefined ? `${EV_LABEL[ev(r)]}${n.evidenceDate ? ` el ${n.evidenceDate}` : ''}` : 'sin precio'],
      ['Necesidad', n.need],
      ['Notas', r.notes],
    ]);
    body += `<label class="check"><input type="checkbox" id="bought" ${bought(r) ? 'checked' : ''}> Ya lo compré</label>`;
    body += `<p class="hint"><a href="./index.html?section=mechanical${simDemo}&bom=${encodeURIComponent(r.id)}">Verla en el simulador 3D</a> (selecciona la pieza en la obra)</p>`;
  } else if (dtab === 'buy') {
    const cards: string[] = [];
    if (r.supplier) cards.push(`<div class="lk"><div class="h">${r.supplier.url ? `<a href="${esc(r.supplier.url)}" target="_blank" rel="noopener">${esc(r.supplier.name)}</a>` : `<b>${esc(r.supplier.name)}</b>`}<b class="mono">${u !== undefined ? mxn(u) : '—'}</b></div><div class="note">${esc([r.supplier.sku, EV_LABEL[ev(r)]].filter(Boolean).join(' · '))}${r.supplier.url ? '' : ' · sin enlace directo: búscalo por nombre en la tienda'}</div></div>`);
    for (const o of offersOf(r)) cards.push(`<div class="lk"><div class="h"><a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.store)}</a><b class="mono">${o.price !== undefined ? mxn(o.price) : o.range ? `~${mxn(o.range[0])}–${mxn(o.range[1])}` : '—'}</b></div><div class="note">${esc([o.pack, o.note, o.date ? `leído el ${o.date}` : o.store === 'MercadoLibre' ? 'rango de resultados indexados, sin fecha' : 'leído el 2-nov-2026'].filter(Boolean).join(' · '))}</div></div>`);
    body = cards.join('') || '<p class="hint">Sin proveedor: es una pieza de taller (impresión 3D o láser) o un material de papelería.</p>';
  } else {
    body = `${x?.check ? `<div class="pend">${esc(x.check)}</div>` : '<p class="hint">Nada especial que revisar en este renglón.</p>'}${isUnit(r) ? `<p class="hint">${esc(UNIT_SHIPPING)}</p>` : ''}`;
  }
  const media = `<div id="mini-slot"></div>`;
  return `<div class="dh"><div class="top"><div><div class="dtitle">${esc(r.name)}</div><div class="dmeta"><span class="mono">${esc(r.id)}</span> · ${esc(catLabel(r.category))} · ${qty(r)} × ${u !== undefined ? mxn(u) : 'sin precio'}${u !== undefined ? ` = <b>${mxn(u * qty(r))}</b>` : ''}</div></div><button class="x" id="close" aria-label="Cerrar">×</button></div>
    ${media}${priceTable(r)}</div>
    <div class="dtabs">${([['sum', 'Resumen'], ['buy', `Dónde comprar · ${(r.supplier ? 1 : 0) + offersOf(r).length}`], ['check', `Antes de pagar${x?.check ? ' · 1' : ''}`]] as const).map(([k, l]) => `<button data-dt="${k}" aria-pressed="${k === dtab}">${esc(l)}</button>`).join('')}</div>
    <div class="db">${body}</div>`;
}
function altTable(): string {
  const rows = parts.filter((r) => offersOf(r).length).map((r) => {
    const u = unitOf(r);
    return offersOf(r).map((o, i) => `<tr class="click" data-open="${esc(r.id)}">${i === 0 ? `<td rowspan="${offersOf(r).length}"><b>${esc(r.name)}</b><br><span class="hint">${esc(r.supplier?.name ?? '')} ${u !== undefined ? mxn(u) + ' c/u' : ''}</span></td>` : ''}<td><a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.store)}</a>${o.pack ? `<br><span class="hint">${esc(o.pack)}</span>` : ''}</td><td class="r">${o.price !== undefined ? mxn(o.price) : o.range ? `~${mxn(o.range[0])}–${mxn(o.range[1])}` : '—'}</td></tr>`).join('');
  }).join('');
  return `<p class="hint" style="margin:0 0 8px">Amazon México se leyó directo el 2 y el 5-nov-2026. MercadoLibre son rangos de resultados indexados, sin fecha. Los paquetes traen varias piezas: compara por pieza.</p><div class="list"><table><thead><tr><th>Pieza y precio elegido</th><th>Alternativa</th><th class="r">Precio</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function fabHtml(): string {
  if (!fab) return '';
  const { st, laser, printed, pe } = fab;
  const base = `./${FAB_DIR}`;
  const laserLinks = laser
    .map((e) => {
      const pre = LASER_PREFIX[e.material];
      const sheets = e.nest.sheets.map((ns) => `hoja ${ns.index}: <a href="${base}/laser/${pre}-hoja-${ns.index}.dxf" download>DXF</a> · <a href="${base}/laser/${pre}-hoja-${ns.index}.svg" target="_blank" rel="noopener">SVG</a>`).join(' · ');
      return `<li><b>${esc(SHEET_MATERIALS[e.material].label)}</b>: ${e.pieces} piezas, ${e.cutM.toFixed(1).replace('.', ',')} m de corte · ${sheets} · <a href="${base}/laser/${pre}.pdf" target="_blank" rel="noopener">PDF 1:1</a></li>`;
    })
    .join('');
  const stl = printed.map((p) => `<li><a href="${base}/impresion-3d/${esc(p.file)}" download>${esc(p.file)}</a> × ${p.qty} <span class="hint">${esc(p.name)}</span></li>`).join('');
  return `<div class="why"><b>Cómo se fabrica.</b> Piso y cubierta de MDF de ${esc(String(st.mdfMm).replace('.', ','))} mm y paredes de acrílico transparente de ${esc(String(st.asm.base.acrT).replace('.', ','))} mm, cortados con láser y armados a mano, sin tornillos: las paredes quedan atrapadas en ranuras del MDF (se ve la electrónica), dos cuñas aprietan la tapa trasera y las tapas se abrochan. Las piezas que giran o sostienen se imprimen en PETG. Cada pieza lleva su código (E, A, N, I), el mismo que usan los <a href="./index.html?section=mechanical&demo=tambores&ensamble=1">12 pasos del ensamble en el simulador</a>.</div>
    <div class="fab">
      <section><h3>1 · Corte láser</h3><p class="hint">DXF R12, SVG y PDF a escala 1:1, con las piezas acomodadas en hojas de 90 × 60 cm y el kerf compensado. Rojo corta, azul marca y negro graba el código.</p><ul>${laserLinks}</ul>
        <div class="msg"><div class="msg-h"><b>Texto para el taller</b><button class="btn" data-copy="msg-laser">Copiar</button></div><pre id="msg-laser">${esc(laserRequestText(st, laser))}</pre></div></section>
      <section><h3>2 · Impresión 3D</h3><p class="hint">${printed.length} STL, uno por pieza, ya orientados y revisados (sólidos cerrados, sin soportes).</p><ul class="stl">${stl}</ul>
        <div class="msg"><div class="msg-h"><b>Texto para el servicio</b><button class="btn" data-copy="msg-print">Copiar</button></div><pre id="msg-print">${esc(printRequestText(printed, pe))}</pre></div></section>
    </div>
    <p class="fab-all"><a class="btn primary" href="${base}/${ZIP_NAME}" download>Descargar todo (ZIP)</a> <a class="btn" href="${base}/README.md" target="_blank" rel="noopener">README con piezas y pasos</a></p>`;
}

function checkList(): string {
  const items = parts.filter((r) => OFFERS[r.id]?.check).map((r) => `<li><a href="#" data-open="${esc(r.id)}">${esc(r.name)}</a>: ${esc(OFFERS[r.id]!.check)}</li>`).join('');
  return `<div class="why"><b>Envío.</b> ${esc(UNIT_SHIPPING)}</div><ul class="checks">${items}</ul><div class="why"><b>Orden de compra.</b> ${derived.reels ? 'Pide primero la cotización del corte (con las piezas de prueba) y de la impresión: tardan días. Mientras, compra la electrónica y arma la prueba de banco con un tramo de 1 a 2 m de película laminada: tensión al invertir, la mano, el parpadeo a 6 fps y el cuadro fijo. El VL53L0X sirve para empezar mientras llega el VL53L4CD.' : 'Compra primero la electrónica y arma el pulso del LED en banco. Mide flujo, temperatura y disparo con una tira impresa con tu tinta real. Con eso, decide lente, tamaño de imagen y película final.'}</div>`;
}

function render(): void {
  const all = parts;
  const unitRows = all.filter(isUnit);
  const otherRows = all.filter((r) => !isUnit(r) && unitOf(r) !== undefined);
  const pending = all.filter((r) => counted(r) && !bought(r));
  const noPrice = all.filter((r) => unitOf(r) === undefined).length;
  const by = { read: 0, estimated: 0, unverified: 0 };
  for (const r of all) if (counted(r) && unitOf(r) !== undefined) by[ev(r)] += unitOf(r)! * qty(r);
  const sumAll = by.read + by.estimated + by.unverified || 1;
  const counts: Record<string, number> = { all: all.length, alt: all.filter((r) => offersOf(r).length).length, check: all.filter((r) => OFFERS[r.id]?.check).length };
  for (const [c] of CATS) counts[c] = all.filter((r) => r.category === c).length;
  if (fab) counts.fab = fab.laser.length + 1;
  const TABS: [string, string][] = [['all', 'Todo'], ...CATS.filter(([c]) => counts[c]), ['alt', 'Alternativas'], ['check', 'Antes de pagar'], ...(fab ? [['fab', 'Taller: láser e impresión 3D'] as [string, string]] : [])];
  const full = tab === 'alt' || tab === 'check' || tab === 'fab';
  if (!full && !sel && innerWidth >= 1100) sel = all.find(pass)?.id ?? null;
  const app = $('#app')!;
  app.innerHTML = `<header><div><h1>Praxiboscopic · Lista de compras</h1><div class="sub">${esc(project.name)}${fromDemo ? ' (demostración)' : ''} · MXN antes de envío · precios de UNIT del 2 y del 5-nov-2026: confírmalos en el carrito</div></div>
      <div class="bar"><a class="btn" href="./index.html?section=mechanical${simDemo}">← Simulador 3D</a><button class="btn" id="csv">Descargar CSV</button><button class="btn" id="print">Imprimir</button></div></header>
    <div class="tiers">
      <div class="tier on"><span class="tag">Recomendada</span><span class="l">UNIT Electronics</span><span class="n">${mxn(total(unitRows))}</span><span class="d">${unitRows.length} renglones · casi toda la electrónica</span></div>
      <div class="tier"><span class="l">Otros proveedores</span><span class="n">${mxn(total(otherRows))}</span><span class="d">${esc([...new Set(otherRows.map((r) => r.supplier?.name ?? ''))].filter(Boolean).slice(0, 4).join(', '))}</span></div>
      <div class="tier"><span class="l">Todo lo que tiene precio</span><span class="n">${mxn(total(all))}</span><span class="d">${noPrice ? `${noPrice} renglones sin precio (taller y servicios)` : fab ? 'taller y película estimados' : 'todo con precio'}</span></div>
      <div class="tier"><span class="l">Falta comprar</span><span class="n">${mxn(total(pending))}</span><span class="d">${pending.length} de ${all.filter(counted).length} renglones en la compra</span></div>
    </div>
    <div class="why">La lista sale del mismo proyecto que el simulador: si cambias rodillos, motor o estroboscopio allá, esta página cambia. UNIT y MercadoLibre bloquean el acceso automático, así que sus precios vienen de capturas o del buscador; confírmalos en el carrito.</div>
    <div class="strip"><span>confianza en precios <span class="conf"><i class="d-green" style="width:${(by.read / sumAll) * 100}%"></i><i class="d-yellow" style="width:${(by.estimated / sumAll) * 100}%"></i><i class="d-red" style="width:${(by.unverified / sumAll) * 100}%"></i></span></span><span class="hint">● leído ${mxn(by.read)} · ● estimado ${mxn(by.estimated)} · ● sin verificar ${mxn(by.unverified)}</span></div>
    <div class="nav"><div class="tabs">${TABS.map(([k, l]) => `<button data-t="${k}" aria-pressed="${k === tab}">${esc(l)}<span class="c">${counts[k]}</span></button>`).join('')}</div>
      <div class="filters"><input id="q" type="search" placeholder="Buscar pieza o código" value="${esc(search)}">${full ? '' : ([['all', 'Todo'], ['check', 'Por confirmar'], ['noprice', 'Sin precio'], ['pending', 'Pendientes'], ['bought', 'Compradas']] as const).map(([k, l]) => `<button class="fchip" data-f="${k}" aria-pressed="${k === filt}">${l}</button>`).join('')}</div></div>
    ${full ? (tab === 'alt' ? altTable() : tab === 'fab' ? fabHtml() : checkList()) : `<div class="md"><div>${listHtml()}</div>${sheet && innerWidth < 1100 ? '<div class="scrim" id="scrim"></div>' : ''}<aside class="det${sheet ? ' open' : ''}">${detailHtml()}</aside></div>`}`;
  wire();
  const slot = $('#mini-slot');
  if (slot && sel) {
    slot.append(preview.element);
    const r = ROWS.get(sel);
    preview.show(r ? shapeOf(r) : null);
  }
}

function wire(): void {
  for (const b of $$<HTMLButtonElement>('.tabs button')) b.onclick = () => {
    tab = b.dataset.t!;
    sel = null;
    filt = 'all';
    sheet = false;
    render();
  };
  for (const b of $$<HTMLButtonElement>('.fchip')) b.onclick = () => {
    filt = b.dataset.f!;
    sel = null;
    render();
  };
  const qi = $<HTMLInputElement>('#q');
  if (qi) qi.oninput = () => {
    search = qi.value;
    const pos = qi.selectionStart;
    sel = null;
    render();
    const n = $<HTMLInputElement>('#q')!;
    n.focus();
    n.setSelectionRange(pos, pos);
  };
  for (const el of $$('.row')) el.onclick = (e) => {
    if ((e.target as HTMLElement).closest('.sw')) return;
    sel = el.dataset.r!;
    sheet = true;
    history.replaceState(null, '', `?row=${encodeURIComponent(sel)}`);
    render();
  };
  for (const b of $$<HTMLButtonElement>('.sw')) b.onclick = (e) => {
    e.stopPropagation();
    const id = b.dataset.sw!;
    saved.out = saved.out.includes(id) ? saved.out.filter((x) => x !== id) : [...saved.out, id];
    persist();
    render();
  };
  for (const b of $$<HTMLButtonElement>('.dtabs button')) b.onclick = () => {
    dtab = b.dataset.dt as typeof dtab;
    render();
  };
  for (const el of $$('[data-open]')) el.onclick = (e) => {
    if ((e.target as HTMLElement).closest('a[target]')) return;
    e.preventDefault();
    sel = el.dataset.open!;
    tab = 'all';
    sheet = true;
    dtab = 'sum';
    render();
    window.scrollTo({ top: 0 });
  };
  const bt = $<HTMLInputElement>('#bought');
  if (bt) bt.onchange = () => {
    const id = sel!;
    saved.bought = bt.checked ? [...new Set([...saved.bought, id])] : saved.bought.filter((x) => x !== id);
    persist();
    render();
  };
  const c = $('#close');
  if (c) c.onclick = () => {
    sheet = false;
    if (innerWidth < 1100) sel = null;
    render();
  };
  const sc = $('#scrim');
  if (sc) sc.onclick = () => {
    sheet = false;
    sel = null;
    render();
  };
  for (const b of $$<HTMLButtonElement>('[data-copy]')) b.onclick = async () => {
    const text = $(`#${b.dataset.copy}`)?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
      b.textContent = 'Copiado';
    } catch {
      const r = document.createRange();
      r.selectNodeContents($(`#${b.dataset.copy}`)!);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(r);
      b.textContent = 'Seleccionado: Cmd+C';
    }
  };
  $('#print')!.onclick = () => window.print();
  $('#csv')!.onclick = () => {
    const blob = new Blob([bomCsv(bomFromParts(parts.filter(counted)))], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'praxiboscopic-compras.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };
}

let wide = innerWidth >= 1100;
addEventListener('resize', () => {
  const w = innerWidth >= 1100;
  if (w === wide) return;
  wide = w;
  render();
});
render();
document.body.dataset.ready = '1';
