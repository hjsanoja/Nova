import type { Tono } from '../components/ui/kit';
import type { EstadoPedido, LocalCliente, LocalDetalle, LocalDrogueria, LocalPedido } from '../offline/types';

/** Lógica de las pantallas de consulta y reportes, sin React ni base de datos (se prueba aparte). */

export const MS_DIA = 86_400_000;

export const diasDesde = (fecha: string | null | undefined, ahora = new Date()): number | null =>
  fecha ? Math.max(0, Math.floor((ahora.getTime() - new Date(fecha).getTime()) / MS_DIA)) : null;

export const ESTADOS_ETIQUETA: Record<EstadoPedido, { texto: string; tono: Tono }> = {
  borrador: { texto: 'Borrador', tono: 'gris' },
  enviado_teletransferencia: { texto: 'Por procesar', tono: 'azul' },
  en_revision: { texto: 'En revisión', tono: 'ambar' },
  en_proceso: { texto: 'En proceso', tono: 'azul' },
  procesado_parcial: { texto: 'Parcial', tono: 'ambar' },
  procesado_total: { texto: 'Completo', tono: 'verde' },
  facturado: { texto: 'Facturado', tono: 'verde' },
  rechazado: { texto: 'Rechazado', tono: 'rojo' },
  cancelado: { texto: 'Cancelado', tono: 'gris' },
};

/** Estados que aún esperan a la mesa de transferencias. */
export const ESTADOS_POR_PROCESAR: EstadoPedido[] = ['enviado_teletransferencia', 'en_revision', 'en_proceso'];
export const ESTADOS_PROCESADOS: EstadoPedido[] = ['procesado_parcial', 'procesado_total', 'facturado'];

export type GrupoEstado = 'todos' | 'por_procesar' | 'revision' | 'parcial' | 'completo' | 'otros';
export const GRUPOS_ESTADO: { id: GrupoEstado; texto: string }[] = [
  { id: 'todos', texto: 'Todos' },
  { id: 'por_procesar', texto: 'Por procesar' },
  { id: 'revision', texto: 'En revisión' },
  { id: 'parcial', texto: 'Parciales' },
  { id: 'completo', texto: 'Completos' },
  { id: 'otros', texto: 'Otros' },
];

export function perteneceAGrupo(estado: EstadoPedido, grupo: GrupoEstado): boolean {
  switch (grupo) {
    case 'todos': return true;
    case 'por_procesar': return estado === 'enviado_teletransferencia' || estado === 'en_proceso';
    case 'revision': return estado === 'en_revision';
    case 'parcial': return estado === 'procesado_parcial';
    case 'completo': return estado === 'procesado_total' || estado === 'facturado';
    case 'otros': return estado === 'borrador' || estado === 'rechazado' || estado === 'cancelado';
  }
}

export interface FiltroPedidos {
  grupo: GrupoEstado;
  texto: string;
  vendedorId?: string | null;
  drogueriaId?: string | null;
  desde?: number | null;
}

