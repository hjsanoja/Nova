import type { SupabaseClient } from '@supabase/supabase-js';
import type { ColumnaExport, FormatoExport, OrigenColumnaExport } from '../offline/types';
import type {
  Cliente,
  ClienteDrogueriaAlias,
  Drogueria,
  FormatoCsvConfig,
  Producto,
  EquipoVentas,
  ProductoDrogueriaMapeo,
  RolUsuario,
} from '../types/pharmacy';

/**
 * Puente entre las pantallas clásicas (modelo local anterior) y el esquema v3 de Supabase.
 * Todo viaja por CLAVES NATURALES (ident01, SKU, código de droguería, los códigos y nombres que cada droguería
 * usa): el navegador nunca necesita conocer los UUID del servidor, y el servidor resuelve y homologa.
 * Los mapeos son funciones puras (con pruebas); las llamadas a Supabase son finas y devuelven el resumen del servidor.
 */

// ---------------------------------------------------------------------------- mapeos puros

/** Frecuencia de visita (texto libre de la fase 1) -> días. F1/F2/F4 = visitas por mes. */
export function frecuenciaADias(f: string | undefined | null): number | null {
  const t = (f ?? '').trim().toUpperCase();
  if (!t) return null;
  const tabla: Record<string, number> = { SEMANAL: 7, F4: 7, QUINCENAL: 15, F2: 15, MENSUAL: 30, F1: 30, BIMESTRAL: 60 };
  if (tabla[t]) return tabla[t];
  return /^\d{1,3}$/.test(t) ? Math.min(Math.max(Number(t), 1), 365) : null;
}

export function diasAFrecuencia(d: number | null | undefined): string {
  if (!d) return 'Semanal';
  return ({ 7: 'Semanal', 15: 'Quincenal', 30: 'Mensual', 60: 'Bimestral' } as Record<number, string>)[d] ?? String(d);
}

const ORIGEN_LEGADO_A_V3: Record<string, OrigenColumnaExport> = {
  codigo_cliente: 'codigo_cliente_drogueria',
  codigo_cliente_drogueria: 'codigo_cliente_drogueria',
  rif_cliente: 'rif_cliente',
  // En la fase 1 "sku" era el código interno; la droguería espera SU código de artículo.
  sku: 'codigo_producto_drogueria',
  codigo_barras: 'ean',
  nombre_producto: 'descripcion_producto_drogueria',
  cantidad_confirmada: 'unidades_confirmadas',
  cantidad_solicitada: 'unidades_solicitadas',
  numero_pedido: 'correlativo',
  fecha_pedido: 'fecha_pedido',
};

/** Layout CSV de la fase 1 -> layout de exportación v3. Las columnas sin equivalente se conservan vacías para no mover el archivo. */
export function formatoLegadoAExport(c: FormatoCsvConfig): FormatoExport {
  const columnas: ColumnaExport[] = [...(c.columnas ?? [])]
    .filter((col) => (col.nombre_encabezado ?? '').trim() !== '')
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .map((col) => {
      const origen = ORIGEN_LEGADO_A_V3[col.campo_origen];
      if (!origen) return { encabezado: col.nombre_encabezado, origen: 'constante' as const, valor: col.campo_origen === 'constante' ? col.valor_constante ?? '' : '' };
      const esCantidad = origen === 'unidades_confirmadas' || origen === 'unidades_solicitadas';
      return { encabezado: col.nombre_encabezado, origen, ...(esCantidad ? { formato: 'entero' as const } : {}) };
    });
  const cod = (c.codificacion ?? 'UTF-8').toLowerCase();
  return {
    formato: 'csv',
    delimitador: ([';', ',', '|', '\t'] as string[]).includes(c.delimitador) ? c.delimitador : ';',
    encabezado: c.incluir_encabezados !== false,
    entrecomillado: c.entrecomillado === 'siempre' || c.entrecomillado === 'nunca' ? c.entrecomillado : 'solo_texto',
    salto_linea: c.salto_linea === '\n' ? '\n' : '\r\n',
    codificacion: cod === 'iso-8859-1' || cod === 'latin1' ? 'iso-8859-1' : cod === 'windows-1252' ? 'windows-1252' : 'utf-8',
    bom: false,
    extension: 'csv',
    decimal: c.formato_decimal === 'coma' ? 'coma' : 'punto',
    formato_fecha: 'YYYYMMDD',
    nombre_archivo: '{correlativo}_{fecha}.{extension}',
    columnas,
  };
}

