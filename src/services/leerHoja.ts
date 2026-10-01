// Lectura de archivos de las droguerías como una tabla de texto (filas × columnas), sin librerías externas:
//  - CSV y TXT con separador (; , tab |), en UTF-8 o Windows (ANSI);
//  - Excel moderno (.xlsx): es un ZIP con XML adentro; se lee la primera hoja (o la indicada).
// El Excel antiguo (.xls) no se puede leer: se pide guardarlo como .xlsx o .csv.
import { detectarSeparador, partirLinea } from './cargaArchivos';

export interface Tabla {
  /** Filas tal como vienen, sin quitar títulos ni filas vacías intermedias (las vacías del final sí se quitan). */
  filas: string[][];
  tipo: 'csv' | 'xlsx';
  /** Nombres de las hojas (solo Excel). */
  hojas?: string[];
}

export class ErrorArchivo extends Error {}

/* ---------------------------------- texto ---------------------------------- */

/** UTF-8 si es válido; si no, Windows-1252 (los archivos "ANSI" que exporta Excel en español). */
export function decodificarTexto(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** CSV/TXT: el separador es el que más se repite en las primeras líneas con datos (fuera de comillas). */
export function leerTextoTabla(texto: string): string[][] {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/);
  const muestra = lineas.filter((l) => l.trim() !== '').slice(0, 10);
  const conteo = new Map<string, number>();
  for (const l of muestra) {
    const s = detectarSeparador(l);
    conteo.set(s, (conteo.get(s) ?? 0) + 1);
  }
  const sep = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ';';
  const filas = lineas.map((l) => (l.trim() === '' ? [] : partirLinea(l, sep)));
  return recortar(filas);
}

const recortar = (filas: string[][]) => {
  let fin = filas.length;
  while (fin > 0 && filas[fin - 1].every((c) => c.trim() === '')) fin--;
  return filas.slice(0, fin);
};

/* ----------------------------------- zip ----------------------------------- */

const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

async function inflar(datos: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new ErrorArchivo('Este navegador no puede abrir archivos de Excel. Guárdalo como CSV.');
  const flujo = new Blob([datos as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

/** Archivos de un ZIP por nombre (solo los que se piden, para no descomprimir imágenes ni estilos). */
export async function leerZip(bytes: Uint8Array, quiero: (nombre: string) => boolean): Promise<Map<string, Uint8Array>> {
  let fin = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (u32(bytes, i) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new ErrorArchivo('El archivo no es un Excel válido (.xlsx).');
  const total = u16(bytes, fin + 10);
  let p = u32(bytes, fin + 16);
  const salida = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let k = 0; k < total; k++) {
    if (u32(bytes, p) !== 0x02014b50) throw new ErrorArchivo('El archivo de Excel está dañado.');
    const metodo = u16(bytes, p + 10);
    const comprimido = u32(bytes, p + 20);
    const largoNombre = u16(bytes, p + 28);
    const extra = u16(bytes, p + 30);
    const comentario = u16(bytes, p + 32);
    const local = u32(bytes, p + 42);
    const nombre = decoder.decode(bytes.subarray(p + 46, p + 46 + largoNombre));
    p += 46 + largoNombre + extra + comentario;
    if (!quiero(nombre)) continue;
    const inicio = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    const datos = bytes.subarray(inicio, inicio + comprimido);
    if (metodo === 0) salida.set(nombre, datos);
    else if (metodo === 8) salida.set(nombre, await inflar(datos));
    else throw new ErrorArchivo('El Excel usa una compresión que NOVA no reconoce. Guárdalo de nuevo o como CSV.');
  }
  return salida;
}

/* ----------------------------------- xlsx ---------------------------------- */

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const desescapar = (t: string) =>
  t.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTIDADES[e] ?? m
  );

/** Texto de un nodo con posibles fragmentos con formato (<r><t>…</t></r>); ignora la guía fonética (<rPh>). */
const textoDe = (xml: string) => desescapar([...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));

const atributo = (attrs: string, nombre: string) => new RegExp(`\\b${nombre}="([^"]*)"`).exec(attrs)?.[1];

/** "B12" → 1 (columna B, base 0). */
export const indiceColumna = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '').toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** Números de Excel como texto: enteros sin decimales y sin errores de coma flotante (10.000000001 → 10). */
const textoNumero = (v: string) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  if (/^-?\d+$/.test(v)) return v;
  return String(Number(n.toFixed(6)));
};

