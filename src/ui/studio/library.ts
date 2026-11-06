// Biblioteca de animaciones: tarjetas de los generadores procedurales, generación desde una descripción textual
// (motor procedural o servicio de IA configurable), importar/exportar la animación en JSON y animación vacía.
import type { AppContext } from '../../app/context';
import { emptyDoc, makeLayer, parseAnimationDoc } from '../../animation/model';
import { GENERATORS } from '../../animation/procedural';
import { button, download, el, numberControl, selectControl, textControl } from '../controls';
import { reelsProject, videoProject, type VideoManifest } from '../../core/video';
import { DEFAULT_LAMINATE } from '../../film/layout';
import type { EditorStore } from './state';

export function mountLibrary(ctx: AppContext, es: EditorStore, root: HTMLElement): { dispose(): void } {
  root.classList.add('panel', 'library-panel');
  root.append(el('h3', { text: 'Biblioteca' }));
  const body = el('div', { class: 'panel-body library-body' });
  root.append(body);

  // generación por texto
  const prompt = el('textarea', { class: 'ctl-text prompt-input', rows: 2, placeholder: 'Describe la animación: «pelota roja rebotando tres veces, 36 fotogramas» · «ave azul volando rápido» · «engranaje de 16 dientes antihorario»' }) as HTMLTextAreaElement;
  const notes = el('div', { class: 'hint notes' });
  const engineLine = el('div', { class: 'hint engine-line' });
  const generate = button('Generar', () => run(), { kind: 'primary' });
  prompt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run();
    e.stopPropagation();
  });
  async function run(): Promise<void> {
    const text = prompt.value.trim();
    if (!text) return;
    generate.disabled = true;
    notes.textContent = 'Generando…';
    try {
      const out = await ctx.generateFromText(text);
      notes.replaceChildren(...out.map((n) => el('div', { text: `· ${n}` })));
      es.patch({ selectedItemId: null, selectedKey: null });
    } catch (e) {
      notes.textContent = `Error: ${e instanceof Error ? e.message : e}`;
    } finally {
      generate.disabled = false;
    }
  }
  // configuración del servicio de IA
  const aiBox = el('div', { class: 'ai-config', style: 'display:none' });
  const endpoint = textControl('Endpoint', '', (v) => ctx.aiEngine.configure({ endpoint: v || undefined }), 'https://…/generate');
  const model = textControl('Modelo', '', (v) => ctx.aiEngine.configure({ model: v || undefined }), 'nombre del modelo');
  const apiKey = textControl('Llave', '', (v) => ctx.aiEngine.configure({ apiKey: v || undefined }), 'opcional');
  apiKey.input.type = 'password';
  aiBox.append(el('div', { class: 'hint', text: 'Servicio HTTP POST que reciba { prompt, model, schema, base } y devuelva un documento praxiboscopic.animation/1 o { generator: { id, params } }.' }), endpoint.root, model.root, apiKey.root, button('Aplicar', () => refreshEngine(), { kind: 'ghost' }));
  const aiToggle = button('IA…', () => {
    aiBox.style.display = aiBox.style.display === 'none' ? 'block' : 'none';
  }, { kind: 'ghost', title: 'Configurar un servicio de generación por IA' });
  function refreshEngine(): void {
    const ai = ctx.aiEngine.available();
    engineLine.textContent = ai ? 'Motor: servicio de IA configurado (con el procedural como respaldo).' : `Motor: procedural. ${ctx.aiEngine.unavailableReason()}`;
  }
  refreshEngine();
  body.append(el('div', { class: 'lib-section' }, el('h4', { text: 'Describir animación' }), prompt, el('div', { class: 'btn-row' }, generate, aiToggle), engineLine, aiBox, notes));

  // generadores
  const cards = el('div', { class: 'lib-cards' });
  for (const g of GENERATORS) {
    const card = el('button', { class: 'lib-card', type: 'button', title: g.description }, el('span', { class: 'lib-card-title', text: g.label }), el('span', { class: 'lib-card-desc', text: g.description }));
    card.addEventListener('click', () => {
      ctx.loadGenerator(g.id);
      es.patch({ selectedItemId: null, selectedKey: null, selectedLayerId: null });
    });
    cards.append(card);
  }
  body.append(el('div', { class: 'lib-section' }, el('h4', { text: 'Animaciones de ejemplo' }), el('div', { class: 'hint', text: 'Cada una es real y editable: cambia sus parámetros en el panel de la derecha o hornéala para editar capa por capa.' }), cards));

  // videos importados con scripts/video.mjs (public/videos/index.json)
  const videoBox = el('div', { class: 'lib-section' }, el('h4', { text: 'Videos' }));
  body.append(videoBox);
  void loadVideos(ctx, videoBox, notes, () => es.patch({ selectedItemId: null, selectedKey: null, selectedLayerId: null }));

  // archivo
  const fileInput = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' }) as HTMLInputElement;
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    try {
      const doc = parseAnimationDoc(JSON.parse(await f.text()));
      ctx.store.update((p) => ({ ...p, animation: doc, targetFps: doc.fps }));
      es.patch({ selectedItemId: null, selectedKey: null });
    } catch (e) {
      notes.textContent = `Animación no válida: ${e instanceof Error ? e.message : e}`;
    }
    fileInput.value = '';
  });
  body.append(
    el(
      'div',
      { class: 'lib-section' },
      el('h4', { text: 'Archivo' }),
      el(
        'div',
        { class: 'btn-row' },
        button('Nueva vacía', () => {
          const doc = emptyDoc({ name: 'Nueva animación', width: 480, height: 300, fps: 24, duration: 1, layers: [makeLayer('Capa 1')] });
          ctx.store.update((p) => ({ ...p, animation: doc, targetFps: doc.fps }));
          es.patch({ selectedItemId: null, selectedKey: null, selectedLayerId: doc.layers[0].id });
        }, { kind: 'ghost' }),
        button('Importar JSON', () => fileInput.click(), { kind: 'ghost' }),
        button('Exportar JSON', () => {
          const doc = ctx.project.animation;
          download(`${slug(doc.name)}.animation.json`, JSON.stringify(doc, null, 2), 'application/json');
        }, { kind: 'ghost' }),
      ),
      fileInput,
    ),
  );
  return { dispose() {} };
}

