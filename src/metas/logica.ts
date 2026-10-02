// Metas por ciclo o por mes: avance con los pedidos y visitas del dispositivo, ritmo necesario y proyección al cierre.
// En un ciclo todo se cuenta en días hábiles (espejo de app.avance_metas_ciclo en la base); en un mes, en días corridos
// (espejo de app.avance_metas).
import type { IndicadorMeta, LocalCiclo, LocalFeriado, LocalMeta, LocalPedido, LocalVisita } from '../offline/types';
import { cuenta } from '../vistas/indicadores';
import { diasHabiles, enRango, fechaTexto, sumarDias } from '../ciclos/logica';

export interface DefIndicador {
  id: IndicadorMeta;
  texto: string;
  unidad: string;
  /** Ventas (pedidos) o visitas: decide qué alcance tiene sentido (droguería, farmacia o médico). */
  tipo: 'ventas' | 'visitas';
}

export const INDICADORES: DefIndicador[] = [
  { id: 'unidades', texto: 'Unidades', unidad: 'unidades', tipo: 'ventas' },
  { id: 'pedidos', texto: 'Pedidos', unidad: 'pedidos', tipo: 'ventas' },
  { id: 'farmacias', texto: 'Farmacias con pedido', unidad: 'farmacias', tipo: 'ventas' },
  { id: 'visitas_medicos', texto: 'Visitas a médicos', unidad: 'visitas', tipo: 'visitas' },
  { id: 'visitas_farmacias', texto: 'Visitas a farmacias', unidad: 'visitas', tipo: 'visitas' },
  { id: 'medicos_visitados', texto: 'Médicos visitados', unidad: 'médicos', tipo: 'visitas' },
];
export const indicador = (id: IndicadorMeta) => INDICADORES.find((i) => i.id === id) ?? INDICADORES[0];

/** Primer día del mes (YYYY-MM-01) en hora local. */
export const periodoDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
export const mesSiguiente = (periodo: string, n = 1) => {
  const [a, m] = periodo.split('-').map(Number);
  return periodoDe(new Date(a, m - 1 + n, 1));
};

/** Lo que hace falta para medir: pedidos, visitas, ciclos y feriados del dispositivo. */
export interface ContextoMetas {
  pedidos: LocalPedido[];
  unidades: Map<string, number>;
  visitas?: LocalVisita[];
  ciclos?: LocalCiclo[];
  feriados?: LocalFeriado[];
  /** Equipo de cada representante: en un ciclo de equipo, las visitas del equipo. */
  equipoDe?: (vendedorId: string) => string | null | undefined;
}

export interface RangoMeta { desde: string; hasta: string; ciclo?: LocalCiclo }

/** Fechas que mide la meta: las de su ciclo o las de su mes. null si el ciclo aún no está en el dispositivo. */
export function rangoDeMeta(meta: Pick<LocalMeta, 'periodo' | 'ciclo_id'>, ciclos: LocalCiclo[] = []): RangoMeta | null {
  if (meta.ciclo_id) {
    const c = ciclos.find((x) => x.id === meta.ciclo_id);
    return c ? { desde: c.inicio, hasta: c.fin, ciclo: c } : null;
  }
  if (!meta.periodo) return null;
  const [a, m] = meta.periodo.split('-').map(Number);
  return { desde: meta.periodo, hasta: fechaTexto(new Date(a, m, 0)) };
}

type Filtro = Pick<LocalMeta, 'periodo' | 'ciclo_id' | 'vendedor_id' | 'cliente_id' | 'drogueria_id'> & { medico_id?: string | null };

/** Pedidos que cuentan para la meta: de sus fechas y, si los fija, de ese representante, farmacia y droguería. En un ciclo de equipo, solo los del equipo. */
export function pedidosDeMeta(meta: Filtro, pedidos: LocalPedido[], ciclos: LocalCiclo[] = []): LocalPedido[] {
  const r = rangoDeMeta(meta, ciclos);
  if (!r) return [];
  const equipo = !meta.vendedor_id ? r.ciclo?.equipo_id : null;
  return pedidos.filter(
    (p) =>
      cuenta(p) && enRango(p.created_at, r) && (!equipo || p.equipo_id === equipo) &&
      (!meta.vendedor_id || p.vendedor_id === meta.vendedor_id) && (!meta.cliente_id || p.cliente_id === meta.cliente_id) && (!meta.drogueria_id || p.drogueria_id === meta.drogueria_id)
  );
}

