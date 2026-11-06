#!/usr/bin/env node
// Genera docs/COMPRAS.md (y fabricacion/BOM.csv) con la lista de materiales de la demostración, cargando las fuentes
// TypeScript con Vite SSR como hacen las herramientas de OMEGA. Uso: node scripts/bom.mjs
// Con --tambores genera la de la mesa de dos tambores (ADR-0011): docs/COMPRAS-TAMBORES.md y fabricacion/BOM-tambores.csv
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reels = process.argv.includes('--tambores');
const server = await createServer({ root, configLoader: 'runner', configFile: false, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] }, resolve: { dedupe: ['three', 'zod'] } });
try {
  const { demoProject, deriveProject } = await server.ssrLoadModule('/src/core/project.ts');
  const { reelsDemoProject } = await server.ssrLoadModule('/src/core/video.ts');
  const { buildBom } = await server.ssrLoadModule('/src/fabricate/bom.ts');
  const p = reels ? reelsDemoProject() : demoProject();
  const bom = buildBom(p, deriveProject(p), new Date().toLocaleDateString('es-MX'));
  const source = reels ? 'reelsDemoProject() (dos tambores, ADR-0011) con `node scripts/bom.mjs --tambores`' : 'demoProject()';
  const header = `<!-- Generado por scripts/bom.mjs a partir de ${source}; vuelve a generarlo tras cambiar el proyecto. -->\n\n`;
  const md = reels ? 'COMPRAS-TAMBORES.md' : 'COMPRAS.md';
  const csv = reels ? 'BOM-tambores.csv' : 'BOM.csv';
  await mkdir(path.join(root, 'fabricacion'), { recursive: true });
  await writeFile(path.join(root, 'docs', md), header + bom.markdown);
  await writeFile(path.join(root, 'fabricacion', csv), bom.csv);
  console.log(`→ docs/${md} (${bom.lines.length} renglones) · fabricacion/${csv}`);
} finally {
  await server.close();
}
