import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';
import { registrarServiceWorker } from './pwa/registrarSw.ts';
import { aplicarConexionDelEnlace } from './services/supabaseConfig.ts';

// Un enlace compartido con ?conexion=… deja la app conectada sin escribir la URL ni la clave.
aplicarConexionDelEnlace();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

registrarServiceWorker();
