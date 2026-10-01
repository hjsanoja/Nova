// Farmacias en riesgo: cada farmacia tiene su propio ritmo de compra. Si pasa mucho más tiempo del normal sin comprar,
// se marca para que el representante la atienda antes de perderla.
//
//   ciclo = cada cuántos días compra (la frecuencia de la ficha o, si no tiene, la mediana entre sus compras), entre 7 y 60
//   al día     → menos de 1,5 ciclos sin comprar
//   atrasada   → 1,5 ciclos o más
//   en riesgo  → 2 ciclos o más, o más de 45 días
//   perdida    → más de 90 días
//
// El historial viene de la base (todo el último año, pedidos de NOVA + compras reportadas por las droguerías) o, sin
// conexión, de lo que hay en el equipo. La regla es la misma en los dos casos.
import type { LocalCliente, LocalCompraMensual, LocalPedido } from '../offline/types';
import { cuenta } from './indicadores';

export type NivelRiesgo = 'al_dia' | 'atrasada' | 'en_riesgo' | 'perdida';

export const NIVELES_RIESGO: Record<NivelRiesgo, { texto: string; tono: 'exito' | 'aviso' | 'peligro' | 'neutro'; orden: number }> = {
  en_riesgo: { texto: 'En riesgo', tono: 'peligro', orden: 0 },
  atrasada: { texto: 'Atrasada', tono: 'aviso', orden: 1 },
  perdida: { texto: 'Perdida', tono: 'neutro', orden: 2 },
  al_dia: { texto: 'Al día', tono: 'exito', orden: 3 },
};

/** Lo que se sabe de las compras de una farmacia (igual a lo que devuelve historial_compra_farmacias). */
export interface HistorialCompra {
  cliente_id: string;
  /** Última compra (YYYY-MM-DD). */
  ultima: string;
  /** Mediana de días entre compras; null con una sola compra. */
  ciclo_dias: number | null;
  compras: number;
  unidades_mes: number;
}

export interface FarmaciaRiesgo {
  cliente: LocalCliente;
  nivel: NivelRiesgo;
  dias: number;
  ciclo: number;
  /** El ciclo viene de la ficha (frecuencia) o se calculó con sus compras. */
  cicloDeFicha: boolean;
  ultima: string;
  unidadesMes: number;
}

const DIA = 86_400_000;
const fechaLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA);

export function nivelDeRiesgo(dias: number, ciclo: number): NivelRiesgo {
  if (dias > 90) return 'perdida';
  if (dias >= ciclo * 2 || dias > 45) return 'en_riesgo';
  if (dias >= ciclo * 1.5) return 'atrasada';
  return 'al_dia';
}

/** Nivel de cada farmacia con historial (las que nunca compraron no se juzgan). Más urgentes y más grandes primero. */
export function evaluarRiesgo(clientes: LocalCliente[], historial: Map<string, HistorialCompra>, hoy = new Date()): FarmaciaRiesgo[] {
  const hoyTexto = fechaLocal(hoy);
  const salida: FarmaciaRiesgo[] = [];
  for (const c of clientes) {
    if (c.estado_validacion !== 'activo') continue;
    const h = historial.get(c.id);
    if (!h) continue;
    const cicloDeFicha = !!c.frecuencia_dias && c.frecuencia_dias > 0;
    const ciclo = Math.min(60, Math.max(7, Math.round(cicloDeFicha ? (c.frecuencia_dias as number) : h.ciclo_dias ?? 30)));
    const dias = Math.max(0, diasEntre(h.ultima, hoyTexto));
    salida.push({ cliente: c, nivel: nivelDeRiesgo(dias, ciclo), dias, ciclo, cicloDeFicha, ultima: h.ultima, unidadesMes: h.unidades_mes });
  }
  return salida.sort((a, b) => NIVELES_RIESGO[a.nivel].orden - NIVELES_RIESGO[b.nivel].orden || b.unidadesMes - a.unidadesMes || b.dias - a.dias);
}

const mediana = (xs: number[]) => {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

/** El mismo historial de la base, calculado con lo que hay en el equipo (pedidos y compras del último año). */
export function historialLocal(pedidos: LocalPedido[], unidades: Map<string, number>, compras: LocalCompraMensual[], hoy = new Date()): Map<string, HistorialCompra> {
  const desde = fechaLocal(new Date(hoy.getTime() - 365 * DIA));
  const dias = new Map<string, Set<string>>();
  const udsPedidos = new Map<string, number>();
  const udsCompras = new Map<string, number>();
  const anotar = (cliente: string, dia: string) => {
    if (!dias.has(cliente)) dias.set(cliente, new Set());
    dias.get(cliente)?.add(dia);
  };
  for (const p of pedidos) {
    if (!cuenta(p)) continue;
    const dia = fechaLocal(new Date(p.created_at));
    if (dia < desde) continue;
    anotar(p.cliente_id, dia);
    udsPedidos.set(p.cliente_id, (udsPedidos.get(p.cliente_id) ?? 0) + (unidades.get(p.id) ?? 0));
  }
  // Las compras reportadas son por producto y mes: se toma la última fecha de cada mes.
  const ultimaDelMes = new Map<string, string>();
  for (const c of compras) {
    if (c.periodo < desde.slice(0, 7)) continue;
    const k = `${c.cliente_id}|${c.periodo}`;
    if (!ultimaDelMes.has(k) || c.ultima_compra > (ultimaDelMes.get(k) as string)) ultimaDelMes.set(k, c.ultima_compra);
    udsCompras.set(c.cliente_id, (udsCompras.get(c.cliente_id) ?? 0) + c.unidades);
  }
  for (const [k, dia] of ultimaDelMes) anotar(k.split('|')[0], dia.slice(0, 10));

  const salida = new Map<string, HistorialCompra>();
  for (const [cliente, set] of dias) {
    const orden = [...set].sort();
    const saltos = orden.slice(1).map((d, i) => diasEntre(orden[i], d));
    const m = mediana(saltos);
    // Los pedidos de NOVA suelen estar también en el reporte de la droguería: se toma la fuente mayor, no la suma.
    const uds = Math.max(udsPedidos.get(cliente) ?? 0, udsCompras.get(cliente) ?? 0);
    salida.set(cliente, { cliente_id: cliente, ultima: orden[orden.length - 1], ciclo_dias: m === null ? null : Math.round(m), compras: orden.length, unidades_mes: Math.round(uds / 12) });
  }
  return salida;
}

/** Frase corta para la lista: "38 días sin comprar · compra cada 15 días". */
export function describirRiesgo(f: FarmaciaRiesgo): string {
  const sin = f.dias === 0 ? 'Compró hoy' : `${f.dias} día${f.dias === 1 ? '' : 's'} sin comprar`;
  return `${sin} · compra cada ${f.ciclo} días${f.unidadesMes ? ` · ${f.unidadesMes.toLocaleString('es-VE')} uds/mes` : ''}`;
}
