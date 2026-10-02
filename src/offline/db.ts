import Dexie from 'dexie';
import type { Table } from 'dexie';
import type {
  LocalActividad,
  LocalCiclo,
  LocalCliente,
  LocalComunicado,
  LocalDetalle,
  LocalCompraMensual,
  LocalDrogueria,
  LocalFeriado,
  LocalMapCliente,
  LocalMapProducto,
  LocalMeta,
  LocalMedico,
  LocalMotivo,
  LocalNotificacion,
  LocalPedido,
  LocalPlantilla,
  LocalProducto,
  LocalTarea,
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
  plantillas!: Table<LocalPlantilla, string>;
  comunicados!: Table<LocalComunicado, string>;
  metas!: Table<LocalMeta, string>;
  medicos!: Table<LocalMedico, string>;
  tareas!: Table<LocalTarea, string>;
  ciclos!: Table<LocalCiclo, string>;
  feriados!: Table<LocalFeriado, string>;
  motivos!: Table<LocalMotivo, string>;
  actividades!: Table<LocalActividad, string>;
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
    // v4: plantillas de pedido (nuevas, por farmacia), comunicados de la gerencia y metas del mes.
    this.version(4).stores({
      plantillas: 'id, cliente_id, vendedor_id, updated_at',
      comunicados: 'id, updated_at',
      metas: 'id, periodo, vendedor_id, updated_at',
    });
    // v5 (Fase 3): médicos de la cartera, tareas y visitas a médicos.
    this.version(5).stores({
      medicos: 'id, vendedor_id, updated_at',
      tareas: 'id, vendedor_id, cliente_id, medico_id, vence_en, estado, sync_estado, updated_at',
      visitas: 'id, cliente_id, medico_id, vendedor_id, checkin_en, sync_estado',
    });
    // v6 (Fase 4): ciclos por equipo y feriados; las metas pueden ser de un ciclo.
    this.version(6).stores({
      ciclos: 'id, equipo_id, inicio, fin, updated_at',
      feriados: 'id, fecha, updated_at',
      metas: 'id, periodo, ciclo_id, vendedor_id, updated_at',
    });
    // v7 (Fase 5): otras actividades y días libres, y sus motivos.
    this.version(7).stores({
      motivos: 'id, updated_at',
      actividades: 'id, vendedor_id, estado, desde, sync_estado, updated_at',
    });
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
