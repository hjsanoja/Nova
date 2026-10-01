import novedades from './novedades.json';

/**
 * Versión de NOVA. Cada PR publica una versión nueva y la agrega ARRIBA en src/novedades.json:
 *  - cambio chico (arreglos, ajustes): sube un decimal, v6.2 → v6.3;
 *  - cambio grande (funciones nuevas o cambios visibles): pasa al siguiente entero, v6.3 → v7.0.
 * package.json lleva la misma versión (7.0 → "7.0.0"). Una prueba y la revisión del PR lo verifican.
 */

export interface Novedad {
  version: string;
  fecha: string;
  tipo: 'mayor' | 'menor';
  /** Número del PR que la publicó (se completa cuando ya existe). */
  pr?: number;
  titulo: string;
  cambios: string[];
}

export const NOVEDADES = novedades as Novedad[];

/** Versión que está corriendo en este equipo. */
export const VERSION = NOVEDADES[0].version;

/** Quienes hacen NOVA: se muestran junto a la versión. */
export const CREDITOS: { nombre: string; rol?: string }[] = [
  { nombre: 'Hernando Sanoja', rol: 'Responsable' },
  { nombre: 'Dubralis Fajardo', rol: 'Responsable' },
];

export const textoCreditos = (conRol = true) => CREDITOS.map((c) => (conRol && c.rol ? `${c.nombre} (${c.rol})` : c.nombre)).join(' · ');

/** Compara "7.0" con "6.12": positivo si a es más nueva. */
export function compararVersiones(a: string, b: string): number {
  const [ma, na] = a.split('.').map((x) => Number(x) || 0);
  const [mb, nb] = b.split('.').map((x) => Number(x) || 0);
  return ma !== mb ? ma - mb : (na ?? 0) - (nb ?? 0);
}

/** ¿Es `siguiente` el paso correcto después de `anterior`? (+0.1 si es menor, siguiente entero .0 si es mayor) */
export function esSiguienteVersion(anterior: string, siguiente: string, tipo: Novedad['tipo']): boolean {
  const [ma, na] = anterior.split('.').map(Number);
  const [ms, ns] = siguiente.split('.').map(Number);
  return tipo === 'mayor' ? ms === ma + 1 && ns === 0 : ms === ma && ns === na + 1;
}
