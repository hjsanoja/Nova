import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';
import type {Plugin} from 'vite';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

// Versión de NOVA: la primera entrada de src/novedades.json (se lee aquí sin importar código de la app).
const VERSION: string = JSON.parse(readFileSync(new URL('./src/novedades.json', import.meta.url), 'utf8'))[0].version;

/** Lista de todos los archivos con hash del build: el Service Worker los precachea para trabajar sin conexión. */
const manifiestoServiceWorker = (): Plugin => ({
  name: 'nova-sw-manifest',
  apply: 'build',
  generateBundle(_opciones, bundle) {
    const archivos = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
    this.emitFile({ type: 'asset', fileName: 'sw-manifest.json', source: JSON.stringify(archivos) });
  },
});

/**
 * Versión publicada: version.json (la app lo consulta para avisar que hay una versión nueva) y el nombre de la caché del
 * Service Worker (cada versión instala la suya y borra la anterior).
 */
const versionPublicada = (): Plugin => {
  let salida = 'dist';
  return {
    name: 'nova-version',
    apply: 'build',
    configResolved(config) {
      salida = join(config.root, config.build.outDir);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: VERSION }) });
    },
    closeBundle() {
      const ruta = join(salida, 'sw.js');
      writeFileSync(ruta, readFileSync(ruta, 'utf8').replace("'nova-__VERSION_APP__'", `'nova-${VERSION}'`));
    },
  };
};

export default defineConfig({
  // Rutas relativas: el build funciona igual en GitHub Pages (subruta) que en Cloud Run.
  base: './',
  plugins: [react(), tailwindcss(), manifiestoServiceWorker(), versionPublicada()],
  build: {
    target: 'es2022',
    // El escáner de códigos (html5-qrcode, ~370 kB) se descarga solo al abrir la cámara.
    chunkSizeWarningLimit: 400,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // React se cachea aparte: no cambia entre despliegues de la app.
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 20 },
            // Un solo chunk de iconos en lugar de decenas de archivos de ~200 bytes.
            { name: 'iconos', test: /node_modules[\\/]lucide-react/, priority: 10 },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/offline/testing/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