// Coordenadas que las pantallas clásicas ponen por defecto cuando falta el GPS: no son reales y no deben viajar a la nube.
const GPS_POR_DEFECTO = { lat: 10.48, lon: -66.86 };
const esGpsReal = (lat?: number, lon?: number) =>
  typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) &&
  !(lat === 0 && lon === 0) && !(lat === GPS_POR_DEFECTO.lat && lon === GPS_POR_DEFECTO.lon);

export function clienteAV3(c: Cliente): Record<string, unknown> {
  const gps = esGpsReal(c.local_gps_lat, c.local_gps_lon);
  return {
    codigo_interno: c.ident01 || c.codigo_cliente,
    razon_social: c.razon_social,
    nombre_comercial: c.nombre_fantasia || c.nombre_comercial,
    rif: /^[A-Za-z]?-?0+-?0?$/.test((c.rif ?? '').trim()) ? null : c.rif,
    brick: c.brick,
    municipio: c.municipio_ciudad || c.ciudad,
    estado_geografico: c.estado,
    direccion: c.direccion,
    telefono: c.telefono,
    bandera: c.bandera,
    lat: gps ? c.local_gps_lat : null,
    lon: gps ? c.local_gps_lon : null,
    frecuencia_dias: frecuenciaADias(c.frecuencia),
  };
}

export function productoAV3(p: Producto): Record<string, unknown> {
  return {
    sku: p.codigo || p.sku,
    ean13: p.pack_code || p.codigo_barras_ean13,
    nombre_comercial: p.product || p.nombre_comercial,
    presentacion: p.pack || p.presentacion,
    principio_activo: p.molecula || p.principio_activo,
    clase_terapeutica: p.clase_terapeutica,
    categoria: p.clasificacion_portafolio || p.clase_terapeutica,
    laboratorio: p.unidad_negocio || p.laboratorio,
    empaque_minimo: p.empaque_minimo,
    es_prioritario: p.es_prioritario,
    activo: p.activo,
  };
}

export function drogueriaAV3(d: Drogueria): Record<string, unknown> {
  return {
    codigo: d.codigo_drogueria,
    nombre: d.nombre_drogueria,
    rif: d.rif && !/^[A-Za-z]?-?0+-?0?$/.test(d.rif.trim()) ? d.rif : null,
    email_pedidos: d.email_pedidos || null,
    telefono: d.telefono || null,
    dias_entrega: d.tiempo_entrega_promedio_dias ?? null,
    formato_export: formatoLegadoAExport(d.formato_csv_config),
    activo: d.activo,
  };
}

type Fila = Record<string, unknown>;
const t = (v: unknown, d = ''): string => (typeof v === 'string' && v !== '' ? v : d);

// ---------------------------------------------------------------------------- roles y equipos

/** Rol de la base (v3) -> rol de las pantallas clásicas. */
export const rolDesdeV3 = (rol: string): RolUsuario =>
  rol === 'transferencista' ? 'teletransferencista' : (['vendedor', 'gerente', 'admin'].includes(rol) ? (rol as RolUsuario) : 'vendedor');

/** Rol de las pantallas clásicas -> rol de la base (v3). */
export const rolAV3 = (rol: RolUsuario): string => (rol === 'teletransferencista' ? 'transferencista' : rol);

/** Código de equipo de la base ('LA SANTE', 'A'...) -> valor de las pantallas clásicas. Sin equipo = visión completa (TODOS). */
export function equipoDesdeV3(codigo: string | null | undefined): EquipoVentas {
  const tabla: Record<string, EquipoVentas> = { 'LA SANTE': 'La Sante', COMERCIAL: 'Comercial', OTC: 'OTC', A: 'A', B: 'B' };
  return tabla[(codigo ?? '').trim().toUpperCase()] ?? 'TODOS';
}

