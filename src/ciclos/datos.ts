import { useEffect, useMemo, useState } from 'react';
import { obtenerDb } from '../offline/db';
import { useLive } from '../offline/useLive';
import type { LocalCiclo, LocalFeriado } from '../offline/types';
import { getSupabaseClient } from '../services/supabaseClient';
import type { Usuario } from '../types/pharmacy';
import { fechaTexto, periodoActual } from './logica';
import type { Periodo } from './logica';

export const useCiclos = () => useLive(() => obtenerDb().ciclos.toArray(), [], [] as LocalCiclo[]);
export const useFeriados = () => useLive(() => obtenerDb().feriados.toArray(), [], [] as LocalFeriado[]);

export interface Equipo { id: string; codigo: string; nombre: string }

/** Equipos de ventas (de la nube; sin conexión, los que aparecen en los ciclos guardados). */
export function useEquipos(ciclos: LocalCiclo[] = []): Equipo[] {
  const [equipos, setEquipos] = useState<Equipo[] | null>(null);
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;
    let vivo = true;
    void Promise.resolve(sb.from('dim_equipos').select('id,codigo,nombre').eq('activo', true).is('deleted_at', null).order('nombre')).then(({ data }) => {
      if (vivo && Array.isArray(data)) setEquipos(data as Equipo[]);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return useMemo(() => {
    if (equipos) return equipos;
    const vistos = new Map<string, Equipo>();
    for (const c of ciclos) if (c.equipo_id) vistos.set(c.equipo_id, { id: c.equipo_id, codigo: '', nombre: c.equipo_nombre ?? 'Equipo' });
    return [...vistos.values()];
  }, [equipos, ciclos]);
}

/** Período con el que mide esta persona: el ciclo vigente de su equipo (o el general) o el mes calendario. */
export function usePeriodo(usuario: Pick<Usuario, 'equipo_id' | 'estado_geografico'>, equipoId?: string | null): Periodo {
  const ciclos = useCiclos();
  const feriados = useFeriados();
  const hoy = fechaTexto(new Date());
  return useMemo(
    () => periodoActual(ciclos, feriados, equipoId === undefined ? usuario.equipo_id : equipoId, hoy, usuario.estado_geografico),
    [ciclos, feriados, usuario.equipo_id, usuario.estado_geografico, equipoId, hoy]
  );
}

/** Período vigente de cada equipo (ciclo del equipo, el general o el mes): mide a cada representante con el de su equipo. */
export function usePeriodoDeEquipo(): (equipoId: string | null | undefined) => Periodo {
  const ciclos = useCiclos();
  const feriados = useFeriados();
  const hoy = fechaTexto(new Date());
  return useMemo(() => {
    const cache = new Map<string, Periodo>();
    return (equipoId) => {
      const k = equipoId ?? '';
      if (!cache.has(k)) cache.set(k, periodoActual(ciclos, feriados, equipoId ?? null, hoy));
      return cache.get(k) as Periodo;
    };
  }, [ciclos, feriados, hoy]);
}
