// Otras actividades y días libres: validación (espejo de sync_guardar_actividad), días que descuentan y días efectivos
// (espejo de dias_efectivos en la base).
import type { LocalActividad, LocalFeriado, LocalMotivo } from '../offline/types';
import { diasHabiles, esDiaHabil, fechaCorta, sumarDias } from '../ciclos/logica';

export const ESTADOS_ACTIVIDAD: Record<LocalActividad['estado'], { texto: string; tono: 'aviso' | 'exito' | 'peligro' | 'neutro' }> = {
  pendiente: { texto: 'Por aprobar', tono: 'aviso' },
  aprobada: { texto: 'Aprobada', tono: 'exito' },
  rechazada: { texto: 'Rechazada', tono: 'peligro' },
  anulada: { texto: 'Anulada', tono: 'neutro' },
};

const ddmm = (t: string) => fechaCorta(t).slice(0, 5);

/** "del 11/01 al 15/01" o "el 20/01 (media jornada)": igual que los avisos de la base. */
export function textoFechas(a: Pick<LocalActividad, 'desde' | 'hasta' | 'jornada'>): string {
  if (a.desde === a.hasta) return `el ${ddmm(a.desde)}${a.jornada === 'media' ? ' (media jornada)' : ''}`;
  return `del ${ddmm(a.desde)} al ${ddmm(a.hasta)}`;
}

/** Lo que impide guardarla (mismos mensajes que la base). */
export function problemasActividad(a: Pick<LocalActividad, 'id' | 'motivo_id' | 'desde' | 'hasta' | 'jornada'>, otras: LocalActividad[], motivos: LocalMotivo[]): string[] {
  const p: string[] = [];
  const motivo = motivos.find((m) => m.id === a.motivo_id);
  if (!a.motivo_id) p.push('Elige el motivo.');
  else if (motivos.length && (!motivo || !motivo.activo)) p.push('Ese motivo ya no está disponible.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.desde) || !/^\d{4}-\d{2}-\d{2}$/.test(a.hasta)) return [...p, 'Elige las fechas.'];
  if (a.hasta < a.desde) return [...p, 'Revisa las fechas: el fin no puede ser antes del inicio.'];
  if (sumarDias(a.desde, 62) < a.hasta) p.push('Reporta como máximo dos meses a la vez.');
  if (a.jornada === 'media' && a.hasta !== a.desde) p.push('La media jornada es de un solo día.');
  const cruce = otras.find((o) => o.id !== a.id && (o.estado === 'pendiente' || o.estado === 'aprobada') && o.desde <= a.hasta && a.desde <= o.hasta);
  if (cruce) p.push(`Ya reportaste ${motivos.find((m) => m.id === cruce.motivo_id)?.nombre ?? 'una actividad'} ${textoFechas({ ...cruce, jornada: 'completa' })}.`);
  return p;
}

/** Días hábiles que ocupa una actividad dentro de un rango (media jornada = 0,5). */
export function diasDeActividad(a: Pick<LocalActividad, 'desde' | 'hasta' | 'jornada'>, rango: { desde: string; hasta: string }, feriados: LocalFeriado[], estado?: string | null): number {
  const desde = a.desde > rango.desde ? a.desde : rango.desde;
  const hasta = a.hasta < rango.hasta ? a.hasta : rango.hasta;
  if (hasta < desde) return 0;
  if (a.jornada === 'media') return esDiaHabil(desde, feriados, estado) ? 0.5 : 0;
  return diasHabiles(desde, hasta, feriados, estado);
}

/** Días que se descuentan de la cobertura: solo lo aprobado, de motivos que descuentan. */
export function diasDescontados(actividades: LocalActividad[], motivos: LocalMotivo[], vendedorId: string, rango: { desde: string; hasta: string }, feriados: LocalFeriado[], estado?: string | null): number {
  const descuenta = new Map(motivos.map((m) => [m.id, m.descuenta]));
  return actividades
    .filter((a) => a.vendedor_id === vendedorId && a.estado === 'aprobada' && descuenta.get(a.motivo_id) !== false)
    .reduce((s, a) => s + diasDeActividad(a, rango, feriados, estado), 0);
}

/** Días efectivos: hábiles del período menos los descontados. */
export function diasEfectivos(actividades: LocalActividad[], motivos: LocalMotivo[], vendedorId: string, rango: { desde: string; hasta: string }, feriados: LocalFeriado[], estado?: string | null): { habiles: number; libres: number; efectivos: number } {
  const habiles = diasHabiles(rango.desde, rango.hasta, feriados, estado);
  const libres = Math.min(habiles, diasDescontados(actividades, motivos, vendedorId, rango, feriados, estado));
  return { habiles, libres, efectivos: habiles - libres };
}