/** Valor de las pantallas clásicas -> código de equipo de la base (null = sin equipo). */
export function equipoAV3(equipo: string | null | undefined): string | null {
  const e = (equipo ?? '').trim();
  return e === '' || ['TODOS', 'AMBOS'].includes(e.toUpperCase()) ? null : e.toUpperCase();
}

export interface PerfilUsuario {
  nombre_completo: string;
  rol: RolUsuario;
  equipo: EquipoVentas;
  telefono?: string;
  activo: boolean;
  guia_vista_en?: string | null;
}

/**
 * Perfil autorizado del usuario que inició sesión, tomado de dim_usuarios (lo fija un administrador).
 * NUNCA se lee el rol de los metadatos de la cuenta (user_metadata): los escribe quien se registra.
 * Devuelve null si la cuenta no tiene fila (aún no fue dada de alta).
 */
export async function cargarPerfilUsuario(sb: SupabaseClient, id: string): Promise<PerfilUsuario | null> {
  // "*" y no una lista: así una columna nueva (p. ej. guia_vista_en) no rompe el acceso si la base aún no la tiene.
  const { data, error } = await sb.from('dim_usuarios').select('*, dim_equipos(codigo)').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const equipo = (data as { dim_equipos?: { codigo?: string } | null }).dim_equipos;
  return {
    nombre_completo: data.nombre_completo as string,
    rol: rolDesdeV3(data.rol as string),
    equipo: equipoDesdeV3(equipo?.codigo),
    telefono: (data.telefono as string | null) ?? undefined,
    activo: data.activo === true,
    guia_vista_en: 'guia_vista_en' in data ? ((data.guia_vista_en as string | null) ?? null) : undefined,
  };
}

/** Alta de usuario por un administrador: crea la cuenta sin tocar su sesión y le asigna rol/equipo en la base (RPC solo admin). */
export async function crearUsuarioNube(
  admin: SupabaseClient,
  registro: SupabaseClient,
  u: { email: string; password: string; nombre_completo: string; rol: RolUsuario; equipo: string; telefono?: string; activo: boolean }
): Promise<{ id: string }> {
  // Los metadatos son solo informativos (el nombre): rol y equipo se fijan en la base, no aquí.
  const { data, error } = await registro.auth.signUp({ email: u.email, password: u.password, options: { data: { nombre_completo: u.nombre_completo } } });
  if (error) throw new Error(`Supabase Auth: ${error.message}`);
  const id = data.user?.id;
  if (!id) throw new Error('Supabase no devolvió la cuenta creada (¿el correo ya está registrado?).');
  const { error: errCfg } = await admin.rpc('admin_configurar_usuario', {
    p_usuario: id, p_rol: rolAV3(u.rol), p_equipo_codigo: equipoAV3(u.equipo), p_activo: u.activo, p_nombre: u.nombre_completo, p_telefono: u.telefono ?? null,
  });
  if (errCfg) throw new Error(`La cuenta se creó pero no se pudo asignar rol y equipo (${errCfg.message}). Actívala desde el panel de usuarios.`);
  return { id };
}

// ---------------------------------------------------------------------------- llamadas a Supabase

const LOTE_CATALOGO = 500;
const LOTE_VENTAS = 1000;
const PAGINA = 1000;

export interface ResumenImportacionVentas {
  insertadas: number;
  recibidas: number;
  droguerias_desconocidas: string[];
  clientes_enlazados: number;
  productos_enlazados: number;
  codigos_aprendidos: number;
  /** Filas del archivo que quedaron sin farmacia / sin producto (pendientes de homologar). */
  sin_farmacia: number;
  sin_producto: number;
}

/** Avance de una carga: filas enviadas de un total y la etapa en curso (para la barra de progreso). */
export type Progreso = (hechas: number, total: number, etapa?: string) => void;

/** Envía `filas` en trozos a una RPC que devuelve cuántas guardó; devuelve el total guardado. */
async function rpcPorLotes<T>(sb: SupabaseClient, funcion: string, filas: T[], tamano: number, onProgreso?: Progreso): Promise<number> {
  let guardadas = 0;
  onProgreso?.(0, filas.length);
  for (let i = 0; i < filas.length; i += tamano) {
    const { data, error } = await sb.rpc(funcion, { p: filas.slice(i, i + tamano) });
    if (error) throw new Error(`${funcion}: ${error.message}`);
    guardadas += typeof data === 'number' ? data : 0;
    onProgreso?.(Math.min(i + tamano, filas.length), filas.length);
  }
  return guardadas;
}