/** Visitas que cuentan para la meta (a médicos: solo las realizadas; a farmacias: sin las reprogramadas). */
export function visitasDeMeta(meta: Filtro & Pick<LocalMeta, 'indicador'>, visitas: LocalVisita[], ciclos: LocalCiclo[] = [], equipoDe?: ContextoMetas['equipoDe']): LocalVisita[] {
  const r = rangoDeMeta(meta, ciclos);
  if (!r) return [];
  const equipo = !meta.vendedor_id ? r.ciclo?.equipo_id : null;
  const aMedicos = meta.indicador !== 'visitas_farmacias';
  return visitas.filter(
    (v) =>
      enRango(v.checkin_en, r) && (!equipo || !equipoDe || equipoDe(v.vendedor_id) === equipo) && (!meta.vendedor_id || v.vendedor_id === meta.vendedor_id) &&
      (aMedicos ? !!v.medico_id && v.resultado === 'realizada' && (!meta.medico_id || v.medico_id === meta.medico_id) : !!v.cliente_id && v.resultado !== 'reprogramada' && (!meta.cliente_id || v.cliente_id === meta.cliente_id))
  );
}

/** Valor logrado de la meta. */
export function valorMeta(meta: LocalMeta, ctx: ContextoMetas): number {
  if (indicador(meta.indicador).tipo === 'visitas') {
    const vs = visitasDeMeta(meta, ctx.visitas ?? [], ctx.ciclos, ctx.equipoDe);
    return meta.indicador === 'medicos_visitados' ? new Set(vs.map((v) => v.medico_id)).size : vs.length;
  }
  const propios = pedidosDeMeta(meta, ctx.pedidos, ctx.ciclos);
  return meta.indicador === 'unidades' ? propios.reduce((s, p) => s + (ctx.unidades.get(p.id) ?? 0), 0) : meta.indicador === 'pedidos' ? propios.length : new Set(propios.map((p) => p.cliente_id)).size;
}

export interface Avance {
  valor: number;
  objetivo: number;
  pct: number;
  /** Lo que falta por día (hábil, en un ciclo) desde hoy hasta el final (0 si ya se cumplió o terminó). */
  porDia: number;
  /** Cómo cerraría al ritmo actual (solo si está en curso). */
  proyeccion: number | null;
  /** Días (hábiles en un ciclo) que quedan, contando hoy. */
  diasRestantes: number;
  /** "días" o "días hábiles". */
  dias: string;
  nivel: NivelMeta;
  /** Lo que se debería llevar a la fecha. */
  esperado: number;
}

export function avanceMeta(meta: LocalMeta, ctx: ContextoMetas, hoy = new Date()): Avance {
  const valor = valorMeta(meta, ctx);
  const pct = meta.objetivo > 0 ? Math.round((valor / meta.objetivo) * 100) : 0;
  const falta = Math.max(0, meta.objetivo - valor);
  const r = rangoDeMeta(meta, ctx.ciclos);
  if (meta.ciclo_id && r) {
    const h = fechaTexto(hoy);
    const feriados = ctx.feriados ?? [];
    const total = diasHabiles(r.desde, r.hasta, feriados);
    const completos = diasHabiles(r.desde, h > r.hasta ? r.hasta : sumarDias(h, -1), feriados);
    const restantes = diasHabiles(h > r.desde ? h : r.desde, r.hasta, feriados);
    const esperado = Math.round(((meta.objetivo * completos) / Math.max(1, total)) * 100) / 100;
    const nivel: NivelMeta =
      valor >= meta.objetivo ? 'cumplida' : h > r.hasta ? 'no_cumplida' : h < r.desde ? 'futura' : completos < 2 ? 'inicio' : valor >= esperado * 0.95 ? 'en_camino' : valor >= esperado * 0.8 ? 'atencion' : 'en_riesgo';
    return {
      valor, objetivo: meta.objetivo, pct,
      porDia: restantes > 0 ? Math.ceil(falta / restantes) : 0,
      proyeccion: h >= r.desde && h <= r.hasta && completos > 0 ? Math.round((valor / completos) * total) : null,
      diasRestantes: restantes, dias: 'días hábiles', nivel, esperado,
    };
  }
  // Meta del mes (como antes): días corridos.
  const periodo = meta.periodo ?? periodoDe(hoy);
  const [a, m] = periodo.split('-').map(Number);
  const diasMes = new Date(a, m, 0).getDate();
  const esEsteMes = periodoDe(hoy) === periodo;
  const pasado = periodo < periodoDe(hoy);
  const diasRestantes = esEsteMes ? diasMes - hoy.getDate() + 1 : pasado ? 0 : diasMes;
  const ritmo = ritmoMeta({ periodo, objetivo: meta.objetivo }, valor, hoy);
  return {
    valor, objetivo: meta.objetivo, pct,
    porDia: diasRestantes > 0 ? Math.ceil(falta / diasRestantes) : 0,
    proyeccion: esEsteMes ? Math.round((valor / hoy.getDate()) * diasMes) : null,
    diasRestantes, dias: 'días', ...ritmo,
  };
}

