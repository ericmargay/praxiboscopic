#!/usr/bin/env node
// Verificación visual: construye la app, la sirve con vite preview y captura con Chrome headless las tres
// secciones (y las pestañas del estudio) en capturas/<nombre>.png, más capturas/report.json con las estadísticas
// que publica window.__praxi. Termina con error si la app no arranca o hay errores de consola.
//   node scripts/captura.mjs [--skip-build] [--vistas=studio,frames,film,export,mechanical,laboratory]
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']));
const hasVideo = existsSync(path.join(root, 'public', 'videos', 'cried-out', 'manifest.json'));
const views = (args.get('vistas') ?? `studio,frames,film,export,mechanical,mechanical-motor,mechanical-electronics,mechanical-interior,mechanical-gate,mechanical-screen,laboratory,laboratory-drum,compras,laminada,laminada-top,tambores,tambores-top,tambores-manos,tambores-interior,tambores-ventana,tambores-tensor,tambores-laboratorio,tambores-ensamble,tambores-explosion,compras-tambores,compras-taller${hasVideo ? ',video-frames,video-mechanical,video-top,video-gate,video-laboratory' : ''}`).split(',');
const outDir = path.join(root, 'capturas');
await mkdir(outDir, { recursive: true });

if (!args.has('skip-build')) {
  console.log('→ vite build');
  await build({ root, configLoader: 'runner', logLevel: 'error' });
}
const server = await preview({ root, configLoader: 'runner', preview: { port: 4188, open: false }, logLevel: 'error' });
const url = server.resolvedUrls.local[0];
console.log(`→ preview en ${url}`);

const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome', args: ['--use-gl=angle', '--use-angle=metal', '--enable-unsafe-swiftshader'] }).catch(() => chromium.launch({ args: ['--use-gl=swiftshader'] }));
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

