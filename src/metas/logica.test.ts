import { describe, expect, it } from 'vitest';
import { avanceMeta, describirMeta, mesSiguiente, pedidosDeMeta, ritmoMeta } from './logica';
import type { LocalCiclo, LocalFeriado, LocalMeta, LocalPedido, LocalVisita } from '../offline/types';

const HOY = new Date(2026, 8, 10, 12); // 10 sep 2026 (30 días)
const ped = (id: string, dia: number, extra: Partial<LocalPedido> = {}) => ({ id, created_at: new Date(2026, 8, dia, 10).toISOString(), estado: 'enviado_teletransferencia', cliente_id: 'c1', vendedor_id: 'v1', drogueria_id: 'd1', ...extra }) as LocalPedido;
const meta = (extra: Partial<LocalMeta> & { periodo?: string } = {}) => ({ id: 'm', periodo: '2026-09-01', vendedor_id: null, cliente_id: null, drogueria_id: null, indicador: 'unidades', objetivo: 1000, updated_at: '', ...extra }) as LocalMeta & { periodo: string };

const PEDIDOS = [ped('a', 2), ped('b', 5, { cliente_id: 'c2', drogueria_id: 'd2' }), ped('c', 9, { vendedor_id: 'v2' }), ped('x', 3, { estado: 'borrador' }), { ...ped('ago', 1), created_at: new Date(2026, 7, 30).toISOString() }];
const U = new Map([['a', 100], ['b', 50], ['c', 30], ['x', 999], ['ago', 999]]);
const CTX = { pedidos: PEDIDOS, unidades: U };

