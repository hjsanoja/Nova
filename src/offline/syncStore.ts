import { useSyncExternalStore } from 'react';

/** Estado observable de la sincronización (lo lee el indicador del encabezado). */
export interface EstadoSync {
  /** navigator.onLine */
  online: boolean;
  /** Hay un envío o una descarga en curso. */
  sincronizando: boolean;
  /** Hay un servidor configurado; sin él la app funciona solo en local. */
  remotoConfigurado: boolean;
  /** La sesión venció: los cambios esperan a que el usuario inicie sesión. */
  necesitaLogin: boolean;
  ultimaSync: number | null;
  ultimoError: string | null;
  /** Mutaciones locales esperando envío. */
  pendientes: number;
  /** Mutaciones rechazadas o en conflicto: requieren atención del usuario. */
  errores: number;
}

let estado: EstadoSync = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  sincronizando: false,
  remotoConfigurado: false,
  necesitaLogin: false,
  ultimaSync: null,
  ultimoError: null,
  pendientes: 0,
  errores: 0,
};
const oyentes = new Set<() => void>();

export const obtenerEstadoSync = (): EstadoSync => estado;

export function actualizarEstadoSync(parche: Partial<EstadoSync>): void {
  estado = { ...estado, ...parche };
  oyentes.forEach((o) => o());
}

export function suscribirEstadoSync(fn: () => void): () => void {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

export function useEstadoSync(): EstadoSync {
  return useSyncExternalStore(suscribirEstadoSync, obtenerEstadoSync, obtenerEstadoSync);
}
