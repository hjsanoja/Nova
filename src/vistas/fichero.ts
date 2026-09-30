/** Lectura de un CSV de asignación de fichero: código de la farmacia + correo del vendedor. */

export interface ResultadoFichero {
  /** correo (minúsculas) -> códigos de farmacia */
  porVendedor: Map<string, string[]>;
  errores: string[];
}

export function parsearFichero(texto: string): ResultadoFichero {
  const porVendedor = new Map<string, string[]>();
  const errores: string[] = [];
  const filas = texto.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (filas.length === 0) return { porVendedor, errores: ['El archivo está vacío.'] };
  const sep = (filas[0].match(/;/g)?.length ?? 0) >= (filas[0].match(/,/g)?.length ?? 0) && filas[0].includes(';') ? ';' : filas[0].includes(',') ? ',' : '\t';
  const limpiar = (v: string) => v.trim().replace(/^"|"$/g, '').trim();
  filas.forEach((linea, i) => {
    const [codigo, correo] = linea.split(sep).map(limpiar);
    // Encabezado (primera fila sin arroba en el correo)
    if (i === 0 && !(correo ?? '').includes('@')) return;
    if (!codigo || !correo) return void errores.push(`Fila ${i + 1}: faltan el código de la farmacia o el correo del vendedor.`);
    if (!correo.includes('@')) return void errores.push(`Fila ${i + 1}: "${correo}" no parece un correo.`);
    const clave = correo.toLowerCase();
    const codigos = porVendedor.get(clave) ?? [];
    if (!codigos.includes(codigo)) codigos.push(codigo);
    porVendedor.set(clave, codigos);
  });
  return { porVendedor, errores };
}

/** Códigos escritos a mano: uno por línea o separados por coma/punto y coma. */
export const parsearCodigos = (texto: string): string[] =>
  Array.from(new Set(texto.split(/[\n,;]+/).map((c) => c.trim()).filter(Boolean)));
