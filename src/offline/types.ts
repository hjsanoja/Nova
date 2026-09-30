// Tipos de la base local (IndexedDB). Reflejan las tablas de src/sql/nova_produccion_v3.sql, más los campos
// de control de sincronización que solo existen en el dispositivo (sync_estado, correlativo_provisional).

export type EstadoPedido =
  | 'borrador'
  | 'enviado_teletransferencia'
  | 'en_revision'
  | 'en_proceso'
  | 'procesado_parcial'
  | 'procesado_total'
  | 'facturado'
  | 'rechazado'
  | 'cancelado';

export type EstadoValidacionCliente = 'prospecto_pendiente' | 'activo' | 'inactivo';
export type SegmentoCliente = 'estandar' | 'recurrente' | 'vip';
export type MotivoAjuste =
  | 'sin_quiebre'
  | 'quiebre_stock_drogueria'
  | 'limite_credito'
  | 'producto_descontinuado'
  | 'ajuste_comercial'
  | 'otro';

/** Estado de sincronización de una fila creada o editada en el dispositivo. */
export type EstadoSync = 'sincronizado' | 'pendiente' | 'error' | 'conflicto';

export type TipoViolacion = 'descuento_linea_excedido' | 'descuento_pedido_excedido' | 'cliente_no_validado';

export interface Violacion {
  tipo: TipoViolacion;
  producto_id?: string;
  sku?: string;
  detalle_id?: string;
  descuento?: number;
  maximo?: number;
}

export interface LocalProducto {
  id: string;
  sku: string;
  ean13?: string | null;
  nombre_comercial: string;
  presentacion?: string | null;
  principio_activo?: string | null;
  categoria?: string | null;
  laboratorio?: string | null;
  equipo_id?: string | null;
  empaque_minimo: number;
  es_prioritario: boolean;
  activo: boolean;
  /** Foto del producto (URL); sin foto se muestran las iniciales. */
  foto_url?: string | null;
  updated_at?: string;
  /** Palabras normalizadas (multiEntry): búsqueda por prefijo sin recorrer el catálogo. */
  tokens: string[];
}

export interface LocalCliente {
  id: string;
  codigo_interno?: string | null;
  razon_social: string;
  nombre_comercial: string;
  rif?: string | null;
  brick?: string | null;
  municipio?: string | null;
  bandera?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  lat?: number | null;
  lon?: number | null;
  frecuencia_dias?: number | null;
  estado_validacion: EstadoValidacionCliente;
  segmento: SegmentoCliente;
  updated_at?: string;
  sync_estado: EstadoSync;
  /** Texto normalizado para filtrar en memoria. */
  busqueda: string;
}

export type OrigenColumnaExport =
  | 'codigo_cliente_drogueria'
  | 'rif_cliente'
  | 'nombre_cliente'
  | 'codigo_producto_drogueria'
  | 'descripcion_producto_drogueria'
  | 'ean'
  | 'sku_interno'
  | 'unidades_confirmadas'
  | 'unidades_solicitadas'
  | 'correlativo'
  | 'fecha_pedido'
  | 'observaciones'
  | 'linea'
  | 'precio_base'
  | 'presentacion_producto'
  | 'descuento_linea'
  | 'descuento_pedido'
  | 'descuento_total'
  | 'constante';

export interface ColumnaExport {
  encabezado: string;
  origen: OrigenColumnaExport;
  formato?: 'texto' | 'entero' | 'decimal' | 'fecha';
  /** Solo origen "constante". */
  valor?: string;
  /** Ancho fijo (TXT posicional). */
  ancho?: number;
  relleno?: string;
  alineacion?: 'izq' | 'der';
  max_largo?: number;
}

export interface FormatoExport {
  formato: 'csv' | 'txt';
  delimitador: ';' | ',' | '|' | '\t' | '';
  encabezado: boolean;
  entrecomillado: 'siempre' | 'solo_texto' | 'nunca';
  salto_linea: '\n' | '\r\n';
  codificacion: 'utf-8' | 'iso-8859-1' | 'windows-1252';
  bom?: boolean;
  extension: string;
  decimal?: 'punto' | 'coma';
  formato_fecha?: 'YYYYMMDD' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  nombre_archivo?: string;
  columnas: ColumnaExport[];
}

export interface LocalDrogueria {
  id: string;
  codigo: string;
  nombre: string;
  formato_export: FormatoExport;
  activo: boolean;
}

/** Un producto puede tener varios códigos en una droguería; `es_principal` marca el que se escribe en el pedido. */
export interface LocalMapProducto {
  id: string;
  drogueria_id: string;
  producto_id: string;
  codigo_drogueria: string;
  descripcion_drogueria?: string | null;
  es_principal?: boolean;
}

/** Una farmacia puede tener varias cuentas en una droguería (o solo un nombre, sin código); una es la principal. */
export interface LocalMapCliente {
  id: string;
  drogueria_id: string;
  cliente_id: string;
  codigo_cuenta: string | null;
  nombre_en_drogueria?: string | null;
  es_principal?: boolean;
}