export const importarCatalogoClientes = (sb: SupabaseClient, clientes: Cliente[], onProgreso?: Progreso) =>
  rpcPorLotes(sb, 'importar_catalogo_clientes', clientes.filter((c) => c.ident01 || c.codigo_cliente).map(clienteAV3), LOTE_CATALOGO, onProgreso);

export const importarCatalogoProductos = (sb: SupabaseClient, productos: Producto[], onProgreso?: Progreso) =>
  rpcPorLotes(sb, 'importar_catalogo_productos', productos.filter((p) => p.codigo || p.sku).map(productoAV3), LOTE_CATALOGO, onProgreso);

/**
 * Droguerías desde archivo: una celda vacía no borra lo que ya había y el formato de exportación no se toca.
 * Devuelve cuántas se crearon o actualizaron.
 */
export const importarCatalogoDroguerias = (sb: SupabaseClient, droguerias: Drogueria[], onProgreso?: Progreso) =>
  rpcPorLotes(sb, 'importar_catalogo_droguerias', droguerias.map((d) => {
    const { formato_export: _formato, ...resto } = drogueriaAV3(d);
    return resto;
  }), LOTE_CATALOGO, onProgreso);

export interface ResultadoHomologacion {
  clientes: number;
  productos: number;
  omitidos: Array<Record<string, unknown>>;
}

/** Homologación por clave natural: farmacias (alias por droguería) y productos (Cod SAP <-> código de la droguería). */
export async function importarHomologacion(
  sb: SupabaseClient,
  entrada: { alias?: ClienteDrogueriaAlias[]; mapeos?: ProductoDrogueriaMapeo[] },
  onProgreso?: Progreso
): Promise<ResultadoHomologacion> {
  const clientes = (entrada.alias ?? [])
    .filter((a) => a.verificado)
    .map((a) => ({ drogueria: a.drogueria, codigo_interno: a.cliente_ident01, codigo_cuenta: a.cod_cliente_drogueria || null, nombre: a.nombre_cliente_drogueria }));
  const productos = (entrada.mapeos ?? []).map((m) => ({ drogueria: m.drogueria, sku: m.cod_sap, codigo: m.codigo_producto_drogueria, descripcion: m.nombre_producto_drogueria ?? null }));
  const total: ResultadoHomologacion = { clientes: 0, productos: 0, omitidos: [] };
  const trozos = Math.max(Math.ceil(clientes.length / LOTE_CATALOGO), Math.ceil(productos.length / LOTE_CATALOGO), 1);
  for (let i = 0; i < trozos; i++) {
    const p = { clientes: clientes.slice(i * LOTE_CATALOGO, (i + 1) * LOTE_CATALOGO), productos: productos.slice(i * LOTE_CATALOGO, (i + 1) * LOTE_CATALOGO) };
    if (p.clientes.length === 0 && p.productos.length === 0) continue;
    const { data, error } = await sb.rpc('importar_homologacion', { p });
    if (error) throw new Error(`importar_homologacion: ${error.message}`);
    const r = data as ResultadoHomologacion;
    total.clientes += r.clientes;
    total.productos += r.productos;
    total.omitidos.push(...r.omitidos);
    onProgreso?.(Math.min((i + 1) * LOTE_CATALOGO, clientes.length + productos.length), clientes.length + productos.length);
  }
  return total;
}

/** Identidad de un archivo de ventas: reenviarlo no duplica filas en el servidor. */
export function checksumLote(archivo: string, filas: Array<{ fecha: string; unidades: number }>): string {
  let suma = 0;
  let min = '9999-12-31';
  let max = '0000-01-01';
  for (const f of filas) {
    suma += f.unidades;
    if (f.fecha < min) min = f.fecha;
    if (f.fecha > max) max = f.fecha;
  }
  return `${archivo}|${filas.length}|${suma}|${min}|${max}`;
}

