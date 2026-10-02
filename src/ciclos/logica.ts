// Ciclos y días hábiles (espejo de la base: app.es_dia_habil, dias_habiles, app.validar_ciclo).
// Fechas como texto YYYY-MM-DD en hora local: así no hay saltos por zona horaria.
import type { LocalCiclo, LocalFeriado } from '../offline/types';

const dos = (n: number) => String(n).padStart(2, '0');
export const fechaTexto = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
export const aFecha = (t: string) => {
  const [a, m, d] = t.slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d);
};
export const sumarDias = (t: string, n: number) => {
  const d = aFecha(t);
  d.setDate(d.getDate() + n);
  return fechaTexto(d);
};
/** Días corridos entre dos fechas (b − a). */
export const diasEntre = (a: string, b: string) => Math.round((aFecha(b).getTime() - aFecha(a).getTime()) / 86_400_000);
/** "03/08/2026" */
export const fechaCorta = (t: string) => `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}`;
/** "3 ago" */
export const fechaBreve = (t: string) => aFecha(t).toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '');

export const esFinDeSemana = (t: string) => {
  const d = aFecha(t).getDay();
  return d === 0 || d === 6;
};

const norm = (t: string) => t.trim().toLowerCase();

/** Feriado que aplica ese día (nacional, o regional del estado indicado). */
export function feriadoDe(fecha: string, feriados: LocalFeriado[], estado?: string | null): LocalFeriado | undefined {
  return feriados.find((f) => f.fecha === fecha && (f.alcance === 'nacional' || (!!estado && f.estados.some((e) => norm(e) === norm(estado)))));
}

export const esDiaHabil = (fecha: string, feriados: LocalFeriado[], estado?: string | null) => !esFinDeSemana(fecha) && !feriadoDe(fecha, feriados, estado);

/** Días hábiles entre dos fechas (ambas incluidas). */
export function diasHabiles(desde: string, hasta: string, feriados: LocalFeriado[], estado?: string | null): number {
  if (hasta < desde) return 0;
  let n = 0;
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) if (esDiaHabil(d, feriados, estado)) n++;
  return n;
}

/** El día hábil más cercano desde una fecha (ella misma si lo es), hacia adelante (1) o hacia atrás (−1). */
export function diaHabilCercano(fecha: string, feriados: LocalFeriado[], sentido: 1 | -1 = 1): string {
  let d = fecha;
  for (let i = 0; i < 30 && !esDiaHabil(d, feriados); i++) d = sumarDias(d, sentido);
  return d;
}

export type EstadoCiclo = 'planificado' | 'vigente' | 'terminado' | 'cerrado';
export function estadoCiclo(c: Pick<LocalCiclo, 'inicio' | 'fin' | 'cerrado_en'>, hoy = fechaTexto(new Date())): EstadoCiclo {
  if (c.cerrado_en) return 'cerrado';
  if (hoy < c.inicio) return 'planificado';
  if (hoy > c.fin) return 'terminado';
  return 'vigente';
}

/** Ciclos de un equipo (o los generales, con null), del más reciente al más antiguo. */
export const ciclosDe = (ciclos: LocalCiclo[], equipoId: string | null) => ciclos.filter((c) => (c.equipo_id ?? null) === equipoId).sort((a, b) => b.inicio.localeCompare(a.inicio));

/** Ciclo que le aplica hoy a un equipo: el propio y, si no tiene, el general. */
export function cicloVigente(ciclos: LocalCiclo[], equipoId: string | null | undefined, hoy = fechaTexto(new Date())): LocalCiclo | undefined {
  const cubre = (c: LocalCiclo) => c.inicio <= hoy && hoy <= c.fin;
  return (equipoId ? ciclos.find((c) => c.equipo_id === equipoId && cubre(c)) : undefined) ?? ciclos.find((c) => !c.equipo_id && cubre(c));
}

/** Problemas de un ciclo antes de guardarlo (los mismos que rechaza la base). Vacío = válido. */
export function problemasCiclo(c: { id?: string; equipo_id: string | null; nombre: string; inicio: string; fin: string }, otros: LocalCiclo[], feriados: LocalFeriado[]): string[] {
  const p: string[] = [];
  if (!c.nombre.trim()) p.push('Escribe el nombre del ciclo.');
  if (!c.inicio || !c.fin) return [...p, 'Elige las fechas de inicio y fin.'];
  if (c.fin < c.inicio) return [...p, 'La fecha de fin debe ser igual o posterior a la de inicio.'];
  const porque = (t: string) => (esFinDeSemana(t) ? 'fin de semana' : `feriado (${feriadoDe(t, feriados)?.nombre})`);
  if (!esDiaHabil(c.inicio, feriados)) p.push(`El ciclo debe empezar en un día hábil: el ${fechaCorta(c.inicio)} es ${porque(c.inicio)}.`);
  if (!esDiaHabil(c.fin, feriados)) p.push(`El ciclo debe terminar en un día hábil: el ${fechaCorta(c.fin)} es ${porque(c.fin)}.`);
  const cruce = otros.find((o) => o.id !== c.id && (o.equipo_id ?? null) === (c.equipo_id ?? null) && o.inicio <= c.fin && c.inicio <= o.fin);
  if (cruce) p.push(`Las fechas se cruzan con el ciclo ${cruce.nombre}.`);
  return p;
}

