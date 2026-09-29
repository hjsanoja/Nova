import type { NovaDB } from './db';
import type { LocalCliente, LocalProducto } from './types';

/** Minúsculas, sin acentos y solo letras/números separados por un espacio. */
export function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Palabras únicas (≥ 2 caracteres) de los textos dados, más el SKU y el EAN completos. */
export function tokensDe(...partes: (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  for (const parte of partes) {
    for (const palabra of normalizar(parte).split(' ')) {
      if (palabra.length >= 2) set.add(palabra);
    }
  }
  return Array.from(set);
}

export function tokensProducto(p: {
  sku: string;
  ean13?: string | null;
  nombre_comercial: string;
  principio_activo?: string | null;
  presentacion?: string | null;
}): string[] {
  return tokensDe(p.nombre_comercial, p.principio_activo, p.presentacion, p.sku, p.ean13);
}

export function textoBusquedaCliente(c: {
  razon_social: string;
  nombre_comercial: string;
  rif?: string | null;
  codigo_interno?: string | null;
  brick?: string | null;
}): string {
  return normalizar([c.nombre_comercial, c.razon_social, c.rif, c.codigo_interno, c.brick].filter(Boolean).join(' '));
}

const soloDigitos = /^\d{6,14}$/;

/**
 * Búsqueda de productos por prefijo de palabra. Usa el índice multiEntry `tokens`:
 * se parte de la palabra más larga (la más selectiva) y el resto se verifica en memoria.
 */
export async function buscarProductos(db: NovaDB, consulta: string, limite = 30): Promise<LocalProducto[]> {
  const q = normalizar(consulta);
  if (!q) return [];

  if (soloDigitos.test(q)) {
    const porCodigo = await buscarPorCodigo(db, q);
    if (porCodigo) return [porCodigo];
  }

  const palabras = q.split(' ');
  const base = palabras.reduce((a, b) => (b.length > a.length ? b : a));
  const candidatos = await db.productos
    .where('tokens')
    .startsWith(base)
    .distinct()
    .filter((p) => p.activo && palabras.every((w) => p.tokens.some((t) => t.startsWith(w))))
    .limit(limite * 4)
    .toArray();

  candidatos.sort(
    (a, b) =>
      Number(b.es_prioritario) - Number(a.es_prioritario) ||
      // Coincidencia exacta de nombre primero, luego los nombres más cortos.
      Number(normalizar(b.nombre_comercial).startsWith(q)) - Number(normalizar(a.nombre_comercial).startsWith(q)) ||
      a.nombre_comercial.length - b.nombre_comercial.length
  );
  return candidatos.slice(0, limite);
}

/** Lectura de código de barras: EAN13 exacto o SKU. */
export async function buscarPorCodigo(db: NovaDB, codigo: string): Promise<LocalProducto | undefined> {
  const limpio = codigo.trim();
  if (!limpio) return undefined;
  const porEan = await db.productos.where('ean13').equals(limpio).first();
  if (porEan) return porEan;
  return db.productos.where('sku').equalsIgnoreCase(limpio).first();
}

export async function buscarClientes(db: NovaDB, consulta: string, limite = 25): Promise<LocalCliente[]> {
  const q = normalizar(consulta);
  const palabras = q ? q.split(' ') : [];
  return db.clientes
    .filter((c) => c.estado_validacion !== 'inactivo' && palabras.every((w) => c.busqueda.includes(w)))
    .limit(limite)
    .toArray();
}
