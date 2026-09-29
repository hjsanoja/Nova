import { liveQuery } from 'dexie';
import { obtenerDb } from './db';
import { arrancarMotor, detenerMotor } from './motor';
import { sembrarDatosDemo } from './seedDemo';
import { actualizarEstadoSync } from './syncStore';
import type { SyncRemote } from './remoto';

/**
 * Punto de entrada del modo offline-first. Se importa de forma dinámica después del primer render
 * (Dexie y el motor no forman parte del bundle inicial).
 *
 * Con Supabase configurado descarga y envía datos; sin él, siembra datos de demostración y trabaja en local.
 */
export async function iniciarOffline(crearRemoto: (() => Promise<SyncRemote | null>) | null): Promise<() => void> {
  const db = obtenerDb();
  const remoto = crearRemoto ? await crearRemoto() : null;
  if (!remoto) await sembrarDatosDemo(db);

  // Contadores en vivo para el indicador del encabezado (sin polling).
  const sub = liveQuery(() => db.outbox.toArray()).subscribe({
    next: (items) =>
      actualizarEstadoSync({
        pendientes: items.filter((i) => i.estado === 'pendiente').length,
        errores: items.filter((i) => i.estado !== 'pendiente').length,
      }),
    error: () => undefined,
  });

  arrancarMotor(db, remoto);
  return () => {
    sub.unsubscribe();
    detenerMotor();
  };
}
