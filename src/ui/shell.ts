// Armazón de la aplicación: barra superior con las tres secciones (Animation Studio, Mechanical Simulation,
// Projection Laboratory), subpestañas del estudio (Editor, Fotogramas, Película, Exportar), barra de estado con
// los avisos del proyecto. Las secciones se montan una vez y se muestran u ocultan: el estado vive en la tienda.
import type { AppContext } from '../app/context';
import type { SimulationRunner } from '../app/simulation';
import type { Section } from '../core/project';
import { mountEditor, type EditorHandle } from './studio/editor';
import { mountFramesPanel } from './frames/framesPanel';
import { mountFilmPanel } from './film/filmPanel';
import { mountExportPanel } from './film/exportPanel';
import { mountSimPanel } from './sim/simPanel';
import { mountLabPanel } from './lab/labPanel';
import { el, tabs } from './controls';

type StudioTab = 'editor' | 'frames' | 'film' | 'export';
const STUDIO_TABS: { id: StudioTab; label: string }[] = [
  { id: 'editor', label: 'Editor' },
  { id: 'frames', label: 'Fotogramas' },
  { id: 'film', label: 'Película' },
  { id: 'export', label: 'Exportar' },
];

export function mountShell(ctx: AppContext, sim: SimulationRunner, app: HTMLElement): void {
  const top = el('header', { class: 'topbar' });
  const main = el('main', { class: 'main' });
  const status = el('footer', { class: 'statusbar' });
  app.replaceChildren(top, main, status);

  // --- barra superior
  const brand = el('div', { class: 'brand' }, 'PRAXIBOSCOPIC', el('small', { text: 'estudio de animación · simulador de cine mecánico' }));
  const nameInput = el('input', { class: 'project-name', value: ctx.project.name, title: 'Nombre del proyecto' }) as HTMLInputElement;
  nameInput.addEventListener('change', () => ctx.store.update((p) => ({ ...p, name: nameInput.value })));
  const sections = tabs<Section>(
    [
      { id: 'studio', label: 'Animation Studio' },
      { id: 'mechanical', label: 'Mechanical Simulation' },
      { id: 'laboratory', label: 'Projection Laboratory' },
    ],
    ctx.project.ui.section,
    (id) => ctx.store.update((p) => ({ ...p, ui: { ...p.ui, section: id } })),
    'tabs tabs-main',
  );
  const studioTabs = tabs<StudioTab>(STUDIO_TABS, (ctx.project.ui.studioTab as StudioTab) || 'editor', (id) => ctx.store.update((p) => ({ ...p, ui: { ...p.ui, studioTab: id } })), 'tabs subtabs');
  const playBtn = el('button', { class: 'btn btn-ghost', title: 'Marcha / pausa (espacio)' }) as HTMLButtonElement;
  playBtn.addEventListener('click', () => ctx.store.update((p) => ({ ...p, ui: { ...p.ui, playing: !p.ui.playing } })));
  const shopLink = el('a', { class: 'btn btn-ghost', href: './compras.html', target: '_blank', title: 'Lista de compras con precios de UNIT, Amazon y MercadoLibre, y cada pieza en 3D', text: 'Lista de compras ↗' });
  top.append(brand, sections.root, studioTabs.root, el('span', { class: 'spacer' }), shopLink, playBtn, nameInput);

  // --- secciones
  const studio = el('section', { class: 'section' });
  const mech = el('section', { class: 'section' });
  const lab = el('section', { class: 'section' });
  main.append(studio, mech, lab);
  const studioPanes: Record<StudioTab, HTMLElement> = {
    editor: el('div', { class: 'studio-pane' }),
    frames: el('div', { class: 'studio-pane' }),
    film: el('div', { class: 'studio-pane' }),
    export: el('div', { class: 'studio-pane' }),
  };
  for (const pane of Object.values(studioPanes)) studio.append(pane);

  const editor: EditorHandle = mountEditor(ctx, studioPanes.editor);
  const framesPanel = mountFramesPanel(ctx, studioPanes.frames);
  const filmPanel = mountFilmPanel(ctx, studioPanes.film);
  const exportPanel = mountExportPanel(ctx, studioPanes.export);
  const simPanel = mountSimPanel(ctx, sim, mech);
  const labPanel = mountLabPanel(ctx, sim, lab);

  // la hoja de contactos pide editar un fotograma individual: activa el modo en el editor
  document.addEventListener('praxi:edit-frame', () => {
    editor.editor.patch({ frameEdit: true, tool: 'select' });
  });

  function applyLayout(): void {
    const ui = ctx.project.ui;
    studio.classList.toggle('active', ui.section === 'studio');
    mech.classList.toggle('active', ui.section === 'mechanical');
    lab.classList.toggle('active', ui.section === 'laboratory');
    studioTabs.root.style.visibility = ui.section === 'studio' ? 'visible' : 'hidden';
    const tab = (ui.studioTab as StudioTab) || 'editor';
    for (const [id, pane] of Object.entries(studioPanes)) pane.classList.toggle('active', id === tab);
    studioTabs.set(tab);
    sections.set(ui.section);
    simPanel.setActive(ui.section === 'mechanical');
    labPanel.setActive(ui.section === 'laboratory');
    if (ui.section === 'studio' && tab === 'editor') requestAnimationFrame(() => editor.resize());
    if (ui.section === 'studio' && tab === 'frames') framesPanel.refresh();
    if (ui.section === 'studio' && tab === 'film') filmPanel.refresh();
    if (ui.section === 'studio' && tab === 'export') exportPanel.refresh();
    playBtn.textContent = ui.playing ? '⏸' : '▶';
  }
  ctx.store.subscribe((p) => `${p.ui.section}|${p.ui.studioTab}|${p.ui.playing}`, applyLayout);
  ctx.store.subscribe((p) => p.name, (n) => (nameInput.value = n));
  applyLayout();

  // --- barra de estado
  function renderStatus(): void {
    const d = ctx.derived();
    const p = ctx.project;
    const errors = d.warnings.filter((w) => w.level === 'error');
    const warns = d.warnings.filter((w) => w.level === 'warning');
    const set = ctx.frames();
    status.replaceChildren(
      el('span', { text: `${d.frameCount} fotogramas · ${p.animation.fps} fps · ${d.duration.toFixed(3)} s` }),
      d.reels
        ? el('span', { text: `película abierta ${(d.reels.design.totalMm / 1000).toFixed(2)} m × ${p.film.stripWidthMm} mm · paso ${p.film.pitchMm} mm · dos tambores, lleno Ø${(2 * d.reels.design.fullR).toFixed(1)} mm` })
        : el('span', { text: `película ${d.layout.totalLengthMm.toFixed(1)} × ${p.film.stripWidthMm} mm · paso ${p.film.pitchMm} mm · loop ${d.layout.loopLengthMm.toFixed(1)} mm` }),
      d.reels
        ? el('span', { text: `de ${d.reels.fps.min} a ${d.reels.fps.max} fps con la mano · ${d.reels.fps.normal} fps a 15 cm · destello de ${d.reels.pulseUs.slow.toFixed(0)} a ${d.reels.pulseUs.fast.toFixed(0)} µs` })
        : el('span', { text: `recorrido ${d.path.lengthMm.toFixed(1)} mm · ${d.sync.actual.filmSpeedMmS.toFixed(0)} mm/s · ${d.sync.actual.transportFps.toFixed(2)} fot/s · ${d.sync.actual.flashHz.toFixed(2)} Hz` }),
      el('span', { class: d.coherence.ok ? 'st-ok' : d.coherence.level === 'error' ? 'st-err' : 'st-warn', text: d.reels ? 'película abierta: sin loop que cerrar' : d.coherence.ok ? 'película ↔ recorrido OK' : `película ↔ recorrido: ${d.coherence.errorMm > 0 ? '+' : ''}${d.coherence.errorMm.toFixed(1)} mm` }),
      el('span', { class: errors.length ? 'st-err' : warns.length ? 'st-warn' : 'st-ok', text: errors.length ? `${errors.length} error(es)` : warns.length ? `${warns.length} aviso(s)` : 'sin avisos', title: d.warnings.map((w) => `${w.source}: ${w.message}`).join('\n') }),
      el('span', { class: 'spacer' }),
      el('span', { text: `caché: ${set.cached} · repintados: ${set.regenerated}` }),
    );
  }
  ctx.store.onChange(renderStatus);
  renderStatus();

  // atajos globales
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.key === '1' && e.altKey) ctx.store.update((p) => ({ ...p, ui: { ...p.ui, section: 'studio' } }));
    if (e.key === '2' && e.altKey) ctx.store.update((p) => ({ ...p, ui: { ...p.ui, section: 'mechanical' } }));
    if (e.key === '3' && e.altKey) ctx.store.update((p) => ({ ...p, ui: { ...p.ui, section: 'laboratory' } }));
    if (e.key === ' ' && ctx.project.ui.section !== 'studio') {
      e.preventDefault();
      ctx.store.update((p) => ({ ...p, ui: { ...p.ui, playing: !p.ui.playing } }));
    }
  });
}
