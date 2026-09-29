import type { NovaDB } from './db';
import { textoBusquedaCliente, tokensProducto } from './busqueda';
import type { ReglaComercial } from './politicas';
import type { ColumnaExport, FormatoExport, LocalCliente, LocalDrogueria, LocalMapCliente, LocalMapProducto, LocalProducto, OrigenColumnaExport } from './types';
import type { Cliente, Drogueria, Producto } from '../types/pharmacy';

/**
 * Carga datos de demostración en la base local cuando NO hay servidor configurado, para poder probar la
 * captura de pedidos sin conexión. Con Supabase, el catálogo llega por la descarga incremental (pull).
 */

const ORIGEN: Record<string, OrigenColumnaExport> = {
  codigo_cliente: 'codigo_cliente_drogueria',
  codigo_cliente_drogueria: 'codigo_cliente_drogueria',
  rif_cliente: 'rif_cliente',
  sku: 'codigo_producto_drogueria',
  codigo_barras: 'ean',
  nombre_producto: 'descripcion_producto_drogueria',
  cantidad_confirmada: 'unidades_confirmadas',
  cantidad_solicitada: 'unidades_solicitadas',
  numero_pedido: 'correlativo',
  fecha_pedido: 'fecha_pedido',
  constante: 'constante',
};

function formatoDesdeLegado(d: Drogueria): FormatoExport {
  const cfg = d.formato_csv_config;
  const columnas: ColumnaExport[] = (cfg?.columnas ?? [])
    .filter((c) => ORIGEN[c.campo_origen])
    .sort((a, b) => a.orden - b.orden)
    .map((c) => ({ encabezado: c.nombre_encabezado, origen: ORIGEN[c.campo_origen], valor: c.valor_constante }));
  return {
    formato: 'csv',
    delimitador: (cfg?.delimitador ?? ';') as FormatoExport['delimitador'],
    encabezado: cfg?.incluir_encabezados !== false,
    entrecomillado: cfg?.entrecomillado ?? 'solo_texto',
    salto_linea: cfg?.salto_linea ?? '\r\n',
    codificacion: cfg?.codificacion === 'ISO-8859-1' ? 'iso-8859-1' : 'utf-8',
    extension: 'csv',
    decimal: cfg?.formato_decimal ?? 'punto',
    formato_fecha: 'YYYYMMDD',
    nombre_archivo: '{drogueria}_{correlativo}_{fecha}.{extension}',
    columnas: columnas.length > 0 ? columnas : [
      { encabezado: 'COD_CLIENTE', origen: 'codigo_cliente_drogueria' },
      { encabezado: 'COD_PRODUCTO', origen: 'codigo_producto_drogueria' },
      { encabezado: 'CANTIDAD', origen: 'unidades_solicitadas' },
      { encabezado: 'PEDIDO', origen: 'correlativo' },
    ],
  };
}

const frecuenciaEnDias = (t?: string | null): number => (/quinc/i.test(t ?? '') ? 15 : /mens/i.test(t ?? '') ? 30 : 7);

export function reglasDemo(): ReglaComercial[] {
  const base = { vigente_desde: '2026-01-01', activo: true };
  return [
    { ...base, id: 'regla-base', nombre: 'Descuento base', alcance: 'linea', descuento_max_pct: 5, prioridad: 100 },
    { ...base, id: 'regla-mix3', nombre: 'Mix de 3 SKUs', alcance: 'linea', descuento_max_pct: 12, min_skus_distintos: 3, prioridad: 50 },
    { ...base, id: 'regla-volumen', nombre: 'Volumen 100 uds', alcance: 'linea', descuento_max_pct: 15, min_unidades_totales: 100, prioridad: 40 },
    { ...base, id: 'regla-vip', nombre: 'Cliente VIP', alcance: 'linea', descuento_max_pct: 20, segmento_cliente: 'vip', prioridad: 10 },
    { ...base, id: 'regla-pedido', nombre: 'Descuento de pedido', alcance: 'pedido', descuento_max_pct: 3, prioridad: 100 },
  ];
}

export async function sembrarDatosDemo(db: NovaDB): Promise<boolean> {
  if ((await db.productos.count()) > 0) return false;
  const { MOCK_PRODUCTOS, MOCK_CLIENTES, MOCK_DROGUERIAS } = await import('../data/mockData');

  const productos = MOCK_PRODUCTOS.filter((p: Producto) => p.activo).map<LocalProducto>((p) => {
    const base = { sku: p.sku, ean13: p.codigo_barras_ean13, nombre_comercial: p.nombre_comercial, principio_activo: p.principio_activo, presentacion: p.presentacion };
    return {
      id: p.id, ...base, categoria: p.clase_terapeutica || p.unidad_negocio || p.laboratorio || 'general', laboratorio: p.laboratorio,
      empaque_minimo: p.empaque_minimo || 1, es_prioritario: p.es_prioritario, activo: true, tokens: tokensProducto(base),
    };
  });

  const clientes = MOCK_CLIENTES.filter((c: Cliente) => c.activo).map<LocalCliente>((c, i) => {
    const l: LocalCliente = {
      id: c.id, codigo_interno: c.ident01, razon_social: c.razon_social, nombre_comercial: c.nombre_fantasia || c.nombre_comercial,
      rif: c.rif, brick: c.brick, direccion: c.direccion, telefono: c.telefono, lat: c.local_gps_lat ?? null, lon: c.local_gps_lon ?? null,
      frecuencia_dias: frecuenciaEnDias(c.frecuencia), estado_validacion: 'activo', segmento: i === 0 ? 'vip' : 'estandar',
      sync_estado: 'sincronizado', busqueda: '',
    };
    l.busqueda = textoBusquedaCliente(l);
    return l;
  });

  const droguerias = MOCK_DROGUERIAS.filter((d: Drogueria) => d.activo).slice(0, 6).map<LocalDrogueria>((d) => ({
    id: d.id, codigo: d.codigo_drogueria, nombre: d.nombre_drogueria, formato_export: formatoDesdeLegado(d), activo: true,
  }));

  const mapProductos: LocalMapProducto[] = droguerias.flatMap((d) =>
    productos.map((p) => ({ id: `mp-${d.id}-${p.id}`, drogueria_id: d.id, producto_id: p.id, codigo_drogueria: `${d.codigo}-${p.sku}`, descripcion_drogueria: p.nombre_comercial.toUpperCase() }))
  );
  const mapClientes: LocalMapCliente[] = droguerias.flatMap((d) =>
    clientes.map((c) => ({ id: `mc-${d.id}-${c.id}`, drogueria_id: d.id, cliente_id: c.id, codigo_cuenta: `${d.codigo}-${c.codigo_interno}` }))
  );

  await db.transaction('rw', [db.productos, db.clientes, db.droguerias, db.mapProductos, db.mapClientes, db.reglas], async () => {
    await db.productos.bulkPut(productos);
    await db.clientes.bulkPut(clientes);
    await db.droguerias.bulkPut(droguerias);
    await db.mapProductos.bulkPut(mapProductos);
    await db.mapClientes.bulkPut(mapClientes);
    await db.reglas.bulkPut(reglasDemo());
  });
  return true;
}
