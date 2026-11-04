// Punto de entrada de Praxiboscopic: crea el contexto (tienda del proyecto, generador de fotogramas con caché,
// motor temporal, compositor), el corredor de la simulación y el armazón de la interfaz. Expone window.__praxi
// para las capturas automatizadas (scripts/captura.mjs).
import './style.css';
import './ui/panels.css';
import { AppContext } from './app/context';
import { SimulationRunner } from './app/simulation';
import { browserCanvases } from './host/browserCanvas';
import { createModel3dRenderer } from './three';
import { mountShell } from './ui/shell';
import { demoProject, type Project } from './core/project';
import { laminatedDemoProject } from './core/video';

declare global {
  interface Window {
    __praxi: {
      ready: boolean;
      error: string | null;
      ctx: AppContext | null;
      sim: SimulationRunner | null;
      /** cambia de sección y pestaña (para las capturas) */
      go(section: Project['ui']['section'], tab?: string): void;
      stats(): Record<string, unknown>;
    };
  }
}

const q = new URLSearchParams(location.search);
window.__praxi = {
  ready: false,
  error: null,
  ctx: null,
  sim: null,
  go() {},
  stats: () => ({}),
};

try {
  const app = document.querySelector<HTMLElement>('#app')!;
  // ?demo=1 ignora el proyecto guardado y arranca con la demostración; ?demo=laminada, con la de película laminada
  const demo = q.get('demo');
  const ctx = new AppContext(browserCanvases, demo === '1' ? demoProject() : demo === 'laminada' ? laminatedDemoProject() : undefined);
  // render de elementos 3D (glTF) dentro de la animación
  const model3d = createModel3dRenderer();
  model3d.onLoaded = () => {
    ctx.generator.clear();
    ctx.store.update((p) => ({ ...p }));
  };
  ctx.resources.render3dHook = (geo, w, h) => model3d.render(geo, w, h);
  const sim = new SimulationRunner(ctx);
  sim.reset();
  ctx.onTick((dt) => sim.tick(dt));
  mountShell(ctx, sim, app);
  if (q.get('section')) ctx.store.update((p) => ({ ...p, ui: { ...p.ui, section: (q.get('section') as Project['ui']['section']) ?? p.ui.section, studioTab: q.get('tab') ?? p.ui.studioTab } }));
  if (q.get('play') === '0') ctx.store.update((p) => ({ ...p, ui: { ...p.ui, playing: false } }));
  window.__praxi.ctx = ctx;
  window.__praxi.sim = sim;
  window.__praxi.go = (section, tab) => ctx.store.update((p) => ({ ...p, ui: { ...p.ui, section, studioTab: tab ?? p.ui.studioTab } }));
  window.__praxi.stats = () => {
    const d = ctx.derived();
    const f = ctx.frames();
    return { frames: f.count, frameHash: f.hash, filmMm: d.layout.totalLengthMm, pathMm: d.path.lengthMm, coherent: d.coherence.ok, transportFps: d.sync.actual.transportFps, flashHz: d.sync.actual.flashHz, warnings: d.warnings.length, t: ctx.engine.t, phi: ctx.engine.phiMm, flashes: sim.flashCount, gate: sim.gate() };
  };
  window.__praxi.ready = true;
} catch (e) {
  window.__praxi.error = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
  console.error(e);
  document.body.innerHTML = `<pre style="color:#f66;padding:20px;white-space:pre-wrap">${window.__praxi.error}</pre>`;
}