export function filtrarPedidos(pedidos: LocalPedido[], f: FiltroPedidos, nombreCliente: (id: string) => string): LocalPedido[] {
  const q = f.texto.trim().toLowerCase();
  return pedidos
    .filter((p) => perteneceAGrupo(p.estado, f.grupo))
    .filter((p) => !f.vendedorId || p.vendedor_id === f.vendedorId)
    .filter((p) => !f.drogueriaId || p.drogueria_id === f.drogueriaId)
    .filter((p) => !f.desde || new Date(p.created_at).getTime() >= f.desde)
    .filter((p) => !q || p.correlativo.toLowerCase().includes(q) || nombreCliente(p.cliente_id).toLowerCase().includes(q))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function contarPorGrupo(pedidos: LocalPedido[]): Record<GrupoEstado, number> {
  const r: Record<GrupoEstado, number> = { todos: pedidos.length, por_procesar: 0, revision: 0, parcial: 0, completo: 0, otros: 0 };
  for (const p of pedidos) for (const g of ['por_procesar', 'revision', 'parcial', 'completo', 'otros'] as const) if (perteneceAGrupo(p.estado, g)) r[g]++;
  return r;
}

export interface UnidadesPedido { solicitadas: number; confirmadas: number | null; pendientes: number }

/** Totales de un pedido. `confirmadas` es null mientras la mesa no confirma ninguna línea. */
export function unidadesDePedido(detalles: LocalDetalle[]): UnidadesPedido {
  let sol = 0, conf = 0, alguna = false, pend = 0;
  for (const d of detalles) {
    sol += d.unidades_solicitadas;
    if (d.unidades_confirmadas != null) { conf += d.unidades_confirmadas; alguna = true; }
    pend += d.unidades_pendientes ?? 0;
  }
  return { solicitadas: sol, confirmadas: alguna ? conf : null, pendientes: pend };
}

export function detallesPorPedido(detalles: LocalDetalle[]): Map<string, LocalDetalle[]> {
  const m = new Map<string, LocalDetalle[]>();
  for (const d of detalles) m.set(d.pedido_id, [...(m.get(d.pedido_id) ?? []), d]);
  m.forEach((v) => v.sort((a, b) => a.linea - b.linea));
  return m;
}

// ----------------------------------------------------------------------------- fichero: clientes por atender

export interface ClienteConActividad {
  cliente: LocalCliente;
  ultimaActividad: string | null;
  dias: number | null;
  /** Días por encima de su frecuencia habitual (>0 = atrasado). null si no hay frecuencia o actividad. */
  atraso: number | null;
}

/** Combina la última compra reportada por las droguerías con el último pedido hecho en Nova. */
export function actividadDeClientes(
  clientes: LocalCliente[],
  ultimaCompra: Map<string, string>,
  ultimoPedido: Map<string, string>,
  ahora = new Date()
): ClienteConActividad[] {
  return clientes.map((cliente) => {
    const a = ultimaCompra.get(cliente.id);
    const b = ultimoPedido.get(cliente.id);
    const ultimaActividad = a && b ? (a > b ? a : b) : a ?? b ?? null;
    const dias = diasDesde(ultimaActividad, ahora);
    const atraso = dias != null && cliente.frecuencia_dias ? dias - cliente.frecuencia_dias : null;
    return { cliente, ultimaActividad, dias, atraso };
  });
}

/** Clientes activos atrasados respecto a su frecuencia, los más atrasados primero. */
export const clientesPorAtender = (act: ClienteConActividad[], limite = 8): ClienteConActividad[] =>
  act
    .filter((a) => a.cliente.estado_validacion === 'activo' && a.atraso != null && a.atraso > 0)
    .sort((x, y) => (y.atraso ?? 0) - (x.atraso ?? 0))
    .slice(0, limite);

// ----------------------------------------------------------------------------- reportes

export interface FilaCumplimiento {
  drogueriaId: string;
  drogueria: string;
  pedidos: number;
  solicitadas: number;
  confirmadas: number;
  /** % de lo solicitado que la droguería confirmó (solo pedidos ya procesados). null si no hay pedidos procesados. */
  fillRate: number | null;
  quiebres: number;
}

export function cumplimientoPorDrogueria(pedidos: LocalPedido[], detalles: LocalDetalle[], droguerias: LocalDrogueria[]): FilaCumplimiento[] {
  const nombres = new Map(droguerias.map((d) => [d.id, d.nombre]));
  const porPedido = detallesPorPedido(detalles);
  const acc = new Map<string, FilaCumplimiento>();
  for (const p of pedidos) {
    if (!ESTADOS_PROCESADOS.includes(p.estado)) continue;
    const f = acc.get(p.drogueria_id) ?? { drogueriaId: p.drogueria_id, drogueria: nombres.get(p.drogueria_id) ?? 'Droguería', pedidos: 0, solicitadas: 0, confirmadas: 0, fillRate: null, quiebres: 0 };
    f.pedidos++;
    for (const d of porPedido.get(p.id) ?? []) {
      f.solicitadas += d.unidades_solicitadas;
      f.confirmadas += d.unidades_confirmadas ?? 0;
      if (d.motivo_ajuste === 'quiebre_stock_drogueria') f.quiebres++;
    }
    acc.set(p.drogueria_id, f);
  }
  return [...acc.values()]
    .map((f) => ({ ...f, fillRate: f.solicitadas > 0 ? Math.round((f.confirmadas / f.solicitadas) * 1000) / 10 : null }))
    .sort((a, b) => b.pedidos - a.pedidos);
}

/** CSV para Excel (UTF-8 con BOM, separador ; y texto entre comillas). */
export function aCsv(encabezados: string[], filas: (string | number | null | undefined)[][]): string {
  const celda = (v: string | number | null | undefined) => {
    if (v == null) return '';
    if (typeof v === 'number') return String(v);
    const limpio = /^[=+\-@]/.test(v) ? `'${v}` : v; // evita fórmulas en Excel
    return `"${limpio.replace(/"/g, '""')}"`;
  };
  return '﻿' + [encabezados.map(celda).join(';'), ...filas.map((f) => f.map(celda).join(';'))].join('\r\n') + '\r\n';
}

export function descargarTexto(nombre: string, contenido: string | Uint8Array, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([contenido as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
