import { useCallback } from 'react';
import { obtenerDb } from '../offline/db';
import { useLive } from '../offline/useLive';
import type { LocalActividad, LocalMotivo } from '../offline/types';
import { useFeriados } from '../ciclos/datos';
import { diasEfectivos } from './logica';

export const useMotivos = () => useLive(() => obtenerDb().motivos.orderBy('updated_at').toArray().then((l) => l.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))), [], [] as LocalMotivo[]);
export const useActividades = () => useLive(() => obtenerDb().actividades.toArray(), [], [] as LocalActividad[]);

/**
 * Cobertura ajustada: qué parte del período puede visitar cada representante (días efectivos ÷ días hábiles), según sus
 * días libres aprobados de motivos que descuentan. `estadoDe` da el estado de cada uno (feriados regionales).
 */
export function useAjusteCobertura(estadoDe: (vendedorId: string) => string | null | undefined) {
  const actividades = useActividades();
  const motivos = useMotivos();
  const feriados = useFeriados();
  return useCallback(
    (vendedorId: string | null | undefined, rango: { desde: string; hasta: string }) => {
      if (!vendedorId) return { habiles: 0, libres: 0, efectivos: 0, factor: 1 };
      const e = diasEfectivos(actividades, motivos, vendedorId, rango, feriados, estadoDe(vendedorId));
      return { ...e, factor: e.habiles > 0 ? e.efectivos / e.habiles : 1 };
    },
    [actividades, motivos, feriados, estadoDe]
  );
}