describe('metas', () => {
  it('filtra por vendedor, farmacia y droguería (juntos o separados)', () => {
    expect(pedidosDeMeta(meta(), PEDIDOS).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(pedidosDeMeta(meta({ vendedor_id: 'v1' }), PEDIDOS).map((p) => p.id)).toEqual(['a', 'b']);
    expect(pedidosDeMeta(meta({ vendedor_id: 'v1', drogueria_id: 'd2' }), PEDIDOS).map((p) => p.id)).toEqual(['b']);
    expect(pedidosDeMeta(meta({ cliente_id: 'c1', drogueria_id: 'd1' }), PEDIDOS).map((p) => p.id)).toEqual(['a', 'c']);
  });

  it('avance, ritmo por día y proyección', () => {
    const a = avanceMeta(meta({ objetivo: 630 }), CTX, HOY);
    expect(a).toMatchObject({ valor: 180, pct: 29, diasRestantes: 21, porDia: 22, proyeccion: 540 });
    expect(avanceMeta(meta({ indicador: 'pedidos', objetivo: 3 }), CTX, HOY)).toMatchObject({ valor: 3, pct: 100, porDia: 0 });
    expect(avanceMeta(meta({ indicador: 'farmacias', objetivo: 4 }), CTX, HOY).valor).toBe(2);
    expect(avanceMeta(meta({ periodo: '2026-10-01' }), CTX, HOY)).toMatchObject({ valor: 0, diasRestantes: 31, proyeccion: null });
  });

  it('describe la meta y avanza meses', () => {
    const n = { vendedor: () => 'Ana', cliente: () => 'La Paz', drogueria: () => 'Cobeca' };
    expect(describirMeta(meta(), n)).toBe('Toda la empresa');
    expect(describirMeta(meta(), n, { equipo_id: 'e', equipo_nombre: 'Ético' })).toBe('Todo el equipo Ético');
    expect(describirMeta({ ...meta(), medico_id: 'm' }, { ...n, medico: () => 'Dra. Ruiz' })).toBe('Dra. Ruiz');
    expect(describirMeta(meta({ vendedor_id: 'v', drogueria_id: 'd' }), n)).toBe('Ana · Cobeca');
    expect(mesSiguiente('2026-12-01')).toBe('2027-01-01');
    expect(mesSiguiente('2026-01-01', -1)).toBe('2025-12-01');
  });

  it('ritmo de la meta: mismo cálculo que la base (días completos del mes)', () => {
    // 20 sep: 19 días completos de 30 -> se esperaba el 63,33 % del objetivo.
    const dia20 = new Date(2026, 8, 20, 9);
    expect(ritmoMeta(meta({ objetivo: 5000 }), 676, dia20)).toEqual({ nivel: 'en_riesgo', esperado: 3166.67 });
    expect(ritmoMeta(meta({ objetivo: 30 }), 19, dia20).nivel).toBe('en_camino');
    expect(ritmoMeta(meta({ objetivo: 30 }), 17, dia20).nivel).toBe('atencion'); // 17 / 19 = 89 %
    expect(ritmoMeta(meta({ objetivo: 30 }), 15, dia20).nivel).toBe('en_riesgo'); // 79 %
    expect(ritmoMeta(meta({ objetivo: 30 }), 30, dia20).nivel).toBe('cumplida');
    expect(ritmoMeta(meta({ objetivo: 30 }), 0, new Date(2026, 8, 3)).nivel).toBe('inicio');
    expect(ritmoMeta(meta({ objetivo: 30 }), 10, new Date(2026, 9, 2)).nivel).toBe('no_cumplida');
    expect(ritmoMeta(meta({ periodo: '2026-11-01' }), 0, dia20).nivel).toBe('futura');
  });

  it('meta de un ciclo: espejo de la base (días hábiles, equipo, visitas)', () => {
    // Mismo escenario que la prueba SQL 55: ciclo C8 del 3 al 28 de agosto (20 días hábiles), hoy 17 de agosto.
    const C8: LocalCiclo = { id: 'c8', equipo_id: 'etico', equipo_nombre: 'Ético', nombre: 'C8', inicio: '2026-08-03', fin: '2026-08-28' };
    const F: LocalFeriado[] = [];
    const p = (id: string, dia: number, extra: Partial<LocalPedido> = {}) => ({ id, created_at: new Date(2026, 7, dia, 10).toISOString(), estado: 'procesado_total', cliente_id: 'c1', vendedor_id: 'v1', drogueria_id: 'd1', equipo_id: 'etico', ...extra }) as LocalPedido;
    const pedidos = [p('a', 4), p('b', 12), p('otc', 5, { vendedor_id: 'v2', equipo_id: 'otc' }), { ...p('jul', 1), created_at: new Date(2026, 6, 31, 10).toISOString() }];
    const unidades = new Map([['a', 30], ['b', 10], ['otc', 99], ['jul', 99]]);
    const v = (id: string, dia: number, extra: Partial<LocalVisita>) => ({ id, checkin_en: new Date(2026, 7, dia, 15).toISOString(), vendedor_id: 'v1', cliente_id: null, medico_id: null, sync_estado: 'sincronizado', ...extra }) as LocalVisita;
    const visitas = [v('1', 5, { medico_id: 'm1', resultado: 'realizada' }), v('2', 11, { medico_id: 'm1', resultado: 'realizada' }), v('3', 6, { medico_id: 'm2', resultado: 'no_atendio' }), v('4', 7, { cliente_id: 'c1', resultado: 'sin_pedido' }), v('5', 10, { cliente_id: 'c1', resultado: 'reprogramada' })];
    const ctx = { pedidos, unidades, visitas, ciclos: [C8], feriados: F, equipoDe: (id: string) => (id === 'v2' ? 'otc' : 'etico') };
    const m = (extra: Partial<LocalMeta>): LocalMeta => ({ id: 'x', periodo: null, ciclo_id: 'c8', vendedor_id: 'v1', cliente_id: null, drogueria_id: null, indicador: 'unidades', objetivo: 100, updated_at: '', ...extra });
    const hoy = new Date(2026, 7, 17, 9);
    expect(avanceMeta(m({}), ctx, hoy)).toMatchObject({ valor: 40, esperado: 50, nivel: 'atencion', diasRestantes: 10, dias: 'días hábiles', porDia: 6, proyeccion: 80 });
    expect(avanceMeta(m({ indicador: 'visitas_medicos', objetivo: 4 }), ctx, hoy)).toMatchObject({ valor: 2, nivel: 'en_camino' });
    expect(avanceMeta(m({ indicador: 'medicos_visitados', objetivo: 2 }), ctx, hoy).valor).toBe(1);
    expect(avanceMeta(m({ vendedor_id: null, indicador: 'pedidos', objetivo: 2 }), ctx, hoy)).toMatchObject({ valor: 2, nivel: 'cumplida' });
    expect(avanceMeta(m({ indicador: 'visitas_farmacias', objetivo: 1 }), ctx, hoy).valor).toBe(1);
    expect(avanceMeta(m({ vendedor_id: null, medico_id: 'm1', indicador: 'visitas_medicos', objetivo: 2 }), ctx, hoy).nivel).toBe('cumplida');
    expect(avanceMeta(m({}), ctx, new Date(2026, 7, 4, 9)).nivel).toBe('inicio');
    expect(avanceMeta(m({}), ctx, new Date(2026, 7, 31, 9)).nivel).toBe('no_cumplida');
    expect(avanceMeta(m({ ciclo_id: 'otro' }), ctx, hoy).valor).toBe(0); // ciclo que aún no llegó al equipo
  });
});
