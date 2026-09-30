import type { EstadoPedido, LocalDetalle, MotivoAjuste } from '../offline/types';

/** Reglas de la mesa de transferencias (espejo de confirmar_pedido en la base de datos). */

export interface Confirmacion {
  detalle_id: string;
  unidades_confirmadas: number;
  motivo?: MotivoAjuste | null;
}

/** Estado en que queda el pedido tras confirmar: todo -> completo · algo -> parcial · nada -> rechazado. */
export function estadoTrasConfirmar(detalles: LocalDetalle[], confirmaciones: Confirmacion[]): EstadoPedido {
  const conf = new Map(confirmaciones.map((c) => [c.detalle_id, c.unidades_confirmadas]));
  let pendientes = 0;
  let total = 0;
  for (const d of detalles) {
    const c = conf.has(d.id) ? (conf.get(d.id) as number) : d.unidades_confirmadas ?? 0;
    total += c;
    if (d.unidades_solicitadas - c > 0) pendientes++;
  }
  return pendientes === 0 ? 'procesado_total' : total === 0 ? 'rechazado' : 'procesado_parcial';
}

/** Valida lo que escribió el usuario antes de enviarlo. Devuelve un mensaje o null si está bien. */
export function validarConfirmaciones(detalles: LocalDetalle[], confirmaciones: Confirmacion[]): string | null {
  const porId = new Map(detalles.map((d) => [d.id, d]));
  for (const c of confirmaciones) {
    const d = porId.get(c.detalle_id);
    if (!d) return 'Una línea ya no pertenece al pedido. Actualiza la pantalla.';
    if (!Number.isInteger(c.unidades_confirmadas) || c.unidades_confirmadas < 0) return 'Las unidades confirmadas deben ser números enteros, cero o más.';
    if (c.unidades_confirmadas > d.unidades_solicitadas) return 'No se puede confirmar más de lo pedido.';
  }
  return null;
}

/** Aplica la confirmación en la base local (modo demostración, sin servidor). */
export function aplicarConfirmacionLocal(detalles: LocalDetalle[], confirmaciones: Confirmacion[]): LocalDetalle[] {
  const conf = new Map(confirmaciones.map((c) => [c.detalle_id, c]));
  return detalles.map((d) => {
    const c = conf.get(d.id);
    if (!c) return d;
    const pend = Math.max(d.unidades_solicitadas - c.unidades_confirmadas, 0);
    return {
      ...d,
      unidades_confirmadas: c.unidades_confirmadas,
      unidades_pendientes: pend,
      motivo_ajuste: pend === 0 ? 'sin_quiebre' : c.motivo || 'quiebre_stock_drogueria',
    };
  });
}
