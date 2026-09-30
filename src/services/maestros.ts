// Datos maestros en la nube para las pantallas del administrador (farmacias, productos, droguerías, usuarios).
// Se leen y escriben directamente en Supabase (el administrador trabaja con conexión); los dispositivos de campo los
// reciben por la sincronización. Las bajas son lógicas y volver a cargar el mismo código reactiva el registro.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FormatoExport } from '../offline/types';

export type TipoMaestro = 'clientes' | 'productos' | 'droguerias' | 'reglas';

export interface FilaFarmacia {
  codigo_interno: string;
  razon_social: string;
  nombre_comercial: string;
  rif: string | null;
  brick: string | null;
  municipio: string | null;
  estado_geografico: string | null;
  direccion: string | null;
  telefono: string | null;
  bandera: string | null;
  frecuencia_dias: number | null;
  lat: number | null;
  lon: number | null;
}

export interface FilaProducto {
  sku: string;
  nombre_comercial: string;
  presentacion: string | null;
  principio_activo: string | null;
  laboratorio: string | null;
  categoria: string | null;
  clase_terapeutica: string | null;
  ean13: string | null;
  empaque_minimo: number;
  es_prioritario: boolean;
  activo: boolean;
  foto_url: string | null;
}

export interface FilaDrogueria {
  codigo: string;
  nombre: string;
  rif: string | null;
  email_pedidos: string | null;
  telefono: string | null;
  dias_entrega: number | null;
  activo: boolean;
  delimitador: string;
}

const PAGINA = 1000;

async function todas<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const salida: T[] = [];
  for (let p = 0; p < 200; p++) {
    const { data, error } = await consulta(p * PAGINA, (p + 1) * PAGINA - 1);
    if (error) throw new Error(error.message);
    salida.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGINA) break;
  }
  return salida;
}

export const listarFarmacias = (sb: SupabaseClient) =>
  todas<FilaFarmacia>((a, b) =>
    sb.from('dim_clientes')
      .select('codigo_interno,razon_social,nombre_comercial,rif,brick,municipio,estado_geografico,direccion,telefono,bandera,frecuencia_dias,lat,lon')
      .is('deleted_at', null).not('codigo_interno', 'is', null).order('nombre_comercial').range(a, b));

export const listarProductos = (sb: SupabaseClient) =>
  todas<FilaProducto>((a, b) =>
    sb.from('dim_productos')
      .select('sku,nombre_comercial,presentacion,principio_activo,laboratorio,categoria,clase_terapeutica,ean13,empaque_minimo,es_prioritario,activo,foto_url')
      .is('deleted_at', null).order('nombre_comercial').range(a, b));

export async function listarDroguerias(sb: SupabaseClient): Promise<FilaDrogueria[]> {
  const filas = await todas<FilaDrogueria & { formato_export?: { delimitador?: string } }>((a, b) =>
    sb.from('dim_droguerias').select('codigo,nombre,rif,email_pedidos,telefono,dias_entrega,activo,formato_export').is('deleted_at', null).order('nombre').range(a, b));
  return filas.map(({ formato_export, ...d }) => ({ ...d, delimitador: formato_export?.delimitador || ';' }));
}

async function rpcNumero(sb: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<number> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message || `Error en ${fn}`);
  return typeof data === 'number' ? data : 0;
}

/** Baja de varios registros por su clave (código interno, SKU, código de droguería o id de regla). */
export const eliminarRegistros = (sb: SupabaseClient, tipo: TipoMaestro, claves: string[]) =>
  rpcNumero(sb, 'eliminar_registros', { p_tipo: tipo, p_claves: claves });

export const eliminarUsuarios = (sb: SupabaseClient, ids: string[]) => rpcNumero(sb, 'admin_eliminar_usuarios', { p_ids: ids });

/** Crea o actualiza una farmacia por su código interno. */
export const guardarFarmacia = (sb: SupabaseClient, f: FilaFarmacia) => rpcNumero(sb, 'importar_catalogo_clientes', { p: [f] });

/** Crea o actualiza un producto por su SKU (Cod SAP). */
export const guardarProducto = (sb: SupabaseClient, p: FilaProducto) => rpcNumero(sb, 'importar_catalogo_productos', { p: [p] });