/** "Ana Pérez · Farmacia La Paz · Cobeca", "Todo el equipo Ético" o "Toda la empresa". */
export function describirMeta(
  meta: Pick<LocalMeta, 'vendedor_id' | 'cliente_id' | 'drogueria_id'> & { medico_id?: string | null },
  nombres: { vendedor: (id: string) => string; cliente: (id: string) => string; drogueria: (id: string) => string; medico?: (id: string) => string },
  ciclo?: Pick<LocalCiclo, 'equipo_id' | 'equipo_nombre'> | null
): string {
  const partes = [
    meta.vendedor_id ? nombres.vendedor(meta.vendedor_id) : '',
    meta.cliente_id ? nombres.cliente(meta.cliente_id) : '',
    meta.medico_id ? (nombres.medico?.(meta.medico_id) ?? 'Médico') : '',
    meta.drogueria_id ? nombres.drogueria(meta.drogueria_id) : '',
  ].filter(Boolean);
  if (partes.length) return partes.join(' · ');
  return ciclo?.equipo_id ? `Todo el equipo ${ciclo.equipo_nombre ?? ''}`.trim() : 'Toda la empresa';
}

/* --------------------------------- alertas --------------------------------- */

export type NivelMeta = 'cumplida' | 'en_camino' | 'atencion' | 'en_riesgo' | 'inicio' | 'no_cumplida' | 'futura';

export interface Ritmo {
  nivel: NivelMeta;
  /** Lo que se debería llevar a la fecha (objetivo × días completos ÷ días del mes). */
  esperado: number;
}

/** Texto, tono y orden (más urgente primero) de cada nivel. Siempre se muestra con su texto, nunca solo el color. */
export const NIVELES_META: Record<NivelMeta, { texto: string; tono: 'exito' | 'marca' | 'aviso' | 'peligro' | 'neutro'; orden: number }> = {
  en_riesgo: { texto: 'En riesgo', tono: 'peligro', orden: 0 },
  atencion: { texto: 'Atención', tono: 'aviso', orden: 1 },
  no_cumplida: { texto: 'No se cumplió', tono: 'peligro', orden: 2 },
  inicio: { texto: 'Recién empieza', tono: 'neutro', orden: 3 },
  en_camino: { texto: 'En camino', tono: 'marca', orden: 4 },
  futura: { texto: 'Próxima', tono: 'neutro', orden: 5 },
  cumplida: { texto: 'Cumplida', tono: 'exito', orden: 6 },
};

/**
 * Ritmo de la meta (espejo de app.avance_metas en la base): lo que se lleva contra lo esperado a la fecha.
 * 95 % o más: en camino · 80–95 %: atención · menos: en riesgo. Los 3 primeros días del mes no se juzga.
 */
export function ritmoMeta(meta: { periodo: string; objetivo: number }, valor: number, hoy = new Date()): Ritmo {
  const [a, m] = meta.periodo.split('-').map(Number);
  const diasMes = new Date(a, m, 0).getDate();
  const actual = periodoDe(hoy);
  const completos = meta.periodo === actual ? hoy.getDate() - 1 : meta.periodo < actual ? diasMes : 0;
  const esperado = Math.round(((meta.objetivo * completos) / diasMes) * 100) / 100;
  if (valor >= meta.objetivo) return { nivel: 'cumplida', esperado };
  if (meta.periodo > actual) return { nivel: 'futura', esperado: 0 };
  if (meta.periodo < actual) return { nivel: 'no_cumplida', esperado };
  if (completos < 3) return { nivel: 'inicio', esperado };
  const nivel = valor >= esperado * 0.95 ? 'en_camino' : valor >= esperado * 0.8 ? 'atencion' : 'en_riesgo';
  return { nivel, esperado };
}

const CLAVE_REVISION = 'nova:metas_revisadas';

/** Pide a la base la revisión diaria (metas en riesgo o cumplidas y tareas que vencen) una vez al día por equipo. */
export async function revisarMetasHoy(rpc: (fn: string) => PromiseLike<{ error: unknown }>, hoy = new Date()): Promise<boolean> {
  const dia = `${hoy.getFullYear()}-${hoy.getMonth() + 1}-${hoy.getDate()}`;
  try {
    if (localStorage.getItem(CLAVE_REVISION) === dia) return false;
  } catch {
    /* sin almacenamiento: se revisa igual (la base no repite avisos) */
  }
  const { error } = await rpc('revision_diaria');
  if (error) return false;
  try {
    localStorage.setItem(CLAVE_REVISION, dia);
  } catch {
    /* ignorar */
  }
  return true;
}
