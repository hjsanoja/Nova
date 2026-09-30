import type { NovaDB } from './db';
import type { LocalCliente, LocalDetalle, LocalPedido, OutboxItem, TipoOutbox } from './types';
import { ErrorRemoto } from './remoto';
import type { FilaRemota, SyncRemote } from './remoto';

/**
 * Cola transaccional de mutaciones (Outbox). Cada operación hecha sin conexión se guarda en la MISMA
 * transacción que el cambio local, con un UUID generado en el cliente; el servidor la aplica de forma
 * idempotente, así que reintentar (o enviar desde dos pestañas) nunca duplica un pedido.
 */

export interface EntradaOutbox {
  tipo: TipoOutbox;
  entidad_id: string;
  depende_de?: string | null;
  payload: Record<string, unknown>;
}

/** Debe llamarse dentro de una transacción que incluya `db.outbox`. */
export async function encolar(db: NovaDB, e: EntradaOutbox, ahora = Date.now()): Promise<void> {
  await db.outbox.add({
    id: crypto.randomUUID(),
    tipo: e.tipo,
    entidad_id: e.entidad_id,
    depende_de: e.depende_de ?? null,
    payload: e.payload,
    estado: 'pendiente',
    intentos: 0,
    proximo_intento: 0,
    error: null,
    created_at: ahora,
  });
}

/** Tras recuperar la red se ignora la espera acumulada y se reintenta de inmediato. */
export async function reintentarAhora(db: NovaDB): Promise<void> {
  await db.outbox.where('estado').equals('pendiente').modify({ proximo_intento: 0 });
}

export function esperaExponencial(intentos: number, aleatorio: () => number = Math.random): number {
  const base = Math.min(300_000, 2_000 * 2 ** Math.min(intentos, 8));
  return Math.round(base * (0.5 + aleatorio() / 2)); // jitter: evita que todos los dispositivos reintenten a la vez
}

export interface ResultadoFlush {
  enviados: number;
  errores: number;
  conflictos: number;
  detenidoPor?: 'red' | 'auth';
}

async function siguienteElegible(db: NovaDB, ahora: number): Promise<OutboxItem | undefined> {
  const candidatos = await db.outbox.orderBy('seq').filter((o) => o.estado === 'pendiente' && o.proximo_intento <= ahora).toArray();
  for (const item of candidatos) {
    const dependencias = [item.entidad_id, ...(item.depende_de ? [item.depende_de] : [])];
    // Un item espera a los anteriores de su misma entidad y a los de la entidad de la que depende
    // (aunque estén en error o conflicto): no se puede re-rutear un pedido que nunca llegó al servidor.
    const bloqueantes = await db.outbox
      .where('entidad_id')
      .anyOf(dependencias)
      .filter((o) => (o.seq ?? 0) < (item.seq ?? 0))
      .count();
    if (bloqueantes === 0) return item;
  }
  return undefined;
}

/** Envía las mutaciones pendientes en orden hasta vaciar la cola o toparse con un fallo de red. */
export async function procesarOutbox(db: NovaDB, remoto: SyncRemote, reloj: () => number = Date.now): Promise<ResultadoFlush> {
  const resultado: ResultadoFlush = { enviados: 0, errores: 0, conflictos: 0 };
  for (;;) {
    const item = await siguienteElegible(db, reloj());
    if (!item) return resultado;

    try {
      const respuesta = await remoto.ejecutar(item.tipo, item.payload);
      const conflicto = await aplicarRespuesta(db, item, respuesta);
      if (conflicto) resultado.conflictos++;
      else resultado.enviados++;
    } catch (e) {
      const error = e instanceof ErrorRemoto ? e : new ErrorRemoto('red', e instanceof Error ? e.message : String(e));
      if (error.clase === 'red') {
        await db.outbox.update(item.seq!, {
          intentos: item.intentos + 1,
          proximo_intento: reloj() + esperaExponencial(item.intentos + 1),
          error: error.message,
        });
        resultado.detenidoPor = 'red';
        return resultado;
      }
      if (error.clase === 'auth') {
        resultado.detenidoPor = 'auth';
        return resultado;
      }
      await marcarErrorPermanente(db, item, error);
      resultado.errores++;
    }
  }
}

async function quedanMutaciones(db: NovaDB, entidadId: string, excluirSeq: number): Promise<boolean> {
  return (await db.outbox.where('entidad_id').equals(entidadId).filter((o) => o.seq !== excluirSeq).count()) > 0;
}

