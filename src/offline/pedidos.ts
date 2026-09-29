import type { NovaDB } from './db';
import { encolar } from './outbox';
import { evaluarPedido } from './politicas';
import type { ContextoPedido, LineaEvaluable } from './politicas';
import { construirDerivado, puedeRerutear } from './splitOrders';
import { textoBusquedaCliente } from './busqueda';
import type {
  EstadoPedido,
  LocalCliente,
  LocalDetalle,
  LocalPedido,
  LocalPlantilla,
  LocalVisita,
  ResultadoVisita,
} from './types';

/**
 * Operaciones de escritura del vendedor. Todas siguen el mismo patrón:
 * una única transacción local guarda el cambio Y encola la mutación en la Outbox, de modo que nunca
 * queda un pedido guardado sin su envío pendiente (ni al revés), aunque se cierre la app a mitad.
 */

export interface Sesion {
  vendedor_id: string;
  equipo_id?: string | null;
}

export interface LineaEntrada {
  producto_id: string;
  unidades: number;
  descuento_pct?: number | null;
  notas?: string | null;
}

export interface EntradaPedido {
  cliente_id: string;
  drogueria_id: string;
  lineas: LineaEntrada[];
  observaciones?: string | null;
  condicion_comercial_id?: string | null;
  descuento_pedido_pct?: number | null;
  /** true = enviar a la bandeja del transferencista; false = guardar borrador. */
  enviar: boolean;
}

const ahoraIso = () => new Date().toISOString();

export async function obtenerDeviceId(db: NovaDB): Promise<string> {
  const existente = await db.leerMeta<string | null>('device_id', null);
  if (existente) return existente;
  const nuevo = crypto.randomUUID().slice(0, 8).toUpperCase();
  await db.guardarMeta('device_id', nuevo);
  return nuevo;
}

/** Folio legible mientras el servidor no asigna el correlativo oficial (L-7F3A2C11-0012). */
async function siguienteFolio(db: NovaDB, deviceId: string): Promise<string> {
  const n = (await db.leerMeta<number>('folio_contador', 0)) + 1;
  await db.guardarMeta('folio_contador', n);
  return `L-${deviceId}-${String(n).padStart(4, '0')}`;
}

export const ESTADOS_EDITABLES: EstadoPedido[] = ['borrador', 'enviado_teletransferencia', 'en_revision'];

async function contextoDePedido(
  db: NovaDB,
  base: { cliente_id: string; drogueria_id: string; equipo_id?: string | null; descuento_pedido_pct?: number | null },
  lineas: LineaEntrada[]
): Promise<{ ctx: ContextoPedido; cliente: LocalCliente | undefined }> {
  const [cliente, productos] = await Promise.all([db.clientes.get(base.cliente_id), db.productos.bulkGet(lineas.map((l) => l.producto_id))]);
  const evaluables: LineaEvaluable[] = lineas.map((l, i) => ({
    producto_id: l.producto_id,
    sku: productos[i]?.sku,
    categoria: productos[i]?.categoria ?? null,
    unidades: l.unidades,
    descuento_pct: l.descuento_pct ?? null,
  }));
  return {
    cliente,
    ctx: {
      equipo_id: base.equipo_id,
      drogueria_id: base.drogueria_id,
      segmento: cliente?.segmento,
      cliente_validado: cliente?.estado_validacion === 'activo',
      lineas: evaluables,
      descuento_pedido_pct: base.descuento_pedido_pct ?? null,
    },
  };
}

function detallesDe(pedidoId: string, lineas: LineaEntrada[]): LocalDetalle[] {
  return lineas.map((l, i) => ({
    id: crypto.randomUUID(),
    pedido_id: pedidoId,
    linea: i + 1,
    producto_id: l.producto_id,
    unidades_solicitadas: l.unidades,
    unidades_confirmadas: null,
    unidades_pendientes: l.unidades,
    motivo_ajuste: 'sin_quiebre',
    descuento_pct: l.descuento_pct ?? null,
    notas_linea: l.notas ?? null,
    detalle_origen_id: null,
    remanente_derivado_en: null,
  }));
}

function payloadDetalles(detalles: LocalDetalle[]) {
  return detalles.map((d) => ({
    id: d.id,
    producto_id: d.producto_id,
    unidades_solicitadas: d.unidades_solicitadas,
    descuento_pct: d.descuento_pct ?? null,
    notas_linea: d.notas_linea ?? null,
  }));
}

/** Estado inicial según las políticas cacheadas: fuera de rango o cliente sin validar => Revisión Especial. */
function estadoInicial(enviar: boolean, motivos: number): EstadoPedido {
  if (!enviar) return 'borrador';
  return motivos > 0 ? 'en_revision' : 'enviado_teletransferencia';
}