/** Aviso (no impide guardar): días hábiles que quedarían sin ciclo entre este y el anterior o el siguiente del mismo equipo. */
export function huecosCiclo(c: { id?: string; equipo_id: string | null; inicio: string; fin: string }, otros: LocalCiclo[], feriados: LocalFeriado[]): string[] {
  if (!c.inicio || !c.fin || c.fin < c.inicio) return [];
  const mismos = otros.filter((o) => o.id !== c.id && (o.equipo_id ?? null) === (c.equipo_id ?? null));
  const antes = mismos.filter((o) => o.fin < c.inicio).sort((a, b) => b.fin.localeCompare(a.fin))[0];
  const despues = mismos.filter((o) => o.inicio > c.fin).sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
  const avisos: string[] = [];
  const hueco = (desde: string, hasta: string, texto: string) => {
    const n = diasHabiles(desde, hasta, feriados);
    if (n > 0) avisos.push(`Quedan ${n} día${n === 1 ? '' : 's'} hábil${n === 1 ? '' : 'es'} sin ciclo ${texto} (${fechaBreve(desde)} – ${fechaBreve(hasta)}).`);
  };
  if (antes) hueco(sumarDias(antes.fin, 1), sumarDias(c.inicio, -1), `después de ${antes.nombre}`);
  if (despues) hueco(sumarDias(c.fin, 1), sumarDias(despues.inicio, -1), `antes de ${despues.nombre}`);
  return avisos;
}

/** "C8-2026" → "C9-2026"; al cambiar de año vuelve a empezar: "C13-2026" → "C1-2027". */
export function siguienteNombre(nombre: string, inicio: string): string {
  const anio = inicio.slice(0, 4);
  const m = /^(.*?)(\d+)(\D+)(\d{4})$/.exec(nombre.trim());
  if (m) return m[4] === anio ? `${m[1]}${Number(m[2]) + 1}${m[3]}${m[4]}` : `${m[1]}1${m[3]}${anio}`;
  const n = /^(.*?)(\d+)(\D*)$/.exec(nombre.trim());
  if (n) return `${n[1]}${Number(n[2]) + 1}${n[3]}`;
  return `${nombre.trim()} (siguiente)`;
}

/** Propone el ciclo siguiente: empieza el próximo día hábil y dura lo mismo (en días corridos), terminando en día hábil. */
export function proponerSiguiente(ultimo: Pick<LocalCiclo, 'nombre' | 'inicio' | 'fin'>, feriados: LocalFeriado[]): { nombre: string; inicio: string; fin: string } {
  const inicio = diaHabilCercano(sumarDias(ultimo.fin, 1), feriados, 1);
  const fin = diaHabilCercano(sumarDias(inicio, diasEntre(ultimo.inicio, ultimo.fin)), feriados, -1);
  return { nombre: siguienteNombre(ultimo.nombre, inicio), inicio, fin };
}

/** Propuesta para un equipo sin ciclos: 4 semanas desde el próximo lunes hábil. */
export function proponerPrimero(hoy: string, feriados: LocalFeriado[]): { nombre: string; inicio: string; fin: string } {
  const lunes = sumarDias(hoy, (8 - aFecha(hoy).getDay()) % 7 || 7);
  const inicio = diaHabilCercano(lunes, feriados, 1);
  const fin = diaHabilCercano(sumarDias(inicio, 25), feriados, -1);
  return { nombre: `C1-${inicio.slice(0, 4)}`, inicio, fin };
}

/* --------------------------------- período --------------------------------- */

/** Período con el que se mide todo: el ciclo vigente del equipo o, si no hay, el mes calendario. */
export interface Periodo {
  tipo: 'ciclo' | 'mes';
  ciclo?: LocalCiclo;
  /** "C8-2026 (3 ago – 28 ago)" o "octubre". */
  etiqueta: string;
  /** "del ciclo" o "del mes" (para los títulos). */
  del: string;
  desde: string;
  hasta: string;
  /** Días hábiles del período, los ya completos (antes de hoy) y los que quedan (desde hoy). */
  habiles: number;
  transcurridos: number;
  restantes: number;
  anterior?: { desde: string; hasta: string; etiqueta: string };
}

const nombreMes = (t: string) => aFecha(t).toLocaleDateString('es', { month: 'long' });