const num = (v: unknown, defecto = 0): number => (typeof v === 'number' ? v : defecto);

/** Aplica la respuesta del servidor al estado local y retira la mutación. Devuelve true si hubo conflicto. */
async function aplicarRespuesta(db: NovaDB, item: OutboxItem, r: FilaRemota): Promise<boolean> {
  const tablas = [db.outbox, db.pedidos, db.detalles, db.clientes, db.visitas, db.mapClientes, db.plantillas];
  return db.transaction('rw', tablas, async () => {
    switch (item.tipo) {
      case 'pedido.crear':
      case 'pedido.modificar': {
        if (r.conflicto === true) {
          await db.outbox.update(item.seq!, { estado: 'conflicto', error: String(r.motivo ?? 'version_desactualizada') });
          await db.pedidos.update(item.entidad_id, {
            sync_estado: 'conflicto',
            sync_error: String(r.motivo ?? 'El pedido cambió en el servidor mientras editabas sin conexión'),
          });
          return true;
        }
        await db.outbox.delete(item.seq!);
        const restante = await quedanMutaciones(db, item.entidad_id, item.seq!);
        await db.pedidos.update(item.entidad_id, {
          correlativo: String(r.correlativo),
          correlativo_provisional: false,
          estado: r.estado as LocalPedido['estado'],
          requiere_revision_especial: r.requiere_revision_especial === true,
          motivos_revision: (r.motivos_revision as LocalPedido['motivos_revision']) ?? [],
          row_version: num(r.row_version),
          sync_estado: restante ? 'pendiente' : 'sincronizado',
          sync_error: null,
        });
        return false;
      }
      case 'pedido.rerutear': {
        await db.outbox.delete(item.seq!);
        const hijoId = String(r.id);
        await db.pedidos.update(hijoId, {
          correlativo: String(r.correlativo),
          correlativo_provisional: false,
          estado: r.estado as LocalPedido['estado'],
          row_version: num(r.row_version),
          sync_estado: (await quedanMutaciones(db, hijoId, item.seq!)) ? 'pendiente' : 'sincronizado',
          sync_error: null,
        });
        // Las líneas del hijo las generó el servidor con sus propios ids: reemplazan a las provisionales.
        const lineas = (r.detalles as FilaRemota[] | null) ?? [];
        if (lineas.length > 0) {
          await db.detalles.where('pedido_id').equals(hijoId).delete();
          await db.detalles.bulkPut(
            lineas.map<LocalDetalle>((d) => ({
              id: String(d.id),
              pedido_id: hijoId,
              linea: num(d.linea, 1),
              producto_id: String(d.producto_id),
              unidades_solicitadas: num(d.unidades_solicitadas),
              unidades_confirmadas: null,
              unidades_pendientes: num(d.unidades_solicitadas),
              motivo_ajuste: 'sin_quiebre',
              descuento_pct: (d.descuento_pct as number | null) ?? null,
              detalle_origen_id: (d.detalle_origen_id as string | null) ?? null,
              remanente_derivado_en: null,
            }))
          );
        }
        return false;
      }
      case 'visita.registrar': {
        await db.outbox.delete(item.seq!);
        await db.visitas.update(item.entidad_id, {
          distancia_metros: (r.distancia_metros as number | null) ?? null,
          dentro_de_radio: r.dentro_de_radio === true,
          sync_estado: 'sincronizado',
        });
        return false;
      }
      case 'farmacia.codigo': {
        await db.outbox.delete(item.seq!);
        // Si el código ya existía en el servidor, su fila reemplaza a la provisional.
        const id = String(r.id ?? item.entidad_id);
        if (id !== item.entidad_id) await db.mapClientes.delete(item.entidad_id);
        await db.mapClientes.put({
          id,
          drogueria_id: String(r.drogueria_id ?? item.payload.drogueria_id),
          cliente_id: String(r.cliente_id ?? item.payload.cliente_id),
          codigo_cuenta: String(r.codigo_cuenta ?? item.payload.codigo),
          nombre_en_drogueria: (r.nombre_en_drogueria as string | null) ?? null,
          es_principal: r.es_principal !== false,
        });
        return false;
      }
      case 'plantilla.guardar': {
        await db.outbox.delete(item.seq!);
        if (item.payload.eliminar) await db.plantillas.delete(item.entidad_id);
        else if (!(await quedanMutaciones(db, item.entidad_id, item.seq!))) await db.plantillas.update(item.entidad_id, { sync_estado: 'sincronizado' });
        return false;
      }
      case 'prospecto.crear': {
        await db.outbox.delete(item.seq!);
        await db.clientes.update(item.entidad_id, {
          estado_validacion: r.estado_validacion as LocalCliente['estado_validacion'],
          sync_estado: 'sincronizado',
        });
        return false;
      }
    }
  });
}

