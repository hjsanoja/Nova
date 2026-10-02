// Otras actividades y días libres sin conexión: se guardan en el dispositivo con su mutación en la cola y el servidor
// las aplica de forma idempotente (sync_guardar_actividad). El servidor decide el estado final (p. ej. aprobada sola
// cuando el motivo no requiere aprobación).
import type { NovaDB } from './db';
import { encolar } from './outbox';
import type { LocalActividad } from './types';
import { problemasActividad } from '../actividades/logica';

export interface EntradaActividad {
  id?: string;
  vendedor_id: string;
  motivo_id: string;
  desde: string;
  hasta?: string | null;
  jornada?: LocalActividad['jornada'];
  notas?: string | null;
}

const payload = (a: LocalActividad, anular = false) => ({
  id: a.id,
  vendedor_id: a.vendedor_id,
  motivo_id: a.motivo_id,
  desde: a.desde,
  hasta: a.hasta,
  jornada: a.jornada,
  notas: a.notas ?? null,
  ...(anular ? { anular: true } : {}),
});

/** Reporta (o corrige, mientras está pendiente) una actividad. Lanza un Error con el motivo si algo no cuadra. */
export async function guardarActividad(db: NovaDB, e: EntradaActividad, ahora = new Date()): Promise<LocalActividad> {
  const previa = e.id ? await db.actividades.get(e.id) : undefined;
  if (previa && previa.estado !== 'pendiente') throw new Error('Ya fue decidida: no se puede cambiar.');
  const fila: LocalActividad = {
    id: e.id ?? crypto.randomUUID(),
    vendedor_id: e.vendedor_id,
    motivo_id: e.motivo_id,
    desde: e.desde,
    hasta: e.jornada === 'media' ? e.desde : e.hasta || e.desde,
    jornada: e.jornada ?? 'completa',
    notas: (e.notas ?? '').trim() || null,
    estado: 'pendiente',
    created_at: previa?.created_at ?? ahora.toISOString(),
    updated_at: ahora.toISOString(),
    sync_estado: 'pendiente',
  };
  const otras = await db.actividades.where('vendedor_id').equals(e.vendedor_id).toArray();
  const problemas = problemasActividad(fila, otras, await db.motivos.toArray());
  if (problemas.length) throw new Error(problemas[0]);
  await db.transaction('rw', [db.actividades, db.outbox], async () => {
    await db.actividades.put(fila);
    await encolar(db, { tipo: 'actividad.guardar', entidad_id: fila.id, payload: payload(fila) });
  });
  return fila;
}

/** Anula una actividad (el representante, solo si está pendiente; la gerencia, también las ya decididas). */
export async function anularActividad(db: NovaDB, a: LocalActividad): Promise<void> {
  await db.transaction('rw', [db.actividades, db.outbox], async () => {
    await db.actividades.update(a.id, { estado: 'anulada', sync_estado: 'pendiente' });
    await encolar(db, { tipo: 'actividad.guardar', entidad_id: a.id, payload: payload(a, true) });
  });
}
