import type { NovaDB } from './db';
import type { SyncRemote } from './remoto';

/**
 * "Datos reiniciados" en la nube. Cuando el administrador borra datos (Configuración → Base de datos), el servidor guarda
 * una marca nueva (config_sistema.epoca_datos). Cada dispositivo la compara al sincronizar: si cambió, descarta su copia de
 * lo que ya estaba en la nube y la vuelve a descargar. Lo que aún no se envió (cola y filas pendientes) se conserva.
 */
const CLAVE = 'epoca_datos';

export async function revisarEpoca(db: NovaDB, remoto: SyncRemote): Promise<boolean> {
  if (!remoto.leerEpoca) return false;
  const servidor = await remoto.leerEpoca();
  if (!servidor) return false;
  const local = await db.leerMeta<string | null>(CLAVE, null);
  if (local === servidor) return false;
  await limpiarLoSincronizado(db);
  await db.guardarMeta(CLAVE, servidor);
  return true;
}

/** Vacía la copia local de lo que vino de la nube; conserva la cola de envío y lo que depende de ella. */
export async function limpiarLoSincronizado(db: NovaDB): Promise<void> {
  const tablas = [db.productos, db.clientes, db.droguerias, db.mapProductos, db.mapClientes, db.comprasMensual, db.reglas, db.pedidos, db.detalles, db.visitas, db.notificaciones, db.plantillas, db.comunicados, db.metas, db.medicos, db.tareas, db.meta, db.outbox];
  await db.transaction('rw', tablas, async () => {
    const cola = await db.outbox.toArray();
    const enCola = new Set(cola.flatMap((o) => [o.entidad_id, o.depende_de ?? '']).filter(Boolean));
    const pendiente = (r: { id: string; sync_estado?: string }) => enCola.has(r.id) || (r.sync_estado != null && r.sync_estado !== 'sincronizado');

    // Tablas que solo vienen de la nube.
    await Promise.all([db.productos, db.droguerias, db.mapProductos, db.comprasMensual, db.reglas, db.notificaciones, db.comunicados, db.metas, db.medicos].map((t) => t.clear()));
    // Tablas donde el dispositivo también crea filas: se conservan las que aún no llegaron a la nube.
    await db.mapClientes.filter((r) => !enCola.has(r.id)).delete();
    await db.clientes.filter((r) => !pendiente(r)).delete();
    await db.visitas.filter((r) => !pendiente(r)).delete();
    await db.plantillas.filter((r) => !pendiente(r)).delete();
    await db.tareas.filter((r) => !pendiente(r)).delete();
    const quedan = new Set((await db.pedidos.filter((r) => pendiente(r)).primaryKeys()) as string[]);
    await db.pedidos.filter((r) => !quedan.has(r.id)).delete();
    await db.detalles.filter((d) => !quedan.has(d.pedido_id)).delete();
    // Todo se vuelve a descargar desde cero.
    await db.meta.filter((m) => m.clave.startsWith('cursor:')).delete();
  });
}