export function periodoDeCiclo(c: LocalCiclo, ciclos: LocalCiclo[], feriados: LocalFeriado[], hoy = fechaTexto(new Date()), estado?: string | null): Periodo {
  const anterior = ciclos.filter((o) => (o.equipo_id ?? null) === (c.equipo_id ?? null) && o.fin < c.inicio).sort((a, b) => b.fin.localeCompare(a.fin))[0];
  return {
    tipo: 'ciclo',
    ciclo: c,
    etiqueta: `${c.nombre} (${fechaBreve(c.inicio)} – ${fechaBreve(c.fin)})`,
    del: 'del ciclo',
    desde: c.inicio,
    hasta: c.fin,
    habiles: diasHabiles(c.inicio, c.fin, feriados, estado),
    transcurridos: diasHabiles(c.inicio, hoy > c.fin ? c.fin : sumarDias(hoy, -1), feriados, estado),
    restantes: diasHabiles(hoy > c.inicio ? hoy : c.inicio, c.fin, feriados, estado),
    anterior: anterior ? { desde: anterior.inicio, hasta: anterior.fin, etiqueta: `el ciclo ${anterior.nombre}` } : undefined,
  };
}

export function periodoDeMes(hoy: string, feriados: LocalFeriado[], estado?: string | null): Periodo {
  const desde = `${hoy.slice(0, 7)}-01`;
  const hasta = sumarDias(fechaTexto(new Date(aFecha(desde).getFullYear(), aFecha(desde).getMonth() + 1, 1)), -1);
  const antDesde = fechaTexto(new Date(aFecha(desde).getFullYear(), aFecha(desde).getMonth() - 1, 1));
  return {
    tipo: 'mes',
    etiqueta: nombreMes(desde),
    del: 'del mes',
    desde,
    hasta,
    habiles: diasHabiles(desde, hasta, feriados, estado),
    transcurridos: diasHabiles(desde, sumarDias(hoy, -1), feriados, estado),
    restantes: diasHabiles(hoy, hasta, feriados, estado),
    anterior: { desde: antDesde, hasta: sumarDias(desde, -1), etiqueta: 'el mes pasado' },
  };
}

/** Período actual de un equipo: su ciclo vigente (o el general) y, si no hay ninguno, el mes calendario. */
export function periodoActual(ciclos: LocalCiclo[], feriados: LocalFeriado[], equipoId: string | null | undefined, hoy = fechaTexto(new Date()), estado?: string | null): Periodo {
  const c = cicloVigente(ciclos, equipoId, hoy);
  return c ? periodoDeCiclo(c, ciclos, feriados, hoy, estado) : periodoDeMes(hoy, feriados, estado);
}

/** ¿La fecha (ISO de un pedido o visita) cae en el período? Se compara el día en hora local. */
export const enRango = (iso: string, r: { desde: string; hasta: string }) => {
  const d = fechaTexto(new Date(iso));
  return d >= r.desde && d <= r.hasta;
};

/* -------------------------------- feriados -------------------------------- */

/** Domingo de Pascua (algoritmo de Gauss/Meeus para el calendario gregoriano). */
export function pascua(anio: number): string {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${dos(mes)}-${dos(dia)}`;
}

/** Feriados nacionales de Venezuela de un año (fijos y los que dependen de la Pascua), para revisarlos antes de guardar. */
export function feriadosVenezuela(anio: number): { fecha: string; nombre: string }[] {
  const p = pascua(anio);
  return [
    { fecha: `${anio}-01-01`, nombre: 'Año Nuevo' },
    { fecha: sumarDias(p, -48), nombre: 'Lunes de Carnaval' },
    { fecha: sumarDias(p, -47), nombre: 'Martes de Carnaval' },
    { fecha: sumarDias(p, -3), nombre: 'Jueves Santo' },
    { fecha: sumarDias(p, -2), nombre: 'Viernes Santo' },
    { fecha: `${anio}-04-19`, nombre: 'Declaración de la Independencia' },
    { fecha: `${anio}-05-01`, nombre: 'Día del Trabajador' },
    { fecha: `${anio}-06-24`, nombre: 'Batalla de Carabobo' },
    { fecha: `${anio}-07-05`, nombre: 'Día de la Independencia' },
    { fecha: `${anio}-07-24`, nombre: 'Natalicio del Libertador' },
    { fecha: `${anio}-10-12`, nombre: 'Día de la Resistencia Indígena' },
    { fecha: `${anio}-12-24`, nombre: 'Nochebuena' },
    { fecha: `${anio}-12-25`, nombre: 'Navidad' },
    { fecha: `${anio}-12-31`, nombre: 'Fin de año' },
  ].sort((x, y) => x.fecha.localeCompare(y.fecha));
}

/** Estados de Venezuela (para los feriados regionales y la zona de cada persona). */
export const ESTADOS_VENEZUELA = [
  'Amazonas', 'Anzoátegui', 'Apure', 'Aragua', 'Barinas', 'Bolívar', 'Carabobo', 'Cojedes', 'Delta Amacuro', 'Distrito Capital',
  'Falcón', 'Guárico', 'La Guaira', 'Lara', 'Mérida', 'Miranda', 'Monagas', 'Nueva Esparta', 'Portuguesa', 'Sucre', 'Táchira',
  'Trujillo', 'Yaracuy', 'Zulia',
];
