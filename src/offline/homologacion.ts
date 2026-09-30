import type { NovaDB } from './db';
import { encolar } from './outbox';
import type { LocalMapCliente } from './types';

/**
 * Código de la farmacia en una droguería (su número de cliente allá). Sin él la droguería no reconoce el pedido, así que la
 * app no deja enviarlo: quien toma el pedido lo escribe UNA vez y queda homologado para siempre.
 */

/** Código principal de la farmacia en la droguería (null si falta). */
export function codigoDeFarmacia(map: LocalMapCliente[], cliente_id: string, drogueria_id: string | null): string | null {
  if (!drogueria_id) return null;
  const filas = map.filter((m) => m.cliente_id === cliente_id && m.drogueria_id === drogueria_id && m.codigo_cuenta);
  return (filas.find((m) => m.es_principal !== false) ?? filas[0])?.codigo_cuenta ?? null;
}

/** Valida y guarda el código en el dispositivo; se envía con la cola (antes que los pedidos que vienen detrás). */
export async function registrarCodigoFarmacia(db: NovaDB, e: { cliente_id: string; drogueria_id: string; codigo: string }, nombreDe?: (cliente_id: string) => string): Promise<LocalMapCliente> {
  const codigo = e.codigo.trim();
  if (!codigo) throw new Error('Escribe el código de la farmacia en la droguería.');
  if (codigo.length > 60) throw new Error('El código es demasiado largo.');
  const deLaDrogueria = await db.mapClientes.where('[drogueria_id+cliente_id]').between([e.drogueria_id, ''], [e.drogueria_id, '￿']).toArray();
  const otro = deLaDrogueria.find((m) => m.codigo_cuenta === codigo && m.cliente_id !== e.cliente_id);
  if (otro) throw new Error(`Ese código ya es de otra farmacia en esta droguería${nombreDe ? ` (${nombreDe(otro.cliente_id)})` : ''}.`);
  const fila: LocalMapCliente = { id: crypto.randomUUID(), drogueria_id: e.drogueria_id, cliente_id: e.cliente_id, codigo_cuenta: codigo, es_principal: true };
  await db.transaction('rw', db.mapClientes, db.outbox, async () => {
    const anteriores = deLaDrogueria.filter((m) => m.cliente_id === e.cliente_id && m.es_principal !== false);
    for (const m of anteriores) await db.mapClientes.update(m.id, { es_principal: false });
    await db.mapClientes.put(fila);
    await encolar(db, { tipo: 'farmacia.codigo', entidad_id: fila.id, payload: { id: fila.id, cliente_id: e.cliente_id, drogueria_id: e.drogueria_id, codigo } });
  });
  return fila;
}
