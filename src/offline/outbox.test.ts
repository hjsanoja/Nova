import { beforeEach, describe, expect, it } from 'vitest';
import type { NovaDB } from './db';
import { descartarCambiosLocales, esperaExponencial, procesarOutbox, reintentarAhora, reintentarItem } from './outbox';
import { crearPedidoLocal, crearProspectoLocal, modificarPedidoLocal, registrarVisitaLocal, reruteoLocal } from './pedidos';
import { ErrorRemoto } from './remoto';
import { REGLA_BASE, REGLA_MIX, SESION, cliente, crearDbTemporal, crearRemotoFalso, producto } from './testing/utiles';
import type { RemotoFalso } from './testing/utiles';

let db: NovaDB;
let remoto: RemotoFalso;

beforeEach(async () => {
  db = crearDbTemporal();
  remoto = crearRemotoFalso();
  await db.productos.bulkPut([producto('1', 'Losartán'), producto('2', 'Atorvastatina'), producto('3', 'Omeprazol', { categoria: 'gastro' })]);
  await db.clientes.bulkPut([cliente('c1'), cliente('cp', { estado_validacion: 'prospecto_pendiente' })]);
  await db.reglas.bulkPut([REGLA_BASE, REGLA_MIX]);
});

const lineas3 = [{ producto_id: '1', unidades: 10, descuento_pct: 10 }, { producto_id: '2', unidades: 8 }, { producto_id: '3', unidades: 6 }];
const nuevo = (extra = {}) => crearPedidoLocal(db, { cliente_id: 'c1', drogueria_id: 'A', lineas: lineas3, enviar: true, ...extra }, SESION);

describe('captura sin conexión', () => {
  it('guarda el pedido y su envío pendiente en una sola transacción, con folio local y UUID de cliente', async () => {
    const p = await nuevo();
    expect(p.correlativo_provisional).toBe(true);
    expect(p.correlativo).toMatch(/^L-[0-9A-F]{8}-0001$/);
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(p.estado).toBe('enviado_teletransferencia'); // 10 % con 3 SKUs cabe en el tope de 12 %
    expect(await db.outbox.count()).toBe(1);
    expect(await db.detalles.where('pedido_id').equals(p.id).count()).toBe(3);
  });

  it('un descuento fuera de rango o un prospecto lo dejan en Revisión Especial al instante', async () => {
    const fuera = await crearPedidoLocal(db, { cliente_id: 'c1', drogueria_id: 'A', lineas: [{ producto_id: '1', unidades: 4, descuento_pct: 10 }], enviar: true }, SESION);
    expect(fuera.estado).toBe('en_revision');
    expect(fuera.requiere_revision_especial).toBe(true);
    const prospecto = await crearPedidoLocal(db, { cliente_id: 'cp', drogueria_id: 'A', lineas: lineas3, enviar: true }, SESION);
    expect(prospecto.estado).toBe('en_revision');
    expect(prospecto.requiere_revision_especial).toBe(false);
    expect(prospecto.motivos_revision[0].tipo).toBe('cliente_no_validado');
  });

  it('rechaza pedidos vacíos o con cantidades inválidas', async () => {
    await expect(crearPedidoLocal(db, { cliente_id: 'c1', drogueria_id: 'A', lineas: [], enviar: true }, SESION)).rejects.toThrow();
    await expect(crearPedidoLocal(db, { cliente_id: 'c1', drogueria_id: 'A', lineas: [{ producto_id: '1', unidades: 0 }], enviar: true }, SESION)).rejects.toThrow();
  });

  it('modificar un pedido que aún no llegó al servidor funde el cambio en su envío pendiente', async () => {
    const p = await nuevo();
    await modificarPedidoLocal(db, p.id, { lineas: [{ producto_id: '1', unidades: 20 }], enviar: true, observaciones: 'cambio' });
    const items = await db.outbox.toArray();
    expect(items).toHaveLength(1);
    expect(items[0].tipo).toBe('pedido.crear');
    expect((items[0].payload.detalles as unknown[]).length).toBe(1);
    expect(items[0].payload.observaciones).toBe('cambio');
  });

  it('modificar uno ya sincronizado encola una modificación con la versión conocida', async () => {
    const p = await nuevo();
    await procesarOutbox(db, remoto);
    await modificarPedidoLocal(db, p.id, { lineas: [{ producto_id: '1', unidades: 20 }], enviar: true });
    const [item] = await db.outbox.toArray();
    expect(item.tipo).toBe('pedido.modificar');
    expect(item.payload.base_version).toBe(1);
  });
});

