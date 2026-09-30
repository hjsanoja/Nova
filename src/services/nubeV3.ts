import type { SupabaseClient } from '@supabase/supabase-js';
import type { ColumnaExport, FormatoExport, OrigenColumnaExport } from '../offline/types';
import type {
  Cliente,
  ClienteDrogueriaAlias,
  ColumnaCsvConfig,
  Drogueria,
  FormatoCsvConfig,
  HistoricoPedidoPrevio,
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

const ORIGEN_V3_A_LEGADO: Partial<Record<OrigenColumnaExport, ColumnaCsvConfig['campo_origen']>> = {
  codigo_cliente_drogueria: 'codigo_cliente',
  rif_cliente: 'rif_cliente',
  codigo_producto_drogueria: 'sku',
  ean: 'codigo_barras',
  descripcion_producto_drogueria: 'nombre_producto',
  unidades_confirmadas: 'cantidad_confirmada',
  unidades_solicitadas: 'cantidad_solicitada',
  correlativo: 'numero_pedido',
  fecha_pedido: 'fecha_pedido',
  constante: 'constante',
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

/** Layout v3 -> el de las pantallas clásicas (conversión con pérdida: solo lo que esas pantallas saben editar). */
export function formatoExportALegado(f: FormatoExport): FormatoCsvConfig {
  return {
    delimitador: f.delimitador === '' ? ';' : f.delimitador,
    incluir_encabezados: f.encabezado,
    entrecomillado: f.entrecomillado,
    codificacion: f.codificacion === 'iso-8859-1' || f.codificacion === 'windows-1252' ? 'ISO-8859-1' : 'UTF-8',
    salto_linea: f.salto_linea,
    formato_decimal: f.decimal === 'coma' ? 'coma' : 'punto',
    columnas: f.columnas.map((col, i) => ({
      campo_origen: ORIGEN_V3_A_LEGADO[col.origen] ?? 'constante',
      nombre_encabezado: col.encabezado,
      orden: i + 1,
      ...(col.origen === 'constante' || !ORIGEN_V3_A_LEGADO[col.origen] ? { valor_constante: col.valor ?? '' } : {}),
      formato: col.formato === 'entero' ? ('entero' as const) : ('texto' as const),
    })),
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
const n = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Fila de dim_clientes (v3) -> registro con la forma que esperan las pantallas clásicas (luego pasa por leerClientes). */
export function clienteDesdeV3(f: Fila): Record<string, unknown> {
  const activo = f.estado_validacion === 'activo';
  return {
    id: t(f.codigo_interno),
    ident01: t(f.codigo_interno),
    codigo_cliente: t(f.codigo_interno),
    rif: t(f.rif, 'J-00000000-0'),
    razon_social: t(f.razon_social),
    nombre_fantasia: t(f.nombre_comercial),
    nombre_comercial: t(f.nombre_comercial),
    brick: t(f.brick, ''),
    municipio_ciudad: t(f.municipio, ''),
    estado: t(f.estado_geografico, ''),
    direccion: t(f.direccion, ''),
    telefono: t(f.telefono, ''),
    bandera: t(f.bandera, 'Independiente'),
    frecuencia: diasAFrecuencia(typeof f.frecuencia_dias === 'number' ? f.frecuencia_dias : null),
    ...(typeof f.lat === 'number' && typeof f.lon === 'number' ? { local_gps_lat: f.lat, local_gps_lon: f.lon } : {}),
    activo,
  };
}

export function productoDesdeV3(f: Fila): Record<string, unknown> {
  return {
    id: t(f.sku),
    sku: t(f.sku),
    codigo: t(f.sku),
    codigo_barras_ean13: t(f.ean13, ''),
    nombre_comercial: t(f.nombre_comercial),
    presentacion: t(f.presentacion, ''),
    principio_activo: t(f.principio_activo, ''),
    clase_terapeutica: t(f.clase_terapeutica, ''),
    clasificacion_portafolio: t(f.categoria, ''),
    laboratorio: t(f.laboratorio, ''),
    empaque_minimo: n(f.empaque_minimo, 1),
    es_prioritario: f.es_prioritario === true,
    activo: f.activo !== false,
  };
}

export function drogueriaDesdeV3(f: Fila): Record<string, unknown> {
  return {
    id: t(f.codigo),
    codigo_drogueria: t(f.codigo),
    nombre_drogueria: t(f.nombre),
    rif: t(f.rif, ''),
    email_pedidos: t(f.email_pedidos, ''),
    telefono: t(f.telefono, ''),
    tiempo_entrega_promedio_dias: n(f.dias_entrega, 2),
    formato_csv_config: f.formato_export ? formatoExportALegado(f.formato_export as FormatoExport) : undefined,
    activo: f.activo !== false,
  };
}

/**
 * Combina lo local con lo descargado por clave natural, sin perder nada local:
 *  - claves nuevas de la nube se agregan;
 *  - en claves comunes, `prioridad: 'nube'` actualiza los campos con lo de la nube conservando el id local;
 *    `'local'` deja la fila local intacta (droguerías: el layout de exportación se edita en pantalla);
 *  - lo que solo existe localmente se conserva (puede estar pendiente de subir).
 */
export function fusionarPorClave<T extends { id: string }>(locales: T[], nube: T[], clave: (x: T) => string, prioridad: 'nube' | 'local'): T[] {
  const porClave = new Map(nube.map((x) => [clave(x), x]));
  const resultado = locales.map((l) => {
    const k = clave(l);
    const remoto = porClave.get(k);
    if (!remoto) return l;
    porClave.delete(k);
    return prioridad === 'nube' ? ({ ...l, ...remoto, id: l.id } as T) : l;
  });
  return [...resultado, ...porClave.values()];
}

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
}

/**
 * Perfil autorizado del usuario que inició sesión, tomado de dim_usuarios (lo fija un administrador).
 * NUNCA se lee el rol de los metadatos de la cuenta (user_metadata): los escribe quien se registra.
 * Devuelve null si la cuenta no tiene fila (aún no fue dada de alta).
 */
export async function cargarPerfilUsuario(sb: SupabaseClient, id: string): Promise<PerfilUsuario | null> {
  const { data, error } = await sb.from('dim_usuarios').select('nombre_completo, rol, activo, telefono, dim_equipos(codigo)').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const equipo = (data as { dim_equipos?: { codigo?: string } | null }).dim_equipos;
  return {
    nombre_completo: data.nombre_completo as string,
    rol: rolDesdeV3(data.rol as string),
    equipo: equipoDesdeV3(equipo?.codigo),
    telefono: (data.telefono as string | null) ?? undefined,
    activo: data.activo === true,
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
}

async function rpcPorLotes<T>(sb: SupabaseClient, funcion: string, filas: T[], tamano: number, onProgreso?: (hechas: number) => void): Promise<void> {
  for (let i = 0; i < filas.length; i += tamano) {
    const { error } = await sb.rpc(funcion, { p: filas.slice(i, i + tamano) });
    if (error) throw new Error(`${funcion}: ${error.message}`);
    onProgreso?.(Math.min(i + tamano, filas.length));
  }
}

export const importarCatalogoClientes = (sb: SupabaseClient, clientes: Cliente[]) =>
  rpcPorLotes(sb, 'importar_catalogo_clientes', clientes.filter((c) => c.ident01 || c.codigo_cliente).map(clienteAV3), LOTE_CATALOGO);

export const importarCatalogoProductos = (sb: SupabaseClient, productos: Producto[]) =>
  rpcPorLotes(sb, 'importar_catalogo_productos', productos.filter((p) => p.codigo || p.sku).map(productoAV3), LOTE_CATALOGO);

export async function guardarDroguerias(sb: SupabaseClient, droguerias: Drogueria[]): Promise<void> {
  if (droguerias.length === 0) return;
  const { error } = await sb.from('dim_droguerias').upsert(droguerias.map(drogueriaAV3), { onConflict: 'codigo' });
  if (error) throw new Error(`dim_droguerias: ${error.message}`);
}

export interface ResultadoHomologacion {
  clientes: number;
  productos: number;
  omitidos: Array<Record<string, unknown>>;
}

/** Homologación por clave natural: farmacias (alias por droguería) y productos (Cod SAP <-> código de la droguería). */
export async function importarHomologacion(
  sb: SupabaseClient,
  entrada: { alias?: ClienteDrogueriaAlias[]; mapeos?: ProductoDrogueriaMapeo[] }
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
 * (y deja lo demás como pendiente de homologar).
 */
export async function importarVentas(
  sb: SupabaseClient,
  historico: HistoricoPedidoPrevio[],
  onProgreso?: (enviadas: number, total: number) => void
): Promise<ResumenImportacionVentas> {
  const porArchivo = new Map<string, HistoricoPedidoPrevio[]>();
  for (const h of historico) {
    const archivo = h.archivo_origen || 'historico_acumulado.csv';
    porArchivo.set(archivo, [...(porArchivo.get(archivo) ?? []), h]);
  }
  const resumen: ResumenImportacionVentas = { insertadas: 0, recibidas: 0, droguerias_desconocidas: [], clientes_enlazados: 0, productos_enlazados: 0, codigos_aprendidos: 0 };
  const desconocidas = new Set<string>();
  let enviadas = 0;
  for (const [archivo, filasArchivo] of porArchivo) {
    const filas = filasArchivo.map((h, i) => ({
      n: i + 1,
      fecha: h.fecha_pedido,
      drogueria: h.nombre_drogueria || h.drogueria_id,
      cod_cliente: h.cod_cliente_drogueria || null,
      nombre_cliente: h.nombre_cliente || null,
      cod_producto: h.codigo_producto_drogueria || h.cod_sap || h.producto_id,
      nombre_producto: h.nombre_producto || null,
      cod_sap: h.cod_sap || null,
      unidades: Number.isFinite(Number(h.cantidad_facturada)) ? Math.round(Number(h.cantidad_facturada)) : 0,
    }));
    const lote = { archivo, checksum: checksumLote(archivo, filas) };
    for (let i = 0; i < filas.length; i += LOTE_VENTAS) {
      const trozo = filas.slice(i, i + LOTE_VENTAS);
      const { data, error } = await sb.rpc('importar_ventas_drogueria', { p_lote: lote, p_filas: trozo });
      if (error) throw new Error(`importar_ventas_drogueria: ${error.message}`);
      const r = data as { insertadas: number; recibidas: number; droguerias_desconocidas: string[]; homologacion: Record<string, number> };
      resumen.insertadas += r.insertadas;
      resumen.recibidas += r.recibidas;
      r.droguerias_desconocidas.forEach((d) => desconocidas.add(d));
      resumen.clientes_enlazados += r.homologacion?.clientes_enlazados ?? 0;
      resumen.productos_enlazados += r.homologacion?.productos_enlazados ?? 0;
      resumen.codigos_aprendidos += r.homologacion?.codigos_aprendidos ?? 0;
      enviadas += trozo.length;
      onProgreso?.(enviadas, historico.length);
    }
  }
  resumen.droguerias_desconocidas = [...desconocidas];
  return resumen;
}

export async function contarVentasNube(sb: SupabaseClient): Promise<number> {
  const { count, error } = await sb.from('fact_ventas_drogueria').select('*', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
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

export interface CatalogosNube {
  clientes: Record<string, unknown>[];
  productos: Record<string, unknown>[];
  droguerias: Record<string, unknown>[];
}

/** Descarga los catálogos maestros (v3) con la forma de las pantallas clásicas. Con RLS, sin sesión devuelve vacío. */
export async function descargarCatalogosNube(sb: SupabaseClient): Promise<CatalogosNube> {
  const [clientes, productos, droguerias] = await Promise.all([
    paginar((a, b) =>
      sb.from('dim_clientes')
        .select('codigo_interno,razon_social,nombre_comercial,rif,brick,municipio,estado_geografico,direccion,telefono,bandera,lat,lon,frecuencia_dias,estado_validacion')
        .is('deleted_at', null).not('codigo_interno', 'is', null).order('codigo_interno').range(a, b)
    ),
    paginar((a, b) =>
      sb.from('dim_productos').select('sku,ean13,nombre_comercial,presentacion,principio_activo,clase_terapeutica,categoria,laboratorio,empaque_minimo,es_prioritario,activo')
        .is('deleted_at', null).order('sku').range(a, b)
    ),
    paginar((a, b) =>
      sb.from('dim_droguerias').select('codigo,nombre,rif,email_pedidos,telefono,dias_entrega,formato_export,activo').is('deleted_at', null).order('codigo').range(a, b)
    ),
  ]);
  return { clientes: clientes.map(clienteDesdeV3), productos: productos.map(productoDesdeV3), droguerias: droguerias.map(drogueriaDesdeV3) };
}

// ---------------------------------------------------------------------------- bajas desde las pantallas de edición

async function bajaLogica(sb: SupabaseClient, tabla: 'dim_clientes' | 'dim_productos' | 'dim_droguerias', columna: string, valor: string): Promise<void> {
  const { error } = await sb.from(tabla).update({ deleted_at: new Date().toISOString() }).eq(columna, valor);
  if (error) throw new Error(`${tabla}: ${error.message}`);
}
export const eliminarClienteNube = (sb: SupabaseClient, codigoInterno: string) => bajaLogica(sb, 'dim_clientes', 'codigo_interno', codigoInterno);
export const eliminarProductoNube = (sb: SupabaseClient, sku: string) => bajaLogica(sb, 'dim_productos', 'sku', sku);
export const eliminarDrogueriaNube = (sb: SupabaseClient, codigo: string) => bajaLogica(sb, 'dim_droguerias', 'codigo', codigo);
