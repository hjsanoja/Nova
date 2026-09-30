import type { NovaDB } from './db';
import { encolar } from './outbox';
import type { LocalPlantilla } from './types';

/** Guarda (o actualiza) una plantilla en el dispositivo y la encola para el servidor. Funciona sin conexión. */
export async function guardarPlantilla(
  db: NovaDB,
  p: { id?: string; vendedor_id: string; cliente_id: string; drogueria_id: string | null; nombre: string; lineas: LocalPlantilla['lineas'] }
): Promise<LocalPlantilla> {
  const lineas = p.lineas.filter((l) => l.unidades > 0).map((l) => ({ producto_id: l.producto_id, unidades: Math.floor(l.unidades) }));
  if (lineas.length === 0) throw new Error('La plantilla no tiene productos.');
  const fila: LocalPlantilla = {
    id: p.id ?? crypto.randomUUID(),
    vendedor_id: p.vendedor_id,
    cliente_id: p.cliente_id,
    drogueria_id: p.drogueria_id,
    nombre: p.nombre.trim() || 'Pedido habitual',
    lineas,
    updated_at: new Date().toISOString(),
    sync_estado: 'pendiente',
  };
  await db.transaction('rw', db.plantillas, db.outbox, async () => {
    await db.plantillas.put(fila);
    await encolar(db, {
      tipo: 'plantilla.guardar',
      entidad_id: fila.id,
      payload: { id: fila.id, cliente_id: fila.cliente_id, drogueria_id: fila.drogueria_id, nombre: fila.nombre, lineas: fila.lineas },
    });
  });
  return fila;
}

export async function eliminarPlantilla(db: NovaDB, p: LocalPlantilla): Promise<void> {
  await db.transaction('rw', db.plantillas, db.outbox, async () => {
    await db.plantillas.delete(p.id);
    await encolar(db, { tipo: 'plantilla.guardar', entidad_id: p.id, payload: { id: p.id, cliente_id: p.cliente_id, drogueria_id: p.drogueria_id, nombre: p.nombre, lineas: p.lineas, eliminar: true } });
  });
}