interface VideoEntry {
  name: string;
  title: string;
  frames: number;
  sourceFps: number;
  durationS: number;
}

/**
 * Tarjetas de los videos importados. «Usar» cambia el proyecto entero: animación, película del largo necesario,
 * recorrido (festón con la película laminada, rectángulo de 4 rodillos con la sencilla) e impresión en carta.
 * `?video=<nombre>&segundos=5&fps=24&pelicula=laminada` en la URL hace lo mismo al abrir (`fps` vacío: uno por cuadro
 * del video; `pelicula=sencilla`: rectángulo; `recorrido=tambores`: la mesa de dos tambores, ADR-0011).
 */
async function loadVideos(ctx: AppContext, box: HTMLElement, notes: HTMLElement, done: () => void): Promise<void> {
  let list: VideoEntry[] = [];
  try {
    const r = await fetch('./videos/index.json');
    if (r.ok) list = await r.json();
  } catch {
    /* sin videos */
  }
  if (!list.length) {
    box.append(el('div', { class: 'hint', text: 'Sin videos. Impórtalos con: node scripts/video.mjs "archivo.mp4" --nombre=mi-video' }));
    return;
  }
  const apply = async (v: VideoEntry, seconds: number, fit: 'contain' | 'cover', fps: number | undefined, film: string) => {
    const m = (await (await fetch(`./videos/${v.name}/manifest.json`)).json()) as VideoManifest;
    const laminated = film !== 'sencilla';
    const video = videoProject(ctx.project, m, { seconds, fit, fps, laminate: laminated ? DEFAULT_LAMINATE : undefined });
    ctx.replaceProject(film === 'tambores' ? reelsProject(video) : video);
    const count = fps ? Math.round(fps * seconds) : m.frames;
    const pick = count < m.frames ? ` · se saltan ${m.frames - count} de ${m.frames} cuadros` : count > m.frames ? ` · se repiten ${count - m.frames} cuadros` : '';
    const dd = ctx.derived();
    const rollers = dd.pathSpec.rollers.length;
    const path = dd.reels ? `Película laminada entre dos tambores: lleno mide Ø${(2 * dd.reels.design.fullR).toFixed(1)} mm` : laminated ? `Película laminada en festón de ${rollers} rodillos` : `Película sencilla en rectángulo de ${rollers} rodillos`;
    notes.textContent = `· ${m.title}: ${count} fotogramas en ${seconds} s a ${(count / seconds).toFixed(2)} fps${pick}. La película mide ${((count * ctx.project.film.pitchMm) / 1000).toFixed(2)} m. ${path}.`;
    done();
  };
  const fpsOf = (x: string | null) => (x ? Number(x) || undefined : undefined);
  for (const v of list) {
    let seconds = 5;
    let fit: 'contain' | 'cover' = 'contain';
    let fps = '24';
    let film = 'laminada';
    const secs = numberControl({ label: 'Duración', value: seconds, min: 1, max: 60, step: 0.5, unit: 's', decimals: 1, onChange: (x) => (seconds = x), help: 'El video se alenta o acelera para llenarla' });
    const fpsSel = selectControl({ label: 'Proyección', value: fps, options: [{ value: '', label: 'Uno por cuadro del video' }, { value: '24', label: '24 fps' }, { value: '18', label: '18 fps' }, { value: '12', label: '12 fps' }], onChange: (x) => (fps = x), help: 'A fps fijos cada fotograma toma el cuadro del video que toca en su instante: se saltan o se repiten cuadros' });
    const fitSel = selectControl({ label: 'Encuadre', value: fit, options: [{ value: 'contain', label: 'Completo (bandas negras)' }, { value: 'cover', label: 'Llenar el fotograma (recorta)' }], onChange: (x) => (fit = x as typeof fit) });
    const filmSel = selectControl({ label: 'Película', value: film, options: [{ value: 'laminada', label: 'Laminada: festón compacto' }, { value: 'sencilla', label: 'Sencilla: rectángulo de 4 rodillos' }, { value: 'tambores', label: 'Laminada entre dos tambores, con la mano' }], onChange: (x) => (film = x), help: 'Laminada: una cubierta tapa la tinta y los rodillos pueden tocar las dos caras. Sencilla: solo un loop convexo no roza la tinta, y pide más mesa. Dos tambores: la película va y viene con la mano del visitante' });
    box.append(
      el('div', { class: 'lib-card video-card' }, el('span', { class: 'lib-card-title', text: v.title }), el('span', { class: 'lib-card-desc', text: `${v.frames} cuadros · ${v.durationS.toFixed(2)} s a ${v.sourceFps} fps` }), secs.root, fpsSel.root, fitSel.root, filmSel.root, button('Usar en el proyecto', () => void apply(v, seconds, fit, fpsOf(fps), film), { kind: 'primary' })),
    );
  }
  const q = new URLSearchParams(location.search);
  const v = list.find((x) => x.name === q.get('video'));
  if (!v) return;
  const seconds = Number(q.get('segundos') ?? 5);
  const fps = q.has('fps') ? fpsOf(q.get('fps')) : 24;
  const film = q.get('recorrido') === 'tambores' ? 'tambores' : q.get('pelicula') === 'sencilla' ? 'sencilla' : 'laminada';
  // se aplica si el proyecto no tiene ya ese video con esa duración, esos fps, esa película y ese recorrido
  const a = ctx.project.animation;
  const loaded = a.layers.some((l) => l.items.some((it) => it.type === 'image' && it.sequence?.base.includes(`/${v.name}/`))) && a.duration === seconds && (!fps || a.fps === fps) && !!ctx.project.film.laminate === (film !== 'sencilla') && (ctx.project.pathLayout === 'reels') === (film === 'tambores');
  if (!loaded) await apply(v, seconds, 'contain', fps, film);
}

function slug(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'animacion'
  );
}
