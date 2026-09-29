import { beforeEach, describe, expect, it } from 'vitest';
import type { NovaDB } from './db';
import { buscarClientes, buscarPorCodigo, buscarProductos, normalizar } from './busqueda';
import { calcularSugerido, factorDeFrecuencia, redondearAEmpaque } from './sugerido';
import { cliente, crearDbTemporal, producto } from './testing/utiles';

let db: NovaDB;
beforeEach(async () => {
  db = crearDbTemporal();
  await db.productos.bulkPut([
    producto('1', 'Losartán Potásico 50mg', { es_prioritario: true }),
    producto('2', 'Losartán + Hidroclorotiazida'),
    producto('3', 'Atorvastatina 20mg'),
    producto('4', 'Atamel Pediátrico', { activo: false }),
  ]);
  await db.clientes.bulkPut([cliente('c1', { nombre_comercial: 'Farmacia La Paz Chacao' }), cliente('c2', { nombre_comercial: 'Botica San José' })]);
});

describe('búsqueda local', () => {
  it('normaliza acentos y símbolos', () => {
    expect(normalizar('  Losartán-Potásico 50mg ')).toBe('losartan potasico 50mg');
  });
  it('busca por prefijo de cada palabra, sin acentos, priorizando lo prioritario', async () => {
    expect((await buscarProductos(db, 'losar')).map((p) => p.id)).toEqual(['1', '2']);
    expect((await buscarProductos(db, 'losartan hidro')).map((p) => p.id)).toEqual(['2']);
    expect((await buscarProductos(db, 'ATOR 20')).map((p) => p.id)).toEqual(['3']);
  });
  it('no devuelve productos inactivos ni consultas vacías', async () => {
    expect(await buscarProductos(db, 'atamel')).toEqual([]);
    expect(await buscarProductos(db, '   ')).toEqual([]);
  });
  it('un código de barras exacto resuelve directo', async () => {
    const p = (await db.productos.get('3'))!;
    expect((await buscarProductos(db, p.ean13!))[0].id).toBe('3');
    expect((await buscarPorCodigo(db, p.ean13!))!.id).toBe('3');
    expect((await buscarPorCodigo(db, 'sku-3'))!.id).toBe('3');
    expect(await buscarPorCodigo(db, '000')).toBeUndefined();
  });
  it('filtra clientes por nombre, RIF o código', async () => {
    expect((await buscarClientes(db, 'paz chacao')).map((c) => c.id)).toEqual(['c1']);
    expect((await buscarClientes(db, 'j c2')).map((c) => c.id)).toEqual(['c2']);
  });
});

describe('pedido sugerido', () => {
  it('el factor compara los días sin comprar contra la frecuencia y se acota', () => {
    expect(factorDeFrecuencia(14, 7)).toBe(1.5);
    expect(factorDeFrecuencia(7, 7)).toBe(1);
    expect(factorDeFrecuencia(1, 7)).toBe(0.5);
    expect(factorDeFrecuencia(null, 7)).toBe(1);
  });
  it('redondea hacia arriba al empaque mínimo', () => {
    expect(redondearAEmpaque(12, 10)).toBe(20);
    expect(redondearAEmpaque(0.4, 10)).toBe(10);
  });
  it('promedia las últimas 3 compras y las escala por la frecuencia de visita', async () => {
    const c = (await db.clientes.get('c1'))!; // frecuencia 7 días
    const hoy = new Date('2026-09-30T12:00:00Z');
    const dia = (n: number) => new Date(hoy.getTime() - n * 86_400_000).toISOString();
    const pedido = (id: string, dias: number, estado = 'facturado') => ({ id, created_at: dia(dias), cliente_id: 'c1', estado }) as never;
    await db.pedidos.bulkPut([pedido('p1', 21), pedido('p2', 14), pedido('p3', 7), pedido('viejo', 60), pedido('borr', 1, 'borrador')]);
    const d = (id: string, pedido_id: string, prod: string, u: number) => ({ id, pedido_id, linea: 1, producto_id: prod, unidades_solicitadas: u, unidades_confirmadas: u, unidades_pendientes: 0, motivo_ajuste: 'sin_quiebre' }) as never;
    await db.detalles.bulkPut([d('a', 'p1', '1', 20), d('b', 'p2', '1', 40), d('c', 'p3', '1', 30), d('e', 'p3', '3', 9), d('f', 'viejo', '1', 999)]);
    const s = await calcularSugerido(db, c, hoy);
    // Producto 1: promedio 30, último pedido hace 7 días con ciclo de 7 => factor 1 => 30 (empaque 10)
    expect(s.find((l) => l.producto.id === '1')).toMatchObject({ promedio: 30, unidades: 30, compras: 3 });
    // Producto 3 solo en 1 de 3 pedidos: promedio 3 => sube al empaque mínimo
    expect(s.find((l) => l.producto.id === '3')).toMatchObject({ promedio: 3, unidades: 10 });
  });
  it('sin historial no sugiere nada', async () => {
    expect(await calcularSugerido(db, (await db.clientes.get('c2'))!)).toEqual([]);
  });
});
