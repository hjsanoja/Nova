export type RolUsuario = 'vendedor' | 'teletransferencista' | 'gerente' | 'admin';
export type EquipoVentas = 'La Sante' | 'Comercial' | 'OTC' | 'TODOS' | 'A' | 'B' | 'AMBOS';
export type EstadoPedido = 
  | 'borrador' 
  | 'enviado_teletransferencia' 
  | 'en_proceso' 
  | 'facturado'
  | 'procesado_total' 
  | 'procesado_parcial' 
  | 'rechazado';

export type MotivoAjuste = 
  | 'sin_quiebre' 
  | 'quiebre_stock_drogueria' 
  | 'limite_credito' 
  | 'producto_descontinuado' 
  | 'ajuste_comercial' 
  | 'otro';

export type ClasificacionCliente = 'A' | 'B' | 'C';

export interface Usuario {
  id: string; // UUID auth.users
  email: string;
  nombre_completo: string;
  rol: RolUsuario;
  equipo: EquipoVentas;
  telefono?: string;
  activo: boolean;
  created_at: string;
}

export interface Cliente {
  id: string; // ID interno (puede ser igual a ident01)
  ident01: string; // ID unico Primary Key especificado por el cliente (ej: CLI001, FARMA-01)
  codigo_cliente: string; // Retrocompatible: mapeado a ident01
  rif: string; // RIF fiscal (ej: J-30489218-4)
  razon_social: string; // Razon Social fiscal
  nombre_fantasia: string; // Nombre de fantasia comercial
  nombre_comercial: string; // Retrocompatible: mapeado a nombre_fantasia
  brick?: string; // IMS Brick / Zona territorial comercial farmaceutica
  municipio_ciudad?: string; // Municipio / Ciudad / Alcaldia
  ciudad: string; // Retrocompatible: mapeado a municipio_ciudad
  direccion: string; // Direccion fisica
  estado: string; // Estado geografico
  frecuencia?: string; // Frecuencia de visita (ej: Semanal, Quincenal, Mensual, F1, F2, F4)
  bandera?: string; // Cadena o grupo (ej: Farmatodo, Locatel, Farmahorro, Independiente)
  local_gps_lat?: number; // Latitud GPS
  local_gps_lon?: number; // Longitud GPS
  clasificacion_abc: ClasificacionCliente;
  cupo_credito: number;
  dias_credito: number;
  telefono: string;
  email_contacto: string;
  equipo_asignado?: 'La Sante' | 'Comercial' | 'AMBOS';
  activo: boolean;
  created_at: string;
}

export interface ColumnaCsvConfig {
  campo_origen: 
    | 'rif_cliente' 
    | 'codigo_cliente' 
    | 'codigo_cliente_drogueria'
    | 'numero_pedido' 
    | 'fecha_pedido' 
    | 'sku' 
    | 'codigo_barras' 
    | 'nombre_producto' 
    | 'cantidad_confirmada' 
    | 'cantidad_solicitada' 
    | 'precio_unitario' 
    | 'descuento_porcentaje' 
    | 'subtotal' 
    | 'constante';
  nombre_encabezado: string;
  orden: number;
  valor_constante?: string;
  formato?: 'texto' | 'entero' | 'decimal_punto' | 'decimal_coma' | 'fecha_yyyymmdd' | 'fecha_ddmmyyyy';
  longitud_maxima?: number;
  relleno_ceros_izq?: number;
}

export interface FormatoCsvConfig {
  delimitador: ',' | ';' | '|' | '\t';
  incluir_encabezados: boolean;
  entrecomillado: 'siempre' | 'solo_texto' | 'nunca';
  codificacion: 'UTF-8' | 'ISO-8859-1';
  salto_linea: '\n' | '\r\n';
  formato_decimal: 'punto' | 'coma';
  columnas: ColumnaCsvConfig[];
}