export async function crearPedidoLocal(db: NovaDB, entrada: EntradaPedido, sesion: Sesion): Promise<LocalPedido> {
  if (entrada.lineas.length === 0) throw new Error('El pedido no tiene productos');
  if (entrada.lineas.some((l) => !(l.unidades > 0))) throw new Error('Todas las cantidades deben ser mayores a cero');

  const reglas = await db.reglas.toArray();
  const { ctx } = await contextoDePedido(db, { ...entrada, equipo_id: sesion.equipo_id }, entrada.lineas);
  const evaluacion = evaluarPedido(reglas, ctx);

  const id = crypto.randomUUID();
  const deviceId = await obtenerDeviceId(db);
  const ahora = ahoraIso();
  const detalles = detallesDe(id, entrada.lineas);

  return db.transaction('rw', [db.pedidos, db.detalles, db.outbox, db.meta], async () => {
    const folio = await siguienteFolio(db, deviceId);
    const estado = estadoInicial(entrada.enviar, evaluacion.motivos.length);
    const pedido: LocalPedido = {
      id,
      correlativo: folio,
      correlativo_provisional: true,
      folio_local: folio,
      parent_pedido_id: null,
      pedido_raiz_id: id,
      sufijo_derivado: null,
      cliente_id: entrada.cliente_id,
      drogueria_id: entrada.drogueria_id,
      vendedor_id: sesion.vendedor_id,
      equipo_id: sesion.equipo_id ?? null,
      estado,
      requiere_revision_especial: evaluacion.requiere_revision_especial,
      motivos_revision: evaluacion.motivos,
      condicion_comercial_id: entrada.condicion_comercial_id ?? null,
      descuento_pedido_pct: entrada.descuento_pedido_pct ?? null,
      observaciones: entrada.observaciones ?? null,
      numero_factura: null,
      device_id: deviceId,
      created_at: ahora,
      updated_at: ahora,
      row_version: 0,
      sync_estado: 'pendiente',
    };
    await db.pedidos.add(pedido);
    await db.detalles.bulkAdd(detalles);
    await encolar(db, {
      tipo: 'pedido.crear',
      entidad_id: id,
      payload: {
        id,
        folio_local: folio,
        cliente_id: pedido.cliente_id,
        drogueria_id: pedido.drogueria_id,
        equipo_id: pedido.equipo_id,
        estado: entrada.enviar ? 'enviado_teletransferencia' : 'borrador',
        observaciones: pedido.observaciones,
        condicion_comercial_id: pedido.condicion_comercial_id,
        descuento_pedido_pct: pedido.descuento_pedido_pct,
        device_id: deviceId,
        creado_en_dispositivo: ahora,
        detalles: payloadDetalles(detalles),
      },
    });
    return pedido;
  });
}

/**
 * Modifica un pedido aún editable (observaciones, condiciones, descuentos, líneas).
 * Si el pedido nunca llegó al servidor, el cambio se funde en su envío pendiente; si ya existe allí,
 * se encola una modificación con la versión conocida (concurrencia optimista).
 */
export async function modificarPedidoLocal(
  db: NovaDB,
  pedidoId: string,
  cambios: Omit<EntradaPedido, 'cliente_id' | 'drogueria_id'>
): Promise<LocalPedido> {
  const actual = await db.pedidos.get(pedidoId);
  if (!actual) throw new Error('Pedido inexistente');
  if (!ESTADOS_EDITABLES.includes(actual.estado)) throw new Error(`El pedido está ${actual.estado} y ya no se puede modificar`);
  if (cambios.lineas.length === 0) throw new Error('El pedido no tiene productos');

  const reglas = await db.reglas.toArray();
  const { ctx } = await contextoDePedido(
    db,
    { cliente_id: actual.cliente_id, drogueria_id: actual.drogueria_id, equipo_id: actual.equipo_id, descuento_pedido_pct: cambios.descuento_pedido_pct },
    cambios.lineas
  );
  const evaluacion = evaluarPedido(reglas, ctx);
  const previos = await db.detalles.where('pedido_id').equals(pedidoId).toArray();
  const idPorProducto = new Map(previos.map((d) => [d.producto_id, d.id]));
  const nuevos = detallesDe(pedidoId, cambios.lineas).map((d) => ({ ...d, id: idPorProducto.get(d.producto_id) ?? d.id }));
  const estado = estadoInicial(cambios.enviar || actual.estado !== 'borrador', evaluacion.motivos.length);

  return db.transaction('rw', [db.pedidos, db.detalles, db.outbox], async () => {
    const pedido: LocalPedido = {
      ...actual,
      estado,
      requiere_revision_especial: evaluacion.requiere_revision_especial,
      motivos_revision: evaluacion.motivos,
      condicion_comercial_id: cambios.condicion_comercial_id ?? null,
      descuento_pedido_pct: cambios.descuento_pedido_pct ?? null,
      observaciones: cambios.observaciones ?? null,
      updated_at: ahoraIso(),
      sync_estado: 'pendiente',
      sync_error: null,
    };
    await db.pedidos.put(pedido);
    await db.detalles.where('pedido_id').equals(pedidoId).delete();
    await db.detalles.bulkAdd(nuevos);

    const pendienteCrear = await db.outbox.where('entidad_id').equals(pedidoId).filter((o) => o.tipo === 'pedido.crear').first();
    if (pendienteCrear) {
      await db.outbox.update(pendienteCrear.seq!, {
        payload: {
          ...pendienteCrear.payload,
          estado: pedido.estado === 'borrador' ? 'borrador' : 'enviado_teletransferencia',
          observaciones: pedido.observaciones,
          condicion_comercial_id: pedido.condicion_comercial_id,
          descuento_pedido_pct: pedido.descuento_pedido_pct,
          detalles: payloadDetalles(nuevos),
        },
      });
    } else {
      await encolar(db, {
        tipo: 'pedido.modificar',
        entidad_id: pedidoId,
        payload: {
          id: pedidoId,
          base_version: actual.row_version,
          estado: pedido.estado === 'borrador' ? 'borrador' : 'enviado_teletransferencia',
          observaciones: pedido.observaciones,
          condicion_comercial_id: pedido.condicion_comercial_id,
          descuento_pedido_pct: pedido.descuento_pedido_pct,
          detalles: payloadDetalles(nuevos),
        },
      });
    }
    return pedido;
  });
}