/**
 * Envía el histórico de ventas de las droguerías: un lote por archivo de origen, en trozos de 1000 filas.
 * Se envían los códigos y nombres TAL COMO los escribió cada droguería; el servidor los enlaza con la farmacia y el producto
 * (y deja lo demás como pendiente de homologar). Cada trozo solo inserta y enlaza sus filas; el consolidado mensual se
 * calcula una vez por archivo al final (finalizar_lote_ventas), así el tiempo crece en línea recta con el tamaño.
 */
/** Una fila de un reporte de ventas, con los códigos y nombres tal como los escribió la droguería. */
export interface VentaArchivo {
  archivo_origen?: string;
  fecha_pedido: string;
  nombre_drogueria?: string;
  cod_cliente_drogueria?: string;
  nombre_cliente?: string;
  codigo_producto_drogueria?: string;
  nombre_producto?: string;
  cod_sap?: string;
  cantidad_facturada: number;
}

export async function importarVentas(
  sb: SupabaseClient,
  historico: VentaArchivo[],
  onProgreso?: Progreso
): Promise<ResumenImportacionVentas> {
  const porArchivo = new Map<string, VentaArchivo[]>();
  for (const h of historico) {
    const archivo = h.archivo_origen || 'historico_acumulado.csv';
    const lista = porArchivo.get(archivo);
    if (lista) lista.push(h);
    else porArchivo.set(archivo, [h]);
  }
  const resumen: ResumenImportacionVentas = {
    insertadas: 0, recibidas: 0, droguerias_desconocidas: [], clientes_enlazados: 0, productos_enlazados: 0, codigos_aprendidos: 0,
    sin_farmacia: 0, sin_producto: 0,
  };
  const desconocidas = new Set<string>();
  let enviadas = 0;
  onProgreso?.(0, historico.length, 'Subiendo filas');
  for (const [archivo, filasArchivo] of porArchivo) {
    const filas = filasArchivo.map((h, i) => ({
      n: i + 1,
      fecha: h.fecha_pedido,
      drogueria: h.nombre_drogueria,
      cod_cliente: h.cod_cliente_drogueria || null,
      nombre_cliente: h.nombre_cliente || null,
      cod_producto: h.codigo_producto_drogueria || h.cod_sap,
      nombre_producto: h.nombre_producto || null,
      cod_sap: h.cod_sap || null,
      unidades: Number.isFinite(Number(h.cantidad_facturada)) ? Math.round(Number(h.cantidad_facturada)) : 0,
    }));
    const lote = { archivo, checksum: checksumLote(archivo, filas), diferir: true };
    let loteId: string | null = null;
    for (let i = 0; i < filas.length; i += LOTE_VENTAS) {
      const trozo = filas.slice(i, i + LOTE_VENTAS);
      const { data, error } = await sb.rpc('importar_ventas_drogueria', { p_lote: lote, p_filas: trozo });
      if (error) throw new Error(`importar_ventas_drogueria: ${error.message}`);
      const r = data as { lote_id: string; insertadas: number; recibidas: number; droguerias_desconocidas: string[]; homologacion: Record<string, number> };
      loteId = r.lote_id;
      resumen.insertadas += r.insertadas;
      resumen.recibidas += r.recibidas;
      r.droguerias_desconocidas.forEach((d) => desconocidas.add(d));
      resumen.clientes_enlazados += r.homologacion?.clientes_enlazados ?? 0;
      resumen.productos_enlazados += r.homologacion?.productos_enlazados ?? 0;
      resumen.codigos_aprendidos += r.homologacion?.codigos_aprendidos ?? 0;
      enviadas += trozo.length;
      onProgreso?.(enviadas, historico.length, 'Subiendo filas');
    }
    if (loteId) {
      onProgreso?.(enviadas, historico.length, 'Calculando el consolidado mensual');
      const { data, error } = await sb.rpc('finalizar_lote_ventas', { p_lote: loteId });
      if (error) throw new Error(`finalizar_lote_ventas: ${error.message}`);
      const f = data as { sin_farmacia: number; sin_producto: number };
      resumen.sin_farmacia += f.sin_farmacia ?? 0;
      resumen.sin_producto += f.sin_producto ?? 0;
    }
  }
  resumen.droguerias_desconocidas = [...desconocidas];
  return resumen;
}

