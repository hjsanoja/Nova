// El vendedor arma su propio fichero: busca farmacias que aún no tiene y las agrega (o quita las suyas).
// La base de datos decide qué puede hacer (solo su fichero, solo agregar/quitar); aquí solo se llama y se refresca.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface FarmaciaDisponible {
  codigo_interno: string;
  nombre_comercial: string;
  razon_social: string;
  rif: string | null;
  municipio: string | null;
  estado_geografico: string | null;
  bandera: string | null;
  /** Cuántos vendedores la atienden ya (de cualquier equipo). */
  vendedores: number;
}

/** Farmacias activas que el vendedor todavía no tiene (las suyas no aparecen: así no se duplican). */
export async function farmaciasDisponibles(sb: SupabaseClient, busqueda: string, limite = 50): Promise<FarmaciaDisponible[]> {
  const { data, error } = await sb.rpc('farmacias_disponibles', { p_busqueda: busqueda.trim() || null, p_limite: limite });
  if (error) throw new Error(error.message || 'No se pudo consultar las farmacias');
  return (data ?? []) as FarmaciaDisponible[];
}

/** Agrega o quita farmacias (por código interno) del fichero del propio vendedor. Devuelve cuántas cambiaron. */
export async function cambiarMiFichero(sb: SupabaseClient, vendedorId: string, codigos: string[], modo: 'agregar' | 'quitar'): Promise<number> {
  const { data, error } = await sb.rpc('asignar_clientes_vendedor', { p_vendedor: vendedorId, p_codigos: codigos, p_modo: modo });
  if (error) throw new Error(error.message || 'No se pudo actualizar el fichero');
  const r = data as { asignados: number; retirados: number };
  return modo === 'agregar' ? r.asignados : r.retirados;
}

/** Descarga de nuevo la lista completa de farmacias del dispositivo (entran las nuevas y salen las retiradas). */
export async function refrescarFarmaciasDelDispositivo(): Promise<void> {
  const [{ obtenerDb }, { sincronizarYa }] = await Promise.all([import('../offline/db'), import('../offline/motor')]);
  await obtenerDb().meta.delete('cursor:dim_clientes');
  await sincronizarYa();
}
