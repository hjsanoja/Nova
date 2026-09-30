import { describe, expect, it } from 'vitest';
import { avanceMeta, describirMeta, mesSiguiente, pedidosDeMeta } from './logica';
import type { LocalMeta, LocalPedido } from '../offline/types';

const HOY = new Date(2026, 8, 10, 12); // 10 sep 2026 (30 días)
const ped = (id: string, dia: number, extra: Partial<LocalPedido> = {}) => ({ id, created_at: new Date(2026, 8, dia, 10).toISOString(), estado: 'enviado_teletransferencia', cliente_id: 'c1', vendedor_id: 'v1', drogueria_id: 'd1', ...extra }) as LocalPedido;
const meta = (extra: Partial<LocalMeta> = {}): LocalMeta => ({ id: 'm', periodo: '2026-09-01', vendedor_id: null, cliente_id: null, drogueria_id: null, indicador: 'unidades', objetivo: 1000, updated_at: '', ...extra });

const PEDIDOS = [ped('a', 2), ped('b', 5, { cliente_id: 'c2', drogueria_id: 'd2' }), ped('c', 9, { vendedor_id: 'v2' }), ped('x', 3, { estado: 'borrador' }), { ...ped('ago', 1), created_at: new Date(2026, 7, 30).toISOString() }];
const U = new Map([['a', 100], ['b', 50], ['c', 30], ['x', 999], ['ago', 999]]);

describe('metas', () => {
  it('filtra por vendedor, farmacia y droguería (juntos o separados)', () => {
    expect(pedidosDeMeta(meta(), PEDIDOS).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(pedidosDeMeta(meta({ vendedor_id: 'v1' }), PEDIDOS).map((p) => p.id)).toEqual(['a', 'b']);
    expect(pedidosDeMeta(meta({ vendedor_id: 'v1', drogueria_id: 'd2' }), PEDIDOS).map((p) => p.id)).toEqual(['b']);
    expect(pedidosDeMeta(meta({ cliente_id: 'c1', drogueria_id: 'd1' }), PEDIDOS).map((p) => p.id)).toEqual(['a', 'c']);
  });

  it('avance, ritmo por día y proyección', () => {
    const a = avanceMeta(meta({ objetivo: 630 }), PEDIDOS, U, HOY);
    expect(a).toMatchObject({ valor: 180, pct: 29, diasRestantes: 21, porDia: 22, proyeccion: 540 });
    expect(avanceMeta(meta({ indicador: 'pedidos', objetivo: 3 }), PEDIDOS, U, HOY)).toMatchObject({ valor: 3, pct: 100, porDia: 0 });
    expect(avanceMeta(meta({ indicador: 'farmacias', objetivo: 4 }), PEDIDOS, U, HOY).valor).toBe(2);
    expect(avanceMeta(meta({ periodo: '2026-10-01' }), PEDIDOS, U, HOY)).toMatchObject({ valor: 0, diasRestantes: 31, proyeccion: null });
  });

  it('describe la meta y avanza meses', () => {
    const n = { vendedor: () => 'Ana', cliente: () => 'La Paz', drogueria: () => 'Cobeca' };
    expect(describirMeta(meta(), n)).toBe('Toda la empresa');
    expect(describirMeta(meta({ vendedor_id: 'v', drogueria_id: 'd' }), n)).toBe('Ana · Cobeca');
    expect(mesSiguiente('2026-12-01')).toBe('2027-01-01');
    expect(mesSiguiente('2026-01-01', -1)).toBe('2025-12-01');
  });
});
