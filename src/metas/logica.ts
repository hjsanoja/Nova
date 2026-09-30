// Metas del mes: avance con los pedidos del dispositivo, ritmo diario necesario y proyección al cierre.
import type { IndicadorMeta, LocalMeta, LocalPedido } from '../offline/types';
import { cuenta } from '../vistas/indicadores';

export const INDICADORES: { id: IndicadorMeta; texto: string; unidad: string }[] = [
  { id: 'unidades', texto: 'Unidades', unidad: 'unidades' },
  { id: 'pedidos', texto: 'Pedidos', unidad: 'pedidos' },
  { id: 'farmacias', texto: 'Farmacias con pedido', unidad: 'farmacias' },
];
export const indicador = (id: IndicadorMeta) => INDICADORES.find((i) => i.id === id) ?? INDICADORES[0];

/** Primer día del mes (YYYY-MM-01) en hora local. */
export const periodoDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
export const mesSiguiente = (periodo: string, n = 1) => {
  const [a, m] = periodo.split('-').map(Number);
  return periodoDe(new Date(a, m - 1 + n, 1));
};

export interface Avance {
  valor: number;
  objetivo: number;
  pct: number;
  /** Lo que falta por día desde hoy hasta fin de mes (0 si ya se cumplió o el mes cerró). */
  porDia: number;
  /** Cómo cerraría el mes al ritmo actual (solo para el mes en curso). */
  proyeccion: number | null;
  diasRestantes: number;
}

/** Pedidos que cuentan para la meta: del mes de la meta y, si los fija, de ese vendedor, farmacia y droguería. */
export function pedidosDeMeta(meta: Pick<LocalMeta, 'periodo' | 'vendedor_id' | 'cliente_id' | 'drogueria_id'>, pedidos: LocalPedido[]): LocalPedido[] {
  const [a, m] = meta.periodo.split('-').map(Number);
  return pedidos.filter((p) => {
    if (!cuenta(p)) return false;
    const f = new Date(p.created_at);
    if (f.getFullYear() !== a || f.getMonth() + 1 !== m) return false;
    return (!meta.vendedor_id || p.vendedor_id === meta.vendedor_id) && (!meta.cliente_id || p.cliente_id === meta.cliente_id) && (!meta.drogueria_id || p.drogueria_id === meta.drogueria_id);
  });
}

export function avanceMeta(meta: LocalMeta, pedidos: LocalPedido[], unidades: Map<string, number>, hoy = new Date()): Avance {
  const propios = pedidosDeMeta(meta, pedidos);
  const valor =
    meta.indicador === 'unidades' ? propios.reduce((s, p) => s + (unidades.get(p.id) ?? 0), 0)
    : meta.indicador === 'pedidos' ? propios.length
    : new Set(propios.map((p) => p.cliente_id)).size;
  const [a, m] = meta.periodo.split('-').map(Number);
  const diasMes = new Date(a, m, 0).getDate();
  const esEsteMes = periodoDe(hoy) === meta.periodo;
  const pasado = meta.periodo < periodoDe(hoy);
  const diasRestantes = esEsteMes ? diasMes - hoy.getDate() + 1 : pasado ? 0 : diasMes;
  const falta = Math.max(0, meta.objetivo - valor);
  return {
    valor,
    objetivo: meta.objetivo,
    pct: meta.objetivo > 0 ? Math.round((valor / meta.objetivo) * 100) : 0,
    porDia: diasRestantes > 0 ? Math.ceil(falta / diasRestantes) : 0,
    proyeccion: esEsteMes ? Math.round((valor / hoy.getDate()) * diasMes) : null,
    diasRestantes,
  };
}

/** "Ana Pérez · Farmacia La Paz · Cobeca" o "Toda la empresa". */
export function describirMeta(meta: Pick<LocalMeta, 'vendedor_id' | 'cliente_id' | 'drogueria_id'>, nombres: { vendedor: (id: string) => string; cliente: (id: string) => string; drogueria: (id: string) => string }): string {
  const partes = [
    meta.vendedor_id ? nombres.vendedor(meta.vendedor_id) : '',
    meta.cliente_id ? nombres.cliente(meta.cliente_id) : '',
    meta.drogueria_id ? nombres.drogueria(meta.drogueria_id) : '',
  ].filter(Boolean);
  return partes.length ? partes.join(' · ') : 'Toda la empresa';
}