export interface Drogueria {
  id: string;
  id_numero: number; // Identificador numerico secuencial (Primary Key integer: 1, 2, 3... 17)
  codigo_drogueria: string;
  rif?: string;
  nombre_drogueria: string;
  email_pedidos: string;
  pagina_web?: string;
  telefono?: string;
  tiempo_entrega_promedio_dias?: number;
  formato_csv_config: FormatoCsvConfig;
  activo: boolean;
  created_at: string;
}

export interface Producto {
  id: string;
  sku: string;
  codigo_barras_ean13: string;
  principio_activo: string;
  nombre_comercial: string;
  presentacion: string;
  laboratorio: string;
  precio_lista: number;
  descuento_maximo_porc: number;
  es_prioritario: boolean;
  factor_prioridad: number; // e.g. 1.25 para multiplicar la recomendación
  empaque_minimo: number; // Unidades por embalaje (caja x 10, blister x 20, etc.)
  stock_disponible: number;
  equipo_asignado?: 'La Sante' | 'Comercial' | 'OTC' | 'AMBOS';
  activo: boolean;
  created_at: string;

  // Campos farmacéuticos ampliados del Vademécum comercial
  codigo?: string;
  descripcion?: string;
  unidad_negocio?: string;
  clase_terapeutica?: string;
  sistemas?: string;
  clasificacion_portafolio?: string;
  product_code?: string;
  product?: string;
  pack_code?: string;
  pack?: string;
  molecula?: string;
  estado_texto?: string;
}

export interface RelClienteVendedor {
  id: string;
  cliente_id: string;
  vendedor_id: string;
  equipo: EquipoVentas;
  rol_asignacion: 'titular' | 'suplente' | 'compartido';
  activo: boolean;
  created_at: string;
}

export interface RelClienteDrogueriaCodigo {
  id: string;
  cliente_id: string; // ID de la farmacia en dim_clientes
  drogueria_id: string; // ID de la droguería en dim_droguerias
  codigo_cliente_drogueria: string; // Código B2B oficial que esa droguería exige (ej: 10452, 87410)
  activo: boolean;
  created_at?: string;
}

// Homologación de alias y nombres de clientes que pone cada droguería
export interface ClienteDrogueriaAlias {
  id: string;
  cliente_ident01: string; // Código maestro de la farmacia en dim_clientes
  drogueria: string; // Nombre o código de la droguería (ej: COBECA, NENA)
  cod_cliente_drogueria?: string; // Código que esa droguería le da a la farmacia
  nombre_cliente_drogueria: string; // Nombre literal que esa droguería colocó
  nombre_normalizado?: string;
  verificado: boolean;
  created_at?: string;
}

// Mapeo entre códigos de producto de droguerías y el SKU interno de la empresa (Cod Sap)
export interface ProductoDrogueriaMapeo {
  id: string;
  cod_sap: string; // SKU interno del vademécum
  drogueria: string; // Nombre de la droguería
  codigo_producto_drogueria: string; // Código que la droguería utiliza para el producto
  nombre_producto_drogueria?: string; // Nombre que la droguería utiliza
  created_at?: string;
}

export interface FactHistoricoVentas {
  id: string;
  fecha: string; // Formato YYYY-MM-DD
  mes_periodo?: string; // Formato YYYY-MM inferido (ej: '2026-01')
  archivo_origen?: string; // Nombre del archivo cargado (ej: 'ventas_enero.csv')
  cod_cliente: string; // Código del cliente asignado por la droguería
  nombre_cliente: string; // Nombre que cada droguería le da a la farmacia
  drogueria: string; // Droguería distribuidora
  codigo_producto: string; // Código del producto en esa droguería
  nombre_producto: string; // Nombre del producto según la droguería
  unidades: number;
  cod_sap?: string; // Código de producto interno SAP / SKU (opcional en archivo)
  cliente_ident01?: string; // ID único homologado de la farmacia en dim_clientes
  created_at?: string;
}

