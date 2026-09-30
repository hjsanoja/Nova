import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../services/supabaseClient';

// Última lista cargada de cada consulta: al volver a una pestaña se muestra al instante y se actualiza por detrás.
const cache = new WeakMap<object, unknown[]>();

/** Lista de la nube con recarga. `error` trae el mensaje si falló. */
export function useListaNube<T>(cargar: (sb: SupabaseClient) => Promise<T[]>) {
  const [filas, setFilas] = useState<T[]>(() => (cache.get(cargar) as T[] | undefined) ?? []);
  const [cargando, setCargando] = useState(() => !cache.has(cargar));
  const [error, setError] = useState('');
  const recargar = useCallback(async () => {
    const sb = getSupabaseClient();
    if (!sb) { setCargando(false); return setError('Conecta Supabase para administrar los datos.'); }
    if (!cache.has(cargar)) setCargando(true);
    try {
      const nuevas = await cargar(sb);
      cache.set(cargar, nuevas);
      setFilas(nuevas);
      setError('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [cargar]);
  useEffect(() => { void recargar(); }, [recargar]);
  return { filas, cargando, error, recargar };
}

/** Texto vacío -> null (para columnas opcionales). */
export const nulo = (v: string | null | undefined) => (v == null || v.trim() === '' ? null : v.trim());

/** Número opcional desde un campo de texto. */
export const numeroONulo = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return v.trim() === '' || !Number.isFinite(n) ? null : n;
};
