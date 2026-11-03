// Vite de Praxiboscopic (obra construida sobre @aminoacid/omega, ver docs/LIBRARY.md de OMEGA).
// - omegaLibs: sirve y emite los decodificadores Draco y Basis que usan los loaders de OMEGA (/omega-libs/).
// - resolve.dedupe: una sola copia de three y zod aunque OMEGA esté enlazado con file: (su node_modules tiene otra).
// - server.fs.allow: el servidor de desarrollo puede leer las fuentes de OMEGA aunque vivan fuera de esta carpeta.
// Los scripts de package.json pasan --configLoader runner porque este archivo importa un plugin escrito en
// TypeScript y Node no transpila .ts dentro de node_modules (instalación por tarball o git).
import { createRequire } from 'node:module';
import path from 'node:path';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import { omegaLibs } from '@aminoacid/omega/vite/omega-libs';

const omegaRoot = path.dirname(createRequire(import.meta.url).resolve('@aminoacid/omega/package.json'));

export default defineConfig({
  base: './',
  plugins: [omegaLibs()],
  resolve: { dedupe: ['three', 'zod'] },
  server: { port: 5174, open: false, fs: { allow: [searchForWorkspaceRoot(process.cwd()), omegaRoot] } },
  // dos páginas: el estudio y simulador (index.html) y la lista de compras (compras.html)
  build: { target: 'es2022', chunkSizeWarningLimit: 3000, rollupOptions: { input: { main: path.resolve(import.meta.dirname, 'index.html'), compras: path.resolve(import.meta.dirname, 'compras.html') } } },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
} as any);
