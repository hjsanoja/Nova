import Dexie from 'dexie';
import type { Table } from 'dexie';
import type {
  LocalCliente,
  LocalDetalle,
  LocalCompraMensual,
  LocalDrogueria,
  LocalMapCliente,
  LocalMapProducto,
  LocalNotificacion,
  LocalPedido,
  LocalProducto,
  LocalVisita,
  MetaEntrada,
  OutboxItem,
} from './types';
import type { ReglaComercial } from './politicas';

/**
 * Base local de NOVA (IndexedDB vía Dexie). Contiene lo necesario para trabajar sin conexión:
 * catálogo, clientes asignados, droguerías y homologaciones, reglas comerciales, historial reciente,
 * y la cola de mutaciones (outbox) pendientes de sincronizar.
 */
export class NovaDB extends Dexie {
  productos!: Table<LocalProducto, string>;
  clientes!: Table<LocalCliente, string>;
  droguerias!: Table<LocalDrogueria, string>;
  mapProductos!: Table<LocalMapProducto, string>;
  mapClientes!: Table<LocalMapCliente, string>;
  comprasMensual!: Table<LocalCompraMensual, string>;
  reglas!: Table<ReglaComercial, string>;
  pedidos!: Table<LocalPedido, string>;
  detalles!: Table<LocalDetalle, string>;
  visitas!: Table<LocalVisita, string>;
  notificaciones!: Table<LocalNotificacion, string>;
  outbox!: Table<OutboxItem, number>;
  meta!: Table<MetaEntrada, string>;

  constructor(nombre = 'nova-offline') {
    super(nombre);
    this.version(1).stores({
      // `*tokens`: índice multiEntry para búsqueda por prefijo. ean13/sku: lectura de código de barras.
      productos: 'id, sku, ean13, *tokens, categoria, updated_at',
      clientes: 'id, codigo_interno, estado_validacion, sync_estado, updated_at',
      droguerias: 'id, codigo',
      mapProductos: 'id, [drogueria_id+producto_id], producto_id',
      mapClientes: 'id, [drogueria_id+cliente_id], cliente_id',
      reglas: 'id, activo',
      pedidos:
        'id, correlativo, parent_pedido_id, pedido_raiz_id, cliente_id, estado, sync_estado, created_at, [cliente_id+created_at]',
      detalles: 'id, pedido_id, [pedido_id+producto_id], producto_id, remanente_derivado_en',
      visitas: 'id, cliente_id, vendedor_id, checkin_en, sync_estado',
      plantillas: 'id, cliente_id, vendedor_id',
      notificaciones: 'id, leida, created_at',
      // ++seq conserva el orden de llegada (FIFO); entidad_id agrupa las mutaciones de un mismo pedido.
      outbox: '++seq, id, estado, entidad_id, tipo, proximo_intento',
      meta: 'clave',
    });
    // v2: consolidado mensual de compras (historial de las droguerías) para el pedido sugerido.
    this.version(2).stores({
      comprasMensual: 'id, [cliente_id+periodo], cliente_id, producto_id',
    });
    // v3: se retiran las plantillas de reposición (las reemplazan los carritos guardados y el pedido sugerido).
    this.version(3).stores({ plantillas: null });
  }

  async leerMeta<T>(clave: string, defecto: T): Promise<T> {
    const fila = await this.meta.get(clave);
    return fila ? (fila.valor as T) : defecto;
  }

  async guardarMeta(clave: string, valor: unknown): Promise<void> {
    await this.meta.put({ clave, valor });
  }
}

let instancia: NovaDB | null = null;

/** Base compartida de la aplicación (una por origen). */
export function obtenerDb(): NovaDB {
  if (!instancia) instancia = new NovaDB();
  return instancia;
}
