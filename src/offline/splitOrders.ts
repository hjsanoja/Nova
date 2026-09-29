import type { LocalDetalle, LocalPedido } from './types';

/**
 * Pedidos incompletos y backorders (regla 2). Funciones puras: el servidor (rerutear_remanente) aplica
 * exactamente la misma regla; aquí se usa para mostrar el resultado al instante, incluso sin conexión.
 */

export interface LineaRemanente {
  detalle: LocalDetalle;
  unidades: number;
}

/** Líneas con unidades sin despachar que todavía no se derivaron a otro pedido. */
export function calcularRemanente(detalles: LocalDetalle[]): LineaRemanente[] {
  return detalles
    .filter((d) => d.unidades_pendientes > 0 && !d.remanente_derivado_en)
    .sort((a, b) => a.linea - b.linea)
    .map((d) => ({ detalle: d, unidades: d.unidades_pendientes }));
}

export function resumenRemanente(detalles: LocalDetalle[]): { lineas: number; unidades: number } {
  const r = calcularRemanente(detalles);
  return { lineas: r.length, unidades: r.reduce((a, l) => a + l.unidades, 0) };
}

/**
 * Correlativo del derivado: PED-1045-R1, -R2… La numeración sigue a la RAÍZ de la cadena,
 * aunque el padre inmediato sea otro derivado (R2 puede nacer de R1).
 */
export function siguienteCorrelativoDerivado(
  raiz: Pick<LocalPedido, 'correlativo'>,
  pedidosDeLaCadena: Pick<LocalPedido, 'sufijo_derivado'>[]
): { correlativo: string; sufijo: number } {
  const maximo = pedidosDeLaCadena.reduce((m, p) => Math.max(m, p.sufijo_derivado ?? 0), 0);
  const sufijo = maximo + 1;
  return { correlativo: `${raiz.correlativo}-R${sufijo}`, sufijo };
}

export function puedeRerutear(pedido: Pick<LocalPedido, 'estado' | 'drogueria_id'>, drogueriaDestinoId: string, detalles: LocalDetalle[]): string | null {
  if (pedido.estado !== 'procesado_parcial') return 'Solo un pedido procesado parcialmente puede re-rutearse.';
  if (pedido.drogueria_id === drogueriaDestinoId) return 'Elige una droguería distinta a la del pedido original.';
  if (calcularRemanente(detalles).length === 0) return 'No queda remanente por re-rutear.';
  return null;
}

export interface EntradaDerivado {
  padre: LocalPedido;
  raiz: LocalPedido;
  cadena: LocalPedido[];
  detallesPadre: LocalDetalle[];
  drogueriaDestinoId: string;
  nuevoId: string;
  folioLocal: string;
  deviceId: string;
  ahora: string;
  nuevosIdsDetalle: () => string;
}

/** Construye el pedido hijo (en_revision, parent_pedido_id) solo con lo pendiente, más las líneas del padre ya marcadas. */
export function construirDerivado(e: EntradaDerivado): {
  pedido: LocalPedido;
  detalles: LocalDetalle[];
  detallesPadreActualizados: LocalDetalle[];
} {
  const remanente = calcularRemanente(e.detallesPadre);
  const { correlativo, sufijo } = siguienteCorrelativoDerivado(e.raiz, e.cadena);

  const pedido: LocalPedido = {
    id: e.nuevoId,
    correlativo,
    correlativo_provisional: true,
    folio_local: e.folioLocal,
    parent_pedido_id: e.padre.id,
    pedido_raiz_id: e.raiz.id,
    sufijo_derivado: sufijo,
    cliente_id: e.padre.cliente_id,
    drogueria_id: e.drogueriaDestinoId,
    vendedor_id: e.padre.vendedor_id,
    equipo_id: e.padre.equipo_id ?? null,
    estado: 'en_revision',
    requiere_revision_especial: false,
    motivos_revision: [],
    condicion_comercial_id: e.padre.condicion_comercial_id ?? null,
    descuento_pedido_pct: e.padre.descuento_pedido_pct ?? null,
    observaciones: `Remanente de ${e.padre.correlativo}`,
    numero_factura: null,
    device_id: e.deviceId,
    created_at: e.ahora,
    updated_at: e.ahora,
    row_version: 0,
    sync_estado: 'pendiente',
  };

  const detalles: LocalDetalle[] = remanente.map((l, i) => ({
    id: e.nuevosIdsDetalle(),
    pedido_id: e.nuevoId,
    linea: i + 1,
    producto_id: l.detalle.producto_id,
    unidades_solicitadas: l.unidades,
    unidades_confirmadas: null,
    unidades_pendientes: l.unidades,
    motivo_ajuste: 'sin_quiebre',
    descuento_pct: l.detalle.descuento_pct ?? null,
    notas_linea: l.detalle.notas_linea ?? null,
    detalle_origen_id: l.detalle.id,
    remanente_derivado_en: null,
  }));

  const derivadas = new Set(remanente.map((l) => l.detalle.id));
  const detallesPadreActualizados = e.detallesPadre.map((d) => (derivadas.has(d.id) ? { ...d, remanente_derivado_en: e.nuevoId } : d));
  return { pedido, detalles, detallesPadreActualizados };
}