export async function leerXlsx(bytes: Uint8Array, hoja?: string): Promise<Tabla> {
  const archivos = await leerZip(bytes, (n) => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  const texto = (n: string) => (archivos.has(n) ? new TextDecoder().decode(archivos.get(n)) : '');
  const libro = texto('xl/workbook.xml');
  if (!libro) throw new ErrorArchivo('El archivo no es un Excel válido (.xlsx).');
  const hojas = [...libro.matchAll(/<sheet\b([^>]*)\/?>/g)].map((m) => ({ nombre: desescapar(atributo(m[1], 'name') ?? ''), rid: atributo(m[1], 'r:id') ?? '' }));
  const rels = new Map([...texto('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => [atributo(m[1], 'Id') ?? '', atributo(m[1], 'Target') ?? '']));
  const elegida = (hoja ? hojas.find((h) => h.nombre.toLowerCase() === hoja.toLowerCase()) : undefined) ?? hojas[0];
  let ruta = elegida ? rels.get(elegida.rid) ?? '' : '';
  ruta = ruta.startsWith('/') ? ruta.slice(1) : `xl/${ruta.replace(/^\.\//, '')}`;
  const xml = texto(ruta) || texto('xl/worksheets/sheet1.xml');
  if (!xml) throw new ErrorArchivo('No se encontró ninguna hoja con datos en el Excel.');

  const compartidos = [...texto('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textoDe(m[1]));
  const filas: string[][] = [];
  for (const fila of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(atributo(fila[1], 'r')) - 1;
    const celdas: string[] = [];
    let siguiente = 0;
    for (const c of (fila[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = atributo(c[1], 'r');
      const col = ref ? indiceColumna(ref) : siguiente;
      siguiente = col + 1;
      const tipo = atributo(c[1], 't');
      const cuerpo = c[2] ?? '';
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
      let valor = '';
      if (tipo === 's') valor = compartidos[Number(v)] ?? '';
      else if (tipo === 'inlineStr') valor = textoDe(cuerpo);
      else if (tipo === 'b') valor = v === '1' ? 'VERDADERO' : 'FALSO';
      else if (tipo === 'str' || tipo === 'e') valor = desescapar(v ?? '');
      else if (v !== undefined) valor = textoNumero(v);
      celdas[col] = valor.trim();
    }
    filas[Number.isInteger(r) && r >= 0 ? r : filas.length] = Array.from(celdas, (x) => x ?? '');
  }
  return { filas: recortar(Array.from(filas, (f) => f ?? [])), tipo: 'xlsx', hojas: hojas.map((h) => h.nombre) };
}

/* --------------------------------- entrada --------------------------------- */

/** Lee un archivo elegido por la persona: Excel (.xlsx) o texto (CSV/TXT). */
export async function leerTabla(nombre: string, bytes: Uint8Array, hoja?: string): Promise<Tabla> {
  const esZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const esXlsAntiguo = bytes[0] === 0xd0 && bytes[1] === 0xcf;
  if (esXlsAntiguo || (/\.xls$/i.test(nombre) && !esZip)) {
    throw new ErrorArchivo('Es un Excel antiguo (.xls). Ábrelo en Excel y guárdalo como "Libro de Excel (.xlsx)" o como CSV.');
  }
  if (esZip) return leerXlsx(bytes, hoja);
  return { filas: leerTextoTabla(decodificarTexto(bytes)), tipo: 'csv' };
}

export async function leerArchivoTabla(archivo: File, hoja?: string): Promise<Tabla> {
  return leerTabla(archivo.name, new Uint8Array(await archivo.arrayBuffer()), hoja);
}
