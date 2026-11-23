// Vite de Praxiboscopic (obra construida sobre @aminoacid/omega, ver docs/LIBRARY.md de OMEGA).
// - omegaLibs: sirve y emite los decodificadores Draco y Basis que usan los loaders de OMEGA (/omega-libs/).
// - resolve.dedupe: una sola copia de three y zod aunque OMEGA esté enlazado con file: (su node_modules tiene otra).
// - server.fs.allow: el servidor de desarrollo puede leer las fuentes de OMEGA aunque vivan fuera de esta carpeta.
// Los scripts de package.json pasan --configLoader runner porque este archivo importa un plugin escrito en
// TypeScript y Node no transpila .ts dentro de node_modules (instalación por tarball o git).
import { execSync } from 'node:child_process';
import { cpSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import { omegaLibs } from '@aminoacid/omega/vite/omega-libs';

const omegaRoot = path.dirname(createRequire(import.meta.url).resolve('@aminoacid/omega/package.json'));

// la bitácora (ADR-0016) vive en bitacora/ del repositorio: el sitio lee su copia viva de la rama desde la que se
// compiló y, si no la alcanza, la que se copia aquí junto al sitio
const root = import.meta.dirname;
const branch = (() => {
  try {
    const b = execSync('git rev-parse --abbrev-ref HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return b && b !== 'HEAD' ? b : 'master';
  } catch {
    return 'master';
  }
})();
const bitacora = {
  name: 'bitacora',
  apply: 'build' as const,
  closeBundle() {
    const from = path.resolve(root, 'bitacora');
    if (existsSync(from)) cpSync(from, path.resolve(root, 'dist', 'bitacora'), { recursive: true });
  },
};

export default defineConfig({
  base: './',
  define: { __BITACORA_REF__: JSON.stringify(branch) },
  plugins: [omegaLibs(), bitacora],
  resolve: { dedupe: ['three', 'zod'] },
  server: { port: 5174, open: false, fs: { allow: [searchForWorkspaceRoot(process.cwd()), omegaRoot] } },
  // tres páginas: el estudio y simulador (index.html), la lista de compras (compras.html) y el visor de conexiones
  // de la electrónica (electronica.html, ADR-0015)
  build: { target: 'es2022', chunkSizeWarningLimit: 3000, rollupOptions: { input: { main: path.resolve(import.meta.dirname, 'index.html'), compras: path.resolve(import.meta.dirname, 'compras.html'), electronica: path.resolve(import.meta.dirname, 'electronica.html') } } },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
} as any);
