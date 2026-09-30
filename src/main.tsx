import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';
import { registrarServiceWorker } from './pwa/registrarSw.ts';
import { aplicarConexionDelEnlace } from './services/supabaseConfig.ts';

// Un enlace compartido con ?conexion=… deja la app conectada sin escribir la URL ni la clave.
aplicarConexionDelEnlace();

// Instalada como app (Android/iPhone): sin zoom con dos dedos, la pantalla se ajusta al teléfono como una app nativa.
// En el navegador normal se conserva el zoom (accesibilidad).
const instalada = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
if (instalada) {
  document.querySelector('meta[name="viewport"]')?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
  document.documentElement.classList.add('app-instalada');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

registrarServiceWorker();
