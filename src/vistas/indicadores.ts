// Indicadores del Resumen (funciones puras sobre los datos del dispositivo): pedidos y unidades por día y por mes,
// productos más pedidos, ranking por vendedor o droguería y cobertura del fichero.
import type { LocalDetalle, LocalPedido } from '../offline/types';

/** Pedidos que cuentan como venta (no borradores, cancelados ni rechazados). */
export const cuenta = (p: Pick<LocalPedido, 'estado'>) => !['borrador', 'cancelado', 'rechazado'].includes(p.estado);

const diaLocal = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const mesLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Unidades solicitadas por pedido. */
export function unidadesPorPedido(detalles: LocalDetalle[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of detalles) m.set(d.pedido_id, (m.get(d.pedido_id) ?? 0) + d.unidades_solicitadas);
  return m;
}

export interface PuntoDia { fecha: string; pedidos: number; unidades: number; farmacias: number }

/** Serie diaria de los últimos `dias` días (incluye los días sin pedidos, en cero). */
export function serieDiaria(pedidos: LocalPedido[], unidades: Map<string, number>, dias: number, hoy = new Date()): PuntoDia[] {
  const serie = new Map<string, PuntoDia & { _f: Set<string> }>();
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - i);
    const f = diaLocal(d.toISOString());
    serie.set(f, { fecha: f, pedidos: 0, unidades: 0, farmacias: 0, _f: new Set() });
  }
  for (const p of pedidos) {
    if (!cuenta(p)) continue;
    const punto = serie.get(diaLocal(p.created_at));
    if (!punto) continue;
    punto.pedidos++;
    punto.unidades += unidades.get(p.id) ?? 0;
    punto._f.add(p.cliente_id);
  }
  return [...serie.values()].map(({ _f, ...p }) => ({ ...p, farmacias: _f.size }));
}

export interface PuntoMes { mes: string; pedidos: number; unidades: number; farmacias: number }

/** Totales por mes de los últimos `meses` meses (incluye el actual; los meses sin pedidos, en cero). */
export function serieMensual(pedidos: LocalPedido[], unidades: Map<string, number>, meses: number, hoy = new Date()): PuntoMes[] {
  const serie = new Map<string, PuntoMes & { _f: Set<string> }>();
  for (let i = meses - 1; i >= 0; i--) {
    const m = mesLocal(new Date(hoy.getFullYear(), hoy.getMonth() - i, 1));
    serie.set(m, { mes: m, pedidos: 0, unidades: 0, farmacias: 0, _f: new Set() });
  }
  for (const p of pedidos) {
    if (!cuenta(p)) continue;
    const punto = serie.get(mesLocal(new Date(p.created_at)));
    if (!punto) continue;
    punto.pedidos++;
    punto.unidades += unidades.get(p.id) ?? 0;
    punto._f.add(p.cliente_id);
  }
  return [...serie.values()].map(({ _f, ...p }) => ({ ...p, farmacias: _f.size }));
}

export interface ResumenPeriodo { pedidos: number; unidades: number; clientes: number }

/** Totales del mes en curso y del anterior (para la variación). */
export function resumenMeses(pedidos: LocalPedido[], unidades: Map<string, number>, hoy = new Date()): { actual: ResumenPeriodo; anterior: ResumenPeriodo; hoy: ResumenPeriodo } {
  const mesActual = mesLocal(hoy);
  const mesAnterior = mesLocal(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1));
  const diaHoy = diaLocal(hoy.toISOString());
  const vacio = () => ({ pedidos: 0, unidades: 0, clientes: new Set<string>() });
  const acc = { actual: vacio(), anterior: vacio(), hoy: vacio() };
  for (const p of pedidos) {
    if (!cuenta(p)) continue;
    const mes = p.created_at ? mesLocal(new Date(p.created_at)) : '';
    const destinos = [mes === mesActual ? acc.actual : null, mes === mesAnterior ? acc.anterior : null, diaLocal(p.created_at) === diaHoy ? acc.hoy : null];
    for (const d of destinos) {
      if (!d) continue;
      d.pedidos++;
      d.unidades += unidades.get(p.id) ?? 0;
      d.clientes.add(p.cliente_id);
    }
  }
  const cerrar = (x: ReturnType<typeof vacio>): ResumenPeriodo => ({ pedidos: x.pedidos, unidades: x.unidades, clientes: x.clientes.size });
  return { actual: cerrar(acc.actual), anterior: cerrar(acc.anterior), hoy: cerrar(acc.hoy) };
}

/** Variación porcentual redondeada; null si no hay base para comparar. */
export const variacion = (actual: number, anterior: number): number | null => (anterior > 0 ? Math.round(((actual - anterior) / anterior) * 100) : null);

export interface FilaRanking { clave: string; nombre: string; valor: number }

/** Suma unidades del mes por una clave del pedido (vendedor, droguería, farmacia) y devuelve los mayores. */
export function rankingMes(pedidos: LocalPedido[], unidades: Map<string, number>, clave: (p: LocalPedido) => string | null | undefined, nombre: (k: string) => string, limite = 5, hoy = new Date()): FilaRanking[] {
  const mes = mesLocal(hoy);
  const suma = new Map<string, number>();
  for (const p of pedidos) {
    if (!cuenta(p) || mesLocal(new Date(p.created_at)) !== mes) continue;
    const k = clave(p);
    if (!k) continue;
    suma.set(k, (suma.get(k) ?? 0) + (unidades.get(p.id) ?? 0));
  }
  return [...suma.entries()].map(([k, v]) => ({ clave: k, nombre: nombre(k), valor: v })).sort((a, b) => b.valor - a.valor).slice(0, limite);
}

/** Productos más pedidos del mes (unidades). */
export function topProductosMes(pedidos: LocalPedido[], detalles: LocalDetalle[], nombre: (id: string) => string, limite = 5, hoy = new Date()): FilaRanking[] {
  const mes = mesLocal(hoy);
  const delMes = new Set(pedidos.filter((p) => cuenta(p) && mesLocal(new Date(p.created_at)) === mes).map((p) => p.id));
  const suma = new Map<string, number>();
  for (const d of detalles) if (delMes.has(d.pedido_id)) suma.set(d.producto_id, (suma.get(d.producto_id) ?? 0) + d.unidades_solicitadas);
  return [...suma.entries()].map(([k, v]) => ({ clave: k, nombre: nombre(k), valor: v })).sort((a, b) => b.valor - a.valor).slice(0, limite);
}
