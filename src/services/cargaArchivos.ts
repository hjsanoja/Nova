// Lectura y validación de los archivos que carga el administrador (droguerías, farmacias, productos).
// Regla: NUNCA se inventan datos. Si falta un dato obligatorio la fila se descarta y se dice por qué; si falta uno
// opcional queda vacío (antes se rellenaban RIF, GPS, correos, páginas web y códigos de barras de ejemplo).
import type { Cliente, Drogueria, Producto } from '../types/pharmacy';
import { crearLectorColumnas } from './importUtils';

export type FilaCsv = Record<string, string>;

export interface Descarte {
  /** Número de línea en el archivo (la 1 es el encabezado). */
  linea: number;
  motivo: string;
}

export interface Preparacion<T> {
  registros: T[];
  descartes: Descarte[];
  /** Filas repetidas dentro del mismo archivo (misma clave): se toma la última. */
  repetidas: number;
}

/** Separa una línea CSV respetando comillas ("a;b" es un solo campo; "" dentro de comillas es una comilla). */
function partirLinea(linea: string, sep: string): string[] {
  const campos: string[] = [];
  let actual = '';
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (enComillas) {
      if (ch === '"') {
        if (linea[i + 1] === '"') { actual += '"'; i++; } else enComillas = false;
      } else actual += ch;
    } else if (ch === '"') enComillas = true;
    else if (ch === sep) { campos.push(actual.trim()); actual = ''; }
    else actual += ch;
  }
  campos.push(actual.trim());
  return campos;
}

/** El separador es el que más aparece en el encabezado (fuera de comillas). */
function detectarSeparador(encabezado: string): string {
  const sinComillas = encabezado.replace(/"[^"]*"/g, '');
  let mejor = ',';
  let max = 0;
  for (const sep of [';', '\t', ',', '|']) {
    const n = sinComillas.split(sep).length - 1;
    if (n > max) { max = n; mejor = sep; }
  }
  return mejor;
}

export interface CsvLeido {
  encabezados: string[];
  filas: FilaCsv[];
  /** Línea del archivo de cada fila (para decir dónde está un error). */
  lineas: number[];
  separador: string;
}

