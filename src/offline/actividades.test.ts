import { beforeEach, describe, expect, it } from 'vitest';
import type { NovaDB } from './db';
import { anularActividad, guardarActividad } from './actividades';
import { procesarOutbox } from './outbox';
import { crearDbTemporal, crearRemotoFalso } from './testing/utiles';
import type { RemotoFalso } from './testing/utiles';

let db: NovaDB;
let remoto: RemotoFalso;
const V = 'vend-1';

beforeEach(async () => {
  db = crearDbTemporal();
  remoto = crearRemotoFalso();
  await db.motivos.bulkPut([
    { id: 'vac', nombre: 'Vacaciones', descuenta: true, requiere_aprobacion: true, activo: true, orden: 1 },
    { id: 'dp', nombre: 'Día producto', descuenta: true, requiere_aprobacion: false, activo: true, orden: 2 },
  ]);
});

describe('actividades sin conexión', () => {
  it('se guarda en el dispositivo, va a la cola y toma el estado que decide el servidor', async () => {
    const a = await guardarActividad(db, { vendedor_id: V, motivo_id: 'dp', desde: '2027-01-20', jornada: 'media', notas: '  Lanzamiento ' });
    expect(a).toMatchObject({ hasta: '2027-01-20', notas: 'Lanzamiento', estado: 'pendiente', sync_estado: 'pendiente' });
    expect((await db.outbox.toArray()).map((o) => o.tipo)).toEqual(['actividad.guardar']);
    remoto.comportamiento = (_t, p) => ({ id: String(p.id), estado: 'aprobada', comentario: 'No requiere aprobación' });
    await procesarOutbox(db, remoto);
    expect(await db.actividades.get(a.id)).toMatchObject({ estado: 'aprobada', comentario: 'No requiere aprobación', sync_estado: 'sincronizado' });
  });

  it('no deja cruzarla con otra ni cambiar una ya decidida; anular va a la cola', async () => {
    const a = await guardarActividad(db, { vendedor_id: V, motivo_id: 'vac', desde: '2027-01-11', hasta: '2027-01-15' });
    await expect(guardarActividad(db, { vendedor_id: V, motivo_id: 'vac', desde: '2027-01-15' })).rejects.toThrow('Ya reportaste Vacaciones del 11/01 al 15/01.');
    await anularActividad(db, a);
    expect((await db.actividades.get(a.id))?.estado).toBe('anulada');
    expect((await db.outbox.toArray()).map((o) => o.payload.anular ?? false)).toEqual([false, true]);
    // Anulada ya no estorba.
    await guardarActividad(db, { vendedor_id: V, motivo_id: 'vac', desde: '2027-01-15' });
    await db.actividades.update(a.id, { estado: 'aprobada' });
    await expect(guardarActividad(db, { id: a.id, vendedor_id: V, motivo_id: 'vac', desde: '2027-01-11' })).rejects.toThrow(/decidida/);
  });
});