/** Crea o actualiza una droguería por su código (incluye el separador del archivo de pedidos). */
export const guardarDrogueria = (sb: SupabaseClient, d: FilaDrogueria) => rpcNumero(sb, 'importar_catalogo_droguerias', { p: [d] });

/** Formato del archivo de pedido de una droguería (lo que descarga la mesa al procesar). */
export async function leerFormatoDrogueria(sb: SupabaseClient, codigo: string): Promise<FormatoExport> {
  const { data, error } = await sb.from('dim_droguerias').select('formato_export').eq('codigo', codigo).single();
  if (error) throw new Error(error.message);
  return (data as { formato_export: FormatoExport }).formato_export;
}

/** Problemas del formato antes de guardarlo (los mismos que rechaza la base). Vacío = válido. */
export function problemasFormato(f: FormatoExport): string[] {
  const p: string[] = [];
  if (f.columnas.length === 0) p.push('Agrega al menos una columna.');
  if (f.formato === 'txt' && f.delimitador === '' && f.columnas.some((c) => !c.ancho)) p.push('En un archivo de ancho fijo cada columna necesita su ancho.');
  if (f.formato === 'csv' && f.delimitador === '') p.push('Elige el separador de columnas.');
  if (f.encabezado && f.columnas.some((c) => !c.encabezado.trim())) p.push('Cada columna necesita su título (o quita la fila de títulos).');
  if (!f.extension.trim()) p.push('Escribe la extensión del archivo (csv, txt…).');
  return p;
}

export async function guardarFormatoDrogueria(sb: SupabaseClient, codigo: string, formato: FormatoExport): Promise<void> {
  const problemas = problemasFormato(formato);
  if (problemas.length) throw new Error(problemas.join(' '));
  const { error } = await sb.from('dim_droguerias').update({ formato_export: formato }).eq('codigo', codigo);
  if (error) throw new Error(error.message);
}

/** Texto normalizado para buscar sin tildes ni mayúsculas. */
export const normalizarBusqueda = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Filtra por varias palabras: todas deben aparecer en alguno de los campos. */
export function filtrarPorTexto<T>(filas: T[], texto: string, campos: (f: T) => Array<string | null | undefined>): T[] {
  const palabras = normalizarBusqueda(texto).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return filas;
  return filas.filter((f) => {
    const blob = normalizarBusqueda(campos(f).filter(Boolean).join(' '));
    return palabras.every((p) => blob.includes(p));
  });
}

// ---------------------------------------------------------------------------- condiciones comerciales

export interface FilaRegla {
  id?: string;
  nombre: string;
  alcance: 'linea' | 'pedido';
  descuento_max_pct: number;
  min_skus_distintos: number | null;
  min_unidades_totales: number | null;
  drogueria_id: string | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  prioridad: number;
  activo: boolean;
}

export async function listarReglas(sb: SupabaseClient): Promise<FilaRegla[]> {
  const { data, error } = await sb.from('config_reglas_comerciales')
    .select('id,nombre,alcance,descuento_max_pct,min_skus_distintos,min_unidades_totales,drogueria_id,vigente_desde,vigente_hasta,prioridad,activo')
    .is('deleted_at', null).order('descuento_max_pct');
  if (error) throw new Error(error.message);
  return ((data ?? []) as FilaRegla[]).map((r) => ({ ...r, descuento_max_pct: Number(r.descuento_max_pct) }));
}

/** Crea (sin id) o actualiza una condición comercial. */
export async function guardarRegla(sb: SupabaseClient, r: FilaRegla): Promise<void> {
  const { id, ...datos } = r;
  const { error } = id
    ? await sb.from('config_reglas_comerciales').update(datos).eq('id', id)
    : await sb.from('config_reglas_comerciales').insert(datos);
  if (error) throw new Error(error.message);
}

/** Droguerías con su id (las condiciones comerciales guardan el id, no el código). */
export async function listarDrogueriasConId(sb: SupabaseClient): Promise<{ id: string; nombre: string }[]> {
  const { data, error } = await sb.from('dim_droguerias').select('id,nombre').is('deleted_at', null).order('nombre');
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; nombre: string }[];
}
