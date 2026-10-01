import { describe, expect, it } from 'vitest';
import { actividadDeClientes, aCsv, contarPorGrupo, cumplimientoPorDrogueria, filtrarPedidos, perteneceAGrupo, unidadesDePedido } from './logica';
import { cliente, drogueria } from '../offline/testing/utiles';
import type { EstadoPedido, LocalDetalle, LocalPedido } from '../offline/types';

const ped = (id: string, estado: EstadoPedido, extra: Partial<LocalPedido> = {}): LocalPedido =>
  ({ id, correlativo: `PED-${id}`, estado, cliente_id: 'c1', drogueria_id: 'd1', vendedor_id: 'v1', created_at: '2026-09-01T10:00:00Z', ...extra }) as LocalPedido;
const det = (pedido: string, sol: number, conf: number | null, motivo: LocalDetalle['motivo_ajuste'] = 'sin_quiebre'): LocalDetalle => ({
  id: `${pedido}-${sol}-${conf}`, pedido_id: pedido, linea: 1, producto_id: 'p', unidades_solicitadas: sol, unidades_confirmadas: conf,
  unidades_pendientes: Math.max(sol - (conf ?? 0), 0), motivo_ajuste: motivo,
});

describe('pedidos: grupos, filtros y totales', () => {
  it('cada estado pertenece a un solo grupo de la barra de filtros', () => {
    const estados: EstadoPedido[] = ['borrador', 'enviado_teletransferencia', 'en_revision', 'en_proceso', 'procesado_parcial', 'procesado_total', 'facturado', 'rechazado', 'cancelado'];
    for (const e of estados) expect((['por_procesar', 'revision', 'parcial', 'completo', 'otros'] as const).filter((g) => perteneceAGrupo(e, g))).toHaveLength(1);
    expect(contarPorGrupo(estados.map((e, i) => ped(String(i), e)))).toEqual({ todos: 9, por_procesar: 2, revision: 1, parcial: 1, completo: 2, otros: 3 });
  });

  it('filtra por texto (correlativo o farmacia), vendedor y fecha, más recientes primero', () => {
    const lista = [ped('1', 'procesado_total'), ped('2', 'en_revision', { vendedor_id: 'v2', created_at: '2026-09-10T10:00:00Z' }), ped('3', 'procesado_total', { created_at: '2026-08-01T10:00:00Z' })];
    const nombre = (id: string) => (id === 'c1' ? 'Farmacia La Paz' : '');
    expect(filtrarPedidos(lista, { grupo: 'todos', texto: 'paz' }, nombre).map((p) => p.id)).toEqual(['2', '1', '3']);
    expect(filtrarPedidos(lista, { grupo: 'completo', texto: '', desde: new Date('2026-08-15').getTime() }, nombre).map((p) => p.id)).toEqual(['1']);
    expect(filtrarPedidos(lista, { grupo: 'todos', texto: '', vendedorId: 'v2' }, nombre).map((p) => p.id)).toEqual(['2']);
    expect(filtrarPedidos(lista, { grupo: 'todos', texto: 'ped-3' }, nombre).map((p) => p.id)).toEqual(['3']);
  });

  it('unidades: confirmadas es null hasta que la mesa confirma algo', () => {
    expect(unidadesDePedido([det('a', 10, null), det('a', 5, null)])).toEqual({ solicitadas: 15, confirmadas: null, pendientes: 15 });
    expect(unidadesDePedido([det('a', 10, 10), det('a', 5, 3)])).toEqual({ solicitadas: 15, confirmadas: 13, pendientes: 2 });
  });
});

describe('fichero: actividad de los clientes', () => {
  const ahora = new Date('2026-09-30T00:00:00Z');
  it('usa la actividad más reciente (compra reportada o pedido) contra la frecuencia de visita', () => {
    const cs = [cliente('a', { frecuencia_dias: 7 }), cliente('b', { frecuencia_dias: 30 }), cliente('c', { frecuencia_dias: 7 }), cliente('d', { frecuencia_dias: 7, estado_validacion: 'prospecto_pendiente' }), cliente('e', { frecuencia_dias: null })];
    const compra = new Map([['a', '2026-09-01'], ['b', '2026-09-10'], ['d', '2026-01-01'], ['e', '2026-01-01']]);
    const pedido = new Map([['a', '2026-09-27'], ['c', '2026-09-05']]);
    const act = actividadDeClientes(cs, compra, pedido, ahora);
    expect(act.find((x) => x.cliente.id === 'a')!.dias).toBe(3); // el pedido de Nova es más reciente que la compra
    expect(act.find((x) => x.cliente.id === 'c')!.atraso).toBe(18); // 25 días sin comprar con frecuencia de 7
  });
});

describe('reportes', () => {
  it('cumplimiento: fill-rate por droguería solo con pedidos ya procesados, y conteo de quiebres', () => {
    const pedidos = [ped('1', 'procesado_parcial'), ped('2', 'procesado_total'), ped('3', 'en_revision'), ped('4', 'procesado_total', { drogueria_id: 'd2' })];
    const detalles = [det('1', 10, 6, 'quiebre_stock_drogueria'), det('2', 10, 10), det('3', 100, null), det('4', 4, 4)];
    const r = cumplimientoPorDrogueria(pedidos, detalles, [drogueria('d1'), drogueria('d2')]);
    expect(r.map((f) => [f.drogueriaId, f.pedidos, f.solicitadas, f.confirmadas, f.fillRate, f.quiebres])).toEqual([['d1', 2, 20, 16, 80, 1], ['d2', 1, 4, 4, 100, 0]]);
  });

  it('csv: BOM, separador ;, comillas escapadas y sin fórmulas de Excel', () => {
    const csv = aCsv(['A', 'B'], [['x "y"', 3], ['=CMD()', null]]);
    expect(csv).toBe('﻿"A";"B"\r\n"x ""y""";3\r\n"\'=CMD()";\r\n');
  });
});
