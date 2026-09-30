import type { NovaDB } from './db';

/**
 * Aislamiento entre usuarios de un mismo dispositivo: el fichero (farmacias asignadas) de un vendedor no debe quedar visible
 * para otro que inicie sesión después. Si cambia la persona, se vacía la base local (catálogo, clientes, pedidos, cola y cursores)
 * y se vuelve a descargar solo lo que le corresponde a la nueva sesión.
 */
export async function limpiarDatosLocales(db: NovaDB): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}

/** Devuelve true si tuvo que vaciar la base porque cambió el usuario. */
export async function prepararDispositivoPara(db: NovaDB, usuarioId: string): Promise<boolean> {
  const anterior = await db.leerMeta<string | null>('usuario_id', null);
  let limpiado = false;
  if (anterior && anterior !== usuarioId) {
    await limpiarDatosLocales(db);
    limpiado = true;
  }
  await db.guardarMeta('usuario_id', usuarioId);
  return limpiado;
}
