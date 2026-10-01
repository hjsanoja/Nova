import { obtenerDb } from '../offline/db';
import { useLive } from '../offline/useLive';
import type { LocalMedico, LocalTarea, LocalVisita, ResultadoVisita } from '../offline/types';

/** Lecturas reactivas del CRM (se actualizan solas con cada sincronización o cambio). */
export const useMedicos = () => useLive(() => obtenerDb().medicos.toArray(), [], [] as LocalMedico[]);
export const useTareas = () => useLive(() => obtenerDb().tareas.toArray(), [], [] as LocalTarea[]);
export const useVisitas = () => useLive(() => obtenerDb().visitas.toArray(), [], [] as LocalVisita[]);

export const RESULTADOS_FARMACIA: { id: ResultadoVisita; texto: string }[] = [
  { id: 'pedido_tomado', texto: 'Tomé pedido' },
  { id: 'sin_pedido', texto: 'Sin pedido' },
  { id: 'cliente_cerrado', texto: 'Estaba cerrada' },
  { id: 'reprogramada', texto: 'Reprogramada' },
];
export const RESULTADOS_MEDICO: { id: ResultadoVisita; texto: string }[] = [
  { id: 'realizada', texto: 'Visita realizada' },
  { id: 'no_atendio', texto: 'No me atendió' },
  { id: 'reprogramada', texto: 'Reprogramada' },
];
export const textoResultado = (r?: ResultadoVisita | null) => [...RESULTADOS_FARMACIA, ...RESULTADOS_MEDICO].find((x) => x.id === r)?.texto ?? 'Visita';

/** "Dra. Ana Pérez · Cardiología" */
export const nombreMedico = (m?: Pick<LocalMedico, 'nombre' | 'especialidad'> | null) => (m ? `${m.nombre}${m.especialidad ? ` · ${m.especialidad}` : ''}` : 'Médico');

/** Ubicación actual (una sola lectura, alta precisión). null si no hay GPS o no se permitió. */
export function leerUbicacion(): Promise<GeolocationPosition | null> {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(res, () => res(null), { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  });
}

/** Fecha corta: "1 oct", "hoy", "ayer". */
export function fechaCorta(iso: string, hoy = new Date()): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  const dia = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (dia(d) === dia(hoy)) return 'hoy';
  const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
  if (dia(d) === dia(ayer)) return 'ayer';
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '');
}

/** Fecha de hoy + n días (YYYY-MM-DD, hora local). */
export function diaMas(n: number, hoy = new Date()): string {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
