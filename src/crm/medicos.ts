// Médicos: lectura del archivo de carga, cobertura de visitas del ciclo (o del mes) y orden de la cartera.
import type { LocalMedico, LocalVisita } from '../offline/types';
import { normalizarTitulo } from '../services/respuestaDrogueria';
import { enRango } from '../ciclos/logica';

export type CampoMedico = 'codigo' | 'nombre' | 'especialidad' | 'centro' | 'direccion' | 'ciudad' | 'zona' | 'telefono' | 'correo' | 'categoria' | 'visitas_mes' | 'lat' | 'lon' | 'representante' | 'notas';

// Títulos aceptados por campo (sin tildes ni mayúsculas). El primero que coincida gana; "correo del representante" va antes que "correo".
const TITULOS: [CampoMedico, RegExp][] = [
  ['representante', /represent|visitador|vendedor|asesor/],
  ['codigo', /^(cod|codigo|id|cod medico|codigo medico|cmp|mpps)$/],
  ['nombre', /^(nombre|medico|doctor|dr)\b/],
  ['especialidad', /especial/],
  ['centro', /centro|clinica|consultorio|hospital|institucion/],
  ['direccion', /direcc/],
  ['ciudad', /ciudad|municipio/],
  ['zona', /zona|brick|sector/],
  ['telefono', /telef|celular|movil/],
  ['correo', /correo|email|e mail/],
  ['categoria', /categ|potencial|clase/],
  ['visitas_mes', /visitas|frecuencia/],
  ['lat', /^lat/],
  ['lon', /^(lon|lng)/],
  ['notas', /nota|observ/],
];

export function columnasMedicos(encabezados: string[]): Partial<Record<CampoMedico, number>> {
  const norm = encabezados.map(normalizarTitulo);
  const usadas = new Set<number>();
  const salida: Partial<Record<CampoMedico, number>> = {};
  for (const [campo, re] of TITULOS) {
    const i = norm.findIndex((t, k) => t && !usadas.has(k) && re.test(t));
    if (i >= 0) {
      salida[campo] = i;
      usadas.add(i);
    }
  }
  return salida;
}

export type FilaMedico = Partial<Record<CampoMedico, string>> & { linea: number };

/** Filas del archivo listas para cargar_medicos. Sin nombre se descartan (y se dice en qué línea). */
export function leerMedicos(filas: string[][]): { filas: FilaMedico[]; descartes: { linea: number; motivo: string }[]; columnas: Partial<Record<CampoMedico, number>> } {
  const encabezado = filas.findIndex((f) => columnasMedicos(f).nombre !== undefined);
  if (encabezado < 0) return { filas: [], descartes: [{ linea: 1, motivo: 'No encuentro la columna NOMBRE.' }], columnas: {} };
  const columnas = columnasMedicos(filas[encabezado]);
  const salida: FilaMedico[] = [];
  const descartes: { linea: number; motivo: string }[] = [];
  filas.slice(encabezado + 1).forEach((f, k) => {
    const linea = encabezado + 2 + k;
    if (f.every((x) => !x?.trim())) return;
    const fila: FilaMedico = { linea };
    for (const [campo, i] of Object.entries(columnas) as [CampoMedico, number][]) {
      const v = (f[i] ?? '').trim();
      if (v) fila[campo] = campo === 'lat' || campo === 'lon' ? v.replace(',', '.') : campo === 'categoria' ? v.toUpperCase().slice(0, 1) : v;
    }
    if (!fila.nombre) return descartes.push({ linea, motivo: 'Falta el nombre del médico' });
    if (fila.categoria && !['A', 'B', 'C'].includes(fila.categoria)) delete fila.categoria;
    if (fila.visitas_mes && !/^\d{1,2}$/.test(fila.visitas_mes)) delete fila.visitas_mes;
    salida.push(fila);
  });
  return { filas: salida, descartes, columnas };
}

export const PLANTILLA_MEDICOS = 'CODIGO;NOMBRE;ESPECIALIDAD;CENTRO;DIRECCION;CIUDAD;ZONA;TELEFONO;CORREO;CATEGORIA;VISITAS_CICLO;LATITUD;LONGITUD;REPRESENTANTE\r\nMED-001;Ana Pérez;Cardiología;Clínica El Ávila;Av. San Juan Bosco;Caracas;Altamira;0414-0000000;ana@correo.com;A;2;10.4961;-66.8472;vendedor@empresa.com\r\n';

export interface CoberturaMedico {
  medico: LocalMedico;
  /** Visitas realizadas este mes (resultado "realizada"). */
  hechas: number;
  /** Visitas esperadas en el mes (1 si no se definió). */
  esperadas: number;
  ultima: string | null;
}

const mesDe = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
};

