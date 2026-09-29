import { describe, expect, it } from 'vitest';
import { calcularSugerido, productosComprados } from './sugerido';
import { cliente, crearDbTemporal, producto } from './testing/utiles';
import type { LocalCompraMensual } from './types';

const compra = (id: string, clienteId: string, productoId: string, periodo: string, unidades: number, ultima = `${periodo.slice(0, 7)}-15`): LocalCompraMensual => ({
  id, cliente_id: clienteId, producto_id: productoId, periodo, unidades, n_compras: 1, ultima_compra: ultima,
});

describe('pedido sugerido desde el historial de las droguerías', () => {
  it('sin pedidos en Nova usa el promedio de los últimos 3 meses (dividido entre los meses considerados)', async () => {
    const db = crearDbTemporal();
    const c = cliente('c1', { frecuencia_dias: 30 });
    await db.productos.bulkPut([producto('1', 'Losartán'), producto('2', 'Atorvastatina')]);
    await db.clientes.put(c);
    await db.comprasMensual.bulkPut([
      compra('a', 'c1', '1', '2026-08-01', 30), compra('b', 'c1', '1', '2026-07-01', 20), compra('c', 'c1', '1', '2026-06-01', 10),
      compra('d', 'c1', '1', '2026-01-01', 500), // fuera de los 3 últimos meses: no cuenta
      compra('e', 'c1', '2', '2026-08-01', 10),
    ]);
    const ahora = new Date('2026-09-14T00:00:00Z'); // 30 días después de la última compra (15-ago): factor 1
    const lineas = await calcularSugerido(db, c, ahora);
    expect(lineas.map((l) => [l.producto.id, l.unidades, l.compras])).toEqual([['1', 20, 3], ['2', 10, 1]]); // 60/3 = 20; 10/3 → 1 empaque
  });

  it('los pedidos hechos en Nova tienen prioridad sobre el historial', async () => {
    const db = crearDbTemporal();
    const c = cliente('c1');
    await db.productos.put(producto('1', 'Losartán'));
    await db.clientes.put(c);
    await db.comprasMensual.put(compra('a', 'c1', '1', '2026-08-01', 300));
    await db.pedidos.put({ id: 'p1', correlativo: 'PED-1', estado: 'procesado_total', cliente_id: 'c1', created_at: '2026-09-01T10:00:00Z' } as never);
    await db.detalles.put({ id: 'd1', pedido_id: 'p1', linea: 1, producto_id: '1', unidades_solicitadas: 10, unidades_confirmadas: 10, unidades_pendientes: 0, motivo_ajuste: 'sin_quiebre' });
    const lineas = await calcularSugerido(db, c, new Date('2026-09-08T00:00:00Z'));
    expect(lineas[0].promedio).toBe(10 / 1); // un pedido considerado; ignora los 300 del historial
  });

  it('productosComprados ofrece atajos de reposición desde el historial por volumen', async () => {
    const db = crearDbTemporal();
    await db.productos.bulkPut([producto('1', 'A'), producto('2', 'B'), producto('3', 'C', { activo: false })]);
    await db.comprasMensual.bulkPut([compra('a', 'c1', '1', '2026-08-01', 5), compra('b', 'c1', '2', '2026-08-01', 50), compra('c', 'c1', '3', '2026-08-01', 99)]);
    expect((await productosComprados(db, 'c1')).map((p) => p.id)).toEqual(['2', '1']); // por volumen; el inactivo no se ofrece
    expect(await productosComprados(db, 'otra')).toEqual([]);
  });
});
