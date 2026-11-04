#!/usr/bin/env node
// Prepara la impresión de la película de un video importado (scripts/video.mjs): PDF a tamaño real en hojas carta
// horizontales, con la tira cortada entre fotogramas, marcas de corte y empalme, el perfil sRGB incrustado en las
// imágenes (sin pérdida, Flate) y una página con los colores del material. Escribe también una prueba de color de dos
// hojas para probar la impresora antes de gastar acetato, y un MP4 con los fotogramas tal como se imprimen.
//
//   node scripts/imprimir.mjs --video=cried-out [--segundos=5] [--fps=24] [--encuadre=contain|cover] [--hoja=letter]
//
// Sin --fps sale un fotograma por cuadro del video (217 en 10 s = 21,7 fps).
// Imprimir: Vista Previa / Acrobat al 100 % («Tamaño real», sin «Ajustar»), papel «transparencia», calidad máxima.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opt = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']));
const name = opt.get('video') ?? 'cried-out';
const seconds = Number(opt.get('segundos') ?? 5);
const fpsOpt = opt.has('fps') ? Number(opt.get('fps')) || undefined : 24;
const fit = opt.get('encuadre') === 'cover' ? 'cover' : 'contain';
const sheet = opt.get('hoja') ?? 'letter';

const server = await createServer({ root, configLoader: 'runner', configFile: false, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] }, resolve: { dedupe: ['three', 'zod'] } });
try {
  const load = (m) => server.ssrLoadModule(m);
  const { demoProject, deriveProject } = await load('/src/core/project.ts');
  const { videoProject } = await load('/src/core/video.ts');
  const { FrameGenerator } = await load('/src/frames/generator.ts');
  const { exportStripPdf } = await load('/src/export/exporters.ts');
  const { srgbIccProfile } = await load('/src/export/icc.ts');
  const { tilePlan } = await load('/src/film/print.ts');
  const { nodeCanvases, imageDataOf } = await load('/src/test/nodeCanvas.ts');
  const { loadImage } = await import('@napi-rs/canvas');

  const manifest = JSON.parse(await readFile(path.join(root, 'public', 'videos', name, 'manifest.json'), 'utf8'));
  const p0 = videoProject(demoProject(), manifest, { seconds, fit, fps: fpsOpt });
  const tag = `${name}-${seconds}s${fpsOpt ? `-${fpsOpt}fps` : ''}`;
  const p = { ...p0, print: { ...p0.print, pageId: sheet, ppi: Math.round((p0.frames.widthPx / p0.frames.widthMm) * 25.4) } };
  const d = deriveProject(p);

  // los cuadros del video, ya decodificados, para que el generador los encuentre al pintar
  const images = new Map();
  for (let i = 0; i < manifest.sequence.count; i++) {
    const src = `${manifest.sequence.base}${String(i).padStart(manifest.sequence.digits, '0')}${manifest.sequence.ext}`;
    images.set(src, await loadImage(await readFile(path.join(root, 'public', src))));
  }
  const used = new Set();
  const missing = new Set();
  const gen = new FrameGenerator(nodeCanvases, { getImage: (src) => (images.has(src) ? (used.add(src), images.get(src)) : (missing.add(src), null)) });
  const frames = gen.generate(p.animation, p.frames);
  console.log(`→ ${frames.count} fotogramas de ${frames.widthPx}×${frames.heightPx} px (${frames.widthMm}×${frames.heightMm} mm) · ${p.animation.fps} fps · ${seconds} s · usan ${used.size} de los ${images.size} cuadros del video${missing.size ? ` · ${missing.size} cuadros no encontrados` : ''}`);

  const plan = tilePlan(d.layout, p.print);
  const ctx = { canvases: nodeCanvases, deflate: (data) => new Uint8Array(deflateSync(data, { level: 9 })) };
  const extras = { iccProfile: srgbIccProfile(), palette: manifest.palette };
  const outDir = path.join(root, 'impresion');
  await mkdir(outDir, { recursive: true });
  const full = await exportStripPdf(d.layout, frames.frames, p.print, ctx, p.name, `${tag}-tira-${sheet}`, extras);
  await writeFile(path.join(outDir, full.file.name), full.file.data);
  const proof = await exportStripPdf(d.layout, frames.frames, p.print, ctx, p.name, `${tag}-prueba-de-color`, { ...extras, maxStripPages: 1 });
  await writeFile(path.join(outDir, proof.file.name), proof.file.data);
  const mb = (b) => (b.length / 1e6).toFixed(1);
  console.log(`→ impresion/${full.file.name}: portada, colores y ${plan.pages} hojas con ${plan.segments.length} tramos de tira (${mb(full.file.data)} MB)`);
  console.log(`→ impresion/${proof.file.name}: portada, colores y la primera hoja de tira (${mb(proof.file.data)} MB)`);
  // vista previa: los fotogramas en orden de tiempo, a los fps de proyección, etiquetados BT.709
  const mp4 = path.join(outDir, `${tag}.mp4`);
  const ordered = [...frames.frames].sort((a, b) => a.sourceIndex - b.sourceIndex);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${frames.widthPx}x${frames.heightPx}`, '-framerate', String(p.animation.fps), '-i', '-', '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv', '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', mp4], { stdio: ['pipe', 'inherit', 'inherit'] });
  const finished = new Promise((ok, fail) => ff.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg terminó con ${code}`)))));
  for (const f of ordered) if (!ff.stdin.write(((d) => Buffer.from(d.buffer, d.byteOffset, d.byteLength))(imageDataOf(f.canvas).data))) await new Promise((r) => ff.stdin.once('drain', r));
  ff.stdin.end();
  await finished;
  console.log(`→ impresion/${path.basename(mp4)}: ${ordered.length} fotogramas a ${p.animation.fps} fps (${frames.widthPx}×${frames.heightPx} px, lo que se imprime)`);
  console.log(`→ tira de ${(d.layout.totalLengthMm / 1000).toFixed(3)} m · ${p.print.ppi} ppi · ${plan.page.label} horizontal · ${plan.rowsPerPage} tramos por hoja · solape ${p.print.overlapMm} mm`);
} finally {
  await server.close();
}