describe('cola de sincronización', () => {
  it('envía en orden, adopta el correlativo oficial y vacía la cola', async () => {
    const a = await nuevo();
    const b = await nuevo();
    const r = await procesarOutbox(db, remoto);
    expect(r).toEqual({ enviados: 2, errores: 0, conflictos: 0 });
    expect(remoto.llamadas.map((l) => l.payload.id)).toEqual([a.id, b.id]);
    const sincronizado = await db.pedidos.get(a.id);
    expect(sincronizado).toMatchObject({ correlativo: 'PED-1001', correlativo_provisional: false, sync_estado: 'sincronizado', row_version: 1 });
    expect(await db.outbox.count()).toBe(0);
  });

  it('sin red conserva los cambios, espera con backoff y reanuda al reconectar', async () => {
    const p = await nuevo();
    let caido = true;
    const original = remoto.comportamiento;
    remoto.comportamiento = (t, pl, n) => (caido ? new ErrorRemoto('red', 'Failed to fetch') : original(t, pl, n));
    const t0 = 1_000_000;
    const r1 = await procesarOutbox(db, remoto, () => t0);
    expect(r1.detenidoPor).toBe('red');
    const [item] = await db.outbox.toArray();
    expect(item.intentos).toBe(1);
    expect(item.proximo_intento).toBeGreaterThan(t0);
    expect((await db.pedidos.get(p.id))!.sync_estado).toBe('pendiente');

    // Antes de que venza la espera no se reintenta...
    expect((await procesarOutbox(db, remoto, () => t0 + 10)).enviados).toBe(0);
    expect(remoto.llamadas).toHaveLength(1);
    // ...pero al recuperar la red se ignora el backoff.
    caido = false;
    await reintentarAhora(db);
    expect((await procesarOutbox(db, remoto, () => t0 + 20)).enviados).toBe(1);
    expect(await db.outbox.count()).toBe(0);
  });

  it('el backoff crece hasta 5 minutos con jitter', () => {
    expect(esperaExponencial(1, () => 1)).toBe(4000);
    expect(esperaExponencial(3, () => 0)).toBe(8000);
    expect(esperaExponencial(20, () => 1)).toBe(300000);
  });

  it('reintentar es idempotente: el servidor devuelve el mismo correlativo', async () => {
    const p = await nuevo();
    await procesarOutbox(db, remoto);
    // Simula una respuesta perdida: la mutación vuelve a quedar pendiente y se reenvía.
    await db.pedidos.update(p.id, { correlativo: p.folio_local, correlativo_provisional: true, sync_estado: 'pendiente' });
    await db.outbox.add({ id: 'x', tipo: 'pedido.crear', entidad_id: p.id, payload: remoto.llamadas[0].payload, estado: 'pendiente', intentos: 0, proximo_intento: 0, created_at: 0 });
    await procesarOutbox(db, remoto);
    expect((await db.pedidos.get(p.id))!.correlativo).toBe('PED-1001');
  });

  it('un rechazo permanente marca el error y no bloquea a otros pedidos', async () => {
    const malo = await nuevo();
    const bueno = await nuevo();
    const original = remoto.comportamiento;
    remoto.comportamiento = (t, pl, n) => (pl.id === malo.id ? new ErrorRemoto('permanente', 'violates foreign key', '23503') : original(t, pl, n));
    const r = await procesarOutbox(db, remoto);
    expect(r).toMatchObject({ enviados: 1, errores: 1 });
    expect(await db.pedidos.get(malo.id)).toMatchObject({ sync_estado: 'error', sync_error: 'violates foreign key' });
    expect((await db.pedidos.get(bueno.id))!.sync_estado).toBe('sincronizado');
    const [enError] = await db.outbox.toArray();
    expect(enError.estado).toBe('error');
    // Tras corregir el dato se puede reintentar a mano.
    remoto.comportamiento = original;
    await reintentarItem(db, enError.seq!);
    expect((await procesarOutbox(db, remoto)).enviados).toBe(1);
  });

  it('una sesión vencida pausa la cola sin perder nada', async () => {
    await nuevo();
    remoto.comportamiento = () => new ErrorRemoto('auth', 'JWT expired');
    expect((await procesarOutbox(db, remoto)).detenidoPor).toBe('auth');
    expect(await db.outbox.count()).toBe(1);
  });

  it('un conflicto de versión queda marcado y se puede descartar volviendo al servidor', async () => {
    const p = await nuevo();
    await procesarOutbox(db, remoto);
    await modificarPedidoLocal(db, p.id, { lineas: [{ producto_id: '1', unidades: 20 }], enviar: true });
    remoto.comportamiento = () => ({ conflicto: true, row_version: 3, estado: 'enviado_teletransferencia', motivo: 'version_desactualizada' });
    expect((await procesarOutbox(db, remoto)).conflictos).toBe(1);
    expect((await db.pedidos.get(p.id))!.sync_estado).toBe('conflicto');
    remoto.traerPorId = async () => ({ id: p.id, correlativo: 'PED-1001', estado: 'enviado_teletransferencia', observaciones: 'del servidor', row_version: 3 });
    await descartarCambiosLocales(db, remoto, p.id);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.pedidos.get(p.id)).toMatchObject({ sync_estado: 'sincronizado', row_version: 3, observaciones: 'del servidor' });
  });
});

