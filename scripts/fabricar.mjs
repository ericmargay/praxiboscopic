#!/usr/bin/env node
// Paquete para los talleres de la mesa de dos tambores (ADR-0012): corte láser (DXF R12, SVG y PDF 1:1 por material,
// con las piezas anidadas en hojas de 87 × 57 cm, kerf compensado y rótulos), los STL de las piezas impresas (sólidos
// de manifold-3d revisados con checkPrint de OMEGA), el README con los textos para cotizar, los estimados y los pasos de
// armado, y un ZIP con todo. Escribe en public/fabricacion/tambores/ (lo sirve Vite y va al sitio) y copia el README a
// docs/FABRICACION-TAMBORES.md.
//
//   node scripts/fabricar.mjs [--mdf=5.5] [--acrilico=3] [--lente=64]
//
// --mdf y --acrilico: espesores reales medidos con vernier (mm); --lente: diámetro del barril de la lente (mm).
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import Module from 'manifold-3d';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opt = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? '1']));
const mdfMm = opt.has('mdf') ? Number(opt.get('mdf')) : undefined;
const acrylicMm = opt.has('acrilico') ? Number(opt.get('acrilico')) : undefined;
const lensDiameterMm = opt.has('lente') ? Number(opt.get('lente')) : undefined;

const mf = await Module();
mf.setup();
const server = await createServer({ root, configLoader: 'runner', configFile: false, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] }, resolve: { dedupe: ['three', 'zod'] } });
try {
  const load = (m) => server.ssrLoadModule(m);
  const { deriveProject } = await load('/src/core/project.ts');
  const { reelsDemoProject } = await load('/src/core/video.ts');
  const { buildReelsStructure, SHEET_MATERIALS } = await load('/src/mech/structure.ts');
  const { reelsPrintedParts } = await load('/src/fabricate/printed.ts');
  const { laserQuantities, printQuantities } = await load('/src/fabricate/quantities.ts');
  const { FAB_DIR, LASER_PREFIX, ZIP_NAME, fabricationReadme } = await load('/src/fabricate/shops.ts');
  const { laserSvg, laserDxf, checkPrint, stlBinary, pointInPolygon, bbox } = await load('@aminoacid/omega/fabricate');
  const { buildPdf } = await load('/src/export/pdf.ts');
  const { zipStore } = await load('/src/export/zip.ts');

  const p = reelsDemoProject();
  const d = deriveProject(p);
  const st = buildReelsStructure(p, d, { mdfMm, acrylicMm });
  if (st.problems.length) throw new Error(`la estructura tiene problemas:\n${st.problems.join('\n')}`);
  const parts = reelsPrintedParts(p, d, { lensDiameterMm }, st.asm);
  const laser = laserQuantities(st);
  const pe = printQuantities(parts);
  const out = path.join(root, 'public', FAB_DIR);
  await rm(out, { recursive: true, force: true });
  await mkdir(path.join(out, 'laser'), { recursive: true });
  await mkdir(path.join(out, 'impresion-3d'), { recursive: true });
  const files = new Map();
  const put = async (rel, data) => {
    await writeFile(path.join(out, rel), data);
    files.set(rel, typeof data === 'string' ? new TextEncoder().encode(data) : data);
  };

  // --- corte láser ----------------------------------------------------------------------------------------------------
  const byId = new Map(st.parts.map((q) => [q.id, q]));
  const laserFiles = [];
  for (const e of laser) {
    if (e.nest.unplaced.length) throw new Error(`no cupo en la hoja: ${e.nest.unplaced.map((u) => u.id).join(', ')}`);
    const pdfPages = [];
    for (const ns of e.nest.sheets) {
      const paths = [];
      const texts = [];
      for (const pl of ns.placements) {
        const part = byId.get(pl.id);
        paths.push({ id: `${pl.id}-${pl.instance}`, layer: 'cut', shape: pl.shape });
        // marcas: la misma rotación y el centro de la caja de la pieza colocada
        const rot = (q) => (pl.rotationDeg === 90 ? { x: -q.y, y: q.x } : q);
        const b0 = bbox(part.profile.outer.map(rot));
        const b1 = bbox(pl.shape.outer);
        const dx = (b1.minX + b1.maxX) / 2 - (b0.minX + b0.maxX) / 2;
        const dy = (b1.minY + b1.maxY) / 2 - (b0.minY + b0.maxY) / 2;
        for (const m of part.marks) paths.push({ layer: 'score', shape: m.map(rot).map((q) => ({ x: q.x + dx, y: q.y + dy })) });
        // rótulo: el primer punto cerca del centro donde una caja de texto queda toda sobre material
        const h = Math.max(2.5, Math.min(5, 0.18 * Math.min(pl.widthMm, pl.heightMm)));
        const w = 0.62 * h * pl.label.length;
        const inside = (q) => pointInPolygon(q, pl.shape.outer) && !(pl.shape.holes ?? []).some((hole) => pointInPolygon(q, hole));
        const fits = (c) => [-1, 0, 1].every((sx) => [-1, 1].every((sy) => inside({ x: c.x + (sx * w) / 2 + sx * 1.5, y: c.y + (sy * h) / 2 + sy * 1.5 })));
        const cx = (b1.minX + b1.maxX) / 2;
        const cy = (b1.minY + b1.maxY) / 2;
        let spot = null;
        for (let r = 0; r < Math.max(pl.widthMm, pl.heightMm) / 2 && !spot; r += 3)
          for (let k = 0; k < 16 && !spot; k++) {
            const c = { x: cx + r * Math.cos((k * Math.PI) / 8), y: cy + r * Math.sin((k * Math.PI) / 8) };
            if (fits(c)) spot = c;
          }
        if (spot) texts.push({ text: pl.label, x: spot.x, y: spot.y - h / 2, heightMm: h, anchor: 'middle', layer: 'engrave' });
      }
      const sheet = { name: `${SHEET_MATERIALS[e.material].label} · hoja ${ns.index} de ${e.nest.sheets.length}`, widthMm: ns.sheet.widthMm, heightMm: ns.sheet.heightMm, paths, texts, material: SHEET_MATERIALS[e.material].label, thicknessMm: e.material === 'mdf' ? st.mdfMm : e.material === 'acrilico-3' ? st.asm.base.acrT : 3 };
      const base = `laser/${LASER_PREFIX[e.material]}-hoja-${ns.index}`;
      await put(`${base}.svg`, laserSvg(sheet, { convention: 'generic' }));
      await put(`${base}.dxf`, laserDxf(sheet));
      laserFiles.push(`${base}.svg`, `${base}.dxf`);
      // PDF 1:1: rojo corte, azul marcas, negro rótulos (Y del PDF hacia abajo)
      const H = ns.sheet.heightMm;
      const ops = [];
      const ring = (r, color) => r.forEach((a, i) => {
        const b = r[(i + 1) % r.length];
        ops.push({ op: 'line', x1: a.x, y1: H - a.y, x2: b.x, y2: H - b.y, stroke: color, lineMm: 0.05 });
      });
      for (const pa of paths) {
        const prof = Array.isArray(pa.shape) ? { outer: pa.shape, holes: [] } : pa.shape;
        for (const r of [prof.outer, ...(prof.holes ?? [])]) ring(r, pa.layer === 'cut' ? [1, 0, 0] : [0, 0, 1]);
      }
      for (const t of texts) ops.push({ op: 'text', xMm: t.x - (0.3 * t.heightMm * t.text.length), yMm: H - t.y, text: t.text, sizePt: (t.heightMm / 0.3528) * 1.35, color: [0, 0, 0] });
      ops.push({ op: 'text', xMm: 6, yMm: 8, text: `Praxiboscopic · mesa de dos tambores · ${sheet.name} · escala 1:1, mm`, sizePt: 9, color: [0.4, 0.4, 0.4] });
      pdfPages.push({ widthMm: ns.sheet.widthMm, heightMm: H, ops });
    }
    const pdfName = `laser/${LASER_PREFIX[e.material]}.pdf`;
    await put(pdfName, buildPdf({ title: `Praxiboscopic · ${SHEET_MATERIALS[e.material].label}`, pages: pdfPages, images: [] }));
    laserFiles.push(pdfName);
  }

  // --- impresión 3D ----------------------------------------------------------------------------------------------------
  const stlFiles = [];
  const checks = [];
  for (const part of parts) {
    const m = part.build(mf);
    if (m.status() !== 'NoError') throw new Error(`${part.id}: sólido inválido (${m.status()})`);
    const mesh = m.getMesh();
    const positions = new Float32Array(mesh.numVert * 3);
    for (let i = 0; i < mesh.numVert; i++) for (let k = 0; k < 3; k++) positions[i * 3 + k] = mesh.vertProperties[i * mesh.numProp + k];
    const tm = { positions, indices: mesh.triVerts };
    const r = checkPrint(tm, { printer: 'bambu-a1', filament: 'petg', infill: 0.2 });
    if (!r.stats.watertight) throw new Error(`${part.id}: la malla no es estanca`);
    const rel = `impresion-3d/${part.file}`;
    await put(rel, stlBinary(tm, { header: `Praxiboscopic ${part.id} ${part.name}` }));
    stlFiles.push(rel);
    const notes = r.warnings.filter((w) => !/pared mínima/.test(w) || !/broche|I08|I09|I10/.test(part.id + part.role));
    checks.push(`${part.id} ${part.name}: estanca, ${Math.abs(r.stats.volumeCm3).toFixed(1)} cm³, ${r.grams.estimated} g y ${Math.round(r.timeMin.estimated)} min cada una en una Bambu A1${notes.length ? ` · ${notes.join(' · ')}` : ''}`);
    m.delete();
  }

  // --- README, docs y ZIP -------------------------------------------------------------------------------------------
  const date = new Date().toLocaleDateString('es-MX');
  const readme = fabricationReadme({ st, laser, parts, pe, files: { laser: laserFiles, stl: stlFiles, zip: ZIP_NAME }, date, checks });
  await put('README.md', readme);
  await writeFile(path.join(root, 'docs', 'FABRICACION-TAMBORES.md'), readme);
  const zip = zipStore([...files].map(([name, data]) => ({ name: `mesa-tambores/${name}`, data })));
  await writeFile(path.join(out, ZIP_NAME), zip);
  // manifiesto para la página de compras
  await writeFile(path.join(out, 'manifest.json'), JSON.stringify({ date, mdfMm: st.mdfMm, laser: laserFiles, stl: stlFiles, zip: ZIP_NAME, zipBytes: zip.length }, null, 2));
  console.log(`→ public/${FAB_DIR}: ${laserFiles.length} archivos de corte, ${stlFiles.length} STL, ${ZIP_NAME} (${(zip.length / 1e6).toFixed(1)} MB) · docs/FABRICACION-TAMBORES.md`);
  for (const e of laser) console.log(`  ${e.label}: ${e.pieces} piezas, ${e.cutM.toFixed(1)} m, ${e.sheets} hoja(s)`);
  console.log(`  impresión: ${pe.pieces} piezas, ${Math.round(pe.grams)} g, ${pe.hours.toFixed(1)} h`);
  console.log('  (los costos estimados están en private/costos: node private/costos/reporte.mjs)');
} finally {
  await server.close();
}
