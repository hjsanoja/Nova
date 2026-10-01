import { describe, expect, it } from 'vitest';
import type { LocalCliente, LocalCompraMensual, LocalPedido } from '../offline/types';
import { describirRiesgo, evaluarRiesgo, historialLocal, nivelDeRiesgo } from './riesgo';

const HOY = new Date(2026, 9, 1, 12); // 1 oct 2026
const cliente = (id: string, extra: Partial<LocalCliente> = {}) => ({ id, nombre_comercial: id, estado_validacion: 'activo', ...extra }) as LocalCliente;
const pedido = (id: string, cliente_id: string, fecha: [number, number], estado: LocalPedido['estado'] = 'procesado_total') =>
  ({ id, cliente_id, estado, created_at: new Date(2026, fecha[0] - 1, fecha[1], 10).toISOString() }) as LocalPedido;

describe('farmacias en riesgo', () => {
  it('niveles según los ciclos sin comprar', () => {
    expect(nivelDeRiesgo(10, 15)).toBe('al_dia');
    expect(nivelDeRiesgo(23, 15)).toBe('atrasada');
    expect(nivelDeRiesgo(30, 15)).toBe('en_riesgo');
    expect(nivelDeRiesgo(46, 40)).toBe('en_riesgo'); // más de 45 días aunque compre cada 40
    expect(nivelDeRiesgo(91, 30)).toBe('perdida');
  });

  it('historial del equipo: última compra, mediana entre compras y unidades al mes', () => {
    const pedidos = [pedido('a', 'c1', [9, 1]), pedido('b', 'c1', [9, 8]), pedido('c', 'c1', [9, 15]), pedido('x', 'c1', [9, 20], 'borrador'), pedido('d', 'c2', [7, 1])];
    const compras = [{ cliente_id: 'c2', periodo: '2026-08-01', ultima_compra: '2026-08-02', unidades: 120 }] as LocalCompraMensual[];
    const h = historialLocal(pedidos, new Map([['a', 12], ['b', 12], ['c', 12], ['x', 500], ['d', 6]]), compras, HOY);
    expect(h.get('c1')).toEqual({ cliente_id: 'c1', ultima: '2026-09-15', ciclo_dias: 7, compras: 3, unidades_mes: 3 });
    expect(h.get('c2')).toMatchObject({ ultima: '2026-08-02', ciclo_dias: 32, compras: 2, unidades_mes: 10 });
  });

  it('evalúa con la frecuencia de la ficha si existe y ordena por urgencia', () => {
    const historial = new Map([
      ['c1', { cliente_id: 'c1', ultima: '2026-09-15', ciclo_dias: 7, compras: 3, unidades_mes: 3 }],
      ['c2', { cliente_id: 'c2', ultima: '2026-08-02', ciclo_dias: 32, compras: 2, unidades_mes: 10 }],
      ['c3', { cliente_id: 'c3', ultima: '2026-09-28', ciclo_dias: null, compras: 1, unidades_mes: 50 }],
      ['c4', { cliente_id: 'c4', ultima: '2026-05-01', ciclo_dias: 20, compras: 4, unidades_mes: 80 }],
    ]);
    const lista = evaluarRiesgo([cliente('c1', { frecuencia_dias: 30 }), cliente('c2'), cliente('c3'), cliente('c4'), cliente('c5'), cliente('c6', { estado_validacion: 'prospecto' as LocalCliente['estado_validacion'] })], historial, HOY);
    expect(lista.map((f) => [f.cliente.id, f.nivel, f.dias, f.ciclo])).toEqual([
      ['c2', 'en_riesgo', 60, 32],
      ['c4', 'perdida', 153, 20],
      ['c3', 'al_dia', 3, 30],
      ['c1', 'al_dia', 16, 30],
    ]);
    expect(describirRiesgo(lista[0])).toBe('60 días sin comprar · compra cada 32 días · 10 uds/mes');
  });
});