/** Lee un CSV (con o sin BOM; separador ; , tab o |). Ignora líneas vacías. */
export function leerCsv(texto: string): CsvLeido {
  const lineasTexto = texto.replace(/^﻿/, '').split(/\r?\n/);
  const primera = lineasTexto.findIndex((l) => l.trim() !== '');
  if (primera < 0) return { encabezados: [], filas: [], lineas: [], separador: ';' };
  const separador = detectarSeparador(lineasTexto[primera]);
  const encabezados = partirLinea(lineasTexto[primera], separador).map((h) => h.replace(/^["']|["']$/g, '').trim());
  const filas: FilaCsv[] = [];
  const lineas: number[] = [];
  for (let i = primera + 1; i < lineasTexto.length; i++) {
    const l = lineasTexto[i];
    if (l.trim() === '' || l.replace(new RegExp(`[${separador === '\t' ? '\\t' : separador}\\s"]`, 'g'), '') === '') continue;
    const campos = partirLinea(l, separador);
    const fila: FilaCsv = {};
    encabezados.forEach((h, j) => { fila[h] = campos[j] ?? ''; });
    filas.push(fila);
    lineas.push(i + 1);
  }
  return { encabezados, filas, lineas, separador };
}

/** Número con coma o punto decimal; null si no es un número. */
export function numero(v: string): number | null {
  const t = (v ?? '').trim().replace(/\s/g, '');
  if (!t) return null;
  // Con punto y coma a la vez, el último es el decimal (1.234,5 o 1,234.5). Con uno solo repetido, es de miles.
  let normal = t;
  const ultPunto = t.lastIndexOf('.');
  const ultComa = t.lastIndexOf(',');
  if (ultPunto >= 0 && ultComa >= 0) normal = ultComa > ultPunto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (ultComa >= 0) normal = t.indexOf(',') === ultComa ? t.replace(',', '.') : t.replace(/,/g, '');
  else if (ultPunto >= 0 && t.indexOf('.') !== ultPunto) normal = t.replace(/\./g, '');
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

function preparar<T>(leido: CsvLeido, clave: (r: T) => string, convertir: (f: FilaCsv, col: ReturnType<typeof crearLectorColumnas>) => T | string): Preparacion<T> {
  const col = crearLectorColumnas(leido.filas[0]);
  const porClave = new Map<string, T>();
  const descartes: Descarte[] = [];
  let repetidas = 0;
  leido.filas.forEach((f, i) => {
    const r = convertir(f, col);
    if (typeof r === 'string') {
      descartes.push({ linea: leido.lineas[i] ?? i + 2, motivo: r });
      return;
    }
    const k = clave(r).toUpperCase();
    if (porClave.has(k)) repetidas++;
    porClave.set(k, r);
  });
  return { registros: [...porClave.values()], descartes, repetidas };
}

const COLUMNAS_POR_DEFECTO_EXPORT: Drogueria['formato_csv_config'] = {
  delimitador: ';',
  incluir_encabezados: true,
  entrecomillado: 'solo_texto',
  codificacion: 'UTF-8',
  salto_linea: '\r\n',
  formato_decimal: 'coma',
  columnas: [
    { campo_origen: 'codigo_cliente', nombre_encabezado: 'COD_CLIENTE', orden: 1, formato: 'texto' },
    { campo_origen: 'sku', nombre_encabezado: 'COD_PRODUCTO', orden: 2, formato: 'texto' },
    { campo_origen: 'cantidad_confirmada', nombre_encabezado: 'CANTIDAD', orden: 3, formato: 'entero' },
    { campo_origen: 'numero_pedido', nombre_encabezado: 'PEDIDO', orden: 4, formato: 'texto' },
  ],
};

/** Droguerías: obligatorio el nombre. El código, si falta, es el nombre en mayúsculas sin espacios. */
export function prepararDroguerias(leido: CsvLeido, ahora = new Date().toISOString()): Preparacion<Drogueria> {
  return preparar<Drogueria>(leido, (d) => d.codigo_drogueria, (f, col) => {
    const nombre = col(f, ['NOMBRE_DROGUERIA', 'NOMBRE', 'DROGUERIA', 'Droguería', 'Nombre']).trim();
    if (!nombre) return 'Falta el nombre de la droguería';
    const codigo = (col(f, ['CODIGO_DROGUERIA', 'CODIGO', 'Código', 'Codigo']).trim() || nombre.toUpperCase().replace(/[^A-Z0-9]+/g, '')).toUpperCase();
    const delim = col(f, ['DELIMITADOR_CSV', 'DELIMITADOR', 'Delimitador']).trim();
    const dias = numero(col(f, ['DIAS_ENTREGA', 'TIEMPO_ENTREGA', 'Dias de entrega']));
    return {
      id: `drog-${codigo.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      id_numero: numero(col(f, ['ID_NUMERO', 'ID', 'Id'])) ?? 0,
      codigo_drogueria: codigo,
      rif: col(f, ['RIF', 'Rif']).trim(),
      nombre_drogueria: nombre,
      email_pedidos: col(f, ['EMAIL_PEDIDOS', 'EMAIL', 'Correo', 'Email']).trim(),
      pagina_web: col(f, ['PAGINA_WEB', 'Pagina Web', 'PORTAL', 'URL']).trim(),
      telefono: col(f, ['TELEFONO', 'Telefono', 'Teléfono']).trim(),
      tiempo_entrega_promedio_dias: dias !== null && dias >= 0 ? Math.round(dias) : undefined,
      activo: true,
      created_at: ahora,
      formato_csv_config: { ...COLUMNAS_POR_DEFECTO_EXPORT, delimitador: ([';', ',', '|', '\t'] as const).find((d) => d === delim) ?? ';' },
    };
  });
}

/** Farmacias: obligatorios el código interno (ident01) y un nombre (razón social o nombre comercial). */
export function prepararClientes(leido: CsvLeido, ahora = new Date().toISOString()): Preparacion<Cliente> {
  return preparar<Cliente>(leido, (c) => c.ident01, (f, col) => {
    const ident01 = col(f, ['ident01', 'IDENT01', 'ident_01', 'codigo_cliente', 'CODIGO_CLIENTE', 'Codigo interno', 'CODIGO', 'Codigo']).trim();
    if (!ident01) return 'Falta el código interno (ident01)';
    const razon = col(f, ['razon social', 'razón social', 'RAZON_SOCIAL', 'Razon Social']).trim();
    const fantasia = col(f, ['nombre de fantasia', 'nombre de fantasía', 'NOMBRE_FANTASIA', 'nombre comercial', 'NOMBRE_COMERCIAL', 'Farmacia', 'NOMBRE']).trim();
    if (!razon && !fantasia) return `Farmacia ${ident01} sin razón social ni nombre comercial`;
    const municipio = col(f, ['municipio/ ciudad/ alcaldia', 'municipio/ciudad/alcaldia', 'municipio / ciudad / alcaldia', 'municipio', 'ciudad', 'MUNICIPIO', 'CIUDAD']).trim();
    const estado = col(f, ['estado', 'ESTADO', 'Estado']).trim();
    const lat = numero(col(f, ['local_gps_lat', 'lat', 'LAT', 'latitud', 'Latitud']));
    const lon = numero(col(f, ['local_gps_lon', 'lon', 'LON', 'longitud', 'Longitud']));
    const gpsValido = lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
    return {
      id: ident01,
      ident01,
      codigo_cliente: ident01,
      rif: col(f, ['rif', 'RIF', 'Rif']).trim(),
      razon_social: razon || fantasia,
      nombre_fantasia: fantasia || razon,
      nombre_comercial: fantasia || razon,
      brick: col(f, ['brick', 'BRICK', 'Brick', 'ZONA', 'Zona']).trim(),
      municipio_ciudad: municipio,
      ciudad: municipio,
      direccion: col(f, ['direccion', 'dirección', 'DIRECCION', 'Direccion']).trim() || [municipio, estado].filter(Boolean).join(', '),
      estado,
      frecuencia: col(f, ['frecuencia', 'FRECUENCIA', 'Frecuencia']).trim(),
      bandera: col(f, ['bandera', 'BANDERA', 'Bandera', 'CADENA', 'Cadena']).trim(),
      local_gps_lat: gpsValido ? lat : undefined,
      local_gps_lon: gpsValido ? lon : undefined,
      clasificacion_abc: 'B',
      cupo_credito: 0,
      dias_credito: 0,
      telefono: col(f, ['telefono', 'teléfono', 'TELEFONO']).trim(),
      email_contacto: '',
      activo: true,
      created_at: ahora,
    };
  });
}

/** Productos: obligatorios el código (Cod SAP / SKU) y la descripción. */
export function prepararProductos(leido: CsvLeido, ahora = new Date().toISOString()): Preparacion<Producto> {
  return preparar<Producto>(leido, (p) => p.sku, (f, col) => {
    const codigo = col(f, ['Codigo', 'CODIGO', 'Código', 'Cod Sap', 'COD_SAP', 'SKU']).trim();
    if (!codigo) return 'Falta el código del producto';
    const descripcion = col(f, ['Descripcion', 'DESCRIPCION', 'Descripción', 'NOMBRE_COMERCIAL', 'Nombre']).trim();
    const product = col(f, ['Product', 'PRODUCT', 'Producto']).trim();
    if (!descripcion && !product) return `Producto ${codigo} sin descripción`;
    const unidadNegocio = col(f, ['Unidad de Negocio', 'UNIDAD_DE_NEGOCIO', 'UNIDAD DE NEGOCIO', 'LABORATORIO']).trim();
    const clasif = col(f, ['Clasificacion Portafolio', 'CLASIFICACION_PORTAFOLIO', 'Clasificación Portafolio']).trim();
    const estadoRaw = col(f, ['Estado', 'ESTADO']).trim();
    const activo = !/inactiv|descontinu|baja|^i$|^0$|^no$|^false$/i.test(estadoRaw);
    const prioritario = /estrat|lanz|prio|clave/i.test(clasif);
    const empaque = numero(col(f, ['EMPAQUE_MINIMO', 'EMPAQUE', 'Empaque minimo']));
    const un = unidadNegocio.toLowerCase();
    return {
      id: `prod-${codigo}`,
      sku: codigo,
      codigo,
      codigo_barras_ean13: col(f, ['Pack Code', 'PACK_CODE', 'EAN', 'EAN13', 'CODIGO_EAN13', 'Codigo de barras']).trim(),
      principio_activo: col(f, ['Concatenate Molecule (Spanish)', 'Molecula', 'Molécula', 'PRINCIPIO_ACTIVO', 'Principio activo']).trim(),
      nombre_comercial: product || descripcion,
      presentacion: col(f, ['Pack', 'PACK', 'PRESENTACION', 'Presentación']).trim(),
      laboratorio: unidadNegocio,
      precio_lista: 0,
      descuento_maximo_porc: 0,
      es_prioritario: prioritario,
      factor_prioridad: prioritario ? 1.3 : 1,
      empaque_minimo: empaque && empaque > 0 ? Math.round(empaque) : 1,
      stock_disponible: 0,
      equipo_asignado: un.includes('comercial') ? 'Comercial' : un.includes('otc') ? 'OTC' : 'La Sante',
      activo,
      created_at: ahora,
      descripcion: descripcion || product,
      unidad_negocio: unidadNegocio,
      clase_terapeutica: col(f, ['Clase Terapeutica', 'CLASE_TERAPEUTICA', 'Clase Terapéutica']).trim(),
      sistemas: col(f, ['Sistemas', 'SISTEMAS']).trim(),
      clasificacion_portafolio: clasif,
      product_code: col(f, ['Product Code', 'PRODUCT_CODE']).trim(),
      product: product || descripcion,
      pack_code: col(f, ['Pack Code', 'PACK_CODE']).trim(),
      pack: col(f, ['Pack', 'PACK']).trim(),
      molecula: col(f, ['Concatenate Molecule (Spanish)', 'Molecula', 'Molécula']).trim(),
      estado_texto: estadoRaw || 'Activo',
    };
  });
}

/** Fecha de un reporte de ventas: AAAA-MM-DD, DD/MM/AAAA, DD-MM-AAAA (con o sin hora), AAAA-MM (día 15) o solo el día
 *  (con el mes del nombre del archivo). Devuelve AAAA-MM-DD o null si no es una fecha válida. */
export function fechaVenta(raw: string, mesDelArchivo?: string): string | null {
  const t = (raw ?? '').trim().split(/\s+/)[0].replace(/\./g, '/');
  if (!t) return null;
  let a: string | undefined, m: string | undefined, d: string | undefined;
  let p: RegExpMatchArray | null;
  if ((p = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/))) [, a, m, d] = p;
  else if ((p = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/))) { [, d, m, a] = p; if (a.length === 2) a = `20${a}`; }
  else if ((p = t.match(/^(\d{4})[-/](\d{1,2})$/))) { [, a, m] = p; d = '15'; }
  else if ((p = t.match(/^(\d{1,2})$/)) && mesDelArchivo && /^\d{4}-\d{2}$/.test(mesDelArchivo)) { [a, m] = mesDelArchivo.split('-'); d = p[1]; }
  else return null;
  const iso = `${a}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  const f = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(f.getTime()) || f.toISOString().slice(0, 10) !== iso ? null : iso;
}
