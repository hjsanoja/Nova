import { useSyncExternalStore } from 'react';
import { VERSION, compararVersiones } from '../version';

/**
 * ¿Qué versión está publicada? La compilación deja version.json junto a la app; aquí se consulta (siempre en la red)
 * para avisar cuando la publicada es más nueva que la que corre en este equipo.
 */

export interface EstadoVersion {
  /** Versión publicada (null mientras no se sabe, sin red o en desarrollo). */
  publicada: string | null;
  /** La publicada es más nueva que la de este equipo. */
  hayNueva: boolean;
}

let estado: EstadoVersion = { publicada: null, hayNueva: false };
const oyentes = new Set<() => void>();

function fijar(publicada: string | null) {
  const hayNueva = !!publicada && compararVersiones(publicada, VERSION) > 0;
  if (publicada === estado.publicada && hayNueva === estado.hayNueva) return;
  estado = { publicada, hayNueva };
  oyentes.forEach((f) => f());
}

export async function revisarVersionPublicada(): Promise<EstadoVersion> {
  try {
    // El parámetro evita cualquier caché intermedia (incluido un Service Worker de una versión anterior).
    const r = await fetch(new URL(`version.json?t=${Date.now()}`, document.baseURI), { cache: 'no-store' });
    if (r.ok) {
      const { version } = (await r.json()) as { version?: unknown };
      if (typeof version === 'string' && /^\d+\.\d+$/.test(version)) fijar(version);
    }
  } catch {
    /* sin red: se vuelve a intentar más tarde */
  }
  return estado;
}

export function useVersionPublicada(): EstadoVersion {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => estado
  );
}

/** Revisa al abrir, cada 15 minutos y al volver a la app. Devuelve cómo dejar de revisar. */
export function vigilarVersionPublicada(cadaMs = 15 * 60_000): () => void {
  void revisarVersionPublicada();
  const t = setInterval(() => void revisarVersionPublicada(), cadaMs);
  const alVolver = () => document.visibilityState === 'visible' && void revisarVersionPublicada();
  document.addEventListener('visibilitychange', alVolver);
  return () => {
    clearInterval(t);
    document.removeEventListener('visibilitychange', alVolver);
  };
}

/** Pasa a la versión publicada: el Service Worker nuevo toma el control y la página se recarga con la app nueva. */
export async function actualizarApp(): Promise<void> {
  try {
    const registro = await navigator.serviceWorker?.getRegistration();
    await registro?.update();
    registro?.waiting?.postMessage('saltar-espera');
  } catch {
    /* sin Service Worker: basta con recargar */
  }
  window.location.reload();
}