const report = { url, generated: new Date().toISOString(), views: {}, consoleErrors };
const SECTION = { studio: ['studio', 'editor'], frames: ['studio', 'frames'], film: ['studio', 'film'], export: ['studio', 'export'], laboratory: ['laboratory'], 'laboratory-drum': ['laboratory'] };
/** acciones adicionales por vista: encuadre 3D, selección de una pieza o cambio de estroboscopio */
async function prepare(page, v) {
  const scene = (js) => page.evaluate(js);
  if (v === 'mechanical') await scene(() => { window.__praxiScene.select(null); window.__praxiScene.setView('home'); });
  if (v === 'mechanical-motor') await scene(() => { window.__praxiScene.select('motor', true); });
  if (v === 'mechanical-electronics') await scene(() => { window.__praxiScene.select('irlz44n'); window.__praxiScene.setView('control'); });
  if (v === 'mechanical-interior') await scene(() => { window.__praxiScene.select('dm542'); window.__praxiScene.setView('base'); });
  if (v === 'mechanical-gate') await scene(() => { window.__praxiScene.select('sensor'); window.__praxiScene.setView('gate'); });
  if (v === 'mechanical-screen') await scene(() => { window.__praxiScene.select(null); window.__praxiScene.setView('screen'); });
  if (v === 'laboratory-drum') await page.evaluate(() => window.__praxi.ctx.store.update((p) => ({ ...p, strobeKind: 'drum' })));
  if (v === 'laboratory') await page.evaluate(() => window.__praxi.ctx.store.update((p) => ({ ...p, strobeKind: 'led' })));
}
try {
  await page.goto(`${url}?demo=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__praxi?.ready || window.__praxi?.error, null, { timeout: 30_000 });
  const err = await page.evaluate(() => window.__praxi.error);
  if (err) throw new Error(`La app no arrancó: ${err}`);
  for (const v of views) {
    if (v.startsWith('video-')) {
      // proyecto del video (no versionado): se carga desde la biblioteca con ?video= (5 s a 24 fps, ADR-0009)
      const target = { 'video-frames': 'section=studio&tab=frames', 'video-mechanical': 'section=mechanical', 'video-top': 'section=mechanical', 'video-gate': 'section=mechanical', 'video-laboratory': 'section=laboratory' }[v];
      await page.goto(`${url}?demo=1&video=cried-out&segundos=5&fps=24&${target}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__praxi?.ready && window.__praxi.ctx.project.animation.layers.some((l) => l.items.some((it) => it.sequence)), null, { timeout: 30_000 });
      await page.waitForTimeout(6000);
      if (v === 'video-top') await page.evaluate(() => window.__praxiScene?.setView('top'));
      if (v === 'video-mechanical') await page.evaluate(() => window.__praxiScene?.setView('home'));
      if (v === 'video-gate') await page.evaluate(() => { window.__praxiScene?.select('sensor'); window.__praxiScene?.setView('gate'); });
      await page.waitForTimeout(1500);
      const file = path.join(outDir, `${v}.png`);
      await page.screenshot({ path: file });
      report.views[v] = { file: path.relative(root, file), stats: await page.evaluate(() => window.__praxi.stats()) };
      console.log(`✓ ${v} → ${path.relative(root, file)}`);
      continue;
    }
    if (v === 'compras') {
      await page.goto(`${url}compras.html?demo=1&row=motor-17hs8401`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30_000 });
      await page.waitForTimeout(1200);
      const file = path.join(outDir, 'compras.png');
      await page.screenshot({ path: file });
      report.views[v] = { file: path.relative(root, file) };
      console.log(`✓ ${v} → ${path.relative(root, file)}`);
      continue;
    }
    if (v === 'compras-tambores' || v === 'compras-taller') {
      // la pestaña Taller (ADR-0012): archivos de corte e impresión, textos para cotizar y estimados
      await page.goto(`${url}compras.html?demo=tambores${v === 'compras-taller' ? '#fabricacion' : '&row=hand-sensor'}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30_000 });
      await page.waitForTimeout(1200);
      const file = path.join(outDir, `${v}.png`);
      await page.screenshot({ path: file, fullPage: true });
      report.views[v] = { file: path.relative(root, file) };
      console.log(`✓ ${v} → ${path.relative(root, file)}`);
      continue;
    }
    if (v.startsWith('tambores')) {
      // dos tambores (?demo=tambores, ADR-0011): la mano sobre el tambor 1 a 15 cm mueve la película hacia él
      const lab = v === 'tambores-laboratorio';
      // ensamble sin tornillos (ADR-0012): el paso 5 con la cubierta bajando, y la mesa completa en explosión
      const asm = { 'tambores-ensamble': '&ensamble=5&explosion=0.35', 'tambores-explosion': '&ensamble=12&explosion=0.7' }[v];
      await page.goto(`${url}?demo=tambores&section=${lab ? 'laboratory' : 'mechanical'}${asm ?? (v === 'tambores-top' || v === 'tambores-interior' ? '' : '&mano=1&cm=15')}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__praxi?.ready, null, { timeout: 30_000 });
      await page.waitForTimeout(2500);
      const view = { tambores: 'home', 'tambores-top': 'top', 'tambores-manos': 'hands', 'tambores-interior': 'base', 'tambores-ventana': 'gate' }[v];
      if (view) await page.evaluate(([vv, sel]) => { window.__praxiScene?.select(sel); window.__praxiScene?.setView(vv); }, [view, v === 'tambores-interior' ? 'dm542-1' : null]);
      if (v === 'tambores-tensor') await page.evaluate(() => window.__praxiScene?.select('dancer', true));
      await page.waitForTimeout(1500);
      const file = path.join(outDir, `${v}.png`);
      await page.screenshot({ path: file });
      report.views[v] = { file: path.relative(root, file), stats: await page.evaluate(() => window.__praxi.stats()) };
      console.log(`✓ ${v} → ${path.relative(root, file)}`);
      continue;
    }
    if (v.startsWith('laminada')) {
      // película laminada de 5 s con la pelota (?demo=laminada): la máquina que se publica sin el video (ADR-0010)
      await page.goto(`${url}?demo=laminada&section=mechanical`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__praxi?.ready, null, { timeout: 30_000 });
      await page.waitForTimeout(2500);
      await page.evaluate((top) => { window.__praxiScene?.select(null); window.__praxiScene?.setView(top ? 'top' : 'home'); }, v === 'laminada-top');
      await page.waitForTimeout(1500);
      const file = path.join(outDir, `${v}.png`);
      await page.screenshot({ path: file });
      report.views[v] = { file: path.relative(root, file), stats: await page.evaluate(() => window.__praxi.stats()) };
      console.log(`✓ ${v} → ${path.relative(root, file)}`);
      continue;
    }
    const [section, tab] = SECTION[v] ?? (v.startsWith('mechanical') ? ['mechanical'] : [v]);
    await page.evaluate(([s, t]) => window.__praxi.go(s, t), [section, tab]);
    await page.waitForTimeout(400);
    await prepare(page, v);
    await page.waitForTimeout(v.startsWith('mechanical') ? 2500 : 1500);
    const file = path.join(outDir, `${v}.png`);
    await page.screenshot({ path: file });
    report.views[v] = { file: path.relative(root, file), stats: await page.evaluate(() => window.__praxi.stats()) };
    console.log(`✓ ${v} → ${path.relative(root, file)}`);
  }
} finally {
  await browser.close();
  server.httpServer.close();
}
await writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
if (consoleErrors.length) {
  console.error('Errores de consola:', consoleErrors);
  process.exit(1);
}
console.log('→ capturas/report.json');