describe('split orders offline', () => {
  async function pedidoParcialSincronizado() {
    const p = await nuevo();
    await procesarOutbox(db, remoto);
    // La mesa confirmó parcialmente (llega por la descarga del servidor).
    const dets = await db.detalles.where('pedido_id').equals(p.id).sortBy('linea');
    await db.transaction('rw', [db.detalles, db.pedidos], async () => {
      await db.detalles.update(dets[0].id, { unidades_confirmadas: 10, unidades_pendientes: 0 });
      await db.detalles.update(dets[1].id, { unidades_confirmadas: 3, unidades_pendientes: 5 });
      await db.detalles.update(dets[2].id, { unidades_confirmadas: 0, unidades_pendientes: 6 });
      await db.pedidos.update(p.id, { estado: 'procesado_parcial' });
    });
    return p;
  }

  it('re-rutea el remanente con un toque y obtiene PED-1001-R1 del servidor', async () => {
    const p = await pedidoParcialSincronizado();
    const hijo = await reruteoLocal(db, p.id, 'B');
    expect(hijo).toMatchObject({ correlativo: 'PED-1001-R1', correlativo_provisional: true, estado: 'en_revision', parent_pedido_id: p.id, drogueria_id: 'B' });
    const lineas = await db.detalles.where('pedido_id').equals(hijo.id).toArray();
    expect(lineas.map((l) => l.unidades_solicitadas).sort()).toEqual([5, 6]);
    // No se puede derivar dos veces lo mismo.
    await expect(reruteoLocal(db, p.id, 'C')).rejects.toThrow(/remanente/);

    await procesarOutbox(db, remoto);
    const ack = await db.pedidos.get(hijo.id);
    expect(ack).toMatchObject({ correlativo: 'PED-1001-R1', correlativo_provisional: false, sync_estado: 'sincronizado' });
    // Las líneas provisionales se reemplazan por las del servidor.
    expect((await db.detalles.where('pedido_id').equals(hijo.id).toArray()).map((d) => d.id)).toEqual([`srv-${hijo.id}-1`]);
  });

  it('si el padre nunca llegó al servidor, el re-ruteo espera a su alta (dependencia)', async () => {
    const p = await nuevo();
    await db.pedidos.update(p.id, { estado: 'procesado_parcial' });
    await db.detalles.where('pedido_id').equals(p.id).modify({ unidades_confirmadas: 0, unidades_pendientes: 5 });
    await reruteoLocal(db, p.id, 'B');
    // El alta del padre falla por red: el re-ruteo no debe enviarse antes.
    remoto.comportamiento = () => new ErrorRemoto('red', 'offline');
    await procesarOutbox(db, remoto);
    expect(remoto.llamadas.map((l) => l.tipo)).toEqual(['pedido.crear']);
  });

  it('si el servidor rechaza el re-ruteo se deshace el pedido derivado', async () => {
    const p = await pedidoParcialSincronizado();
    const hijo = await reruteoLocal(db, p.id, 'B');
    remoto.comportamiento = (t) => (t === 'pedido.rerutear' ? new ErrorRemoto('permanente', 'Solo un pedido procesado parcialmente puede re-rutearse', '22023') : { id: 'x' });
    await procesarOutbox(db, remoto);
    expect(await db.pedidos.get(hijo.id)).toBeUndefined();
    expect((await db.detalles.where('pedido_id').equals(p.id).toArray()).every((d) => !d.remanente_derivado_en)).toBe(true);
    expect((await db.pedidos.get(p.id))!.sync_estado).toBe('error');
  });
});

describe('prospectos y visitas', () => {
  it('crea la farmacia como prospecto_pendiente y la sincroniza', async () => {
    const c = await crearProspectoLocal(db, { razon_social: 'Farmacia Nueva', rif: 'J-1', lat: 10.5, lon: -66.85 });
    expect(c.estado_validacion).toBe('prospecto_pendiente');
    expect(await db.outbox.count()).toBe(1);
    await procesarOutbox(db, remoto);
    expect((await db.clientes.get(c.id))!.sync_estado).toBe('sincronizado');
  });

  it('estima la distancia al check-in en el dispositivo y adopta la oficial del servidor', async () => {
    await db.clientes.update('c1', { lat: 10.5, lon: -66.85 });
    const v = await registrarVisitaLocal(db, { cliente_id: 'c1', lat: 10.5003, lon: -66.85 }, SESION);
    expect(v.distancia_metros).toBeGreaterThan(30);
    expect(v.distancia_metros).toBeLessThan(36);
    expect(v.dentro_de_radio).toBe(true);
    await procesarOutbox(db, remoto);
    expect(await db.visitas.get(v.id)).toMatchObject({ distancia_metros: 42, sync_estado: 'sincronizado' });
  });
});
