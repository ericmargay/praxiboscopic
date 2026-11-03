#!/usr/bin/env node
// Genera docs/COMPRAS.md (y fabricacion/BOM.csv) con la lista de materiales de la demostración, cargando las fuentes
// TypeScript con Vite SSR como hacen las herramientas de OMEGA. Uso: node scripts/bom.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, configLoader: 'runner', configFile: false, logLevel: 'error', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] }, resolve: { dedupe: ['three', 'zod'] } });
try {
  const { demoProject, deriveProject } = await server.ssrLoadModule('/src/core/project.ts');
  const { buildBom } = await server.ssrLoadModule('/src/fabricate/bom.ts');
  const p = demoProject();
  const bom = buildBom(p, deriveProject(p), new Date().toLocaleDateString('es-MX'));
  const header = `<!-- Generado por scripts/bom.mjs a partir de demoProject(); vuelve a generarlo tras cambiar el proyecto. -->\n\n`;
  await mkdir(path.join(root, 'fabricacion'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'COMPRAS.md'), header + bom.markdown);
  await writeFile(path.join(root, 'fabricacion', 'BOM.csv'), bom.csv);
  console.log(`→ docs/COMPRAS.md (${bom.lines.length} renglones) · fabricacion/BOM.csv`);
} finally {
  await server.close();
}