export interface HistoricoPedidoPrevio {
  id: string;
  cliente_id: string;
  drogueria_id: string;
  producto_id: string;
  fecha_pedido: string;
  equipo_origen: EquipoVentas;
  numero_factura_origen?: string;
  cantidad_solicitada: number;
  cantidad_facturada: number;
  precio_unitario: number;
  descuento_porcentaje: number;

  // Columnas exactas del histórico comercial del cliente
  cod_sap?: string;                    // Código de producto interno (SKU interno cargado manual o autocompletado)
  codigo_producto_drogueria?: string; // Código del producto en la droguería
  nombre_producto?: string;           // Nombre comercial del producto
  cod_cliente_drogueria?: string;     // Código de la farmacia en la droguería
  nombre_cliente?: string;            // Nombre de la farmacia
  nombre_drogueria?: string;          // Nombre de la droguería (COBECA, NENA, etc.)
  mes_periodo?: string;               // YYYY-MM inferido
  archivo_origen?: string;            // Archivo de donde provino
  cliente_ident01?: string;           // Identificador de farmacia homologada
}

export interface PedidoCabecera {
  id: string;
  numero_pedido: string;
  cliente_id: string;
  vendedor_id: string;
  drogueria_id: string;
  fecha_pedido: string;
  equipo_origen: EquipoVentas;
  estado: EstadoPedido;
  observaciones?: string;
  total_solicitado: number;
  total_confirmado: number;
  fill_rate: number; // Porcentaje confirmado/solicitado
  transferencista_id?: string;
  numero_factura?: string; // Factura emitida por la droguería al conciliar
  fecha_procesamiento?: string;
  created_at: string;
  updated_at: string;
  
  // Relaciones anidadas para frontend
  cliente?: Cliente;
  vendedor?: Usuario;
  drogueria?: Drogueria;
  transferencista?: Usuario;
  detalles?: PedidoDetalle[];
}

export interface PedidoDetalle {
  id: string;
  pedido_id: string;
  producto_id: string;
  cantidad_solicitada: number;
  cantidad_confirmada: number;
  precio_unitario: number;
  descuento_porcentaje: number;
  subtotal_solicitado: number;
  subtotal_confirmado: number;
  motivo_ajuste: MotivoAjuste;
  observaciones_linea?: string;
  created_at: string;

  // Relación anidada
  producto?: Producto;
}

export interface SugeridoItem {
  producto_id: string;
  sku: string;
  codigo_barras: string;
  nombre_comercial: string;
  principio_activo: string;
  laboratorio: string;
  precio_lista: number;
  descuento_maximo_porc: number;
  es_prioritario: boolean;
  factor_prioridad: number;
  empaque_minimo: number;
  stock_disponible: number;
  
  // Métricas del análisis de sugerido
  total_unidades_historicas: number;
  frecuencia_pedidos: number; // Cuántos pedidos distintos en el período
  compras_equipo_a: number;
  compras_equipo_b: number;
  promedio_mensual: number;
  sugerido_calculado: number; // Unidades recomendadas
  descuento_sugerido: number;
  explicacion_algoritmo: string;
}

export interface ParametrosSugerido {
  cliente_id: string;
  dias_analisis: 30 | 60 | 90;
  factor_crecimiento: number; // e.g. 1.0 = 100%, 1.15 = 115% de reposición esperada
  solo_con_historia: boolean;
  incluir_prioritarios_sin_historia: boolean;
}

export interface InventarioDrogueria {
  id: string;
  drogueria_id: string;
  producto_id: string;
  stock_disponible: number;
  precio_drogueria?: number;
  codigo_articulo_drogueria?: string;
  updated_at: string;
  // Campos auxiliares para la UI
  producto?: Producto;
  drogueria?: Drogueria;
}

export interface ItemDictadoReconocido {
  producto: Producto;
  cantidad: number;
  descuento: number;
  confianza: number;
  textoOriginal: string;
}

