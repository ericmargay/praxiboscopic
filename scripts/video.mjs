#!/usr/bin/env node
// Importa un video como secuencia de cuadros para el estudio: public/videos/<nombre>/f0000.jpg … + manifest.json, y
// lo registra en public/videos/index.json para que aparezca en la biblioteca.
//
//   node scripts/video.mjs "<archivo.mp4>" --nombre=cried-out [--alto=640]
//
// Color: el video viene en YUV BT.709 de rango limitado (16–235). ffmpeg, si no se le dice, convierte con la matriz
// BT.601 y desplaza rojos y verdes; aquí se declara la matriz y el rango de entrada y se escribe JPEG en YUV 4:4:4 de
// rango completo (JFIF, BT.601), que es lo que leen el navegador y la impresión. Sin submuestreo de croma extra.
// Loop: si el último cuadro repite el primero (videos hechos para repetirse) se descarta, para que el ciclo no tenga un
// cuadro doble al cerrar. También calcula la paleta (k-medias) con la proporción de cada color.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const input = argv.find((a) => !a.startsWith('--'));
const opt = new Map(argv.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')).map(([k, v]) => [k, v ?? '1']));
if (!input) {
  console.error('Uso: node scripts/video.mjs "<archivo>" --nombre=<carpeta> [--alto=640]');
  process.exit(1);
}
const name = opt.get('nombre') ?? path.basename(input).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const height = Number(opt.get('alto') ?? 640);
const outDir = path.join(root, 'public', 'videos', name);

const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames,color_space,color_range,color_transfer,color_primaries', '-of', 'json', input]).toString()).streams[0];
const [fn, fd] = probe.r_frame_rate.split('/').map(Number);
const fps = fn / fd;
const total = Number(probe.nb_read_frames);
const matrix = { bt709: 'bt709', smpte170m: 'bt601', bt470bg: 'bt601', bt2020nc: 'bt2020' }[probe.color_space] ?? 'bt709';
const range = probe.color_range === 'pc' ? 'pc' : 'tv';
const width = Math.round((height * probe.width) / probe.height / 2) * 2;
const scale = `scale=w=${width}:h=${height}:flags=lanczos+accurate_rnd+full_chroma_int:in_color_matrix=${matrix}:in_range=${range}:out_color_matrix=bt601:out_range=pc`;

/** cuadro n como RGB pequeño, para comparar */
function rawFrame(n) {
  return execFileSync('ffmpeg', ['-v', 'error', '-i', input, '-vf', `select=eq(n\\,${n}),scale=w=72:h=128:in_color_matrix=${matrix}:in_range=${range}:out_range=pc,format=rgb24`, '-frames:v', '1', '-f', 'rawvideo', '-']);
}
const a = rawFrame(0);
const b = rawFrame(total - 1);
let diff = 0;
for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
diff /= a.length;
const dropLast = diff < 3;
const count = dropLast ? total - 1 : total;
console.log(`→ ${probe.width}×${probe.height} · ${fps} fps · ${total} cuadros · matriz ${matrix} rango ${range} · último vs primero: ${diff.toFixed(2)}/255 ${dropLast ? '(repite el primero: se descarta)' : ''}`);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
execFileSync('ffmpeg', ['-v', 'error', '-i', input, '-vf', `${scale},format=yuvj444p`, '-frames:v', String(count), '-q:v', '2', '-start_number', '0', path.join(outDir, 'f%04d.jpg')]);
const files = (await readdir(outDir)).filter((f) => f.endsWith('.jpg')).sort();
console.log(`→ ${files.length} cuadros de ${width}×${height} en ${path.relative(root, outDir)}`);

// paleta: k-medias sobre una muestra de píxeles de todos los cuadros
const samples = [];
const cw = 45;
const ch = Math.round((cw * height) / width);
const canvas = createCanvas(cw, ch);
const g = canvas.getContext('2d');
for (const f of files) {
  g.drawImage(await loadImage(await readFile(path.join(outDir, f))), 0, 0, cw, ch);
  const d = g.getImageData(0, 0, cw, ch).data;
  for (let i = 0; i < d.length; i += 4) samples.push([d[i], d[i + 1], d[i + 2]]);
}
const K = Number(opt.get('colores') ?? 10);
let centers = Array.from({ length: K }, (_, k) => samples[Math.floor(((k + 0.5) / K) * samples.length)].slice());
// arranque k-means++ simple: el siguiente centro es el punto más lejano de los ya elegidos
centers = [samples[0].slice()];
while (centers.length < K) {
  let best = 0;
  let pick = samples[0];
  for (let i = 0; i < samples.length; i += 7) {
    const p = samples[i];
    let dmin = Infinity;
    for (const c of centers) dmin = Math.min(dmin, (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2);
    if (dmin > best) {
      best = dmin;
      pick = p;
    }
  }
  centers.push(pick.slice());
}
let counts = new Array(K).fill(0);
for (let it = 0; it < 12; it++) {
  const sum = centers.map(() => [0, 0, 0]);
  counts = new Array(K).fill(0);
  for (const p of samples) {
    let bi = 0;
    let bd = Infinity;
    for (let k = 0; k < K; k++) {
      const c = centers[k];
      const dd = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
      if (dd < bd) {
        bd = dd;
        bi = k;
      }
    }
    counts[bi]++;
    sum[bi][0] += p[0];
    sum[bi][1] += p[1];
    sum[bi][2] += p[2];
  }
  centers = centers.map((c, k) => (counts[k] ? sum[k].map((v) => v / counts[k]) : c));
}
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const palette = centers
  .map((c, k) => ({ hex: hex(c), rgb: c.map((v) => Math.round(v)), share: counts[k] / samples.length }))
  .filter((p) => p.share > 0.002)
  .sort((x, y) => y.share - x.share);

const manifest = {
  name,
  title: opt.get('titulo') ?? path.basename(input).replace(/\.[^.]+$/, ''),
  source: path.basename(input),
  sourceFps: fps,
  sourceFrames: total,
  frames: files.length,
  loopDuplicateDropped: dropLast,
  durationS: files.length / fps,
  widthPx: width,
  heightPx: height,
  sequence: { base: `videos/${name}/f`, count: files.length, digits: 4, ext: '.jpg' },
  color: `YUV ${matrix} rango ${range === 'tv' ? 'limitado' : 'completo'} → sRGB rango completo, JPEG 4:4:4`,
  palette,
};
await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
const indexFile = path.join(root, 'public', 'videos', 'index.json');
let index = [];
try {
  index = JSON.parse(await readFile(indexFile, 'utf8'));
} catch {
  /* primero */
}
index = [...index.filter((v) => v.name !== name), { name, title: manifest.title, frames: manifest.frames, sourceFps: fps, durationS: manifest.durationS, widthPx: width, heightPx: height }];
await writeFile(indexFile, JSON.stringify(index, null, 2));
console.log(`→ paleta: ${palette.map((p) => `${p.hex} ${(p.share * 100).toFixed(1)} %`).join(' · ')}`);
console.log(`→ ${path.relative(root, path.join(outDir, 'manifest.json'))} y public/videos/index.json`);
