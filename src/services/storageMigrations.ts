import type { Cliente, Drogueria, FormatoCsvConfig, Producto, Usuario } from '../types/pharmacy';

type Registro = Record<string, unknown>;

const texto = (v: unknown, defecto: string): string => (typeof v === 'string' && v ? v : defecto);
const numero = (v: unknown, defecto: number): number => (typeof v === 'number' ? v : defecto);

function comoLista(guardado: unknown): Registro[] | undefined {
  return Array.isArray(guardado) && guardado.length > 0 ? (guardado as Registro[]) : undefined;
}

/** Layout CSV base para droguerías sin configuración guardada. */
export const FORMATO_CSV_POR_DEFECTO: FormatoCsvConfig = {
  delimitador: ';',
  incluir_encabezados: true,
  entrecomillado: 'solo_texto',
  codificacion: 'UTF-8',
  salto_linea: '\r\n',
  formato_decimal: 'coma',
  columnas: [
    { campo_origen: 'codigo_cliente', nombre_encabezado: 'COD_CLIENTE', orden: 1, formato: 'texto' },
    { campo_origen: 'rif_cliente', nombre_encabezado: 'RIF_FARMACIA', orden: 2, formato: 'texto' },
    { campo_origen: 'sku', nombre_encabezado: 'SKU_PRODUCTO', orden: 3, formato: 'texto' },
    { campo_origen: 'cantidad_confirmada', nombre_encabezado: 'CANTIDAD', orden: 4, formato: 'entero' },
    { campo_origen: 'descuento_porcentaje', nombre_encabezado: 'DESCUENTO', orden: 5, formato: 'decimal_coma' },
    { campo_origen: 'numero_pedido', nombre_encabezado: 'NUMERO_ORDEN', orden: 6, formato: 'texto' },
  ],
};

export function leerProductos(guardado: unknown): Producto[] | undefined {
  const lista = comoLista(guardado);
  if (!lista) return undefined;
  return lista.map((p) => {
    const id = texto(p.id, '');
    const sku = texto(p.sku, texto(p.codigo, `SKU-${id}`));
    const nombre = texto(p.nombre_comercial, texto(p.product, 'Medicamento'));
    const activo = texto(p.principio_activo, texto(p.molecula, 'Principio Activo'));
    const presentacion = texto(p.presentacion, texto(p.pack, 'Caja x 30'));
    const laboratorio = texto(p.laboratorio, texto(p.unidad_negocio, 'La Sante'));
    const ean = texto(p.codigo_barras_ean13, texto(p.pack_code, '7590000000000'));
    return {
      ...(p as unknown as Producto),
      sku,
      codigo: texto(p.codigo, sku),
      nombre_comercial: nombre,
      product: texto(p.product, nombre),
      principio_activo: activo,
      molecula: texto(p.molecula, activo),
      presentacion,
      pack: texto(p.pack, presentacion),
      laboratorio,
      unidad_negocio: texto(p.unidad_negocio, laboratorio),
      precio_lista: numero(p.precio_lista, 0),
      descuento_maximo_porc: numero(p.descuento_maximo_porc, 15),
      empaque_minimo: numero(p.empaque_minimo, 10),
      stock_disponible: numero(p.stock_disponible, 500),
      codigo_barras_ean13: ean,
      pack_code: texto(p.pack_code, ean),
      activo: p.activo !== false,
    };
  });
}

export function leerClientes(guardado: unknown): Cliente[] | undefined {
  const lista = comoLista(guardado);
  if (!lista) return undefined;
  return lista.map((c, idx) => {
    const ident01 = texto(c.ident01, texto(c.codigo_cliente, texto(c.id, `CLI-100${idx + 1}`)));
    const fantasia = texto(c.nombre_fantasia, texto(c.nombre_comercial, texto(c.razon_social, `Farmacia ${idx + 1}`)));
    const ciudad = texto(c.municipio_ciudad, texto(c.ciudad, 'Caracas'));
    const estado = texto(c.estado, 'Miranda');
    return {
      ...(c as unknown as Cliente),
      id: texto(c.id, ident01),
      ident01,
      codigo_cliente: texto(c.codigo_cliente, ident01),
      razon_social: texto(c.razon_social, fantasia),
      nombre_fantasia: fantasia,
      nombre_comercial: texto(c.nombre_comercial, fantasia),
      brick: texto(c.brick, 'CCS-CENTRO-01'),
      municipio_ciudad: ciudad,
      ciudad: texto(c.ciudad, ciudad),
      direccion: texto(c.direccion, `${ciudad}, ${estado}`),
      estado,
      rif: texto(c.rif, 'J-00000000-0'),
      frecuencia: texto(c.frecuencia, 'Semanal'),
      bandera: texto(c.bandera, 'Independiente'),
      local_gps_lat: numero(c.local_gps_lat, 10.48),
      local_gps_lon: numero(c.local_gps_lon, -66.86),
      clasificacion_abc: (c.clasificacion_abc as Cliente['clasificacion_abc']) || 'B',
      cupo_credito: numero(c.cupo_credito, 5000),
      dias_credito: numero(c.dias_credito, 15),
      activo: c.activo !== false,
    };
  });
}

export function leerDroguerias(guardado: unknown): Drogueria[] | undefined {
  const lista = comoLista(guardado);
  if (!lista) return undefined;
  return lista.map((d, idx) => ({
    ...(d as unknown as Drogueria),
    id: texto(d.id, `drog-${idx + 1}`),
    id_numero: numero(d.id_numero, idx + 1),
    nombre_drogueria: texto(d.nombre_drogueria, `Drogueria ${idx + 1}`),
    codigo_drogueria: texto(d.codigo_drogueria, `DROG-${idx + 1}`),
    email_pedidos: texto(d.email_pedidos, 'pedidos@drogueria.com'),
    formato_csv_config: (d.formato_csv_config as FormatoCsvConfig) || FORMATO_CSV_POR_DEFECTO,
    activo: d.activo !== false,
  }));
}

export function leerUsuario(guardado: unknown): Usuario | undefined {
  return guardado && typeof guardado === 'object' ? (guardado as Usuario) : undefined;
}

export function leerLista<T>(guardado: unknown): T[] | undefined {
  return Array.isArray(guardado) ? (guardado as T[]) : undefined;
}