/**
 * Re-ruteo de un remanente con un toque (regla 2): crea el pedido derivado PED-XXXX-R1 en revisión,
 * con parent_pedido_id y solo las unidades pendientes, y encola su alta en el servidor.
 * El correlativo mostrado es provisional; el servidor asigna el definitivo.
 */
export async function reruteoLocal(db: NovaDB, pedidoId: string, drogueriaDestinoId: string): Promise<LocalPedido> {
  const padre = await db.pedidos.get(pedidoId);
  if (!padre) throw new Error('Pedido inexistente');
  const detallesPadre = await db.detalles.where('pedido_id').equals(pedidoId).toArray();
  const problema = puedeRerutear(padre, drogueriaDestinoId, detallesPadre);
  if (problema) throw new Error(problema);

  const raizId = padre.pedido_raiz_id ?? padre.id;
  const [raiz, cadena, deviceId] = await Promise.all([
    db.pedidos.get(raizId),
    db.pedidos.where('pedido_raiz_id').equals(raizId).toArray(),
    obtenerDeviceId(db),
  ]);
  if (!raiz) throw new Error('No se encontró el pedido original de la cadena');

  return db.transaction('rw', [db.pedidos, db.detalles, db.outbox, db.meta], async () => {
    const nuevoId = crypto.randomUUID();
    const { pedido, detalles, detallesPadreActualizados } = construirDerivado({
      padre,
      raiz,
      cadena,
      detallesPadre,
      drogueriaDestinoId,
      nuevoId,
      folioLocal: await siguienteFolio(db, deviceId),
      deviceId,
      ahora: ahoraIso(),
      nuevosIdsDetalle: () => crypto.randomUUID(),
    });
    await db.pedidos.add(pedido);
    await db.detalles.bulkAdd(detalles);
    await db.detalles.bulkPut(detallesPadreActualizados);
    await encolar(db, {
      tipo: 'pedido.rerutear',
      entidad_id: padre.id,
      // Si el padre nunca se sincronizó, esperar a que su alta llegue primero.
      depende_de: padre.id,
      payload: { p_pedido: padre.id, p_drogueria_destino: drogueriaDestinoId, p_nuevo_id: nuevoId },
    });
    return pedido;
  });
}

export interface EntradaProspecto {
  razon_social: string;
  nombre_comercial?: string;
  rif?: string;
  direccion?: string;
  telefono?: string;
  brick?: string;
  lat?: number | null;
  lon?: number | null;
  frecuencia_dias?: number | null;
}

