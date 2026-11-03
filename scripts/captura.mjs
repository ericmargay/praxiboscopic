#!/usr/bin/env node
// Verificación visual: construye la app, la sirve con vite preview y captura con Chrome headless las tres
// secciones (y las pestañas del estudio) en capturas/<nombre>.png, más capturas/report.json con las estadísticas
// que publica window.__praxi. Termina con error si la app no arranca o hay errores de consola.
//   node scripts/captura.mjs [--skip-build] [--vistas=studio,frames,film,export,mechanical,laboratory]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']));
const views = (args.get('vistas') ?? 'studio,frames,film,export,mechanical,mechanical-motor,mechanical-electronics,mechanical-interior,mechanical-gate,mechanical-screen,laboratory,laboratory-drum,compras').split(',');
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
