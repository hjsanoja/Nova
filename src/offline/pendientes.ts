// Lo que está guardado solo en este dispositivo (cola de envío): descrito en palabras para avisar a la persona.
import type { OutboxItem, TipoOutbox } from './types';

const QUE: Record<TipoOutbox, string> = {
  'pedido.crear': 'Pedido nuevo',
  'pedido.modificar': 'Cambio en un pedido',
  'pedido.rerutear': 'Re-ruteo de un pedido',
  'prospecto.crear': 'Farmacia nueva',
  'visita.registrar': 'Visita',
  'farmacia.codigo': 'Código de farmacia en droguería',
  'plantilla.guardar': 'Plantilla',
  'tarea.guardar': 'Tarea',
  'actividad.guardar': 'Actividad o día libre',
};

export interface Pendiente {
  seq: number;
  que: string;
  detalle: string;
  desde: number;
  estado: OutboxItem['estado'];
  error: string | null;
  intentos: number;
}

/** Describe cada cambio pendiente. `nombre` resuelve farmacias por id; `pedido` da el correlativo y la farmacia de un pedido. */
export function describirPendientes(
  items: OutboxItem[],
  nombre: (clienteId: string) => string | undefined,
  pedido: (id: string) => { correlativo: string; cliente_id: string } | undefined
): Pendiente[] {
  return [...items]
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    .map((o) => {
      const p = o.payload as Record<string, unknown>;
      let detalle = '';
      if (o.tipo === 'pedido.crear' || o.tipo === 'pedido.modificar') {
        const ped = pedido(o.entidad_id);
        detalle = [ped?.correlativo, nombre(String(p.cliente_id ?? ped?.cliente_id ?? ''))].filter(Boolean).join(' · ');
      } else if (o.tipo === 'pedido.rerutear') detalle = pedido(String(p.p_pedido ?? ''))?.correlativo ?? '';
      else if (o.tipo === 'farmacia.codigo') detalle = `${nombre(String(p.cliente_id)) ?? 'Farmacia'}: ${String(p.codigo ?? '')}`;
      else if (o.tipo === 'plantilla.guardar') detalle = `${String(p.nombre ?? '')}${p.eliminar ? ' (borrar)' : ''} · ${nombre(String(p.cliente_id)) ?? ''}`;
      else if (o.tipo === 'prospecto.crear') detalle = String(p.nombre_comercial ?? '');
      else if (o.tipo === 'visita.registrar') detalle = p.cliente_id ? nombre(String(p.cliente_id)) ?? '' : 'Visita a un médico';
      else if (o.tipo === 'tarea.guardar') detalle = `${String(p.titulo ?? '')}${p.eliminar ? ' (borrar)' : ''}`;
      else if (o.tipo === 'actividad.guardar') detalle = `${String(p.desde ?? '')}${p.hasta && p.hasta !== p.desde ? ` al ${String(p.hasta)}` : ''}${p.anular ? ' (anular)' : ''}`;
      return { seq: o.seq ?? 0, que: QUE[o.tipo] ?? o.tipo, detalle, desde: o.created_at, estado: o.estado, error: o.error ?? null, intentos: o.intentos };
    });
}

/** "hace 5 min", "hace 2 h", "hace 3 días". */
export function antiguedad(desde: number, ahora = Date.now()): string {
  const min = Math.max(0, Math.round((ahora - desde) / 60_000));
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

/** Cuándo avisar con fuerza: hay errores, o algo lleva más de `minutos` sin subir. */
export const hayQueAvisar = (lista: Pendiente[], ahora = Date.now(), minutos = 10) =>
  lista.some((p) => p.estado !== 'pendiente' || ahora - p.desde > minutos * 60_000);