export interface ResumenVentasNube {
  filas: number;
  sin_farmacia: number;
  sin_producto: number;
  lotes: number;
  desde: string | null;
  hasta: string | null;
}

/** Cuántas ventas hay en la nube (una sola consulta en el servidor). */
export async function resumenVentasNube(sb: SupabaseClient): Promise<ResumenVentasNube> {
  const { data, error } = await sb.rpc('resumen_ventas_nube');
  if (error) throw new Error(error.message || `error ${error.code ?? 'desconocido'} al consultar Supabase`);
  return data as ResumenVentasNube;
}

async function paginar(consulta: (desde: number, hasta: number) => PromiseLike<{ data: Fila[] | null; error: { message: string } | null }>): Promise<Fila[]> {
  const todo: Fila[] = [];
  for (let pagina = 0; pagina < 100; pagina++) {
    const { data, error } = await consulta(pagina * PAGINA, (pagina + 1) * PAGINA - 1);
    if (error) throw new Error(error.message);
    todo.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }
  return todo;
}

/** Texto CSV (separador ;) listo para abrir en Excel: comillas solo donde hace falta. */
export function aCsv(encabezados: string[], filas: Array<Array<string | number | boolean | null | undefined>>): string {
  const celda = (v: string | number | boolean | null | undefined) => {
    const t = v == null ? '' : String(v);
    return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [encabezados, ...filas].map((f) => f.map(celda).join(';')).join('\r\n');
}

const uno = (v: unknown): Fila => ((Array.isArray(v) ? v[0] : v) ?? {}) as Fila;

/**
 * Tabla de homologación vigente en la nube, como CSV: tu código (Cod SAP / código interno) y el código que usa cada droguería.
 * Una fila por par; un producto o farmacia puede tener varios códigos en la misma droguería (uno es el principal).
 */
export async function descargarHomologacionesCsv(sb: SupabaseClient, tipo: 'productos' | 'farmacias'): Promise<{ csv: string; filas: number }> {
  if (tipo === 'productos') {
    const filas = await paginar((a, b) =>
      sb.from('map_producto_drogueria')
        .select('codigo_drogueria,descripcion_drogueria,es_principal,dim_productos(sku,nombre_comercial),dim_droguerias(codigo,nombre)')
        .is('deleted_at', null).order('producto_id').order('drogueria_id').range(a, b));
    const datos = filas.map((f) => {
      const p = uno(f.dim_productos);
      const d = uno(f.dim_droguerias);
      return [t(p.sku), t(p.nombre_comercial), t(d.nombre), t(f.codigo_drogueria), t(f.descripcion_drogueria), f.es_principal === false ? 'no' : 'si'];
    }).sort((x, y) => `${x[0]}|${x[2]}`.localeCompare(`${y[0]}|${y[2]}`));
    return { csv: aCsv(['Cod SAP', 'Producto', 'Drogueria', 'Codigo en la drogueria', 'Descripcion en la drogueria', 'Principal'], datos), filas: datos.length };
  }
  const filas = await paginar((a, b) =>
    sb.from('map_cliente_drogueria')
      .select('codigo_cuenta,nombre_en_drogueria,es_principal,dim_clientes(codigo_interno,nombre_comercial),dim_droguerias(codigo,nombre)')
      .is('deleted_at', null).order('cliente_id').order('drogueria_id').range(a, b));
  const datos = filas.map((f) => {
    const c = uno(f.dim_clientes);
    const d = uno(f.dim_droguerias);
    return [t(c.codigo_interno), t(c.nombre_comercial), t(d.nombre), t(f.codigo_cuenta), t(f.nombre_en_drogueria), f.es_principal === false ? 'no' : 'si'];
  }).sort((x, y) => `${x[0]}|${x[2]}`.localeCompare(`${y[0]}|${y[2]}`));
  return { csv: aCsv(['Codigo interno', 'Farmacia', 'Drogueria', 'Cuenta en la drogueria', 'Nombre en la drogueria', 'Principal'], datos), filas: datos.length };
}