/** Compras de una farmacia por producto y mes, consolidadas desde los reportes de las droguerías (fact_compras_mensual). */
export interface LocalCompraMensual {
  id: string;
  cliente_id: string;
  producto_id: string;
  /** Primer día del mes (YYYY-MM-DD). */
  periodo: string;
  unidades: number;
  n_compras: number;
  ultima_compra: string;
}

export interface LocalPedido {
  id: string;
  /** PED-1045 / PED-1045-R1 cuando lo asignó el servidor; folio local mientras correlativo_provisional. */
  correlativo: string;
  correlativo_provisional: boolean;
  folio_local: string;
  parent_pedido_id?: string | null;
  pedido_raiz_id?: string | null;
  sufijo_derivado?: number | null;
  cliente_id: string;
  drogueria_id: string;
  vendedor_id: string;
  equipo_id?: string | null;
  estado: EstadoPedido;
  requiere_revision_especial: boolean;
  motivos_revision: Violacion[];
  condicion_comercial_id?: string | null;
  descuento_pedido_pct?: number | null;
  observaciones?: string | null;
  numero_factura?: string | null;
  device_id: string;
  created_at: string;
  updated_at: string;
  /** Versión del servidor conocida: base de la concurrencia optimista. 0 = nunca sincronizado. */
  row_version: number;
  sync_estado: EstadoSync;
  sync_error?: string | null;
}

export interface LocalDetalle {
  id: string;
  pedido_id: string;
  linea: number;
  producto_id: string;
  unidades_solicitadas: number;
  unidades_confirmadas: number | null;
  unidades_pendientes: number;
  motivo_ajuste: MotivoAjuste;
  descuento_pct?: number | null;
  notas_linea?: string | null;
  detalle_origen_id?: string | null;
  remanente_derivado_en?: string | null;
}

export type ResultadoVisita = 'pedido_tomado' | 'sin_pedido' | 'cliente_cerrado' | 'reprogramada';

export interface LocalVisita {
  id: string;
  cliente_id: string;
  vendedor_id: string;
  checkin_en: string;
  lat?: number | null;
  lon?: number | null;
  precision_gps_m?: number | null;
  checkout_en?: string | null;
  distancia_metros?: number | null;
  dentro_de_radio?: boolean | null;
  resultado?: ResultadoVisita | null;
  pedido_id?: string | null;
  notas?: string | null;
  sync_estado: EstadoSync;
}

export interface LocalNotificacion {
  id: string;
  usuario_id: string;
  tipo: string;
  titulo: string;
  cuerpo?: string | null;
  pedido_id?: string | null;
  leida: boolean;
  created_at: string;
}

/** Plantilla de pedido: lo que una farmacia pide siempre (se carga en su carrito con un toque o por voz). */
export interface LocalPlantilla {
  id: string;
  vendedor_id: string;
  cliente_id: string;
  drogueria_id: string | null;
  nombre: string;
  lineas: { producto_id: string; unidades: number }[];
  updated_at: string;
  sync_estado: 'sincronizado' | 'pendiente' | 'error';
}

export type TipoComunicado = 'anuncio' | 'descuento' | 'estrategia' | 'alerta';

/** Anuncio de la gerencia (solo llegan al dispositivo los que corresponden a quien inició sesión). */
export interface LocalComunicado {
  id: string;
  titulo: string;
  mensaje: string;
  tipo: TipoComunicado;
  roles: string[];
  equipos: string[];
  estados: string[];
  ciudades: string[];
  regiones: string[];
  vigente_desde: string;
  vigente_hasta: string | null;
  /** Calculado por el servidor: el comunicado va dirigido a este usuario (la gerencia descarga todos). */
  para_mi: boolean;
  creado_por: string | null;
  created_at: string;
  updated_at: string;
}

export type IndicadorMeta = 'unidades' | 'pedidos' | 'farmacias';

/** Meta del mes por representante, farmacia y/o droguería (cualquier combinación). */
export interface LocalMeta {
  id: string;
  /** Primer día del mes (YYYY-MM-DD). */
  periodo: string;
  vendedor_id: string | null;
  cliente_id: string | null;
  drogueria_id: string | null;
  indicador: IndicadorMeta;
  objetivo: number;
  updated_at: string;
}

export type TipoOutbox =
  | 'prospecto.crear'
  | 'pedido.crear'
  | 'pedido.modificar'
  | 'pedido.rerutear'
  | 'visita.registrar'
  | 'farmacia.codigo'
  | 'plantilla.guardar';

export type EstadoOutbox = 'pendiente' | 'error' | 'conflicto';

/** Mutación pendiente de enviar. Se conserva hasta que el servidor la confirma. */
export interface OutboxItem {
  seq?: number;
  id: string;
  tipo: TipoOutbox;
  /** Entidad afectada; los items de una misma entidad se envían en orden. */
  entidad_id: string;
  /** Entidad de la que depende (p. ej. el pedido padre de un re-ruteo). */
  depende_de?: string | null;
  payload: Record<string, unknown>;
  estado: EstadoOutbox;
  intentos: number;
  proximo_intento: number;
  error?: string | null;
  created_at: number;
}

export interface MetaEntrada {
  clave: string;
  valor: unknown;
}
