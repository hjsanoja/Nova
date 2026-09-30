import { describe, expect, it } from 'vitest';
import { rankingMes, resumenMeses, serieDiaria, serieMensual, topProductosMes, unidadesPorPedido, variacion } from './indicadores';
import type { LocalDetalle, LocalPedido } from '../offline/types';

const HOY = new Date(2026, 8, 30, 15, 0); // 30 sep 2026, hora local
const ped = (id: string, fecha: Date, extra: Partial<LocalPedido> = {}) => ({ id, created_at: fecha.toISOString(), estado: 'enviado_teletransferencia', cliente_id: 'c1', vendedor_id: 'v1', drogueria_id: 'd1', ...extra }) as LocalPedido;
const det = (pedido_id: string, producto_id: string, u: number) => ({ id: `${pedido_id}${producto_id}`, pedido_id, producto_id, unidades_solicitadas: u }) as LocalDetalle;

const PEDIDOS = [
  ped('a', new Date(2026, 8, 30, 9)),
  ped('b', new Date(2026, 8, 29, 10), { cliente_id: 'c2', vendedor_id: 'v2' }),
  ped('c', new Date(2026, 8, 2, 10), { drogueria_id: 'd2' }),
  ped('d', new Date(2026, 7, 15, 10)),
  ped('borr', new Date(2026, 8, 30, 10), { estado: 'borrador' }),
];
const DETALLES = [det('a', 'p1', 10), det('a', 'p2', 5), det('b', 'p1', 20), det('c', 'p3', 1), det('d', 'p1', 100), det('borr', 'p9', 999)];
const U = unidadesPorPedido(DETALLES);

describe('indicadores del resumen', () => {
  it('serie diaria con días vacíos en cero y sin borradores', () => {
    const s = serieDiaria(PEDIDOS, U, 3, HOY);
    expect(s.map((p) => [p.fecha, p.pedidos, p.unidades, p.farmacias])).toEqual([['2026-09-28', 0, 0, 0], ['2026-09-29', 1, 20, 1], ['2026-09-30', 1, 15, 1]]);
  });

  it('serie mensual con farmacias distintas', () => {
    expect(serieMensual(PEDIDOS, U, 3, HOY)).toEqual([
      { mes: '2026-07', pedidos: 0, unidades: 0, farmacias: 0 },
      { mes: '2026-08', pedidos: 1, unidades: 100, farmacias: 1 },
      { mes: '2026-09', pedidos: 3, unidades: 36, farmacias: 2 },
    ]);
  });

  it('totales de hoy, del mes y del mes anterior', () => {
    const r = resumenMeses(PEDIDOS, U, HOY);
    expect(r.hoy).toEqual({ pedidos: 1, unidades: 15, clientes: 1 });
    expect(r.actual).toEqual({ pedidos: 3, unidades: 36, clientes: 2 });
    expect(r.anterior).toEqual({ pedidos: 1, unidades: 100, clientes: 1 });
    expect(variacion(36, 100)).toBe(-64);
    expect(variacion(5, 0)).toBeNull();
  });

  it('rankings del mes', () => {
    expect(rankingMes(PEDIDOS, U, (p) => p.vendedor_id, (k) => k.toUpperCase(), 5, HOY)).toEqual([{ clave: 'v2', nombre: 'V2', valor: 20 }, { clave: 'v1', nombre: 'V1', valor: 16 }]);
    expect(topProductosMes(PEDIDOS, DETALLES, (id) => id, 2, HOY)).toEqual([{ clave: 'p1', nombre: 'p1', valor: 30 }, { clave: 'p2', nombre: 'p2', valor: 5 }]);
  });
});
