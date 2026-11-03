// Biblioteca de animaciones: tarjetas de los generadores procedurales, generación desde una descripción textual
// (motor procedural o servicio de IA configurable), importar/exportar la animación en JSON y animación vacía.
import type { AppContext } from '../../app/context';
import { emptyDoc, makeLayer, parseAnimationDoc } from '../../animation/model';
import { GENERATORS } from '../../animation/procedural';
import { button, download, el, textControl } from '../controls';
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
