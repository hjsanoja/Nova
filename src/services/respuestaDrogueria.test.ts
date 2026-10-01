import { describe, expect, it } from 'vitest';
import type { LocalDetalle, LocalMapCliente, LocalMapProducto, LocalPedido, LocalProducto } from '../offline/types';
import { buscarFilaEncabezado, cruzarRespuesta, leerRespuesta, motivoDeTexto, reconocerColumnas } from './respuestaDrogueria';
import type { EntradaCruce } from './respuestaDrogueria';
import { leerTextoTabla } from './leerHoja';

const pedido = (id: string, correlativo: string, cliente = 'c1', estado: LocalPedido['estado'] = 'enviado_teletransferencia'): LocalPedido =>
  ({ id, correlativo, cliente_id: cliente, drogueria_id: 'd1', estado, created_at: '2026-10-01T10:00:00Z' }) as LocalPedido;
const detalle = (id: string, pedidoId: string, producto: string, unidades: number, linea = 1): LocalDetalle =>
  ({ id, pedido_id: pedidoId, linea, producto_id: producto, unidades_solicitadas: unidades, unidades_confirmadas: null, unidades_pendientes: unidades, motivo_ajuste: 'sin_quiebre' }) as LocalDetalle;

const productos = [
  { id: 'p1', sku: '100234', ean13: '7591234567890', nombre_comercial: 'Losartán' },
  { id: 'p2', sku: '100567', ean13: '7599876543210', nombre_comercial: 'Omeprazol' },
  { id: 'p3', sku: '100999', ean13: null, nombre_comercial: 'Atorvastatina' },
] as LocalProducto[];
const mapProductos: LocalMapProducto[] = [
  { id: 'm1', drogueria_id: 'd1', producto_id: 'p1', codigo_drogueria: 'LOS-050' },
  { id: 'm2', drogueria_id: 'd1', producto_id: 'p2', codigo_drogueria: '000123' },
  { id: 'm3', drogueria_id: 'd2', producto_id: 'p3', codigo_drogueria: 'ATO-10' },
];
const mapClientes: LocalMapCliente[] = [
  { id: 'k1', drogueria_id: 'd1', cliente_id: 'c1', codigo_cuenta: 'C-88' },
  { id: 'k2', drogueria_id: 'd1', cliente_id: 'c2', codigo_cuenta: '00451' },
];

const p1045 = pedido('a', 'PED-1045');
const p1046 = pedido('b', 'PED-1046', 'c2');
const p1047 = pedido('c', 'PED-1047', 'c1', 'procesado_total');
const detalles = new Map([
  ['a', [detalle('a1', 'a', 'p1', 10, 1), detalle('a2', 'a', 'p2', 5, 2), detalle('a3', 'a', 'p3', 4, 3)]],
  ['b', [detalle('b1', 'b', 'p1', 6)]],
  ['c', [detalle('c1', 'c', 'p1', 1)]],
]);

const base = (csv: string, extra: Partial<EntradaCruce> = {}) => {
  const leida = leerRespuesta({ filas: leerTextoTabla(csv), tipo: 'csv' });
  expect(leida.problemas).toEqual([]);
  return cruzarRespuesta({ filas: leida.filas, drogueriaId: 'd1', abiertos: [p1045, p1046], todos: [p1045, p1046, p1047], detallesPorPedido: detalles, productos, mapProductos, mapClientes, ...extra });
};

describe('reconocer columnas', () => {
  it('adivina los títulos habituales de las droguerías', () => {
    expect(reconocerColumnas(['Nro. Pedido', 'Cód. Artículo', 'Descripción', 'Cant. Pedida', 'Cant. Facturada', 'Falla', 'Observación', 'Factura'])).toEqual({
      pedido: 0, producto: 1, pedidas: 3, confirmadas: 4, faltantes: 5, motivo: 6, factura: 7,
    });
    expect(reconocerColumnas(['CUENTA', 'CODIGO', 'CANTIDAD'])).toEqual({ cliente: 0, producto: 1, confirmadas: 2 });
    expect(reconocerColumnas(['EAN', 'Producto', 'Despachado'])).toEqual({ producto: 0, confirmadas: 2 });
  });

  it('salta las filas de título del reporte', () => {
    expect(buscarFilaEncabezado([['DROGUERÍA COBECA'], ['Reporte de despacho'], [], ['Pedido', 'Código', 'Despachado'], ['PED-1', 'A', '1']])).toBe(3);
  });

  it('usa los títulos guardados en el formato por encima de los adivinados', () => {
    const l = leerRespuesta({ filas: [['REF', 'ITEM', 'QTY'], ['PED-1045', 'LOS-050', '3']], tipo: 'csv' }, { columnas: { pedido: 'ref', producto: 'Item', confirmadas: 'QTY' } });
    expect(l.problemas).toEqual([]);
    expect(l.filas[0]).toMatchObject({ pedido: 'PED-1045', producto: 'LOS-050', confirmadas: 3 });
  });

  it('explica qué falta', () => {
    const l = leerRespuesta({ filas: [['Pedido', 'Descripción'], ['PED-1', 'x']], tipo: 'csv' });
    expect(l.problemas[0]).toMatch(/fila de títulos/);
  });

  it('traduce el motivo de la droguería', () => {
    expect(motivoDeTexto('SIN EXISTENCIA')).toBe('quiebre_stock_drogueria');
    expect(motivoDeTexto('Cliente excede crédito')).toBe('limite_credito');
    expect(motivoDeTexto('Producto descontinuado')).toBe('producto_descontinuado');
    expect(motivoDeTexto('')).toBe('quiebre_stock_drogueria');
    expect(motivoDeTexto('xyz')).toBe('otro');
  });
});