/** Alta de una farmacia en campo: queda como prospecto_pendiente hasta que la mesa valide RIF y homologación. */
export async function crearProspectoLocal(db: NovaDB, datos: EntradaProspecto): Promise<LocalCliente> {
  if (!datos.razon_social.trim()) throw new Error('La razón social es obligatoria');
  const id = crypto.randomUUID();
  const cliente: LocalCliente = {
    id,
    codigo_interno: null,
    razon_social: datos.razon_social.trim(),
    nombre_comercial: (datos.nombre_comercial ?? datos.razon_social).trim(),
    rif: datos.rif?.trim() || null,
    brick: datos.brick ?? null,
    direccion: datos.direccion ?? null,
    telefono: datos.telefono ?? null,
    lat: datos.lat ?? null,
    lon: datos.lon ?? null,
    frecuencia_dias: datos.frecuencia_dias ?? null,
    estado_validacion: 'prospecto_pendiente',
    segmento: 'estandar',
    sync_estado: 'pendiente',
    busqueda: '',
  };
  cliente.busqueda = textoBusquedaCliente(cliente);
  await db.transaction('rw', [db.clientes, db.outbox], async () => {
    await db.clientes.add(cliente);
    await encolar(db, {
      tipo: 'prospecto.crear',
      entidad_id: id,
      payload: {
        id,
        razon_social: cliente.razon_social,
        nombre_comercial: cliente.nombre_comercial,
        rif: cliente.rif,
        direccion: cliente.direccion,
        telefono: cliente.telefono,
        brick: cliente.brick,
        frecuencia_dias: cliente.frecuencia_dias,
        ...(cliente.lat != null && cliente.lon != null ? { lat: cliente.lat, lon: cliente.lon } : {}),
      },
    });
  });
  return cliente;
}

export interface EntradaVisita {
  cliente_id: string;
  lat?: number | null;
  lon?: number | null;
  precision_gps_m?: number | null;
  resultado?: ResultadoVisita | null;
  pedido_id?: string | null;
  notas?: string | null;
}

/** Check-in de visita. El servidor calcula la distancia real y si está dentro del radio de la farmacia. */
export async function registrarVisitaLocal(db: NovaDB, datos: EntradaVisita, sesion: Sesion): Promise<LocalVisita> {
  const cliente = await db.clientes.get(datos.cliente_id);
  const visita: LocalVisita = {
    id: crypto.randomUUID(),
    cliente_id: datos.cliente_id,
    vendedor_id: sesion.vendedor_id,
    checkin_en: ahoraIso(),
    lat: datos.lat ?? null,
    lon: datos.lon ?? null,
    precision_gps_m: datos.precision_gps_m ?? null,
    resultado: datos.resultado ?? null,
    pedido_id: datos.pedido_id ?? null,
    notas: datos.notas ?? null,
    // Estimación local (Haversine) para avisar al instante; el valor oficial llega en el ack.
    distancia_metros:
      cliente?.lat != null && cliente?.lon != null && datos.lat != null && datos.lon != null
        ? Math.round(distanciaMetros(cliente.lat, cliente.lon, datos.lat, datos.lon))
        : null,
    dentro_de_radio: null,
    sync_estado: 'pendiente',
  };
  visita.dentro_de_radio = visita.distancia_metros == null ? null : visita.distancia_metros <= 100;
  await db.transaction('rw', [db.visitas, db.outbox], async () => {
    await db.visitas.add(visita);
    await encolar(db, {
      tipo: 'visita.registrar',
      entidad_id: visita.id,
      payload: {
        id: visita.id,
        cliente_id: visita.cliente_id,
        checkin_en: visita.checkin_en,
        precision_gps_m: visita.precision_gps_m,
        resultado: visita.resultado,
        pedido_id: visita.pedido_id,
        notas: visita.notas,
        ...(datos.lat != null && datos.lon != null ? { lat: datos.lat, lon: datos.lon } : {}),
      },
    });
  });
  return visita;
}

/** Distancia entre dos coordenadas (fórmula de Haversine), en metros. */
export function distanciaMetros(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Plantilla de reposición: guarda un carrito recurrente para duplicarlo en un toque. */
export async function guardarPlantillaLocal(
  db: NovaDB,
  datos: { nombre: string; cliente_id?: string | null; drogueria_id?: string | null; items: { producto_id: string; unidades: number }[] },
  sesion: Sesion
): Promise<LocalPlantilla> {
  if (datos.items.length === 0) throw new Error('La plantilla no tiene productos');
  const plantilla: LocalPlantilla = {
    id: crypto.randomUUID(),
    vendedor_id: sesion.vendedor_id,
    cliente_id: datos.cliente_id ?? null,
    drogueria_id: datos.drogueria_id ?? null,
    nombre: datos.nombre.trim() || 'Plantilla',
    items: datos.items,
    sync_estado: 'pendiente',
  };
  await db.transaction('rw', [db.plantillas, db.outbox], async () => {
    await db.plantillas.add(plantilla);
    await encolar(db, {
      tipo: 'plantilla.guardar',
      entidad_id: plantilla.id,
      payload: { id: plantilla.id, nombre: plantilla.nombre, cliente_id: plantilla.cliente_id, drogueria_id: plantilla.drogueria_id, items: plantilla.items },
    });
  });
  return plantilla;
}