export interface RangoFechas { desde: string; hasta: string }

/**
 * Cobertura por médico en el ciclo (un rango de fechas, o el ciclo del equipo de su representante) o en el mes de la
 * fecha dada: los que faltan por visitar primero (categoría A antes que B y C). Las visitas esperadas son las de su
 * ficha ("visitas por ciclo").
 */
export function coberturaMedicos(medicos: LocalMedico[], visitas: LocalVisita[], cuando: Date | RangoFechas | ((m: LocalMedico) => RangoFechas) = new Date()): CoberturaMedico[] {
  const rangoDe = (m: LocalMedico): RangoFechas | null => (cuando instanceof Date ? null : typeof cuando === 'function' ? cuando(m) : cuando);
  const mes = cuando instanceof Date ? mesDe(cuando.toISOString()) : '';
  const porMedico = new Map<string, LocalVisita[]>();
  for (const v of visitas) if (v.medico_id) porMedico.set(v.medico_id, [...(porMedico.get(v.medico_id) ?? []), v]);
  const orden = { A: 0, B: 1, C: 2 } as const;
  return medicos
    .filter((m) => m.activo !== false)
    .map((m) => {
      const vs = porMedico.get(m.id) ?? [];
      const r = rangoDe(m);
      const hechas = vs.filter((v) => (r ? enRango(v.checkin_en, r) : mesDe(v.checkin_en) === mes) && v.resultado === 'realizada').length;
      const ultima = vs.reduce<string | null>((a, v) => (!a || v.checkin_en > a ? v.checkin_en : a), null);
      return { medico: m, hechas, esperadas: Math.max(1, m.visitas_mes ?? 1), ultima };
    })
    .sort((a, b) => Number(a.hechas >= a.esperadas) - Number(b.hechas >= b.esperadas) || (orden[a.medico.categoria ?? 'C'] ?? 2) - (orden[b.medico.categoria ?? 'C'] ?? 2) || a.medico.nombre.localeCompare(b.medico.nombre));
}

/** Resumen: médicos con todas sus visitas del período, sobre el total. */
export function resumenCobertura(c: CoberturaMedico[]): { cubiertos: number; total: number; visitas: number; esperadas: number } {
  return {
    cubiertos: c.filter((x) => x.hechas >= x.esperadas).length,
    total: c.length,
    visitas: c.reduce((a, x) => a + Math.min(x.hechas, x.esperadas), 0),
    esperadas: c.reduce((a, x) => a + x.esperadas, 0),
  };
}

/* --------------------------------- reportes --------------------------------- */

export interface FilaVisitasRepresentante {
  vendedor_id: string;
  farmacias: number;
  medicos: number;
  /** Visitas con GPS dentro del radio del lugar. */
  enElLugar: number;
  pedidos: number;
  muestras: number;
}

/** ¿La visita entra en el reporte? Desde una fecha, o según una regla (p. ej. el ciclo del equipo de cada representante). */
export type FiltroVisitas = Date | ((v: LocalVisita) => boolean);
const entra = (v: LocalVisita, f: FiltroVisitas) => (f instanceof Date ? new Date(v.checkin_en) >= f : f(v));

/** Visitas del período, por representante (farmacias, médicos, en el lugar, pedidos tomados y muestras). */
export function visitasPorRepresentante(visitas: LocalVisita[], desde: FiltroVisitas): FilaVisitasRepresentante[] {
  const acc = new Map<string, FilaVisitasRepresentante>();
  for (const v of visitas) {
    if (!entra(v, desde)) continue;
    const f = acc.get(v.vendedor_id) ?? { vendedor_id: v.vendedor_id, farmacias: 0, medicos: 0, enElLugar: 0, pedidos: 0, muestras: 0 };
    if (v.medico_id) f.medicos++;
    else f.farmacias++;
    if (v.dentro_de_radio) f.enElLugar++;
    if (v.resultado === 'pedido_tomado') f.pedidos++;
    f.muestras += (v.muestras ?? []).reduce((a, m) => a + m.cantidad, 0);
    acc.set(v.vendedor_id, f);
  }
  return [...acc.values()].sort((a, b) => b.farmacias + b.medicos - (a.farmacias + a.medicos));
}

/** Muestras entregadas por producto en el período (las más entregadas primero). */
export function muestrasPorProducto(visitas: LocalVisita[], desde: FiltroVisitas): { producto_id: string; cantidad: number }[] {
  const acc = new Map<string, number>();
  for (const v of visitas) {
    if (!entra(v, desde)) continue;
    for (const m of v.muestras ?? []) acc.set(m.producto_id, (acc.get(m.producto_id) ?? 0) + m.cantidad);
  }
  return [...acc.entries()].map(([producto_id, cantidad]) => ({ producto_id, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
}
