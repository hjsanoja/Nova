import { beforeEach, describe, expect, it } from 'vitest';
import type { NovaDB } from './db';
import { agruparTareas, cambiarEstadoTarea, eliminarTarea, guardarTarea, registrarVisita } from './crm';
import { procesarOutbox } from './outbox';
import { cliente, crearDbTemporal, crearRemotoFalso } from './testing/utiles';
import type { RemotoFalso } from './testing/utiles';
import type { LocalTarea } from './types';

let db: NovaDB;
let remoto: RemotoFalso;
const V = 'vend-1';

beforeEach(async () => {
  db = crearDbTemporal();
  remoto = crearRemotoFalso();
  await db.clientes.put(cliente('c1', { lat: 10.5, lon: -66.9 }));
  await db.medicos.put({ id: 'm1', nombre: 'Ana Pérez', especialidad: 'Cardiología', lat: 10.5, lon: -66.9, vendedor_id: V, activo: true });
});

describe('visitas con reporte', () => {
  it('visita a un médico con productos, muestras y próxima acción: crea la tarea y la envía después de la visita', async () => {
    const { visita, tarea } = await registrarVisita(db, {
      medico_id: 'm1', lat: 10.5003, lon: -66.9, resultado: 'realizada', objetivo: ' Presentar Losartán ',
      productos: ['p1', 'p1', 'p2'], muestras: [{ producto_id: 'p1', cantidad: 3 }, { producto_id: 'p2', cantidad: 0 }],
      proxima_accion: 'Llevar estudio clínico', proxima_fecha: '2026-10-08',
    }, V, new Date('2026-10-01T14:00:00Z'));
    expect(visita).toMatchObject({ cliente_id: null, medico_id: 'm1', objetivo: 'Presentar Losartán', productos: ['p1', 'p2'], muestras: [{ producto_id: 'p1', cantidad: 3 }], dentro_de_radio: true });
    expect(tarea).toMatchObject({ titulo: 'Llevar estudio clínico', vence_en: '2026-10-08', medico_id: 'm1', visita_id: visita.id, origen: 'visita' });
    const cola = await db.outbox.orderBy('seq').toArray();
    expect(cola.map((o) => [o.tipo, o.depende_de ?? null])).toEqual([['visita.registrar', null], ['tarea.guardar', visita.id]]);
    expect(cola[0].payload).toMatchObject({ medico_id: 'm1', cliente_id: null, muestras: [{ producto_id: 'p1', cantidad: 3 }] });

    await procesarOutbox(db, remoto);
    expect(remoto.llamadas.map((l) => l.tipo)).toEqual(['visita.registrar', 'tarea.guardar']);
    expect((await db.visitas.get(visita.id))?.sync_estado).toBe('sincronizado');
    expect((await db.tareas.get(tarea!.id))?.sync_estado).toBe('sincronizado');
  });

  it('sin fecha no hay tarea; y debe ser a una farmacia o a un médico', async () => {
    const { tarea } = await registrarVisita(db, { cliente_id: 'c1', resultado: 'sin_pedido', proxima_accion: 'Llamar' }, V);
    expect(tarea).toBeNull();
    await expect(registrarVisita(db, { cliente_id: 'c1', medico_id: 'm1' }, V)).rejects.toThrow(/farmacia o a un médico/);
    await expect(registrarVisita(db, {}, V)).rejects.toThrow(/farmacia o a un médico/);
  });
});

describe('tareas', () => {
  it('crear, marcar hecha y borrar: cada cambio va a la cola', async () => {
    const t = await guardarTarea(db, { vendedor_id: V, titulo: '  Cobrar factura ', vence_en: '2026-10-02', cliente_id: 'c1' }, new Date('2026-10-01T10:00:00Z'));
    expect(t).toMatchObject({ titulo: 'Cobrar factura', estado: 'pendiente', origen: 'manual', hecha_en: null });
    const hecha = await cambiarEstadoTarea(db, t, 'hecha', new Date('2026-10-02T15:00:00Z'));
    expect(hecha.hecha_en).toBe('2026-10-02T15:00:00.000Z');
    await eliminarTarea(db, hecha);
    expect(await db.tareas.get(t.id)).toBeUndefined();
    const cola = await db.outbox.toArray();
    expect(cola.map((o) => o.payload.estado)).toEqual(['pendiente', 'hecha', 'hecha']);
    expect(cola[2].payload.eliminar).toBe(true);
    await expect(guardarTarea(db, { vendedor_id: V, titulo: ' ', vence_en: '2026-10-02' })).rejects.toThrow(/qué hay que hacer/);
    await expect(guardarTarea(db, { vendedor_id: V, titulo: 'x', vence_en: '' })).rejects.toThrow(/fecha/);
  });

  it('agrupa en vencidas, hoy, próximas y hechas', () => {
    const t = (id: string, vence_en: string, estado: LocalTarea['estado'] = 'pendiente') => ({ id, vendedor_id: V, titulo: id, vence_en, estado, origen: 'manual', sync_estado: 'sincronizado' }) as LocalTarea;
    const g = agruparTareas([t('a', '2026-09-28'), t('b', '2026-10-01'), t('c', '2026-10-05'), t('d', '2026-09-30'), t('e', '2026-10-01', 'hecha'), t('f', '2026-10-01', 'cancelada')], new Date(2026, 9, 1, 9));
    expect({ v: g.vencidas.map((x) => x.id), h: g.hoy.map((x) => x.id), p: g.proximas.map((x) => x.id), x: g.hechas.map((x) => x.id) }).toEqual({ v: ['a', 'd'], h: ['b'], p: ['c'], x: ['e'] });
  });
});
