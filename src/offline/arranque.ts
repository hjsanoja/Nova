import { liveQuery } from 'dexie';
import { obtenerDb } from './db';
import { arrancarMotor, detenerMotor } from './motor';
import { prepararDispositivoPara } from './aislamiento';
import { sembrarDatosDemo } from './seedDemo';
import { actualizarEstadoSync } from './syncStore';
import type { SyncRemote } from './remoto';

/**
 * Punto de entrada del modo offline-first. Se importa de forma dinámica después del primer render
 * (Dexie y el motor no forman parte del bundle inicial).
 *
 * Con Supabase configurado descarga y envía datos; sin él, siembra datos de demostración y trabaja en local.
 */
export async function iniciarOffline(crearRemoto: (() => Promise<SyncRemote | null>) | null, usuarioId = 'anonimo'): Promise<() => void> {
  const db = obtenerDb();
  const remoto = crearRemoto ? await crearRemoto() : null;
  // Otra persona en el mismo dispositivo: se vacía lo local para que no vea el fichero de la anterior.
  await prepararDispositivoPara(db, usuarioId);
  if (!remoto) await sembrarDatosDemo(db);
  // Cada sesión refresca por completo la lista de farmacias, los comunicados y las metas: si le quitaron una farmacia del
  // fichero o un comunicado ya no va dirigido a esta persona, deja de aparecer.
  else await db.meta.bulkDelete(['cursor:dim_clientes', 'cursor:comunicados', 'cursor:metas']);

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