describe('cruzar la respuesta con los pedidos', () => {
  it('varios pedidos en un archivo: completo, parcial y lo que no viene queda en cero', () => {
    const r = base('Pedido;Codigo;Despachado;Motivo;Factura\nPED-1045;LOS-050;10;;F-77\nPED-1045;123;2;Sin existencia;F-77\n1046;7591234567890;6;;F-78\n');
    expect(r.sinUbicar).toEqual([]);
    expect(r.pedidos.map((p) => [p.pedido.correlativo, p.estado, p.factura])).toEqual([['PED-1045', 'procesado_parcial', 'F-77'], ['PED-1046', 'procesado_total', 'F-78']]);
    const a = r.pedidos[0];
    expect(a.confirmaciones).toEqual([
      { detalle_id: 'a1', unidades_confirmadas: 10, motivo: 'quiebre_stock_drogueria' },
      { detalle_id: 'a2', unidades_confirmadas: 2, motivo: 'quiebre_stock_drogueria' },
      { detalle_id: 'a3', unidades_confirmadas: 0, motivo: 'quiebre_stock_drogueria' },
    ]);
    expect(a.avisos.join(' ')).toMatch(/1 producto del pedido no viene en el archivo: quedan en cero/);
  });

  it('con "completas", lo que no viene se da por despachado', () => {
    const r = base('Pedido;Codigo;Despachado\nPED-1045;LOS-050;4\n', { ausentes: 'completas' });
    expect(r.pedidos[0].confirmaciones.map((c) => c.unidades_confirmadas)).toEqual([4, 5, 4]);
  });

  it('archivo con faltantes en vez de despachadas', () => {
    const r = base('Pedido;Codigo;Falla\nPED-1046;LOS-050;2\n');
    expect(r.pedidos[0].confirmaciones[0].unidades_confirmadas).toBe(4);
    expect(r.pedidos[0].estado).toBe('procesado_parcial');
  });

  it('sin número de pedido, ubica por la cuenta de la farmacia', () => {
    const r = base('Cuenta;Codigo;Cantidad\n451;LOS-050;6\n');
    expect(r.pedidos.map((p) => p.pedido.correlativo)).toEqual(['PED-1046']);
  });

  it('avisa lo que no pudo ubicar y no toca lo ya procesado', () => {
    const r = base('Pedido;Codigo;Despachado\nPED-9999;LOS-050;1\nPED-1045;NO-EXISTE;1\nPED-1046;100567;1\nPED-1047;LOS-050;1\nPED-1045;LOS-050;12\n');
    expect(r.sinUbicar.map((s) => s.motivo)).toEqual([
      'No hay un pedido "PED-9999" de esta droguería.',
      'El código "NO-EXISTE" no corresponde a ningún producto homologado (PED-1045).',
      'El producto no está en el pedido PED-1046.',
    ]);
    expect(r.yaProcesados).toEqual(['PED-1047']);
    expect(r.pedidos[0].lineas[0]).toMatchObject({ confirmadas: 10, excedente: true });
    expect(r.pedidos[0].avisos[0]).toMatch(/más unidades que lo pedido/);
  });

  it('desde un pedido abierto: todas las filas son de ese pedido salvo las que dicen otro', () => {
    const r = base('Codigo;Despachado\nLOS-050;3\n', { pedidoFijo: p1045 });
    expect(r.pedidos).toHaveLength(1);
    expect(r.pedidos[0].confirmaciones[0].unidades_confirmadas).toBe(3);
    const otro = base('Pedido;Codigo;Despachado\nPED-1046;LOS-050;3\n', { pedidoFijo: p1045 });
    expect(otro.pedidos).toHaveLength(0);
    expect(otro.sinUbicar[0].motivo).toBe('Es del pedido PED-1046.');
  });

  it('un producto repetido en el pedido se reparte en orden', () => {
    const det = new Map([['a', [detalle('x1', 'a', 'p1', 4, 1), detalle('x2', 'a', 'p1', 4, 2)]]]);
    const r = base('Pedido;Codigo;Despachado\nPED-1045;LOS-050;6\n', { detallesPorPedido: det });
    expect(r.pedidos[0].confirmaciones.map((c) => c.unidades_confirmadas)).toEqual([4, 2]);
  });
});