/** Rechazo definitivo del servidor: la mutación queda en "error" (no se reintenta) y se compensa lo local. */
async function marcarErrorPermanente(db: NovaDB, item: OutboxItem, error: ErrorRemoto): Promise<void> {
  const tablas = [db.outbox, db.pedidos, db.detalles, db.clientes, db.visitas, db.mapClientes, db.plantillas];
  await db.transaction('rw', tablas, async () => {
    await db.outbox.update(item.seq!, { estado: 'error', error: error.message });
    const patch = { sync_estado: 'error' as const, sync_error: error.message };
    switch (item.tipo) {
      case 'pedido.crear':
      case 'pedido.modificar':
        await db.pedidos.update(item.entidad_id, patch);
        break;
      case 'pedido.rerutear': {
        // Compensación: se deshace el pedido derivado y las líneas del padre vuelven a estar disponibles.
        const hijoId = String(item.payload.p_nuevo_id);
        await db.detalles.where('pedido_id').equals(hijoId).delete();
        await db.pedidos.delete(hijoId);
        await db.detalles.where('remanente_derivado_en').equals(hijoId).modify({ remanente_derivado_en: null });
        await db.pedidos.update(item.entidad_id, patch);
        break;
      }
      case 'visita.registrar':
        await db.visitas.update(item.entidad_id, { sync_estado: 'error' });
        break;
      case 'prospecto.crear':
        await db.clientes.update(item.entidad_id, { sync_estado: 'error' });
        break;
      case 'plantilla.guardar':
        await db.plantillas.update(item.entidad_id, { sync_estado: 'error' });
        break;
      case 'farmacia.codigo':
        // Rechazado (p. ej. el código es de otra farmacia): se retira para que la app vuelva a pedirlo.
        await db.mapClientes.delete(item.entidad_id);
        break;
    }
  });
}

/** El usuario descarta su cambio local: se retiran sus mutaciones y se vuelve a la versión del servidor. */
export async function descartarCambiosLocales(db: NovaDB, remoto: SyncRemote, pedidoId: string): Promise<void> {
  await db.outbox.where('entidad_id').equals(pedidoId).delete();
  const fila = await remoto.traerPorId('fact_pedidos', pedidoId);
  const delPedido = await remoto.traer('fact_pedido_detalles', null, 500, { filtro: { pedido_id: pedidoId } });
  await db.transaction('rw', [db.pedidos, db.detalles], async () => {
    if (fila) {
      await db.pedidos.update(pedidoId, {
        correlativo: String(fila.correlativo),
        estado: fila.estado as LocalPedido['estado'],
        observaciones: (fila.observaciones as string | null) ?? null,
        row_version: num(fila.row_version),
        sync_estado: 'sincronizado',
        sync_error: null,
      });
    }
    if (delPedido.length > 0) {
      await db.detalles.where('pedido_id').equals(pedidoId).delete();
      await db.detalles.bulkPut(
        delPedido.map<LocalDetalle>((d) => ({
          id: String(d.id),
          pedido_id: pedidoId,
          linea: num(d.linea, 1),
          producto_id: String(d.producto_id),
          unidades_solicitadas: num(d.unidades_solicitadas),
          unidades_confirmadas: (d.unidades_confirmadas as number | null) ?? null,
          unidades_pendientes: num(d.unidades_pendientes),
          motivo_ajuste: (d.motivo_ajuste as LocalDetalle['motivo_ajuste']) ?? 'sin_quiebre',
          descuento_pct: (d.descuento_pct as number | null) ?? null,
          notas_linea: (d.notas_linea as string | null) ?? null,
          detalle_origen_id: (d.detalle_origen_id as string | null) ?? null,
          remanente_derivado_en: (d.remanente_derivado_en as string | null) ?? null,
        }))
      );
    }
  });
}

/** Reintenta manualmente una mutación en error (tras corregir el dato o los permisos). */
export async function reintentarItem(db: NovaDB, seq: number): Promise<void> {
  await db.outbox.update(seq, { estado: 'pendiente', proximo_intento: 0, error: null });
}
