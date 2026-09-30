import { beforeEach, describe, expect, it } from 'vitest';
import type { NovaDB } from './db';
import { revisarEpoca } from './epoca';
import { crearPedidoLocal } from './pedidos';
import { SESION, cliente, crearDbTemporal, crearRemotoFalso, producto } from './testing/utiles';
import type { LocalPedido } from './types';

let db: NovaDB;

beforeEach(async () => {
  db = crearDbTemporal();
  await db.productos.bulkPut([producto('1', 'Losartán')]);
  await db.clientes.bulkPut([cliente('c1')]);
  // Un pedido viejo de prueba que ya estaba en la nube.
  await db.pedidos.put({ id: 'viejo', correlativo: 'PED-1001', cliente_id: 'c1', estado: 'enviado_teletransferencia', sync_estado: 'sincronizado', created_at: '2026-09-01T00:00:00Z' } as LocalPedido);
  await db.detalles.put({ id: 'd-viejo', pedido_id: 'viejo', linea: 1, producto_id: '1', unidades_solicitadas: 5, unidades_confirmadas: null, unidades_pendientes: 5, motivo_ajuste: 'sin_quiebre' });
  await db.guardarMeta('cursor:fact_pedidos', '2026-09-01T00:00:00Z');
});

describe('datos reiniciados en la nube', () => {
  it('al cambiar la marca se descarta lo sincronizado y se conserva lo que aún no se envió', async () => {
    const nuevo = await crearPedidoLocal(db, { cliente_id: 'c1', drogueria_id: 'A', lineas: [{ producto_id: '1', unidades: 3 }], enviar: true }, SESION);
    const remoto = { ...crearRemotoFalso(), leerEpoca: async () => '1727700000000' };
    expect(await revisarEpoca(db, remoto)).toBe(true);
    expect((await db.pedidos.toArray()).map((p) => p.id)).toEqual([nuevo.id]);
    expect((await db.detalles.toArray()).every((d) => d.pedido_id === nuevo.id)).toBe(true);
    expect(await db.outbox.count()).toBe(1);
    expect(await db.leerMeta('cursor:fact_pedidos', null)).toBeNull(); // se vuelve a descargar desde cero
    // Misma marca: no se vuelve a limpiar.
    await db.productos.put(producto('2', 'Otro'));
    expect(await revisarEpoca(db, remoto)).toBe(false);
    expect(await db.productos.count()).toBe(1);
  });

  it('sin marca en el servidor no se toca nada', async () => {
    expect(await revisarEpoca(db, { ...crearRemotoFalso(), leerEpoca: async () => null })).toBe(false);
    expect(await db.pedidos.count()).toBe(1);
  });
});
