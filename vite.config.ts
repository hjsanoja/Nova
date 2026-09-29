import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig({
  // Rutas relativas: el build funciona igual en GitHub Pages (subruta) que en Cloud Run.
  base: './',
  plugins: [react(), tailwindcss()],
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
  server: {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
